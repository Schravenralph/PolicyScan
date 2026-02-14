import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'workflowPermissions';
// Limit to prevent memory exhaustion when loading shared workflows
// Default limit: 1000 workflows, configurable via environment variable
const MAX_WORKFLOW_PERMISSIONS = parseInt(process.env.MAX_WORKFLOW_PERMISSIONS || '1000', 10);

export type PermissionLevel = 'owner' | 'editor' | 'runner' | 'viewer';
export type Visibility = 'private' | 'team' | 'public';

export interface WorkflowPermission {
    userId?: string;
    teamId?: string;
    level: PermissionLevel;
    grantedBy: string;
    grantedAt: Date;
}

export interface WorkflowAccessDocument {
    _id?: ObjectId;
    workflowId: string;
    ownerId: string;
    visibility: Visibility;
    permissions: WorkflowPermission[];
    createdAt: Date;
    updatedAt: Date;
}

export interface ActivityLogEntry {
    timestamp: Date;
    userId: string;
    userName?: string;
    action: string;
    details?: string;
}

export interface WorkflowActivityDocument {
    _id?: ObjectId;
    workflowId: string;
    activities: ActivityLogEntry[];
    createdAt: Date;
    updatedAt: Date;
}

export class WorkflowPermissionModel {
    private static indexesEnsured = false;
    private static ensureIndexesPromise: Promise<void> | null = null;

    /**
     * Ensure database indexes exist for optimal query performance
     */
    private static async ensureIndexes(): Promise<void> {
        if (this.indexesEnsured) return;

        // Prevent race conditions during concurrent initialization
        if (this.ensureIndexesPromise) {
            return this.ensureIndexesPromise;
        }

        this.ensureIndexesPromise = (async () => {
            const db = getDB();
            const collection = db.collection<WorkflowAccessDocument>(COLLECTION_NAME);

            try {
                // Index on workflowId for lookups
                await collection.createIndex({ workflowId: 1 }, { unique: true, background: true });

                // Index on ownerId for shared workflows
                await collection.createIndex({ ownerId: 1 }, { background: true });

                // Index on permissions.userId for shared workflows
                await collection.createIndex({ 'permissions.userId': 1 }, { background: true, sparse: true });

                // Index on permissions.teamId for shared workflows
                await collection.createIndex({ 'permissions.teamId': 1 }, { background: true, sparse: true });

                // Index on visibility for public workflows
                await collection.createIndex({ visibility: 1 }, { background: true });

                // Compound index for getSharedWorkflows queries (ownerId + visibility)
                // This optimizes queries that filter by ownerId or visibility
                await collection.createIndex(
                    { ownerId: 1, visibility: 1 },
                    { background: true, name: 'idx_ownerId_visibility' }
                );

                // Compound index for permissions.userId + visibility queries
                // This optimizes queries that check user permissions and visibility
                await collection.createIndex(
                    { 'permissions.userId': 1, visibility: 1 },
                    { background: true, sparse: true, name: 'idx_permissions_userId_visibility' }
                );

                this.indexesEnsured = true;
            } catch (error) {
                logger.warn({ error }, 'Could not create all workflow permission indexes');
            } finally {
                this.ensureIndexesPromise = null;
            }
        })();

        return this.ensureIndexesPromise;
    }

