import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { createHash } from 'crypto';

export type AuditActionType =
    | 'user_role_changed'
    | 'user_status_changed'
    | 'user_password_reset'
    | 'user_created'
    | 'user_deleted'
    | 'workflow_paused'
    | 'workflow_resumed'
    | 'workflow_deleted'
    | 'threshold_updated'
    | 'threshold_template_applied'
    | 'threshold_schedule_created'
    | 'threshold_schedule_updated'
    | 'threshold_schedule_deleted'
    | 'system_config_changed'
    | 'system_maintenance'
    | 'audit_log_exported'
    | 'admin_login'
    | 'admin_logout'
    | 'login_attempt'
    | 'login_failure'
    | 'password_reset_request'
    | 'review_created'
    | 'review_candidate_accepted'
    | 'review_candidate_rejected'
    | 'review_completed'
    | 'review_deleted'
    | 'error_resolved'
    | 'bulk_error_resolve';

export type AuditTargetType = 'user' | 'workflow' | 'system' | 'threshold' | 'audit_log' | 'review' | 'other';

export interface AuditLogDocument {
    _id?: ObjectId;
    timestamp: Date;
    userId: ObjectId;
    userEmail: string;
    action: AuditActionType;
    targetType: AuditTargetType;
    targetId?: string;
    details: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    // Integrity fields
    hash?: string; // SHA-256 hash of this entry's content
    previousHash?: string; // Hash of the previous entry (for chain integrity)
}

export interface AuditLogCreateInput {
    userId: string;
    userEmail: string;
    action: AuditActionType;
    targetType: AuditTargetType;
    targetId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

const COLLECTION_NAME = 'audit_logs';

/**
 * Compute hash for an audit log entry
 * 
 * Creates a deterministic hash from the audit log content to detect tampering.
 * The hash includes all fields except _id, hash, and previousHash.
 * 
 * @param entry - Audit log entry to hash
 * @param previousHash - Hash of the previous entry (for chain integrity)
 * @returns SHA-256 hash as hex string
 */
function computeAuditLogHash(
    entry: Omit<AuditLogDocument, '_id' | 'hash' | 'previousHash'>,
    previousHash?: string
): string {
    // Create a normalized representation of the entry
    // Sort keys for consistent hashing
    const normalized = {
        timestamp: entry.timestamp.toISOString(),
        userId: entry.userId.toString(),
        userEmail: entry.userEmail,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId || '',
        details: JSON.stringify(entry.details, Object.keys(entry.details).sort()),
        ipAddress: entry.ipAddress || '',
        userAgent: entry.userAgent || '',
        createdAt: entry.createdAt.toISOString(),
        previousHash: previousHash || '',
    };
    
    // Create hash from normalized JSON
    const hashInput = JSON.stringify(normalized);
    return createHash('sha256').update(hashInput, 'utf8').digest('hex');
}

/**
 * Get the hash of the most recent audit log entry
 * Used for chain-based integrity checking
 */
async function getLatestAuditLogHash(): Promise<string | undefined> {
    const db = getDB();
    const latest = await db
        .collection<AuditLogDocument>(COLLECTION_NAME)
        .findOne({}, { sort: { timestamp: -1, createdAt: -1 } });
    
    return latest?.hash;
}

/**
 * AuditLog model for MongoDB operations
 */
export class AuditLog {
    /**
     * Create a new audit log entry
     */
    static async create(auditInput: AuditLogCreateInput): Promise<AuditLogDocument> {
        const db = getDB();
        const now = new Date();

        // Validate and convert userId to ObjectId
        // In test environments, userId might be a mock value that's not a valid ObjectId
        let userId: ObjectId;
        try {
            userId = new ObjectId(auditInput.userId);
        } catch (_error) {
            // In test environments, use a placeholder ObjectId if userId is invalid
            // This prevents audit logging from breaking tests
            if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                userId = new ObjectId(); // Use a new ObjectId as placeholder
            } else {
                throw new Error(`Invalid userId format: ${auditInput.userId}`);
            }
        }

        // Get previous hash for chain integrity (if enabled)
        const integrityEnabled = process.env.AUDIT_LOG_INTEGRITY_ENABLED !== 'false';
        let previousHash: string | undefined;
        
        if (integrityEnabled) {
            previousHash = await getLatestAuditLogHash();
        }

        const auditDoc: Omit<AuditLogDocument, '_id' | 'hash'> = {
            timestamp: now,
            userId,
            userEmail: auditInput.userEmail,
            action: auditInput.action,
            targetType: auditInput.targetType,
            targetId: auditInput.targetId,
            details: auditInput.details || {},
            ipAddress: auditInput.ipAddress,
            userAgent: auditInput.userAgent,
            createdAt: now,
            previousHash,
        };

        // Compute hash for integrity checking
        const hash = computeAuditLogHash(auditDoc, previousHash);
        const auditDocWithHash: AuditLogDocument = {
            ...auditDoc,
            hash,
        };

