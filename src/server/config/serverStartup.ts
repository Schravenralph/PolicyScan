/**
 * Server Startup Configuration
 * 
 * Handles HTTP server creation, WebSocket initialization, shutdown registration,
 * and server listening. Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import type { Server } from 'http';
import { createServer as createHttpServer } from 'http';
import { join } from 'path';
import type { Driver } from 'neo4j-driver';
import { logger } from '../utils/logger.js';
import { getShutdownCoordinator } from '../utils/shutdownCoordinator.js';
import { getConnectionManager } from './connectionManager.js';

interface ServerStartupDependencies {
  app: Express;
  neo4jDriver: Driver;
  webSocketService: any;
  PORT: number;
}

/**
 * Create and configure HTTP server
 */
export function createHttpServerInstance(app: Express): Server {
  const httpServer = createHttpServer(app);

  // Configure server timeouts to prevent socket hang up errors
  // Set headers timeout (time to wait for HTTP headers to be sent)
  httpServer.headersTimeout = 60000; // 60 seconds
  // Set request timeout (time to wait for entire request to be received)
  // Must be longer than client timeout (180s) to prevent server closing connection before client
  httpServer.requestTimeout = 200000; // 200 seconds (3.3 minutes) - longer than client's 180s timeout
  // Set keep-alive timeout (time to wait for next request on same connection)
  // CRITICAL: Must be longer than requestTimeout to prevent connections closing during active requests
  // Set to 210 seconds (3.5 minutes) to ensure connections stay alive for the full request duration
  httpServer.keepAliveTimeout = 210000; // 210 seconds - longer than requestTimeout to prevent premature closure
  // Set maximum number of requests per connection before closing
  httpServer.maxRequestsPerSocket = 100;

  logger.info({
    headersTimeout: httpServer.headersTimeout,
    requestTimeout: httpServer.requestTimeout,
    keepAliveTimeout: httpServer.keepAliveTimeout,
    maxRequestsPerSocket: httpServer.maxRequestsPerSocket
  }, 'HTTP server timeout settings configured');

  return httpServer;
}

/**
 * Initialize WebSocket and progress streaming services
 */
export async function initializeWebSocketAndProgress(httpServer: Server): Promise<{ webSocketService: any }> {
  // Initialize WebSocket service for real-time updates
  logger.info('Initializing WebSocket server');
  const { getWebSocketService } = await import('../services/infrastructure/WebSocketService.js');
  const webSocketService = getWebSocketService();
  webSocketService.initialize(httpServer);
  logger.info('WebSocket server initialized');

  // Initialize Progress Streaming Service
  const { getProgressStreamingService } = await import('../services/progress/ProgressStreamingService.js');
  const progressStreamingService = getProgressStreamingService();
  await progressStreamingService.initialize();
  logger.info('Progress streaming service initialized');

  return { webSocketService };
}

/**
 * Setup database cleanup scheduler (weekly cleanup of transient data)
 */
