import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { LogRotationService } from './LogRotationService.js';

export interface HealthCheckLogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    category: 'health_check' | 'startup' | 'shutdown';
    service?: string;
    component?: string;
    message: string;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    metadata?: Record<string, unknown>;
    status?: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
}

/**
 * Specialized logging service for health checks and startup processes
 * 
 * Follows existing logging patterns:
 * - Uses Pino logger for structured logging (consistent with existing codebase)
 * - Stores logs in MongoDB (like ErrorMonitoringService)
 * - Writes to files for parsing/analysis (like FileLogger)
 * - Singleton pattern (like TestLoggingService)
 * 
 * Logs are stored in:
 * - MongoDB: `health_check_logs` collection (for querying/dashboard)
 * - Files: `data/logs/health-check-*.jsonl` (for parsing/automation)
 */
export class HealthCheckLogger {
    private static instance: HealthCheckLogger | null = null;
    private logDir: string;
    private errorLogFile: string;
    private dailyLogFile: string;
    private rotationService: LogRotationService | null = null;
    private retentionDays: number;

    private constructor(logDir: string = 'data/logs', retentionDays: number = 30) {
        this.logDir = logDir;
        this.retentionDays = retentionDays;
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        this.errorLogFile = path.join(this.logDir, `health-check-errors-${today}.jsonl`);
        this.dailyLogFile = path.join(this.logDir, `health-check-${today}.jsonl`);
        
        // Initialize log rotation service
        this.rotationService = new LogRotationService({
            logDir: this.logDir,
            retentionDays: this.retentionDays,
            compress: true,
            filePattern: 'health-check-*.jsonl',
        });
    }

