/**
 * Cache Service
 *
 * Provides in-memory caching with LRU eviction and TTL support.
 * Supports distributed caching with Redis for multi-instance deployments.
 * Used to cache scraped HTML pages and document metadata.
 *
 * Thread-safe for concurrent access in Node.js async environment.
 */

import Redis from 'ioredis';
import {
  connectionPoolSize,
  connectionErrors,
  connectionLatency,
} from '../../utils/metrics.js';
import { validateEnv } from '../../config/env.js';

// Redis client type - ioredis exports Redis as a class
// Use any to work around ioredis type export issues
type RedisClient = any;

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/**
 * Analytics data point for time-series tracking
 */
export interface CacheAnalyticsPoint {
    timestamp: number;
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    evictions?: number;
}

/**
 * Analytics query options
 */
export interface CacheAnalyticsQuery {
    startTime?: number; // Unix timestamp in milliseconds
    endTime?: number; // Unix timestamp in milliseconds
    limit?: number; // Maximum number of data points to return
    interval?: 'minute' | 'hour' | 'day'; // Aggregation interval
}

/**
 * Analytics query result
 */
export interface CacheAnalyticsResult {
    cacheName: string;
    points: CacheAnalyticsPoint[];
    summary: {
        totalHits: number;
        totalMisses: number;
        averageHitRate: number;
        peakSize: number;
        totalEvictions: number;
        period: {
            start: number;
            end: number;
        };
    };
}

/**
 * Cache warming strategy
 */
export interface WarmingStrategy {
    algorithm: 'most-frequent' | 'most-recent' | 'scheduled' | 'custom';
    maxItems?: number;
    items?: WarmingItem[];
}

/**
 * Warming trigger configuration
 */
export interface WarmingTriggerConfig {
    type: 'startup' | 'schedule' | 'manual' | 'event';
    schedule?: WarmingSchedule;
}

/**
 * Warming schedule
 */
export interface WarmingSchedule {
    enabled: boolean;
    pattern: string; // Simple interval pattern (e.g., "1h", "30m", "1d") or cron pattern
}

/**
 * Warming item
 */
export interface WarmingItem {
    key: string;
    fetcher: () => Promise<unknown>;
    ttl?: number;
}

/**
 * Warming result
 */
export interface WarmingResult {
    warmed: number;
    failed: number;
    duration: number;
    errors: Array<{ key: string; error: string }>;
    timestamp: Date;
}

/**
 * Warming monitoring data
 */
export interface WarmingMonitoring {
    totalOperations: number;
    totalItemsWarmed: number;
    totalItemsFailed: number;
    averageDuration: number;
    lastResult?: WarmingResult;
    history: WarmingResult[];
}

