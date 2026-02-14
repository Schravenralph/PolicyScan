import { getDB, ensureDBConnection } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';

export type ErrorSeverity = 'critical' | 'error' | 'warning';
export type ErrorComponent = 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
export type ErrorStatus = 'open' | 'resolved' | 'ignored';

export interface ErrorMetadata {
    [key: string]: unknown;
    url?: string;
    retry_count?: number;
    request_method?: string;
    request_path?: string;
    user_agent?: string;
    ip?: string;
}

export interface ResolutionHistoryEntry {
    status: ErrorStatus;
    changed_at: Date;
    changed_by: ObjectId;
    note?: string;
}

export interface AssignmentInfo {
    assigned_to?: ObjectId;
    assigned_at?: Date;
    assigned_by?: ObjectId;
}

export interface ErrorLogDocument {
    _id?: ObjectId;
    error_id: string; // Unique error fingerprint for deduplication
    timestamp: Date;
    severity: ErrorSeverity;
    component: ErrorComponent;
    message: string;
    stack_trace?: string;
    user_id?: ObjectId;
    request_id?: string;
    test_run_id?: string; // Test run ID for correlation with test executions
    metadata?: ErrorMetadata;
    status: ErrorStatus;
    resolved_at?: Date;
    resolved_by?: ObjectId;
    occurrence_count: number;
    first_seen: Date;
    last_seen: Date;
    // For deduplication: normalized error signature
    error_signature: string;
    // Resolution tracking
    resolution_history?: ResolutionHistoryEntry[];
    // Assignment tracking
    assigned_to?: ObjectId;
    assigned_at?: Date;
    assigned_by?: ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface ErrorLogCreateInput {
    severity: ErrorSeverity;
    component: ErrorComponent;
    message: string;
    stack_trace?: string;
    user_id?: string;
    request_id?: string;
    test_run_id?: string; // Test run ID for correlation with test executions
    metadata?: ErrorMetadata;
}

const COLLECTION_NAME = 'error_logs';

/**
 * ErrorLog model for MongoDB operations
 */
export class ErrorLog {
    /**
     * Generate error signature for deduplication (normalized message + stack trace)
     */
    static generateErrorSignature(message: string, stackTrace?: string): string {
        // Normalize message (remove dynamic parts like IDs, timestamps)
        const normalizedMessage = message
            .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[timestamp]')
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[uuid]')
            .replace(/[a-f0-9]{24}/gi, '[objectid]')
            .replace(/:\d+/g, ':[port]')
            .trim();

        // Extract relevant stack trace lines (first 3 non-node_modules lines)
        let normalizedStack = '';
        if (stackTrace) {
            const lines = stackTrace.split('\n').slice(0, 10);
            normalizedStack = lines
                .filter(line => !line.includes('node_modules') && !line.includes('at process'))
                .slice(0, 3)
                .map(line => line.replace(/:\d+:\d+/g, ':[line]:[col]'))
                .join('\n');
        }

        return `${normalizedMessage}|${normalizedStack}`;
    }

