/**
 * Rate Limiter Service
 * 
 * Provides per-domain rate limiting to prevent overwhelming servers
 * and respect robots.txt policies.
 * Supports distributed rate limiting with Redis for multi-instance deployments.
 */

import { robotsTxtParser, RobotsTxtParser } from '../scraping/robotsTxtParser.js';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { validateEnv } from '../../config/env.js';

interface RateLimitConfig {
    requestsPerSecond: number;
    burstSize?: number;
    maxConcurrent?: number; // Maximum concurrent requests per domain
    minRequestsPerSecond?: number; // Minimum safe rate
    maxRequestsPerSecond?: number; // Maximum allowed rate
}

interface DomainMetrics {
    successfulRequests: number;
    failedRequests: number;
    errorRate: number; // 0-1, percentage of errors
    averageResponseTime: number;
    lastErrorTime?: number;
    consecutiveErrors: number;
    lastAdjustmentTime: number;
    currentRate: number;
}

interface RequestResult {
    url: string;
    success: boolean;
    statusCode?: number;
    responseTime?: number;
    error?: Error;
}

interface QueuedRequest {
    url: string;
    resolve: (value: void) => void;
    reject: (error: Error) => void;
    timestamp: number;
    timeoutId?: NodeJS.Timeout; // Timeout to prevent requests from hanging forever
}

export class RateLimiter {
    private domainQueues: Map<string, QueuedRequest[]> = new Map();
    private domainLastRequest: Map<string, number> = new Map();
    private domainIntervals: Map<string, NodeJS.Timeout | null> = new Map();
    private domainActiveRequests: Map<string, Set<string>> = new Map(); // Track active requests by URL
    private domainMetrics: Map<string, DomainMetrics> = new Map(); // Adaptive rate limiting metrics
    private robotsParser: RobotsTxtParser;
    private userAgent: string;

    // Redis configuration for distributed rate limiting
    private redisClient: RedisType | null = null;
    private redisAvailable: boolean = false;
    private useDistributedMode: boolean;
    private redisConfig: {
        host: string;
        port: number;
        password?: string;
        retryStrategy?: (times: number) => number | null;
    };

    // Adaptive rate limiting configuration
    private readonly ADAPTIVE_ENABLED = true;
    private readonly ERROR_BACKOFF_MULTIPLIER = 1.5; // Increase delay by 50% on errors
    private readonly SUCCESS_BOOST_MULTIPLIER = 0.95; // Decrease delay by 5% on success (gradual increase)
    private readonly MIN_RATE_REDUCTION = 0.5; // Minimum rate reduction factor
    private readonly MAX_RATE_INCREASE = 2.0; // Maximum rate increase factor
    private readonly ADJUSTMENT_INTERVAL_MS = 60000; // Adjust rates every 60 seconds
    private readonly ERROR_THRESHOLD = 0.1; // 10% error rate triggers backoff
    private readonly CONSECUTIVE_ERROR_LIMIT = 3; // 3 consecutive errors trigger immediate backoff

    private defaultConfig: RateLimitConfig = {
        requestsPerSecond: 1,
        burstSize: 3,
        maxConcurrent: 5 // Default: max 5 concurrent requests per domain
    };

    private domainConfigs: Map<string, RateLimitConfig> = new Map([
        ['iplo.nl', { requestsPerSecond: 1, burstSize: 2, maxConcurrent: 3 }],
        ['rijksoverheid.nl', { requestsPerSecond: 2, burstSize: 5, maxConcurrent: 5 }],
        ['overheid.nl', { requestsPerSecond: 2, burstSize: 5, maxConcurrent: 5 }],
        ['officielebekendmakingen.nl', { requestsPerSecond: 1, burstSize: 3, maxConcurrent: 3 }],
        ['google.com', { requestsPerSecond: 0.5, burstSize: 1, maxConcurrent: 2 }], // Respect API limits
    ]);

    constructor(robotsParserInstance?: RobotsTxtParser) {
        this.robotsParser = robotsParserInstance || robotsTxtParser;
        // Use proper User-Agent format as per acceptance criteria
        this.userAgent = process.env.SCRAPER_USER_AGENT || 
            'Beleidsscan-Bot/1.0 (+https://beleidsscan.nl/bot; contact@beleidsscan.nl)';

        // Redis configuration for distributed rate limiting
        this.useDistributedMode = process.env.RATE_LIMITER_DISTRIBUTED === 'true';
        const env = validateEnv();
        this.redisConfig = {
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times: number) => {
                // Exponential backoff with max delay of 30 seconds
                const delay = Math.min(times * 50, 30000);
                return delay;
            },
        };

