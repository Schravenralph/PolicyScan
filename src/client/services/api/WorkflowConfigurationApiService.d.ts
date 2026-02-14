import { BaseApiService } from './BaseApiService';
/**
 * Workflow configuration document
 */
export interface WorkflowConfiguration {
    _id?: string;
    name: string;
    description?: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
    isActive: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}
/**
 * Available workflow for Beleidsscan
 */
export interface AvailableBeleidsscanWorkflow {
    id: string;
    name: string;
    description: string;
    longDescription?: string;
    recommendedFor?: string[];
    limitations?: string[];
    isRecommended?: boolean;
    compatibleWithWizard: boolean;
}
/**
 * Workflow configuration template
 */
export interface WorkflowConfigurationTemplate {
    id: string;
    name: string;
    description: string;
    useCase: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
    icon?: string;
}
/**
 * Feature flag info for configuration
 */
export interface ConfigurableFeatureFlag {
    name: string;
    currentValue: boolean;
    category: string;
}
/**
 * Configuration create input
 */
export interface WorkflowConfigurationCreateInput {
    name: string;
    description?: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
    isActive?: boolean;
}
/**
 * Configuration update input
 */
export interface WorkflowConfigurationUpdateInput {
    name?: string;
    description?: string;
    workflowId?: string;
    featureFlags?: Record<string, boolean>;
    isActive?: boolean;
}
/**
 * Workflow Configuration API service
 *
 * Manages workflow-feature flag configurations for the Beleidsscan wizard
 */
export declare class WorkflowConfigurationApiService extends BaseApiService {
    /**
     * Get all configurations for the current user
     */
    getConfigurations(): Promise<WorkflowConfiguration[]>;
    /**
     * Get the currently active configuration
     */
    getActiveConfiguration(): Promise<{
        configuration: WorkflowConfiguration;
        workflowId: string;
        featureFlags: Record<string, boolean>;
    }>;
    /**
     * Get available workflows for Beleidsscan
     */
    getAvailableWorkflows(): Promise<AvailableBeleidsscanWorkflow[]>;
    /**
     * Get available workflow configuration templates
     */
    getAvailableTemplates(): Promise<WorkflowConfigurationTemplate[]>;
    /**
     * Get available feature flags for configuration
     */
    getAvailableFeatureFlags(): Promise<ConfigurableFeatureFlag[]>;
    /**
     * Get a specific configuration by ID
     */
    getConfiguration(id: string): Promise<WorkflowConfiguration>;
    /**
     * Create a new configuration
     */
    createConfiguration(input: WorkflowConfigurationCreateInput): Promise<WorkflowConfiguration>;
    /**
     * Update a configuration
     */
    updateConfiguration(id: string, input: WorkflowConfigurationUpdateInput): Promise<WorkflowConfiguration>;
    /**
     * Activate a configuration (sets it as active and applies feature flags)
     */
    activateConfiguration(id: string): Promise<{
        configuration: WorkflowConfiguration;
        flagsApplied: Array<{
            name: string;
            enabled: boolean;
        }>;
        flagsFailed: Array<{
            name: string;
            error: string;
        }>;
        finalFlagStates: Record<string, boolean>;
        message: string;
    }>;
    /**
     * Delete a configuration
     */
    deleteConfiguration(id: string): Promise<{
        message: string;
    }>;
    /**
     * Duplicate a configuration
     */
    duplicateConfiguration(id: string, newName?: string): Promise<WorkflowConfiguration>;
    /**
     * Export a configuration as JSON file
     */
    exportConfiguration(id: string): Promise<void>;
    /**
     * Import a configuration from JSON data
     */
    importConfiguration(importedData: {
        version?: number;
        exportedAt?: string;
        configuration: {
            name: string;
            description?: string;
            workflowId: string;
            featureFlags: Record<string, boolean>;
        };
    }, name?: string): Promise<WorkflowConfiguration>;
}
