import { BaseApiService } from './BaseApiService';

/**
 * Custom error for feature flag disabled
 */
export class FeatureFlagDisabledError extends Error {
  constructor(flagName: string) {
    super(`Feature flag ${flagName} is not enabled. Please enable KG_HIERARCHICAL_STRUCTURE_ENABLED to use this endpoint.`);
    this.name = 'FeatureFlagDisabledError';
  }
}

/**
 * Hierarchy API service
 * 
 * Note: All hierarchy endpoints require the KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag.
 * If the flag is disabled, endpoints will return 503 Service Unavailable.
 */
export class HierarchyApiService extends BaseApiService {
  async getHierarchyRegulations(
    jurisdictionId: string,
    options?: {
      includeChildren?: boolean;
      includeParents?: boolean;
      maxDepth?: number;
      levelFilter?: string[];
    }
  ): Promise<{
    success: boolean;
    jurisdictionId: string;
    regulations: unknown[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.includeChildren !== undefined)
      params.append('includeChildren', String(options.includeChildren));
    if (options?.includeParents !== undefined)
      params.append('includeParents', String(options.includeParents));
    if (options?.maxDepth) params.append('maxDepth', String(options.maxDepth));
    if (options?.levelFilter) params.append('levelFilter', options.levelFilter.join(','));
    const queryString = params.toString();
    return await this.request(
      `/knowledge-graph/hierarchy/jurisdiction/${jurisdictionId}/regulations${queryString ? `?${queryString}` : ''}`
    );
  }

  async getHierarchyChildren(
    jurisdictionId: string,
    options?: {
      maxDepth?: number;
      levelFilter?: string[];
    }
  ): Promise<{
    success: boolean;
    jurisdictionId: string;
    children: unknown[];
    count: number;
  }> {
    const params = new URLSearchParams();
    if (options?.maxDepth) params.append('maxDepth', String(options.maxDepth));
    if (options?.levelFilter) params.append('levelFilter', options.levelFilter.join(','));
    const queryString = params.toString();
    return await this.request(
      `/knowledge-graph/hierarchy/jurisdiction/${jurisdictionId}/children${queryString ? `?${queryString}` : ''}`
    );
  }

  async getHierarchyByLevel(
    level: 'municipality' | 'province' | 'national' | 'european'
  ): Promise<{
    success: boolean;
    level: string;
    regulations: unknown[];
    count: number;
  }> {
    try {
      return await this.request(`/knowledge-graph/hierarchy/level/${level}`);
    } catch (error: unknown) {
      // Check if it's a 503 Service Unavailable (feature flag disabled)
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 503
      ) {
        throw new FeatureFlagDisabledError('KG_HIERARCHICAL_STRUCTURE_ENABLED');
      }
      throw error;
    }
  }

  async getHierarchySubtree(
    jurisdictionId: string,
    options?: {
      includeChildren?: boolean;
      includeParents?: boolean;
      maxDepth?: number;
      levelFilter?: string[];
    }
  ): Promise<{
    success: boolean;
    jurisdictionId: string;
    subtree: unknown;
  }> {
    const params = new URLSearchParams();
    if (options?.includeChildren !== undefined)
      params.append('includeChildren', String(options.includeChildren));
    if (options?.includeParents !== undefined)
      params.append('includeParents', String(options.includeParents));
    if (options?.maxDepth) params.append('maxDepth', String(options.maxDepth));
    if (options?.levelFilter) params.append('levelFilter', options.levelFilter.join(','));
    const queryString = params.toString();
    return await this.request(
      `/knowledge-graph/hierarchy/jurisdiction/${jurisdictionId}/subtree${queryString ? `?${queryString}` : ''}`
    );
  }

  async updateHierarchy(
    jurisdictionId: string,
    hierarchy: {
      level: 'municipality' | 'province' | 'national' | 'european';
      parentId?: string;
    }
  ): Promise<{
    success: boolean;
    entityId: string;
    hierarchy: unknown;
    message: string;
  }> {
    return await this.request(`/knowledge-graph/hierarchy/jurisdiction/${jurisdictionId}/update`, {
      method: 'POST',
      body: JSON.stringify({ hierarchy }),
    });
  }

  async validateHierarchy(
    jurisdictionId: string,
    includeParent?: boolean
  ): Promise<{
    success: boolean;
    entityId: string;
    validation: {
      valid: boolean;
      errors: string[];
      warnings: string[];
      hasCycles?: boolean;
      bidirectionalConsistency?: boolean;
    };
  }> {
    const params = includeParent ? '?includeParent=true' : '';
    return await this.request(`/knowledge-graph/hierarchy/validate/${jurisdictionId}${params}`);
  }
}

