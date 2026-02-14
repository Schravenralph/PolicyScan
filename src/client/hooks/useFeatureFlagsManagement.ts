/**
 * useFeatureFlagsManagement Hook
 * 
 * Manages feature flags data fetching, updates, and operations.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import type {
  FeatureFlag,
  FlagDependencyGraph,
  ValidationResult,
  ValidationWarning,
} from '../types/featureFlags.js';

export interface UseFeatureFlagsManagementReturn {
  // State
  flags: FeatureFlag[];
  loading: boolean;
  refreshing: boolean;
  updating: Set<string>;
  dependencyGraphs: Map<string, FlagDependencyGraph>;
  
  // Actions
  loadFlags: () => Promise<void>;
  refreshCache: () => Promise<void>;
  loadDependencyGraphs: () => Promise<void>;
  updateFlag: (flagName: string, enabled: boolean, cascade?: boolean) => Promise<void>;
  validateBulkConfig: (config: Record<string, boolean>) => Promise<ValidationResult>;
  
  // Setters (for state management)
  setFlags: React.Dispatch<React.SetStateAction<FeatureFlag[]>>;
  setUpdating: React.Dispatch<React.SetStateAction<Set<string>>>;
  setDependencyGraphs: React.Dispatch<React.SetStateAction<Map<string, FlagDependencyGraph>>>;
}

/**
 * Hook for managing feature flags data and operations
 */
export function useFeatureFlagsManagement(): UseFeatureFlagsManagementReturn {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [dependencyGraphs, setDependencyGraphs] = useState<Map<string, FlagDependencyGraph>>(new Map());

  const loadFlags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<{ flags: FeatureFlag[] }>('/feature-flags');
      setFlags(response.flags || []);
    } catch (error) {
      console.error('Error loading feature flags:', error);
      toast.error('Failed to load feature flags', 'Please try again later');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCache = useCallback(async () => {
    try {
      setRefreshing(true);
      await api.post('/feature-flags/refresh');
      await loadFlags();
      toast.success('Cache refreshed', 'Feature flags cache has been refreshed');
    } catch (error) {
      console.error('Error refreshing cache:', error);
      toast.error('Failed to refresh cache', 'Please try again later');
    } finally {
      setRefreshing(false);
    }
  }, [loadFlags]);

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

  const updateFlag = useCallback(async (
    flagName: string,
    enabled: boolean,
    cascade = true,
    draftMode = false,
    draftFlags?: Record<string, boolean>,
    setDraftFlags?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    setValidationErrors?: React.Dispatch<React.SetStateAction<Record<string, import('../types/featureFlags.js').ValidationError[]>>>,
    setValidationWarnings?: React.Dispatch<React.SetStateAction<Record<string, ValidationWarning[]>>>,
    loadFlagsRef?: () => Promise<void>
  ) => {
    // Mark unused parameter
    void draftFlags;
    // If in draft mode, just update the draft state (no validation until save)
    if (draftMode && setDraftFlags && setValidationErrors && setValidationWarnings) {
      setDraftFlags(prev => ({
        ...prev,
        [flagName]: enabled,
      }));
      // Clear validation errors/warnings for this flag when toggling in draft mode
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
      return;
    }

    // Otherwise, apply immediately (original behavior)
    try {
      setUpdating(prev => new Set(prev).add(flagName));
      setValidationErrors?.(prev => {
        const next = { ...prev };
        delete next[flagName];
        return next;
      });

      const response = await api.patch<{
        name: string;
        enabled: boolean;
        description?: string;
        updatedAt?: string;
        updatedBy?: string;
        source: string;
        cascadeFlags?: Array<{ name: string; enabled: boolean }>;
        warnings?: ValidationWarning[];
      }>(`/feature-flags/${flagName}`, { enabled, cascade });
      
      // Update local state
      setFlags(prev => prev.map(flag => 
        flag.name === flagName 
          ? { ...flag, enabled, source: 'database' as const }
          : flag
      ));

      // Update cascade flags if any
      if (response.cascadeFlags && response.cascadeFlags.length > 1) {
        const cascadeFlagNames = response.cascadeFlags
          .filter(f => f.name !== flagName)
          .map(f => f.name)
          .join(', ');
        toast.success(
          'Feature flag updated',
          `${flagName} has been ${enabled ? 'enabled' : 'disabled'}. Also updated: ${cascadeFlagNames}`
        );
      } else {
        toast.success(
          'Feature flag updated',
          `${flagName} has been ${enabled ? 'enabled' : 'disabled'}`
        );
      }

      // Show warnings if any
      if (response.warnings && response.warnings.length > 0) {
        response.warnings.forEach(warning => {
          toast.warning('Warning', warning.message);
        });
      }

      // Reload flags to get updated states
      if (loadFlagsRef) {
        await loadFlagsRef();
      } else {
        await loadFlags();
      }
    } catch (error: unknown) {
      console.error('Error updating feature flag:', error);
      
      // Extract validation errors if present
      if (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object') {
        
        const errorData = error.response.data as { error?: string; validation?: ValidationResult };
        
        if (errorData.validation && setValidationErrors) {
          setValidationErrors(prev => ({
            ...prev,
            [flagName]: errorData.validation!.errors,
          }));
          errorData.validation.errors.forEach(err => {
            toast.error('Validation failed', err.message);
          });
        } else {
          const errorMessage = 'error' in errorData && typeof errorData.error === 'string'
            ? errorData.error 
            : 'Failed to update feature flag';
          toast.error('Update failed', errorMessage);
        }
      } else {
        toast.error('Update failed', 'Failed to update feature flag');
      }
      
      // Reload flags to get the correct state
      if (loadFlagsRef) {
        await loadFlagsRef();
      } else {
        await loadFlags();
      }
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(flagName);
        return next;
      });
    }
  }, [loadFlags]);

  return {
    flags,
    loading,
    refreshing,
    updating,
    dependencyGraphs,
    loadFlags,
    refreshCache,
    loadDependencyGraphs,
    updateFlag,
    validateBulkConfig,
    setFlags,
    setUpdating,
    setDependencyGraphs,
  };
}

