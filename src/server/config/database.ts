import { MongoClient, ServerApiVersion, Db, type MongoClientOptions, MongoServerError } from 'mongodb';

// Re-export Db type for use in other modules
export type { Db };
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { getEnv } from './env.js';
import {
  mongodbConnectionPoolSize,
  mongodbConnectionPoolEvents,
  mongodbConnectionState,
  mongodbReconnectionAttempts,
  mongodbHealthCheckLatency,
  connectionPoolSize,
  connectionErrors,
  connectionLatency,
} from '../utils/metrics.js';
import { getServiceHostnameStrict } from '../utils/dockerDetection.js';

dotenv.config();

// Validate environment variables on module load
let env: ReturnType<typeof getEnv>;
try {
  env = getEnv();
} catch (error) {
  logger.error({ error }, 'Failed to validate environment variables');
  throw error;
}

// MongoDB connection URI logic:
// 1. If MONGODB_URI is explicitly set, use it (supports both Atlas and Docker)
// 2. If USE_LOCAL_MONGODB=true, force local Docker MongoDB
// 3. If running in Docker container, use Docker MongoDB hostname
// 4. Otherwise, default to local Docker MongoDB for local development
//
// Note: The detection logic below is intentional for local development flexibility.
// When using Docker Compose, MONGODB_URI is explicitly set in docker-compose.yml,
// so this detection serves as a fallback for local development scenarios where
// developers may run the app outside Docker or with different configurations.

// Enforced containerization: Must use Docker service name
const mongoUri = env.MONGODB_URI || process.env.MONGODB_URI;
const mongoHost = getServiceHostnameStrict('mongodb');

// Default MongoDB URI - Docker container only
const defaultDockerUri = `mongodb://admin:password@${mongoHost}:27017/beleidsscan?authSource=admin`;

/**
 * Encode MongoDB connection string to handle special characters in passwords
 * Properly URL-encodes username and password components
 * Uses regex approach first since MongoDB URIs with special characters in passwords
 * may fail URL parsing in strict Node.js versions
 */