export async function setupDatabaseCleanupScheduler(app: Express): Promise<void> {
  // Database cleanup is enabled by default - runs weekly on Sunday at 2 AM
  const CLEANUP_ENABLED = process.env.DATABASE_CLEANUP_ENABLED !== 'false';
  
  if (!CLEANUP_ENABLED) {
    logger.info('Database cleanup scheduler disabled (set DATABASE_CLEANUP_ENABLED=true to enable)');
    return;
  }

  try {
    // Import node-cron dynamically (it's an optional dependency)
    let cron: any;
    try {
      cron = await import('node-cron');
    } catch (error) {
      logger.warn(
        { error },
        'node-cron is not installed. Database cleanup will not run automatically. Install with: pnpm install node-cron'
      );
      return;
    }

    const { getDatabaseCleanupOrchestrator } = await import('../services/monitoring/DatabaseCleanupOrchestrator.js');
    const cleanupOrchestrator = getDatabaseCleanupOrchestrator();

    // Default: Weekly on Sunday at 2 AM (0 2 * * 0)
    const cronExpression = process.env.DATABASE_CLEANUP_CRON || '0 2 * * 0';
    const timezone = process.env.DATABASE_CLEANUP_TIMEZONE || 'Europe/Amsterdam';

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Ensure TTL indexes are in place on startup
    logger.info('Ensuring TTL indexes for automatic cleanup');
    await cleanupOrchestrator.ensureAllTTLIndexes().catch((error) => {
      logger.warn({ error }, 'Failed to ensure TTL indexes (will retry on next cleanup)');
    });

    // Run cleanup immediately on startup (optional, can be disabled)
    if (process.env.DATABASE_CLEANUP_ON_STARTUP === 'true') {
      logger.info('Running database cleanup on startup');
      cleanupOrchestrator
        .runCleanup()
        .then((summary) => {
          logger.info(
            {
              totalDeleted: summary.totalDeleted,
              totalTruncated: summary.totalTruncated,
              successfulCleanups: summary.successfulCleanups,
            },
            'Startup database cleanup completed'
          );
        })
        .catch((error) => {
          logger.error({ error }, 'Startup database cleanup failed');
        });
    }

    // Create and start cron job
    const cronJob = cron.schedule(
      cronExpression,
      async () => {
        logger.info('Running scheduled database cleanup');
        const cleanupStartTime = Date.now();
        
        // Check if cleanup is already running (e.g., from manual trigger or previous scheduled run)
        if (cleanupOrchestrator.isCleanupRunning()) {
          logger.warn(
            {
              elapsedMinutes: cleanupOrchestrator.isCleanupRunning() ? 'unknown' : null,
            },
            'Scheduled cleanup skipped - cleanup operation already in progress. Will retry on next schedule.'
          );
          return; // Skip this scheduled run
        }
        
        try {
          const summary = await cleanupOrchestrator.runCleanup();
          const durationMs = Date.now() - cleanupStartTime;
          
          logger.info(
            {
              totalDeleted: summary.totalDeleted,
              totalTruncated: summary.totalTruncated,
              successfulCleanups: summary.successfulCleanups,
              failedCleanups: summary.failedCleanups,
              durationMs,
              verificationPassed: summary.verification?.passed ?? false,
            },
            'Scheduled database cleanup completed'
          );

          // Alert if cleanup had failures or verification issues
          if (summary.failedCleanups > 0 || !summary.verification?.passed) {
            const { AlertingService } = await import('../services/monitoring/AlertingService.js');
            const alertingService = new AlertingService();
            
            const failedCollections = summary.results
              .filter((r) => !r.success)
              .map((r) => `${r.collection} (${r.error})`)
              .join(', ');

            const verificationIssues = summary.verification?.checks
              .filter((c) => !c.passed)
              .map((c) => `${c.collection}.${c.check}: ${c.message}`)
              .join('; ');

            const alertMessage = [
              `Database cleanup completed with issues:`,
              `- Failed cleanups: ${summary.failedCleanups}/${summary.totalCollections}`,
              failedCollections ? `- Failed collections: ${failedCollections}` : '',
              verificationIssues ? `- Verification failures: ${verificationIssues}` : '',
              `- Total deleted: ${summary.totalDeleted}`,
              `- Duration: ${Math.round(durationMs / 1000)}s`,
            ]
              .filter(Boolean)
              .join('\n');

            await alertingService.sendGenericAlert({
              title: 'Database Cleanup Warning',
              message: alertMessage,
              severity: 'warning',
              details: {
                totalCollections: summary.totalCollections,
                successfulCleanups: summary.successfulCleanups,
                failedCleanups: summary.failedCleanups,
                totalDeleted: summary.totalDeleted,
                durationSeconds: Math.round(durationMs / 1000),
                verificationPassed: summary.verification?.passed ?? false,
              },
            });
          }
        } catch (error) {
          const durationMs = Date.now() - cleanupStartTime;
          logger.error({ error, durationMs }, 'Scheduled database cleanup failed');

          // Send critical alert for complete failure
          try {
            const { AlertingService } = await import('../services/monitoring/AlertingService.js');
            const alertingService = new AlertingService();
            
            await alertingService.sendGenericAlert({
              title: 'Database Cleanup Critical Failure',
              message: `Scheduled database cleanup failed after ${Math.round(durationMs / 1000)}s: ${error instanceof Error ? error.message : String(error)}`,
              severity: 'critical',
              details: {
                error: error instanceof Error ? error.message : String(error),
                durationSeconds: Math.round(durationMs / 1000),
                stack: error instanceof Error ? error.stack : undefined,
              },
            });
          } catch (alertError) {
            logger.error({ error: alertError }, 'Failed to send cleanup failure alert');
          }
        }
      },
      {
        scheduled: true,
        timezone,
      }
    );

    // Store in app.locals for graceful shutdown
    app.locals.databaseCleanupCronJob = cronJob;

    logger.info(
      {
        cronExpression,
        timezone,
        runOnStartup: process.env.DATABASE_CLEANUP_ON_STARTUP === 'true',
      },
      'Database cleanup scheduler initialized'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to setup database cleanup scheduler');
    // Don't throw - allow server to start without cleanup scheduler
  }
}

/**
 * Setup video cleanup scheduler (if enabled)
 */
export async function setupVideoCleanupScheduler(app: Express): Promise<void> {
  // Video cleanup is disabled by default - use manual cleanup via API or script when needed
  // To enable automatic cleanup, set VIDEO_CLEANUP_ENABLED=true in environment
  if (process.env.VIDEO_CLEANUP_ENABLED === 'true') {
    const { cleanupOldVideos } = await import('../utils/videoCleanup.js');
    const VIDEO_CLEANUP_MAX_AGE_DAYS = parseInt(process.env.VIDEO_CLEANUP_MAX_AGE_DAYS || '60', 10);

    let videoCleanupInterval: NodeJS.Timeout | null = null;
    let videoCleanupTimeout: NodeJS.Timeout | null = null;

    // Run cleanup immediately on startup (optional, can be disabled)
    if (process.env.VIDEO_CLEANUP_ON_STARTUP === 'true') {
      logger.info('Running video cleanup on startup');
      cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
        .then((stats) => {
          logger.info({ stats }, 'Startup video cleanup completed');
        })
        .catch((error) => {
          logger.error({ error }, 'Startup video cleanup failed');
        });
    }

    // Schedule daily cleanup at 2 AM
    const scheduleDailyCleanup = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0); // 2 AM

      const msUntilCleanup = tomorrow.getTime() - now.getTime();

      logger.info({
        nextCleanup: tomorrow.toISOString(),
        maxAgeDays: VIDEO_CLEANUP_MAX_AGE_DAYS
      }, 'Scheduled daily video cleanup');

      videoCleanupTimeout = setTimeout(() => {
        // Run cleanup
        cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
          .then((stats) => {
            logger.info({ stats }, 'Daily video cleanup completed');
          })
          .catch((error) => {
            logger.error({ error }, 'Daily video cleanup failed');
          });

        // Schedule next cleanup (24 hours later)
        videoCleanupInterval = setInterval(() => {
          cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
            .then((stats) => {
              logger.info({ stats }, 'Daily video cleanup completed');
            })
            .catch((error) => {
              logger.error({ error }, 'Daily video cleanup failed');
            });
        }, 24 * 60 * 60 * 1000); // 24 hours
      }, msUntilCleanup);
    };

    scheduleDailyCleanup();
    logger.info('Video cleanup scheduler initialized');

    // Store cleanup timers for shutdown
    app.locals.videoCleanupInterval = videoCleanupInterval;
    app.locals.videoCleanupTimeout = videoCleanupTimeout;
  } else {
    logger.info('Video cleanup scheduler disabled (set VIDEO_CLEANUP_ENABLED=true to enable)');
  }
}

