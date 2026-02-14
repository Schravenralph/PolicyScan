/**
 * useFeatureFlagTemplates Hook
 * 
 * Manages feature flag template operations (load, save, apply, delete).
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import type { FeatureFlagTemplate, FeatureFlag } from '../types/featureFlags.js';

export interface UseFeatureFlagTemplatesReturn {
  // State
  templates: FeatureFlagTemplate[];
  loadingTemplates: boolean;
  
  // Actions
  loadTemplates: () => Promise<void>;
  saveCurrentAsTemplate: (
    name: string,
    description: string,
    isPublic: boolean,
    flagsToSave: Record<string, boolean>
  ) => Promise<void>;
  applyTemplate: (templateId: string, templateName: string) => Promise<void>;
  deleteTemplate: (templateId: string, templateName: string) => Promise<void>;
  getTemplateDifferences: (
    templateFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ) => Array<{ flag: string; current: boolean; template: boolean }>;
  
  // Setters
  setTemplates: React.Dispatch<React.SetStateAction<FeatureFlagTemplate[]>>;
  setLoadingTemplates: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook for managing feature flag templates
 */
export function useFeatureFlagTemplates(): UseFeatureFlagTemplatesReturn {
  const [templates, setTemplates] = useState<FeatureFlagTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const response = await api.get<{ templates: FeatureFlagTemplate[] }>('/feature-flags/templates/db');
      setTemplates(response.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      // Don't show error toast - templates are optional
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const saveCurrentAsTemplate = useCallback(async (
    name: string,
    description: string,
    isPublic: boolean,
    flagsToSave: Record<string, boolean>
  ) => {
    try {
      await api.post('/feature-flags/templates/db/from-current', {
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
        isDefault: false,
        flags: flagsToSave,
      });
      
      toast.success('Template saved', `Template "${name}" has been saved`);
      await loadTemplates();
    } catch (error: unknown) {
      console.error('Error saving template:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to save template';
      toast.error('Failed to save template', errorMessage);
      throw error; // Re-throw so caller can handle
    }
  }, [loadTemplates]);

  const applyTemplate = useCallback(async (templateId: string, templateName: string) => {
    try {
      await api.post(`/feature-flags/templates/db/${templateId}/apply`);
      toast.success('Template applied', `Template "${templateName}" has been applied successfully`);
      // Note: The caller should reload flags after applying a template
    } catch (error: unknown) {
      console.error('Error applying template:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to apply template';
      toast.error('Failed to apply template', errorMessage);
      throw error; // Re-throw so caller can handle
    }
  }, []);

  const deleteTemplate = useCallback(async (templateId: string, templateName: string) => {
    try {
      await api.delete(`/feature-flags/templates/db/${templateId}`);
      setTemplates(prev => prev.filter(t => (t._id || t.name) !== templateId));
      toast.success('Template deleted', `Template "${templateName}" has been deleted`);
    } catch (error: unknown) {
      console.error('Error deleting template:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to delete template';
      toast.error('Failed to delete template', errorMessage);
      throw error; // Re-throw so caller can handle
    }
  }, []);

  const getTemplateDifferences = useCallback((
    templateFlags: Record<string, boolean>,
    currentFlags: FeatureFlag[]
  ): Array<{ flag: string; current: boolean; template: boolean }> => {
    const currentFlagsMap = currentFlags.reduce((acc, flag) => {
      acc[flag.name] = flag.enabled;
      return acc;
    }, {} as Record<string, boolean>);

    const differences: Array<{ flag: string; current: boolean; template: boolean }> = [];
    const allFlags = new Set([...Object.keys(currentFlagsMap), ...Object.keys(templateFlags)]);
    
    allFlags.forEach(flagName => {
      const current = currentFlagsMap[flagName] ?? false;
      const template = templateFlags[flagName] ?? false;
      if (current !== template) {
        differences.push({ flag: flagName, current, template });
      }
    });

    return differences;
  }, []);

  return {
    templates,
    loadingTemplates,
    loadTemplates,
    saveCurrentAsTemplate,
    applyTemplate,
    deleteTemplate,
    getTemplateDifferences,
    setTemplates,
    setLoadingTemplates,
  };
}