function encodeMongoUri(uri: string): string {
  // Use regex approach first - more reliable for MongoDB URIs with special characters
  // Pattern: mongodb://username:password@host:port/database?options
  const match = uri.match(/^mongodb:\/\/([^:]+):([^@]+)@(.+)$/);
  if (match) {
    const [, username, password, rest] = match;
    // Only encode if password contains characters that need encoding
    // Check if password is already encoded (contains %)
    const needsEncoding = !password.includes('%') && /[/=@:?#[\]]/.test(password);
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = needsEncoding ? encodeURIComponent(password) : password;
    return `mongodb://${encodedUsername}:${encodedPassword}@${rest}`;
  }
  
  // Fallback: try URL parsing if regex doesn't match
  try {
    const url = new URL(uri);
    if (url.username) {
      url.username = encodeURIComponent(url.username);
    }
    if (url.password) {
      url.password = encodeURIComponent(url.password);
    }
    return url.toString();
  } catch (error) {
    // If both methods fail, return as-is (might be malformed, but let MongoDB driver handle it)
    logger.warn({ error, uri: uri.replace(/:[^:@]+@/, ':****@') }, 'Failed to encode MongoDB URI, using as-is');
    return uri;
  }
}

// Determine which URI to use
// FORCE LOCAL DOCKER MONGODB - Skip Atlas until further notice
let uri: string;

// Always use local Docker MongoDB, ignore Atlas URIs
if (mongoUri && !mongoUri.includes('mongodb.net') && !mongoUri.includes('mongodb+srv://')) {
    // Use provided URI if it's not Atlas
    // For E2E tests, allow localhost (tests run outside Docker and connect to Docker MongoDB via localhost)
    // For production/backend, enforce Docker service name
    const isE2ETest = process.env.E2E_TEST === 'true' || process.env.NODE_ENV === 'test';
    let processedUri = mongoUri;
    if (isE2ETest && (mongoUri.includes('@mongodb:') || mongoUri.includes('mongodb:27017'))) {
        // Convert Docker service name to localhost for E2E tests (tests run outside Docker)
        processedUri = mongoUri.replace(/@mongodb:/g, '@localhost:');
        logger.info('✅ Converted MongoDB hostname from "mongodb" to "localhost" for E2E tests (connecting to Docker MongoDB via exposed port)');
    } else if (!isE2ETest && (mongoUri.includes('@localhost:') || mongoUri.includes('@127.0.0.1:'))) {
        // Only convert localhost to Docker service name if NOT in e2e test mode
        processedUri = mongoUri.replace(/@(localhost|127\.0\.0\.1):/g, `@${mongoHost}:`);
        logger.warn('⚠️  MONGODB_URI contains localhost, converted to Docker service name for containerization enforcement');
    } else if (mongoUri.includes('@mongodb:') || mongoUri.includes('mongodb:27017')) {
        logger.info('✅ Using Docker MongoDB from MONGODB_URI');
    } else if (isE2ETest && mongoUri.includes('@localhost:')) {
        logger.info('✅ Using localhost MongoDB for E2E tests (connecting to Docker MongoDB via exposed port)');
    } else {
        logger.info('✅ Using MongoDB from MONGODB_URI environment variable');
    }
    // Encode URI to handle special characters in password
    uri = encodeMongoUri(processedUri);
} else {
    // Default to Docker MongoDB (skip Atlas)
    uri = defaultDockerUri;
    if (mongoUri && (mongoUri.includes('mongodb.net') || mongoUri.includes('mongodb+srv://'))) {
        logger.warn('⚠️  MONGODB_URI points to Atlas. Using local Docker MongoDB instead (Atlas disabled).');
    }
    logger.info('Using MongoDB (Docker container - containerization enforced)');
}

// Clean URI: Remove unsupported connection string options that should only be in clientOptions
// MongoDB driver doesn't support maxConnectionLifetimeMS in the connection string
const uriParts = uri.split('?');
if (uriParts.length > 1) {
    const baseUri = uriParts[0];
    const queryParams = uriParts[1].split('&');
    // Filter out unsupported options that should be in clientOptions only
    const supportedParams = queryParams.filter(param => {
        const key = param.split('=')[0].toLowerCase();
        // These options should only be in clientOptions, not in the URI
        return !['maxconnectionlifetimems', 'maxidletimems', 'maxpoolsize', 'minpoolsize'].includes(key);
    });
    uri = supportedParams.length > 0 ? `${baseUri}?${supportedParams.join('&')}` : baseUri;
}

// ServerApiVersion is only for MongoDB Atlas, not local MongoDB
// Check if URI is for Atlas (contains mongodb.net) or local
const isAtlas = uri.includes('mongodb.net') || uri.includes('mongodb+srv://');

// Retry configuration (using validated env)
const MAX_RETRIES = env.DB_MAX_RETRIES;
const INITIAL_RETRY_DELAY = env.DB_INITIAL_RETRY_DELAY;
const MAX_RETRY_DELAY = env.DB_MAX_RETRY_DELAY;

// Connection monitoring configuration (using validated env)
const HEALTH_CHECK_INTERVAL = env.DB_HEALTH_CHECK_INTERVAL;
const RECONNECTION_MAX_RETRIES = env.DB_RECONNECTION_MAX_RETRIES;
let healthCheckIntervalId: NodeJS.Timeout | null = null;

// Circuit breaker configuration for health checks
const CIRCUIT_BREAKER_MAX_FAILURES = 3;
const CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 minute
let healthCheckConsecutiveFailures = 0;
let circuitBreakerOpenedAt: number | null = null;
let isReconnecting = false;
let reconnectAttemptCount = 0;
let isIntentionallyClosing = false; // Flag to prevent reconnection during intentional shutdown
let reconnectionPromise: Promise<Db> | null = null; // Promise-based lock to prevent concurrent reconnection attempts

// Connection pool metrics tracking
let connectionPoolMetrics = {
  totalConnectionsCreated: 0,
  totalConnectionsClosed: 0,
  totalCheckouts: 0,
  totalCheckins: 0,
  totalCheckoutFailures: 0,
  lastCheckoutFailure: null as { timestamp: Date; reason?: string } | null,
  lastConnectionClosed: null as Date | null,
  lastConnectionCreated: null as Date | null,
};

// Connection pool configuration (using validated env)
// Following MongoDB Node.js driver v7 best practices
const clientOptions: MongoClientOptions = {
  // Connection pool settings
  maxPoolSize: env.DB_MAX_POOL_SIZE,
  minPoolSize: env.DB_MIN_POOL_SIZE,
  // Connection lifecycle management
  maxIdleTimeMS: env.DB_MAX_IDLE_TIME_MS, // Close idle connections after this time
  // Note: maxConnectionLifetimeMS may not be supported in all MongoDB driver versions
  // Temporarily disabled to fix connection issues
  // maxConnectionLifetimeMS: env.DB_MAX_CONNECTION_LIFETIME_MS, // Close connections after this lifetime (regardless of activity)
  // Connection timeouts
  connectTimeoutMS: env.DB_CONNECT_TIMEOUT_MS,
  serverSelectionTimeoutMS: env.DB_SERVER_SELECTION_TIMEOUT_MS,
  // Read preferences for better read distribution
  readPreference: env.DB_READ_PREFERENCE,
  readConcern: { level: env.DB_READ_CONCERN_LEVEL },
  // Write concern for data consistency
  writeConcern: { w: (typeof env.DB_WRITE_CONCERN_W === 'string' && env.DB_WRITE_CONCERN_W === 'majority') ? 'majority' : (typeof env.DB_WRITE_CONCERN_W === 'number' ? env.DB_WRITE_CONCERN_W : 'majority') },
};

if (isAtlas) {
  // Only use ServerApiVersion for Atlas
  clientOptions.serverApi = {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  };
}

const client = new MongoClient(uri, clientOptions);

let db: Db | null = null;
let isConnected = false;
let connectionStateListeners: Array<(connected: boolean) => void> = [];

/**
 * Notify listeners of connection state changes
 */
function notifyConnectionStateChange(connected: boolean): void {
  isConnected = connected;
  // Update Prometheus metrics
  mongodbConnectionState.set(connected ? 1 : 0);
  connectionStateListeners.forEach(listener => {
    try {
      listener(connected);
    } catch (error) {
      logger.error({ error }, 'Error in connection state listener');
    }
  });
}

/**
 * Update connection pool metrics in Prometheus
 */
function updateConnectionPoolMetrics(): void {
  const activeConnections = Math.max(0,
    connectionPoolMetrics.totalConnectionsCreated - connectionPoolMetrics.totalConnectionsClosed
  );
  
  // Update MongoDB-specific metrics
  mongodbConnectionPoolSize.set({ type: 'min' }, clientOptions.minPoolSize || 0);
  mongodbConnectionPoolSize.set({ type: 'max' }, clientOptions.maxPoolSize || 0);
  mongodbConnectionPoolSize.set({ type: 'current' }, activeConnections);
  mongodbConnectionPoolSize.set({ type: 'available' }, Math.max(0, (clientOptions.maxPoolSize || 0) - activeConnections));
  
  // Update generic connection metrics
  connectionPoolSize.set({ type: 'mongodb', status: 'min' }, clientOptions.minPoolSize || 0);
  connectionPoolSize.set({ type: 'mongodb', status: 'max' }, clientOptions.maxPoolSize || 0);
  connectionPoolSize.set({ type: 'mongodb', status: 'current' }, activeConnections);
  connectionPoolSize.set({ type: 'mongodb', status: 'available' }, Math.max(0, (clientOptions.maxPoolSize || 0) - activeConnections));
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
 * Check if an error is transient and should be retried
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name?.toLowerCase() || '';
  
  // Network errors
  if (errorName.includes('network') || errorMessage.includes('network')) return true;
  if (errorName.includes('timeout') || errorMessage.includes('timeout')) return true;
  if (errorMessage.includes('econnrefused')) return true;
  if (errorMessage.includes('enotfound')) return true;
  
  // MongoDB transient errors
  if (error instanceof MongoServerError) {
    // Transient error codes
    const transientCodes = [
      6,   // HostUnreachable
      7,   // HostNotFound
      89,  // NetworkTimeout
      91,  // ShutdownInProgress
      11600, // InterruptedAtShutdown
      11602, // InterruptedDueToReplStateChange
    ];
    const errorCode = typeof error.code === 'number' ? error.code : 0;
    if (transientCodes.includes(errorCode)) return true;
  }
  
  // Don't retry on authentication errors, invalid URI, etc.
  if (errorMessage.includes('authentication') || errorMessage.includes('auth')) return false;
  if (errorMessage.includes('invalid') && errorMessage.includes('uri')) return false;
  
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Setup MongoDB client event listeners for connection monitoring
 * 
 * Note: Connection checkout/checkin events are very frequent in normal operation
 * (every MongoDB operation checks out a connection, uses it, then checks it back in).
 * These are logged only if MONGODB_LOG_POOL_EVENTS=true to reduce log noise.
 * 
 * The frequent checkouts/checkins are normal MongoDB connection pool behavior:
 * - Operations checkout a connection from the pool
 * - Use it for the database operation
 * - Check it back in when done
 * - The pool maintains 2-10 connections (minPoolSize-maxPoolSize)
 * - Connections are reused efficiently across operations
 */
function setupConnectionMonitoring(): void {
  // Only log connection pool lifecycle events if explicitly enabled via env var
  // These events are very frequent and noisy in normal operation
  const logConnectionPoolEvents = env.MONGODB_LOG_POOL_EVENTS;
  
  client.on('connectionPoolCreated', () => {
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection pool created');
    }
  });

  client.on('connectionCreated', () => {
    connectionPoolMetrics.totalConnectionsCreated++;
    connectionPoolMetrics.lastConnectionCreated = new Date();
    mongodbConnectionPoolEvents.inc({ event_type: 'created' });
    updateConnectionPoolMetrics();
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection created');
    }
  });

  client.on('connectionReady', () => {
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection ready');
    }
  });

  client.on('connectionClosed', (event?: { reason?: string; [key: string]: unknown }) => {
    connectionPoolMetrics.totalConnectionsClosed++;
    connectionPoolMetrics.lastConnectionClosed = new Date();
    mongodbConnectionPoolEvents.inc({ event_type: 'closed' });
    updateConnectionPoolMetrics();
    
    // Determine closure reason and type
    // Handle both string and non-string reasons defensively
    const rawReason = event?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.toLowerCase().trim() : '';
    // Check for idle closures - handle variations defensively
    // MongoDB driver may report "idle" or variations, but we want to catch all idle-related closures
    const isIdleClosure = reason === 'idle' || (reason.includes('idle') && !reason.includes('error'));
    const isStaleClosure = reason === 'stale' || (reason.includes('stale') && !reason.includes('error'));
    // Pool management closures are idle/stale closures that happen while pool is still connected
    // This is normal MongoDB driver behavior when maxIdleTimeMS is configured
    const isPoolManagementClosure = isIdleClosure || isStaleClosure;
    
    // Determine if this is an expected closure
    // Expected closures:
    // 1. Intentional shutdown
    // 2. Already disconnected
    // 3. Idle/stale closures (normal pool management when maxIdleTimeMS is configured)
    //    These are expected because the MongoDB driver automatically closes idle connections
    //    to manage the pool efficiently. The pool remains connected, and new connections
    //    are created automatically when needed.
    const isExpectedClosure = isIntentionallyClosing || 
                             !isConnected || 
                             isPoolManagementClosure;
    
    // In test environment, be less noisy about connection closures
    // During test cleanup, connections may close normally
    const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                             process.env.NODE_ENV === 'testing' ||
                             process.env.JEST_WORKER_ID !== undefined ||
                             process.env.CI === 'true';
    
    // Log at appropriate level based on context
    if (isExpectedClosure) {
      // Expected closures (intentional shutdown, already disconnected, idle/stale pool management)
      // Log at debug level to reduce noise
      if (isTestEnvironment) {
        // In test environment, only log at debug level for expected closures to reduce noise
        logger.debug({ 
          reason: event?.reason,
          isIntentionallyClosing,
          isConnected,
          closureType: isPoolManagementClosure ? 'pool_management' : 'expected',
        }, 'MongoDB connection closed (expected)');
      } else {
        logger.debug({ 
          reason: rawReason, // Log original reason for debugging
          normalizedReason: reason, // Log normalized reason for verification
          isIntentionallyClosing,
          isConnected,
          closureType: isPoolManagementClosure ? 'pool_management' : 'expected',
          maxIdleTimeMS: clientOptions.maxIdleTimeMS,
        }, isPoolManagementClosure 
          ? 'MongoDB connection closed (idle/stale - normal pool management)'
          : 'MongoDB connection closed (expected)');
      }
    } else {
      // Unexpected closures when connected - always log as warning with full context
      // These indicate potential issues: network errors, authentication failures, etc.
      logger.warn({ 
        reason: rawReason, // Log original reason for debugging
        normalizedReason: reason, // Log normalized reason for verification
        isConnected,
        isIntentionallyClosing,
        isIdleClosure,
        isStaleClosure,
        isPoolManagementClosure,
        poolStatus: getConnectionPoolStatus(),
        rootCause: 'Connection closed unexpectedly while pool is connected. ' +
                   'This may indicate network issues, authentication problems, or other errors.',
      }, 'MongoDB connection closed (unexpected)');
    }
    
    // Only trigger reconnection for truly unexpected closures when connected
    // Expected closures (intentional shutdown, already disconnected, idle/stale pool management)
    // don't need reconnection - the pool handles idle closures automatically
    // CRITICAL: Never trigger reconnection for idle/stale closures - these are normal pool management
    // and the MongoDB driver handles them automatically. Reconnecting would cause unnecessary hangs.
    if (isConnected && !isIntentionallyClosing && !isExpectedClosure && !isPoolManagementClosure) {
      notifyConnectionStateChange(false);
      handleConnectionLoss();
    } else if (isPoolManagementClosure && isConnected) {
      // Safety check: Even if isExpectedClosure logic fails, never reconnect for pool management closures
      // Log at debug level to help diagnose if this path is hit unexpectedly
      logger.debug({ 
        reason: rawReason,
        normalizedReason: reason,
        isExpectedClosure,
        note: 'Pool management closure - skipping reconnection (pool handles this automatically)'
      }, 'Skipping reconnection for pool management closure');
    }
  });
  
  client.on('connectionCheckOutStarted', () => {
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection checkout started');
    }
  });

  client.on('connectionCheckOutFailed', (event: { reason?: string; [key: string]: unknown }) => {
    connectionPoolMetrics.totalCheckoutFailures++;
    connectionPoolMetrics.lastCheckoutFailure = {
      timestamp: new Date(),
      reason: event.reason,
    };
    mongodbConnectionPoolEvents.inc({ event_type: 'checkout_failed' });
    updateConnectionPoolMetrics();
    
    // Check if it's pool exhaustion vs. connection loss
    const reason = event.reason?.toLowerCase() || '';
    const isPoolExhaustion = reason.includes('pool') || 
                             reason.includes('timeout') ||
                             reason.includes('waiting') ||
                             reason.includes('exhausted');
    
    // Track error in generic connection metrics
    const errorType = isPoolExhaustion ? 'pool_exhausted' : 'checkout_failed';
    connectionErrors.inc({ type: 'mongodb', error_type: errorType });
    
    if (isPoolExhaustion) {
      logger.error({ 
        poolSize: clientOptions.maxPoolSize,
        minPoolSize: clientOptions.minPoolSize,
        reason: event.reason,
        metrics: {
          activeConnections: Math.max(0, 
            connectionPoolMetrics.totalConnectionsCreated - connectionPoolMetrics.totalConnectionsClosed
          ),
          totalCheckoutFailures: connectionPoolMetrics.totalCheckoutFailures,
        }
      }, 'Connection pool exhausted - consider increasing DB_MAX_POOL_SIZE');
      // Don't trigger reconnection for pool exhaustion - it's a capacity issue, not a connection loss
      return;
    }
    
    logger.warn({ event }, 'MongoDB connection checkout failed');
    if (isConnected && !isIntentionallyClosing) {
      notifyConnectionStateChange(false);
      handleConnectionLoss();
    }
  });

  client.on('connectionCheckedOut', () => {
    connectionPoolMetrics.totalCheckouts++;
    mongodbConnectionPoolEvents.inc({ event_type: 'checkout' });
    updateConnectionPoolMetrics();
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection checked out');
    }
  });

  client.on('connectionCheckedIn', () => {
    connectionPoolMetrics.totalCheckins++;
    mongodbConnectionPoolEvents.inc({ event_type: 'checkin' });
    updateConnectionPoolMetrics();
    if (logConnectionPoolEvents) {
      logger.debug('MongoDB connection checked in');
    }
  });

  client.on('connectionPoolClosed', () => {
    logger.warn('MongoDB connection pool closed');
    if (isConnected && !isIntentionallyClosing) {
      notifyConnectionStateChange(false);
    }
  });

  client.on('error', (error: Error) => {
    // Track error in generic connection metrics
    const errorType = isTransientError(error) ? 'network' : 'connection_failed';
    connectionErrors.inc({ type: 'mongodb', error_type: errorType });
    
    logger.error({ error }, 'MongoDB client error');
    if (isConnected && !isIntentionallyClosing && isTransientError(error)) {
      notifyConnectionStateChange(false);
      handleConnectionLoss();
    }
  });
}

