import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { AuditLog } from '../../models/AuditLog.js';
import type { AuditLogDocument } from '../../models/AuditLog.js';

/**
 * Configuration for audit log retention
 */
export interface AuditLogRetentionConfig {
    /**
     * Retention period in days
     * Logs older than this will be deleted
     * Default: 365 days (1 year)
     */
    retentionDays: number;
    
    /**
     * Whether to enable automatic cleanup
     * Default: true
     */
    enabled: boolean;
    
    /**
     * Cron expression for scheduled cleanup
     * Default: '0 2 * * *' (daily at 2 AM)
     */
    cronExpression: string;
    
    /**
     * Timezone for cron schedule
     * Default: 'Europe/Amsterdam'
     */
    timezone: string;
    
    /**
     * Whether to enable automatic integrity verification
     * Default: true
     */
    integrityVerificationEnabled: boolean;
    
    /**
     * Cron expression for scheduled integrity verification
     * Default: '0 3 * * *' (daily at 3 AM)
     */
    integrityVerificationCron: string;
    
    /**
     * Number of entries to verify per integrity check
     * Default: 1000
     */
    integrityVerificationLimit: number;
}

/**
 * Service for managing audit log retention, cleanup, and integrity verification
 * 
 * Automatically removes old audit logs based on configurable retention period
 * to prevent unbounded growth and ensure compliance with data retention policies.
 * Also provides scheduled integrity verification to detect tampering.
 */
export class AuditLogRetentionService {
    private config: AuditLogRetentionConfig;
    private cronJob: any = null;
    private integrityCronJob: any = null;
    private isInitialized: boolean = false;

