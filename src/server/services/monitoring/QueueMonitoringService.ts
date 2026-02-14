import { logger } from '../../utils/logger.js';
import { getQueueService } from '../infrastructure/QueueService.js';
import { AlertingService } from './AlertingService.js';
import { getErrorMonitoringService } from './ErrorMonitoringService.js';
import type { ErrorLogDocument } from '../../models/ErrorLog.js';
import type { Job } from 'bull';

/**
 * Queue monitoring thresholds (configurable via environment variables)
 */
interface QueueMonitoringConfig {
  enabled: boolean;
  checkIntervalMs: number;
  queueDepthThreshold: number;
  failureRateThreshold: number; // Percentage (0-100)
  avgProcessingTimeThresholdMs: number;
  stalledThresholdMs: number; // Time without any job completion
  recentJobsWindowMs: number; // Time window for considering "recent" jobs (default: 1 hour)
  minRecentJobsForAlert: number; // Minimum number of recent jobs required to alert on failure rate (default: 5)
  autoInvestigate: boolean; // Enable automatic investigation of threshold violations (default: true)
  stuckJobThresholdMs: number; // Threshold for detecting stuck jobs (default: 15 minutes)
  violationMinorThreshold: number; // Percentage over threshold for minor violation (default: 10%)
  violationModerateThreshold: number; // Percentage over threshold for moderate violation (default: 50%)
  violationSevereThreshold: number; // Percentage over threshold for severe violation (default: 100%)
}

/**
 * Threshold violation details
 */
interface ThresholdViolationDetails {
  type: 'queueDepth' | 'failureRate' | 'processingTime' | 'stall';
  currentValue: number;
  threshold: number;
  percentageOver: number; // Percentage over threshold
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
}

/**
 * Worker status information
 */
interface WorkerStatus {
  count: number;
  active: boolean;
  workerNames?: string[];
}

/**
 * Active job analysis
 */
interface ActiveJobAnalysis {
  count: number;
  oldestJobDurationMs: number;
  potentiallyStuckJobs: number; // Jobs running longer than threshold
  stuckJobThresholdMs: number;
  activeJobDetails?: Array<{
    jobId: string;
    durationMs: number;
    workflowId?: string;
  }>;
}

/**
 * Queue investigation result
 */
interface QueueInvestigationResult {
  timestamp: Date;
  violations: ThresholdViolationDetails[];
  workerStatus: WorkerStatus | null;
  activeJobAnalysis: ActiveJobAnalysis | null;
  waitingJobCount: number;
  recommendations: string[];
}

/**
 * Queue monitoring metrics
 */
interface QueueMetrics {
  queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping';
  depth: number; // waiting + active
  failureRate: number; // Percentage (based on all-time stats)
  recentFailureRate: number; // Percentage (based on recent jobs only)
  recentJobsCount: number; // Number of jobs in recent window
  avgProcessingTimeMs: number;
  throughput: number; // Jobs per minute
  lastJobCompletedAt: Date | null;
  isStalled: boolean;
}

/**
 * QueueMonitoringService monitors queue health and sends alerts
 * 
 * Monitors:
 * - Queue depth (backlog)
 * - Failure rates
 * - Processing times
 * - Queue stalls
 * 
 * Alerts via AlertingService when thresholds are exceeded.
 */
export class QueueMonitoringService {
  private alertingService: AlertingService;
  private config: QueueMonitoringConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCheckTime: Date | null = null;
  private lastJobCounts: Map<string, number> = new Map();