/**
 * Handle connection loss by attempting reconnection
 * Uses promise-based lock to prevent concurrent reconnection attempts
 */
async function handleConnectionLoss(): Promise<void> {
  if (isIntentionallyClosing) {
    logger.debug('Intentional shutdown in progress, skipping reconnection');
    return;
  }
  
  // If reconnection is already in progress, wait for it instead of starting a new one
  if (reconnectionPromise) {
    logger.debug('Reconnection already in progress, waiting for existing attempt...');
    try {
      await reconnectionPromise;
    } catch {
      // Ignore errors from the existing attempt - we'll try again if needed
    }
    return;
  }

  // Start new reconnection attempt with promise-based lock
  logger.warn('Database connection lost, attempting to reconnect...');
  
  reconnectionPromise = (async (): Promise<Db> => {
    isReconnecting = true;
    reconnectAttemptCount = 0;
    
    try {
      const result = await attemptReconnection();
      // On success, attemptReconnection() already sets isReconnecting = false
      return result;
    } catch (error) {
      const connectionState = {
        isConnected,
        isReconnecting,
        reconnectAttemptCount,
        poolStatus: getConnectionPoolStatus(),
      };
      
      logger.error({ 
        error,
        connectionState,
      }, 'Failed to reconnect to database');
      
      // Ensure flag is cleared on error (attemptReconnection() also sets it, but ensure it's cleared here too)
      isReconnecting = false;
      throw error;
    } finally {
      // Clear the promise lock after completion (success or failure)
      reconnectionPromise = null;
      // Ensure isReconnecting is cleared in finally block as well for safety
      if (isReconnecting) {
        isReconnecting = false;
      }
    }
  })();

  try {
    await reconnectionPromise;
  } catch {
    // Error already logged in the promise handler
  }
}