        // Initialize Redis connection if distributed mode is enabled
        if (this.useDistributedMode) {
            this.initializeRedis();
        }
    }

    /**
     * Initialize Redis connection for distributed rate limiting
     */
    private async initializeRedis(): Promise<void> {
        try {
            // Create Redis client - using type assertion due to ioredis default export typing
            this.redisClient = new (Redis as unknown as new (config: typeof this.redisConfig) => typeof this.redisClient)(this.redisConfig);

            if (!this.redisClient) {
                this.redisAvailable = false;
                return;
            }

            const client = this.redisClient;
            client.on('error', (error: Error) => {
                console.warn('Redis connection error, falling back to in-memory rate limiting:', error.message);
                this.redisAvailable = false;
            });

            client.on('connect', () => {
                console.log('Redis connected for distributed rate limiting');
                this.redisAvailable = true;
            });

            client.on('close', () => {
                console.warn('Redis connection closed, falling back to in-memory rate limiting');
                this.redisAvailable = false;
            });

            // Test connection
            await client.ping();
            this.redisAvailable = true;
        } catch (error) {
            console.warn('Failed to initialize Redis for distributed rate limiting, using in-memory fallback:', 
                error instanceof Error ? error.message : String(error));
            this.redisAvailable = false;
            this.redisClient = null;
        }
    }

    /**
     * Check if distributed rate limiting is available
     */
    private isDistributedModeAvailable(): boolean {
        return this.useDistributedMode && this.redisAvailable && this.redisClient !== null;
    }

    /**
     * Check if rate limiting should be bypassed (e.g., in test environment)
     */
    private shouldBypassRateLimiting(): boolean {
        return (
            process.env.SKIP_RATE_LIMITING === 'true' ||
            process.env.NODE_ENV === 'test' ||
            process.env.TEST_MODE === 'true' ||
            (global as { __MOCK_RATE_LIMITER__?: unknown }).__MOCK_RATE_LIMITER__ !== undefined
        );
    }

    /**
     * Sleep utility function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Wait for permission to make a request to the given URL
     * Checks robots.txt compliance and enforces rate limits
     * Uses distributed Redis rate limiting if available, otherwise falls back to in-memory
     */
    async acquire(url: string): Promise<void> {
        // Sleep for 100ms
        await this.sleep(100);

        // Bypass rate limiting in test environment
        if (this.shouldBypassRateLimiting()) {
            return; // Immediately resolve without rate limiting
        }

        const domain = this.extractDomain(url);

        // Check robots.txt compliance
        try {
            const isAllowed = await this.robotsParser.isUrlAllowed(url, this.userAgent);
            if (!isAllowed) {
                const config = this.domainConfigs.get(domain) || this.defaultConfig;
                throw new Error(
                    `Rate limit acquisition failed: URL disallowed by robots.txt. ` +
                    `Domain: ${domain}, URL: ${url}, ` +
                    `Configured rate: ${config.requestsPerSecond} req/s, ` +
                    `User-Agent: ${this.userAgent}`
                );
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('disallowed by robots.txt')) {
                throw error; // Re-throw our formatted error
            }
            // If robots.txt check itself fails, provide context
            const config = this.domainConfigs.get(domain) || this.defaultConfig;
            throw new Error(
                `Rate limit acquisition failed: robots.txt check error. ` +
                `Domain: ${domain}, URL: ${url}, ` +
                `Configured rate: ${config.requestsPerSecond} req/s, ` +
                `Error: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        // Try distributed rate limiting first if available
        if (this.isDistributedModeAvailable()) {
            try {
                await this.acquireDistributed(domain);
                return; // Successfully acquired via Redis
            } catch (error) {
                // Fall back to in-memory if Redis fails
                const config = this.domainConfigs.get(domain) || this.defaultConfig;
                const queueSize = this.getQueueSize(domain);
                const activeCount = this.getActiveRequestCount(domain);
                console.warn(
                    `Distributed rate limiting failed for ${domain}, falling back to in-memory. ` +
                    `Config: ${config.requestsPerSecond} req/s, Queue: ${queueSize}, Active: ${activeCount}. ` +
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
                this.redisAvailable = false;
            }
        }

        // Fall back to in-memory rate limiting
        return new Promise((resolve, reject) => {
            const request: QueuedRequest = {
                url,
                resolve,
                reject,
                timestamp: Date.now()
            };

            // Set a timeout to prevent requests from hanging forever (5 minutes max wait)
            const MAX_QUEUE_WAIT_MS = 5 * 60 * 1000;
            request.timeoutId = setTimeout(() => {
                // Ensure timeout handler is cleared
                request.timeoutId = undefined;
                
                // Remove from queue if still queued
                const queue = this.domainQueues.get(domain);
                if (queue) {
                    const index = queue.indexOf(request);
                    if (index >= 0) {
                        queue.splice(index, 1);
                    }
                }
                
                // Get context for error message
                const config = this.domainConfigs.get(domain) || this.defaultConfig;
                const queueSize = queue?.length || 0;
                const activeCount = this.getActiveRequestCount(domain);
                const waitTimeSeconds = Math.round(MAX_QUEUE_WAIT_MS / 1000);
                
                // Reject with detailed error message
                request.reject(new Error(
                    `Rate limit request timed out after ${waitTimeSeconds}s. ` +
                    `Domain: ${domain}, URL: ${url}, ` +
                    `Configured rate: ${config.requestsPerSecond} req/s, ` +
                    `Queue size: ${queueSize}, Active requests: ${activeCount}, ` +
                    `Max concurrent: ${config.maxConcurrent || this.defaultConfig.maxConcurrent}. ` +
                    `This may indicate rate limits are too restrictive or the queue is overloaded.`
                ));
            }, MAX_QUEUE_WAIT_MS);

            // Get or create queue for this domain
            if (!this.domainQueues.has(domain)) {
                this.domainQueues.set(domain, []);
            }

            const queue = this.domainQueues.get(domain)!;
            queue.push(request);

            // Start processing if not already running (with race condition protection)
            if (!this.domainIntervals.has(domain)) {
                // Use a flag to prevent multiple simultaneous startProcessing calls
                this.domainIntervals.set(domain, null); // Temporary marker
                this.startProcessing(domain).catch((error) => {
                    // If startProcessing fails, reject all queued requests for this domain
                    const failedQueue = this.domainQueues.get(domain);
                    if (failedQueue) {
                        const config = this.domainConfigs.get(domain) || this.defaultConfig;
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        const queueSize = failedQueue.length;
                        
                        console.error(
                            `Rate limiter processing failed for ${domain}. ` +
                            `Config: ${config.requestsPerSecond} req/s, Queue size: ${queueSize}. ` +
                            `Error: ${errorMsg}`
                        );
                        
                        while (failedQueue.length > 0) {
                            const req = failedQueue.shift();
                            if (req) {
                                // Ensure timeout handler is cleaned up
                                if (req.timeoutId) {
                                    clearTimeout(req.timeoutId);
                                    req.timeoutId = undefined;
                                }
                                req.reject(new Error(
                                    `Rate limiter processing failed. ` +
                                    `Domain: ${domain}, URL: ${req.url}, ` +
                                    `Configured rate: ${config.requestsPerSecond} req/s, ` +
                                    `Error: ${errorMsg}`
                                ));
                            }
                        }
                    }
                    this.domainIntervals.delete(domain);
                });
            }
        });
    }

    /**
     * Acquire rate limit permission using Redis distributed rate limiting
     * Uses sliding window algorithm with Redis sorted sets
     * Fixed: Uses check-before-add pattern to prevent race conditions
     */
    private async acquireDistributed(domain: string, retryCount: number = 0): Promise<void> {
        const MAX_RETRIES = 10; // Prevent infinite recursion
        if (retryCount >= MAX_RETRIES) {
            const config = this.domainConfigs.get(domain) || this.defaultConfig;
            throw new Error(
                `Distributed rate limiting failed: Maximum retries (${MAX_RETRIES}) exceeded. ` +
                `Domain: ${domain}, Configured rate: ${config.requestsPerSecond} req/s. ` +
                `This may indicate Redis is unavailable or rate limits are too restrictive.`
            );
        }

        if (!this.redisClient) {
            const config = this.domainConfigs.get(domain) || this.defaultConfig;
            throw new Error(
                `Distributed rate limiting failed: Redis client not available. ` +
                `Domain: ${domain}, Configured rate: ${config.requestsPerSecond} req/s. ` +
                `Falling back to in-memory rate limiting.`
            );
        }

        const config = this.domainConfigs.get(domain) || this.defaultConfig;
        const requestsPerSecond = config.requestsPerSecond;
        const windowSeconds = 1; // 1 second sliding window
        const now = Date.now();
        const windowStart = now - (windowSeconds * 1000);

        // Redis key for this domain's rate limit
        const redisKey = `ratelimit:${domain}`;

        // TypeScript guard: we've already checked redisClient is not null above
        const redisClient = this.redisClient;
        if (!redisClient) {
            throw new Error('Redis client not available');
        }

        try {
            // Use Lua script for atomic check-and-add operation
            // This prevents race conditions by making the check and add atomic
            const luaScript = `
                local key = KEYS[1]
                local now = tonumber(ARGV[1])
                local windowStart = tonumber(ARGV[2])
                local maxRequests = tonumber(ARGV[3])
                local windowSeconds = tonumber(ARGV[4])
                local requestId = ARGV[5]
                
                -- Remove entries outside the time window
                redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
                
                -- Count current requests in the window
                local currentCount = redis.call('ZCARD', key)
                
                -- Check if adding this request would exceed the limit
                if currentCount >= maxRequests then
                    -- Rate limit exceeded, return the wait time
                    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
                    if oldest and #oldest >= 2 then
                        local oldestTime = tonumber(oldest[2])
                        -- Wait until the oldest request expires from the window
                        -- The oldest request expires at oldestTime + (windowSeconds * 1000)
                        local waitTime = math.max(0, oldestTime + (windowSeconds * 1000) - now)
                        return {0, waitTime} -- 0 = rate limited, waitTime in ms
                    else
                        return {0, 1000} -- Fallback: wait 1 second
                    end
                else
                    -- Add current request timestamp
                    redis.call('ZADD', key, now, requestId)
                    -- Set expiration on the key (cleanup after 2x window size)
                    redis.call('EXPIRE', key, windowSeconds * 2)
                    return {1, 0} -- 1 = success, 0 = no wait
                end
            `;

            const requestId = `${now}-${Math.random()}`;
            const result = await redisClient.eval(
                luaScript,
                1, // Number of keys
                redisKey, // KEYS[1]
                now.toString(), // ARGV[1]
                windowStart.toString(), // ARGV[2]
                requestsPerSecond.toString(), // ARGV[3]
                windowSeconds.toString(), // ARGV[4]
                requestId // ARGV[5]
            ) as [number, number] | null;

            if (!result || result.length < 2) {
                throw new Error(
                    `Distributed rate limiting failed: Redis Lua script execution returned invalid result. ` +
                    `Domain: ${domain}, Configured rate: ${config.requestsPerSecond} req/s. ` +
                    `Result: ${JSON.stringify(result)}`
                );
            }

            const [allowed, waitTime] = result;

            if (allowed === 0) {
                // Rate limited, wait and retry
                const waitTimeSeconds = Math.round(waitTime / 1000);
                if (retryCount === 0) {
                    // Only log on first retry to avoid spam
                    console.debug(
                        `Rate limit exceeded for ${domain}, waiting ${waitTimeSeconds}s before retry. ` +
                        `Configured rate: ${config.requestsPerSecond} req/s, Retry: ${retryCount + 1}/${MAX_RETRIES}`
                    );
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.acquireDistributed(domain, retryCount + 1); // Retry after waiting
            }

            // Successfully acquired rate limit permission
            return;
        } catch (error) {
            // If Redis operation fails, provide detailed error and trigger fallback
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                                     errorMessage.includes('ECONNRESET') ||
                                     errorMessage.includes('ETIMEDOUT');
            
            if (isConnectionError) {
                this.redisAvailable = false;
                throw new Error(
                    `Distributed rate limiting failed: Redis connection error. ` +
                    `Domain: ${domain}, Configured rate: ${config.requestsPerSecond} req/s. ` +
                    `Error: ${errorMessage}. ` +
                    `Falling back to in-memory rate limiting.`
                );
            }
            
            // For other errors, provide context
            throw new Error(
                `Distributed rate limiting failed: ${errorMessage}. ` +
                `Domain: ${domain}, Configured rate: ${config.requestsPerSecond} req/s, ` +
                `Retry count: ${retryCount}/${MAX_RETRIES}.`
            );
        }
    }

    /**
     * Release an active request (call this when request completes)
     * Ensures proper cleanup of active request tracking
     */
    release(url: string): void {
        try {
            const domain = this.extractDomain(url);
            const activeRequests = this.domainActiveRequests.get(domain);
            if (activeRequests) {
                const wasRemoved = activeRequests.delete(url);
                if (!wasRemoved) {
                    // Request wasn't in active set - this is usually fine (may have been cleared)
                    console.debug(
                        `Release called for URL not in active requests: ${url} (domain: ${domain}). ` +
                        `This may occur if the rate limiter was cleared or the request was never tracked.`
                    );
                }
            } else {
                // Domain has no active requests tracking - this is unusual but not critical
                console.debug(
                    `Release called for domain with no active requests tracking: ${domain} (URL: ${url}). ` +
                    `This may occur if the rate limiter was cleared or the domain was never initialized.`
                );
            }
        } catch (error) {
            // Defensive error handling - release should never throw
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(
                `Error in rate limiter release for URL ${url}: ${errorMsg}. ` +
                `This is non-critical but may indicate a state tracking issue.`
            );
        }
    }

    /**
     * Record request result for adaptive rate limiting
     * Call this after each request completes to enable adaptive learning
     */
    recordResult(result: RequestResult): void {
        if (!this.ADAPTIVE_ENABLED) return;

        const domain = this.extractDomain(result.url);
        const metrics = this.getOrCreateMetrics(domain);

        if (result.success) {
            metrics.successfulRequests++;
            metrics.consecutiveErrors = 0; // Reset consecutive error counter
            
            // Update average response time (simple moving average)
            if (result.responseTime) {
                const alpha = 0.1; // Smoothing factor
                metrics.averageResponseTime = 
                    metrics.averageResponseTime * (1 - alpha) + result.responseTime * alpha;
            }
        } else {
            metrics.failedRequests++;
            metrics.consecutiveErrors++;
            metrics.lastErrorTime = Date.now();

            // Immediate backoff on consecutive errors
            if (metrics.consecutiveErrors >= this.CONSECUTIVE_ERROR_LIMIT) {
                this.applyErrorBackoff(domain, metrics);
            }
        }

        // Update error rate
        const totalRequests = metrics.successfulRequests + metrics.failedRequests;
        metrics.errorRate = totalRequests > 0 ? metrics.failedRequests / totalRequests : 0;

        // Periodic rate adjustment
        const timeSinceAdjustment = Date.now() - metrics.lastAdjustmentTime;
        if (timeSinceAdjustment >= this.ADJUSTMENT_INTERVAL_MS) {
            this.adjustRate(domain, metrics);
        }
    }

    /**
     * Get or create metrics for a domain
     */
    private getOrCreateMetrics(domain: string): DomainMetrics {
        if (!this.domainMetrics.has(domain)) {
            const config = this.domainConfigs.get(domain) || this.defaultConfig;
            this.domainMetrics.set(domain, {
                successfulRequests: 0,
                failedRequests: 0,
                errorRate: 0,
                averageResponseTime: 0,
                consecutiveErrors: 0,
                lastAdjustmentTime: Date.now(),
                currentRate: config.requestsPerSecond
            });
        }
        return this.domainMetrics.get(domain)!;
    }

    /**
     * Apply error-based backoff to reduce request rate
     */
    private applyErrorBackoff(domain: string, metrics: DomainMetrics): void {
        const config = this.domainConfigs.get(domain) || this.defaultConfig;
        const minRate = config.minRequestsPerSecond || config.requestsPerSecond * this.MIN_RATE_REDUCTION;
        
        // Reduce rate by backoff multiplier, but not below minimum
        const newRate = Math.max(
            minRate,
            metrics.currentRate / this.ERROR_BACKOFF_MULTIPLIER
        );

        if (newRate !== metrics.currentRate) {
            metrics.currentRate = newRate;
            metrics.lastAdjustmentTime = Date.now();
            this.updateDomainConfig(domain, { ...config, requestsPerSecond: newRate });
            
            console.log(`⚠️  Rate limiting backoff for ${domain}: ${metrics.currentRate.toFixed(2)} req/s (${metrics.consecutiveErrors} consecutive errors)`);
        }
    }

    /**
     * Adjust rate based on performance metrics
     */
    private adjustRate(domain: string, metrics: DomainMetrics): void {
        const config = this.domainConfigs.get(domain) || this.defaultConfig;
        const minRate = config.minRequestsPerSecond || config.requestsPerSecond * this.MIN_RATE_REDUCTION;
        const maxRate = config.maxRequestsPerSecond || config.requestsPerSecond * this.MAX_RATE_INCREASE;
        let newRate = metrics.currentRate;

        // If error rate is high, reduce rate
        if (metrics.errorRate > this.ERROR_THRESHOLD) {
            newRate = Math.max(
                minRate,
                metrics.currentRate / this.ERROR_BACKOFF_MULTIPLIER
            );
        } 
        // If error rate is low and no recent errors, gradually increase rate
        else if (metrics.errorRate < this.ERROR_THRESHOLD / 2 && metrics.consecutiveErrors === 0) {
            newRate = Math.min(
                maxRate,
                metrics.currentRate * (1 / this.SUCCESS_BOOST_MULTIPLIER)
            );
        }

        if (newRate !== metrics.currentRate) {
            metrics.currentRate = newRate;
            metrics.lastAdjustmentTime = Date.now();
            this.updateDomainConfig(domain, { ...config, requestsPerSecond: newRate });
            
            console.log(`📊 Rate adjustment for ${domain}: ${newRate.toFixed(2)} req/s (error rate: ${(metrics.errorRate * 100).toFixed(1)}%)`);
        }
    }

    /**
     * Update domain configuration
     */
    private updateDomainConfig(domain: string, newConfig: RateLimitConfig): void {
        this.domainConfigs.set(domain, newConfig);
        
        // Restart processing with new rate if queue is active
        if (this.domainIntervals.has(domain)) {
            const interval = this.domainIntervals.get(domain);
            if (interval) {
                clearInterval(interval);
                this.domainIntervals.delete(domain);
            }
            // Restart processing will happen automatically on next queue item
        }
    }

    /**
     * Get current metrics for a domain (for monitoring)
     */
    getMetrics(domain: string): DomainMetrics | undefined {
        return this.domainMetrics.get(domain);
    }

    /**
     * Get all domain metrics (for monitoring)
     */
    getAllMetrics(): Map<string, DomainMetrics> {
        return new Map(this.domainMetrics);
    }

    /**
     * Reset metrics for a domain
     */
    resetMetrics(domain: string): void {
        this.domainMetrics.delete(domain);
    }

    /**
     * Start processing the queue for a domain
     * Fixed: Added error handling to prevent queued requests from hanging
     */
    private async startProcessing(domain: string): Promise<void> {
        const config = this.domainConfigs.get(domain) || this.defaultConfig;
        
        // Get adaptive rate if available, otherwise use config rate
        const metrics = this.domainMetrics.get(domain);
        const effectiveRate = metrics?.currentRate || config.requestsPerSecond;
        
        // Validate effective rate to prevent division by zero or invalid values
        if (!isFinite(effectiveRate) || effectiveRate <= 0) {
            const errorMsg = `Invalid effective rate: ${effectiveRate} for domain ${domain}`;
            console.error(errorMsg);
            throw new Error(
                `Rate limiter configuration error: ${errorMsg}. ` +
                `Configured rate: ${config.requestsPerSecond} req/s, ` +
                `Metrics rate: ${metrics?.currentRate || 'N/A'}. ` +
                `Using default rate of ${this.defaultConfig.requestsPerSecond} req/s.`
            );
        }
        
        // Get crawl-delay from robots.txt if available
        let robotsCrawlDelay: number | null = null;
        try {
            robotsCrawlDelay = await this.robotsParser.getCrawlDelay(domain, this.userAgent);
        } catch (error) {
            // If robots.txt lookup fails, log but continue with default rate
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(
                `Failed to get crawl delay for ${domain}, using default rate. ` +
                `Config: ${config.requestsPerSecond} req/s, Error: ${errorMsg}`
            );
        }
        
        const crawlDelayMs = robotsCrawlDelay ? robotsCrawlDelay * 1000 : null;
        
        // Use robots.txt crawl-delay if it's more restrictive, otherwise use effective rate
        const minIntervalMs = crawlDelayMs 
            ? Math.max(1000 / effectiveRate, crawlDelayMs)
            : 1000 / effectiveRate;

        // Ensure minimum 500ms between requests as per acceptance criteria
        const intervalMs = Math.max(minIntervalMs, 500);

        // Validate interval to prevent invalid values
        if (!isFinite(intervalMs) || intervalMs <= 0) {
            const errorMsg = `Invalid interval: ${intervalMs}ms for domain ${domain}`;
            console.error(errorMsg);
            throw new Error(
                `Rate limiter configuration error: ${errorMsg}. ` +
                `Effective rate: ${effectiveRate} req/s, ` +
                `Crawl delay: ${robotsCrawlDelay || 'N/A'}s. ` +
                `Using minimum interval of 500ms.`
            );
        }

        const maxConcurrent = config.maxConcurrent || this.defaultConfig.maxConcurrent || 5;

        // Validate maxConcurrent
        if (!isFinite(maxConcurrent) || maxConcurrent <= 0) {
            const errorMsg = `Invalid maxConcurrent: ${maxConcurrent} for domain ${domain}`;
            console.error(errorMsg);
            throw new Error(
                `Rate limiter configuration error: ${errorMsg}. ` +
                `Using default maxConcurrent of ${this.defaultConfig.maxConcurrent}.`
            );
        }

        // Initialize active requests tracking
        if (!this.domainActiveRequests.has(domain)) {
            this.domainActiveRequests.set(domain, new Set());
        }

        const interval = setInterval(async () => {
            try {
                const queue = this.domainQueues.get(domain);
                const activeRequests = this.domainActiveRequests.get(domain)!;

                if ((!queue || queue.length === 0) && activeRequests.size === 0) {
                    // No more requests, stop processing
                    clearInterval(interval);
                    this.domainIntervals.delete(domain);
                    return;
                }

                // Check concurrent request limit
                if (activeRequests.size >= maxConcurrent) {
                    return; // Wait for active requests to complete
                }

                // Check if we can process (respect minimum interval)
                const lastRequest = this.domainLastRequest.get(domain) || 0;
                const now = Date.now();

                if (now - lastRequest >= intervalMs && queue && queue.length > 0) {
                    const request = queue.shift()!;
                    this.domainLastRequest.set(domain, now);

                    // Clear timeout since request is being processed (critical cleanup)
                    if (request.timeoutId) {
                        clearTimeout(request.timeoutId);
                        request.timeoutId = undefined; // Mark as cleared
                    }

                    // Track as active request
                    activeRequests.add(request.url);

                    // Resolve the promise, allowing the request to proceed
                    // Wrap in try-catch to handle any errors in resolve
                    try {
                        request.resolve();
                    } catch (error) {
                        // If resolve fails, remove from active requests and reject
                        // Ensure timeout is already cleared (should be, but double-check)
                        if (request.timeoutId) {
                            clearTimeout(request.timeoutId);
                            request.timeoutId = undefined;
                        }
                        activeRequests.delete(request.url);
                        
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        request.reject(new Error(
                            `Rate limiter request resolution failed. ` +
                            `Domain: ${domain}, URL: ${request.url}, ` +
                            `Configured rate: ${config.requestsPerSecond} req/s, ` +
                            `Error: ${errorMsg}`
                        ));
                    }
                }
            } catch (error) {
                // If queue processing fails, reject all queued requests for this domain
                const errorMsg = error instanceof Error ? error.message : String(error);
                const queueSize = this.domainQueues.get(domain)?.length || 0;
                const activeCount = this.getActiveRequestCount(domain);
                
                console.error(
                    `Error processing rate limit queue for ${domain}. ` +
                    `Config: ${config.requestsPerSecond} req/s, Queue size: ${queueSize}, ` +
                    `Active requests: ${activeCount}, Max concurrent: ${maxConcurrent}. ` +
                    `Error: ${errorMsg}`
                );
                
                const queue = this.domainQueues.get(domain);
                if (queue) {
                    while (queue.length > 0) {
                        const req = queue.shift();
                        if (req) {
                            // Ensure timeout handler is cleaned up
                            if (req.timeoutId) {
                                clearTimeout(req.timeoutId);
                                req.timeoutId = undefined;
                            }
                            req.reject(new Error(
                                `Rate limiter queue processing failed. ` +
                                `Domain: ${domain}, URL: ${req.url}, ` +
                                `Configured rate: ${config.requestsPerSecond} req/s, ` +
                                `Queue size: ${queueSize}, Active: ${activeCount}, ` +
                                `Error: ${errorMsg}`
                            ));
                        }
                    }
                }
                // Stop processing this domain
                clearInterval(interval);
                this.domainIntervals.delete(domain);
            }
        }, Math.max(100, intervalMs / 2)); // Check at 2x frequency or min 100ms

        this.domainIntervals.set(domain, interval);
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return 'unknown';
        }
    }

    /**
     * Get current queue size for a domain (for debugging)
     */
    getQueueSize(domain: string): number {
        return this.domainQueues.get(domain)?.length || 0;
    }

    /**
     * Get current active request count for a domain
     */
    getActiveRequestCount(domain: string): number {
        return this.domainActiveRequests.get(domain)?.size || 0;
    }

    /**
     * Clear all queues (for testing)
     * Fixed: Also clears timeout handlers to prevent memory leaks
     */
    async clearAll(): Promise<void> {
        // Clear all intervals
        for (const [_domain, interval] of this.domainIntervals.entries()) {
            if (interval) {
                clearInterval(interval);
            }
        }
        
        // Clear all timeout handlers for queued requests and reject them
        for (const [domain, queue] of this.domainQueues.entries()) {
            for (const request of queue) {
                // Ensure timeout handler is cleaned up
                if (request.timeoutId) {
                    clearTimeout(request.timeoutId);
                    request.timeoutId = undefined;
                }
                // Reject any pending requests with context
                try {
                    request.reject(new Error(
                        `Rate limiter cleared. Domain: ${domain}, URL: ${request.url}`
                    ));
                } catch (error) {
                    // Ignore errors from rejecting already-rejected promises
                    console.debug(`Error rejecting request during clearAll for ${domain}:`, error);
                }
            }
        }
        
        this.domainQueues.clear();
        this.domainLastRequest.clear();
        this.domainIntervals.clear();
        this.domainActiveRequests.clear();

        // Clear Redis rate limit data if available
        if (this.isDistributedModeAvailable() && this.redisClient) {
            try {
                const redisClient = this.redisClient;
                const keys = await redisClient.keys('ratelimit:*');
                if (keys.length > 0) {
                    await redisClient.del(...keys);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.warn(
                    `Failed to clear Redis rate limit data: ${errorMsg}. ` +
                    `This is non-critical but may leave stale rate limit entries in Redis.`
                );
            }
        }
    }

    /**
     * Get distributed rate limiting status
     */
    getDistributedStatus(): {
        enabled: boolean;
        available: boolean;
        redisConnected: boolean;
    } {
        return {
            enabled: this.useDistributedMode,
            available: this.isDistributedModeAvailable(),
            redisConnected: this.redisAvailable && this.redisClient !== null,
        };
    }

    /**
     * Synchronize rate limit state across instances
     * This can be called periodically to ensure consistency
     */
    async synchronizeRateLimits(): Promise<void> {
        if (!this.isDistributedModeAvailable() || !this.redisClient) {
            return;
        }

        const redisClient = this.redisClient;
        try {
            // Get all domain configs and sync to Redis
            for (const [domain, config] of this.domainConfigs.entries()) {
                const redisKey = `ratelimit:config:${domain}`;
                await redisClient.setex(
                    redisKey,
                    3600, // 1 hour TTL
                    JSON.stringify({
                        requestsPerSecond: config.requestsPerSecond,
                        burstSize: config.burstSize,
                        maxConcurrent: config.maxConcurrent,
                        timestamp: Date.now(),
                    })
                );
            }
        } catch (error) {
            console.warn('Failed to synchronize rate limits to Redis:', error);
        }
    }

    /**
     * Close Redis connection (for cleanup)
     */
    async close(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            this.redisAvailable = false;
        }
    }

    /**
     * Get User-Agent string
     */
    getUserAgent(): string {
        return this.userAgent;
    }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
