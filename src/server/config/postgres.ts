/**
 * PostgreSQL/PostGIS Connection Configuration
 * 
 * Manages connection pool for PostGIS spatial queries.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import { Pool, type PoolConfig } from 'pg';
import { validateEnv } from './env.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import { connectionLatency } from '../utils/metrics.js';

let pool: Pool | null = null;
let isConnected = false;
let lastConnectionError: Error | null = null;
let connectionAttempts = 0;
let successfulQueries = 0;
let failedQueries = 0;

/**
 * Get PostgreSQL connection pool
 * 
 * Creates a singleton pool instance if it doesn't exist.
 * 
 * @returns PostgreSQL Pool instance
 */
export function getPostgresPool(): Pool {
  if (pool) {
    return pool;
  }

  const env = validateEnv();
  
  const config: PoolConfig = {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10), // Maximum number of clients in the pool
    idleTimeoutMillis: parseInt(process.env.POSTGRES_POOL_IDLE_TIMEOUT || '30000', 10), // Close idle clients after 30 seconds
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_POOL_CONNECTION_TIMEOUT || '10000', 10), // Return an error after 10 seconds if connection could not be established
    // Additional robustness settings
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
    // Retry connection on failure
    allowExitOnIdle: false, // Don't exit process when pool is idle
  };

  pool = new Pool(config);

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error({ error: err }, 'Unexpected error on idle PostgreSQL client');
    isConnected = false;
    lastConnectionError = err instanceof Error ? err : new Error(String(err));
    connectionAttempts++;
    
    // Attempt to reconnect if pool is in error state
    // The pool will automatically retry on next query, but we log the error
    logger.warn(
      { 
        error: err,
        connectionAttempts,
        poolTotal: pool?.totalCount ?? 0,
        poolIdle: pool?.idleCount ?? 0,
        poolWaiting: pool?.waitingCount ?? 0,
      },
      'PostgreSQL pool error detected, will retry on next query'
    );
  });
  
  // Monitor pool connection events
  pool.on('connect', () => {
    isConnected = true;
    lastConnectionError = null;
    connectionAttempts = 0;
    logger.debug('PostgreSQL client connected to pool');
  });
  
  pool.on('remove', () => {
    logger.debug('PostgreSQL client removed from pool');
  });

  // Test connection with retry on authentication failure
  const testConnection = async (): Promise<void> => {
    try {
      if (!pool) throw new Error('PostgreSQL pool is null');
      await pool.query('SELECT 1');
      isConnected = true;
      logger.info(
        { 
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
        },
        'PostgreSQL connection pool established'
      );
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      isConnected = false;
      
      if (error.code === '28P01') {
        logger.error(
          { 
            error: error.message,
            code: error.code,
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            hint: 'Check POSTGRES_PASSWORD environment variable matches container password. ' +
                  'For Docker: verify POSTGRES_PASSWORD in .env matches docker-compose.yml POSTGRES_PASSWORD'
          }, 
          'PostgreSQL password authentication failed'
        );
      } else if (error.code === 'ECONNREFUSED') {
        logger.error(
          { 
            error: error.message,
            code: error.code,
            host: config.host,
            port: config.port,
            hint: 'PostgreSQL connection refused. Ensure PostgreSQL is running: docker compose up -d postgres'
          }, 
          'PostgreSQL connection refused'
        );
      } else if (error.code === '3D000') {
        logger.error(
          { 
            error: error.message,
            code: error.code,
            database: config.database,
            hint: `PostgreSQL database "${config.database}" does not exist. Create it or update POSTGRES_DB environment variable.`
          }, 
          'PostgreSQL database does not exist'
        );
      } else {
        logger.error(
          { 
            error: err,
            code: error.code,
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
          }, 
          'Failed to establish PostgreSQL connection'
        );
      }
      // Don't throw - allow pool to be created even if initial connection fails
      // Connection will be retried on first query
    }
  };

  // Test connection immediately (don't wait for async)
  // This is fire-and-forget - errors are logged but don't prevent pool creation
  // The pool will retry connection on first use
  testConnection().catch(() => {
    // Error already logged in testConnection
  });

  return pool;
}

/**
 * Check if PostgreSQL is connected
 * 
 * @returns True if connected, false otherwise
 */
export function isPostgresConnected(): boolean {
  return isConnected && pool !== null;
}

/**
 * Get PostgreSQL connection pool statistics
 * 
 * @returns Connection pool statistics
 */
export function getPostgresPoolStats(): {
  isConnected: boolean;
  poolTotal: number;
  poolIdle: number;
  poolWaiting: number;
  successfulQueries: number;
  failedQueries: number;
  connectionAttempts: number;
  lastError: string | null;
} {
  if (!pool) {
    return {
      isConnected: false,
      poolTotal: 0,
      poolIdle: 0,
      poolWaiting: 0,
      successfulQueries,
      failedQueries,
      connectionAttempts,
      lastError: lastConnectionError?.message || null,
    };
  }
  
  return {
    isConnected,
    poolTotal: pool.totalCount,
    poolIdle: pool.idleCount,
    poolWaiting: pool.waitingCount,
    successfulQueries,
    failedQueries,
    connectionAttempts,
    lastError: lastConnectionError?.message || null,
  };
}

/**
 * Close PostgreSQL connection pool
 * 
 * Should be called during application shutdown.
 */
export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
    logger.info('PostgreSQL connection pool closed');
  }
}

/**
 * Execute a query with automatic connection management
 * 
 * @param text - SQL query text
 * @param params - Query parameters
 * @returns Query result
 */
/**
 * Check if a PostgreSQL error is retryable (transient connection error)
 */