  constructor(alertingService: AlertingService) {
    this.alertingService = alertingService;
    this.config = {
      enabled: process.env.QUEUE_MONITORING_ENABLED !== 'false', // Default: enabled
      checkIntervalMs: parseInt(process.env.QUEUE_MONITORING_INTERVAL_MS || '60000', 10), // Default: 1 minute
      queueDepthThreshold: parseInt(process.env.QUEUE_DEPTH_THRESHOLD || '50', 10),
      failureRateThreshold: parseFloat(process.env.QUEUE_FAILURE_RATE_THRESHOLD || '10'), // 10%
      avgProcessingTimeThresholdMs: parseInt(process.env.QUEUE_AVG_PROCESSING_TIME_THRESHOLD_MS || '300000', 10), // 5 minutes
      stalledThresholdMs: parseInt(process.env.QUEUE_STALLED_THRESHOLD_MS || '600000', 10), // 10 minutes
      recentJobsWindowMs: parseInt(process.env.QUEUE_RECENT_JOBS_WINDOW_MS || '3600000', 10), // Default: 1 hour
      minRecentJobsForAlert: parseInt(process.env.QUEUE_MIN_RECENT_JOBS_FOR_ALERT || '5', 10), // Default: 5 jobs
      autoInvestigate: process.env.QUEUE_MONITORING_AUTO_INVESTIGATE !== 'false', // Default: enabled
      stuckJobThresholdMs: parseInt(process.env.QUEUE_STUCK_JOB_THRESHOLD_MS || '900000', 10), // Default: 15 minutes
      violationMinorThreshold: parseFloat(process.env.QUEUE_VIOLATION_MINOR_THRESHOLD || '10'), // 10%
      violationModerateThreshold: parseFloat(process.env.QUEUE_VIOLATION_MODERATE_THRESHOLD || '50'), // 50%
      violationSevereThreshold: parseFloat(process.env.QUEUE_VIOLATION_SEVERE_THRESHOLD || '100'), // 100%
    };
  }

  /**
   * Start periodic monitoring
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Queue monitoring is disabled');
      return;
    }

    if (this.monitoringInterval) {
      logger.warn('Queue monitoring is already running');
      return;
    }

    logger.info({ config: this.config }, 'Starting queue monitoring service');

    // Run initial check
    this.checkQueues().catch((error) => {
      logger.error({ error }, 'Error in initial queue check');
    });

    // Set up periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkQueues().catch((error) => {
        logger.error({ error }, 'Error in periodic queue check');
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Queue monitoring service stopped');
    }
  }

  /**
   * Check all queues and send alerts if needed
   */
  async checkQueues(): Promise<void> {
    try {
      const queueService = getQueueService();
      const stats = await queueService.getQueueStats();
      const performanceMetrics = queueService.getPerformanceMetrics();

      const queueTypes: Array<'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping'> = [
        'scan',
        'embedding',
        'processing',
        'export',
        'workflow',
        'scraping',
      ];

      for (const queueType of queueTypes) {
        // Safe access as queueType is strictly typed and from the array above
        const jobTypeKey = `${queueType}Jobs` as keyof typeof performanceMetrics;
        const metrics = await this.calculateMetrics(
          queueType,
          stats[queueType],
          performanceMetrics[jobTypeKey]
        );

        await this.checkAndAlert(queueType, metrics, stats[queueType].waiting);
      }

      this.lastCheckTime = new Date();
    } catch (error) {
      // Check if this is a Redis connection error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRedisConnectionError =
        errorMessage.includes('EAI_AGAIN') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('getaddrinfo') ||
        errorMessage.includes('Redis') ||
        errorMessage.includes('redis') ||
        errorMessage.includes('MaxRetriesPerRequestError');

      if (isRedisConnectionError) {
        // Redis is unavailable - skip monitoring but don't throw
        // This prevents false alerts when Redis is simply not running
        logger.debug(
          { error: errorMessage },
          'Redis unavailable, skipping queue monitoring check (this is expected if Redis is not running)'
        );
        return;
      }

      // For other errors, log and continue (don't throw to prevent monitoring from stopping)
      logger.error({ error }, 'Failed to check queues (non-Redis error)');
    }
  }

  /**
   * Get recent job statistics for a queue (jobs within the time window)
   */
  private async getRecentJobStats(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping'
  ): Promise<{ completed: number; failed: number; total: number }> {
    try {
      const queueService = getQueueService();
      return await queueService.getRecentJobStats(queueType, this.config.recentJobsWindowMs);
    } catch (error) {
      logger.warn({ error, queueType }, 'Failed to get recent job stats, using all-time stats');
      // Fallback to all-time stats if we can't get recent stats
      return { completed: 0, failed: 0, total: 0 };
    }
  }