        const result = await db.collection<AuditLogDocument>(COLLECTION_NAME).insertOne(auditDocWithHash);
        return { ...auditDocWithHash, _id: result.insertedId };
    }

    /**
     * Create multiple audit log entries
     */
    static async insertMany(auditInputs: AuditLogCreateInput[]): Promise<AuditLogDocument[]> {
        if (auditInputs.length === 0) return [];

        const db = getDB();
        const now = new Date();
        const integrityEnabled = process.env.AUDIT_LOG_INTEGRITY_ENABLED !== 'false';
        let previousHash: string | undefined;

        if (integrityEnabled) {
            previousHash = await getLatestAuditLogHash();
        }

        const docsToInsert: AuditLogDocument[] = [];

        for (let i = 0; i < auditInputs.length; i++) {
            const input = auditInputs[i];
            // Increment timestamp by 1ms for each entry to ensure unique timestamps and deterministic ordering
            const entryTimestamp = new Date(now.getTime() + i);

            // Validate and convert userId to ObjectId
            let userId: ObjectId;
            try {
                userId = new ObjectId(input.userId);
            } catch (_error) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    userId = new ObjectId();
                } else {
                    throw new Error(`Invalid userId format: ${input.userId}`);
                }
            }

            const auditDoc: Omit<AuditLogDocument, '_id' | 'hash'> = {
                timestamp: entryTimestamp,
                userId,
                userEmail: input.userEmail,
                action: input.action,
                targetType: input.targetType,
                targetId: input.targetId,
                details: input.details || {},
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                createdAt: entryTimestamp,
                previousHash,
            };

            const hash = computeAuditLogHash(auditDoc, previousHash);
            const auditDocWithHash: AuditLogDocument = {
                ...auditDoc,
                hash,
            };

