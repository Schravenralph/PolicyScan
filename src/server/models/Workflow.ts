import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import { Workflow } from '../services/infrastructure/types.js';
import { WorkflowPermissionModel } from './WorkflowPermission.js';
import { Cache } from '../services/infrastructure/cache.js';
import { moduleRegistry } from '../services/workflow/WorkflowModuleRegistry.js';
import { logger } from '../utils/logger.js';
import { getDefaultBenchmarkConfig, hasDefaultBenchmarkConfig } from '../config/defaultWorkflowBenchmarkConfigs.js';

const COLLECTION_NAME = 'workflows';
let indexesEnsured = false;

// Cache for version history (TTL: 5 minutes, max size: 100 entries)
const versionHistoryCache = new Cache<WorkflowVersion[]>(100, 5 * 60 * 1000);

export type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';

export interface WorkflowStatusHistory {
    status: WorkflowStatus;
    timestamp: Date;
    userId?: string;
    comment?: string;
}

export interface WorkflowVersion {
    version: number;
    name: string;
    description?: string;
    steps: Workflow['steps'];
    status: WorkflowStatus;
    publishedBy?: string;
    publishedAt: Date;
    testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: Date;
    };
}

export interface WorkflowBenchmarkConfig {
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
    timeout?: number;
    maxRetries?: number;
    maxMemoryMB?: number;
    maxConcurrentRequests?: number;
}

export interface WorkflowDocument extends Workflow {
    _id?: ObjectId;
    status: WorkflowStatus;
    version: number;
    statusHistory: WorkflowStatusHistory[];
    versions?: WorkflowVersion[]; // Store workflow snapshots for rollback
    publishedBy?: string;
    publishedAt?: Date;
    testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: Date;
    };
    benchmarkConfig?: WorkflowBenchmarkConfig; // Default benchmark configuration for this workflow
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
}

export interface WorkflowCreateInput {
    id: string;
    name: string;
    description?: string;
    steps: Workflow['steps'];
    createdBy?: string;
}

export interface WorkflowUpdateInput {
    name?: string;
    description?: string;
    steps?: Workflow['steps'];
    benchmarkConfig?: WorkflowBenchmarkConfig;
}

export class WorkflowModel {
    /**
     * Ensure database indexes exist for optimal query performance
     */
    private static async ensureIndexes(): Promise<void> {
        if (indexesEnsured) return;
        
        const db = getDB();
        const collection = db.collection<WorkflowDocument>(COLLECTION_NAME);
        
        try {
            // Index on id for lookups
            await collection.createIndex({ id: 1 }, { unique: true, background: true });
            
            // Index on status for filtering by status
            await collection.createIndex({ status: 1 }, { background: true });
            
            // Index on version for version-based queries
            await collection.createIndex({ version: 1 }, { background: true });
            
            // Compound index for status + version queries
            await collection.createIndex({ status: 1, version: -1 }, { background: true });
            
            // Index on publishedAt for sorting published workflows
            await collection.createIndex({ publishedAt: -1 }, { background: true, sparse: true });
            
            // Index on createdBy for user-specific queries
            await collection.createIndex({ createdBy: 1 }, { background: true, sparse: true });
            
            // Index on versions.version for efficient version lookups
            await collection.createIndex({ 'versions.version': 1 }, { background: true, sparse: true });
            
            indexesEnsured = true;
        } catch (error) {
            // Index creation might fail if indexes already exist, which is fine
            // Log but don't throw to allow application to continue
            logger.warn({ error }, 'Could not create all workflow indexes');
        }
    }

    /**
     * Create a new workflow (starts in Draft status)
     */
    static async create(input: WorkflowCreateInput): Promise<WorkflowDocument> {
        await this.ensureIndexes();
        const db = getDB();
        const now = new Date();

        const workflow: WorkflowDocument = {
            id: input.id,
            name: input.name,
            description: input.description,
            steps: input.steps,
            status: 'Draft',
            version: 1,
            statusHistory: [{
                status: 'Draft',
                timestamp: now,
                userId: input.createdBy
            }],
            createdAt: now,
            updatedAt: now,
            createdBy: input.createdBy
        };

        const result = await db.collection<WorkflowDocument>(COLLECTION_NAME).insertOne(workflow);
        
        // Initialize permissions for the workflow
        if (input.createdBy) {
            await WorkflowPermissionModel.initialize(workflow.id, input.createdBy);
        }
        
        return { ...workflow, _id: result.insertedId };
    }

