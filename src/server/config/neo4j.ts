import neo4j, { Driver, Session } from 'neo4j-driver';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { getEnv } from './env.js';
import {
  connectionPoolSize,
  connectionErrors,
  connectionLatency,
} from '../utils/metrics.js';
import { getServiceHostnameStrict } from '../utils/dockerDetection.js';

// Re-export Driver type for use in other modules
export type { Driver, Session };

dotenv.config();

// Validate environment variables on module load
let env: ReturnType<typeof getEnv>;
try {
  env = getEnv();
} catch (error) {
  logger.error({ error }, 'Failed to validate environment variables');
  throw error;
}

// Enforced containerization: Must use Docker service name
const neo4jHost = getServiceHostnameStrict('neo4j');
const defaultUri = `bolt://${neo4jHost}:7687`;
let uri = env.NEO4J_URI || defaultUri;

// For E2E tests, convert Docker service name to localhost (tests run outside Docker)
const isE2ETest = process.env.E2E_TEST === 'true' || process.env.NODE_ENV === 'test';
if (isE2ETest && (uri.includes('neo4j:7687') || uri.includes('bolt://neo4j:'))) {
  // Convert Docker service name to localhost for E2E tests
  uri = uri.replace(/bolt:\/\/neo4j:/g, 'bolt://localhost:');
  logger.info('✅ Converted Neo4j hostname from "neo4j" to "localhost" for E2E tests (connecting to Docker Neo4j via exposed port)');
} else if (!isE2ETest && (uri.includes('localhost') || uri.includes('127.0.0.1'))) {
  // Enforce Docker service name in URI if localhost is present (only when NOT in E2E test mode)
  const correctedUri = uri.replace(/(bolt:\/\/)(localhost|127\.0\.0\.1)(:)/, `$1${neo4jHost}$3`);
  if (correctedUri !== uri) {
    logger.warn(`⚠️  Neo4j URI contains localhost, corrected to Docker service name: ${correctedUri}`);
    uri = correctedUri; // Use the corrected URI
  }
}
const user = env.NEO4J_USER || 'neo4j';
const password = env.NEO4J_PASSWORD || 'password';

if (!env.NEO4J_PASSWORD || env.NEO4J_PASSWORD === 'password') {
    logger.warn(
        '⚠️  NEO4J_PASSWORD not set or using default "password". ' +
        'For secure setup, run: pnpm run setup:neo4j-password ' +
        'Set NEO4J_PASSWORD in .env for production.'
    );
}

let driver: Driver | null = null;
let isConnected = false;
let isIntentionallyClosing = false;
let connectionStateListeners: Array<(connected: boolean) => void> = [];
let healthCheckIntervalId: NodeJS.Timeout | null = null;
let reconnectionPromise: Promise<void> | null = null; // Promise-based lock to prevent concurrent reconnection attempts

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number): number {
    return INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Update Neo4j connection pool metrics in Prometheus
 */
function updateNeo4jConnectionPoolMetrics(): void {
  if (!driver) {
    connectionPoolSize.set({ type: 'neo4j', status: 'current' }, 0);
    connectionPoolSize.set({ type: 'neo4j', status: 'available' }, 0);
    return;
  }

  // Neo4j driver doesn't expose pool size directly, but we can track connection state
  // The pool size is configured via maxConnectionPoolSize
  const maxPoolSize = env.NEO4J_MAX_POOL_SIZE;
  const isConnectedValue = isConnected ? 1 : 0;
  
  connectionPoolSize.set({ type: 'neo4j', status: 'max' }, maxPoolSize);
  connectionPoolSize.set({ type: 'neo4j', status: 'current' }, isConnectedValue);
  connectionPoolSize.set({ type: 'neo4j', status: 'available' }, isConnected ? maxPoolSize - 1 : 0);
}

/**
 * Notify listeners of connection state changes
 */
function notifyConnectionStateChange(connected: boolean): void {
  isConnected = connected;
  updateNeo4jConnectionPoolMetrics();
  connectionStateListeners.forEach(listener => {
    try {
      listener(connected);
    } catch (error) {
      logger.error({ error }, 'Error in Neo4j connection state listener');
    }
  });
}

/**
 * Add a listener for connection state changes
 */
export function onConnectionStateChange(listener: (connected: boolean) => void): () => void {
  connectionStateListeners.push(listener);
  // Return unsubscribe function
  return () => {
    connectionStateListeners = connectionStateListeners.filter(l => l !== listener);
  };
}

/**
 * Check if error is transient and retryable
 */
function isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();
    
    // Network errors, connection refused, timeouts are transient
    return (
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('network') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('econnreset') ||
        errorName.includes('serviceunavailable') ||
        errorName.includes('transient')
    );
}