    constructor(config?: Partial<AuditLogRetentionConfig>) {
        this.config = {
            retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10),
            enabled: process.env.AUDIT_LOG_RETENTION_ENABLED !== 'false',
            cronExpression: process.env.AUDIT_LOG_RETENTION_CRON || '0 2 * * *', // Daily at 2 AM
            timezone: process.env.AUDIT_LOG_RETENTION_TIMEZONE || 'Europe/Amsterdam',
            integrityVerificationEnabled: process.env.AUDIT_LOG_INTEGRITY_VERIFICATION_ENABLED !== 'false',
            integrityVerificationCron: process.env.AUDIT_LOG_INTEGRITY_VERIFICATION_CRON || '0 3 * * *', // Daily at 3 AM
            integrityVerificationLimit: parseInt(process.env.AUDIT_LOG_INTEGRITY_VERIFICATION_LIMIT || '1000', 10),
            ...config,
        };
    }

    /**
     * Initialize and start the retention service
     * Sets up scheduled cleanup if enabled
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            logger.warn('AuditLogRetentionService already initialized');
            return;
        }

        if (!this.config.enabled) {
            logger.info('Audit log retention is disabled');
            this.isInitialized = true;
            return;
        }

        try {
            // Run initial cleanup check
            await this.cleanupOldLogs();

            // Run initial integrity verification if enabled
            if (this.config.integrityVerificationEnabled) {
                await this.verifyIntegrity().catch((error) => {
                    logger.error({ error }, 'Failed to run initial integrity verification');
                });
            }

            // Set up scheduled cleanup
            await this.startScheduledCleanup();

            // Set up scheduled integrity verification
            if (this.config.integrityVerificationEnabled) {
                await this.startScheduledIntegrityVerification();
            }

            this.isInitialized = true;
            logger.info(
                {
                    retentionDays: this.config.retentionDays,
                    cronExpression: this.config.cronExpression,
                    timezone: this.config.timezone,
                },
                'AuditLogRetentionService initialized'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to initialize AuditLogRetentionService');
            throw error;
        }
    }

    /**
     * Start scheduled cleanup using cron
     */
    private async startScheduledCleanup(): Promise<void> {
        try {
            // Import node-cron dynamically (it's an optional dependency)
            let cron: any;
            try {
                cron = await import('node-cron');
            } catch (error) {
                logger.warn(
                    { error },
                    'node-cron is not installed. Audit log retention will run only on startup. Install with: pnpm install node-cron'
                );
                return;
            }

            // Validate cron expression
            if (!cron.validate(this.config.cronExpression)) {
                throw new Error(`Invalid cron expression: ${this.config.cronExpression}`);
            }

            // Create and start cron job
            this.cronJob = cron.schedule(
                this.config.cronExpression,
                async () => {
                    await this.cleanupOldLogs();
                },
                {
                    scheduled: true,
                    timezone: this.config.timezone,
                }
            );

            logger.info(
                {
                    cronExpression: this.config.cronExpression,
                    timezone: this.config.timezone,
                },
                'Audit log retention scheduled cleanup started'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to start scheduled audit log cleanup');
            // Don't throw - allow service to continue without scheduled cleanup
        }
    }

    /**
     * Start scheduled integrity verification using cron
     */
    private async startScheduledIntegrityVerification(): Promise<void> {
        try {
            // Import node-cron dynamically (it's an optional dependency)
            let cron: any;
            try {
                cron = await import('node-cron');
            } catch (error) {
                logger.warn(
                    { error },
                    'node-cron is not installed. Audit log integrity verification will run only on startup. Install with: pnpm install node-cron'
                );
                return;
            }

            // Validate cron expression
            if (!cron.validate(this.config.integrityVerificationCron)) {
                throw new Error(`Invalid cron expression: ${this.config.integrityVerificationCron}`);
            }

            // Create and start cron job
            this.integrityCronJob = cron.schedule(
                this.config.integrityVerificationCron,
                async () => {
                    await this.verifyIntegrity();
                },
                {
                    scheduled: true,
                    timezone: this.config.timezone,
                }
            );

            logger.info(
                {
                    cronExpression: this.config.integrityVerificationCron,
                    timezone: this.config.timezone,
                },
                'Audit log integrity verification scheduled job started'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to start scheduled audit log integrity verification');
            // Don't throw - allow service to continue without scheduled verification
        }
    }

    /**
     * Verify audit log integrity
     * 
     * Checks that all audit log entries have valid hashes and form a valid chain.
     * 
     * @returns Verification result with list of tampered entries
     */
    async verifyIntegrity(): Promise<{
        verified: number;
        tampered: Array<{
            _id: string;
            timestamp: Date;
            reason: string;
        }>;
        errors: Array<{
            _id: string;
            error: string;
        }>;
    }> {
        const { AuditLog } = await import('../../models/AuditLog.js');
        const result = await AuditLog.verifyIntegrity(this.config.integrityVerificationLimit);
        
        if (result.tampered.length > 0) {
            logger.error(
                {
                    tamperedCount: result.tampered.length,
                    tamperedEntries: result.tampered,
                },
                'Audit log integrity verification detected tampered entries'
            );
        } else if (result.errors.length > 0) {
            logger.warn(
                {
                    errorCount: result.errors.length,
                    errors: result.errors,
                },
                'Audit log integrity verification encountered errors'
            );
        } else {
            logger.info(
                {
                    verified: result.verified,
                },
                'Audit log integrity verification completed - all entries verified'
            );
        }
        
        return result;
    }

    /**
     * Clean up old audit logs based on retention period
     * 
     * @returns Statistics about the cleanup operation
     */
    async cleanupOldLogs(): Promise<{
        deletedCount: number;
        cutoffDate: Date;
        retentionDays: number;
    }> {
        if (!this.config.enabled) {
            logger.debug('Audit log retention is disabled, skipping cleanup');
            return {
                deletedCount: 0,
                cutoffDate: new Date(),
                retentionDays: this.config.retentionDays,
            };
        }

        const startTime = Date.now();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

        try {
            const db = getDB();
            const collection = db.collection<AuditLogDocument>('audit_logs');

            // Count logs to be deleted (for logging)
            const countToDelete = await collection.countDocuments({
                timestamp: { $lt: cutoffDate },
            });

            if (countToDelete === 0) {
                logger.debug(
                    {
                        cutoffDate: cutoffDate.toISOString(),
                        retentionDays: this.config.retentionDays,
                    },
                    'No old audit logs to clean up'
                );
                return {
                    deletedCount: 0,
                    cutoffDate,
                    retentionDays: this.config.retentionDays,
                };
            }

            // Delete old logs
            const deleteResult = await collection.deleteMany({
                timestamp: { $lt: cutoffDate },
            });

            const deletedCount = deleteResult.deletedCount || 0;
            const duration = Date.now() - startTime;

            logger.info(
                {
                    deletedCount,
                    cutoffDate: cutoffDate.toISOString(),
                    retentionDays: this.config.retentionDays,
                    durationMs: duration,
                },
                'Audit log retention cleanup completed'
            );

            // Log the cleanup operation itself for audit purposes
            // Note: We can't use AuditLogService here as it would create a circular dependency
            // Instead, we log to the application logger
            logger.info(
                {
                    action: 'audit_log_cleanup',
                    deletedCount,
                    cutoffDate: cutoffDate.toISOString(),
                    retentionDays: this.config.retentionDays,
                },
                'Audit log cleanup operation completed'
            );

            return {
                deletedCount,
                cutoffDate,
                retentionDays: this.config.retentionDays,
            };
        } catch (error) {
            logger.error(
                {
                    error,
                    cutoffDate: cutoffDate.toISOString(),
                    retentionDays: this.config.retentionDays,
                },
                'Failed to clean up old audit logs'
            );
            throw error;
        }
    }

    /**
     * Get retention statistics
     * 
     * @returns Statistics about audit log retention
     */
    async getRetentionStats(): Promise<{
        totalLogs: number;
        logsToDelete: number;
        cutoffDate: Date;
        retentionDays: number;
        oldestLogDate: Date | null;
        newestLogDate: Date | null;
    }> {
        const db = getDB();
        const collection = db.collection<AuditLogDocument>('audit_logs');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

        const [totalLogs, logsToDelete, oldestLog, newestLog] = await Promise.all([
            collection.countDocuments({}),
            collection.countDocuments({
                timestamp: { $lt: cutoffDate },
            }),
            collection.findOne({}, { sort: { timestamp: 1 } }),
            collection.findOne({}, { sort: { timestamp: -1 } }),
        ]);

        return {
            totalLogs,
            logsToDelete,
            cutoffDate,
            retentionDays: this.config.retentionDays,
            oldestLogDate: oldestLog?.timestamp || null,
            newestLogDate: newestLog?.timestamp || null,
        };
    }

    /**
     * Stop the retention service
     */
    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            logger.info('Audit log retention scheduled cleanup stopped');
        }
        if (this.integrityCronJob) {
            this.integrityCronJob.stop();
            this.integrityCronJob = null;
            logger.info('Audit log integrity verification scheduled job stopped');
        }
        this.isInitialized = false;
    }

    /**
     * Get current configuration
     */
    getConfig(): AuditLogRetentionConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<AuditLogRetentionConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info({ config: this.config }, 'Audit log retention configuration updated');
        
        // Restart scheduled jobs if they were running
        if (this.isInitialized) {
            this.stop();
            this.startScheduledCleanup().catch((error) => {
                logger.error({ error }, 'Failed to restart scheduled cleanup after config update');
            });
            if (this.config.integrityVerificationEnabled) {
                this.startScheduledIntegrityVerification().catch((error) => {
                    logger.error({ error }, 'Failed to restart scheduled integrity verification after config update');
                });
            }
        }
    }
}

// Singleton instance
let auditLogRetentionService: AuditLogRetentionService | null = null;

/**
 * Get the audit log retention service instance
 */
export function getAuditLogRetentionService(): AuditLogRetentionService {
    if (!auditLogRetentionService) {
        auditLogRetentionService = new AuditLogRetentionService();
    }
    return auditLogRetentionService;
}

