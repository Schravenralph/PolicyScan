import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

const COLLECTION_NAME = 'conflict_resolutions';

/**
 * Conflict value information
 */
export interface ConflictValue {
    value: unknown;
    sourceUrl?: string;
    sourceType?: 'official' | 'unofficial' | 'unknown';
    reliabilityScore: number;
}

/**
 * Conflict resolution document
 */
export interface ConflictResolutionDocument {
    _id?: ObjectId;
    entityId: string;
    property: string;
    conflictValues: ConflictValue[];
    resolutionStrategy: string;
    resolvedValue: unknown;
    resolvedSourceUrl?: string;
    confidence: number;
    requiresReview: boolean;
    resolved: boolean;
    reason?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    detectedAt: Date;
    resolvedAt?: Date | null;
    resolvedBy?: string | null; // User email or 'system'
    createdAt: Date;
    updatedAt: Date;
}

/**
 * MongoDB model for conflict resolutions
 */
export class ConflictResolution {
    /**
     * Create a new conflict resolution
     */
    static async create(data: Omit<ConflictResolutionDocument, '_id' | 'createdAt' | 'updatedAt'>): Promise<ConflictResolutionDocument> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);

        const document: ConflictResolutionDocument = {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await collection.insertOne(document);
        return { ...document, _id: result.insertedId };
    }

    /**
     * Find conflict resolution by ID
     */
    static async findById(id: string): Promise<ConflictResolutionDocument | null> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);
        return await collection.findOne({ _id: new ObjectId(id) });
    }

    /**
     * Find conflicts by entity ID
     */
    static async findByEntityId(entityId: string): Promise<ConflictResolutionDocument[]> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);
        
        // Limit to prevent memory exhaustion when loading conflicts for an entity
        // Default limit: 1000 conflicts, configurable via environment variable
        const MAX_CONFLICT_RESOLUTIONS = parseInt(process.env.MAX_CONFLICT_RESOLUTIONS || '1000', 10);
        
        const conflicts = await collection
            .find({ entityId })
            .sort({ detectedAt: -1 })
            .limit(MAX_CONFLICT_RESOLUTIONS)
            .toArray();
        
        if (conflicts.length === MAX_CONFLICT_RESOLUTIONS) {
            console.warn(
                `[ConflictResolution] findByEntityId() query may have been truncated at ${MAX_CONFLICT_RESOLUTIONS} entries. ` +
                `Consider increasing MAX_CONFLICT_RESOLUTIONS.`
            );
        }
        
        return conflicts;
    }

    /**
     * Find conflicts requiring review
     */
    static async findPendingReview(): Promise<ConflictResolutionDocument[]> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);
        
        // Limit to prevent memory exhaustion when loading pending reviews
        // Default limit: 1000 conflicts, configurable via environment variable
        const MAX_CONFLICT_RESOLUTIONS = parseInt(process.env.MAX_CONFLICT_RESOLUTIONS || '1000', 10);
        
        const conflicts = await collection
            .find({ 
                requiresReview: true,
                resolved: false 
            })
            .sort({ severity: -1, detectedAt: -1 })
            .limit(MAX_CONFLICT_RESOLUTIONS)
            .toArray();
        
        if (conflicts.length === MAX_CONFLICT_RESOLUTIONS) {
            console.warn(
                `[ConflictResolution] findPendingReview() query may have been truncated at ${MAX_CONFLICT_RESOLUTIONS} entries. ` +
                `Consider increasing MAX_CONFLICT_RESOLUTIONS.`
            );
        }
        
        return conflicts;
    }

    /**
     * Find conflicts by severity
     */
    static async findBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Promise<ConflictResolutionDocument[]> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);
        
        // Limit to prevent memory exhaustion when loading conflicts by severity
        // Default limit: 1000 conflicts, configurable via environment variable
        const MAX_CONFLICT_RESOLUTIONS = parseInt(process.env.MAX_CONFLICT_RESOLUTIONS || '1000', 10);
        
        const conflicts = await collection
            .find({ severity })
            .sort({ detectedAt: -1 })
            .limit(MAX_CONFLICT_RESOLUTIONS)
            .toArray();
        
        if (conflicts.length === MAX_CONFLICT_RESOLUTIONS) {
            console.warn(
                `[ConflictResolution] findBySeverity() query may have been truncated at ${MAX_CONFLICT_RESOLUTIONS} entries. ` +
                `Consider increasing MAX_CONFLICT_RESOLUTIONS.`
            );
        }
        
        return conflicts;
    }

    /**
     * Update resolution status
     */
    static async updateResolution(
        id: string,
        updates: {
            resolved?: boolean;
            resolvedValue?: unknown;
            resolvedBy?: string;
            reason?: string;
            requiresReview?: boolean;
        }
    ): Promise<ConflictResolutionDocument | null> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);

        const updateData: Partial<ConflictResolutionDocument> = {
            ...updates,
            updatedAt: new Date()
        };

        if (updates.resolved) {
            updateData.resolvedAt = new Date();
        }

        const result = await collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        return result || null;
    }

    /**
     * Get conflict resolution statistics
     */
    static async getStatistics(): Promise<{
        total: number;
        resolved: number;
        pending: number;
        bySeverity: Record<string, number>;
        autoResolutionRate: number;
    }> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);

        const total = await collection.countDocuments({});
        const resolved = await collection.countDocuments({ resolved: true });
        const pending = await collection.countDocuments({ resolved: false });

        // Count by severity with limit to prevent memory exhaustion
        // Default limit: 10000 conflicts for stats calculation, configurable via environment variable
        const MAX_CONFLICT_STATS = parseInt(process.env.MAX_CONFLICT_STATS || '10000', 10);
        
        const severityCounts = await collection.aggregate([
            {
                $limit: MAX_CONFLICT_STATS
            },
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        
        // Log warning if aggregation might have been truncated
        if (total > MAX_CONFLICT_STATS) {
            console.warn(
                `[ConflictResolution] getStatistics() aggregation may have been truncated at ${MAX_CONFLICT_STATS} entries. ` +
                `Statistics may be incomplete. Consider increasing MAX_CONFLICT_STATS.`
            );
        }

        const bySeverity: Record<string, number> = {};
        for (const item of severityCounts) {
            bySeverity[item._id] = item.count;
        }

        const autoResolutionRate = total > 0 ? resolved / total : 0;

        return {
            total,
            resolved,
            pending,
            bySeverity,
            autoResolutionRate
        };
    }

    /**
     * Delete old resolved conflicts (cleanup)
     */
    static async deleteOldResolved(olderThanDays: number = 90): Promise<number> {
        const db = getDB();
        const collection = db.collection<ConflictResolutionDocument>(COLLECTION_NAME);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const result = await collection.deleteMany({
            resolved: true,
            resolvedAt: { $lt: cutoffDate }
        });

        return result.deletedCount;
    }
}