  /**
   * Calculate metrics for a queue type
   */
  private async calculateMetrics(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
    stats: { waiting: number; active: number; completed: number; failed: number; delayed: number },
    performanceData: { count: number; totalTime: number; avgTime: number } | undefined
  ): Promise<QueueMetrics> {
    const depth = stats.waiting + stats.active;
    const totalJobs = stats.completed + stats.failed;
    const failureRate = totalJobs > 0 ? (stats.failed / totalJobs) * 100 : 0;
    const avgProcessingTimeMs = performanceData?.avgTime || 0;

    // Get recent job statistics (within time window)
    const recentStats = await this.getRecentJobStats(queueType);
    const recentFailureRate =
      recentStats.total > 0 ? (recentStats.failed / recentStats.total) * 100 : 0;

    // Calculate throughput (jobs per minute)
    const queueKey = `${queueType}_completed`;
    const lastCount = this.lastJobCounts.get(queueKey) || 0;
    const currentCount = stats.completed;
    const jobsCompleted = currentCount - lastCount;
    this.lastJobCounts.set(queueKey, currentCount);

    // Estimate throughput based on check interval
    const intervalMinutes = this.config.checkIntervalMs / 60000;
    const throughput = intervalMinutes > 0 ? jobsCompleted / intervalMinutes : 0;

    // Check if stalled (no jobs completed recently)
    const isStalled = throughput === 0 && depth > 0 && this.lastCheckTime !== null;

    return {
      queueType,
      depth,
      failureRate,
      recentFailureRate,
      recentJobsCount: recentStats.total,
      avgProcessingTimeMs,
      throughput,
      lastJobCompletedAt: stats.completed > 0 ? new Date() : null, // Simplified - would need actual timestamp
      isStalled,
    };
  }

  /**
   * Analyze failed jobs to find common failure patterns
   */
  public analyzeFailurePatterns(jobs: Job[]): string[] {
    if (!jobs || jobs.length === 0) return [];

    const reasonCounts = new Map<string, number>();
    const totalJobs = jobs.length;

    for (const job of jobs) {
      let reason = 'Unknown error';
      if (job.failedReason) {
        // Clean up stack traces or long messages, take first line
        reason = job.failedReason.split('\n')[0];
        // Remove memory addresses or random IDs to group better (simple heuristic)
        reason = reason.replace(/0x[0-9a-fA-F]+/g, '0x...');
      }

      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }

    // Sort by count desc
    const sorted = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3); // Top 3

