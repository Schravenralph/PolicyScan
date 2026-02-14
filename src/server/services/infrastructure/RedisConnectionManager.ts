/**
 * RedisConnectionManager
 * 
 * Centralized Redis connection management service.
 * Provides shared Redis connections for all services to prevent connection duplication
 * and standardize error handling.
 * 
 * Features:
 * - Single connection pool shared across all services
 * - Automatic fallback to in-memory mode when Redis is unavailable
 * - Standardized error handling and logging
 * - Connection health monitoring
 * - Graceful degradation
 */

import Redis, { type Redis as RedisType, type RedisOptions } from 'ioredis';
import { logger } from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  keyPrefix?: string;
  db?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: 4 | 6;
}

export interface RedisClientInfo {
  client: RedisType;
  index: number;
  status: 'ready' | 'connecting' | 'reconnecting' | 'end' | 'close';
}

/**
 * Centralized Redis Connection Manager
 * 
 * Manages a shared pool of Redis connections for all services.
 * Prevents connection duplication and standardizes error handling.
 */
export class RedisConnectionManager {
  private static instance: RedisConnectionManager | null = null;
  private clients: RedisType[] = [];
  private config: RedisConnectionConfig;
  private isAvailable: boolean = false;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private connectionStateListeners: Set<(available: boolean) => void> = new Set();
  private healthCheckIntervalId: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private hostnameResolutionFailed: boolean = false;
  private lastConnectionError: Error | null = null;
  private connectionAttempts: number = 0;
  private readonly MAX_CONNECTION_ATTEMPTS = 3;

  private constructor() {
    const env = validateEnv();
    
    this.config = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT,
      commandTimeout: env.REDIS_COMMAND_TIMEOUT,
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
      enableReadyCheck: true,
      enableOfflineQueue: false, // Don't queue commands when offline
      lazyConnect: false, // Connect immediately
      keepAlive: env.REDIS_KEEP_ALIVE,
      family: 4, // Use IPv4
      retryStrategy: (times: number) => {
        // If hostname resolution has failed, stop retrying immediately
        if (this.hostnameResolutionFailed) {
          return null; // Stop retrying
        }
        // Limit retries to prevent infinite loops
        if (times > this.MAX_CONNECTION_ATTEMPTS) {
          return null; // Stop retrying after max attempts
        }
        // Exponential backoff with max delay of 5 seconds
        const delay = Math.min(times * 100, 5000);
        return delay;
      },
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  /**
   * Initialize Redis connection pool
   * Thread-safe: multiple calls return the same promise
   */
  async initialize(poolSize: number = 1): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize(poolSize);
    return this.initializationPromise;
  }

  private async _initialize(poolSize: number): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info({ poolSize, host: this.config.host, port: this.config.port }, 'Initializing Redis connection pool');

      // Create connection pool
      for (let i = 0; i < poolSize; i++) {
        try {
          const client = new (Redis as any)(this.config as RedisOptions);

          // Set up event handlers
          this.setupClientEventHandlers(client, i);

          this.clients.push(client);
        } catch (error) {
          logger.warn({ error, clientIndex: i + 1 }, 'Failed to create Redis client');
        }
      }

      if (this.clients.length === 0) {
        logger.warn('No Redis clients created, using in-memory fallback');
        this.isAvailable = false;
        this.isInitialized = true;
        return;
      }

      // Test connection with first client
      try {
        await this.clients[0].ping();
        this.isAvailable = true;
        logger.info({ poolSize: this.clients.length }, 'Redis connection pool initialized successfully');
        this.startHealthMonitoring();
      } catch (error) {
        logger.warn({ error }, 'Redis ping failed, using in-memory fallback');
        this.isAvailable = false;
      }

