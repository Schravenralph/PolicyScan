/**
 * useWorkflowConfiguration Hook
 * 
 * Manages workflow configuration state for the Beleidsscan wizard.
 * Provides methods to load, create, update, and activate configurations.
 */

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import type {
  WorkflowConfiguration,
  AvailableBeleidsscanWorkflow,
  ConfigurableFeatureFlag,
  WorkflowConfigurationTemplate,
  WorkflowConfigurationCreateInput,
  WorkflowConfigurationUpdateInput,
} from '../services/api/WorkflowConfigurationApiService';
import { toast } from '../utils/toast';
import { logError } from '../utils/errorHandler';

export interface UseWorkflowConfigurationReturn {
  // State
  configurations: WorkflowConfiguration[];
  activeConfiguration: WorkflowConfiguration | null;
  availableWorkflows: AvailableBeleidsscanWorkflow[];
  availableFeatureFlags: ConfigurableFeatureFlag[];
  templates: WorkflowConfigurationTemplate[];
  isLoading: boolean;
  error: Error | null;
  
  // Actions
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
export function useWorkflowConfiguration(): UseWorkflowConfigurationReturn {
  const [configurations, setConfigurations] = useState<WorkflowConfiguration[]>([]);
  const [activeConfiguration, setActiveConfiguration] = useState<WorkflowConfiguration | null>(null);
  const [availableWorkflows, setAvailableWorkflows] = useState<AvailableBeleidsscanWorkflow[]>([]);
  const [availableFeatureFlags, setAvailableFeatureFlags] = useState<ConfigurableFeatureFlag[]>([]);
  const [templates, setTemplates] = useState<WorkflowConfigurationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadConfigurations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const configs = await api.workflowConfiguration.getConfigurations();
      setConfigurations(configs);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load configurations');
      setError(error);
      logError(error, 'load-workflow-configurations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadActiveConfiguration = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Try to load from cache first
      const cachedConfig = getCachedConfiguration();
      if (cachedConfig) {
        setActiveConfiguration(cachedConfig);
        setIsLoading(false);
        // Load from server in background to refresh cache
        api.workflowConfiguration.getActiveConfiguration()
          .then(result => {
            setActiveConfiguration(result.configuration);
            setCachedConfiguration(result.configuration);
          })
          .catch(() => {
            // Ignore background refresh errors - use cached value
          });
        return;
      }
      
      // No cache, load from server
      const result = await api.workflowConfiguration.getActiveConfiguration();
      setActiveConfiguration(result.configuration);
      setCachedConfiguration(result.configuration);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load active configuration');
      setError(error);
      logError(error, 'load-active-workflow-configuration');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Force refresh active configuration from server, bypassing cache
   * Useful for manual refresh when user wants to ensure they have latest data
   */
  const refreshActiveConfiguration = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Always load from server, bypassing cache
      const result = await api.workflowConfiguration.getActiveConfiguration();
      setActiveConfiguration(result.configuration);
      setCachedConfiguration(result.configuration);
      toast.success('Configuratie vernieuwd', 'De actieve configuratie is bijgewerkt');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to refresh active configuration');
      setError(error);
      logError(error, 'refresh-active-workflow-configuration');
      toast.error('Fout bij vernieuwen', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAvailableWorkflows = useCallback(async () => {
    try {
      const workflows = await api.workflowConfiguration.getAvailableWorkflows();
      setAvailableWorkflows(workflows);
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load workflows'), 'load-available-workflows');
    }
  }, []);

  const loadAvailableFeatureFlags = useCallback(async () => {
    try {
      const flags = await api.workflowConfiguration.getAvailableFeatureFlags();
      setAvailableFeatureFlags(flags);
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load feature flags'), 'load-feature-flags');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const templateList = await api.workflowConfiguration.getAvailableTemplates();
      setTemplates(templateList);
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load templates'), 'load-templates');
    }
  }, []);

  const createConfiguration = useCallback(async (input: WorkflowConfigurationCreateInput): Promise<WorkflowConfiguration> => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await api.workflowConfiguration.createConfiguration(input);
      setConfigurations(prev => [config, ...prev]);
      if (input.isActive) {
        setActiveConfiguration(config);
      }
      toast.success('Configuratie aangemaakt', `"${config.name}" is succesvol aangemaakt`);
      return config;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create configuration');
      setError(error);
      logError(error, 'create-workflow-configuration');
      toast.error('Fout bij aanmaken', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfiguration = useCallback(async (
    id: string,
    input: WorkflowConfigurationUpdateInput
  ): Promise<WorkflowConfiguration> => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await api.workflowConfiguration.updateConfiguration(id, input);
      setConfigurations(prev => 
        prev.map(c => c._id === id ? config : c)
      );
      if (config.isActive) {
        setActiveConfiguration(config);
        setCachedConfiguration(config); // Update cache with new configuration
      }
      toast.success('Configuratie bijgewerkt', `"${config.name}" is succesvol bijgewerkt`);
      return config;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update configuration');
      setError(error);
      logError(error, 'update-workflow-configuration');
      toast.error('Fout bij bijwerken', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const activateConfiguration = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.workflowConfiguration.activateConfiguration(id);
      // Update local state
      setConfigurations(prev => 
        prev.map(c => ({
          ...c,
          isActive: c._id === id,
        }))
      );
      setActiveConfiguration(result.configuration);
      
      // Update cache with new active configuration
      setCachedConfiguration(result.configuration);
      
      // Show detailed feedback about flag activation
      if (result.flagsApplied.length > 0 || result.flagsFailed.length > 0) {
        let detailMessage = '';
        if (result.flagsApplied.length > 0) {
          detailMessage += `${result.flagsApplied.length} feature flag(s) toegepast`;
        }
        if (result.flagsFailed.length > 0) {
          if (detailMessage) detailMessage += '. ';
          detailMessage += `${result.flagsFailed.length} feature flag(s) mislukt: ${result.flagsFailed.map(f => f.name).join(', ')}`;
          // Show warning toast for failed flags
          toast.warning(
            'Sommige flags mislukt',
            `De volgende feature flags konden niet worden toegepast: ${result.flagsFailed.map(f => f.name).join(', ')}`
          );
        }
        toast.success('Configuratie geactiveerd', detailMessage || result.message);
      } else {
        toast.success('Configuratie geactiveerd', result.message);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to activate configuration');
      setError(error);
      logError(error, 'activate-workflow-configuration');
      toast.error('Fout bij activeren', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteConfiguration = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await api.workflowConfiguration.deleteConfiguration(id);
      setConfigurations(prev => prev.filter(c => c._id !== id));
      if (activeConfiguration?._id === id) {
        setActiveConfiguration(null);
        invalidateConfigurationCache(); // Invalidate cache if active config was deleted
      }
      toast.success('Configuratie verwijderd', 'De configuratie is succesvol verwijderd');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete configuration');
      setError(error);
      logError(error, 'delete-workflow-configuration');
      toast.error('Fout bij verwijderen', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [activeConfiguration]);

  const duplicateConfiguration = useCallback(async (
    id: string,
    newName?: string
  ): Promise<WorkflowConfiguration> => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await api.workflowConfiguration.duplicateConfiguration(id, newName);
      setConfigurations(prev => [config, ...prev]);
      toast.success('Configuratie gedupliceerd', `"${config.name}" is succesvol aangemaakt`);
      return config;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to duplicate configuration');
      setError(error);
      logError(error, 'duplicate-workflow-configuration');
      toast.error('Fout bij dupliceren', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadActiveConfiguration();
    loadConfigurations();
    loadAvailableWorkflows();
  }, [loadActiveConfiguration, loadConfigurations, loadAvailableWorkflows]);

  // Cross-tab synchronization: listen for storage changes
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === CACHE_KEY && event.newValue) {
        try {
          const parsed: CachedConfiguration = JSON.parse(event.newValue);
          // Only update if version matches and not expired
          if (parsed.version === CACHE_VERSION && 
              Date.now() - parsed.timestamp <= CACHE_TTL) {
            setActiveConfiguration(parsed.configuration);
          }
        } catch {
          // Ignore parse errors
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return {
    configurations,
    activeConfiguration,
    availableWorkflows,
    availableFeatureFlags,
    templates,
    isLoading,
    error,
    loadConfigurations,
    loadActiveConfiguration,
    refreshActiveConfiguration,
    loadAvailableWorkflows,
    loadAvailableFeatureFlags,
    loadTemplates,
    createConfiguration,
    updateConfiguration,
    activateConfiguration,
    deleteConfiguration,
    duplicateConfiguration,
    clearError,
  };
}

/**
 * Enhanced cache structure for workflow configuration
 */
interface CachedConfiguration {
  version: number;
  configuration: WorkflowConfiguration;
  timestamp: number;
  userId?: string;
}

const CACHE_KEY = 'beleidsscan-workflow-configuration';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_VERSION = 1;

/**
 * Get cached active configuration from localStorage
 * Returns null if cache is missing, expired, or invalid
 */
export function getCachedConfiguration(): WorkflowConfiguration | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedConfiguration = JSON.parse(cached);
    
    // Check version compatibility
    if (parsed.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    // Check TTL
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return parsed.configuration;
  } catch {
    // Ignore parse errors - invalid cache
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

/**
 * Set cached active configuration in localStorage
 */
export function setCachedConfiguration(
  config: WorkflowConfiguration,
  userId?: string
): void {
  try {
    const cached: CachedConfiguration = {
      version: CACHE_VERSION,
      configuration: config,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Invalidate the cached configuration
 */
export function invalidateConfigurationCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    // Also remove legacy cache key for backward compatibility
    localStorage.removeItem('beleidsscan-active-workflow');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the workflow ID to use in Beleidsscan from localStorage cache
 * This is a synchronous helper for quick access when the hook isn't available
 * Falls back to legacy cache format for backward compatibility
 */
export function getActiveWorkflowId(): string {
  // Try new cache format first
  const cachedConfig = getCachedConfiguration();
  if (cachedConfig) {
    return cachedConfig.workflowId;
  }
  
  // Fallback to legacy cache format for backward compatibility
  try {
    const cached = localStorage.getItem('beleidsscan-active-workflow');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.workflowId && Date.now() - parsed.timestamp < 60000) { // 1 minute cache
        return parsed.workflowId;
      }
    }
  } catch {
    // Ignore parse errors
  }
  
  return 'beleidsscan-wizard'; // Default workflow
}

/**
 * Cache the active workflow ID in localStorage
 * @deprecated Use setCachedConfiguration instead for full configuration caching
 */
export function cacheActiveWorkflowId(workflowId: string): void {
  try {
    localStorage.setItem('beleidsscan-active-workflow', JSON.stringify({
      workflowId,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore storage errors
  }
}