/**
 * Attempt to reconnect to the database
 */
async function attemptReconnection(): Promise<Db> {
  for (let attempt = 0; attempt < RECONNECTION_MAX_RETRIES; attempt++) {
    reconnectAttemptCount = attempt + 1;
    
    try {
      const delay = calculateBackoffDelay(attempt);
      if (attempt > 0) {
        logger.info({ attempt: reconnectAttemptCount, maxRetries: RECONNECTION_MAX_RETRIES, delay }, 
          'Retrying database reconnection...');
        await sleep(delay);
      }

      // Test if connection is already active by trying a ping
      if (db) {
        try {
          await db.command({ ping: 1 });
          logger.info('Database connection recovered');
          notifyConnectionStateChange(true);
          updateConnectionPoolMetrics();
          isReconnecting = false;
          reconnectAttemptCount = 0;
          return db;
        } catch {
          // Connection is not active, continue with reconnection
        }
      }

      // Try to reconnect
      // MongoDB's client.connect() can be safely called multiple times
      // If already connected, it will return immediately (no-op)
      // If connection was lost, it will attempt to reconnect
      try {
        await client.connect();
      } catch (connectError) {
        // If connect fails with a non-transient error, don't continue
        // Non-transient errors indicate a permanent issue (e.g., invalid credentials, wrong URI)
        if (!isTransientError(connectError)) {
          logger.error({ error: connectError }, 'Client connect() failed with permanent error');
          throw connectError;
        }
        // For transient errors (network issues, timeouts), log and continue
        // The ping test below will verify if the connection pool can still handle operations
        // MongoDB's connection pool may have recovered even if connect() failed
        logger.warn({ error: connectError }, 'Client connect() failed with transient error, will test connection anyway');
      }
      
      // Ensure db instance is set
      if (!db) {
        db = client.db(env.DB_NAME);
      }
      
      // Test the connection with a ping to verify it's actually working
      // This will fail if the connection pool is in a bad state
      const reconnectStartTime = Date.now();
      await db.command({ ping: 1 });
      const reconnectLatency = (Date.now() - reconnectStartTime) / 1000; // Convert to seconds
      
      // Track latency for reconnection
      connectionLatency.observe({ type: 'mongodb', operation: 'reconnect' }, reconnectLatency);
      
      mongodbReconnectionAttempts.inc({ status: 'success' });
      logger.info({ 
        attempt: reconnectAttemptCount,
        poolSize: clientOptions.maxPoolSize,
        minPoolSize: clientOptions.minPoolSize,
        poolStatus: getConnectionPoolStatus(),
      }, '✅ Successfully reconnected to MongoDB!');
      
      notifyConnectionStateChange(true);
      updateConnectionPoolMetrics();
      isReconnecting = false;
      reconnectAttemptCount = 0;
      
      return db;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (!isTransientError(error)) {
        // Permanent error, stop retrying
        logger.error({ error: errorObj }, '❌ Database reconnection failed with permanent error');
        isReconnecting = false;
        reconnectAttemptCount = 0;
        throw errorObj;
      }

      if (attempt < RECONNECTION_MAX_RETRIES - 1) {
        logger.warn({ 
          attempt: reconnectAttemptCount, 
          maxRetries: RECONNECTION_MAX_RETRIES, 
          error: errorObj.message 
        }, 'Database reconnection attempt failed, will retry');
      } else {
        mongodbReconnectionAttempts.inc({ status: 'failure' });
        // Track reconnection failure error
        const errorType = isTransientError(errorObj) ? 'network' : 'connection_failed';
        connectionErrors.inc({ type: 'mongodb', error_type: errorType });
        
        const connectionState = {
          isConnected,
          isReconnecting,
          reconnectAttemptCount,
          poolStatus: getConnectionPoolStatus(),
        };
        
        logger.error({ 
          attempts: reconnectAttemptCount, 
          error: errorObj,
          connectionState,
        }, '❌ Database reconnection failed after all retry attempts');
        isReconnecting = false;
        reconnectAttemptCount = 0;
        throw errorObj;
      }
    }
  }

  throw new Error('Database reconnection failed after all retry attempts');
}