export class Cache<T = unknown> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private accessOrder: string[] = [];
    private maxSize: number;
    private defaultTTL: number;

    // Hit rate tracking
    private hits: number = 0;
    private misses: number = 0;
    private evictions: number = 0;

    // Analytics tracking (time-series data)
    private analyticsData: CacheAnalyticsPoint[] = [];
    private maxAnalyticsPoints: number = 10000; // Keep last 10k data points (configurable)
    private analyticsEnabled: boolean = true;
    private lastAnalyticsSnapshot: number = Date.now();
    private analyticsSnapshotInterval: number = 60000; // Snapshot every minute
    private cacheName: string = 'default';

    // Mutex for thread-safe operations (using Promise-based lock)
    private lock: Promise<void> = Promise.resolve();

    // Cache warming properties
    private warmingEnabled: boolean = false;
    private warmingStrategy?: WarmingStrategy;
    private warmingTriggers: WarmingTriggerConfig[] = [];
    private warmingMonitoring: WarmingMonitoring = {
        totalOperations: 0,
        totalItemsWarmed: 0,
        totalItemsFailed: 0,
        averageDuration: 0,
        history: [],
    };
    private warmingIntervals: Map<string, NodeJS.Timeout> = new Map();
    private accessFrequency: Map<string, number> = new Map();
    private accessTimestamps: Map<string, number> = new Map();

    // Redis configuration for distributed caching
    private redisClients: RedisClient[] = []; // Connection pool
    private redisPoolSize: number = 1; // Number of connections in pool
    private redisCurrentIndex: number = 0; // Round-robin index
    private redisAvailable: boolean = false;
    private useRedisMode: boolean;
    private redisConnectionMode: 'single' | 'cluster' | 'sentinel';
    private redisHostnameResolutionFailed: boolean = false; // Track if hostname resolution has failed
    private redisConfig: {
        host: string;
        port: number;
        password?: string;
        retryStrategy?: (times: number) => number | null;
        keyPrefix?: string;
        connectTimeout?: number;
        commandTimeout?: number;
        enableReadyCheck?: boolean;
        enableOfflineQueue?: boolean;
        maxRetriesPerRequest?: number;
        lazyConnect?: boolean;
        keepAlive?: number;
        family?: number;
    };
    private redisKeyPrefix: string;
    private connectionStateListeners: Array<(available: boolean) => void> = [];
    private healthCheckIntervalId: NodeJS.Timeout | null = null;
    private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

    constructor(maxSize: number = 1000, defaultTTL: number = 24 * 60 * 60 * 1000, cacheName: string = 'default') {
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL; // Default: 24 hours
        this.cacheName = cacheName;

        // Analytics configuration
        this.analyticsEnabled = process.env.CACHE_ANALYTICS_ENABLED !== 'false'; // Enabled by default
        const maxPoints = parseInt(process.env.CACHE_ANALYTICS_MAX_POINTS || '10000', 10);
        this.maxAnalyticsPoints = maxPoints;
        const interval = parseInt(process.env.CACHE_ANALYTICS_INTERVAL_MS || '60000', 10);
        this.analyticsSnapshotInterval = interval;

        // Redis configuration for distributed caching
        // Enable Redis by default (unless explicitly disabled with CACHE_REDIS_ENABLED=false)
        // This allows Redis to be used when available, with graceful fallback to in-memory
        // Set CACHE_REDIS_ENABLED=false to disable Redis and use only in-memory cache
        this.useRedisMode = process.env.CACHE_REDIS_ENABLED !== 'false';
        this.redisKeyPrefix = `cache:${cacheName}:`;
        const env = validateEnv();
        this.redisConnectionMode = env.REDIS_CONNECTION_MODE;
        this.redisPoolSize = env.REDIS_POOL_SIZE;
        this.redisConfig = {
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            keyPrefix: this.redisKeyPrefix,
            retryStrategy: (times: number) => {
                // If hostname resolution has failed, stop retrying immediately
                // This prevents infinite retry loops when Redis hostname is unresolvable
                if (this.redisHostnameResolutionFailed) {
                    return null; // Stop retrying
                }
                // For other errors, use exponential backoff with max delay of 30 seconds
                // But limit retries to prevent infinite loops
                if (times > 10) {
                    // After 10 retries, give up (this prevents infinite retry loops)
                    return null;
                }
                const delay = Math.min(times * 50, 30000);
                return delay;
            },
            connectTimeout: env.REDIS_CONNECT_TIMEOUT,
            commandTimeout: env.REDIS_COMMAND_TIMEOUT,
            enableReadyCheck: true,
            enableOfflineQueue: false, // Don't queue commands when offline
            maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
            lazyConnect: false, // Connect immediately
            keepAlive: env.REDIS_KEEP_ALIVE,
            family: 4, // Use IPv4
        };

        // Initialize Redis connection if Redis mode is enabled
        if (this.useRedisMode) {
            this.initializeRedis();
        }

        // Initialize analytics snapshot
        if (this.analyticsEnabled) {
            this.recordAnalyticsSnapshot();
        }
    }

    /**
     * Get a Redis client from the pool using round-robin
     */
    private getRedisClient(): RedisClient | null {
        if (this.redisClients.length === 0) {
            return null;
        }
        // Round-robin selection
        const client = this.redisClients[this.redisCurrentIndex];
        this.redisCurrentIndex = (this.redisCurrentIndex + 1) % this.redisClients.length;
        return client;
    }

    /**
     * Update Redis connection pool metrics in Prometheus
     */
    private updateRedisConnectionPoolMetrics(): void {
        const activeConnections = this.redisClients.filter(client => client && client.status === 'ready').length;
        connectionPoolSize.set({ type: 'redis', status: 'max' }, this.redisPoolSize);
        connectionPoolSize.set({ type: 'redis', status: 'current' }, activeConnections);
        connectionPoolSize.set({ type: 'redis', status: 'available' }, this.redisAvailable ? this.redisPoolSize - activeConnections : 0);
    }

    /**
     * Initialize Redis connection pool for distributed caching
     */
    private async initializeRedis(): Promise<void> {
        const connectStartTime = Date.now();
        try {
            // Create connection pool
            this.redisClients = [];
            let successfulConnections = 0;

            for (let i = 0; i < this.redisPoolSize; i++) {
                try {
                    // Create Redis client
                    const client = new (Redis as any)(this.redisConfig) as RedisClient;

                    if (!client) {
                        console.warn(`[Cache:${this.cacheName}] Failed to create Redis client ${i + 1}/${this.redisPoolSize}`);
                        continue;
                    }

                    // Setup event handlers for this client
                    client.on('error', (error: Error) => {
                        // Check if this is a hostname resolution error (expected when Redis is unavailable)
                        const errorMessage = error.message || String(error);
                        const isHostnameResolutionError =
                            errorMessage.includes('EAI_AGAIN') ||
                            errorMessage.includes('getaddrinfo') ||
                            errorMessage.includes('ENOTFOUND') ||
                            (error as any).code === 'EAI_AGAIN' ||
                            (error as any).syscall === 'getaddrinfo';

                        if (isHostnameResolutionError) {
                            // Mark that hostname resolution has failed to stop retry strategy
                            this.redisHostnameResolutionFailed = true;

                            // Hostname resolution errors are expected when Redis is not available
                            // Log only once per client to avoid spam, then suppress
                            if (!this.redisAvailable) {
                                // Only log if we haven't already logged that Redis is unavailable
                                // This prevents spam when multiple clients fail
                                console.debug(
                                    `[Cache:${this.cacheName}] Redis client ${i + 1} hostname resolution failed (Redis not available, using in-memory fallback):`,
                                    errorMessage
                                );
                            }
                            // Don't track these in metrics as they're expected when Redis is unavailable
                            this.checkPoolAvailability();
                            return;
                        }

                        // Track other errors in Prometheus metrics
                        const errorType = errorMessage.includes('timeout') ? 'timeout' :
                                         errorMessage.includes('ECONNREFUSED') ? 'connection_refused' :
                                         'connection_failed';
                        connectionErrors.inc({ type: 'redis', error_type: errorType });

                        console.warn(`[Cache:${this.cacheName}] Redis client ${i + 1} connection error:`, errorMessage);
                        this.checkPoolAvailability();
                    });

                    client.on('connect', () => {
                        console.log(`[Cache:${this.cacheName}] Redis client ${i + 1}/${this.redisPoolSize} connected`);
                        this.checkPoolAvailability();
                    });

                    client.on('close', () => {
                        // Only track connection_closed in metrics if Redis was previously available
                        // This prevents spam when Redis is not available from the start
                        if (this.redisAvailable) {
                            connectionErrors.inc({ type: 'redis', error_type: 'connection_closed' });
                            console.warn(`[Cache:${this.cacheName}] Redis client ${i + 1}/${this.redisPoolSize} connection closed`);
                        } else {
                            // Redis was never available, just update state silently
                            console.debug(`[Cache:${this.cacheName}] Redis client ${i + 1}/${this.redisPoolSize} connection closed (Redis not available)`);
                        }
                        this.checkPoolAvailability();
                    });

                    client.on('ready', () => {
                        const connectLatency = (Date.now() - connectStartTime) / 1000; // Convert to seconds
                        connectionLatency.observe({ type: 'redis', operation: 'connect' }, connectLatency);

                        console.log(`[Cache:${this.cacheName}] Redis client ${i + 1}/${this.redisPoolSize} ready`);
                        successfulConnections++;
                        this.checkPoolAvailability();
                    });

                    this.redisClients.push(client);
                } catch (error) {
                    console.warn(`[Cache:${this.cacheName}] Failed to create Redis client ${i + 1}/${this.redisPoolSize}:`,
                        error instanceof Error ? error.message : String(error));
                }
            }

            if (this.redisClients.length === 0) {
                this.redisAvailable = false;
                connectionErrors.inc({ type: 'redis', error_type: 'initialization_failed' });
                this.updateRedisConnectionPoolMetrics();
                return;
            }

            // Test connection with first client
            const pingStartTime = Date.now();
            await this.redisClients[0].ping();
            const pingLatency = (Date.now() - pingStartTime) / 1000; // Convert to seconds
            connectionLatency.observe({ type: 'redis', operation: 'connect' }, pingLatency);

            this.redisAvailable = successfulConnections > 0;
            this.updateRedisConnectionPoolMetrics();
            if (this.redisAvailable) {
                this.notifyConnectionStateChange(true);
            }

            console.log(`[Cache:${this.cacheName}] Redis connection pool initialized: ${successfulConnections}/${this.redisPoolSize} connections ready`);

            // Start health monitoring
            this.startHealthMonitoring();
        } catch (error) {
            const connectLatency = (Date.now() - connectStartTime) / 1000; // Track latency even for failures
            connectionLatency.observe({ type: 'redis', operation: 'connect' }, connectLatency);

            const errorMessage = error instanceof Error ? error.message : String(error);
            const isHostnameResolutionError =
                errorMessage.includes('EAI_AGAIN') ||
                errorMessage.includes('getaddrinfo') ||
                errorMessage.includes('ENOTFOUND') ||
                (error as any).code === 'EAI_AGAIN' ||
                (error as any).syscall === 'getaddrinfo';

            if (isHostnameResolutionError) {
                // Mark that hostname resolution has failed to stop retry strategy
                this.redisHostnameResolutionFailed = true;

                // Hostname resolution errors are expected when Redis is not available
                console.debug(
                    `[Cache:${this.cacheName}] Redis hostname resolution failed (Redis not available, using in-memory fallback):`,
                    errorMessage
                );
            } else {
                // Track other errors in Prometheus metrics
                const errorType = errorMessage.includes('timeout') ? 'timeout' :
                                 errorMessage.includes('ECONNREFUSED') ? 'connection_refused' :
                                 'connection_failed';
                connectionErrors.inc({ type: 'redis', error_type: errorType });

                console.warn(`[Cache:${this.cacheName}] Failed to initialize Redis connection pool, using in-memory fallback:`,
                    errorMessage);
            }

            this.redisAvailable = false;
            this.redisClients = [];
            this.updateRedisConnectionPoolMetrics();
        }
    }

    /**
     * Check pool availability and update state
     */
    private checkPoolAvailability(): void {
        const availableClients = this.redisClients.filter(client =>
            client && (client.status === 'ready' || client.status === 'connect')
        ).length;

        const wasAvailable = this.redisAvailable;
        this.redisAvailable = availableClients > 0;
        this.updateRedisConnectionPoolMetrics();

        if (wasAvailable !== this.redisAvailable) {
            this.notifyConnectionStateChange(this.redisAvailable);
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
                console.error(`[Cache:${this.cacheName}] Error in Redis connection state listener:`, error);
            }
        });
    }

    /**
     * Add a listener for Redis connection state changes
     */
    public onRedisConnectionStateChange(listener: (available: boolean) => void): () => void {
        this.connectionStateListeners.push(listener);
        // Return unsubscribe function
        return () => {
            this.connectionStateListeners = this.connectionStateListeners.filter(l => l !== listener);
        };
    }

    /**
     * Check Redis connection health
     */
    private async checkRedisHealth(): Promise<boolean> {
        const client = this.getRedisClient();
        if (!client) {
            connectionErrors.inc({ type: 'redis', error_type: 'not_initialized' });
            return false;
        }

        const startTime = Date.now();
        try {
            await client.ping();
            const latency = (Date.now() - startTime) / 1000; // Convert to seconds
            connectionLatency.observe({ type: 'redis', operation: 'health_check' }, latency);

            this.checkPoolAvailability();
            return true;
        } catch (error) {
            const latency = (Date.now() - startTime) / 1000; // Track latency even for failures
            connectionLatency.observe({ type: 'redis', operation: 'health_check' }, latency);

            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorType = errorMessage.includes('timeout') ? 'timeout' :
                             errorMessage.includes('ECONNREFUSED') ? 'connection_refused' :
                             'connection_failed';
            connectionErrors.inc({ type: 'redis', error_type: errorType });

            this.checkPoolAvailability();
            return false;
        }
    }

    /**
     * Start periodic health monitoring for Redis connection
     */
    private startHealthMonitoring(): void {
        // Clear existing interval if any
        if (this.healthCheckIntervalId) {
            clearInterval(this.healthCheckIntervalId);
        }

        // Only start monitoring if Redis mode is enabled
        if (!this.useRedisMode) {
            return;
        }

        this.healthCheckIntervalId = setInterval(async () => {
            if (this.redisClients.length === 0) {
                return;
            }

            try {
                const isHealthy = await this.checkRedisHealth();
                if (!isHealthy) {
                    console.warn(`[Cache:${this.cacheName}] Redis health check failed`);
                }
            } catch (error) {
                console.error(`[Cache:${this.cacheName}] Redis health check error:`, error);
                const wasAvailable = this.redisAvailable;
                this.redisAvailable = false;
                if (wasAvailable) {
                    this.notifyConnectionStateChange(false);
                }
            }
        }, this.HEALTH_CHECK_INTERVAL_MS);
    }

    /**
     * Stop periodic health monitoring
     */
    private stopHealthMonitoring(): void {
        if (this.healthCheckIntervalId) {
            clearInterval(this.healthCheckIntervalId);
            this.healthCheckIntervalId = null;
        }
    }

    /**
     * Check if Redis caching is available
     */
    private isRedisModeAvailable(): boolean {
        return this.useRedisMode && this.redisAvailable && this.redisClients.length > 0;
    }

    /**
     * Get Redis key for a cache key
     */
    private getRedisKey(key: string): string {
        return `${this.redisKeyPrefix}${key}`;
    }

    /**
     * Serialize value for Redis storage (unused - code uses JSON.stringify directly)
     */
    private _serializeValue(value: T): string {
        return JSON.stringify(value);
    }

    /**
     * Deserialize value from Redis storage (unused - code uses JSON.parse directly)
     */
    private _deserializeValue(serialized: string): T {
        return JSON.parse(serialized) as T;
    }

    /**
     * Acquire lock for thread-safe operation
     */
    private async acquireLock(): Promise<() => void> {
        let releaseLock: () => void;
        const previousLock = this.lock;
        this.lock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });
        await previousLock;
        return releaseLock!;
    }

    /**
     * Get a value from cache (thread-safe)
     * Uses Redis if available, otherwise falls back to in-memory cache
     */
    async get(key: string): Promise<T | undefined> {
        // Try Redis first if available
        if (this.isRedisModeAvailable()) {
            try {
                const client = this.getRedisClient();
                if (!client) {
                    return this.getFromMemory(key);
                }

                const redisKey = this.getRedisKey(key);
                const serialized = await client.get(redisKey);

                if (serialized === null) {
                    this.misses++;
                    // Also check in-memory cache as fallback
                    return this.getFromMemory(key);
                }

                // Parse the cached entry
                const entry: CacheEntry<T> = JSON.parse(serialized);

                // Check if expired
                if (Date.now() > entry.expiresAt) {
                    // Delete from both Redis and memory
                    await client.del(redisKey);
                    this.deleteFromMemory(key);
                    this.misses++;
                    return undefined;
                }

                // Update access order in memory (for LRU tracking)
                this.updateAccessOrder(key);
                this.hits++;
                this.trackAccess(key);

                // Also update in-memory cache for faster subsequent access
                this.cache.set(key, entry);

                return entry.value;
            } catch (error) {
                // Fall back to in-memory if Redis fails
                console.warn(`[Cache:${this.cacheName}] Redis get failed for key ${key}, falling back to in-memory:`,
                    error instanceof Error ? error.message : String(error));
                this.redisAvailable = false;
                return this.getFromMemory(key);
            }
        }

        // Fall back to in-memory cache
        return this.getFromMemory(key);
    }

    /**
     * Get a value from in-memory cache (internal helper)
     */
    private async getFromMemory(key: string): Promise<T | undefined> {
        const releaseLock = await this.acquireLock();
        try {
            const entry = this.cache.get(key);

            if (!entry) {
                this.misses++;
                return undefined;
            }

            // Check if expired
            if (Date.now() > entry.expiresAt) {
                this.deleteFromMemory(key);
                this.misses++;
                return undefined;
            }

            // Update access order (LRU)
            this.updateAccessOrder(key);
            this.hits++;
            this.trackAccess(key);

            return entry.value;
        } finally {
            releaseLock();
        }
    }

    /**
     * Synchronous get (for backward compatibility, not thread-safe)
     * Use async get() for thread-safe access
     */
    getSync(key: string): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }

            // Check if expired
            if (Date.now() > entry.expiresAt) {
                this.deleteFromMemory(key);
                this.misses++;
                return undefined;
            }

        // Update access order (LRU)
        this.updateAccessOrder(key);
        this.hits++;
        this.trackAccess(key);

        return entry.value;
    }

    /**
     * Get multiple values from cache (thread-safe)
     * Uses Redis MGET if available, checking in-memory cache (L1) first
     */
    async mget(keys: string[]): Promise<(T | undefined)[]> {
        if (keys.length === 0) return [];

        const results: (T | undefined)[] = new Array(keys.length).fill(undefined);
        const missingIndices: number[] = [];
        const missingKeys: string[] = [];

        // 1. Check in-memory cache first (L1)
        const releaseLock = await this.acquireLock();
        try {
            const now = Date.now();
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const entry = this.cache.get(key);

                if (entry && now <= entry.expiresAt) {
                    this.hits++;
                    this.updateAccessOrder(key);
                    this.trackAccess(key);
                    results[i] = entry.value;
                } else {
                    if (entry) {
                        // Expired
                        this.deleteFromMemory(key);
                    }
                    // Mark for L2 lookup
                    missingIndices.push(i);
                    missingKeys.push(key);
                }
            }
        } finally {
            releaseLock();
        }

        // 2. Check Redis for missing keys (L2)
        if (missingKeys.length > 0) {
            if (this.isRedisModeAvailable()) {
                try {
                    const client = this.getRedisClient();
                    if (client) {
                        const redisKeys = missingKeys.map(k => this.getRedisKey(k));
                        const serializedValues = await client.mget(redisKeys);
                        const now = Date.now();
                        const expiredKeys: string[] = [];

                        for (let i = 0; i < serializedValues.length; i++) {
                            const serialized = serializedValues[i];
                            const originalIndex = missingIndices[i];
                            const originalKey = missingKeys[i];

                            if (serialized === null) {
                                this.misses++; // Truly missing
                                // results[originalIndex] is already undefined
                            } else {
                                const entry: CacheEntry<T> = JSON.parse(serialized);

                                if (now > entry.expiresAt) {
                                    expiredKeys.push(this.getRedisKey(originalKey));
                                    this.deleteFromMemory(originalKey); // Just in case
                                    this.misses++;
                                } else {
                                    this.hits++; // Hit in L2
                                    results[originalIndex] = entry.value;

                                    // Populate L1 cache (fire and forget)
                                    this.setInMemory(originalKey, entry.value, entry.expiresAt - now).catch(() => {});
                                }
                            }
                        }

                        if (expiredKeys.length > 0) {
                            client.del(...expiredKeys).catch(() => {});
                        }
                    } else {
                        // Redis client unavailable, count as misses
                        this.misses += missingKeys.length;
                    }
                } catch (error) {
                    console.warn(`[Cache:${this.cacheName}] Redis mget failed:`,
                        error instanceof Error ? error.message : String(error));
                    this.redisAvailable = false;
                    this.misses += missingKeys.length;
                }
            } else {
                // Redis mode not available or disabled, count as misses
                this.misses += missingKeys.length;
            }
        }

        return results;
    }

    /**
     * Set a value in cache (thread-safe)
     * Uses Redis if available, otherwise falls back to in-memory cache
     */
    async set(key: string, value: T, ttl?: number): Promise<void> {
        const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
        const entry: CacheEntry<T> = { value, expiresAt };
        const ttlSeconds = Math.floor((ttl ?? this.defaultTTL) / 1000);

        // Try Redis first if available
        if (this.isRedisModeAvailable()) {
            try {
                const client = this.getRedisClient();
                if (!client) {
                    await this.setInMemory(key, value, ttl);
                    return;
                }

                const redisKey = this.getRedisKey(key);
                const serialized = JSON.stringify(entry);

                // Set in Redis with TTL
                await client.setex(redisKey, ttlSeconds, serialized);

                // Also update in-memory cache for faster subsequent access
                await this.setInMemory(key, value, ttl);

                // Record snapshot if needed
                if (this.shouldRecordSnapshot()) {
                    this.recordAnalyticsSnapshot();
                }
                return;
            } catch (error) {
                // Fall back to in-memory if Redis fails
                console.warn(`[Cache:${this.cacheName}] Redis set failed for key ${key}, falling back to in-memory:`,
                    error instanceof Error ? error.message : String(error));
                this.redisAvailable = false;
            }
        }

        // Fall back to in-memory cache
        await this.setInMemory(key, value, ttl);
    }

    /**
     * Set a value in in-memory cache (internal helper)
     */
    private async setInMemory(key: string, value: T, ttl?: number): Promise<void> {
        const releaseLock = await this.acquireLock();
        try {
            const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

            // Evict if at capacity
            if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
                await this.evictLRU();
            }

            this.cache.set(key, { value, expiresAt });
            this.updateAccessOrder(key);

            // Record snapshot if needed
            if (this.shouldRecordSnapshot()) {
                this.recordAnalyticsSnapshot();
            }
        } finally {
            releaseLock();
        }
    }

    /**
     * Synchronous set (for backward compatibility, not thread-safe)
     * Use async set() for thread-safe access
     */
    setSync(key: string, value: T, ttl?: number): void {
        const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

        // Evict if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            // For sync method, use synchronous deletion from memory only
            if (this.accessOrder.length > 0) {
                const lruKey = this.accessOrder[0];
                const deleted = this.deleteFromMemory(lruKey);
                // Only increment eviction counter if deletion actually succeeded
                if (deleted) {
                    this.evictions++;
                }
            }
        }

        this.cache.set(key, { value, expiresAt });
        this.updateAccessOrder(key);
        this.trackAccess(key);
    }

    /**
     * Delete a value from cache
     * Removes from both Redis and in-memory cache
     */
    async delete(key: string): Promise<boolean> {
        let removed = false;

        // Delete from Redis if available
        if (this.isRedisModeAvailable()) {
            try {
                const client = this.getRedisClient();
                if (client) {
                    const redisKey = this.getRedisKey(key);
                    const deleted = await client.del(redisKey);
                    removed = deleted > 0 || removed;
                }
            } catch (error) {
                console.warn(`[Cache:${this.cacheName}] Redis delete failed for key ${key}:`,
                    error instanceof Error ? error.message : String(error));
                this.redisAvailable = false;
            }
        }

        // Also delete from in-memory cache
        const memoryRemoved = this.deleteFromMemory(key);
        return removed || memoryRemoved;
    }

    /**
     * Delete a value from in-memory cache (internal helper)
     */
    private deleteFromMemory(key: string): boolean {
        const removed = this.cache.delete(key);

        if (removed) {
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        }

        return removed;
    }

    /**
     * Check if key exists (and is not expired)
     * Synchronous version for backward compatibility (only checks in-memory)
     */
    has(key: string): boolean {
        return this.getSync(key) !== undefined;
    }

    /**
     * Delete keys matching a pattern
     * Uses SCAN for Redis to avoid blocking, and iterates keys for in-memory
     * @param pattern - Pattern to match (e.g. "prefix*")
     * @param skipMemory - If true, skip deleting from in-memory cache (useful when clearing all)
     * @returns Number of keys deleted
     */
    async deleteByPattern(pattern: string, skipMemory: boolean = false): Promise<number> {
        const deletedKeys = new Set<string>();

        // Delete from Redis if available
        if (this.isRedisModeAvailable()) {
            try {
                const client = this.getRedisClient();
                if (client) {
                    const redisPattern = `${this.redisKeyPrefix}${pattern}`;
                    const stream = client.scanStream({
                        match: redisPattern,
                        count: 100 // Batch size
                    });

                    // Process keys in chunks to avoid memory issues with large result sets
                    let keysBuffer: string[] = [];
                    const BATCH_SIZE = 1000;

                    const processBatch = async (batch: string[]) => {
                        if (batch.length === 0) return;

                        await client.del(...batch);

                        // Track deleted keys (stripping prefix)
                        for (const redisKey of batch) {
                            if (redisKey.startsWith(this.redisKeyPrefix)) {
                                deletedKeys.add(redisKey.slice(this.redisKeyPrefix.length));
                            } else {
                                deletedKeys.add(redisKey);
                            }
                        }
                    };

                    for await (const keys of stream) {
                        if (Array.isArray(keys) && keys.length > 0) {
                            keysBuffer.push(...keys);
                        } else if (typeof keys === 'string') {
                             keysBuffer.push(keys);
                        }

                        // Process buffer if it exceeds batch size
                        while (keysBuffer.length >= BATCH_SIZE) {
                            const batch = keysBuffer.slice(0, BATCH_SIZE);
                            keysBuffer = keysBuffer.slice(BATCH_SIZE);
                            await processBatch(batch);
                        }
                    }

                    // Process remaining keys
                    if (keysBuffer.length > 0) {
                        await processBatch(keysBuffer);
                    }
                }
            } catch (error) {
                console.warn(`[Cache:${this.cacheName}] Redis deleteByPattern failed for pattern ${pattern}:`,
                    error instanceof Error ? error.message : String(error));
                this.checkPoolAvailability();
            }
        }

        // Delete from in-memory cache
        if (!skipMemory) {
            // Handle simple wildcard matching
            const isPrefixMatch = pattern.endsWith('*');
            const prefix = isPrefixMatch ? pattern.slice(0, -1) : pattern;

            // Iterate all keys and check match
            // Note: For large in-memory caches, this iteration might be slow, but maxSize is typically small (1000)
            for (const key of this.cache.keys()) {
                 let match = false;
                 if (isPrefixMatch) {
                     if (key.startsWith(prefix)) match = true;
                 } else {
                     if (key === pattern) match = true;
                 }

                 if (match) {
                     if (this.deleteFromMemory(key)) {
                         deletedKeys.add(key);
                     }
                 }
            }
        }

        return deletedKeys.size;
    }

    /**
     * Clear all cache entries
     * Clears both Redis and in-memory cache
     */
    async clear(): Promise<void> {
        // Clear Redis cache using SCAN (via deleteByPattern)
        if (this.isRedisModeAvailable()) {
             await this.deleteByPattern('*', true);
        }

        // Clear in-memory cache efficiently
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * Get cache statistics including memory usage
     */
    getStats(): {
        size: number;
        maxSize: number;
        hits: number;
        misses: number;
        hitRate?: number;
        evictions: number;
        memoryUsage?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
    } {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : undefined;

        const stats: ReturnType<typeof this.getStats> = {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: hitRate !== undefined ? Number(hitRate.toFixed(4)) : undefined,
            evictions: this.evictions
        };

        // Add memory usage if available
        try {
            const memUsage = process.memoryUsage();
            stats.memoryUsage = {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                rss: memUsage.rss
            };
        } catch (error) {
            // Memory usage might not be available in all environments
        }

        return stats;
    }

    /**
     * Reset hit rate statistics
     */
    resetStats(): void {
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        if (this.analyticsEnabled) {
            this.analyticsData = [];
            this.recordAnalyticsSnapshot();
        }
    }

    /**
     * Record an analytics snapshot
     */
    private recordAnalyticsSnapshot(): void {
        if (!this.analyticsEnabled) {
            return;
        }

        const now = Date.now();
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : 0;

        const point: CacheAnalyticsPoint = {
            timestamp: now,
            hits: this.hits,
            misses: this.misses,
            hitRate: Number(hitRate.toFixed(4)),
            size: this.cache.size,
            evictions: this.evictions,
        };

        this.analyticsData.push(point);

        // Trim analytics data if it exceeds max points
        if (this.analyticsData.length > this.maxAnalyticsPoints) {
            this.analyticsData.shift(); // Remove oldest point
        }

        this.lastAnalyticsSnapshot = now;
    }

    /**
     * Check if analytics snapshot should be recorded
     */
    private shouldRecordSnapshot(): boolean {
        if (!this.analyticsEnabled) {
            return false;
        }
        const now = Date.now();
        return now - this.lastAnalyticsSnapshot >= this.analyticsSnapshotInterval;
    }

    /**
     * Get analytics data with optional filtering and aggregation
     */
    getAnalytics(query?: CacheAnalyticsQuery): CacheAnalyticsResult {
        let points = [...this.analyticsData];

        // Filter by time range
        if (query?.startTime) {
            points = points.filter(p => p.timestamp >= query.startTime!);
        }
        if (query?.endTime) {
            points = points.filter(p => p.timestamp <= query.endTime!);
        }

        // Aggregate by interval if specified
        if (query?.interval && points.length > 0) {
            points = this.aggregateByInterval(points, query.interval);
        }

        // Apply limit
        if (query?.limit && points.length > query.limit) {
            // Take the most recent points
            points = points.slice(-query.limit);
        }

        // Calculate summary
        const summary = this.calculateAnalyticsSummary(points);

        return {
            cacheName: this.cacheName,
            points,
            summary,
        };
    }

    /**
     * Aggregate analytics points by interval
     */
    private aggregateByInterval(points: CacheAnalyticsPoint[], interval: 'minute' | 'hour' | 'day'): CacheAnalyticsPoint[] {
        if (points.length === 0) {
            return [];
        }

        const intervalMs = {
            minute: 60 * 1000,
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000,
        }[interval];

        const aggregated = new Map<number, {
            hits: number;
            misses: number;
            size: number;
            evictions: number;
            count: number;
        }>();

        for (const point of points) {
            const bucket = Math.floor(point.timestamp / intervalMs) * intervalMs;
            const existing = aggregated.get(bucket) || { hits: 0, misses: 0, size: 0, evictions: 0, count: 0 };

            aggregated.set(bucket, {
                hits: existing.hits + point.hits,
                misses: existing.misses + point.misses,
                size: Math.max(existing.size, point.size), // Peak size in interval
                evictions: existing.evictions + (point.evictions || 0),
                count: existing.count + 1,
            });
        }

        const entries = Array.from(aggregated.entries());
        return entries
            .map(([timestamp, data]) => {
                const total = data.hits + data.misses;
                const hitRate = total > 0 ? data.hits / total : 0;

                return {
                    timestamp,
                    hits: data.hits,
                    misses: data.misses,
                    hitRate: Number(hitRate.toFixed(4)),
                    size: data.size,
                    evictions: data.evictions,
                };
            })
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calculate summary statistics from analytics points
     */
    private calculateAnalyticsSummary(points: CacheAnalyticsPoint[]): CacheAnalyticsResult['summary'] {
        if (points.length === 0) {
            return {
                totalHits: 0,
                totalMisses: 0,
                averageHitRate: 0,
                peakSize: 0,
                totalEvictions: 0,
                period: {
                    start: Date.now(),
                    end: Date.now(),
                },
            };
        }

        let totalHits = 0;
        let totalMisses = 0;
        let peakSize = 0;
        let totalEvictions = 0;

        for (const point of points) {
            totalHits += point.hits;
            totalMisses += point.misses;
            peakSize = Math.max(peakSize, point.size);
            totalEvictions += point.evictions || 0;
        }

        const total = totalHits + totalMisses;
        const averageHitRate = total > 0 ? totalHits / total : 0;

        return {
            totalHits,
            totalMisses,
            averageHitRate: Number(averageHitRate.toFixed(4)),
            peakSize,
            totalEvictions,
            period: {
                start: points[0].timestamp,
                end: points[points.length - 1].timestamp,
            },
        };
    }

    /**
     * Clear analytics data
     */
    clearAnalytics(): void {
        this.analyticsData = [];
        if (this.analyticsEnabled) {
            this.recordAnalyticsSnapshot();
        }
    }

    /**
     * Update access order for LRU
     */
    private updateAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);

        if (index > -1) {
            // Move to end (most recently used)
            this.accessOrder.splice(index, 1);
        }

        this.accessOrder.push(key);
    }

    /**
     * Evict least recently used entry
     */
    private async evictLRU(): Promise<void> {
        if (this.accessOrder.length > 0) {
            const lruKey = this.accessOrder[0];
            const deleted = await this.delete(lruKey);
            // Only increment eviction counter if deletion actually succeeded
            if (deleted) {
                this.evictions++;

                // Record snapshot if needed
                if (this.shouldRecordSnapshot()) {
                    this.recordAnalyticsSnapshot();
                }
            }
        }
    }

    /**
     * Clean up expired entries
     * Cleans both Redis and in-memory cache
     */
    async cleanExpired(): Promise<number> {
        const now = Date.now();
        let count = 0;

        // Clean Redis cache if available
        if (this.isRedisModeAvailable()) {
            try {
                const client = this.getRedisClient();
                if (client) {
                    const pattern = `${this.redisKeyPrefix}*`;
                    const keys = await client.keys(pattern);

                    for (const redisKey of keys) {
                        const serialized = await client.get(redisKey);
                        if (serialized) {
                            const entry: CacheEntry<T> = JSON.parse(serialized);
                            if (now > entry.expiresAt) {
                                await client.del(redisKey);
                                count++;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`[Cache:${this.cacheName}] Redis cleanExpired failed:`,
                    error instanceof Error ? error.message : String(error));
                this.checkPoolAvailability();
            }
        }

        // Clean in-memory cache
        const entries = Array.from(this.cache.entries());
        for (const [key, entry] of entries) {
            if (now > entry.expiresAt) {
                const deleted = this.deleteFromMemory(key);
                if (deleted) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Synchronize cache state across instances
     * This method can be called periodically to sync in-memory cache with Redis
     */
    async synchronizeCache(): Promise<void> {
        if (!this.isRedisModeAvailable()) {
            return;
        }

        try {
            const client = this.getRedisClient();
            if (!client) {
                return;
            }

            const pattern = `${this.redisKeyPrefix}*`;
            const keys = await client.keys(pattern);

            // Update in-memory cache with Redis values
            for (const redisKey of keys) {
                const serialized = await client.get(redisKey);
                if (serialized) {
                    const entry: CacheEntry<T> = JSON.parse(serialized);
                    const key = redisKey.replace(this.redisKeyPrefix, '');

                    // Only update if not expired
                    if (Date.now() <= entry.expiresAt) {
                        this.cache.set(key, entry);
                        this.updateAccessOrder(key);
                    }
                }
            }
        } catch (error) {
            console.warn(`[Cache:${this.cacheName}] Cache synchronization failed:`,
                error instanceof Error ? error.message : String(error));
            this.redisAvailable = false;
        }
    }

    /**
     * Close Redis connection pool (for cleanup)
     */
    async close(): Promise<void> {
        // Stop health monitoring
        this.stopHealthMonitoring();

        // Close all clients in the pool
        const closePromises = this.redisClients.map(async (client, index) => {
            if (!client) {
                return;
            }
            try {
                // Disconnect gracefully, allowing pending commands to complete
                await client.quit();
            } catch (error) {
                // If quit fails, force disconnect
                try {
                    client.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors
                    console.warn(`[Cache:${this.cacheName}] Error disconnecting Redis client ${index + 1}:`,
                        disconnectError instanceof Error ? disconnectError.message : String(disconnectError));
                }
            }
        });

        await Promise.allSettled(closePromises);

        this.redisClients = [];
        const wasAvailable = this.redisAvailable;
        this.redisAvailable = false;
        this.updateRedisConnectionPoolMetrics();
        if (wasAvailable) {
            this.notifyConnectionStateChange(false);
        }
    }

    /**
     * Get cache status including Redis connection status
     */
    getStatus(): {
        redisEnabled: boolean;
        redisAvailable: boolean;
        memorySize: number;
        maxSize: number;
    } {
        return {
            redisEnabled: this.useRedisMode,
            redisAvailable: this.redisAvailable,
            memorySize: this.cache.size,
            maxSize: this.maxSize,
        };
    }

    /**
     * Track access for warming algorithms
     */
    private trackAccess(key: string): void {
        if (!this.warmingEnabled) return;

        // Track access frequency
        const currentFreq = this.accessFrequency.get(key) || 0;
        this.accessFrequency.set(key, currentFreq + 1);

        // Track access timestamp
        this.accessTimestamps.set(key, Date.now());
    }

    /**
     * Configure cache warming
     */
    configureWarming(strategy: WarmingStrategy, triggers: WarmingTriggerConfig[]): void {
        this.warmingStrategy = strategy;
        this.warmingTriggers = triggers;
        this.warmingEnabled = true;

        // Setup triggers
        this.setupWarmingTriggers();
    }

    /**
     * Setup warming triggers
     */
    private setupWarmingTriggers(): void {
        // Clear existing intervals
        this.warmingIntervals.forEach((interval) => clearInterval(interval));
        this.warmingIntervals.clear();

        for (const trigger of this.warmingTriggers) {
            if (trigger.type === 'startup') {
                // Warm on startup (async, don't block)
                setImmediate(() => this.warm().catch((err) => {
                    console.error(`Cache warming failed on startup for ${this.cacheName}:`, err);
                }));
            } else if (trigger.type === 'schedule' && trigger.schedule?.enabled) {
                // Schedule-based warming (simplified - using setInterval for now)
                // In production, consider using a proper cron library like node-cron
                this.setupScheduledWarming(trigger.schedule);
            }
            // 'manual' and 'event' triggers are handled via public methods
        }
    }

    /**
     * Setup scheduled warming (simplified implementation)
     * Note: For production, consider using node-cron for proper cron pattern parsing
     */
    private setupScheduledWarming(schedule: WarmingSchedule): void {
        // Parse simple schedule patterns
        // For now, support simple intervals (e.g., "1h", "30m", "1d")
        // Full cron support would require node-cron library
        const interval = this.parseScheduleInterval(schedule.pattern);

        if (interval > 0) {
            const intervalId = setInterval(() => {
                this.warm().catch((err) => {
                    console.error(`Scheduled cache warming failed for ${this.cacheName}:`, err);
                });
            }, interval);

            this.warmingIntervals.set(schedule.pattern, intervalId);
            intervalId.unref(); // Don't keep process alive
        }
    }

    /**
     * Parse schedule interval from pattern
     * Supports: "1h", "30m", "1d", "1w" or milliseconds
     */
    private parseScheduleInterval(pattern: string): number {
        // Try to parse as cron pattern - for now, support simple intervals
        const intervalMatch = pattern.match(/^(\d+)([hmsdw])?$/i);
        if (intervalMatch) {
            const value = parseInt(intervalMatch[1], 10);
            const unit = intervalMatch[2]?.toLowerCase() || 'ms';

            switch (unit) {
                case 's': return value * 1000;
                case 'm': return value * 60 * 1000;
                case 'h': return value * 60 * 60 * 1000;
                case 'd': return value * 24 * 60 * 60 * 1000;
                case 'w': return value * 7 * 24 * 60 * 60 * 1000;
                default: return value; // Assume milliseconds
            }
        }

        // Try to parse as milliseconds
        const ms = parseInt(pattern, 10);
        return isNaN(ms) ? 0 : ms;
    }

    /**
     * Warm the cache based on configured strategy
     */
    async warm(): Promise<WarmingResult> {
        if (!this.warmingEnabled || !this.warmingStrategy) {
            throw new Error('Cache warming not configured');
        }

        const startTime = Date.now();
        const result: WarmingResult = {
            warmed: 0,
            failed: 0,
            duration: 0,
            errors: [],
            timestamp: new Date(),
        };

        try {
            const itemsToWarm = await this.selectItemsToWarm();

            // Warm items in parallel (with concurrency limit)
            const concurrency = 5;
            const batches: WarmingItem[][] = [];
            for (let i = 0; i < itemsToWarm.length; i += concurrency) {
                batches.push(itemsToWarm.slice(i, i + concurrency));
            }

            for (const batch of batches) {
                await Promise.allSettled(
                    batch.map(async (item) => {
                        try {
                            const value = await item.fetcher();
                            await this.set(item.key, value as T, item.ttl);
                            result.warmed++;
                        } catch (error) {
                            result.failed++;
                            result.errors.push({
                                key: item.key,
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    })
                );
            }
        } catch (error) {
            result.errors.push({
                key: 'warming-operation',
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            result.duration = Date.now() - startTime;

            // Update monitoring
            this.updateWarmingMonitoring(result);
        }

        return result;
    }

    /**
     * Select items to warm based on strategy algorithm
     */
    private async selectItemsToWarm(): Promise<WarmingItem[]> {
        if (!this.warmingStrategy) return [];

        const maxItems = this.warmingStrategy.maxItems || 100;

        switch (this.warmingStrategy.algorithm) {
            case 'most-frequent':
                return this.selectMostFrequentItems(maxItems);
            case 'most-recent':
                return this.selectMostRecentItems(maxItems);
            case 'scheduled':
            case 'custom':
                return this.warmingStrategy.items || [];
            default:
                return [];
        }
    }

    /**
     * Select most frequently accessed items
     */
    private selectMostFrequentItems(maxItems: number): WarmingItem[] {
        // Sort by frequency (descending)
        const sorted = Array.from(this.accessFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxItems);

        // Return as warming items (without fetchers - these would need to be provided)
        // This is a limitation - we need fetchers to warm items
        // In practice, warming items should be pre-configured with fetchers
        return sorted.map(([key]) => ({
            key,
            fetcher: async () => {
                throw new Error(`No fetcher configured for key: ${key}`);
            },
        }));
    }

    /**
     * Select most recently accessed items
     */
    private selectMostRecentItems(maxItems: number): WarmingItem[] {
        // Sort by timestamp (descending)
        const sorted = Array.from(this.accessTimestamps.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxItems);

        // Return as warming items (without fetchers - these would need to be provided)
        return sorted.map(([key]) => ({
            key,
            fetcher: async () => {
                throw new Error(`No fetcher configured for key: ${key}`);
            },
        }));
    }

    /**
     * Manually trigger cache warming
     */
    async warmManually(): Promise<WarmingResult> {
        return this.warm();
    }

    /**
     * Update warming monitoring data
     */
    private updateWarmingMonitoring(result: WarmingResult): void {
        this.warmingMonitoring.totalOperations++;
        this.warmingMonitoring.totalItemsWarmed += result.warmed;
        this.warmingMonitoring.totalItemsFailed += result.failed;

        // Update average duration
        const totalDuration = this.warmingMonitoring.averageDuration * (this.warmingMonitoring.totalOperations - 1) + result.duration;
        this.warmingMonitoring.averageDuration = totalDuration / this.warmingMonitoring.totalOperations;

        // Update last result
        this.warmingMonitoring.lastResult = result;

        // Add to history (keep last 100)
        this.warmingMonitoring.history.push(result);
        if (this.warmingMonitoring.history.length > 100) {
            this.warmingMonitoring.history.shift();
        }
    }

    /**
     * Get warming monitoring data
     */
    getWarmingMonitoring(): WarmingMonitoring {
        return { ...this.warmingMonitoring };
    }

    /**
     * Disable cache warming
     */
    disableWarming(): void {
        this.warmingEnabled = false;
        this.warmingIntervals.forEach((interval) => clearInterval(interval));
        this.warmingIntervals.clear();
    }

}

// Singleton instances for different cache types
export const htmlCache = new Cache<string>(500, 24 * 60 * 60 * 1000, 'html'); // 500 pages, 24h TTL
export const metadataCache = new Cache<Record<string, unknown>>(1000, 7 * 24 * 60 * 60 * 1000, 'metadata'); // 1000 items, 7 days TTL

// Periodic cleanup (every hour)
let cacheCleanupIntervalId: NodeJS.Timeout | null = null;

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    // Only start cleanup interval in non-test environments
    cacheCleanupIntervalId = setInterval(async () => {
        const htmlCleaned = await htmlCache.cleanExpired();
        const metaCleaned = await metadataCache.cleanExpired();

        if (htmlCleaned > 0 || metaCleaned > 0) {
            console.log(`🧹 Cache cleanup: ${htmlCleaned} HTML, ${metaCleaned} metadata entries removed`);
        }
    }, 60 * 60 * 1000);
    cacheCleanupIntervalId.unref();
}

/**
 * Clean up cache intervals (for testing)
 */
export function destroyCacheIntervals(): void {
    if (cacheCleanupIntervalId) {
        clearInterval(cacheCleanupIntervalId);
        cacheCleanupIntervalId = null;
    }
}

/**
 * Add a listener for Redis connection state changes
 * This is a module-level export function that delegates to the primary cache instance
 * Since all cache instances share the same Redis connection pool, listening to one is sufficient
 *
 * @param listener - Callback function that receives the connection state (true = available, false = unavailable)
 * @returns Unsubscribe function to remove the listener
 */
export function onRedisConnectionStateChange(listener: (available: boolean) => void): () => void {
    return htmlCache.onRedisConnectionStateChange(listener);
}