    return sorted.map(([reason, count]) => {
      const percentage = Math.round((count / totalJobs) * 100);
      const suffix = count === 1 ? 'occurrence' : 'occurrences';
      return `- ${percentage}% ${reason} (${count} ${suffix})`;
    });
  }

  /**
   * Check metrics against thresholds and send alerts if needed
   */
  private async checkAndAlert(
    queueType: string,
    metrics: QueueMetrics,
    waitingJobCount: number
  ): Promise<void> {
    const alerts: string[] = [];

    // Suppress alerts if queue is empty and inactive (no recent activity)
    const isInactive = metrics.depth === 0 && metrics.throughput === 0 && metrics.recentJobsCount === 0;
    if (isInactive) {
      // Queue is empty and has no recent activity - don't alert on historical failures
      logger.debug(
        { queueType, metrics },
        'Queue is inactive (empty and no recent jobs), suppressing alerts'
      );
      return;
    }

    // Check queue depth
    if (metrics.depth > this.config.queueDepthThreshold) {
      alerts.push(
        `Queue depth (${metrics.depth}) exceeds threshold (${this.config.queueDepthThreshold})`
      );
    }

    // Check failure rate - use recent failure rate if we have enough recent jobs, otherwise use all-time
    // Only alert if we have enough recent jobs to make the metric meaningful
    const shouldUseRecentRate =
      metrics.recentJobsCount >= this.config.minRecentJobsForAlert;
    const effectiveFailureRate = shouldUseRecentRate
      ? metrics.recentFailureRate
      : metrics.failureRate;

    if (effectiveFailureRate > this.config.failureRateThreshold) {
      const rateType = shouldUseRecentRate ? 'recent' : 'all-time';
      const rateValue = shouldUseRecentRate
        ? metrics.recentFailureRate
        : metrics.failureRate;
      
      // Only alert if we have enough recent jobs to make the metric meaningful
      // This prevents alerting on historical failures when the queue is inactive
      if (shouldUseRecentRate) {
        alerts.push(
          `Failure rate (${rateValue.toFixed(2)}% ${rateType}, based on ${metrics.recentJobsCount} recent jobs) exceeds threshold (${this.config.failureRateThreshold}%)`
        );

        // Fetch recent failed jobs and analyze failure patterns
        try {
          const queueService = getQueueService();
          const failedJobs = await queueService.getRecentFailedJobs(
            queueType as 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
            20 // Analyze last 20 failed jobs
          );

          const failureAnalysis = this.analyzeFailurePatterns(failedJobs);

          if (failureAnalysis.length > 0) {
            alerts.push(`Top failure reasons:\n${failureAnalysis.join('\n')}`);
          }
        } catch (error) {
          logger.warn({ error, queueType }, 'Failed to analyze failure patterns');
        }
      }
    }

    // Check average processing time
    if (metrics.avgProcessingTimeMs > this.config.avgProcessingTimeThresholdMs) {
      alerts.push(
        `Average processing time (${Math.round(metrics.avgProcessingTimeMs / 1000)}s) exceeds threshold (${Math.round(this.config.avgProcessingTimeThresholdMs / 1000)}s)`
      );
    }

    // Check if stalled
    if (metrics.isStalled) {
      alerts.push(`Queue appears to be stalled (no jobs completed recently)`);
    }

    // Send alerts if any thresholds exceeded
    if (alerts.length > 0) {
      await this.sendQueueAlert(queueType, metrics, alerts, waitingJobCount);
    }
  }

  /**
   * Get worker status for a queue
   */
  private async getWorkerStatus(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping'
  ): Promise<WorkerStatus | null> {
    try {
      const queueService = getQueueService();
      const queue = queueService.getQueueByType(queueType);
      
      if (!queue) {
        return null;
      }

      const workers = await queue.getWorkers();
      const workerNames = workers.map((worker) => worker.name || 'unnamed');

      return {
        count: workers.length,
        active: workers.length > 0,
        workerNames: workerNames.length > 0 ? workerNames : undefined,
      };
    } catch (error) {
      logger.warn({ error, queueType }, 'Failed to get worker status');
      return null;
    }
  }

  /**
   * Analyze active jobs for a queue
   */
  private async analyzeActiveJobs(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping'
  ): Promise<ActiveJobAnalysis | null> {
    try {
      const queueService = getQueueService();
      const queue = queueService.getQueueByType(queueType);
      
      if (!queue) {
        return null;
      }

      const activeJobs = await queue.getActive();
      const now = Date.now();
      let oldestJobDurationMs = 0;
      let potentiallyStuckJobs = 0;
      const activeJobDetails: Array<{
        jobId: string;
        durationMs: number;
        workflowId?: string;
      }> = [];

      for (const job of activeJobs) {
        const startedAt = job.processedOn || job.timestamp;
        const durationMs = now - startedAt;
        
        if (durationMs > oldestJobDurationMs) {
          oldestJobDurationMs = durationMs;
        }

        if (durationMs > this.config.stuckJobThresholdMs) {
          potentiallyStuckJobs++;
        }

        // Store details for top jobs (limit to 10 to avoid too much data)
        if (activeJobDetails.length < 10) {
          activeJobDetails.push({
            jobId: String(job.id),
            durationMs,
            workflowId: (job.data as any)?.workflowId,
          });
        }
      }

      return {
        count: activeJobs.length,
        oldestJobDurationMs,
        potentiallyStuckJobs,
        stuckJobThresholdMs: this.config.stuckJobThresholdMs,
        activeJobDetails: activeJobDetails.length > 0 ? activeJobDetails : undefined,
      };
    } catch (error) {
      logger.warn({ error, queueType }, 'Failed to analyze active jobs');
      return null;
    }
  }

  /**
   * Calculate threshold violation severity
   */
  private calculateViolationSeverity(percentageOver: number): 'minor' | 'moderate' | 'severe' {
    if (percentageOver >= this.config.violationSevereThreshold) {
      return 'severe';
    } else if (percentageOver >= this.config.violationModerateThreshold) {
      return 'moderate';
    } else {
      return 'minor';
    }
  }

  /**
   * Analyze threshold violations
   */
  private analyzeThresholdViolations(metrics: QueueMetrics): ThresholdViolationDetails[] {
    const violations: ThresholdViolationDetails[] = [];

    // Check queue depth
    if (metrics.depth > this.config.queueDepthThreshold) {
      const percentageOver = ((metrics.depth - this.config.queueDepthThreshold) / this.config.queueDepthThreshold) * 100;
      violations.push({
        type: 'queueDepth',
        currentValue: metrics.depth,
        threshold: this.config.queueDepthThreshold,
        percentageOver,
        severity: this.calculateViolationSeverity(percentageOver),
        description: `Queue depth (${metrics.depth}) exceeds threshold (${this.config.queueDepthThreshold}) by ${percentageOver.toFixed(1)}%`,
      });
    }

    // Check failure rate
    const shouldUseRecentRate = metrics.recentJobsCount >= this.config.minRecentJobsForAlert;
    const effectiveFailureRate = shouldUseRecentRate ? metrics.recentFailureRate : metrics.failureRate;
    
    if (effectiveFailureRate > this.config.failureRateThreshold && shouldUseRecentRate) {
      const percentageOver = ((effectiveFailureRate - this.config.failureRateThreshold) / this.config.failureRateThreshold) * 100;
      violations.push({
        type: 'failureRate',
        currentValue: effectiveFailureRate,
        threshold: this.config.failureRateThreshold,
        percentageOver,
        severity: this.calculateViolationSeverity(percentageOver),
        description: `Failure rate (${effectiveFailureRate.toFixed(2)}%) exceeds threshold (${this.config.failureRateThreshold}%) by ${percentageOver.toFixed(1)}%`,
      });
    }

    // Check average processing time
    if (metrics.avgProcessingTimeMs > this.config.avgProcessingTimeThresholdMs) {
      const percentageOver = ((metrics.avgProcessingTimeMs - this.config.avgProcessingTimeThresholdMs) / this.config.avgProcessingTimeThresholdMs) * 100;
      violations.push({
        type: 'processingTime',
        currentValue: metrics.avgProcessingTimeMs,
        threshold: this.config.avgProcessingTimeThresholdMs,
        percentageOver,
        severity: this.calculateViolationSeverity(percentageOver),
        description: `Average processing time (${Math.round(metrics.avgProcessingTimeMs / 1000)}s) exceeds threshold (${Math.round(this.config.avgProcessingTimeThresholdMs / 1000)}s) by ${percentageOver.toFixed(1)}%`,
      });
    }

    // Check if stalled
    if (metrics.isStalled) {
      violations.push({
        type: 'stall',
        currentValue: 1, // Boolean represented as 1
        threshold: 0,
        percentageOver: 100, // Stalled is always severe
        severity: 'severe',
        description: 'Queue appears to be stalled (no jobs completed recently)',
      });
    }

    return violations;
  }

  /**
   * Generate recommendations based on violations
   */
  private generateRecommendations(
    violations: ThresholdViolationDetails[],
    workerStatus: WorkerStatus | null,
    activeJobAnalysis: ActiveJobAnalysis | null,
    waitingJobCount: number
  ): string[] {
    const recommendations: string[] = [];

    for (const violation of violations) {
      switch (violation.type) {
        case 'queueDepth':
          if (workerStatus && workerStatus.count === 0) {
            recommendations.push('CRITICAL: No workers registered! Restart server to initialize queue workers.');
          } else if (workerStatus && workerStatus.count > 0) {
            recommendations.push('Check if workers are processing jobs. Review active jobs for stuck/long-running workflows.');
          }
          if (waitingJobCount > 0) {
            recommendations.push(`Consider increasing worker concurrency if ${waitingJobCount} waiting jobs are backing up.`);
          }
          recommendations.push('Review workflow execution times - may need optimization.');
          break;

        case 'failureRate':
          recommendations.push('Review failed jobs to identify common failure patterns.');
          recommendations.push('Check error logs for workflow execution errors.');
          recommendations.push('Verify all required services are available (GraphDB, IMBOR, etc.).');
          break;

        case 'processingTime':
          recommendations.push('Profile slow workflows to identify bottlenecks.');
          recommendations.push('Consider breaking down large workflows into smaller steps.');
          recommendations.push('Check for resource constraints (CPU, memory, network).');
          break;

        case 'stall':
          if (workerStatus && workerStatus.count === 0) {
            recommendations.push('CRITICAL: No workers registered! Restart server to initialize queue workers.');
          } else {
            recommendations.push('Verify workers are registered and active.');
          }
          if (activeJobAnalysis && activeJobAnalysis.potentiallyStuckJobs > 0) {
            recommendations.push(`Check for ${activeJobAnalysis.potentiallyStuckJobs} stuck job(s) that may need manual intervention.`);
          }
          recommendations.push('Review Redis connection and health.');
          recommendations.push('Check server logs for worker initialization errors.');
          break;
      }
    }

    // Remove duplicates
    return Array.from(new Set(recommendations));
  }

  /**
   * Investigate threshold violations and gather diagnostic information
   */
  private async investigateThresholdViolations(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
    metrics: QueueMetrics,
    waitingJobCount: number
  ): Promise<QueueInvestigationResult | null> {
    if (!this.config.autoInvestigate) {
      return null;
    }

    try {
      // Analyze threshold violations
      const violations = this.analyzeThresholdViolations(metrics);

      // Gather worker status and active job analysis in parallel
      const [workerStatus, activeJobAnalysis] = await Promise.all([
        this.getWorkerStatus(queueType),
        this.analyzeActiveJobs(queueType),
      ]);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        violations,
        workerStatus,
        activeJobAnalysis,
        waitingJobCount
      );

      return {
        timestamp: new Date(),
        violations,
        workerStatus,
        activeJobAnalysis,
        waitingJobCount,
        recommendations,
      };
    } catch (error) {
      // Don't fail alert if investigation fails
      logger.warn({ error, queueType }, 'Failed to investigate threshold violations');
      return null;
    }
  }

  /**
   * Send alert for queue issues
   */
  private async sendQueueAlert(
    queueType: string,
    metrics: QueueMetrics,
    issues: string[],
    waitingJobCount: number
  ): Promise<void> {
    try {
      // Investigate threshold violations (if enabled)
      const investigation = await this.investigateThresholdViolations(
        queueType as 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
        metrics,
        waitingJobCount
      );

      // Create error object for monitoring service (includes process/file context)
      const error = new Error(`Queue monitoring alert: ${queueType} queue issues detected`);
      error.name = 'QueueMonitoringAlert';
      // Add stack trace pointing to this monitoring service
      Error.captureStackTrace(error, this.sendQueueAlert);

      // Build metadata with investigation results
      const metadata: Record<string, unknown> = {
        queueType,
        metrics: {
          depth: metrics.depth,
          failureRate: metrics.failureRate,
          recentFailureRate: metrics.recentFailureRate,
          recentJobsCount: metrics.recentJobsCount,
          avgProcessingTimeMs: metrics.avgProcessingTimeMs,
          throughput: metrics.throughput,
          isStalled: metrics.isStalled,
        },
        issues,
      };

      // Add investigation results if available
      if (investigation) {
        metadata.investigation = {
          timestamp: investigation.timestamp,
          violations: investigation.violations,
          workerStatus: investigation.workerStatus,
          activeJobAnalysis: investigation.activeJobAnalysis,
          waitingJobCount: investigation.waitingJobCount,
          recommendations: investigation.recommendations,
        };
      }

      // Use ErrorMonitoringService to capture with full context
      const errorMonitoringService = getErrorMonitoringService();
      await errorMonitoringService.captureError(error, {
        component: 'other',
        metadata,
      });

      // Get the captured error log for alerting
      // Note: We need to fetch it or create a synthetic one for AlertingService
      // Since captureError doesn't return the log in all cases, we'll create a minimal one
      const errorLog: ErrorLogDocument = {
        error_id: `queue-alert-${queueType}-${Date.now()}`,
        timestamp: new Date(),
        severity: 'warning',
        component: 'other',
        message: error.message,
        status: 'open',
        occurrence_count: 1,
        first_seen: new Date(),
        last_seen: new Date(),
        error_signature: `queue-monitoring-${queueType}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Send alert via AlertingService
      await this.alertingService.sendCriticalErrorAlert(errorLog);

      logger.warn(
        { queueType, metrics, issues },
        `Queue monitoring alert sent for ${queueType} queue`
      );
    } catch (error) {
      logger.error({ error, queueType }, 'Failed to send queue monitoring alert');
    }
  }

  /**
   * Get current monitoring status
   */
  getStatus(): {
    enabled: boolean;
    lastCheckTime: Date | null;
    config: QueueMonitoringConfig;
  } {
    return {
      enabled: this.config.enabled,
      lastCheckTime: this.lastCheckTime,
      config: this.config,
    };
  }
}

// Singleton instance
let queueMonitoringServiceInstance: QueueMonitoringService | null = null;

/**
 * Get or create the QueueMonitoringService singleton
 */
export function getQueueMonitoringService(): QueueMonitoringService {
  if (!queueMonitoringServiceInstance) {
    const alertingService = new AlertingService();
    queueMonitoringServiceInstance = new QueueMonitoringService(alertingService);
  }
  return queueMonitoringServiceInstance;
}
