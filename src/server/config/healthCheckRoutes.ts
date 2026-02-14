/**
 * Health Check Routes
 * 
 * Health check endpoints for monitoring and Docker health checks.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import { asyncHandler } from '../utils/errorHandling.js';
import { checkDatabaseHealth, getConnectionPoolStatus } from './database.js';
import { getMetrics } from '../utils/metrics.js';
import { checkNeo4jHealth } from './neo4j.js';
import { checkGraphDBHealth } from './graphdb.js';
import { getEnv, validateEnv } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Check Redis connection health with a simple ping
 * Uses ioredis directly for fast health checks without initializing queues
 */
async function checkRedisHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  let client: import('ioredis').Redis | null = null;
  try {
    const startTime = Date.now();
    const RedisModule = await import('ioredis');
    // ioredis exports Redis as default, but TypeScript may not recognize it
    const Redis = (RedisModule as any).default || (RedisModule as any).Redis || RedisModule;
    const env = validateEnv();

    const redisHost = env.REDIS_HOST;
    // Use env.REDIS_PORT which defaults to 6380 (host port)
    // Inside Docker containers, docker-compose.yml sets REDIS_PORT=6379 (container port)
    // On the host, env.REDIS_PORT should be 6380 (host-mapped port)
    const redisPort = env.REDIS_PORT;
    const redisPassword = process.env.REDIS_PASSWORD;

    // Create a temporary Redis client for health check
    client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 3000, // 3 second timeout
      retryStrategy: () => null, // Don't retry for health checks
      maxRetriesPerRequest: 1,
      lazyConnect: false, // Connect immediately
    });

    if (!client) {
      throw new Error('Failed to create Redis client');
    }

    // Wait for connection to be ready, then ping
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        if (client!.status === 'ready') {
          resolve();
        } else {
          client!.once('ready', () => resolve());
          client!.once('error', (err) => reject(err));
          // Timeout if connection doesn't become ready
          setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
        }
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
      ),
    ]);

    // Now ping the Redis server
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), 2000)
      ),
    ]);

    const latency = Date.now() - startTime;

    // Clean up connection
    const clientToClose = client;
    if (clientToClose) {
      try {
        await clientToClose.quit();
      } catch {
        // If quit fails, try disconnect
        try {
          clientToClose.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    if (pong === 'PONG') {
      return {
        healthy: true,
        latency,
      };
    } else {
      return {
        healthy: false,
        error: `Unexpected Redis response: ${pong}`,
      };
    }
  } catch (error) {
    // Clean up connection on error
    if (client) {
      try {
        await client.quit();
      } catch {
        try {
          client.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      error: errorMessage,
    };
  }
}

/**
 * Setup health check routes
 */
export function setupHealthCheckRoutes(app: Express): void {
  // Health check endpoint (no rate limiting) - must be before static middleware
  // Health endpoint - must respond quickly for Docker health checks
  const healthHandler = asyncHandler(async (_req, res) => {
    // Use a very short timeout (1 second) to ensure health endpoint always responds quickly
    // This prevents the endpoint from hanging if database connection is stuck
    const HEALTH_CHECK_TIMEOUT_MS = 1000; // 1 second max

    // Set a hard timeout on the response to ensure it never hangs
    const responseTimeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(200).json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: {
            healthy: false,
            error: 'Health check response timeout - endpoint forced to respond',
          },
        });
      }
    }, HEALTH_CHECK_TIMEOUT_MS + 500); // Slightly longer than health check timeout

    let dbHealth: { healthy: boolean; latency?: number; error?: string };
    let poolStatus: ReturnType<typeof getConnectionPoolStatus>;

    try {
      // Wrap checkDatabaseHealth in a hard timeout to ensure it can't hang
      // Use the same timeout value for both the internal check and the wrapper
      const healthCheckPromise = checkDatabaseHealth(HEALTH_CHECK_TIMEOUT_MS).catch((error) => {
        // Convert rejections to resolved error objects to prevent Promise.race from rejecting
        return {
          healthy: false,
          error: error instanceof Error ? error.message : 'Database health check failed',
        };
      });

      const timeoutPromise = new Promise<{ healthy: boolean; error?: string }>((resolve) => {
        setTimeout(() => {
          resolve({
            healthy: false,
            error: `Health check timeout after ${HEALTH_CHECK_TIMEOUT_MS}ms`,
          });
        }, HEALTH_CHECK_TIMEOUT_MS);
      });

      // Both promises now resolve (never reject), so Promise.race will always resolve
      dbHealth = await Promise.race([healthCheckPromise, timeoutPromise]);

      try {
        poolStatus = getConnectionPoolStatus();
      } catch {
        poolStatus = { connected: false, isReconnecting: false, reconnectAttemptCount: 0 };
      }
    } catch (error) {
      // Fallback error handling (should not be reached due to .catch above, but safety net)
      dbHealth = {
        healthy: false,
        error: error instanceof Error ? error.message : 'Database health check failed'
      };
      try {
        poolStatus = getConnectionPoolStatus();
      } catch {
        poolStatus = { connected: false, isReconnecting: false, reconnectAttemptCount: 0 };
      }
    } finally {
      // Clear the response timeout since we're responding now
      clearTimeout(responseTimeout);
    }

    // Only send response if headers haven't been sent (timeout didn't fire)
    if (!res.headersSent) {
      // Check for potential issues in pool metrics
      const poolMetrics = poolStatus.metrics;
      const maxPoolSize = poolStatus.maxPoolSize;
      const hasPoolWarning = poolMetrics &&
        maxPoolSize !== undefined &&
        poolMetrics.activeConnections !== undefined &&
        poolMetrics.activeConnections > maxPoolSize * 1.5; // Warn if significantly over

      const hasCheckoutLeak = poolMetrics &&
        (poolMetrics.totalCheckouts - poolMetrics.totalCheckins) > 100;

      const health = {
        status: dbHealth.healthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: {
          healthy: dbHealth.healthy,
          latency: dbHealth.latency,
          error: dbHealth.error,
          ...poolStatus,
          ...(hasPoolWarning || hasCheckoutLeak ? {
            warnings: [
              ...(hasPoolWarning ? [`Cumulative active connections (${poolMetrics.activeConnections}) exceeds max pool size (${maxPoolSize}). This is a cumulative metric - actual pool size is estimated at ${poolMetrics.estimatedCurrentPoolSize || 'unknown'}.`] : []),
              ...(hasCheckoutLeak ? [`Potential connection leak: ${poolMetrics.totalCheckouts - poolMetrics.totalCheckins} more checkouts than checkins.`] : []),
            ],
          } : {}),
        },
      };

      // Always return 200 to prevent Docker from killing the container
      // The 'degraded' status in the body indicates issues without causing container restarts
      res.status(200).json(health);
    }
  });

  // Handle both GET and HEAD requests for health checks
  app.get('/health', healthHandler);
  app.head('/health', healthHandler);

  // Metrics endpoint (Prometheus format)
  app.get('/metrics', asyncHandler(async (_req, res) => {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  }));

  // Database-specific health check endpoint
  app.get('/api/health/db', asyncHandler(async (_req, res) => {
    const dbHealth = await checkDatabaseHealth();
    const poolStatus = getConnectionPoolStatus();

    const response = {
      healthy: dbHealth.healthy,
      latency: dbHealth.latency,
      error: dbHealth.error,
      ...poolStatus,
      timestamp: new Date().toISOString(),
    };

    const statusCode = dbHealth.healthy ? 200 : 503;
    res.status(statusCode).json(response);
  }));

  // Neo4j health check endpoint
  app.get('/api/health/neo4j', asyncHandler(async (_req, res) => {
    const neo4jHealth = await checkNeo4jHealth();
    const statusCode = neo4jHealth.healthy ? 200 : 503;
    res.status(statusCode).json(neo4jHealth);
  }));

  // GraphDB health check endpoint
  app.get('/api/health/graphdb', asyncHandler(async (_req, res) => {
    const graphdbHealth = await checkGraphDBHealth();
    const statusCode = graphdbHealth.healthy ? 200 : 503;
    res.status(statusCode).json(graphdbHealth);
  }));

  // Redis health check endpoint
  app.get('/api/health/redis', asyncHandler(async (_req, res) => {
    const redisHealth = await checkRedisHealth();
    const statusCode = redisHealth.healthy ? 200 : 503;
    res.status(statusCode).json(redisHealth);
  }));

  /**
   * Connection health check endpoint
   * Returns status for all database connections (MongoDB, Neo4j, Redis, GraphDB)
   */
  app.get('/health/connections', asyncHandler(async (_req, res) => {
    const timestamp = new Date().toISOString();

    // Check all connections in parallel with timeout
    const healthCheckTimeout = 5000; // 5 seconds timeout per connection

    const checkWithTimeout = async <T>(
      checkFn: () => Promise<T>,
      timeoutMs: number
    ): Promise<T> => {
      return Promise.race([
        checkFn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Health check timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
    };

    // Run all health checks in parallel
    const [mongodb, neo4j, redis, graphdb] = await Promise.allSettled([
      checkWithTimeout(() => checkDatabaseHealth(healthCheckTimeout), healthCheckTimeout),
      checkWithTimeout(() => checkNeo4jHealth(), healthCheckTimeout),
      checkWithTimeout(() => checkRedisHealth(), healthCheckTimeout),
      checkWithTimeout(() => checkGraphDBHealth(), healthCheckTimeout),
    ]);

    // Extract results
    const connections = {
      mongodb: mongodb.status === 'fulfilled'
        ? mongodb.value
        : { healthy: false, error: mongodb.reason instanceof Error ? mongodb.reason.message : String(mongodb.reason) },
      neo4j: neo4j.status === 'fulfilled'
        ? neo4j.value
        : { healthy: false, error: neo4j.reason instanceof Error ? neo4j.reason.message : String(neo4j.reason) },
      redis: redis.status === 'fulfilled'
        ? redis.value
        : { healthy: false, error: redis.reason instanceof Error ? redis.reason.message : String(redis.reason) },
      graphdb: graphdb.status === 'fulfilled'
        ? graphdb.value
        : { healthy: false, error: graphdb.reason instanceof Error ? graphdb.reason.message : String(graphdb.reason) },
    };

    // Add knowledge graph backend information
    let knowledgeGraphBackend: { backend: string; backendName: string; description: string } | null = null;
    try {
      const { getKnowledgeGraphBackend } = await import('../routes/knowledgeGraphRoutes.js');
      const kgBackend = getKnowledgeGraphBackend();
      knowledgeGraphBackend = {
        backend: kgBackend,
        backendName: kgBackend === 'graphdb' ? 'GraphDB' : 'Neo4j',
        description: kgBackend === 'graphdb' 
          ? 'RDF/SPARQL-based knowledge graph (default)'
          : 'Property graph database (fallback)',
      };
    } catch (error) {
      // Backend info unavailable, but don't fail health check
      logger.debug({ error }, 'Could not determine knowledge graph backend for health check');
    }

    const allHealthy = Object.values(connections).every(conn => conn.healthy);

    const response = {
      timestamp,
      healthy: allHealthy,
      connections,
      ...(knowledgeGraphBackend && { knowledgeGraph: knowledgeGraphBackend }),
    };

    // Return 200 if all healthy, 503 if any unhealthy
    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(response);
  }));

  /**
   * Configuration health check endpoint
   * Returns redacted configuration in non-production environments only
   * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/21-deployment-config-conventions.md
   */
  app.get('/health/config', asyncHandler(async (_req, res) => {
    const env = getEnv();
    // Only available in non-production environments
    if (env.NODE_ENV === 'production' && env.ENVIRONMENT === 'production') {
      res.status(404).json({
        error: 'Configuration endpoint not available in production',
        message: 'This endpoint is disabled in production for security reasons',
      });
      return;
    }

    try {
      const { getDeploymentConfig, redactConfig } = await import('./deployment.js');
      const config = getDeploymentConfig();
      const redacted = redactConfig(config);

      res.json({
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        config: redacted,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to load configuration',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }));

  /**
   * Reranker health check endpoint
   * Returns status for reranker service (Ollama, OpenAI, etc.)
   */
  app.get('/health/reranker', asyncHandler(async (_req, res) => {
    const timestamp = new Date().toISOString();

    try {
      // Import RerankerService dynamically to avoid circular dependencies
      const { RerankerService } = await import('../services/retrieval/RerankerService.js');
      const rerankerService = new RerankerService();

      // Check health with timeout (5 seconds)
      const healthCheckTimeout = 5000;
      const healthCheck = await Promise.race([
        rerankerService.checkHealth(),
        new Promise<{ enabled: boolean; provider: string; available: boolean; apiUrl?: string; model?: string; error: string | null; suggestion: string | null }>((_, reject) =>
          setTimeout(() => reject(new Error(`Health check timeout after ${healthCheckTimeout}ms`)), healthCheckTimeout)
        ),
      ]);

      const response = {
        ...healthCheck,
        lastCheck: timestamp,
      };

      // Return 200 if available or disabled, 503 if enabled but unavailable
      const statusCode = healthCheck.enabled && !healthCheck.available ? 503 : 200;
      res.status(statusCode).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response = {
        enabled: false,
        provider: 'unknown',
        available: false,
        lastCheck: timestamp,
        error: errorMessage,
        suggestion: 'Failed to check reranker health. Check server logs for details.',
      };

      res.status(503).json(response);
    }
  }));
}