    /**
     * Initialize permissions for a new workflow
     * Uses upsert to safely handle concurrent initializations
     */
    static async initialize(workflowId: string, ownerId: string): Promise<WorkflowAccessDocument> {
        await this.ensureIndexes();
        const db = getDB();
        const now = new Date();

        const result = await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            {
                $setOnInsert: {
                    workflowId,
                    ownerId,
                    visibility: 'private',
                    permissions: [],
                    createdAt: now,
                    updatedAt: now,
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        if (!result) {
            throw new Error(`Failed to initialize workflow permissions for ${workflowId}`);
        }

        // Force a read to ensure consistency in test environments
        if (process.env.NODE_ENV === 'test') {
            await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOne({ workflowId });
        }

        return result;
    }

    /**
     * Get workflow access document
     */
    static async findByWorkflowId(workflowId: string): Promise<WorkflowAccessDocument | null> {
        await this.ensureIndexes();
        const db = getDB();
        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOne({ workflowId });
    }

    /**
     * Get workflow access documents for multiple workflows
     */
    static async findByWorkflowIds(workflowIds: string[]): Promise<WorkflowAccessDocument[]> {
        if (workflowIds.length === 0) {
            return [];
        }

        await this.ensureIndexes();
        const db = getDB();
        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).find({
            workflowId: { $in: workflowIds }
        }).toArray();
    }

    /**
     * Share workflow with a user
     * Uses atomic updates to prevent race conditions
     */
    static async shareWithUser(
        workflowId: string,
        userId: string,
        level: PermissionLevel,
        grantedBy: string
    ): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        // Use update pipeline to atomically remove existing permission and add new one
        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            [
                {
                    $set: {
                        permissions: {
                            $filter: {
                                input: { $ifNull: ["$permissions", []] },
                                cond: { $ne: ["$$this.userId", userId] }
                            }
                        }
                    }
                },
                {
                    $set: {
                        permissions: {
                            $concatArrays: [
                                "$permissions",
                                [{
                                    userId,
                                    level,
                                    grantedBy,
                                    grantedAt: now
                                }]
                            ]
                        },
                        updatedAt: now
                    }
                }
            ],
            { returnDocument: 'after' }
        );
    }

    /**
     * Share workflow with a team
     * Uses atomic updates to prevent race conditions
     */
    static async shareWithTeam(
        workflowId: string,
        teamId: string,
        level: PermissionLevel,
        grantedBy: string
    ): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        // Use update pipeline to atomically remove existing permission and add new one
        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            [
                {
                    $set: {
                        permissions: {
                            $filter: {
                                input: { $ifNull: ["$permissions", []] },
                                cond: { $ne: ["$$this.teamId", teamId] }
                            }
                        }
                    }
                },
                {
                    $set: {
                        permissions: {
                            $concatArrays: [
                                "$permissions",
                                [{
                                    teamId,
                                    level,
                                    grantedBy,
                                    grantedAt: now
                                }]
                            ]
                        },
                        updatedAt: now
                    }
                }
            ],
            { returnDocument: 'after' }
        );
    }

    /**
     * Remove access for a user
     */
    static async removeUserAccess(workflowId: string, userId: string): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            {
                $pull: { permissions: { userId } } as any,
                $set: { updatedAt: now }
            },
            { returnDocument: 'after' }
        );
    }

    /**
     * Remove access for a team
     */
    static async removeTeamAccess(workflowId: string, teamId: string): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            {
                $pull: { permissions: { teamId } } as any,
                $set: { updatedAt: now }
            },
            { returnDocument: 'after' }
        );
    }

    /**
     * Update permission level for a user
     */
    static async updateUserPermission(
        workflowId: string,
        userId: string,
        level: PermissionLevel,
        updatedBy: string
    ): Promise<WorkflowAccessDocument | null> {
        return this.shareWithUser(workflowId, userId, level, updatedBy);
    }

    /**
     * Update visibility
     */
    static async updateVisibility(
        workflowId: string,
        visibility: Visibility
    ): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            {
                $set: {
                    visibility,
                    updatedAt: now,
                },
            },
            { returnDocument: 'after' }
        );
    }

    /**
     * Transfer ownership
     */
    static async transferOwnership(
        workflowId: string,
        newOwnerId: string,
        previousOwnerId: string
    ): Promise<WorkflowAccessDocument | null> {
        const db = getDB();
        const now = new Date();

        // Use update pipeline for atomicity
        return await db.collection<WorkflowAccessDocument>(COLLECTION_NAME).findOneAndUpdate(
            { workflowId },
            [
                // 1. Remove newOwner from permissions (if they had any)
                {
                    $set: {
                        permissions: {
                            $filter: {
                                input: { $ifNull: ["$permissions", []] },
                                cond: { $ne: ["$$this.userId", newOwnerId] }
                            }
                        }
                    }
                },
                // 2. Remove previousOwner from permissions (if they had any, just in case)
                {
                    $set: {
                        permissions: {
                            $filter: {
                                input: "$permissions",
                                cond: { $ne: ["$$this.userId", previousOwnerId] }
                            }
                        }
                    }
                },
                // 3. Add previousOwner as editor and update ownerId
                {
                    $set: {
                        ownerId: newOwnerId,
                        permissions: {
                            $concatArrays: [
                                "$permissions",
                                [{
                                    userId: previousOwnerId,
                                    level: 'editor',
                                    grantedBy: newOwnerId,
                                    grantedAt: now
                                }]
                            ]
                        },
                        updatedAt: now
                    }
                }
            ],
            { returnDocument: 'after' }
        );
    }

    /**
     * Calculate permission level from access document
     */
    private static calculatePermission(
        access: WorkflowAccessDocument,
        userId: string
    ): PermissionLevel | null {
        // Owner has full access
        // Normalize both to strings for comparison (ownerId might be ObjectId or string)
        const ownerIdStr = String(access.ownerId);
        const userIdStr = String(userId);
        if (ownerIdStr === userIdStr) {
            return 'owner';
        }

        // Check user permissions
        const userPermission = access.permissions.find(p => p.userId === userId);
        if (userPermission) {
            return userPermission.level;
        }

        // Check visibility
        if (access.visibility === 'public') {
            return 'viewer'; // Public workflows are viewable by all
        }

        // Private by default
        return null;
    }

    /**
     * Get user's permission level for a workflow
     */
    static async getUserPermission(
        workflowId: string,
        userId: string
    ): Promise<PermissionLevel | null> {
        const access = await this.findByWorkflowId(workflowId);
        if (!access) {
            return null;
        }

        return this.calculatePermission(access, userId);
    }

    /**
     * Check if user has required permission
     */
    static async hasPermission(
        workflowId: string,
        userId: string,
        requiredLevel: PermissionLevel
    ): Promise<boolean> {
        const userLevel = await this.getUserPermission(workflowId, userId);
        if (!userLevel) {
            return false;
        }

        const levelHierarchy: PermissionLevel[] = ['viewer', 'runner', 'editor', 'owner'];
        const userIndex = levelHierarchy.indexOf(userLevel);
        const requiredIndex = levelHierarchy.indexOf(requiredLevel);

        return userIndex >= requiredIndex;
    }

    /**
     * Calculate user's permission level from access document
     * Helper method that doesn't perform DB queries
     */
    static calculateUserPermission(
        access: WorkflowAccessDocument | null | undefined,
        userId: string
    ): PermissionLevel | null {
        if (!access) {
            return null;
        }

        // Owner has full access
        // Normalize both to strings for comparison (ownerId might be ObjectId or string)
        const ownerIdStr = String(access.ownerId);
        const userIdStr = String(userId);
        if (ownerIdStr === userIdStr) {
            return 'owner';
        }

        // Check user permissions
        if (access.permissions) {
            const userPermission = access.permissions.find(p => String(p.userId) === userIdStr);
            if (userPermission) {
                return userPermission.level;
            }
        }

        // Check visibility
        if (access.visibility === 'public') {
            return 'viewer'; // Public workflows are viewable by all
        }

        // Private by default
        return null;
    }

    /**
     * Get workflows shared with a user
     */
    static async getSharedWorkflows(userId: string): Promise<string[]> {
        await this.ensureIndexes();
        const db = getDB();
        
        const workflows = await db.collection<WorkflowAccessDocument>(COLLECTION_NAME)
            .find({
                $or: [
                    { ownerId: userId },
                    { 'permissions.userId': userId },
                    { visibility: 'public' },
                ],
            })
            .limit(MAX_WORKFLOW_PERMISSIONS)
            .toArray();
        
        if (workflows.length === MAX_WORKFLOW_PERMISSIONS) {
            console.warn(
                `[WorkflowPermission] getSharedWorkflows() query may have been truncated at ${MAX_WORKFLOW_PERMISSIONS} entries. ` +
                `Consider increasing MAX_WORKFLOW_PERMISSIONS.`
            );
        }

        return workflows.map(w => w.workflowId);
    }

    /**
     * Get workflows shared with a user, including the permission level
     * Optimized to avoid N+1 queries
     */
    static async getSharedWorkflowsWithPermissions(userId: string): Promise<{ workflowId: string; permission: PermissionLevel }[]> {
        await this.ensureIndexes();
        const db = getDB();

        const workflows = await db.collection<WorkflowAccessDocument>(COLLECTION_NAME)
            .find({
                $or: [
                    { ownerId: userId },
                    { 'permissions.userId': userId },
                    { visibility: 'public' },
                ],
            })
            .limit(MAX_WORKFLOW_PERMISSIONS)
            .toArray();

        if (workflows.length === MAX_WORKFLOW_PERMISSIONS) {
            console.warn(
                `[WorkflowPermission] getSharedWorkflowsWithPermissions() query may have been truncated at ${MAX_WORKFLOW_PERMISSIONS} entries.`
            );
        }

        return workflows
            .map(w => ({
                workflowId: w.workflowId,
                permission: this.calculatePermission(w, userId)
            }))
            .filter((item): item is { workflowId: string; permission: PermissionLevel } => item.permission !== null);
    }
}

