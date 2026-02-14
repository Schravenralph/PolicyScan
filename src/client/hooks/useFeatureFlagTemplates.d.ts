/**
 * useFeatureFlagTemplates Hook
 *
 * Manages feature flag template operations (load, save, apply, delete).
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlagTemplate, FeatureFlag } from '../types/featureFlags.js';
export interface UseFeatureFlagTemplatesReturn {
    templates: FeatureFlagTemplate[];
    loadingTemplates: boolean;
    loadTemplates: () => Promise<void>;
    saveCurrentAsTemplate: (name: string, description: string, isPublic: boolean, flagsToSave: Record<string, boolean>) => Promise<void>;
    applyTemplate: (templateId: string, templateName: string) => Promise<void>;
    deleteTemplate: (templateId: string, templateName: string) => Promise<void>;
    getTemplateDifferences: (templateFlags: Record<string, boolean>, currentFlags: FeatureFlag[]) => Array<{
        flag: string;
        current: boolean;
        template: boolean;
    }>;
    setTemplates: React.Dispatch<React.SetStateAction<FeatureFlagTemplate[]>>;
    setLoadingTemplates: React.Dispatch<React.SetStateAction<boolean>>;
}
/**
 * Hook for managing feature flag templates
 */
export declare function useFeatureFlagTemplates(): UseFeatureFlagTemplatesReturn;