/**
 * Register all shutdown handlers with shutdown coordinator
 */
export async function registerShutdownHandlers(deps: ServerStartupDependencies & { httpServer: Server }): Promise<void> {
  const { app, httpServer, webSocketService, neo4jDriver } = deps;

  // Store HTTP server in app.locals for graceful shutdown
  app.locals.httpServer = httpServer;
  app.locals.webSocketService = webSocketService;
  app.locals.neo4jDriver = neo4jDriver;

  // Register cleanup operations with shutdown coordinator
  const shutdownCoordinator = getShutdownCoordinator();

  // Register HTTP server shutdown (must be first to stop accepting new requests)
  shutdownCoordinator.register('HTTP Server', async () => {
    return new Promise<void>((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });
  }, 5000); // 5 second timeout

  // Register WebSocket service shutdown
  shutdownCoordinator.register('WebSocket Service', async () => {
    if (webSocketService && typeof webSocketService.close === 'function') {
      await webSocketService.close();
      logger.info('WebSocket service closed');
    }
  }, 5000);

  // Register GeoOutboxWorker shutdown
  shutdownCoordinator.register('GeoOutboxWorker', async () => {
    const geoOutboxWorker = app.locals.geoOutboxWorker;
    if (geoOutboxWorker && typeof geoOutboxWorker.stop === 'function') {
      await geoOutboxWorker.stop();
      logger.info('GeoOutboxWorker stopped');
    }
  }, 5000);

  // Register background job shutdowns
  shutdownCoordinator.register('Threshold Schedule Job', async () => {
    const thresholdScheduleJob = app.locals.thresholdScheduleJob;
    if (thresholdScheduleJob && typeof thresholdScheduleJob.stop === 'function') {
      thresholdScheduleJob.stop();
      logger.info('Threshold schedule job stopped');
    }

    // Register audit log retention service shutdown
    const auditLogRetentionService = app.locals.auditLogRetentionService;
    if (auditLogRetentionService && typeof auditLogRetentionService.stop === 'function') {
      auditLogRetentionService.stop();
      logger.info('Audit log retention service stopped');
    }

    // Register token blacklist service shutdown
    const { getTokenBlacklistService } = await import('../services/security/TokenBlacklistService.js');
    const tokenBlacklistService = getTokenBlacklistService();
    if (tokenBlacklistService && typeof tokenBlacklistService.close === 'function') {
      await tokenBlacklistService.close();
      logger.info('Token blacklist service stopped');
    }

    const graphStructureJob = app.locals.graphStructureBuilderScheduleJob;
    if (graphStructureJob && typeof graphStructureJob.stop === 'function') {
      graphStructureJob.stop();
      logger.info('Graph structure builder schedule job stopped');
    }
  });

  shutdownCoordinator.register('Learning Scheduler', async () => {
    const learningScheduler = app.locals.learningScheduler;
    if (learningScheduler && typeof learningScheduler.stop === 'function') {
      learningScheduler.stop();
      logger.info('Learning scheduler stopped');
    }
  });

  shutdownCoordinator.register('Email Digest Service', async () => {
    const emailDigestService = app.locals.emailDigestService;
    if (emailDigestService && typeof emailDigestService.stop === 'function') {
      emailDigestService.stop();
      logger.info('Email digest service stopped');
    }
  });

  shutdownCoordinator.register('Workflow Timeout Rate Monitor', async () => {
    const timeoutRateMonitor = app.locals.workflowTimeoutRateMonitor;
    if (timeoutRateMonitor && typeof timeoutRateMonitor.stop === 'function') {
      timeoutRateMonitor.stop();
      logger.info('Workflow timeout rate monitor stopped');
    }
  });

  // Note: Queue Service (Redis) shutdown is handled by ConnectionManager
  // No need to register separately

  // Register PostgreSQL pool shutdown
  shutdownCoordinator.register('PostgreSQL Pool', async () => {
    const { closePostgresPool } = await import('./postgres.js');
    await closePostgresPool();
    logger.info('PostgreSQL connection pool closed');
  }, 5000);

  // Register all database connections shutdown via ConnectionManager
  // ConnectionManager will handle GraphDB shutdown if it was connected
  shutdownCoordinator.register('Database Connections', async () => {
    const connectionManager = getConnectionManager();
    await connectionManager.closeAll(30000); // 30 second timeout for all connections
    logger.info('All database connections closed via ConnectionManager');
  }, 30000); // 30 second timeout for all connections

  // Register database cleanup scheduler shutdown (only if enabled)
  if (process.env.DATABASE_CLEANUP_ENABLED !== 'false') {
    shutdownCoordinator.register('Database Cleanup Scheduler', async () => {
      const databaseCleanupCronJob = app.locals.databaseCleanupCronJob;
      
      if (databaseCleanupCronJob) {
        databaseCleanupCronJob.stop();
        logger.info('Database cleanup cron job stopped');
      }

      // Check if cleanup is currently running and log warning
      const { getDatabaseCleanupOrchestrator } = await import('../services/monitoring/DatabaseCleanupOrchestrator.js');
      const cleanupOrchestrator = getDatabaseCleanupOrchestrator();
      if (cleanupOrchestrator.isCleanupRunning()) {
        logger.warn(
          'Database cleanup operation is in progress during shutdown. Cleanup will be interrupted. Consider waiting for completion or increasing shutdown timeout.'
        );
      }
    }, 5000); // 5 second timeout
  }

  // Register video cleanup scheduler shutdown (only if enabled)
  if (process.env.VIDEO_CLEANUP_ENABLED === 'true') {
    shutdownCoordinator.register('Video Cleanup Scheduler', async () => {
      const videoCleanupInterval = app.locals.videoCleanupInterval;
      const videoCleanupTimeout = app.locals.videoCleanupTimeout;

      if (videoCleanupInterval) {
        clearInterval(videoCleanupInterval);
        logger.info('Video cleanup interval cleared');
      }
      if (videoCleanupTimeout) {
        clearTimeout(videoCleanupTimeout);
        logger.info('Video cleanup timeout cleared');
      }
    });
  }

  // Register metrics cleanup
  const { getObservabilityConfig } = await import('./observability.js');
  const observabilityConfig = getObservabilityConfig();
  if (observabilityConfig.metrics.enabled) {
    shutdownCoordinator.register('Metrics', async () => {
      const { cleanupMetrics } = await import('../utils/metrics.js');
      cleanupMetrics();
      logger.info('Metrics collection stopped');
    });
  }

  // Register HTTP agents cleanup (close connections before tracing)
  shutdownCoordinator.register('HTTP Agents', async () => {
    const { closeHttpAgents } = await import('./httpClient.js');
    closeHttpAgents();
    logger.info('HTTP agents closed');
  }, 5000);

  // Register tracing shutdown (should be last)
  shutdownCoordinator.register('Tracing', async () => {
    const { shutdownTracing } = await import('../utils/tracing.js');
    await shutdownTracing();
    logger.info('Tracing shut down');
  }, 5000);
}

