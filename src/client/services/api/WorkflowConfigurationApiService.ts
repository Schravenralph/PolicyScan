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
export class WorkflowConfigurationApiService extends BaseApiService {
  /**
   * Get all configurations for the current user
   */
  async getConfigurations(): Promise<WorkflowConfiguration[]> {
    const response = await this.request<{
      configurations: WorkflowConfiguration[];
      count: number;
    }>('/workflow-configuration');
    return response.configurations;
  }

  /**
   * Get the currently active configuration
   */
  async getActiveConfiguration(): Promise<{
    configuration: WorkflowConfiguration;
    workflowId: string;
    featureFlags: Record<string, boolean>;
  }> {
    return this.request<{
      configuration: WorkflowConfiguration;
      workflowId: string;
      featureFlags: Record<string, boolean>;
    }>('/workflow-configuration/active');
  }

  /**
   * Get available workflows for Beleidsscan
   */
  async getAvailableWorkflows(): Promise<AvailableBeleidsscanWorkflow[]> {
    const response = await this.request<{
      workflows: AvailableBeleidsscanWorkflow[];
    }>('/workflow-configuration/workflows');
    return response.workflows;
  }

  /**
   * Get available workflow configuration templates
   */
  async getAvailableTemplates(): Promise<WorkflowConfigurationTemplate[]> {
    const response = await this.request<{
      templates: WorkflowConfigurationTemplate[];
    }>('/workflow-configuration/templates');
    return response.templates;
  }

  /**
   * Get available feature flags for configuration
   */
  async getAvailableFeatureFlags(): Promise<ConfigurableFeatureFlag[]> {
    const response = await this.request<{
      flags: ConfigurableFeatureFlag[];
    }>('/workflow-configuration/feature-flags');
    return response.flags;
  }

  /**
   * Get a specific configuration by ID
   */
  async getConfiguration(id: string): Promise<WorkflowConfiguration> {
    const response = await this.request<{
      configuration: WorkflowConfiguration;
    }>(`/workflow-configuration/${id}`);
    return response.configuration;
  }

  /**
   * Create a new configuration
   */
  async createConfiguration(input: WorkflowConfigurationCreateInput): Promise<WorkflowConfiguration> {
    const response = await this.request<{
      configuration: WorkflowConfiguration;
      message: string;
    }>('/workflow-configuration', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.configuration;
  }

  /**
   * Update a configuration
   */
  async updateConfiguration(
    id: string,
    input: WorkflowConfigurationUpdateInput
  ): Promise<WorkflowConfiguration> {
    const response = await this.request<{
      configuration: WorkflowConfiguration;
      message: string;
    }>(`/workflow-configuration/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return response.configuration;
  }

  /**
   * Activate a configuration (sets it as active and applies feature flags)
   */
  async activateConfiguration(id: string): Promise<{
    configuration: WorkflowConfiguration;
    flagsApplied: Array<{ name: string; enabled: boolean }>;
    flagsFailed: Array<{ name: string; error: string }>;
    finalFlagStates: Record<string, boolean>;
    message: string;
  }> {
    return this.request<{
      configuration: WorkflowConfiguration;
      flagsApplied: Array<{ name: string; enabled: boolean }>;
      flagsFailed: Array<{ name: string; error: string }>;
      finalFlagStates: Record<string, boolean>;
      message: string;
    }>(`/workflow-configuration/${id}/activate`, {
      method: 'POST',
    });
  }

  /**
   * Delete a configuration
   */
  async deleteConfiguration(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/workflow-configuration/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Duplicate a configuration
   */
  async duplicateConfiguration(id: string, newName?: string): Promise<WorkflowConfiguration> {
    const response = await this.request<{
      configuration: WorkflowConfiguration;
      message: string;
    }>(`/workflow-configuration/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name: newName }),
    });
    return response.configuration;
  }

  /**
   * Export a configuration as JSON file
   */
  async exportConfiguration(id: string): Promise<void> {
    const token = this.getAuthToken();
    const { getApiBaseUrl } = await import('../../utils/apiUrl');
    const apiUrl = `${getApiBaseUrl()}/workflow-configuration/${id}/export`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: string; message?: string };
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || response.statusText };
      }
      throw new Error(errorData.error || errorData.message || 'Failed to export configuration');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Get filename from Content-Disposition header or construct it
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `configuration-${id}.json`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /**
   * Import a configuration from JSON data
   */
  async importConfiguration(
    importedData: {
      version?: number;
      exportedAt?: string;
      configuration: {
        name: string;
        description?: string;
        workflowId: string;
        featureFlags: Record<string, boolean>;
      };
    },
    name?: string
  ): Promise<WorkflowConfiguration> {
    const response = await this.request<{
      configuration: WorkflowConfiguration;
      message: string;
    }>('/workflow-configuration/import', {
      method: 'POST',
      body: JSON.stringify({ importedData, name }),
    });
    return response.configuration;
  }
}