    /**
     * Get singleton instance
     */
    static getInstance(retentionDays?: number): HealthCheckLogger {
        if (!HealthCheckLogger.instance) {
            const retention = retentionDays || parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);
            HealthCheckLogger.instance = new HealthCheckLogger('data/logs', retention);
            
            // Start automatic log rotation if enabled
            if (process.env.ENABLE_LOG_ROTATION !== 'false') {
                HealthCheckLogger.instance.startLogRotation();
            }
            
            // Ensure MongoDB retention indexes
            HealthCheckLogger.instance.ensureMongoDBRetention().catch((error) => {
                logger.warn({ error }, 'Failed to ensure MongoDB retention indexes');
            });
        }
        return HealthCheckLogger.instance;
    }

    /**
     * Start automatic log rotation
     */
    private startLogRotation(): void {
        if (this.rotationService) {
            this.rotationService.startAutomaticRotation();
        }
    }

    /**
     * Ensure MongoDB retention TTL indexes are created
     */
    private async ensureMongoDBRetention(): Promise<void> {
        try {
            const db = getDB();
            const collection = db.collection('health_check_logs');
            
            // Create TTL index on createdAt field (expires after retentionDays)
            const expireAfterSeconds = this.retentionDays * 24 * 60 * 60;
            
            try {
                await collection.createIndex(
                    { createdAt: 1 },
                    {
                        expireAfterSeconds,
                        name: 'ttl_createdAt',
                        background: true,
                    }
                );
                logger.debug(
                    { collection: 'health_check_logs', retentionDays: this.retentionDays },
                    'MongoDB retention TTL index created/verified for health_check_logs'
                );
            } catch (error) {
                // Index might already exist, check if it needs updating
                const indexes = await collection.indexes();
                const ttlIndex = indexes.find(idx => idx.name === 'ttl_createdAt');
                
                if (ttlIndex && (ttlIndex.expireAfterSeconds !== expireAfterSeconds)) {
                    // Drop and recreate with new retention period
                    await collection.dropIndex('ttl_createdAt');
                    await collection.createIndex(
                        { createdAt: 1 },
                        {
                            expireAfterSeconds,
                            name: 'ttl_createdAt',
                            background: true,
                        }
                    );
                    logger.info(
                        { collection: 'health_check_logs', retentionDays: this.retentionDays },
                        'MongoDB retention TTL index updated for health_check_logs'
                    );
                } else if (!ttlIndex) {
                    // Index doesn't exist, create it
                    await collection.createIndex(
                        { createdAt: 1 },
                        {
                            expireAfterSeconds,
                            name: 'ttl_createdAt',
                            background: true,
                        }
                    );
                    logger.debug(
                        { collection: 'health_check_logs', retentionDays: this.retentionDays },
                        'MongoDB retention TTL index created for health_check_logs'
                    );
                }
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to ensure MongoDB retention indexes');
        }
    }

    /**
     * Ensure log directory exists
     */
    private async ensureLogDir(): Promise<void> {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            // Fallback to logger if directory creation fails
            logger.error({ error, logDir: this.logDir }, 'Failed to create log directory');
        }
    }

    /**
     * Write log entry to file (JSON Lines format for easy parsing)
     * Also stores in MongoDB for dashboard integration
     */
    private async writeLogEntry(entry: HealthCheckLogEntry, includeInErrorLog: boolean = false): Promise<void> {
        await this.ensureLogDir();

        const logLine = JSON.stringify(entry) + '\n';

        try {
            // Write to daily log file
            await fs.appendFile(this.dailyLogFile, logLine, 'utf-8');

            // Write to error log file if it's an error
            if (includeInErrorLog && entry.level === 'error') {
                await fs.appendFile(this.errorLogFile, logLine, 'utf-8');
            }

            // Store in MongoDB for dashboard integration (non-blocking)
            this.storeInMongoDB(entry).catch((error) => {
                // Don't fail if MongoDB write fails - file logging is primary
                logger.debug({ error }, 'Failed to store health check log in MongoDB');
            });
        } catch (error) {
            // Fallback to console if file write fails
            logger.error({ error, entry }, 'Failed to write health check log entry to file');
        }
    }

    /**
     * Store log entry in MongoDB for dashboard integration
     */
    private async storeInMongoDB(entry: HealthCheckLogEntry): Promise<void> {
        const db = getDB();
        await db.collection('health_check_logs').insertOne({
            ...entry,
            createdAt: new Date(entry.timestamp),
            _id: undefined, // Let MongoDB generate ID
        });
    }

    /**
     * Log health check result
     */
    async logHealthCheck(
        service: string,
        status: 'healthy' | 'unhealthy' | 'degraded',
        message: string,
        error?: Error,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const entry: HealthCheckLogEntry = {
            timestamp: new Date().toISOString(),
            level: status === 'healthy' ? 'info' : 'error',
            category: 'health_check',
            service,
            message,
            status,
            metadata,
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
            entry.level = 'error';
        }

    // Also log to structured logger
    if (error) {
      logger.error({ service, error, metadata }, `Health check failed: ${service}`);
    } else if (status === 'unhealthy' || status === 'degraded') {
      logger.warn({ service, metadata }, `Health check ${status}: ${service}`);
    } else {
      // Don't log healthy checks to reduce log volume
      // Only log at debug level if LOG_LEVEL is set to debug
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug({ service, metadata }, `Health check passed: ${service}`);
      }
    }

    // Only write to file if unhealthy or error (reduces log file growth significantly)
    await this.writeLogEntry(entry, !!error || status !== 'healthy');
    }

    /**
     * Log startup event
     */
    async logStartup(
        component: string,
        message: string,
        error?: Error,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const entry: HealthCheckLogEntry = {
            timestamp: new Date().toISOString(),
            level: error ? 'error' : 'info',
            category: 'startup',
            component,
            message,
            metadata,
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        // Also log to structured logger
        if (error) {
            logger.error({ component, error, metadata }, `Startup failed: ${component}`);
        } else {
            logger.info({ component, metadata }, `Startup: ${component}`);
        }

        await this.writeLogEntry(entry, !!error);
    }

    /**
     * Log shutdown event
     */
    async logShutdown(
        component: string,
        message: string,
        error?: Error,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const entry: HealthCheckLogEntry = {
            timestamp: new Date().toISOString(),
            level: error ? 'error' : 'info',
            category: 'shutdown',
            component,
            message,
            metadata,
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        // Also log to structured logger
        if (error) {
            logger.error({ component, error, metadata }, `Shutdown error: ${component}`);
        } else {
            logger.info({ component, metadata }, `Shutdown: ${component}`);
        }

        await this.writeLogEntry(entry, !!error);
    }

    /**
     * Log general error
     */
    async logError(
        category: 'health_check' | 'startup' | 'shutdown',
        message: string,
        error: Error,
        service?: string,
        component?: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const entry: HealthCheckLogEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            category,
            service,
            component,
            message,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
            metadata,
        };

        // Also log to structured logger
        logger.error({ service, component, error, metadata }, message);

        await this.writeLogEntry(entry, true);
    }

    /**
     * Read error logs from a specific date
     */
    async readErrorLogs(date?: string): Promise<HealthCheckLogEntry[]> {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const errorLogFile = path.join(this.logDir, `health-check-errors-${targetDate}.jsonl`);

        try {
            const content = await fs.readFile(errorLogFile, 'utf-8');
            return content
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line) as HealthCheckLogEntry);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get all error log files
     */
    async getErrorLogFiles(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.logDir);
            return files
                .filter(file => file.startsWith('health-check-errors-') && file.endsWith('.jsonl'))
                .sort()
                .reverse(); // Most recent first
        } catch {
            return [];
        }
    }

    /**
     * Get health check logs from MongoDB (for dashboard integration)
     */
    async getLogsFromMongoDB(options: {
        startDate?: Date;
        endDate?: Date;
        service?: string;
        component?: string;
        level?: 'info' | 'warn' | 'error' | 'debug';
        category?: 'health_check' | 'startup' | 'shutdown';
        limit?: number;
    } = {}): Promise<HealthCheckLogEntry[]> {
        try {
            const db = getDB();
            const query: Record<string, unknown> = {};

            if (options.startDate || options.endDate) {
                query.timestamp = {} as Record<string, unknown>;
                if (options.startDate) {
                    (query.timestamp as Record<string, unknown>).$gte = options.startDate.toISOString();
                }
                if (options.endDate) {
                    (query.timestamp as Record<string, unknown>).$lte = options.endDate.toISOString();
                }
            }

            if (options.service) {
                query.service = options.service;
            }

            if (options.component) {
                query.component = options.component;
            }

            if (options.level) {
                query.level = options.level;
            }

            if (options.category) {
                query.category = options.category;
            }

            const cursor = db.collection<HealthCheckLogEntry>('health_check_logs')
                .find(query)
                .sort({ timestamp: -1 })
                .limit(options.limit || 100);

            return await cursor.toArray();
        } catch (error) {
            logger.error({ error }, 'Failed to retrieve health check logs from MongoDB');
            return [];
        }
    }

    /**
     * Get error logs from MongoDB (for dashboard integration)
     */
    async getErrorLogsFromMongoDB(options: {
        startDate?: Date;
        endDate?: Date;
        service?: string;
        component?: string;
        limit?: number;
    } = {}): Promise<HealthCheckLogEntry[]> {
        return this.getLogsFromMongoDB({
            ...options,
            level: 'error',
        });
    }

    /**
     * Get health check statistics from MongoDB
     */
    async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
    } = {}): Promise<{
        total: number;
        byLevel: Record<string, number>;
        byCategory: Record<string, number>;
        byService: Record<string, number>;
        errors: number;
        lastError?: Date;
    }> {
        try {
            const db = getDB();
            const query: Record<string, unknown> = {};

            if (options.startDate || options.endDate) {
                query.timestamp = {} as Record<string, unknown>;
                if (options.startDate) {
                    (query.timestamp as Record<string, unknown>).$gte = options.startDate.toISOString();
                }
                if (options.endDate) {
                    (query.timestamp as Record<string, unknown>).$lte = options.endDate.toISOString();
                }
            }

            const logs = await db.collection<HealthCheckLogEntry>('health_check_logs')
                .find(query)
                .toArray();

            const stats = {
                total: logs.length,
                byLevel: {} as Record<string, number>,
                byCategory: {} as Record<string, number>,
                byService: {} as Record<string, number>,
                errors: 0,
                lastError: undefined as Date | undefined,
            };

            for (const log of logs) {
                stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
                stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
                if (log.service) {
                    stats.byService[log.service] = (stats.byService[log.service] || 0) + 1;
                }
                if (log.level === 'error') {
                    stats.errors++;
                    const errorDate = new Date(log.timestamp);
                    if (!stats.lastError || errorDate > stats.lastError) {
                        stats.lastError = errorDate;
                    }
                }
            }

            return stats;
        } catch (error) {
            logger.error({ error }, 'Failed to get health check statistics from MongoDB');
            return {
                total: 0,
                byLevel: {},
                byCategory: {},
                byService: {},
                errors: 0,
            };
        }
    }
}

/**
 * Get or create the health check logger instance (singleton pattern)
 */
export function getHealthCheckLogger(): HealthCheckLogger {
    return HealthCheckLogger.getInstance();
}