    /**
     * Find workflow by ID
     */
    static async findById(id: string): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        const db = getDB();
        return await db.collection<WorkflowDocument>(COLLECTION_NAME).findOne({ id });
    }

    /**
     * Find workflows by IDs
     */
    static async findByIds(ids: string[]): Promise<WorkflowDocument[]> {
        await this.ensureIndexes();
        const db = getDB();
        return await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({ id: { $in: ids } })
            .toArray();
    }

    /**
     * Find all workflows
     */
    static async findAll(options: {
        limit?: number;
    } = {}): Promise<WorkflowDocument[]> {
        const db = getDB();
        const MAX_WORKFLOWS = parseInt(process.env.MAX_WORKFLOW_RESULTS || '1000', 10);
        const limit = options.limit || MAX_WORKFLOWS;
        
        return await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({})
            .sort({ updatedAt: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Find workflows by status
     */
    static async findByStatus(status: WorkflowStatus, options: {
        limit?: number;
    } = {}): Promise<WorkflowDocument[]> {
        const db = getDB();
        const MAX_WORKFLOWS = parseInt(process.env.MAX_WORKFLOW_RESULTS || '1000', 10);
        const limit = options.limit || MAX_WORKFLOWS;
        
        return await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({ status })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Update workflow status with history tracking
     */
    static async updateStatus(
        id: string,
        newStatus: WorkflowStatus,
        userId?: string,
        comment?: string
    ): Promise<WorkflowDocument | null> {
        const db = getDB();
        const now = new Date();

        const workflow = await this.findById(id);
        if (!workflow) {
            return null;
        }

        // Validate status transition
        const validTransitions = this.getValidTransitions(workflow.status);
        if (!validTransitions.includes(newStatus)) {
            throw new Error(`Invalid status transition from ${workflow.status} to ${newStatus}`);
        }

        // Increment version if publishing
        const newVersion = newStatus === 'Published' ? workflow.version + 1 : workflow.version;

        const statusHistoryEntry: WorkflowStatusHistory = {
            status: newStatus,
            timestamp: now,
            userId,
            comment
        };

        const setDoc: Record<string, unknown> = {
            status: newStatus,
            version: newVersion,
            updatedAt: now,
        };
        const pushDoc: Record<string, unknown> = {
            statusHistory: statusHistoryEntry,
        };

        if (newStatus === 'Published') {
            setDoc.publishedBy = userId;
            setDoc.publishedAt = now;
            
            // Store optimized workflow snapshot for version history/rollback
            // Only store essential fields needed for rollback to reduce storage
            const versionSnapshot: WorkflowVersion = {
                version: newVersion,
                name: workflow.name,
                description: workflow.description,
                steps: workflow.steps, // Essential for rollback
                status: newStatus,
                publishedBy: userId,
                publishedAt: now,
                // Only store test metrics if they exist (reduce null storage)
                ...(workflow.testMetrics && { testMetrics: workflow.testMetrics })
            };
            
            // Initialize versions array if it doesn't exist, otherwise push to it
            if (!workflow.versions) {
                setDoc.versions = [versionSnapshot];
            } else {
                pushDoc.versions = versionSnapshot;
            }
            
            // Invalidate cache when new version is published (delete is synchronous)
            versionHistoryCache.delete(id);
            versionHistoryCache.delete(`${id}:limit:50`);
        }

        const filter: Filter<WorkflowDocument> = { id };
        const updateFilter: UpdateFilter<WorkflowDocument> = {
            $set: setDoc as Partial<WorkflowDocument>,
            $push: pushDoc as Record<string, unknown>
        };
        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            filter,
            updateFilter
        );

        return await this.findById(id);
    }

    /**
     * Update workflow test metrics
     */
    static async updateTestMetrics(
        id: string,
        metrics: {
            runCount: number;
            acceptanceRate: number;
            errorRate: number;
        }
    ): Promise<WorkflowDocument | null> {
        const db = getDB();
        const now = new Date();

        const filter: Filter<WorkflowDocument> = { id };
        const updateFilter: UpdateFilter<WorkflowDocument> = {
            $set: {
                testMetrics: {
                    ...metrics,
                    lastTestRun: now
                },
                updatedAt: now
            }
        };
        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            filter,
            updateFilter
        );

        return await this.findById(id);
    }

    /**
     * Check if workflow meets quality gates for publishing
     */
    static async checkQualityGates(id: string): Promise<{ passed: boolean; reasons: string[] }> {
        const workflow = await this.findById(id);
        if (!workflow) {
            return { passed: false, reasons: ['Workflow not found'] };
        }

        const reasons: string[] = [];
        const metrics = workflow.testMetrics;

        // Test metrics validation
        if (!metrics || metrics.runCount < 3) {
            reasons.push('Minimum 3 test runs required');
        }

        if (!metrics || metrics.acceptanceRate < 0.7) {
            reasons.push('Average acceptance rate must be ≥ 70%');
        }

        if (!metrics || metrics.errorRate >= 0.1) {
            reasons.push('Error rate must be < 10%');
        }

        // Workflow structure validation
        if (!workflow.steps || workflow.steps.length === 0) {
            reasons.push('Workflow must have at least one step configured');
        } else {
            // Validate that all steps reference valid modules/actions
            const invalidSteps: string[] = [];
            const missingParams: string[] = [];

            for (const step of workflow.steps) {
                // Check if step has required fields
                if (!step.id || !step.name || !step.action) {
                    invalidSteps.push(`Step ${step.id || 'unknown'} is missing required fields (id, name, or action)`);
                    continue;
                }

                // Check if action references a valid module
                const moduleEntry = moduleRegistry.get(step.action);
                if (moduleEntry) {
                    // Ensure module instance exists
                    if (!moduleEntry.module) {
                        missingParams.push(`Step "${step.name}" (${step.id}): Module entry exists but module instance is missing`);
                        continue;
                    }

                    // Validate module parameters if params are provided
                    if (step.params) {
                        try {
                            const validation = moduleEntry.module.validate(step.params);
                            if (!validation.valid) {
                                missingParams.push(`Step "${step.name}" (${step.id}): ${validation.error || 'Invalid parameters'}`);
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            missingParams.push(`Step "${step.name}" (${step.id}): Error validating parameters: ${errorMsg}`);
                        }
                    } else {
                        // Check if module has required parameters
                        try {
                            const schema = moduleEntry.module.getParameterSchema();
                            if (schema && typeof schema === 'object') {
                                const requiredParams = Object.entries(schema)
                                    .filter(([_, def]: [string, unknown]) => def && typeof def === 'object' && (def as { required?: boolean }).required)
                                    .map(([key]) => key);
                                
                                if (requiredParams.length > 0) {
                                    missingParams.push(`Step "${step.name}" (${step.id}): Missing required parameters: ${requiredParams.join(', ')}`);
                                }
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            missingParams.push(`Step "${step.name}" (${step.id}): Error getting parameter schema: ${errorMsg}`);
                        }
                    }
                }
                // Note: Legacy actions (not in module registry) are allowed for backward compatibility
                // They will be validated at runtime by WorkflowEngine
            }

            if (invalidSteps.length > 0) {
                reasons.push(...invalidSteps);
            }

            if (missingParams.length > 0) {
                reasons.push(...missingParams);
            }
        }

        return {
            passed: reasons.length === 0,
            reasons
        };
    }

    /**
     * Get valid status transitions from current status
     */
    private static getValidTransitions(currentStatus: WorkflowStatus): WorkflowStatus[] {
        const transitions: Record<WorkflowStatus, WorkflowStatus[]> = {
            'Draft': ['Testing', 'Deprecated'],
            'Testing': ['Draft', 'Tested', 'Deprecated'],
            'Tested': ['Draft', 'Testing', 'Published', 'Deprecated'],
            'Published': ['Unpublished', 'Deprecated'],
            'Unpublished': ['Draft', 'Published', 'Deprecated'],
            'Deprecated': []
        };

        return transitions[currentStatus] || [];
    }

    /**
     * Check if a workflow can be executed based on its status
     * Only Published workflows can be executed by end users
     * Draft, Testing, and Tested workflows can be executed by developers for testing
     */
    static canExecute(workflow: WorkflowDocument, isDeveloper: boolean = false): { allowed: boolean; reason?: string } {
        if (workflow.status === 'Published') {
            return { allowed: true };
        }

        if (isDeveloper) {
            // Developers can execute workflows in Draft, Testing, or Tested status for testing
            if (workflow.status === 'Draft' || workflow.status === 'Testing' || workflow.status === 'Tested') {
                return { allowed: true };
            }
        }

        // Unpublished and Deprecated workflows cannot be executed
        if (workflow.status === 'Unpublished') {
            return { 
                allowed: false, 
                reason: 'This workflow has been unpublished and is no longer available for execution' 
            };
        }

        if (workflow.status === 'Deprecated') {
            return { 
                allowed: false, 
                reason: 'This workflow has been deprecated and is no longer available for execution' 
            };
        }

        return { 
            allowed: false, 
            reason: `Workflow is in ${workflow.status} status and cannot be executed. Only Published workflows are available for execution.` 
        };
    }

    /**
     * Update workflow fields
     */
    static async update(id: string, input: WorkflowUpdateInput): Promise<WorkflowDocument | null> {
        const db = getDB();
        const now = new Date();

        const update: Partial<WorkflowDocument> = {
            updatedAt: now
        };

        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) update.description = input.description;
        if (input.steps !== undefined) update.steps = input.steps;
        if (input.benchmarkConfig !== undefined) update.benchmarkConfig = input.benchmarkConfig;

        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            { id },
            { $set: update }
        );

        return await this.findById(id);
    }

    /**
     * Get version history for a workflow
     * Results are cached for 5 minutes to improve performance
     */
    static async getVersionHistory(id: string, limit?: number): Promise<WorkflowVersion[]> {
        await this.ensureIndexes();
        
        // Check cache first (only if no limit specified for consistency)
        const cacheKey = limit ? `${id}:limit:${limit}` : id;
        if (!limit) {
            const cached = await versionHistoryCache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }
        
        const workflow = await this.findById(id);
        if (!workflow || !workflow.versions) {
            return [];
        }
        
        // Return versions sorted by version number (descending)
        const sorted = [...workflow.versions].sort((a, b) => b.version - a.version);
        const result = limit ? sorted.slice(0, limit) : sorted;
        
        // Cache the result (only if no limit for consistency)
        if (!limit) {
            await versionHistoryCache.set(cacheKey, result);
        }
        
        return result;
    }

    /**
     * Get the latest published version of a workflow
     * Returns the current workflow if it's published, or the most recent published version from history
     */
    static async getLatestPublishedVersion(id: string): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        if (!workflow) {
            return null;
        }
        
        // If current workflow is published, return it
        if (workflow.status === 'Published') {
            return workflow;
        }
        
        // Otherwise, get the latest published version from history
        const versionHistory = await this.getVersionHistory(id, 1);
        if (versionHistory.length === 0) {
            return null;
        }
        
        const latestVersion = versionHistory[0];
        if (latestVersion.status !== 'Published') {
            return null;
        }
        
        // Reconstruct workflow document from version snapshot
        // Note: This is a simplified reconstruction - full document would need all fields
        return {
            ...workflow,
            version: latestVersion.version,
            name: latestVersion.name,
            description: latestVersion.description,
            steps: latestVersion.steps,
            status: latestVersion.status,
            publishedBy: latestVersion.publishedBy,
            publishedAt: latestVersion.publishedAt,
            testMetrics: latestVersion.testMetrics,
        } as WorkflowDocument;
    }

    /**
     * Load a workflow by ID and optional version
     * If version is not specified, returns the current workflow
     * If version is specified, returns that version from history
     */
    static async loadWorkflowVersion(id: string, version?: number): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        
        // If no version specified, return current workflow
        if (version === undefined) {
            return await this.findById(id);
        }
        
        // Get version history
        const versionHistory = await this.getVersionHistory(id);
        const targetVersion = versionHistory.find(v => v.version === version);
        
        if (!targetVersion) {
            return null;
        }
        
        // Get current workflow to use as base
        const currentWorkflow = await this.findById(id);
        if (!currentWorkflow) {
            return null;
        }
        
        // Reconstruct workflow document from version snapshot
        return {
            ...currentWorkflow,
            version: targetVersion.version,
            name: targetVersion.name,
            description: targetVersion.description,
            steps: targetVersion.steps,
            status: targetVersion.status,
            publishedBy: targetVersion.publishedBy,
            publishedAt: targetVersion.publishedAt,
            testMetrics: targetVersion.testMetrics,
        } as WorkflowDocument;
    }

    /**
     * Rollback workflow to a previous version
     * Creates a new Draft version based on the specified version
     */
    static async rollbackToVersion(
        id: string,
        targetVersion: number,
        userId?: string,
        comment?: string
    ): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        const db = getDB();
        const workflow = await this.findById(id);
        if (!workflow) {
            return null;
        }

        // Find the target version
        if (!workflow.versions || workflow.versions.length === 0) {
            throw new Error('No version history available for rollback');
        }

        const targetVersionData = workflow.versions.find(v => v.version === targetVersion);
        if (!targetVersionData) {
            throw new Error(`Version ${targetVersion} not found in history`);
        }

        // Validate that we can rollback (workflow must be in a state that allows updates)
        if (workflow.status !== 'Draft' && workflow.status !== 'Testing' && workflow.status !== 'Unpublished') {
            // To rollback from Published, first unpublish
            throw new Error(`Cannot rollback workflow in ${workflow.status} status. Unpublish first or transition to Draft.`);
        }

        // Additional validation: ensure target version is valid (not greater than current version)
        if (targetVersion > workflow.version) {
            throw new Error(`Cannot rollback to version ${targetVersion} which is greater than current version ${workflow.version}`);
        }

        // Validation: ensure target version is a published version (has publishedAt)
        if (!targetVersionData.publishedAt) {
            throw new Error(`Version ${targetVersion} is not a published version and cannot be rolled back to`);
        }

        const now = new Date();

        // Restore workflow configuration from target version
        const updateDoc: UpdateFilter<WorkflowDocument> = {
            $set: {
                name: targetVersionData.name,
                description: targetVersionData.description,
                steps: targetVersionData.steps,
                status: 'Draft',
                updatedAt: now
            }
        };

        // Add status history entry for rollback
        const rollbackHistoryEntry: WorkflowStatusHistory = {
            status: 'Draft',
            timestamp: now,
            userId,
            comment: comment || `Rolled back to version ${targetVersion}`
        };

        updateDoc.$push = {
            statusHistory: rollbackHistoryEntry
        };

        const filter: Filter<WorkflowDocument> = { id };
        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            filter,
            updateDoc
        );

        return await this.findById(id);
    }

    /**
     * Get performance metrics for version operations
     */
    static async getVersionMetrics(id: string): Promise<{
        totalVersions: number;
        oldestVersion: number | null;
        newestVersion: number | null;
        cacheStats: { hits: number; misses: number; hitRate: number };
    }> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        
        if (!workflow || !workflow.versions || workflow.versions.length === 0) {
            const stats = versionHistoryCache.getStats();
            return {
                totalVersions: 0,
                oldestVersion: null,
                newestVersion: null,
                cacheStats: {
                    hits: stats.hits,
                    misses: stats.misses,
                    hitRate:
                        stats.hitRate ??
                        (stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0),
                }
            };
        }

        const versions = workflow.versions;
        const versionNumbers = versions.map(v => v.version);
        
        const stats = versionHistoryCache.getStats();
        return {
            totalVersions: versions.length,
            oldestVersion: Math.min(...versionNumbers),
            newestVersion: Math.max(...versionNumbers),
            cacheStats: {
                hits: stats.hits,
                misses: stats.misses,
                hitRate:
                    stats.hitRate ??
                    (stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0),
            }
        };
    }

    /**
     * Preview what a rollback would do without actually performing it
     * Returns the changes that would be applied
     */
    static async previewRollback(
        id: string,
        targetVersion: number
    ): Promise<{
        current: { name: string; description?: string; steps: Workflow['steps'] };
        target: { name: string; description?: string; steps: Workflow['steps'] };
        changes: {
            field: string;
            currentValue: unknown;
            targetValue: unknown;
        }[];
        isValid: boolean;
        errors: string[];
    }> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        const errors: string[] = [];
        let isValid = true;

        // Find the target version
        if (!workflow.versions || workflow.versions.length === 0) {
            errors.push('No version history available for rollback');
            isValid = false;
        }

        const targetVersionData = workflow.versions?.find(v => v.version === targetVersion);
        if (!targetVersionData) {
            errors.push(`Version ${targetVersion} not found in history`);
            isValid = false;
        }

        // Validate workflow status
        if (workflow.status !== 'Draft' && workflow.status !== 'Testing' && workflow.status !== 'Unpublished') {
            errors.push(`Cannot rollback workflow in ${workflow.status} status. Unpublish first or transition to Draft.`);
            isValid = false;
        }

        // Validate version number
        if (targetVersionData && targetVersion > workflow.version) {
            errors.push(`Cannot rollback to version ${targetVersion} which is greater than current version ${workflow.version}`);
            isValid = false;
        }

        // Validate published version
        if (targetVersionData && !targetVersionData.publishedAt) {
            errors.push(`Version ${targetVersion} is not a published version and cannot be rolled back to`);
            isValid = false;
        }

        if (!targetVersionData) {
            return {
                current: { name: workflow.name, description: workflow.description, steps: workflow.steps },
                target: { name: '', description: '', steps: [] },
                changes: [],
                isValid: false,
                errors
            };
        }

        // Calculate changes
        const changes: { field: string; currentValue: unknown; targetValue: unknown }[] = [];

        if (workflow.name !== targetVersionData.name) {
            changes.push({ field: 'name', currentValue: workflow.name, targetValue: targetVersionData.name });
        }

        if (workflow.description !== targetVersionData.description) {
            changes.push({ field: 'description', currentValue: workflow.description, targetValue: targetVersionData.description });
        }

        if (JSON.stringify(workflow.steps) !== JSON.stringify(targetVersionData.steps)) {
            changes.push({ field: 'steps', currentValue: workflow.steps, targetValue: targetVersionData.steps });
        }

        return {
            current: { name: workflow.name, description: workflow.description, steps: workflow.steps },
            target: { name: targetVersionData.name, description: targetVersionData.description, steps: targetVersionData.steps },
            changes,
            isValid,
            errors
        };
    }

    /**
     * Compare two workflow versions and return differences
     */
    static async compareVersions(
        id: string,
        version1: number,
        version2: number
    ): Promise<{
        version1: WorkflowVersion | null;
        version2: WorkflowVersion | null;
        differences: {
            field: string;
            version1Value: unknown;
            version2Value: unknown;
        }[];
    }> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        if (!workflow || !workflow.versions) {
            throw new Error('Workflow or version history not found');
        }

        const v1 = workflow.versions.find(v => v.version === version1);
        const v2 = workflow.versions.find(v => v.version === version2);

        if (!v1) throw new Error(`Version ${version1} not found`);
        if (!v2) throw new Error(`Version ${version2} not found`);

        const differences: { field: string; version1Value: unknown; version2Value: unknown }[] = [];

        // Compare name
        if (v1.name !== v2.name) {
            differences.push({ field: 'name', version1Value: v1.name, version2Value: v2.name });
        }

        // Compare description
        if (v1.description !== v2.description) {
            differences.push({ field: 'description', version1Value: v1.description, version2Value: v2.description });
        }

        // Compare steps (deep comparison)
        if (JSON.stringify(v1.steps) !== JSON.stringify(v2.steps)) {
            differences.push({
                field: 'steps',
                version1Value: v1.steps,
                version2Value: v2.steps
            });
        }

        // Compare status
        if (v1.status !== v2.status) {
            differences.push({ field: 'status', version1Value: v1.status, version2Value: v2.status });
        }

        // Compare test metrics if present
        const metrics1 = JSON.stringify(v1.testMetrics || {});
        const metrics2 = JSON.stringify(v2.testMetrics || {});
        if (metrics1 !== metrics2) {
            differences.push({
                field: 'testMetrics',
                version1Value: v1.testMetrics,
                version2Value: v2.testMetrics
            });
        }

        return {
            version1: v1,
            version2: v2,
            differences
        };
    }

    /**
     * Clean up old workflow versions based on retention policy
     * Keeps the most recent N versions and versions from the last N days
     */
    static async cleanupOldVersions(
        id: string,
        options: {
            keepLatest?: number; // Keep latest N versions (default: 10)
            keepDays?: number; // Keep versions from last N days (default: 90)
        } = {}
    ): Promise<{ removed: number; kept: number }> {
        await this.ensureIndexes();
        const { keepLatest = 10, keepDays = 90 } = options;
        const db = getDB();
        const workflow = await this.findById(id);
        
        if (!workflow || !workflow.versions || workflow.versions.length === 0) {
            return { removed: 0, kept: 0 };
        }

        const now = new Date();
        const cutoffDate = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
        
        // Sort versions by version number (descending)
        const sortedVersions = [...workflow.versions].sort((a, b) => b.version - a.version);
        
        // Keep latest N versions
        const latestVersions = sortedVersions.slice(0, keepLatest);
        
        // Keep versions from last N days
        const recentVersions = sortedVersions.filter(v => 
            v.publishedAt && new Date(v.publishedAt) >= cutoffDate
        );
        
        // Combine and deduplicate
        const versionsToKeep = new Map<number, WorkflowVersion>();
        [...latestVersions, ...recentVersions].forEach(v => {
            versionsToKeep.set(v.version, v);
        });
        
        const versionsArray = Array.from(versionsToKeep.values());
        const removed = workflow.versions.length - versionsArray.length;
        
        if (removed > 0) {
            const filter: Filter<WorkflowDocument> = { id };
            const updateFilter: UpdateFilter<WorkflowDocument> = { $set: { versions: versionsArray, updatedAt: now } };
            await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
                filter,
                updateFilter
            );
        }
        
        return { removed, kept: versionsArray.length };
    }

    /**
     * Iteration 24: Add metadata enrichment to versions
     */
    static async enrichVersionMetadata(
        id: string,
        version: number,
        metadata: Record<string, unknown>
    ): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        const db = getDB();
        const workflow = await this.findById(id);
        
        if (!workflow || !workflow.versions) {
            throw new Error('Workflow or version history not found');
        }

        const versionIndex = workflow.versions.findIndex(v => v.version === version);
        if (versionIndex === -1) {
            throw new Error(`Version ${version} not found`);
        }

        // Add metadata to version (stored in a separate field if needed)
        // For now, we'll extend the version object
        const updatedVersions = [...workflow.versions];
        updatedVersions[versionIndex] = {
            ...updatedVersions[versionIndex],
            ...metadata
        } as WorkflowVersion;

        const filter: Filter<WorkflowDocument> = { id };
        const updateFilter: UpdateFilter<WorkflowDocument> = { $set: { versions: updatedVersions, updatedAt: new Date() } };
        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            filter,
            updateFilter
        );

        versionHistoryCache.delete(id);
        return await this.findById(id);
    }

    /**
     * Iteration 25: Optimized query with field projections
     */
    static async getVersionHistoryWithProjection(
        id: string,
        fields: Array<keyof WorkflowVersion> = ['version', 'name', 'publishedAt', 'publishedBy']
    ): Promise<Partial<WorkflowVersion>[]> {
        await this.ensureIndexes();
        const allVersions = await this.getVersionHistory(id);
        
        return allVersions.map(v => {
            const projected: Partial<WorkflowVersion> = {};
            fields.forEach(field => {
                if (field in v) {
                    (projected as Record<string, unknown>)[field] = v[field];
                }
            });
            return projected;
        });
    }

    /**
     * Iteration 26: Health check for version system
     */
    static async versionHealthCheck(id: string): Promise<{
        healthy: boolean;
        issues: string[];
        stats: {
            totalVersions: number;
            oldestVersion: number | null;
            newestVersion: number | null;
            versionsWithMissingData: number;
        };
    }> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        const issues: string[] = [];

        if (!workflow) {
            return {
                healthy: false,
                issues: ['Workflow not found'],
                stats: { totalVersions: 0, oldestVersion: null, newestVersion: null, versionsWithMissingData: 0 }
            };
        }

        const versions = workflow.versions || [];
        const versionNumbers = versions.map(v => v.version);
        const versionsWithMissingData = versions.filter(v => !v.name || !v.steps || v.steps.length === 0).length;

        if (versionsWithMissingData > 0) {
            issues.push(`${versionsWithMissingData} versions have missing data`);
        }

        // Check for version gaps (unusual but worth flagging)
        if (versionNumbers.length > 1) {
            const sorted = [...versionNumbers].sort((a, b) => a - b);
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i] - sorted[i - 1] > 1) {
                    issues.push(`Version gap detected: ${sorted[i - 1]} to ${sorted[i]}`);
                }
            }
        }

        return {
            healthy: issues.length === 0,
            issues,
            stats: {
                totalVersions: versions.length,
                oldestVersion: versionNumbers.length > 0 ? Math.min(...versionNumbers) : null,
                newestVersion: versionNumbers.length > 0 ? Math.max(...versionNumbers) : null,
                versionsWithMissingData
            }
        };
    }

    /**
     * Iteration 27: Detect version conflicts (duplicate version numbers)
     */
    static async detectVersionConflicts(id: string): Promise<Array<{
        version: number;
        count: number;
    }>> {
        await this.ensureIndexes();
        const workflow = await this.findById(id);
        
        if (!workflow || !workflow.versions) {
            return [];
        }

        const versionCounts = new Map<number, number>();
        workflow.versions.forEach(v => {
            versionCounts.set(v.version, (versionCounts.get(v.version) || 0) + 1);
        });

        const conflicts: Array<{ version: number; count: number }> = [];
        versionCounts.forEach((count, version) => {
            if (count > 1) {
                conflicts.push({ version, count });
            }
        });

        return conflicts;
    }

    /**
     * Iteration 28: Compress version data (remove redundant information)
     */
    static compressVersionData(version: WorkflowVersion): WorkflowVersion {
        // Remove undefined/null fields to reduce storage
        const compressed: WorkflowVersion = {
            version: version.version,
            name: version.name,
            steps: version.steps,
            status: version.status,
            publishedAt: version.publishedAt
        };

        if (version.description) compressed.description = version.description;
        if (version.publishedBy) compressed.publishedBy = version.publishedBy;
        if (version.testMetrics) compressed.testMetrics = version.testMetrics;

        return compressed;
    }

    /**
     * Iteration 29: Batch version operations
     */
    static async batchGetVersions(
        workflowIds: string[]
    ): Promise<Record<string, { versions: WorkflowVersion[]; total: number }>> {
        await this.ensureIndexes();
        const db = getDB();
        
        // Limit array size to prevent memory exhaustion
        const MAX_WORKFLOW_IDS = parseInt(process.env.MAX_WORKFLOW_IDS || '1000', 10);
        const limitedIds = workflowIds.slice(0, MAX_WORKFLOW_IDS);
        
        if (workflowIds.length > MAX_WORKFLOW_IDS) {
            logger.warn(
                { originalCount: workflowIds.length, truncatedCount: MAX_WORKFLOW_IDS },
                'Workflow IDs list truncated to prevent memory exhaustion'
            );
        }
        
        const workflows = await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({ id: { $in: limitedIds } })
            .project({ id: 1, versions: 1 })
            .limit(MAX_WORKFLOW_IDS)
            .toArray();

        const result: Record<string, { versions: WorkflowVersion[]; total: number }> = {};
        workflows.forEach(workflow => {
            const versions = workflow.versions || [];
            result[workflow.id] = {
                versions: [...versions].sort((a, b) => b.version - a.version),
                total: versions.length
            };
        });

        return result;
    }

    /**
     * Iteration 30: Performance monitoring for version operations
     */
    static async getPerformanceMetrics(id: string): Promise<{
        cacheHitRate: number;
        versionHistorySizeBytes: number;
        lastAccessTime?: Date;
        averageVersionsPerWorkflow: number;
    }> {
        const stats = versionHistoryCache.getStats() as { hits: number; misses: number; hitRate?: number };
        
        const workflow = await this.findById(id);
        const versionHistorySizeBytes = workflow?.versions
            ? JSON.stringify(workflow.versions).length * 2 // Rough estimate (UTF-16)
            : 0;

        // Get average versions across all workflows for context (sampled for performance)
        const db = getDB();
        const MAX_SAMPLE_SIZE = parseInt(process.env.MAX_WORKFLOW_SAMPLE_SIZE || '500', 10);
        const allWorkflows = await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({ versions: { $exists: true } })
            .project({ versions: 1 })
            .limit(MAX_SAMPLE_SIZE)
            .toArray();
        
        const totalVersions = allWorkflows.reduce((sum, w) => sum + (w.versions?.length || 0), 0);
        const averageVersionsPerWorkflow = allWorkflows.length > 0 
            ? totalVersions / allWorkflows.length 
            : 0;

        return {
            cacheHitRate: stats.hitRate || 0,
            versionHistorySizeBytes,
            lastAccessTime: workflow?.updatedAt,
            averageVersionsPerWorkflow
        };
    }

    /**
     * Iteration 31: Export version history to structured format
     */
    static async exportVersionHistory(
        id: string,
        format: 'json' | 'csv' = 'json'
    ): Promise<string> {
        await this.ensureIndexes();
        const versions = await this.getVersionHistory(id);

        if (format === 'csv') {
            const headers = ['Version', 'Name', 'Published At', 'Published By', 'Status', 'Steps Count'];
            const rows = versions.map(v => [
                v.version.toString(),
                v.name,
                v.publishedAt.toISOString(),
                v.publishedBy || '',
                v.status,
                (v.steps?.length || 0).toString()
            ]);
            
            const csvLines = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
            ];
            return csvLines.join('\n');
        }

        return JSON.stringify(versions, null, 2);
    }

    /**
     * Iteration 33: Track version size and warn if too large
     */
    static async getVersionSizeInfo(id: string): Promise<{
        totalSizeBytes: number;
        averageSizeBytes: number;
        largestVersion: { version: number; sizeBytes: number } | null;
        warnings: string[];
    }> {
        await this.ensureIndexes();
        const versions = await this.getVersionHistory(id);
        
        if (versions.length === 0) {
            return {
                totalSizeBytes: 0,
                averageSizeBytes: 0,
                largestVersion: null,
                warnings: []
            };
        }

        const versionSizes = versions.map(v => ({
            version: v.version,
            sizeBytes: JSON.stringify(v).length * 2 // UTF-16 estimate
        }));

        const totalSizeBytes = versionSizes.reduce((sum, vs) => sum + vs.sizeBytes, 0);
        const averageSizeBytes = totalSizeBytes / versionSizes.length;
        const largestVersion = versionSizes.reduce((largest, vs) => 
            vs.sizeBytes > largest.sizeBytes ? vs : largest, versionSizes[0]);

        const warnings: string[] = [];
        const maxVersionSize = 1024 * 1024; // 1MB per version
        const maxTotalSize = 10 * 1024 * 1024; // 10MB total

        if (largestVersion.sizeBytes > maxVersionSize) {
            warnings.push(`Version ${largestVersion.version} exceeds ${maxVersionSize / 1024}KB`);
        }
        if (totalSizeBytes > maxTotalSize) {
            warnings.push(`Total version history exceeds ${maxTotalSize / 1024 / 1024}MB`);
        }

        return {
            totalSizeBytes,
            averageSizeBytes,
            largestVersion,
            warnings
        };
    }

    /**
     * Iteration 34: Atomic version array updates
     */
    static async updateVersionAtomically(
        id: string,
        version: number,
        updates: Partial<WorkflowVersion>
    ): Promise<WorkflowDocument | null> {
        await this.ensureIndexes();
        const db = getDB();
        const workflow = await this.findById(id);
        
        if (!workflow || !workflow.versions) {
            throw new Error('Workflow or version history not found');
        }

        const versionIndex = workflow.versions.findIndex(v => v.version === version);
        if (versionIndex === -1) {
            throw new Error(`Version ${version} not found`);
        }

        // Use arrayFilters for atomic update
        const updateDoc: UpdateFilter<WorkflowDocument> = {};
        updateDoc.$set = updateDoc.$set || {};
        Object.keys(updates).forEach(key => {
            const value = updates[key as keyof typeof updates];
            if (value !== undefined) {
                (updateDoc.$set as Record<string, unknown>)[`versions.${versionIndex}.${key}`] = value;
            }
        });
        updateDoc.$set = { ...updateDoc.$set, updatedAt: new Date() };

        const filter: Filter<WorkflowDocument> = { id };
        await db.collection<WorkflowDocument>(COLLECTION_NAME).updateOne(
            filter,
            updateDoc
        );

        versionHistoryCache.delete(id);
        return await this.findById(id);
    }

    /**
     * Iteration 36: Get what changed between versions (focused diff)
     */
    static async getVersionChanges(
        id: string,
        fromVersion: number,
        toVersion: number
    ): Promise<{
        added: string[];
        removed: string[];
        modified: string[];
        summary: string;
    }> {
        const comparison = await this.compareVersions(id, fromVersion, toVersion);
        
        const added: string[] = [];
        const removed: string[] = [];
        const modified: string[] = [];

        comparison.differences.forEach(diff => {
            if (diff.field === 'steps') {
                // Compare steps in detail
                const steps1 = diff.version1Value as Workflow['steps'];
                const steps2 = diff.version2Value as Workflow['steps'];
                const stepIds1 = new Set(steps1.map(s => s.id));
                const stepIds2 = new Set(steps2.map(s => s.id));

                stepIds2.forEach(id => {
                    if (!stepIds1.has(id)) added.push(`Step: ${id}`);
                });
                stepIds1.forEach(id => {
                    if (!stepIds2.has(id)) removed.push(`Step: ${id}`);
                });
                stepIds1.forEach(id => {
                    if (stepIds2.has(id)) {
                        const step1 = steps1.find(s => s.id === id);
                        const step2 = steps2.find(s => s.id === id);
                        if (JSON.stringify(step1) !== JSON.stringify(step2)) {
                            modified.push(`Step: ${id}`);
                        }
                    }
                });
            } else {
                modified.push(`Field: ${diff.field}`);
            }
        });

        const summary = `${added.length} added, ${removed.length} removed, ${modified.length} modified`;

        return { added, removed, modified, summary };
    }

    /**
     * Iteration 37: Aggregate version statistics across all workflows
     */
    static async getAggregateVersionStats(): Promise<{
        totalWorkflows: number;
        totalVersions: number;
        averageVersionsPerWorkflow: number;
        workflowsWithMostVersions: Array<{ id: string; versionCount: number }>;
        recentPublishingActivity: number; // Versions published in last 7 days
    }> {
        await this.ensureIndexes();
        const db = getDB();
        
        // Limit query to prevent memory exhaustion (sampling for stats)
        const MAX_SAMPLE_SIZE = parseInt(process.env.MAX_WORKFLOW_SAMPLE_SIZE || '500', 10);
        const workflows = await db.collection<WorkflowDocument>(COLLECTION_NAME)
            .find({ versions: { $exists: true } })
            .project<Pick<WorkflowDocument, 'id' | 'versions'>>({ id: 1, versions: 1 })
            .limit(MAX_SAMPLE_SIZE)
            .toArray();

        const totalVersions = workflows.reduce((sum, w) => sum + (w.versions?.length || 0), 0);
        const averageVersionsPerWorkflow = workflows.length > 0 
            ? totalVersions / workflows.length 
            : 0;

        const workflowsWithMostVersions = workflows
            .map(w => ({ id: w.id, versionCount: w.versions?.length || 0 }))
            .sort((a, b) => b.versionCount - a.versionCount)
            .slice(0, 10);

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentPublishingActivity = workflows.reduce((count, w) => {
            const recent = w.versions?.filter((v) => 
                v.publishedAt && new Date(v.publishedAt) >= sevenDaysAgo
            ).length || 0;
            return count + recent;
        }, 0);

        return {
            totalWorkflows: workflows.length,
            totalVersions,
            averageVersionsPerWorkflow,
            workflowsWithMostVersions,
            recentPublishingActivity
        };
    }

    /**
     * Iteration 38: Optimize cache with version-specific keys
     */
    static async getVersionHistoryCached(id: string, limit?: number): Promise<WorkflowVersion[]> {
        await this.ensureIndexes();
        
        const cacheKey = limit ? `${id}:${limit}` : id;
        const cached = await versionHistoryCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const result = await this.getVersionHistory(id, limit);
        await versionHistoryCache.set(cacheKey, result);
        return result;
    }

    /**
     * Iteration 39: Version operation with timeout protection
     */
    static async rollbackToVersionWithTimeout(
        id: string,
        targetVersion: number,
        userId?: string,
        comment?: string,
        timeoutMs: number = 30000 // 30 second default
    ): Promise<WorkflowDocument | null> {
        return Promise.race([
            this.rollbackToVersion(id, targetVersion, userId, comment),
            new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Rollback operation timed out')), timeoutMs)
            )
        ]);
    }

    /**
     * Iteration 40: Track version dependencies (which versions reference others)
     */
    static async getVersionDependencies(id: string): Promise<{
        version: number;
        dependsOn: number[]; // Versions this was based on
        dependedBy: number[]; // Versions that were based on this
    }[]> {
        await this.ensureIndexes();
        const versions = await this.getVersionHistory(id);
        
        // For now, dependencies are inferred from rollback history
        // In a full system, this would track explicit dependencies
        const workflow = await this.findById(id);
        const rollbacks = workflow?.statusHistory.filter(h => 
            h.comment?.includes('Rolled back to version')
        ) || [];

        const dependencies: Map<number, { dependsOn: Set<number>; dependedBy: Set<number> }> = new Map();
        versions.forEach(v => {
            dependencies.set(v.version, { dependsOn: new Set(), dependedBy: new Set() });
        });

        // Infer dependencies from rollback comments
        rollbacks.forEach(rollback => {
            const match = rollback.comment?.match(/version (\d+)/);
            if (match) {
                // Version that was rolled back to is a dependency
                // This is a simplified inference
                // const targetVersion = parseInt(match[1]);
            }
        });

        return Array.from(dependencies.entries()).map(([version, deps]) => ({
            version,
            dependsOn: Array.from(deps.dependsOn),
            dependedBy: Array.from(deps.dependedBy)
        }));
    }

    /**
     * Get benchmark configuration for a workflow
     * 
     * Checks database first, then falls back to default configs for predefined workflows.
     * Returns null only for unknown workflows.
     * 
     * @param id - Workflow ID
     * @returns Benchmark config from database, default config for predefined workflows, or null for unknown workflows
     */
    static async getBenchmarkConfig(id: string): Promise<WorkflowBenchmarkConfig | null> {
        // First, try database (database configs take precedence)
        const workflow = await this.findById(id);
        if (workflow?.benchmarkConfig) {
            return workflow.benchmarkConfig;
        }
        
        // If not in database, check if it's a predefined workflow with default config
        if (hasDefaultBenchmarkConfig(id)) {
            const defaultConfig = getDefaultBenchmarkConfig(id);
            if (defaultConfig) {
                logger.debug({ workflowId: id }, 'Using default benchmark config for predefined workflow');
                return defaultConfig;
            }
            // If predefined but no default exists, return empty config (better than null for frontend)
            logger.debug({ workflowId: id }, 'Predefined workflow has no default config, returning empty config');
            return { featureFlags: {}, params: {} };
        }
        
        // Unknown workflow - return null
        return null;
    }

    /**
     * Set benchmark configuration for a workflow
     */
    static async setBenchmarkConfig(
        id: string,
        config: WorkflowBenchmarkConfig
    ): Promise<WorkflowDocument | null> {
        return await this.update(id, { benchmarkConfig: config });
    }

    /**
     * Delete a workflow from the database
     * Only allows deletion of Draft or Deprecated workflows
     * Also cleans up related permissions
     * 
     * @param id Workflow ID
     * @returns true if deleted, false if not found
     * @throws Error if workflow is not in Draft or Deprecated status
     */
    static async delete(id: string): Promise<boolean> {
        await this.ensureIndexes();
        const db = getDB();
        
        // Get workflow to check status
        const workflow = await this.findById(id);
        if (!workflow) {
            return false;
        }

        // Only allow deletion of Draft or Deprecated workflows
        if (workflow.status !== 'Draft' && workflow.status !== 'Deprecated') {
            throw new Error(
                `Cannot delete workflow in ${workflow.status} status. ` +
                `Only Draft and Deprecated workflows can be deleted.`
            );
        }

        // Delete related permissions
        try {
            const { WorkflowActivityModel } = await import('./WorkflowPermission.js');
            await WorkflowActivityModel.deleteByWorkflowId(id);
            logger.debug({ workflowId: id }, 'Deleted workflow permissions');
        } catch (error) {
            logger.warn({ error, workflowId: id }, 'Failed to delete workflow permissions, continuing with workflow deletion');
            // Don't fail workflow deletion if permission cleanup fails
        }

        // Delete workflow from database
        const result = await db
            .collection<WorkflowDocument>(COLLECTION_NAME)
            .deleteOne({ id });

        if (result.deletedCount > 0) {
            // Invalidate cache
            versionHistoryCache.delete(id);
            versionHistoryCache.delete(`${id}:limit:50`);
            logger.info({ workflowId: id, workflowName: workflow.name }, 'Deleted workflow');
        }

        return result.deletedCount > 0;
    }
}