/**
 * Check if error is a hostname resolution error
 */
function isHostnameResolutionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  // Handle error.code which can be string or number (MongoDB error codes are numbers)
  const errorCodeRaw = (error as { code?: string | number }).code;
  const errorCode = typeof errorCodeRaw === 'string' ? errorCodeRaw.toLowerCase() : (typeof errorCodeRaw === 'number' ? String(errorCodeRaw) : '');
  
  return (
    errorMessage.includes('getaddrinfo') ||
    errorMessage.includes('eai_again') ||
    errorMessage.includes('enotfound') ||
    errorCode === 'eai_again' ||
    errorCode === 'enotfound'
  );
}

/**
 * Create a localhost fallback URI from a Docker hostname URI
 * @deprecated Localhost fallback removed - containerization is enforced
 */
  function createLocalhostFallbackUri(_originalUri: string): string {
  // This function is kept for backward compatibility but should not be used
  // Containerization is now enforced - all connections must use Docker service names
  throw new Error(
    'Localhost fallback is disabled. Containerization is enforced. ' +
    'Please run the application in Docker: docker compose up -d'
  );
}

/**
 * Connect to database with retry logic
 * Includes fallback to localhost when Docker hostname resolution fails in local test execution
 */
async function connectWithRetry(): Promise<Db> {
  let lastError: Error | null = null;
  let monitoringSetup = false;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        logger.warn({ attempt, maxRetries: MAX_RETRIES, delay }, 'Retrying database connection...');
        await sleep(delay);
      }
      
      const connectStartTime = Date.now();
      await client.connect();
      db = client.db(env.DB_NAME);
      
      // Test the connection
      await db.command({ ping: 1 });
      const connectLatency = (Date.now() - connectStartTime) / 1000; // Convert to seconds
      
      // Track connection latency
      connectionLatency.observe({ type: 'mongodb', operation: 'connect' }, connectLatency);
      
      // Setup connection monitoring after successful connection
      if (!monitoringSetup) {
        setupConnectionMonitoring();
        monitoringSetup = true;
      }
      
      notifyConnectionStateChange(true);
      updateConnectionPoolMetrics();
      logger.info({ 
        attempt: attempt + 1,
        poolSize: clientOptions.maxPoolSize,
        minPoolSize: clientOptions.minPoolSize 
      }, '✅ Successfully connected to MongoDB!');
      
      // Start periodic health checks
      startHealthCheckMonitoring();
      
      return db;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Containerization enforced: No localhost fallback
      // If hostname resolution fails, it means Docker services are not available
      if (isHostnameResolutionError(lastError) && uri.includes('@mongodb:')) {
        logger.error({ 
          originalUri: uri,
          error: lastError.message 
        }, '❌ MongoDB hostname resolution failed. Containerization is enforced - ensure Docker services are running: docker compose up -d mongodb');
      }
      
      // Track connection error
      const errorType = isTransientError(lastError) ? 'network' : 'connection_failed';
      connectionErrors.inc({ type: 'mongodb', error_type: errorType });
      
      if (!isTransientError(error)) {
        // Permanent error, don't retry
        logger.error({ error: lastError }, '❌ MongoDB connection failed with permanent error');
        throw lastError;
      }
      
      if (attempt < MAX_RETRIES) {
        logger.warn({ 
          attempt: attempt + 1, 
          maxRetries: MAX_RETRIES, 
          error: lastError.message 
        }, 'Database connection attempt failed, will retry');
      } else {
        logger.error({ 
          attempts: attempt + 1, 
          error: lastError
        }, '❌ MongoDB connection failed after all retry attempts');
      }
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error('Database connection failed after all retry attempts');
}