            docsToInsert.push(auditDocWithHash);
            previousHash = hash; // Update hash for next entry
        }

        const result = await db.collection<AuditLogDocument>(COLLECTION_NAME).insertMany(docsToInsert);

        // Add generated _ids to returned documents
        return docsToInsert.map((doc, index) => ({
            ...doc,
            _id: result.insertedIds[index]
        }));
    }

    /**
     * Find audit logs by criteria
     */
    static async find(filters: {
        userId?: string;
        action?: AuditActionType;
        targetType?: AuditTargetType;
        targetId?: string;
        startDate?: Date;
        endDate?: Date;
        search?: string;
        limit?: number;
        skip?: number;
        sort?: Record<string, 1 | -1>;
    }): Promise<{ logs: AuditLogDocument[]; total: number }> {
        const db = getDB();
        const {
            userId,
            action,
            targetType,
            targetId,
            startDate,
            endDate,
            search,
            limit = 100,
            skip = 0,
            sort = { timestamp: -1 },
        } = filters;

        const query: Filter<AuditLogDocument> = {};

        if (userId) query.userId = new ObjectId(userId);
        if (action) query.action = action;
        if (targetType) query.targetType = targetType;
        if (targetId) query.targetId = targetId;

        if (startDate || endDate) {
            query.timestamp = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        if (search) {
            query.$or = [
                { userEmail: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { targetType: { $regex: search, $options: 'i' } },
                { targetId: { $regex: search, $options: 'i' } },
            ];
        }

        const [logs, total] = await Promise.all([
            db
                .collection<AuditLogDocument>(COLLECTION_NAME)
                .find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray(),
            db.collection<AuditLogDocument>(COLLECTION_NAME).countDocuments(query),
        ]);

        return { logs, total };
    }

    /**
     * Verify integrity of audit log entries
     * 
     * Checks that all entries have valid hashes and form a valid chain.
     * Returns entries that fail verification.
     * 
     * @param limit - Maximum number of entries to verify (default: 1000)
     * @returns Verification result with list of tampered entries
     */
    static async verifyIntegrity(limit: number = 1000): Promise<{
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
        const db = getDB();
        const collection = db.collection<AuditLogDocument>(COLLECTION_NAME);
        
        // Get entries sorted by timestamp
        const entries = await collection
            .find({}, { sort: { timestamp: 1, createdAt: 1 } })
            .limit(limit)
            .toArray();
        
        const tampered: Array<{ _id: string; timestamp: Date; reason: string }> = [];
        const errors: Array<{ _id: string; error: string }> = [];
        let previousHash: string | undefined;
        let verified = 0;
        
        for (const entry of entries) {
            try {
                // Skip entries without hash (legacy entries or integrity disabled)
                if (!entry.hash) {
                    verified++;
                    continue;
                }
                
                // Verify hash matches content
                const expectedHash = computeAuditLogHash(
                    {
                        timestamp: entry.timestamp,
                        userId: entry.userId,
                        userEmail: entry.userEmail,
                        action: entry.action,
                        targetType: entry.targetType,
                        targetId: entry.targetId,
                        details: entry.details,
                        ipAddress: entry.ipAddress,
                        userAgent: entry.userAgent,
                        createdAt: entry.createdAt,
                    },
                    previousHash
                );
                
                if (entry.hash !== expectedHash) {
                    tampered.push({
                        _id: entry._id!.toString(),
                        timestamp: entry.timestamp,
                        reason: 'Hash mismatch - entry content has been modified',
                    });
                    continue;
                }
                
                // Verify chain integrity (previousHash matches previous entry's hash)
                if (previousHash !== undefined && entry.previousHash !== previousHash) {
                    tampered.push({
                        _id: entry._id!.toString(),
                        timestamp: entry.timestamp,
                        reason: 'Chain broken - previousHash does not match previous entry',
                    });
                    continue;
                }
                
                verified++;
                previousHash = entry.hash;
            } catch (error) {
                errors.push({
                    _id: entry._id!.toString(),
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        
        return { verified, tampered, errors };
    }

    /**
     * Get integrity statistics
     */
    static async getIntegrityStats(): Promise<{
        totalEntries: number;
        entriesWithHash: number;
        entriesWithoutHash: number;
        integrityEnabled: boolean;
    }> {
        const db = getDB();
        const collection = db.collection<AuditLogDocument>(COLLECTION_NAME);
        
        const [totalEntries, entriesWithHash] = await Promise.all([
            collection.countDocuments({}),
            collection.countDocuments({ hash: { $exists: true, $ne: undefined } }),
        ]);
        
        return {
            totalEntries,
            entriesWithHash,
            entriesWithoutHash: totalEntries - entriesWithHash,
            integrityEnabled: process.env.AUDIT_LOG_INTEGRITY_ENABLED !== 'false',
        };
    }

    /**
     * Find audit log by ID
     */
    static async findById(id: string): Promise<AuditLogDocument | null> {
        const db = getDB();
        return await db
            .collection<AuditLogDocument>(COLLECTION_NAME)
            .findOne({ _id: new ObjectId(id) });
    }

    /**
     * Get audit log statistics
     */
    static async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
        action?: AuditActionType;
        targetType?: AuditTargetType;
    }): Promise<{
        total_actions: number;
        by_action: Record<AuditActionType, number>;
        by_target_type: Record<AuditTargetType, number>;
        by_user: Array<{ userId: string; userEmail: string; count: number }>;
    }> {
        const db = getDB();
        const { startDate, endDate, action, targetType } = options;

        const query: Filter<AuditLogDocument> = {};
        if (action) query.action = action;
        if (targetType) query.targetType = targetType;
        if (startDate || endDate) {
            query.timestamp = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        // Limit to prevent memory exhaustion when calculating statistics
        // Default limit: 10000 audit logs for stats calculation, configurable via environment variable
        const MAX_AUDIT_LOG_STATS = parseInt(process.env.MAX_AUDIT_LOG_STATS || '10000', 10);

        const logs = await db
            .collection<AuditLogDocument>(COLLECTION_NAME)
            .find(query)
            .limit(MAX_AUDIT_LOG_STATS)
            .toArray();

        // Log warning if query might have been truncated
        if (logs.length === MAX_AUDIT_LOG_STATS) {
            console.warn(
                `[AuditLog] getStatistics() query may have been truncated at ${MAX_AUDIT_LOG_STATS} entries. ` +
                `Statistics may be incomplete. Consider using date filters or increasing MAX_AUDIT_LOG_STATS.`
            );
        }

        const stats = {
            total_actions: logs.length,
            by_action: {} as Record<AuditActionType, number>,
            by_target_type: {} as Record<AuditTargetType, number>,
            by_user: [] as Array<{ userId: string; userEmail: string; count: number }>,
        };

        const userCounts = new Map<string, { userId: string; userEmail: string; count: number }>();

        logs.forEach((log) => {
            // Count by action
            stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;

            // Count by target type
            stats.by_target_type[log.targetType] = (stats.by_target_type[log.targetType] || 0) + 1;

            // Count by user
            const userIdStr = log.userId.toString();
            const userCount = userCounts.get(userIdStr);
            if (userCount) {
                userCount.count++;
            } else {
                userCounts.set(userIdStr, {
                    userId: userIdStr,
                    userEmail: log.userEmail,
                    count: 1,
                });
            }
        });

        stats.by_user = Array.from(userCounts.values()).sort((a, b) => b.count - a.count);

        return stats;
    }

    /**
     * Ensure indexes exist for efficient queries
     */
    static async ensureIndexes(): Promise<void> {
        const db = getDB();
        const collection = db.collection<AuditLogDocument>(COLLECTION_NAME);

        await collection.createIndex({ timestamp: -1 });
        await collection.createIndex({ userId: 1 });
        await collection.createIndex({ action: 1 });
        await collection.createIndex({ targetType: 1 });
        await collection.createIndex({ targetId: 1 });
        await collection.createIndex({ userEmail: 1 });
        await collection.createIndex({ timestamp: -1, action: 1 });
        await collection.createIndex({ timestamp: -1, targetType: 1 });
        // Index for integrity checking
        await collection.createIndex({ hash: 1 });
        await collection.createIndex({ previousHash: 1 });
    }
}