/**
 * Check Neo4j connection health
 */
export async function checkNeo4jHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!driver) {
    connectionErrors.inc({ type: 'neo4j', error_type: 'not_initialized' });
    return { healthy: false, error: 'Neo4j driver not initialized' };
  }

  const startTime = Date.now();
  try {
    await driver.verifyConnectivity();
    const latency = (Date.now() - startTime) / 1000; // Convert to seconds

    // Track health check latency
    connectionLatency.observe({ type: 'neo4j', operation: 'health_check' }, latency);

    // Update connection state if health check succeeds
    if (!isConnected) {
      notifyConnectionStateChange(true);
    }

    return {
      healthy: true,
      latency: Math.round(latency * 1000), // Return in milliseconds for consistency
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latency = (Date.now() - startTime) / 1000; // Track latency even for failures

    // Track health check latency and error
    connectionLatency.observe({ type: 'neo4j', operation: 'health_check' }, latency);
    const errorType = isTransientError(error) ? 'network' : 'connection_failed';
    connectionErrors.inc({ type: 'neo4j', error_type: errorType });

    if (isTransientError(error)) {
      logger.warn({ error: errorMessage }, 'Neo4j health check failed with transient error');
    } else {
      logger.error({ error: errorMessage }, 'Neo4j health check failed with permanent error');
    }

    // Update connection state if health check fails
    if (isConnected) {
      notifyConnectionStateChange(false);
    }

    return {
      healthy: false,
      error: errorMessage,
    };
  }
}

// Staggered health check offset to avoid all services checking at the same time
// MongoDB: 0s offset, Neo4j: 10s offset, GraphDB: 20s offset
const HEALTH_CHECK_STAGGER_OFFSET_MS = 10000; // 10 seconds offset for Neo4j

/**
 * Start periodic health check monitoring
 * 
 * Starts periodic health checks at the configured interval (default: 30 seconds).
 * Health checks verify Neo4j connectivity and trigger reconnection on failure.
 * Can be started/stopped via exported functions.
 * 
 * Note: Neo4j health checks are staggered by 10 seconds relative to MongoDB
 * to reduce resource contention during health check cycles.
 */
export function startHealthCheckMonitoring(): void {
  // Clear existing interval if any
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
  }

  // Start health checks with a staggered delay to avoid resource contention
  setTimeout(() => {
    healthCheckIntervalId = setInterval(async () => {
      if (!driver || !isConnected || isIntentionallyClosing) {
        return;
      }

      try {
        const health = await checkNeo4jHealth();
        if (!health.healthy) {
          logger.warn({ error: health.error }, 'Periodic health check detected Neo4j connection issue');
          notifyConnectionStateChange(false);
          // Attempt reconnection in background (don't await)
          handleConnectionLoss().catch(error => {
            logger.error({ error }, 'Background Neo4j reconnection attempt failed');
          });
        }
      } catch (error) {
        logger.error({ error }, 'Error during periodic Neo4j health check');
        notifyConnectionStateChange(false);
        // Attempt reconnection in background (don't await)
        handleConnectionLoss().catch(reconnectError => {
          logger.error({ error: reconnectError }, 'Background Neo4j reconnection attempt failed');
        });
      }
    }, env.NEO4J_HEALTH_CHECK_INTERVAL_MS);

    logger.debug({ 
      interval: env.NEO4J_HEALTH_CHECK_INTERVAL_MS,
      staggerOffset: HEALTH_CHECK_STAGGER_OFFSET_MS 
    }, 'Started periodic Neo4j health check monitoring (staggered)');
  }, HEALTH_CHECK_STAGGER_OFFSET_MS);
}