export class WorkflowActivityModel {
    private static readonly ACTIVITY_COLLECTION = 'workflowActivities';

    /**
     * Add activity log entry
     */
    static async addActivity(
        workflowId: string,
        userId: string,
        userName: string | undefined,
        action: string,
        details?: string
    ): Promise<void> {
        const db = getDB();
        const now = new Date();

        const activity: ActivityLogEntry = {
            timestamp: now,
            userId,
            userName,
            action,
            details,
        };

        // Uses atomic update with upsert to create or update document
        await db.collection<WorkflowActivityDocument>(this.ACTIVITY_COLLECTION).updateOne(
            { workflowId },
            {
                $push: { activities: activity },
                $set: { updatedAt: now },
                $setOnInsert: { createdAt: now }
            },
            { upsert: true }
        );
    }

    /**
     * Get activity log for a workflow
     */
    static async getActivityLog(workflowId: string): Promise<ActivityLogEntry[]> {
        const db = getDB();
        const doc = await db.collection<WorkflowActivityDocument>(this.ACTIVITY_COLLECTION).findOne({ workflowId });
        return doc?.activities || [];
    }

    /**
     * Delete all permissions and activity logs for a workflow
     * Used when deleting a workflow
     * 
     * @param workflowId Workflow ID
     * @returns Number of documents deleted
     */
    static async deleteByWorkflowId(workflowId: string): Promise<number> {
        const db = getDB();
        
        // Delete workflow access document
        const accessResult = await db
            .collection<WorkflowAccessDocument>(COLLECTION_NAME)
            .deleteOne({ workflowId });
        
        // Delete activity log
        const activityResult = await db
            .collection<WorkflowActivityDocument>(this.ACTIVITY_COLLECTION)
            .deleteOne({ workflowId });
        
        return (accessResult.deletedCount || 0) + (activityResult.deletedCount || 0);
    }
}