/**
 * Setup HTTP server event handlers
 */
export function setupServerEventHandlers(
  httpServer: Server,
  PORT: number,
  startupStartTime: number,
  runManager: any
): void {
  // Add error handling for server BEFORE listening
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal({ port: PORT, error: error.message }, 'Port already in use');
      process.exit(1);
    } else {
      logger.error({ error }, 'HTTP server error');
    }
  });

  httpServer.on('close', () => {
    logger.warn('HTTP server closed');
  });

  // Add connection-level error handling to prevent unexpected disconnections
  httpServer.on('connection', (socket) => {
    // Track connection for debugging
    const socketId = `${socket.remoteAddress}:${socket.remotePort}`;

    // Handle socket errors gracefully
    socket.on('error', (error: NodeJS.ErrnoException) => {
      // Only log non-critical connection errors (client disconnections are normal)
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE' && error.code !== 'ETIMEDOUT') {
        logger.warn({
          error: error.message,
          code: error.code,
          socketId
        }, 'Socket error on connection');
      } else {
        logger.debug({
          error: error.message,
          code: error.code,
          socketId
        }, 'Client disconnected (normal)');
      }
    });

    // Handle socket close events
    socket.on('close', (hadError) => {
      if (hadError) {
        logger.debug({ socketId }, 'Socket closed with error');
      }
    });

    // Enable TCP keep-alive to detect dead connections
    socket.setKeepAlive(true, 60000); // Enable keep-alive, probe after 60 seconds of inactivity
  });

  httpServer.on('listening', () => {
    const startupDuration = Date.now() - startupStartTime;
    const address = httpServer.address();

    // Log startup duration with warning if too slow
    if (startupDuration > 60000) {
      logger.warn({
        startupDurationMs: startupDuration,
        startupDurationSec: Math.round(startupDuration / 1000),
      }, 'Server startup took longer than 60 seconds - consider investigating');
    } else {
      logger.info({
        startupDurationMs: startupDuration,
        startupDurationSec: Math.round(startupDuration / 1000),
      }, 'Server startup completed');
    }

    logger.info({
      port: PORT,
      address: typeof address === 'string' ? address : `${address?.address}:${address?.port}`,
      api: `http://localhost:${PORT}/api`,
      dashboard: `http://localhost:${PORT}/stats-dashboard`,
      testDashboard: `http://localhost:${PORT}/tests`,
      websocket: `ws://localhost:${PORT}`,
    }, 'Server started successfully and listening');

    // Run startup health check after server is ready
    setTimeout(async () => {
      try {
        const { checkDatabaseHealth, getConnectionPoolStatus, getHealthCheckCircuitBreakerStatus } = await import('./database.js');
        const health = await checkDatabaseHealth(5000);
        const poolStatus = getConnectionPoolStatus();
        const circuitBreakerStatus = getHealthCheckCircuitBreakerStatus();

        if (!health.healthy) {
          logger.error({
            health,
            poolStatus: {
              connected: poolStatus.connected,
              activeConnections: poolStatus.metrics?.activeConnections,
              maxPoolSize: poolStatus.maxPoolSize,
            },
            circuitBreakerStatus
          }, 'Startup health check failed - server may be degraded');
        } else {
          logger.info({
            health: 'OK',
            poolStatus: {
              connected: poolStatus.connected,
              activeConnections: poolStatus.metrics?.activeConnections,
              maxPoolSize: poolStatus.maxPoolSize,
            }
          }, 'Startup health check passed');
        }
      } catch (error) {
        logger.error({ error }, 'Startup health check error');
      }
    }, 5000); // Wait 5 seconds after server starts

    // Start connection pool monitoring (every 5 minutes)
    const POOL_MONITORING_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const POOL_WARNING_THRESHOLD = 0.8; // Warn at 80% usage

    setInterval(async () => {
      try {
        const { getConnectionPoolStatus, getHealthCheckCircuitBreakerStatus } = await import('./database.js');
        const poolStatus = getConnectionPoolStatus();
        const circuitBreakerStatus = getHealthCheckCircuitBreakerStatus();
        const activeConnections = poolStatus.metrics?.activeConnections || 0;
        const maxPoolSize = poolStatus.maxPoolSize || 1;
        const poolUsage = activeConnections / maxPoolSize;

        if (poolUsage > POOL_WARNING_THRESHOLD) {
          logger.warn({
            poolUsage: Math.round(poolUsage * 100),
            activeConnections,
            maxPoolSize,
            metrics: poolStatus.metrics,
            circuitBreakerOpen: circuitBreakerStatus.isOpen,
            circuitBreakerFailures: circuitBreakerStatus.consecutiveFailures,
          }, 'Connection pool usage high (>80%)');
        } else if (process.env.NODE_ENV === 'development' || process.env.VERBOSE_POOL_MONITORING === 'true') {
          logger.debug({
            poolUsage: Math.round(poolUsage * 100),
            activeConnections,
            maxPoolSize,
          }, 'Connection pool status');
        }
      } catch (error) {
        logger.error({ error }, 'Error during connection pool monitoring');
      }
    }, POOL_MONITORING_INTERVAL);

    // Start periodic cleanup of stale runs (every hour)
    // This ensures runs that exceed RUN_TIMEOUT_MS are marked as timed out
    const STALE_RUN_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    setInterval(async () => {
      try {
        await runManager.markStaleRunsAsFailed();
        logger.debug('Periodic stale run cleanup completed');
      } catch (error) {
        logger.error({ error }, 'Error during periodic stale run cleanup');
      }
    }, STALE_RUN_CLEANUP_INTERVAL);

    // Start periodic cost monitoring (daily)
    // Checks costs against budget and sends alerts if thresholds are exceeded
    // Note: Cost monitoring can also be triggered manually via API or via CI/CD pipeline
    const COST_MONITORING_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    setInterval(async () => {
      try {
        const { getCostMonitoringService } = await import('../services/monitoring/CostMonitoringService.js');
        const costService = getCostMonitoringService();
        await costService.runCostMonitoring();
        logger.info('Periodic cost monitoring completed');
      } catch (error) {
        logger.error({ error }, 'Error during periodic cost monitoring');
      }
    }, COST_MONITORING_INTERVAL);

    logger.info({ intervalHours: 24 }, 'Started periodic cost monitoring (daily)');
    logger.info({ intervalMinutes: 60 }, 'Started periodic stale run cleanup (every hour)');
  });
}

/**
 * Start HTTP server listening
 */
export function startServerListening(httpServer: Server, PORT: number): void {
  logger.info({ port: PORT }, 'Starting Express server');
  httpServer.listen(PORT, '0.0.0.0', () => {
    // This callback fires when bind is initiated, but 'listening' event confirms it's ready
    logger.debug({ port: PORT }, 'Server listen() called');
  });
}

