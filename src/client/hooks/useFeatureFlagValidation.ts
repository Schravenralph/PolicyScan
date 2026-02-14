/**
 * useFeatureFlagValidation Hook
 * 
 * Manages feature flag validation logic, dependency graphs, and error/warning state.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type {
  FeatureFlag,
  FlagDependencyGraph,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/featureFlags.js';

export interface UseFeatureFlagValidationReturn {
  // State
  validationErrors: Record<string, ValidationError[]>;
  validationWarnings: Record<string, ValidationWarning[]>;
  dependencyGraphs: Map<string, FlagDependencyGraph>;
  
  // Actions
  loadDependencyGraphs: () => Promise<void>;
  validateBulkConfig: (config: Record<string, boolean>) => Promise<ValidationResult>;
  validateDraftChanges: (
    draftFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ) => Promise<ValidationResult>;
  clearValidationForFlag: (flagName: string) => void;
  clearAllValidation: () => void;
  hasPendingChanges: (draftFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => boolean;
  getPendingChangesCount: (draftFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => number;
  
  // Setters
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, ValidationError[]>>>;
  setValidationWarnings: React.Dispatch<React.SetStateAction<Record<string, ValidationWarning[]>>>;
  setDependencyGraphs: React.Dispatch<React.SetStateAction<Map<string, FlagDependencyGraph>>>;
}

/**
 * Hook for managing feature flag validation and dependency graphs
 */
export function useFeatureFlagValidation(): UseFeatureFlagValidationReturn {
  const [validationErrors, setValidationErrors] = useState<Record<string, ValidationError[]>>({});
  const [validationWarnings, setValidationWarnings] = useState<Record<string, ValidationWarning[]>>({});
  const [dependencyGraphs, setDependencyGraphs] = useState<Map<string, FlagDependencyGraph>>(new Map());

  const loadDependencyGraphs = useCallback(async () => {
    try {
      const response = await api.get<{ dependencies: FlagDependencyGraph[] }>('/feature-flags/dependencies');
      const graphsMap = new Map<string, FlagDependencyGraph>();
      response.dependencies.forEach(graph => {
        graphsMap.set(graph.flag, graph);
      });
      setDependencyGraphs(graphsMap);
    } catch (error) {
      console.error('Error loading dependency graphs:', error);
    }
  }, []);

  const validateBulkConfig = useCallback(async (config: Record<string, boolean>): Promise<ValidationResult> => {
    try {
      const response = await api.post<ValidationResult>('/feature-flags/validate', { flags: config });
      return response;
    } catch (error) {
      console.error('Error validating configuration:', error);
      return { valid: false, errors: [], warnings: [] };
    }
  }, []);

  const validateDraftChanges = useCallback(async (
    draftFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ): Promise<ValidationResult> => {
    // Build complete flag configuration (current flags + draft changes)
    const completeFlags: Record<string, boolean> = {};
    const databaseFlags = currentFlags.filter(f => f.source === 'database');
    
    databaseFlags.forEach(flag => {
      completeFlags[flag.name] = flag.enabled;
    });
    
    // Apply draft changes
    Object.entries(draftFlags).forEach(([flagName, enabled]) => {
      completeFlags[flagName] = enabled;
    });
    
    return await validateBulkConfig(completeFlags);
  }, [validateBulkConfig]);

  const clearValidationForFlag = useCallback((flagName: string) => {
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[flagName];
      return next;
    });
    setValidationWarnings(prev => {
      const next = { ...prev };
      delete next[flagName];
      return next;
    });
  }, []);

  const clearAllValidation = useCallback(() => {
    setValidationErrors({});
    setValidationWarnings({});
  }, []);

  const hasPendingChanges = useCallback((
    draftFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ): boolean => {
    const databaseFlags = currentFlags.filter(f => f.source === 'database');
    return databaseFlags.some(flag => {
      const draftValue = draftFlags[flag.name];
      return draftValue !== undefined && draftValue !== flag.enabled;
    });
  }, []);

  const getPendingChangesCount = useCallback((
    draftFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ): number => {
    const databaseFlags = currentFlags.filter(f => f.source === 'database');
    return databaseFlags.filter(flag => {
      const draftValue = draftFlags[flag.name];
      return draftValue !== undefined && draftValue !== flag.enabled;
    }).length;
  }, []);

  return {
    validationErrors,
    validationWarnings,
    dependencyGraphs,
    loadDependencyGraphs,
    validateBulkConfig,
    validateDraftChanges,
    clearValidationForFlag,
    clearAllValidation,
    hasPendingChanges,
    getPendingChangesCount,
    setValidationErrors,
    setValidationWarnings,
    setDependencyGraphs,
  };
}