/**
 * Start periodic health check monitoring
 */
function startHealthCheckMonitoring(): void {
  // Clear existing interval if any
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
  }

  healthCheckIntervalId = setInterval(async () => {
    if (!db || !isConnected || isIntentionallyClosing) {
      return;
    }

    // Circuit breaker: Check if we should skip health check
    if (healthCheckConsecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES) {
      const timeSinceOpen = circuitBreakerOpenedAt ? Date.now() - circuitBreakerOpenedAt : 0;
      
      if (timeSinceOpen < CIRCUIT_BREAKER_RESET_TIME) {
        // Circuit is open, skip health check
        logger.debug({ 
          consecutiveFailures: healthCheckConsecutiveFailures,
          resetInMs: CIRCUIT_BREAKER_RESET_TIME - timeSinceOpen 
        }, 'Health check circuit breaker open, skipping check');
        return;
      } else {
        // Try to reset circuit breaker (half-open state)
        logger.info('Health check circuit breaker attempting reset (half-open state)');
      }
    }

    try {
      const health = await checkDatabaseHealth(5000); // 5 second timeout
      if (!health.healthy) {
        healthCheckConsecutiveFailures++;
        
        // Check if we just opened the circuit breaker
        if (healthCheckConsecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES && !circuitBreakerOpenedAt) {
          circuitBreakerOpenedAt = Date.now();
          logger.error({ consecutiveFailures: healthCheckConsecutiveFailures }, 
            'Health check circuit breaker opened due to consecutive failures');
        }
        
        const poolStatus = getConnectionPoolStatus();
        // Don't trigger reconnection for pool exhaustion - it's a capacity issue
        const isPoolExhaustion = health.error?.includes('timeout') || 
                                 health.error?.includes('pool') ||
                                 (poolStatus.metrics?.activeConnections || 0) >= (poolStatus.maxPoolSize || 0);
        
        if (isPoolExhaustion) {
          logger.warn({ 
            error: health.error,
            poolStatus: {
              active: poolStatus.metrics?.activeConnections,
              max: poolStatus.maxPoolSize,
            },
            consecutiveFailures: healthCheckConsecutiveFailures
          }, 'Periodic health check: Connection pool exhausted (capacity issue, not connection loss)');
        } else {
          logger.warn({ error: health.error, consecutiveFailures: healthCheckConsecutiveFailures }, 
            'Periodic health check detected database connection issue');
          notifyConnectionStateChange(false);
          // Attempt reconnection in background (don't await)
          handleConnectionLoss().catch(error => {
            logger.error({ error }, 'Background reconnection attempt failed');
          });
        }
      } else {
        // Health check succeeded - reset circuit breaker
        if (healthCheckConsecutiveFailures > 0) {
          logger.info({ previousFailures: healthCheckConsecutiveFailures }, 
            'Health check succeeded, resetting circuit breaker');
        }
        healthCheckConsecutiveFailures = 0;
        circuitBreakerOpenedAt = null;
      }
    } catch (error) {
      healthCheckConsecutiveFailures++;
      
      // Check if we just opened the circuit breaker
      if (healthCheckConsecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES && !circuitBreakerOpenedAt) {
        circuitBreakerOpenedAt = Date.now();
        logger.error({ consecutiveFailures: healthCheckConsecutiveFailures }, 
          'Health check circuit breaker opened due to consecutive failures');
      }
      
      logger.error({ error, consecutiveFailures: healthCheckConsecutiveFailures }, 
        'Error during periodic health check');
      // Only trigger reconnection if it's not a timeout/pool exhaustion
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPoolExhaustion = errorMessage.includes('timeout') || errorMessage.includes('pool');
      
      if (!isPoolExhaustion) {
        notifyConnectionStateChange(false);
        // Attempt reconnection in background (don't await)
        handleConnectionLoss().catch(reconnectError => {
          logger.error({ error: reconnectError }, 'Background reconnection attempt failed');
        });
      }
    }
  }, HEALTH_CHECK_INTERVAL);

  logger.debug({ interval: HEALTH_CHECK_INTERVAL }, 'Started periodic database health check monitoring');
}

/**
 * Stop periodic health check monitoring
 */
function stopHealthCheckMonitoring(): void {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    logger.debug('Stopped periodic database health check monitoring');
  }
}

export async function connectDB(): Promise<Db> {
  return await connectWithRetry();
}

/**
 * Check if database is initialized (synchronous, non-throwing)
 * Use this to check availability before calling getDB() if you need to handle
 * uninitialized state gracefully
 */
export function isDBInitialized(): boolean {
  return db !== null;
}

/**
 * Check if database connection is active (synchronous, non-throwing)
 * Returns true only if DB is initialized AND connection is active
 */
export function isDBConnected(): boolean {
  return db !== null && isConnected;
}