function isRetryablePostgresError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as { code?: string }).code;
  
  // Retry on transient connection errors
  const retryableCodes = [
    'ECONNREFUSED',  // Connection refused
    'ETIMEDOUT',     // Connection timeout
    'ENOTFOUND',     // DNS resolution failed
    'EAI_AGAIN',     // DNS lookup failed
    '57P01',         // Admin shutdown
    '57P02',         // Crash shutdown
    '57P03',         // Cannot connect now
    '08003',         // Connection does not exist
    '08006',         // Connection failure
    '08001',         // SQL client unable to establish SQL connection
  ];
  
  // Check error code
  if (errorCode && retryableCodes.includes(errorCode)) {
    return true;
  }
  
  // Check error message for connection-related patterns
  const retryablePatterns = [
    'connection',
    'timeout',
    'network',
    'econnreset',
    'etimedout',
    'econnrefused',
    'socket',
    'pool',
    'not connected',
    'connection terminated',
  ];
  
  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
}

export async function queryPostgres<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPostgresPool();
  
  // Wrap query with retry logic for transient failures
  return retryWithBackoff(
    async () => {
      try {
        const result = await pool.query(text, params);
        // Mark as connected on successful query
        isConnected = true;
        lastConnectionError = null;
        connectionAttempts = 0;
        successfulQueries++;
        return result.rows as T[];
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        isConnected = false;
        failedQueries++;
        lastConnectionError = err instanceof Error ? err : new Error(String(err));
        
        // Non-retryable errors: authentication, database doesn't exist, etc.
        if (error.code === '28P01') {
          const env = validateEnv();
          // POSTGRES_PASSWORD is guaranteed to be set by validateEnv()
          const passwordHint = `POSTGRES_PASSWORD is set (length: ${env.POSTGRES_PASSWORD.length})`;
          
          logger.error(
            {
              error: error.message,
              code: error.code,
              host: env.POSTGRES_HOST,
              port: env.POSTGRES_PORT,
              database: env.POSTGRES_DB,
              user: env.POSTGRES_USER,
              passwordHint
            },
            `PostgreSQL authentication failed. ` +
            `To fix: ` +
            `1. Check if POSTGRES_PASSWORD environment variable matches the Docker container password. ` +
            `2. Get container password: docker exec beleidsscan-postgres env | grep POSTGRES_PASSWORD` +
            `3. Set POSTGRES_PASSWORD in your .env file or environment to match the container. ` +
            `4. If container was initialized with default, use: POSTGRES_PASSWORD=password`
          );

          throw new Error('PostgreSQL authentication failed. Check server logs for details.');
        } else if (error.code === '3D000') {
          const env = validateEnv();

          logger.error(
            {
              error: error.message,
              code: error.code,
              database: env.POSTGRES_DB
            },
            `PostgreSQL database does not exist: ${env.POSTGRES_DB}. Create the database or update POSTGRES_DB environment variable.`
          );

          throw new Error('PostgreSQL database configuration error. Check server logs for details.');
        }
        
        // Re-throw for retry logic to handle
        throw err;
      }
    },
    {
      maxAttempts: 3, // 3 total attempts (1 initial + 2 retries)
      initialDelay: 1000, // 1 second initial delay
      maxDelay: 10000, // 10 seconds max delay
      multiplier: 2, // Exponential backoff
      isRetryable: (error: unknown) => isRetryablePostgresError(error),
    },
    `PostgreSQL query: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
  );
}

/**
 * Test PostgreSQL connection explicitly
 * 
 * @returns True if connection successful, false otherwise
 */
export async function testPostgresConnection(): Promise<boolean> {
  try {
    await queryPostgres('SELECT 1');
    return true;
  } catch (error) {
    logger.error({ error }, 'PostgreSQL connection test failed');
    return false;
  }
}

/**
 * Check PostgreSQL connection health by performing a ping
 * Uses a timeout to prevent hanging when connection pool is exhausted
 * 
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns Health check result with latency and error information
 */
export async function checkPostgresHealth(timeoutMs: number = 5000): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!pool) {
    return { healthy: false, error: 'PostgreSQL pool not initialized' };
  }

  const startTime = Date.now();

  try {
    // Use Promise.race to timeout the query if connection pool is exhausted
    const queryPromise = pool.query('SELECT 1');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const poolStats = getPostgresPoolStats();
        reject(new Error(
          `PostgreSQL health check timeout after ${timeoutMs}ms. ` +
          `Pool status: ${poolStats.isConnected ? 'connected' : 'disconnected'}, ` +
          `Total connections: ${poolStats.poolTotal}, ` +
          `Idle: ${poolStats.poolIdle}, ` +
          `Waiting: ${poolStats.poolWaiting}`
        ));
      }, timeoutMs);
    });

    await Promise.race([queryPromise, timeoutPromise]);
    const latency = (Date.now() - startTime) / 1000; // Convert to seconds

    // Update Prometheus metrics
    connectionLatency.observe({ type: 'postgresql', operation: 'health_check' }, latency);

    // Update connection state if health check succeeds
    if (!isConnected) {
      isConnected = true;
      lastConnectionError = null;
      connectionAttempts = 0;
    }

    return {
      healthy: true,
      latency: Math.round(latency * 1000), // Return in milliseconds for consistency
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latency = (Date.now() - startTime) / 1000; // Track latency even for failures

    // Update Prometheus metrics (track latency even for failures)
    connectionLatency.observe({ type: 'postgresql', operation: 'health_check' }, latency);

    // Update connection state if health check fails
    if (isConnected) {
      isConnected = false;
      lastConnectionError = error instanceof Error ? error : new Error(String(error));
    }

    logger.warn({ error: errorMessage, latency }, 'PostgreSQL health check failed');

    return {
      healthy: false,
      error: errorMessage,
      latency: Math.round(latency * 1000), // Return in milliseconds for consistency
    };
  }
}

