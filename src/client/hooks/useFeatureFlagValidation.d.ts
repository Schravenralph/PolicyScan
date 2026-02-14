/**
 * useFeatureFlagValidation Hook
 *
 * Manages feature flag validation logic, dependency graphs, and error/warning state.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlag, FlagDependencyGraph, ValidationResult, ValidationError, ValidationWarning } from '../types/featureFlags.js';
export interface UseFeatureFlagValidationReturn {
    validationErrors: Record<string, ValidationError[]>;
    validationWarnings: Record<string, ValidationWarning[]>;
    dependencyGraphs: Map<string, FlagDependencyGraph>;
    loadDependencyGraphs: () => Promise<void>;
    validateBulkConfig: (config: Record<string, boolean>) => Promise<ValidationResult>;
    validateDraftChanges: (draftFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => Promise<ValidationResult>;
    clearValidationForFlag: (flagName: string) => void;
    clearAllValidation: () => void;
    hasPendingChanges: (draftFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => boolean;
    getPendingChangesCount: (draftFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => number;
    setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, ValidationError[]>>>;
    setValidationWarnings: React.Dispatch<React.SetStateAction<Record<string, ValidationWarning[]>>>;
    setDependencyGraphs: React.Dispatch<React.SetStateAction<Map<string, FlagDependencyGraph>>>;
}
/**
 * Hook for managing feature flag validation and dependency graphs
 */
export declare function useFeatureFlagValidation(): UseFeatureFlagValidationReturn;