/**
 * Stop periodic health check monitoring
 * 
 * Stops the periodic health check interval if it's running.
 * Should be called during graceful shutdown.
 */
export function stopHealthCheckMonitoring(): void {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    logger.debug('Stopped periodic Neo4j health check monitoring');
  }
}

/**
 * Handle connection loss by attempting reconnection
 * Uses promise-based lock to prevent concurrent reconnection attempts
 */
async function handleConnectionLoss(): Promise<void> {
  if (isIntentionallyClosing) {
    logger.debug('Intentional shutdown in progress, skipping Neo4j reconnection');
    return;
  }

  // If reconnection is already in progress, wait for it instead of starting a new one
  if (reconnectionPromise) {
    logger.debug('Neo4j reconnection already in progress, waiting for existing attempt...');
    try {
      await reconnectionPromise;
    } catch {
      // Ignore errors from the existing attempt - we'll try again if needed
    }
    return;
  }

  // Start new reconnection attempt with promise-based lock
  logger.warn('Neo4j connection lost, attempting to reconnect...');
  
  reconnectionPromise = (async (): Promise<void> => {
    try {
      // Close existing driver if present
      if (driver) {
        try {
          await driver.close();
        } catch {
          // Ignore errors when closing failed driver
        }
        driver = null;
      }

      // Attempt to reconnect using existing retry configuration
      // connectNeo4j() uses MAX_RETRIES and calculateBackoffDelay() for retry logic
      const reconnectStartTime = Date.now();
      driver = await connectNeo4j();
      const reconnectLatency = (Date.now() - reconnectStartTime) / 1000; // Convert to seconds
      
      // Track reconnection latency
      connectionLatency.observe({ type: 'neo4j', operation: 'reconnect' }, reconnectLatency);
      
      notifyConnectionStateChange(true);
      logger.info('✅ Successfully reconnected to Neo4j!');
    } catch (error) {
      // Track reconnection error
      const errorType = isTransientError(error) ? 'network' : 'connection_failed';
      connectionErrors.inc({ type: 'neo4j', error_type: errorType });
      
      notifyConnectionStateChange(false);
      logger.error({ error }, 'Failed to reconnect to Neo4j');
      throw error;
    }
  })();

  try {
    await reconnectionPromise;
  } catch {
    // Error already logged in the promise handler
  } finally {
    // Clear the promise lock after completion (success or failure)
    reconnectionPromise = null;
  }
}

/**
 * Connect to Neo4j database with retry logic
 */
export async function connectNeo4j(): Promise<Driver> {
    if (driver) {
        return driver;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                const delay = calculateBackoffDelay(attempt - 1);
                logger.warn({
                  attempt: attempt + 1,
                  maxRetries: MAX_RETRIES + 1,
                  delay,
                }, 'Retrying Neo4j connection...');
                await sleep(delay);
                
                // Close previous driver instance if it exists
                if (driver) {
                    try {
                        await driver.close();
                    } catch {
                        // Ignore errors when closing failed driver
                    }
                    driver = null;
                }
            }

            const connectStartTime = Date.now();
            driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
                maxConnectionLifetime: env.NEO4J_MAX_CONNECTION_LIFETIME_MS,
                maxConnectionPoolSize: env.NEO4J_MAX_POOL_SIZE,
                connectionAcquisitionTimeout: env.NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
            });

            // Verify connectivity
            await driver.verifyConnectivity();
            const connectLatency = (Date.now() - connectStartTime) / 1000; // Convert to seconds

            // Track connection latency
            connectionLatency.observe({ type: 'neo4j', operation: 'connect' }, connectLatency);

            logger.info({
              attempt: attempt + 1,
              maxPoolSize: env.NEO4J_MAX_POOL_SIZE,
              maxConnectionLifetime: env.NEO4J_MAX_CONNECTION_LIFETIME_MS,
            }, '✅ Successfully connected to Neo4j!');

            // Notify connection state change
            notifyConnectionStateChange(true);

            // Start periodic health checks (skip in test mode to prevent hanging)
            if (process.env.NODE_ENV !== 'test') {
                startHealthCheckMonitoring();
            }

            // Create indexes and constraints
            await createIndexes(driver);

            return driver;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Track connection error
            const errorType = isTransientError(error) ? 'network' : 'connection_failed';
            connectionErrors.inc({ type: 'neo4j', error_type: errorType });
            
            if (!isTransientError(error)) {
                // Permanent error, don't retry
                logger.error({ error: lastError }, '❌ Neo4j connection failed with permanent error');
                notifyConnectionStateChange(false);
                if (driver) {
                    try {
                        await driver.close();
                    } catch {
                        // Ignore errors when closing failed driver
                    }
                    driver = null;
                }
                throw lastError;
            }
            
            if (attempt < MAX_RETRIES) {
                logger.warn({
                  attempt: attempt + 1,
                  maxRetries: MAX_RETRIES,
                  error: lastError.message,
                }, '⚠️  Neo4j connection attempt failed, will retry...');
            } else {
                logger.error({
                  attempts: attempt + 1,
                  error: lastError,
                }, '❌ Neo4j connection failed after all retry attempts');
                notifyConnectionStateChange(false);
                if (driver) {
                    try {
                        await driver.close();
                    } catch {
                        // Ignore errors when closing failed driver
                    }
                    driver = null;
                }
            }
        }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Neo4j connection failed after all retry attempts');
}

