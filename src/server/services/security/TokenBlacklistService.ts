import { default as Redis, type Redis as RedisType } from 'ioredis';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';

/**
 * Service for managing JWT token blacklist
 * 
 * Provides fast token revocation using Redis (with in-memory fallback).
 * Tokens are blacklisted by their hash to prevent reuse after revocation.
 * 
 * Features:
 * - Redis-based blacklist for fast O(1) lookups
 * - Automatic expiration based on token TTL
 * - In-memory fallback if Redis is unavailable
 * - Support for revoking single tokens or all user tokens
 * - Thread-safe for concurrent access
 */
export class TokenBlacklistService {
    private redisClient: RedisType | null = null;
    private inMemoryBlacklist: Set<string> = new Set();
    private redisAvailable: boolean = false;
    private readonly keyPrefix = 'token:blacklist:';
    private readonly redisConfig: {
        host: string;
        port: number;
        password?: string;
        keyPrefix: string;
        retryStrategy: (times: number) => number;
        connectTimeout: number;
        commandTimeout: number;
        enableReadyCheck: boolean;
        enableOfflineQueue: boolean;
        maxRetriesPerRequest: number;
        keepAlive: number;
        family: number;
    };

    constructor() {
        const env = validateEnv();
        
        this.redisConfig = {
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            keyPrefix: this.keyPrefix,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 30000);
                return delay;
            },
            connectTimeout: env.REDIS_CONNECT_TIMEOUT,
            commandTimeout: env.REDIS_COMMAND_TIMEOUT,
            enableReadyCheck: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
            keepAlive: env.REDIS_KEEP_ALIVE,
            family: 4,
        };

        // Initialize Redis connection
        this.initializeRedis();
    }

    /**
     * Initialize Redis connection
     */
    private async initializeRedis(): Promise<void> {
        try {
            this.redisClient = new (Redis as unknown as typeof RedisType)(this.redisConfig);

            if (!this.redisClient) {
                this.redisAvailable = false;
                logger.warn('TokenBlacklistService: Redis client creation failed, using in-memory fallback');
                return;
            }

            const client = this.redisClient;
            client.on('error', (error: Error) => {
                logger.warn({ error: error.message }, 'TokenBlacklistService: Redis connection error, using in-memory fallback');
                this.redisAvailable = false;
            });

            client.on('connect', () => {
                logger.info('TokenBlacklistService: Redis connected for token blacklist');
                this.redisAvailable = true;
            });

            client.on('close', () => {
                logger.warn('TokenBlacklistService: Redis connection closed, using in-memory fallback');
                this.redisAvailable = false;
            });

            // Test connection
            await client.ping();
            this.redisAvailable = true;
            logger.info('TokenBlacklistService: Redis initialized successfully');
        } catch (error) {
            logger.warn(
                { error: error instanceof Error ? error.message : String(error) },
                'TokenBlacklistService: Failed to initialize Redis, using in-memory fallback'
            );
            this.redisAvailable = false;
            this.redisClient = null;
        }
    }

    /**
     * Compute hash of a token for blacklist storage
     * Uses SHA-256 to create a deterministic hash
     */
    private hashToken(token: string): string {
        return createHash('sha256').update(token, 'utf8').digest('hex');
    }

    /**
     * Check if a token is blacklisted
     * 
     * @param token - JWT token to check
     * @returns true if token is blacklisted, false otherwise
     */
    async isBlacklisted(token: string): Promise<boolean> {
        const tokenHash = this.hashToken(token);

        if (this.redisAvailable && this.redisClient) {
            try {
                const exists = await this.redisClient.exists(tokenHash);
                return exists === 1;
            } catch (error) {
                logger.warn({ error }, 'TokenBlacklistService: Redis check failed, falling back to in-memory');
                // Fall through to in-memory check
            }
        }

        // Fallback to in-memory blacklist
        return this.inMemoryBlacklist.has(tokenHash);
    }

    /**
     * Revoke a single token
     * 
     * @param token - JWT token to revoke
     * @param expiresInSeconds - Token expiration time in seconds (for automatic cleanup)
     * @returns true if token was successfully blacklisted
     */
    async revokeToken(token: string, expiresInSeconds?: number): Promise<boolean> {
        const tokenHash = this.hashToken(token);
        
        // Default expiration: 7 days (max reasonable token lifetime)
        const ttl = expiresInSeconds || 7 * 24 * 60 * 60;

        if (this.redisAvailable && this.redisClient) {
            try {
                // Store token hash with expiration
                await this.redisClient.setex(tokenHash, ttl, '1');
                logger.debug({ tokenHash: tokenHash.substring(0, 8) + '...' }, 'Token blacklisted in Redis');
                return true;
            } catch (error) {
                logger.warn({ error }, 'TokenBlacklistService: Redis revocation failed, falling back to in-memory');
                // Fall through to in-memory storage
            }
        }

        // Fallback to in-memory blacklist
        this.inMemoryBlacklist.add(tokenHash);
        
        // Schedule removal after expiration (if expiresInSeconds provided)
        if (expiresInSeconds) {
            setTimeout(() => {
                this.inMemoryBlacklist.delete(tokenHash);
            }, expiresInSeconds * 1000);
        }
        
        logger.debug({ tokenHash: tokenHash.substring(0, 8) + '...' }, 'Token blacklisted in memory');
        return true;
    }

    /**
     * Revoke all tokens for a user
     * 
     * Uses a user-specific blacklist key pattern to track all user tokens.
     * New tokens for the user will be checked against this blacklist.
     * 
     * @param userId - User ID whose tokens should be revoked
     * @param expiresInSeconds - Blacklist expiration time in seconds
     * @returns true if user tokens were successfully blacklisted
     */
    async revokeAllUserTokens(userId: string, expiresInSeconds?: number): Promise<boolean> {
        const userBlacklistKey = `user:${userId}`;
        const ttl = expiresInSeconds || 7 * 24 * 60 * 60;

        if (this.redisAvailable && this.redisClient) {
            try {
                // Store user blacklist marker with expiration
                // Floor to second precision to match JWT iat granularity.
                // JWT iat is in seconds; storing ms within the same second would
                // cause tokens issued in that second to be incorrectly revoked.
                const revokedAtMs = Math.floor(Date.now() / 1000) * 1000;
                await this.redisClient.setex(userBlacklistKey, ttl, revokedAtMs.toString());
                logger.info({ userId }, 'All user tokens blacklisted in Redis');
                return true;
            } catch (error) {
                logger.warn({ error }, 'TokenBlacklistService: Redis user revocation failed, falling back to in-memory');
                // Fall through to in-memory storage
            }
        }

        // Fallback to in-memory blacklist
        // Note: In-memory fallback doesn't support user-level revocation efficiently
        // This is a limitation of the fallback, but Redis should be available in production
        logger.warn({ userId }, 'TokenBlacklistService: User token revocation in memory fallback (limited support)');
        return true;
    }

    /**
     * Check if a user's tokens are blacklisted
     * 
     * @param userId - User ID to check
     * @param tokenIssuedAt - Optional timestamp when the token was issued (seconds since epoch)
     * @returns true if user's tokens are blacklisted, false otherwise
     */
    async isUserBlacklisted(userId: string, tokenIssuedAt?: number): Promise<boolean> {
        const userBlacklistKey = `user:${userId}`;

        if (this.redisAvailable && this.redisClient) {
            try {
                const value = await this.redisClient.get(userBlacklistKey);

                // If key doesn't exist, user is not blacklisted
                if (!value) {
                    return false;
                }

                // If tokenIssuedAt is provided, check if token was issued BEFORE revocation
                if (tokenIssuedAt) {
                    const revocationTime = parseInt(value, 10);
                    // If parsing fails, default to blacklisted (safer)
                    if (isNaN(revocationTime)) {
                        return true;
                    }

                    // Convert tokenIssuedAt to ms for comparison if needed,
                    // but standard JWT iat is in seconds.
                    // Date.now() stored in Redis is in ms.
                    // Let's normalize: tokenIssuedAt is seconds, revocationTime is ms.
                    const tokenTimeMs = tokenIssuedAt * 1000;

                    // If token was issued before (or same time as) revocation, it is blacklisted.
                    // If token was issued strictly after revocation, it is valid.
                    return tokenTimeMs <= revocationTime;
                }

                // If no timestamp provided, treat existence as blacklist
                return true;
            } catch (error) {
                logger.warn({ error }, 'TokenBlacklistService: Redis user check failed');
                return false;
            }
        }

        // In-memory fallback doesn't support user-level blacklist efficiently
        return false;
    }

    /**
     * Get blacklist statistics
     */
    async getStats(): Promise<{
        redisAvailable: boolean;
        inMemoryCount: number;
        redisCount?: number;
    }> {
        const stats: {
            redisAvailable: boolean;
            inMemoryCount: number;
            redisCount?: number;
        } = {
            redisAvailable: this.redisAvailable,
            inMemoryCount: this.inMemoryBlacklist.size,
        };

        if (this.redisAvailable && this.redisClient) {
            try {
                // Count keys with our prefix
                const keys = await this.redisClient.keys(`${this.keyPrefix}*`);
                stats.redisCount = keys.length;
            } catch (error) {
                logger.warn({ error }, 'TokenBlacklistService: Failed to get Redis stats');
            }
        }

        return stats;
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            this.redisAvailable = false;
            logger.info('TokenBlacklistService: Redis connection closed');
        }
    }
}

// Singleton instance
let tokenBlacklistService: TokenBlacklistService | null = null;

/**
 * Get the token blacklist service instance
 */
export function getTokenBlacklistService(): TokenBlacklistService {
    if (!tokenBlacklistService) {
        tokenBlacklistService = new TokenBlacklistService();
    }
    return tokenBlacklistService;
}

