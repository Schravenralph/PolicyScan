/**
 * useFeatureFlagsManagement Hook
 *
 * Manages feature flags data fetching, updates, and operations.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlag, FlagDependencyGraph, ValidationResult } from '../types/featureFlags.js';
export interface UseFeatureFlagsManagementReturn {
    flags: FeatureFlag[];
    loading: boolean;
    refreshing: boolean;
    updating: Set<string>;
    dependencyGraphs: Map<string, FlagDependencyGraph>;
    loadFlags: () => Promise<void>;
    refreshCache: () => Promise<void>;
    loadDependencyGraphs: () => Promise<void>;
    updateFlag: (flagName: string, enabled: boolean, cascade?: boolean) => Promise<void>;
    validateBulkConfig: (config: Record<string, boolean>) => Promise<ValidationResult>;
    setFlags: React.Dispatch<React.SetStateAction<FeatureFlag[]>>;
    setUpdating: React.Dispatch<React.SetStateAction<Set<string>>>;
    setDependencyGraphs: React.Dispatch<React.SetStateAction<Map<string, FlagDependencyGraph>>>;
}
/**
 * Hook for managing feature flags data and operations
 */
export declare function useFeatureFlagsManagement(): UseFeatureFlagsManagementReturn;