/**
 * Get Neo4j driver instance
 */
export function getNeo4jDriver(): Driver {
    if (!driver) {
        throw new Error('Neo4j driver not initialized. Call connectNeo4j() first.');
    }
    return driver;
}

/**
 * Get a Neo4j session
 */
export function getNeo4jSession(): Session {
    const driver = getNeo4jDriver();
    return driver.session();
}

/**
 * Create indexes and constraints for knowledge graph
 */
async function createIndexes(driver: Driver): Promise<void> {
    const session = driver.session();

    try {
        // Create constraints (unique node IDs) - Neo4j 5.x syntax
        try {
            await session.run(`
                CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
                FOR (e:Entity) REQUIRE e.id IS UNIQUE
            `);
        } catch (error: unknown) {
            // Constraint might already exist or syntax might differ
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('already exists')) {
                console.warn('Could not create entity_id_unique constraint:', errorMessage);
            }
        }

        // Create indexes for faster lookups - Neo4j 5.x syntax
        try {
            await session.run(`
                CREATE INDEX entity_type_idx IF NOT EXISTS
                FOR (e:Entity) ON (e.type)
            `);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('already exists')) {
                console.warn('Could not create entity_type_idx:', errorMessage);
            }
        }

        try {
            await session.run(`
                CREATE INDEX entity_uri_idx IF NOT EXISTS
                FOR (e:Entity) ON (e.uri)
            `);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('already exists')) {
                console.warn('Could not create entity_uri_idx:', errorMessage);
            }
        }

        console.log('✅ Neo4j indexes and constraints created');
    } catch (error) {
        // Indexes might already exist, that's okay
        if (error instanceof Error && error.message.includes('already exists')) {
            console.log('ℹ️  Neo4j indexes already exist');
        } else {
            console.warn('⚠️  Could not create Neo4j indexes:', error);
        }
    } finally {
        await session.close();
    }
}

/**
 * Check if Neo4j connection is active
 */
export function isNeo4jConnected(): boolean {
  return driver !== null && isConnected;
}

/**
 * Close Neo4j connection
 * Note: Graceful shutdown is handled centrally in server/index.ts
 * This function should only be called through the shutdown coordinator
 */
export async function closeNeo4j(): Promise<void> {
    try {
        // Set flag to prevent reconnection attempts during intentional shutdown
        isIntentionallyClosing = true;
        stopHealthCheckMonitoring();

        if (!driver) {
            return;
        }
        
        await driver.close();
        notifyConnectionStateChange(false);
        logger.info('Neo4j connection closed');
    } catch (error) {
        logger.error({ error }, 'Error closing Neo4j connection');
        throw error;
    } finally {
        // Always reset driver reference and flags, even if close() fails
        driver = null;
        isConnected = false;
        reconnectionPromise = null; // Clear reconnection promise lock
        // Reset flag after closing (in case connection is reopened later)
        isIntentionallyClosing = false;
    }
}