      this.isInitialized = true;
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize Redis connection pool, using in-memory fallback');
      this.isAvailable = false;
      this.isInitialized = true;
    }
  }

  /**
   * Set up event handlers for a Redis client
   */
  private setupClientEventHandlers(client: RedisType, index: number): void {
    client.on('error', (error: Error) => {
      this.handleClientError(error, index);
    });

    client.on('connect', () => {
      logger.debug({ clientIndex: index + 1 }, 'Redis client connected');
      this.updateConnectionState();
    });

    client.on('ready', () => {
      logger.debug({ clientIndex: index + 1 }, 'Redis client ready');
      this.updateConnectionState();
    });

    client.on('close', () => {
      logger.debug({ clientIndex: index + 1 }, 'Redis client closed');
      this.updateConnectionState();
    });

    client.on('reconnecting', (delay: number) => {
      logger.debug({ clientIndex: index + 1, delay }, 'Redis client reconnecting');
    });

    client.on('end', () => {
      logger.debug({ clientIndex: index + 1 }, 'Redis client ended');
      this.updateConnectionState();
    });
  }

  /**
   * Handle Redis client errors
   * Standardizes error detection and logging
   */
  private handleClientError(error: Error, clientIndex: number): void {
    const errorMessage = error.message || String(error);
    const errorCode = (error as any).code;
    const errorSyscall = (error as any).syscall;

    // Detect hostname resolution errors
    const isHostnameResolutionError =
      errorMessage.includes('EAI_AGAIN') ||
      errorMessage.includes('getaddrinfo') ||
      errorMessage.includes('ENOTFOUND') ||
      errorCode === 'EAI_AGAIN' ||
      errorSyscall === 'getaddrinfo';

    // Detect connection refused errors
    const isConnectionRefusedError =
      errorMessage.includes('ECONNREFUSED') ||
      errorCode === 'ECONNREFUSED';

    // Detect timeout errors
    const isTimeoutError =
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorCode === 'ETIMEDOUT';

    if (isHostnameResolutionError) {
      // Hostname resolution failed - Redis is not available
      this.hostnameResolutionFailed = true;
      if (this.connectionAttempts === 0) {
        // Log only once on first attempt
        logger.debug(
          { host: this.config.host, port: this.config.port },
          'Redis hostname resolution failed (Redis not available, using in-memory fallback)'
        );
      }
      this.connectionAttempts++;
    } else if (isConnectionRefusedError) {
      // Connection refused - Redis is not available
      if (this.connectionAttempts === 0) {
        // Log only once on first attempt
        logger.debug(
          { host: this.config.host, port: this.config.port },
          'Redis connection refused (Redis not available, using in-memory fallback)'
        );
      }
      this.connectionAttempts++;
    } else if (isTimeoutError) {
      // Timeout - log as warning but don't spam
      if (this.connectionAttempts < 3) {
        logger.warn({ error: errorMessage, clientIndex: clientIndex + 1 }, 'Redis connection timeout');
      }
      this.connectionAttempts++;
    } else {
      // Other errors - log as warning
      logger.warn({ error: errorMessage, clientIndex: clientIndex + 1 }, 'Redis client error');
    }

    this.lastConnectionError = error;
    this.updateConnectionState();
  }

  /**
   * Update connection state and notify listeners
   */
  private updateConnectionState(): void {
    const wasAvailable = this.isAvailable;
    const availableClients = this.clients.filter(
      client => client && (client.status === 'ready' || client.status === 'connect')
    );
    
    this.isAvailable = availableClients.length > 0;

    if (wasAvailable !== this.isAvailable) {
      logger.info(
        { available: this.isAvailable, availableClients: availableClients.length, totalClients: this.clients.length },
        `Redis connection state changed: ${this.isAvailable ? 'available' : 'unavailable'}`
      );
      this.notifyConnectionStateChange(this.isAvailable);
    }
  }

  /**
   * Notify listeners of connection state changes
   */
  private notifyConnectionStateChange(available: boolean): void {
    this.connectionStateListeners.forEach(listener => {
      try {
        listener(available);
      } catch (error) {
        logger.error({ error }, 'Error in Redis connection state listener');
      }
    });
  }

  /**
   * Get a Redis client from the pool (round-robin)
   */
  getClient(): RedisType | null {
    if (!this.isInitialized) {
      logger.warn('RedisConnectionManager not initialized, call initialize() first');
      return null;
    }

    if (this.clients.length === 0) {
      return null;
    }

    // Round-robin selection
    const index = Math.floor(Math.random() * this.clients.length);
    const client = this.clients[index];

    if (client && (client.status === 'ready' || client.status === 'connect')) {
      return client;
    }

    // Try to find any available client
    for (const c of this.clients) {
      if (c && (c.status === 'ready' || c.status === 'connect')) {
        return c;
      }
    }

    return null;
  }

  /**
   * Get all Redis clients
   */
  getClients(): RedisType[] {
    return [...this.clients];
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.isAvailable && this.clients.length > 0;
  }

  /**
   * Get connection state
   */
  getConnectionState(): {
    available: boolean;
    initialized: boolean;
    clientCount: number;
    availableClientCount: number;
    lastError: string | null;
  } {
    const availableClients = this.clients.filter(
      client => client && (client.status === 'ready' || client.status === 'connect')
    );

    return {
      available: this.isAvailable,
      initialized: this.isInitialized,
      clientCount: this.clients.length,
      availableClientCount: availableClients.length,
      lastError: this.lastConnectionError?.message || null,
    };
  }

  /**
   * Add a listener for connection state changes
   */
  onConnectionStateChange(listener: (available: boolean) => void): () => void {
    this.connectionStateListeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  /**
   * Check Redis health
   */
  async checkHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    if (!this.isInitialized) {
      return { healthy: false, error: 'Not initialized' };
    }

    const client = this.getClient();
    if (!client) {
      return { healthy: false, error: 'No available clients' };
    }

    const startTime = Date.now();
    try {
      await client.ping();
      const latency = Date.now() - startTime;
      return { healthy: true, latency };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateConnectionState();
      return { healthy: false, latency, error: errorMessage };
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }

    this.healthCheckIntervalId = setInterval(async () => {
      try {
        const health = await this.checkHealth();
        if (!health.healthy) {
          logger.warn({ error: health.error }, 'Redis health check failed');
        }
      } catch (error) {
        logger.error({ error }, 'Redis health check error');
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  /**
   * Close all Redis connections
   */
  async close(): Promise<void> {
    this.stopHealthMonitoring();
    
    logger.info({ clientCount: this.clients.length }, 'Closing Redis connection pool');

    const closePromises = this.clients.map(async (client, index) => {
      try {
        await client.quit();
        logger.debug({ clientIndex: index + 1 }, 'Redis client closed');
      } catch (error) {
        logger.warn({ error, clientIndex: index + 1 }, 'Error closing Redis client');
        // Force disconnect if quit fails
        try {
          client.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    });

    await Promise.allSettled(closePromises);
    this.clients = [];
    this.isAvailable = false;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.connectionStateListeners.clear();
    
    logger.info('Redis connection pool closed');
  }

  /**
   * Reset connection manager (for testing)
   */
  static reset(): void {
    if (RedisConnectionManager.instance) {
      RedisConnectionManager.instance.close().catch(() => {
        // Ignore errors during reset
      });
      RedisConnectionManager.instance = null;
    }
  }
}

/**
 * Get Redis connection manager singleton
 */
export function getRedisConnectionManager(): RedisConnectionManager {
  return RedisConnectionManager.getInstance();
}

/**
 * Create a Redis client configuration for Bull queues
 * Uses the centralized connection manager's config
 */
export function createRedisConfigForBull(): { host: string; port: number; password?: string } {
  const manager = getRedisConnectionManager();
  const state = manager.getConnectionState();
  
  if (!state.initialized) {
    // Return config that will be used by Bull to create its own connection
    const env = validateEnv();
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    };
  }

  // Note: Bull creates its own Redis connections, so we just return the config
  // The connection manager is used for other services that can share connections
  const env = validateEnv();
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  };
}