/**
 * Get database instance (synchronous for backwards compatibility)
 * Note: Connection resilience is handled automatically via monitoring and reconnection
 * For operations that might fail due to connection loss, wrap them in try-catch and
 * call ensureDBConnection() if needed
 * 
 * @throws {Error} If database is not initialized. Use isDBInitialized() to check first,
 *                 or use ensureDBConnection() for async operations that need guaranteed connection.
 */
export function getDB(): Db {
  if (!db) {
    const status = getConnectionPoolStatus();
    const errorMessage = isReconnecting
      ? 'Database not initialized. Reconnection in progress. Use ensureDBConnection() for async operations that need guaranteed connection.'
      : 'Database not initialized. Call connectDB() first. For async operations, use ensureDBConnection() to ensure active connection.';
    
    logger.error({ 
      status,
      suggestion: 'Use ensureDBConnection() for async operations, or check isDBInitialized() before calling getDB()'
    }, errorMessage);
    
    throw new Error(errorMessage);
  }
  
  // If connection appears lost, trigger reconnection in background (non-blocking)
  // The promise-based lock in handleConnectionLoss() prevents concurrent attempts
  if (!isConnected && !reconnectionPromise) {
    logger.warn('Database connection appears lost, triggering background reconnection...');
    handleConnectionLoss().catch(error => {
      logger.error({ error }, 'Background reconnection attempt failed');
    });
  }
  
  return db;
}

/**
 * Get MongoDB client instance
 * Use this when you need access to the raw client (e.g. for transactions)
 */
export function getClient(): MongoClient {
  return client;
}

/**
 * Ensure database connection is active, attempting reconnection if needed
 * Call this before critical operations if you want to ensure connection is active.
 * This function will attempt to initialize the connection if it's not initialized,
 * and will attempt reconnection if the connection is lost.
 * 
 * @returns {Promise<Db>} Active database connection
 * @throws {Error} If connection cannot be established after all retry attempts
 */
