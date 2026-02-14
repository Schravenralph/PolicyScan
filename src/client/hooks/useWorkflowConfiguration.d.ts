/**
 * useWorkflowConfiguration Hook
 *
 * Manages workflow configuration state for the Beleidsscan wizard.
 * Provides methods to load, create, update, and activate configurations.
 */
import type { WorkflowConfiguration, AvailableBeleidsscanWorkflow, ConfigurableFeatureFlag, WorkflowConfigurationTemplate, WorkflowConfigurationCreateInput, WorkflowConfigurationUpdateInput } from '../services/api/WorkflowConfigurationApiService';
export interface UseWorkflowConfigurationReturn {
    configurations: WorkflowConfiguration[];
    activeConfiguration: WorkflowConfiguration | null;
    availableWorkflows: AvailableBeleidsscanWorkflow[];
    availableFeatureFlags: ConfigurableFeatureFlag[];
    templates: WorkflowConfigurationTemplate[];
    isLoading: boolean;
    error: Error | null;
    loadConfigurations: () => Promise<void>;
    loadActiveConfiguration: () => Promise<void>;
    refreshActiveConfiguration: () => Promise<void>;
    loadAvailableWorkflows: () => Promise<void>;
    loadAvailableFeatureFlags: () => Promise<void>;
    loadTemplates: () => Promise<void>;
    createConfiguration: (input: WorkflowConfigurationCreateInput) => Promise<WorkflowConfiguration>;
    updateConfiguration: (id: string, input: WorkflowConfigurationUpdateInput) => Promise<WorkflowConfiguration>;
    activateConfiguration: (id: string) => Promise<void>;
    deleteConfiguration: (id: string) => Promise<void>;
    duplicateConfiguration: (id: string, newName?: string) => Promise<WorkflowConfiguration>;
    clearError: () => void;
}
/**
 * Custom hook for workflow configuration management
 */
export declare function useWorkflowConfiguration(): UseWorkflowConfigurationReturn;
/**
 * Get cached active configuration from localStorage
 * Returns null if cache is missing, expired, or invalid
 */
export declare function getCachedConfiguration(): WorkflowConfiguration | null;
/**
 * Set cached active configuration in localStorage
 */
export declare function setCachedConfiguration(config: WorkflowConfiguration, userId?: string): void;
/**
 * Invalidate the cached configuration
 */
export declare function invalidateConfigurationCache(): void;
/**
 * Get the workflow ID to use in Beleidsscan from localStorage cache
 * This is a synchronous helper for quick access when the hook isn't available
 * Falls back to legacy cache format for backward compatibility
 */
export declare function getActiveWorkflowId(): string;
/**
 * Cache the active workflow ID in localStorage
 * @deprecated Use setCachedConfiguration instead for full configuration caching
 */
export declare function cacheActiveWorkflowId(workflowId: string): void;
