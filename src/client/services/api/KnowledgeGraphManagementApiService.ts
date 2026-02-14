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
  relationships?: Array<{ sourceId: string; targetId: string; type: string }>;
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

export class KnowledgeGraphManagementApiService extends BaseApiService {
  /**
   * Execute a SPARQL query
   */
  async executeQuery(request: SPARQLQueryRequest): Promise<SPARQLQueryResult> {
    return this.post<SPARQLQueryResult>('/kg/query', request);
  }

  /**
   * Get current branch status, pending changes, and stash info
   */
  async getStatus(): Promise<KGStatus> {
    return this.get<KGStatus>('/kg/status');
  }

  /**
   * List all branches
   */
  async getBranches(): Promise<{ success: boolean; branches: KGBranch[] }> {
    return this.get<{ success: boolean; branches: KGBranch[] }>('/kg/branches');
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, setAsCurrent?: boolean, parentBranch?: string): Promise<{ success: boolean; message: string; branch: string }> {
    return this.post<{ success: boolean; message: string; branch: string }>('/kg/branches', {
      name,
      setAsCurrent,
      parentBranch,
    });
  }

  /**
   * Switch to a branch
   */
  async switchBranch(name: string, stashChanges?: boolean): Promise<{ success: boolean; message: string; branch: string }> {
    return this.post<{ success: boolean; message: string; branch: string }>(`/kg/branches/${name}/switch`, {
      stashChanges,
    });
  }

  /**
   * Commit pending changes to current branch
   */
  async commit(request: KGCommitRequest): Promise<KGCommitResponse> {
    return this.post<KGCommitResponse>('/kg/commit', request);
  }

  /**
   * Stash current changes
   */
  async stash(request: KGStashRequest): Promise<KGStashResponse> {
    return this.post<KGStashResponse>('/kg/stash', request);
  }

  /**
   * List all stashes (optionally filtered by branch)
   */
  async listStashes(branch?: string): Promise<KGStashListResponse> {
    const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
    return this.get<KGStashListResponse>(`/kg/stash${params}`);
  }

  /**
   * Get a specific stash
   */
  async getStash(stashId: string): Promise<{ success: boolean; stash: KGStash }> {
    return this.get<{ success: boolean; stash: KGStash }>(`/kg/stash/${stashId}`);
  }

  /**
   * Apply stashed changes
   */
  async stashPop(stashId: string, targetBranch?: string): Promise<{ success: boolean; message: string; stashId: string }> {
    return this.post<{ success: boolean; message: string; stashId: string }>('/kg/stash/pop', {
      stashId,
      targetBranch,
    });
  }

  /**
   * Discard stashed changes
   */
  async stashDrop(stashId: string): Promise<{ success: boolean; message: string }> {
    return this.post<{ success: boolean; message: string }>('/kg/stash/drop', {
      stashId,
    });
  }

  /**
   * Merge one branch into another
   */
  async merge(request: KGMergeRequest): Promise<KGMergeResponse> {
    return this.post<KGMergeResponse>('/kg/merge', request);
  }

  /**
   * Get differences between two branches
   */
  async getDiff(branch1: string, branch2: string): Promise<{
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
      added: Array<{ sourceId: string; targetId: string; type: string }>;
      removed: Array<{ sourceId: string; targetId: string; type: string }>;
      modified: Array<{ sourceId: string; targetId: string; type: string }>;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
    };
  }> {
    return this.get<{
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
        added: Array<{ sourceId: string; targetId: string; type: string }>;
        removed: Array<{ sourceId: string; targetId: string; type: string }>;
        modified: Array<{ sourceId: string; targetId: string; type: string }>;
        addedCount: number;
        removedCount: number;
        modifiedCount: number;
      };
    }>(`/kg/diff/${branch1}/${branch2}`);
  }

  /**
   * Get version history
   */
  async getLog(branch?: string, limit?: number): Promise<{
    success: boolean;
    versions: unknown[];
    message?: string;
  }> {
    const params = new URLSearchParams();
    if (branch) params.append('branch', branch);
    if (limit) params.append('limit', String(limit));
    const queryString = params.toString();
    return this.get<{
      success: boolean;
      versions: unknown[];
      message?: string;
    }>(`/kg/log${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Reset to a specific version
   */
  async reset(version: string): Promise<{ success: boolean; message: string }> {
    return this.post<{ success: boolean; message: string }>('/kg/reset', { version });
  }
}