    /**
     * Generate unique error ID
     */
    static generateErrorId(): string {
        return `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Create or update error log entry
     */
    static async captureError(errorInput: ErrorLogCreateInput): Promise<ErrorLogDocument> {
        // In test environment, gracefully handle database not being initialized
        // Error monitoring is not critical for test execution
        if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
            try {
                const db = getDB();
                // Continue with normal error logging if DB is available
            } catch (error) {
                // Database not initialized in test environment - skip error logging
                // This is expected in some test scenarios where DB setup is optional
                console.warn('[ErrorLog] Database not initialized in test environment, skipping error capture');
                // Return a minimal error log document for compatibility
                const mockId = this.generateErrorId();
                return {
                    _id: mockId as any,
                    error_id: mockId,
                    timestamp: new Date(),
                    ...errorInput,
                    user_id: errorInput.user_id && ObjectId.isValid(errorInput.user_id) ? new ObjectId(errorInput.user_id) : undefined,
                    error_signature: this.generateErrorSignature(errorInput.message, errorInput.stack_trace),
                    occurrence_count: 1,
                    first_seen: new Date(),
                    last_seen: new Date(),
                    status: 'open' as ErrorStatus,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as ErrorLogDocument;
            }
        }
        
        const db = getDB();
        const now = new Date();
        const errorSignature = this.generateErrorSignature(errorInput.message, errorInput.stack_trace);

        // Try to find existing error with same signature
        const existingError = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({
                error_signature: errorSignature,
                status: { $ne: 'resolved' }, // Only match unresolved errors
            });

        if (existingError) {
            // Update existing error: increment count, update last_seen
            const updateFilter: UpdateFilter<ErrorLogDocument> = {
                $set: {
                    last_seen: now,
                    updatedAt: now,
                },
                $inc: {
                    occurrence_count: 1,
                },
            };
            const result = await db
                .collection<ErrorLogDocument>(COLLECTION_NAME)
                .findOneAndUpdate(
                    { _id: existingError._id },
                    updateFilter,
                    { returnDocument: 'after' }
                );

            if (!result) {
                throw new Error('Failed to update error log');
            }

            return result;
        } else {
            // Create new error log entry
            const errorId = this.generateErrorId();
            const errorDoc: ErrorLogDocument = {
                error_id: errorId,
                timestamp: now,
                severity: errorInput.severity,
                component: errorInput.component,
                message: errorInput.message,
                stack_trace: errorInput.stack_trace,
                user_id: errorInput.user_id ? new ObjectId(errorInput.user_id) : undefined,
                request_id: errorInput.request_id,
                test_run_id: errorInput.test_run_id,
                metadata: errorInput.metadata,
                status: 'open',
                occurrence_count: 1,
                first_seen: now,
                last_seen: now,
                error_signature: errorSignature,
                createdAt: now,
                updatedAt: now,
            };

            const result = await db
                .collection<ErrorLogDocument>(COLLECTION_NAME)
                .insertOne(errorDoc);

            return { ...errorDoc, _id: result.insertedId };
        }
    }

    /**
     * Find error by ID
     */
    static async findById(id: string): Promise<ErrorLogDocument | null> {
        const db = getDB();
        return await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({ _id: new ObjectId(id) });
    }

    /**
     * Find errors by criteria
     */
    static async find(filters: {
        severity?: ErrorSeverity;
        component?: ErrorComponent;
        status?: ErrorStatus;
        user_id?: string;
        startDate?: Date;
        endDate?: Date;
        testRunId?: string;
        limit?: number;
        skip?: number;
        sort?: Record<string, 1 | -1>;
    }): Promise<ErrorLogDocument[]> {
        const db = getDB();
        const {
            severity,
            component,
            status,
            user_id,
            startDate,
            endDate,
            testRunId,
            limit = 100,
            skip = 0,
            sort = { last_seen: -1 },
        } = filters;

        const query: Filter<ErrorLogDocument> = {};
        if (severity) query.severity = severity;
        if (component) query.component = component;
        if (status) query.status = status;
        if (user_id) query.user_id = new ObjectId(user_id);
        if (startDate || endDate) {
            query.timestamp = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }
        // Filter by test run ID (check both dedicated field and metadata for backward compatibility)
        if (testRunId) {
            query.$or = [
                { test_run_id: testRunId },
                { 'metadata.testRunId': testRunId },
            ];
        }

        return await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    /**
     * Mark multiple errors as resolved
     */
    static async markResolvedMany(
        ids: string[],
        resolvedBy: string,
        note?: string
    ): Promise<number> {
        if (!ids || ids.length === 0) {
            return 0;
        }

        const db = getDB();
        const now = new Date();
        const resolvedByObjId = new ObjectId(resolvedBy);
        const objectIds = ids.map(id => new ObjectId(id));

        const resolutionHistoryEntry: ResolutionHistoryEntry = {
            status: 'resolved',
            changed_at: now,
            changed_by: resolvedByObjId,
            note,
        };

        const update: UpdateFilter<ErrorLogDocument> = {
            $set: {
                status: 'resolved' as ErrorStatus,
                resolved_at: now,
                resolved_by: resolvedByObjId,
                updatedAt: now,
            },
            $push: {
                resolution_history: resolutionHistoryEntry
            }
        };

        const result = await db.collection<ErrorLogDocument>(COLLECTION_NAME).updateMany(
            { _id: { $in: objectIds } },
            update
        );

        return result.modifiedCount;
    }

    /**
     * Mark error as resolved with resolution history tracking
     */
    static async markResolved(
        id: string,
        resolvedBy: string,
        note?: string
    ): Promise<ErrorLogDocument | null> {
        const db = getDB();
        const now = new Date();
        const resolvedByObjId = new ObjectId(resolvedBy);

        // Get current error to preserve existing resolution history
        const currentError = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({ _id: new ObjectId(id) });

        const resolutionHistoryEntry: ResolutionHistoryEntry = {
            status: 'resolved',
            changed_at: now,
            changed_by: resolvedByObjId,
            note,
        };

        const update: Partial<ErrorLogDocument> = {
            status: 'resolved' as ErrorStatus,
            resolved_at: now,
            resolved_by: resolvedByObjId,
            updatedAt: now,
        };

        // Add to resolution history
        if (currentError?.resolution_history) {
            update.resolution_history = [...currentError.resolution_history, resolutionHistoryEntry];
        } else {
            update.resolution_history = [resolutionHistoryEntry];
        }

        const filter: Filter<ErrorLogDocument> = { _id: new ObjectId(id) };
        const updateFilter: UpdateFilter<ErrorLogDocument> = { $set: update };
        const result = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOneAndUpdate(
                filter,
                updateFilter,
                { returnDocument: 'after' }
            );

        return result || null;
    }

    /**
     * Update error status with history tracking
     */
    static async updateStatus(
        id: string,
        status: ErrorStatus,
        changedBy: string,
        note?: string
    ): Promise<ErrorLogDocument | null> {
        const db = getDB();
        const now = new Date();
        const changedByObjId = new ObjectId(changedBy);

        // Get current error to preserve existing resolution history
        const currentError = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({ _id: new ObjectId(id) });

        const resolutionHistoryEntry: ResolutionHistoryEntry = {
            status,
            changed_at: now,
            changed_by: changedByObjId,
            note,
        };

        const update: Partial<ErrorLogDocument> = {
            status,
            updatedAt: now,
        };

        // Update resolved fields if resolving
        if (status === 'resolved') {
            update.resolved_at = now;
            update.resolved_by = changedByObjId;
        } else if (status === 'open') {
            // Clear resolved fields when reopening
            update.resolved_at = undefined;
            update.resolved_by = undefined;
        }

        // Add to resolution history
        if (currentError?.resolution_history) {
            update.resolution_history = [...currentError.resolution_history, resolutionHistoryEntry];
        } else {
            update.resolution_history = [resolutionHistoryEntry];
        }

        const filter: Filter<ErrorLogDocument> = { _id: new ObjectId(id) };
        const updateFilter: UpdateFilter<ErrorLogDocument> = { $set: update };
        const result = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOneAndUpdate(
                filter,
                updateFilter,
                { returnDocument: 'after' }
            );

        return result || null;
    }

    /**
     * Assign error to a user
     */
    static async assignError(
        id: string,
        assignedTo: string,
        assignedBy: string
    ): Promise<ErrorLogDocument | null> {
        const db = getDB();
        const now = new Date();

        const filter: Filter<ErrorLogDocument> = { _id: new ObjectId(id) };
        const updateFilter: UpdateFilter<ErrorLogDocument> = {
            $set: {
                assigned_to: new ObjectId(assignedTo),
                assigned_at: now,
                assigned_by: new ObjectId(assignedBy),
                updatedAt: now,
            },
        };
        const result = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOneAndUpdate(
                filter,
                updateFilter,
                { returnDocument: 'after' }
            );

        return result || null;
    }

    /**
     * Unassign error
     */
    static async unassignError(id: string): Promise<ErrorLogDocument | null> {
        const db = getDB();
        const now = new Date();

        const filter: Filter<ErrorLogDocument> = { _id: new ObjectId(id) };
        const updateFilter: UpdateFilter<ErrorLogDocument> = {
            $set: {
                assigned_to: undefined,
                assigned_at: undefined,
                assigned_by: undefined,
                updatedAt: now,
            },
        };
        const result = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOneAndUpdate(
                filter,
                updateFilter,
                { returnDocument: 'after' }
            );

        return result || null;
    }

    /**
     * Get resolution history for an error
     */
    static async getResolutionHistory(id: string): Promise<ResolutionHistoryEntry[]> {
        const db = getDB();
        const error = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({ _id: new ObjectId(id) });

        return error?.resolution_history || [];
    }

    /**
     * Get error statistics
     */
    static async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
        component?: ErrorComponent;
    }): Promise<{
        total_errors: number;
        by_severity: Record<ErrorSeverity, number>;
        by_component: Record<ErrorComponent, number>;
        by_status: Record<ErrorStatus, number>;
        error_rate_per_hour: number;
    }> {
        try {
            // Ensure database connection is active before querying
            const db = await ensureDBConnection();
            const { startDate, endDate, component } = options;

            const query: Filter<ErrorLogDocument> = {};
            if (component) query.component = component;
            if (startDate || endDate) {
                query.timestamp = {
                    ...(startDate ? { $gte: startDate } : {}),
                    ...(endDate ? { $lte: endDate } : {}),
                };
            }

            // Limit to prevent memory exhaustion when calculating statistics
            // Default limit: 10000 error logs, configurable via environment variable
            const MAX_ERROR_LOG_STATS = parseInt(process.env.MAX_ERROR_LOG_STATS || '10000', 10);

            const errors = await db
                .collection<ErrorLogDocument>(COLLECTION_NAME)
                .find(query)
                .limit(MAX_ERROR_LOG_STATS)
                .toArray();

            // Log warning if query might have been truncated
            if (errors.length === MAX_ERROR_LOG_STATS) {
                console.warn(
                    `[ErrorLog] Statistics query may have been truncated at ${MAX_ERROR_LOG_STATS} entries. ` +
                    `Consider using date filters or increasing MAX_ERROR_LOG_STATS.`
                );
            }

                const stats = {
                total_errors: errors.reduce((sum, err) => sum + err.occurrence_count, 0),
                by_severity: {
                    critical: 0,
                    error: 0,
                    warning: 0,
                } as Record<ErrorSeverity, number>,
                by_component: {
                    scraper: 0,
                    workflow: 0,
                    api: 0,
                    frontend: 0,
                    database: 0,
                    other: 0,
                } as Record<ErrorComponent, number>,
                by_status: {
                    open: 0,
                    resolved: 0,
                    ignored: 0,
                } as Record<ErrorStatus, number>,
                error_rate_per_hour: 0,
            };

            errors.forEach((err) => {
                stats.by_severity[err.severity] += err.occurrence_count;
                stats.by_component[err.component] += err.occurrence_count;
                stats.by_status[err.status] += err.occurrence_count;
            });

            // Calculate error rate per hour
            if (startDate && endDate) {
                const hours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
                stats.error_rate_per_hour = hours > 0 ? stats.total_errors / hours : 0;
            }

            return stats;
        } catch (error) {
            // Return empty stats if there's an error (e.g., collection doesn't exist)
            console.error('[ErrorLog] Error getting statistics:', error);
            return {
                total_errors: 0,
                by_severity: { critical: 0, error: 0, warning: 0 },
                by_component: { scraper: 0, workflow: 0, api: 0, frontend: 0, database: 0, other: 0 },
                by_status: { open: 0, resolved: 0, ignored: 0 },
                error_rate_per_hour: 0,
            };
        }
    }

    /**
     * Check if resolved error has reoccurred
     */
    static async checkResolvedErrorReoccurrence(errorSignature: string): Promise<boolean> {
        // In test environment, gracefully handle database not being initialized
        if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
            try {
                const db = getDB();
                // Continue with normal check if DB is available
            } catch (error) {
                // Database not initialized in test environment - skip reoccurrence check
                return false;
            }
        }
        
        const db = getDB();
        const resolvedError = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({
                error_signature: errorSignature,
                status: 'resolved',
            });

        if (!resolvedError) {
            return false;
        }

        // Check if same error exists as open
        const openError = await db
            .collection<ErrorLogDocument>(COLLECTION_NAME)
            .findOne({
                error_signature: errorSignature,
                status: 'open',
            });

        return !!openError;
    }

    /**
     * Ensure database indexes exist for optimal query performance and retention
     * 
     * Creates indexes including optional TTL index for automatic cleanup of old resolved errors.
     * TTL is only applied to resolved errors older than retention period (default: 60 days).
     */
    static async ensureIndexes(retentionDays?: number): Promise<void> {
        const db = getDB();
        const collection = db.collection<ErrorLogDocument>(COLLECTION_NAME);

        try {
            // Index on error_signature for deduplication lookups
            await collection.createIndex(
                { error_signature: 1 },
                { background: true, name: 'idx_error_signature' }
            );

            // Index on status for filtering
            await collection.createIndex(
                { status: 1 },
                { background: true, name: 'idx_status' }
            );

            // Index on severity for filtering
            await collection.createIndex(
                { severity: 1 },
                { background: true, name: 'idx_severity' }
            );

            // Index on component for filtering
            await collection.createIndex(
                { component: 1 },
                { background: true, name: 'idx_component' }
            );

            // Index on last_seen for time-based queries
            await collection.createIndex(
                { last_seen: -1 },
                { background: true, name: 'idx_last_seen' }
            );

            // Compound index for common queries (status + last_seen)
            await collection.createIndex(
                { status: 1, last_seen: -1 },
                { background: true, name: 'idx_status_last_seen' }
            );

            // Optional TTL index for resolved errors (only if retentionDays is specified)
            // This allows automatic cleanup of old resolved errors while keeping open errors
            if (retentionDays && retentionDays > 0) {
                const expireAfterSeconds = retentionDays * 24 * 60 * 60;
                
                // Note: MongoDB TTL indexes work on date fields, but we want to only expire resolved errors
                // We'll use a partial index with status='resolved' and expire based on resolved_at
                try {
                    // Create partial TTL index only for resolved errors
                    await collection.createIndex(
                        { resolved_at: 1 },
                        {
                            expireAfterSeconds,
                            name: 'ttl_resolved_errors',
                            background: true,
                            partialFilterExpression: { status: 'resolved' },
                        }
                    );
                    const { logger } = await import('../utils/logger.js');
                    logger.debug(
                        { collection: COLLECTION_NAME, retentionDays },
                        'ErrorLog TTL index created for resolved errors'
                    );
                } catch (error) {
                    // Index might already exist
                    if (error instanceof Error && !error.message.includes('already exists')) {
                        const { logger } = await import('../utils/logger.js');
                        logger.warn({ error }, 'Failed to create ErrorLog TTL index');
                    }
                }
            }

            const { logger } = await import('../utils/logger.js');
            logger.debug('ErrorLog indexes ensured');
        } catch (error) {
            const { logger } = await import('../utils/logger.js');
            logger.warn({ error }, 'Failed to ensure ErrorLog indexes');
            throw error;
        }
    }
}