export async function ensureDBConnection(): Promise<Db> {
  // If database is not initialized, attempt to initialize it
  if (!db) {
    logger.warn('Database not initialized, attempting to connect...');
    try {
      db = await connectWithRetry();
      return db;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, 'Failed to initialize database connection');
      throw new Error(`Database not initialized and connection attempt failed: ${errorMessage}`);
    }
  }

  // Check if we're already connected by testing with a ping
  if (isConnected && db) {
    try {
      await db.command({ ping: 1 });
      return db;
    } catch (error) {
      // Connection appears to be lost, continue to reconnection
      logger.warn({ error }, 'Database ping failed, connection appears lost');
      isConnected = false;
    }
  }

  // Connection appears to be lost, attempt reconnection
  if (!isConnected) {
    logger.warn('Database connection lost, attempting reconnection...');
    try {
      await attemptReconnection();
      if (!db) {
        throw new Error('Reconnection succeeded but database instance is null');
      }
      return db;
    } catch (error) {
      logger.error({ error }, 'Failed to reconnect to database');
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Database connection lost and reconnection failed: ${errorMessage}`);
    }
  }

  if (!db) {
    throw new Error('Database connection state is inconsistent: isConnected is true but db is null');
  }

  return db;
}

// For testing: allow setting a test database instance
export function setDB(testDb: Db): void {
  db = testDb;
  // When setting a test DB manually (e.g. from MongoMemoryServer),
  // we assume it's connected and ready to use
  isConnected = true;
  notifyConnectionStateChange(true);
}

export async function closeDB(): Promise<void> {
  try {
    // Set flag to prevent reconnection attempts during intentional shutdown
    isIntentionallyClosing = true;
    stopHealthCheckMonitoring();
    
    // Check if client exists and has a close method (handles test mocks)
    if (client && typeof client.close === 'function') {
      await client.close();
    }
    
    notifyConnectionStateChange(false);
    db = null;
    isReconnecting = false;
    reconnectAttemptCount = 0;
    reconnectionPromise = null; // Clear reconnection promise lock
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error({ error }, 'Error closing MongoDB connection');
    throw error;
  } finally {
    // Reset flag after closing (in case connection is reopened later)
    isIntentionallyClosing = false;
  }
}

/**
 * Check database health by performing a ping
 * Uses a timeout to prevent hanging when connection pool is exhausted
 */
export async function checkDatabaseHealth(timeoutMs: number = 5000): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!db) {
    return { healthy: false, error: 'Database not initialized' };
  }

  // Declare startTime outside try block so it's accessible in catch block
  const startTime = Date.now();

  try {
    // Use Promise.race to timeout the ping if connection pool is exhausted
    const pingPromise = db.command({ ping: 1 });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const poolStatus = getConnectionPoolStatus();
        reject(new Error(
          `Health check timeout after ${timeoutMs}ms. ` +
          `Pool status: ${poolStatus.connected ? 'connected' : 'disconnected'}, ` +
          `Active connections: ${poolStatus.metrics?.activeConnections || 'unknown'}/${poolStatus.maxPoolSize || 'unknown'}`
        ));
      }, timeoutMs);
    });
    
    await Promise.race([pingPromise, timeoutPromise]);
    const latency = (Date.now() - startTime) / 1000; // Convert to seconds
    
    // Update Prometheus metrics (MongoDB-specific)
    mongodbHealthCheckLatency.observe({ status: 'success' }, latency);
    
    // Update generic connection latency metrics
    connectionLatency.observe({ type: 'mongodb', operation: 'health_check' }, latency);
    
    // Update connection state if health check succeeds
    if (!isConnected) {
      notifyConnectionStateChange(true);
    }
    
    return { 
      healthy: true, 
      latency: Math.round(latency * 1000) // Return in milliseconds for consistency
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const latency = (Date.now() - startTime) / 1000; // Track latency even for failures
    
    // Update Prometheus metrics (MongoDB-specific)
    mongodbHealthCheckLatency.observe({ status: 'failure' }, latency);
    
    // Update generic connection latency and error metrics
    connectionLatency.observe({ type: 'mongodb', operation: 'health_check' }, latency);
    const errorType = errorMessage.includes('timeout') ? 'timeout' : 'connection_failed';
    connectionErrors.inc({ type: 'mongodb', error_type: errorType });
    
    // Check if this is a timeout due to pool exhaustion
    const isPoolExhaustion = errorMessage.includes('timeout') || errorMessage.includes('pool');
    
    // Check if this is a transient error that might recover
    if (isTransientError(error) || isPoolExhaustion) {
      logger.warn({ 
        error: errorMessage,
        poolStatus: getConnectionPoolStatus()
      }, 'Database health check failed with transient error or pool exhaustion');
    } else {
      logger.error({ error: errorMessage }, 'Database health check failed with permanent error');
    }
    
    // Don't update connection state for pool exhaustion - it's a capacity issue, not a connection loss
    if (!isPoolExhaustion && isConnected) {
      notifyConnectionStateChange(false);
    }
    
    return { 
      healthy: false, 
      error: errorMessage 
    };
  }
}

/**
 * Get connection pool status with detailed metrics
 * 
 * Note: The `activeConnections` metric is cumulative (total created - total closed)
 * and does not represent the current pool size. MongoDB reuses connections,
 * so the actual pool size is typically between minPoolSize and maxPoolSize.
 * 
 * If activeConnections exceeds maxPoolSize, it indicates cumulative connections
 * created over time, not a current pool issue. The MongoDB driver manages
 * the actual pool size efficiently.
 */
export function getConnectionPoolStatus(): {
  connected: boolean;
  minPoolSize?: number;
  maxPoolSize?: number;
  isReconnecting?: boolean;
  reconnectAttemptCount?: number;
  metrics?: {
    totalConnectionsCreated: number;
    totalConnectionsClosed: number;
    totalCheckouts: number;
    totalCheckins: number;
    totalCheckoutFailures: number;
    activeConnections?: number; // Cumulative: created - closed (NOT current pool size)
    estimatedCurrentPoolSize?: number; // Estimated current pool size (capped at maxPoolSize)
    lastCheckoutFailure?: { timestamp: Date; reason?: string } | null;
    lastConnectionClosed?: Date | null;
    lastConnectionCreated?: Date | null;
  };
} {
  const cumulativeActiveConnections = Math.max(0, 
    connectionPoolMetrics.totalConnectionsCreated - connectionPoolMetrics.totalConnectionsClosed
  );
  
  // Estimate current pool size - MongoDB reuses connections, so actual pool
  // is typically between minPoolSize and maxPoolSize, not the cumulative count
  const maxPool = clientOptions.maxPoolSize || 10;
  const minPool = clientOptions.minPoolSize || 0;
  // The actual pool size is managed by MongoDB driver and is typically
  // close to minPoolSize when idle, up to maxPoolSize under load
  // We cap the estimate at maxPoolSize to avoid confusion
  const estimatedCurrentPoolSize = Math.min(
    Math.max(minPool, cumulativeActiveConnections),
    maxPool
  );
  
  return {
    connected: isConnected,
    minPoolSize: clientOptions.minPoolSize,
    maxPoolSize: clientOptions.maxPoolSize,
    isReconnecting,
    reconnectAttemptCount: isReconnecting ? reconnectAttemptCount : 0,
    metrics: {
      totalConnectionsCreated: connectionPoolMetrics.totalConnectionsCreated,
      totalConnectionsClosed: connectionPoolMetrics.totalConnectionsClosed,
      totalCheckouts: connectionPoolMetrics.totalCheckouts,
      totalCheckins: connectionPoolMetrics.totalCheckins,
      totalCheckoutFailures: connectionPoolMetrics.totalCheckoutFailures,
      activeConnections: cumulativeActiveConnections,
      estimatedCurrentPoolSize,
      lastCheckoutFailure: connectionPoolMetrics.lastCheckoutFailure,
      lastConnectionClosed: connectionPoolMetrics.lastConnectionClosed,
      lastConnectionCreated: connectionPoolMetrics.lastConnectionCreated,
    },
  };
}

/**
 * Get the health check circuit breaker status
 */
export function getHealthCheckCircuitBreakerStatus(): {
  isOpen: boolean;
  consecutiveFailures: number;
  maxFailures: number;
  openedAt: Date | null;
  resetTimeMs: number;
  willResetIn: number | null;
} {
  const isOpen = healthCheckConsecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES;
  const timeSinceOpen = circuitBreakerOpenedAt ? Date.now() - circuitBreakerOpenedAt : 0;
  const willResetIn = isOpen && circuitBreakerOpenedAt 
    ? Math.max(0, CIRCUIT_BREAKER_RESET_TIME - timeSinceOpen) 
    : null;
  
  return {
    isOpen,
    consecutiveFailures: healthCheckConsecutiveFailures,
    maxFailures: CIRCUIT_BREAKER_MAX_FAILURES,
    openedAt: circuitBreakerOpenedAt ? new Date(circuitBreakerOpenedAt) : null,
    resetTimeMs: CIRCUIT_BREAKER_RESET_TIME,
    willResetIn,
  };
}

/**
 * Reset the health check circuit breaker (useful for testing or manual intervention)
 */
export function resetHealthCheckCircuitBreaker(): void {
  healthCheckConsecutiveFailures = 0;
  circuitBreakerOpenedAt = null;
  logger.info('Health check circuit breaker manually reset');
}

/**
 * Reset connection pool metrics (useful for testing or periodic resets)
 */
export function resetConnectionPoolMetrics(): void {
  connectionPoolMetrics = {
    totalConnectionsCreated: 0,
    totalConnectionsClosed: 0,
    totalCheckouts: 0,
    totalCheckins: 0,
    totalCheckoutFailures: 0,
    lastCheckoutFailure: null,
    lastConnectionClosed: null,
    lastConnectionCreated: null,
  };
}

// Note: Graceful shutdown is handled in server/index.ts
// This handler is kept for backward compatibility but should not be used
// as it conflicts with the main graceful shutdown handler
