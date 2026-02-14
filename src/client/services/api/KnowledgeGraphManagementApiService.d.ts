/**
 * Knowledge Graph Management API Service
 *
 * Provides methods for:
 * - SPARQL query execution
 * - Git-like versioning commands (branch, commit, stash, merge, etc.)
 * - Branch status and pending changes
 */
import { BaseApiService } from './BaseApiService';
export interface SPARQLQueryRequest {
    query: string;
    limit?: number;
    timeout?: number;
    queryType?: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE';
}
export interface SPARQLQueryResult {
    success: boolean;
    query: string;
    records?: Array<Record<string, string>>;
    boolean?: boolean;
    triples?: string;
    summary: {
        recordCount: number;
        executionTime: number;
        success: boolean;
        queryType: string;
    };
}
export interface KGStatus {
    success: boolean;
    currentBranch: string;
    stats: {
        entityCount: number;
        relationshipCount: number;
    };
    pendingChanges: {
        branch: string;
        entityCount: number;
        relationshipCount: number;
    };
}
export interface KGBranch {
    name: string;
    isCurrent: boolean;
}
export interface KGCommitRequest {
    message?: string;
    workflowRunId?: string;
    metadata?: Record<string, unknown>;
}
export interface KGCommitResponse {
    success: boolean;
    message: string;
    version: string;
    branch: string;
    entityCount: number;
    relationshipCount: number;
}
export interface KGStashRequest {
    description?: string;
}
export interface KGStashResponse {
    success: boolean;
    message: string;
    stashId: string;
    branch: string;
}
export interface KGStash {
    stashId: string;
    branch: string;
    timestamp: string;
    entityCount: number;
    relationshipCount: number;
    entityIds?: string[];
    relationships?: Array<{
        sourceId: string;
        targetId: string;
        type: string;
    }>;
    description?: string;
}
export interface KGStashListResponse {
    success: boolean;
    stashes: KGStash[];
    count: number;
}
export interface KGMergeRequest {
    sourceBranch: string;
    targetBranch: string;
}
export interface KGMergeResponse {
    success: boolean;
    merged: boolean;
    conflicts: Array<{
        entityId: string;
        conflictType: 'entity_exists' | 'relationship_exists' | 'property_mismatch';
        message: string;
    }>;
    entitiesAdded: number;
    relationshipsAdded: number;
    entitiesUpdated: number;
    relationshipsUpdated: number;
}
export declare class KnowledgeGraphManagementApiService extends BaseApiService {
    /**
     * Execute a SPARQL query
     */
    executeQuery(request: SPARQLQueryRequest): Promise<SPARQLQueryResult>;
    /**
     * Get current branch status, pending changes, and stash info
     */
    getStatus(): Promise<KGStatus>;
    /**
     * List all branches
     */
    getBranches(): Promise<{
        success: boolean;
        branches: KGBranch[];
    }>;
    /**
     * Create a new branch
     */
    createBranch(name: string, setAsCurrent?: boolean, parentBranch?: string): Promise<{
        success: boolean;
        message: string;
        branch: string;
    }>;
    /**
     * Switch to a branch
     */
    switchBranch(name: string, stashChanges?: boolean): Promise<{
        success: boolean;
        message: string;
        branch: string;
    }>;
    /**
     * Commit pending changes to current branch
     */
    commit(request: KGCommitRequest): Promise<KGCommitResponse>;
    /**
     * Stash current changes
     */
    stash(request: KGStashRequest): Promise<KGStashResponse>;
    /**
     * List all stashes (optionally filtered by branch)
     */
    listStashes(branch?: string): Promise<KGStashListResponse>;
    /**
     * Get a specific stash
     */
    getStash(stashId: string): Promise<{
        success: boolean;
        stash: KGStash;
    }>;
    /**
     * Apply stashed changes
     */
    stashPop(stashId: string, targetBranch?: string): Promise<{
        success: boolean;
        message: string;
        stashId: string;
    }>;
    /**
     * Discard stashed changes
     */
    stashDrop(stashId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Merge one branch into another
     */
    merge(request: KGMergeRequest): Promise<KGMergeResponse>;
    /**
     * Get differences between two branches
     */
    getDiff(branch1: string, branch2: string): Promise<{
        success: boolean;
        branch1: string;
        branch2: string;
        entities: {
            added: string[];
            removed: string[];
            modified: string[];
            addedCount: number;
            removedCount: number;
            modifiedCount: number;
        };
        relationships: {
            added: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            removed: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            modified: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            addedCount: number;
            removedCount: number;
            modifiedCount: number;
        };
    }>;
    /**
     * Get version history
     */
    getLog(branch?: string, limit?: number): Promise<{
        success: boolean;
        versions: unknown[];
        message?: string;
    }>;
    /**
     * Reset to a specific version
     */
    reset(version: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
