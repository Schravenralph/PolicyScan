/**
 * Health Check Monitoring Service
 * 
 * Monitors all health check endpoints and tracks:
 * - Service availability
 * - Health check response times
 * - Recovery times
 * - Alert thresholds
 * 
 * Integrates with:
 * - AlertingService for alerts
 * - HealthCheckLogger for logging
 * - PerformanceMonitoringService for metrics
 */

import { AlertingService } from './AlertingService.js';
import { HealthCheckLogger } from './HealthCheckLogger.js';
import { PerformanceMonitoringService } from './PerformanceMonitoringService.js';
import { getHealthCheckCache } from './HealthCheckCache.js';
import { logger } from '../../utils/logger.js';
import { DatabaseHealthService } from '../infrastructure/DatabaseHealthService.js';
import { QueueHealthService } from '../infrastructure/QueueHealthService.js';
import { DsoApiHealthService } from '../external/DsoApiHealthService.js';
import { GoogleApiHealthService } from '../external/GoogleApiHealthService.js';
import { OpenAIApiHealthService } from '../external/OpenAIApiHealthService.js';
import { getPipelineHealthService } from '../ingestion/PipelineHealthService.js';
import { IploScraperHealthService } from '../scraping/IploScraperHealthService.js';
import { RechtspraakApiHealthService } from '../external/RechtspraakApiHealthService.js';
import { GraphHealthService } from '../graphs/navigation/GraphHealthService.js';
import type { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';
import { ArchitectureComplianceHealthService } from '../infrastructure/ArchitectureComplianceHealthService.js';

export interface HealthCheckResult {
  service: string;
  healthy: boolean;
  responseTime: number;
  timestamp: Date;
  error?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckMetrics {
  service: string;
  availability: number; // 0-1, percentage of time healthy
  averageResponseTime: number;
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  lastHealthyTime?: Date;
  lastUnhealthyTime?: Date;
  recoveryTime?: number; // Time to recover from unhealthy to healthy (ms)
  consecutiveFailures: number;
}

export interface HealthCheckAlert {
  service: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  metrics: HealthCheckMetrics;
  error?: string;
}

export interface HealthCheckMonitoringConfig {
  enabled: boolean;
  checkIntervalMs: number;
  alertThresholds: {
    consecutiveFailures: number; // Alert after N consecutive failures
    responseTimeMs: number; // Alert if response time exceeds this
    availabilityThreshold: number; // Alert if availability drops below this (0-1)
  };
  services: string[]; // List of services to monitor
}

/**
 * Health Check Monitoring Service
 */
export class HealthCheckMonitoringService {
  private alertingService: AlertingService;
  private healthCheckLogger: HealthCheckLogger;
  private performanceMonitoring: PerformanceMonitoringService;
  private healthCheckCache: ReturnType<typeof getHealthCheckCache>;
  private config: HealthCheckMonitoringConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metrics: Map<string, HealthCheckMetrics> = new Map();
  private navigationGraph: NavigationGraph | null = null;

  constructor(navigationGraph?: NavigationGraph | null) {
    this.alertingService = new AlertingService();
    this.healthCheckLogger = HealthCheckLogger.getInstance();
    this.performanceMonitoring = new PerformanceMonitoringService();
    this.healthCheckCache = getHealthCheckCache();
    this.navigationGraph = navigationGraph || null;

    this.config = {
      enabled: process.env.HEALTH_CHECK_MONITORING_ENABLED !== 'false',
      // Increased interval to 2 minutes since we now cache results for 30 seconds
      // This reduces load while still providing frequent checks
      checkIntervalMs: parseInt(process.env.HEALTH_CHECK_MONITORING_INTERVAL_MS || '120000', 10), // Default: 2 minutes
      alertThresholds: {
        consecutiveFailures: parseInt(process.env.HEALTH_CHECK_ALERT_CONSECUTIVE_FAILURES || '3', 10),
        responseTimeMs: parseInt(process.env.HEALTH_CHECK_ALERT_RESPONSE_TIME_MS || '5000', 10),
        availabilityThreshold: parseFloat(process.env.HEALTH_CHECK_ALERT_AVAILABILITY_THRESHOLD || '0.95'), // 95%
      },
      services: [
        'database',
        'queue',
        'dso',
        'google',
        'openai',
        'pipeline',
        'iplo',
        'rechtspraak',
        'graph',
        'architecture-compliance',
      ],
    };
  }

  /**
   * Start periodic health check monitoring
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Health check monitoring is disabled');
      return;
    }

    if (this.monitoringInterval) {
      logger.warn('Health check monitoring is already running');
      return;
    }

    logger.info({
      interval: this.config.checkIntervalMs,
      services: this.config.services,
    }, 'Starting health check monitoring service');

    // Run initial check immediately
    this.checkAllServices().catch((error) => {
      logger.error({ error }, 'Failed to run initial health check');
    });

    // Set up periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkAllServices().catch((error) => {
        logger.error({ error }, 'Failed to run periodic health check');
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Health check monitoring service stopped');
    }
  }

  /**
   * Check all services
   */
  async checkAllServices(): Promise<void> {
    const results: HealthCheckResult[] = [];

    for (const service of this.config.services) {
      try {
        const result = await this.checkService(service);
        results.push(result);
        await this.updateMetrics(result);
        await this.checkAndAlert(result);
      } catch (error) {
        logger.error({ error, service }, 'Failed to check service health');
        const errorResult: HealthCheckResult = {
          service,
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        results.push(errorResult);
        await this.updateMetrics(errorResult);
      }
    }

    // Log summary (only log if there are unhealthy services to reduce log volume)
    const healthyCount = results.filter((r) => r.healthy).length;
    const totalCount = results.length;
    if (healthyCount < totalCount) {
      // Only log when there are issues (reduces log volume from every 60 seconds)
      logger.warn(
        { healthy: healthyCount, total: totalCount },
        `Health check summary: ${healthyCount}/${totalCount} services healthy`
      );
    } else {
      // Log successful checks at debug level only (won't appear in production with LOG_LEVEL=info)
      logger.debug(
        { healthy: healthyCount, total: totalCount },
        `Health check summary: ${healthyCount}/${totalCount} services healthy`
      );
    }
  }

  /**
   * Check a specific service
   * Uses cache to avoid excessive checks
   */
  private async checkService(service: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.healthCheckCache.get(service);
    if (cached) {
      // Return cached result (but still measure response time)
      const responseTime = Date.now() - startTime;
      return {
        service,
        healthy: cached.healthy === true,
        responseTime,
        timestamp: new Date(),
        details: cached,
      };
    }

    try {
      let health: { healthy: boolean; [key: string]: unknown };

      switch (service) {
        case 'database':
          health = await DatabaseHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'queue':
          health = await QueueHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'dso':
          health = await DsoApiHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'google':
          health = await GoogleApiHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'openai':
          health = await OpenAIApiHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'pipeline':
          health = await (await getPipelineHealthService()).checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'iplo': {
          const healthService = new IploScraperHealthService();
          health = await healthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        }
        case 'rechtspraak':
          health = await RechtspraakApiHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        case 'graph': {
          const graphHealthService = new GraphHealthService(this.navigationGraph);
          health = await graphHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        }
        case 'architecture-compliance':
          health = await ArchitectureComplianceHealthService.checkHealth() as unknown as { healthy: boolean; [key: string]: unknown };
          break;
        default:
          throw new Error(`Unknown service: ${service}`);
      }

      const responseTime = Date.now() - startTime;

      const result = {
        service,
        healthy: health.healthy === true,
        responseTime,
        timestamp: new Date(),
        details: health,
      };

      // Cache the result (only cache successful checks to avoid caching errors)
      this.healthCheckCache.set(service, health);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = {
        service,
        healthy: false,
        responseTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      // Don't cache errors - they should be checked again
      // But clear any stale cached healthy result
      this.healthCheckCache.clear(service);

      return result;
    }
  }

  /**
   * Update metrics for a service
   */
  private async updateMetrics(result: HealthCheckResult): Promise<void> {
    const existing = this.metrics.get(result.service) || {
      service: result.service,
      availability: 1,
      averageResponseTime: 0,
      totalChecks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      consecutiveFailures: 0,
    };

    existing.totalChecks++;
    existing.averageResponseTime =
      (existing.averageResponseTime * (existing.totalChecks - 1) + result.responseTime) /
      existing.totalChecks;

    if (result.healthy) {
      existing.healthyChecks++;
      if (existing.consecutiveFailures > 0) {
        // Service recovered
        if (existing.lastUnhealthyTime) {
          existing.recoveryTime = Date.now() - existing.lastUnhealthyTime.getTime();
        }
        existing.consecutiveFailures = 0;
      }
      existing.lastHealthyTime = result.timestamp;
    } else {
      existing.unhealthyChecks++;
      existing.consecutiveFailures++;
      existing.lastUnhealthyTime = result.timestamp;
    }

    // Calculate availability (percentage of healthy checks)
    existing.availability = existing.healthyChecks / existing.totalChecks;

    this.metrics.set(result.service, existing);

    // Log to health check logger (only log unhealthy services to reduce log volume)
    // Healthy services are logged less frequently to prevent log bloat
    if (!result.healthy) {
      await this.healthCheckLogger.logHealthCheck(
        result.service,
        'unhealthy',
        `Service is unhealthy: ${result.error || 'Unknown error'}`,
        result.error ? new Error(result.error) : undefined,
        result.details
      );
    } else {
      // Only log healthy services at debug level (reduces log volume significantly)
      // Health check logger will still track metrics but won't write to files for healthy checks
      logger.debug(
        { service: result.service, responseTime: result.responseTime },
        `Health check passed: ${result.service}`
      );
    }

    // Track performance metrics
    // Note: recordMetric is private, so we skip performance tracking here
    // Performance metrics are tracked elsewhere in the codebase
  }

  /**
   * Check if alert should be sent and send it
   */
  private async checkAndAlert(result: HealthCheckResult): Promise<void> {
    const metrics = this.metrics.get(result.service);
    if (!metrics) {
      return;
    }

    const alerts: HealthCheckAlert[] = [];

    // Check consecutive failures
    if (
      metrics.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures &&
      !result.healthy
    ) {
      alerts.push({
        service: result.service,
        severity: 'critical',
        message: `Service ${result.service} has failed ${metrics.consecutiveFailures} consecutive health checks`,
        timestamp: result.timestamp,
        metrics,
        error: result.error,
      });
    }

    // Check response time
    if (result.responseTime > this.config.alertThresholds.responseTimeMs) {
      alerts.push({
        service: result.service,
        severity: 'warning',
        message: `Service ${result.service} health check response time is high: ${result.responseTime}ms`,
        timestamp: result.timestamp,
        metrics,
      });
    }

    // Check availability
    if (metrics.availability < this.config.alertThresholds.availabilityThreshold) {
      alerts.push({
        service: result.service,
        severity: metrics.availability < 0.5 ? 'critical' : 'warning',
        message: `Service ${result.service} availability is low: ${(metrics.availability * 100).toFixed(1)}%`,
        timestamp: result.timestamp,
        metrics,
      });
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * Send alert via AlertingService
   */
  private async sendAlert(alert: HealthCheckAlert): Promise<void> {
    const message = `[${alert.severity.toUpperCase()}] Health Check Alert: ${alert.message}\n\n` +
      `Service: ${alert.service}\n` +
      `Availability: ${(alert.metrics.availability * 100).toFixed(1)}%\n` +
      `Average Response Time: ${alert.metrics.averageResponseTime.toFixed(0)}ms\n` +
      `Consecutive Failures: ${alert.metrics.consecutiveFailures}\n` +
      (alert.error ? `Error: ${alert.error}\n` : '') +
      `Timestamp: ${alert.timestamp.toISOString()}`;

    await this.alertingService.sendGenericAlert({
      title: `Health Check: ${alert.service}`,
      message,
      severity: alert.severity === 'critical' ? 'critical' : 'warning',
      details: {
        service: alert.service,
        severity: alert.severity,
        metrics: alert.metrics,
        error: alert.error,
      },
    });
  }

  /**
   * Get current metrics for all services
   */
  getMetrics(): Map<string, HealthCheckMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get metrics for a specific service
   */
  getServiceMetrics(service: string): HealthCheckMetrics | undefined {
    return this.metrics.get(service);
  }

  /**
   * Get summary of all services
   */
  getSummary(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    averageAvailability: number;
    services: Array<{ service: string; metrics: HealthCheckMetrics }>;
  } {
    const services = Array.from(this.metrics.entries()).map(([service, metrics]) => ({
      service,
      metrics,
    }));

    const healthyServices = services.filter((s) => s.metrics.consecutiveFailures === 0).length;
    const unhealthyServices = services.length - healthyServices;
    const averageAvailability =
      services.reduce((sum, s) => sum + s.metrics.availability, 0) / services.length || 0;

    return {
      totalServices: services.length,
      healthyServices,
      unhealthyServices,
      averageAvailability,
      services,
    };
  }
}

// Singleton instance
let healthCheckMonitoringInstance: HealthCheckMonitoringService | null = null;

/**
 * Get or create the health check monitoring service instance
 */
export function getHealthCheckMonitoringService(
  navigationGraph?: NavigationGraph | null
): HealthCheckMonitoringService {
  if (!healthCheckMonitoringInstance) {
    healthCheckMonitoringInstance = new HealthCheckMonitoringService(navigationGraph);
  }
  return healthCheckMonitoringInstance;
}


