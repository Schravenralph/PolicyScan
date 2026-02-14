import { BaseApiService } from './BaseApiService';
/**
 * Custom error for feature flag disabled
 */
export declare class FeatureFlagDisabledError extends Error {
    constructor(flagName: string);
}
/**
 * Hierarchy API service
 *
 * Note: All hierarchy endpoints require the KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag.
 * If the flag is disabled, endpoints will return 503 Service Unavailable.
 */
export declare class HierarchyApiService extends BaseApiService {
    getHierarchyRegulations(jurisdictionId: string, options?: {
        includeChildren?: boolean;
        includeParents?: boolean;
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        regulations: unknown[];
        count: number;
    }>;
    getHierarchyChildren(jurisdictionId: string, options?: {
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        children: unknown[];
        count: number;
    }>;
    getHierarchyByLevel(level: 'municipality' | 'province' | 'national' | 'european'): Promise<{
        success: boolean;
        level: string;
        regulations: unknown[];
        count: number;
    }>;
    getHierarchySubtree(jurisdictionId: string, options?: {
        includeChildren?: boolean;
        includeParents?: boolean;
        maxDepth?: number;
        levelFilter?: string[];
    }): Promise<{
        success: boolean;
        jurisdictionId: string;
        subtree: unknown;
    }>;
    updateHierarchy(jurisdictionId: string, hierarchy: {
        level: 'municipality' | 'province' | 'national' | 'european';
        parentId?: string;
    }): Promise<{
        success: boolean;
        entityId: string;
        hierarchy: unknown;
        message: string;
    }>;
    validateHierarchy(jurisdictionId: string, includeParent?: boolean): Promise<{
        success: boolean;
        entityId: string;
        validation: {
            valid: boolean;
            errors: string[];
            warnings: string[];
            hasCycles?: boolean;
            bidirectionalConsistency?: boolean;
        };
    }>;
}
