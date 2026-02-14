import { useState, useEffect, useRef } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { TemplateManagement } from './TemplateManagement';
import { EditBenchmarkConfigDialog } from '../workflow/EditBenchmarkConfigDialog';
import { ProductionFeatureFlagsDisplay } from './ProductionFeatureFlagsDisplay';
import { GeneralBenchmarkSettings } from './GeneralBenchmarkSettings';
import { WorkflowBenchmarkConfigCard } from './WorkflowBenchmarkConfigCard';

interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  source: 'environment' | 'database' | 'default';
}

interface BenchmarkConfigTemplate {
  _id?: string;
  name: string;
  description?: string;
  benchmarkTypes: string[];
  featureFlags?: Record<string, boolean>;
  isPublic?: boolean;
  isDefault?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  usageCount?: number;
}

type WorkflowBenchmarkConfig = {
  featureFlags?: Record<string, boolean>;
  params?: Record<string, unknown>;
  timeout?: number;
  maxRetries?: number;
  maxMemoryMB?: number;
  maxConcurrentRequests?: number;
} | null;

const AVAILABLE_BENCHMARK_TYPES = [
  { id: 'settings', name: t('benchmark.settingsComparison'), description: t('benchmark.settingsComparisonDesc') },
  { id: 'relevance-scorer', name: t('benchmark.relevanceScorer'), description: t('benchmark.relevanceScorerDesc') },
  { id: 'reranker', name: t('benchmark.llmReranker'), description: t('benchmark.llmRerankerDesc') },
  { id: 'hybrid-retrieval', name: t('benchmark.hybridRetrieval'), description: t('benchmark.hybridRetrievalDesc') },
];

export function BenchmarkConfigTab() {
  const [currentFlags, setCurrentFlags] = useState<FeatureFlag[]>([]);
  const [templates, setTemplates] = useState<BenchmarkConfigTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateTypes, setNewTemplateTypes] = useState<string[]>(['settings']);

  // Benchmark workflow configuration state
  const [benchmarkWorkflowA, setBenchmarkWorkflowA] = useState<string>('');
  const [benchmarkWorkflowB, setBenchmarkWorkflowB] = useState<string>('');
  const [workflowAConfig, setWorkflowAConfig] = useState<WorkflowBenchmarkConfig>(null);
  const [workflowBConfig, setWorkflowBConfig] = useState<WorkflowBenchmarkConfig>(null);
  const [configSourceA, setConfigSourceA] = useState<'default' | 'custom' | null>(null);
  const [configSourceB, setConfigSourceB] = useState<'default' | 'custom' | null>(null);
  const [loadingConfigA, setLoadingConfigA] = useState(false);
  const [loadingConfigB, setLoadingConfigB] = useState(false);
  const [savingConfigA, setSavingConfigA] = useState(false);
  const [savingConfigB, setSavingConfigB] = useState(false);
  const [showEditConfigA, setShowEditConfigA] = useState(false);
  const [showEditConfigB, setShowEditConfigB] = useState(false);
  const [editingConfigA, setEditingConfigA] = useState<typeof workflowAConfig>(null);
  const [editingConfigB, setEditingConfigB] = useState<typeof workflowBConfig>(null);
  const [availableFlags, setAvailableFlags] = useState<Array<{ name: string; enabled: boolean; description?: string; category?: string }>>([]);
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [flagsSearchQuery, setFlagsSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // General benchmark settings
  const [generalSettings, setGeneralSettings] = useState<{
    runsPerWorkflow?: number;
    executionMode?: 'sequential' | 'parallel';
    maxConcurrent?: number;
    timeout?: number;
    maxWorkflowTemplates?: number;
  }>(() => {
    // Load from localStorage if available
    if (typeof window === 'undefined') {
      // SSR safety check
      return {
        runsPerWorkflow: 1,
        executionMode: 'sequential',
        maxConcurrent: 5,
        timeout: 30 * 60 * 1000,
        maxWorkflowTemplates: undefined,
      };
    }
    
    try {
      const saved = localStorage.getItem('benchmark-general-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert timeout from minutes to milliseconds if needed
        // If timeout is less than 60000 (1 minute), assume it's stored in minutes
        // Otherwise, assume it's already in milliseconds
        if (parsed.timeout !== undefined) {
          if (parsed.timeout < 60000 && parsed.timeout > 0) {
            // Likely stored in minutes, convert to milliseconds
            parsed.timeout = parsed.timeout * 60 * 1000;
          }
          // Ensure timeout is within reasonable bounds (1 minute to 120 minutes)
          if (parsed.timeout < 60000) parsed.timeout = 60000;
          if (parsed.timeout > 120 * 60 * 1000) parsed.timeout = 120 * 60 * 1000;
        }
        return {
          runsPerWorkflow: 1,
          executionMode: 'sequential',
          maxConcurrent: 5,
          timeout: 30 * 60 * 1000,
          maxWorkflowTemplates: undefined,
          ...parsed,
        };
      }
    } catch (error) {
      console.warn('Failed to load general benchmark settings from localStorage:', error);
    }
    return {
      runsPerWorkflow: 1,
      executionMode: 'sequential',
      maxConcurrent: 5,
      timeout: 30 * 60 * 1000, // 30 minutes in milliseconds
      maxWorkflowTemplates: undefined,
    };
  });

  // Save general settings to localStorage when they change
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR safety check
    
    try {
      localStorage.setItem('benchmark-general-settings', JSON.stringify(generalSettings));
    } catch (error) {
      console.warn('Failed to save general benchmark settings to localStorage:', error);
    }
  }, [generalSettings]);

  const loadCurrentFlags = async () => {
    try {
      const response = await api.get<{ flags: FeatureFlag[] }>('/feature-flags');
      setCurrentFlags(response.flags || []);
    } catch (error) {
      // Silently handle 404 errors (endpoint may not be available due to OpenAPI validation)
      const statusCode = (error as { statusCode?: number })?.statusCode || 
                        (error as { response?: { status?: number } })?.response?.status;
      if (statusCode === 404) {
        // Endpoint not found - likely due to OpenAPI validation, silently ignore
        return;
      }
      // Only log non-404 errors
      console.warn('Error loading feature flags:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      
      // Try to load from API
      try {
        const response = await api.get<{ success: boolean; templates: BenchmarkConfigTemplate[] }>('/benchmark/configs');
        if (response.success && response.templates) {
          setTemplates(response.templates);
          
          // Migrate localStorage templates to API on first load (one-time migration)
          const saved = localStorage.getItem('benchmark-config-templates');
          if (saved) {
            try {
              const localTemplates: BenchmarkConfigTemplate[] = JSON.parse(saved);
              // Migrate each localStorage template to API
              for (const localTemplate of localTemplates) {
                // Check if template already exists in API (by name)
                const exists = response.templates.some(t => t.name === localTemplate.name);
                if (!exists) {
                  try {
                    await api.post<{ success: boolean; template: BenchmarkConfigTemplate }>('/benchmark/configs', {
                      name: localTemplate.name,
                      description: localTemplate.description,
                      benchmarkTypes: localTemplate.benchmarkTypes,
                      isPublic: false,
                    });
                  } catch (migrationError) {
                    // Ignore migration errors - template might already exist or validation failed
                    console.warn('Failed to migrate template:', localTemplate.name, migrationError);
                  }
                }
              }
              // Clear localStorage after successful migration
              localStorage.removeItem('benchmark-config-templates');
            } catch (migrationError) {
              console.warn('Failed to migrate localStorage templates:', migrationError);
            }
          }
          return;
        }
      } catch (apiError) {
        // If API fails, fall back to localStorage for backward compatibility
        // Silently handle 404 errors (endpoint may not be available due to OpenAPI validation)
        const statusCode = (apiError as { statusCode?: number })?.statusCode || 
                          (apiError as { response?: { status?: number } })?.response?.status;
        if (statusCode !== 404) {
          // Only log non-404 errors
          console.warn('API load failed, falling back to localStorage:', apiError);
        }
      }
      
      // Fallback to localStorage (backward compatibility)
      const saved = localStorage.getItem('benchmark-config-templates');
      if (saved) {
        setTemplates(JSON.parse(saved));
      } else {
        // Default templates
        const defaultTemplates: BenchmarkConfigTemplate[] = [
          {
            name: t('benchmark.settingsComparison'),
            description: t('benchmark.settingsComparisonDesc'),
            benchmarkTypes: ['settings'],
          },
          {
            name: t('benchmark.fullBenchmarkSuite'),
            description: t('benchmark.runAllBenchmarkTypes'),
            benchmarkTypes: AVAILABLE_BENCHMARK_TYPES.map(t => t.id),
          },
        ];
        setTemplates(defaultTemplates);
        localStorage.setItem('benchmark-config-templates', JSON.stringify(defaultTemplates));
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      logError(error, 'load-benchmark-templates');
      toast.error(t('benchmark.templates.loadFailed'), t('common.tryAgainLater'));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const saveTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error(t('benchmark.templates.nameRequired'), t('benchmark.templates.nameRequiredDesc'));
      return;
    }
    if (newTemplateTypes.length === 0) {
      toast.error(t('benchmark.templates.typesRequired'), t('benchmark.templates.typesRequiredDesc'));
      return;
    }

    try {
      // Try API first
      try {
        const response = await api.post<{ success: boolean; template: BenchmarkConfigTemplate }>('/benchmark/configs', {
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim() || undefined,
          benchmarkTypes: newTemplateTypes,
          isPublic: false,
        });
        
        if (response.success && response.template) {
          setTemplates(prev => [...prev, response.template]);
          toast.success(t('benchmark.templates.saved'), t('benchmark.templates.savedDesc').replace('{{name}}', newTemplateName));
          setShowSaveDialog(false);
          setNewTemplateName('');
          setNewTemplateDescription('');
          setNewTemplateTypes(['settings']);
          return;
        }
      } catch (apiError) {
        // Fall back to localStorage if API fails
        console.warn('API save failed, falling back to localStorage:', apiError);
      }
      
      // Fallback to localStorage (backward compatibility)
      const newTemplate: BenchmarkConfigTemplate = {
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() || undefined,
        benchmarkTypes: newTemplateTypes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = [...templates, newTemplate];
      setTemplates(updated);
      localStorage.setItem('benchmark-config-templates', JSON.stringify(updated));
      toast.success(t('benchmark.templates.saved'), t('benchmark.templates.savedDesc').replace('{{name}}', newTemplateName));
      
      setShowSaveDialog(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateTypes(['settings']);
    } catch (error) {
      console.error('Error saving template:', error);
      logError(error, 'save-benchmark-template');
      toast.error(t('benchmark.templates.saveFailed'), t('common.tryAgainLater'));
    }
  };

  const deleteTemplate = async (template: BenchmarkConfigTemplate) => {
    try {
      // Try API first if template has _id
      if (template._id) {
        try {
          await api.delete(`/benchmark/configs/${template._id}`);
          setTemplates(prev => prev.filter(t => t._id !== template._id));
          if (selectedTemplate === template.name || selectedTemplate === template._id) {
            setSelectedTemplate(null);
          }
          toast.success(t('benchmark.templates.deleted'), t('benchmark.templates.deletedDesc').replace('{{name}}', template.name));
          return;
        } catch (apiError) {
          // Fall back to localStorage if API fails
          console.warn('API delete failed, falling back to localStorage:', apiError);
        }
      }
      
      // Fallback to localStorage (backward compatibility)
      const updated = templates.filter(t => t.name !== template.name);
      setTemplates(updated);
      localStorage.setItem('benchmark-config-templates', JSON.stringify(updated));
      if (selectedTemplate === template.name) {
        setSelectedTemplate(null);
      }
      toast.success(t('benchmark.templates.deleted'), t('benchmark.templates.deletedDesc').replace('{{name}}', template.name));
    } catch (error) {
      console.error('Error deleting template:', error);
      logError(error, 'delete-benchmark-template');
      toast.error(t('benchmark.templates.deleteFailed'), t('common.tryAgainLater'));
    }
  };

  // Load available feature flags
  const refetchFlags = async () => {
    setLoadingFlags(true);
    setFlagsError(null);
    try {
      const response = await api.get<{ flags: Array<{ name: string; enabled: boolean; description?: string; source: string }> }>('/feature-flags');
      // Only show database flags (not environment variables)
      const flags = response?.flags || [];
      const filteredFlags = flags.filter(f => f.source !== 'environment');
      setAvailableFlags(filteredFlags);
      if (filteredFlags.length === 0) {
        setFlagsError(`${t('featureFlags.noFlagsAvailable')}. ${t('featureFlags.configureFirst')}`);
      }
    } catch (error) {
      console.warn('Failed to load feature flags:', error);
      setAvailableFlags([]);
      setFlagsError(t('featureFlags.loadFailed'));
      toast.error(t('benchmark.featureFlags.loadFailed'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setLoadingFlags(false);
    }
  };

  useEffect(() => {
    refetchFlags();
  }, []);

  // Load benchmark config when workflow is selected
  useEffect(() => {
    const loadConfig = async (
      workflowId: string,
      setConfig: (config: WorkflowBenchmarkConfig) => void,
      setConfigSource: (source: 'default' | 'custom' | null) => void,
      setLoading: (loading: boolean) => void
    ) => {
      if (!workflowId) {
        setConfig(null);
        setConfigSource(null);
        return;
      }
      setLoading(true);
      try {
        const config = await api.workflow.getBenchmarkConfig(workflowId);
        // API returns config with _source metadata indicating if it's default or custom
        // Backend now provides defaults for predefined workflows
        
        // Extract source from response (may be non-enumerable, so check directly)
        const source = (config as any)?._source as 'custom' | 'default' | null | undefined;
        
        // Remove _source from config before storing (it's metadata only)
        const { _source, ...configWithoutSource } = config as any;
        
        if (source) {
          // Use API-provided source
          setConfig(configWithoutSource);
          setConfigSource(source);
        } else if (config && Object.keys(config).length > 0 && 
            ((config.featureFlags && Object.keys(config.featureFlags).length > 0) || 
             (config.params && Object.keys(config.params).length > 0))) {
          // Fallback: Config has content - assume custom
          setConfig(configWithoutSource);
          setConfigSource('custom');
        } else {
          // Empty config - assume default
          setConfig({ featureFlags: {}, params: {} });
          setConfigSource('default');
        }
      } catch (error) {
        // Differentiate between workflow not found (404) and other errors
        const statusCode = (error as { statusCode?: number })?.statusCode || 
                          (error as { response?: { status?: number } })?.response?.status;
        if (statusCode === 404) {
          // Workflow not found - this is a real error
          console.error('Workflow not found:', workflowId);
          setConfig(null);
          setConfigSource(null);
        } else {
          // Other errors - use empty config as fallback (default)
          setConfig({ featureFlags: {}, params: {} });
          setConfigSource('default');
          // Only log at debug level - not a warning since defaults are expected
          console.debug('Using default config for workflow:', workflowId);
        }
      } finally {
        setLoading(false);
      }
    };

    loadConfig(benchmarkWorkflowA, setWorkflowAConfig, setConfigSourceA, setLoadingConfigA);
    loadConfig(benchmarkWorkflowB, setWorkflowBConfig, setConfigSourceB, setLoadingConfigB);
  }, [benchmarkWorkflowA, benchmarkWorkflowB]);

  useEffect(() => {
    loadCurrentFlags();
    loadTemplates();
     
  }, []);

  const handleSaveConfig = async (
    workflowId: string,
    config: WorkflowBenchmarkConfig,
    setSaving: (saving: boolean) => void,
    setConfig: (config: WorkflowBenchmarkConfig) => void,
    setConfigSource: (source: 'default' | 'custom' | null) => void,
    setShowEdit: (show: boolean) => void
  ) => {
    if (!workflowId || !config) {
      toast.error(t('benchmark.config.invalid'), t('benchmark.config.invalidDesc'));
      return;
    }
    
    // Validate workflowId is not empty
    if (workflowId.trim() === '') {
      toast.error(t('benchmark.config.workflowRequired'), t('benchmark.config.workflowRequiredDesc'));
      return;
    }
    
    setSaving(true);
    try {
      // Ensure config is not null before sending
      const configToSave = config || { featureFlags: {}, params: {} };
      await api.workflow.setBenchmarkConfig(workflowId, configToSave);
      const enabledCount = Object.values(configToSave.featureFlags || {}).filter(v => v === true).length;
      toast.success(t('benchmark.config.saved'), t('benchmark.config.savedDesc').replace('{{count}}', String(enabledCount)));
      // Reload config and mark as custom since it was just saved
      const reloaded = await api.workflow.getBenchmarkConfig(workflowId);
      setConfig(reloaded);
      setConfigSource('custom');
      setShowEdit(false);
    } catch (error) {
      logError(error, 'save-benchmark-config');
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError');
      // Provide more helpful error message for workflow not found
      if (errorMessage.includes('not found')) {
        toast.error(t('benchmark.config.workflowNotFound'), t('benchmark.config.workflowNotFoundDesc').replace('{{workflowId}}', workflowId));
      } else {
        toast.error(t('benchmark.config.saveFailed'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditA = () => {
    setEditingConfigA(workflowAConfig || { featureFlags: {}, params: {} });
    setShowEditConfigA(true);
  };

  const handleOpenEditB = () => {
    setEditingConfigB(workflowBConfig || { featureFlags: {}, params: {} });
    setShowEditConfigB(true);
    // Clear search when opening dialog
    setFlagsSearchQuery('');
    // Focus search input after dialog opens
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Production Feature Flags Section */}
      <ProductionFeatureFlagsDisplay flags={currentFlags} />

      {/* General Benchmark Settings Section */}
      <GeneralBenchmarkSettings
        settings={generalSettings}
        onSettingsChange={setGeneralSettings}
      />

      {/* Benchmark Workflow Configuration Section */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Benchmark Workflow Configuration
          </CardTitle>
          <CardDescription>
            Configure feature flags for workflows used in benchmarks. These settings are isolated from production and only apply during benchmark runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Workflow A Configuration */}
            <WorkflowBenchmarkConfigCard
              workflowId={benchmarkWorkflowA}
              onWorkflowChange={setBenchmarkWorkflowA}
              config={workflowAConfig}
              configSource={configSourceA}
              loading={loadingConfigA}
              saving={savingConfigA}
              onEdit={handleOpenEditA}
              onSave={() => handleSaveConfig(benchmarkWorkflowA, workflowAConfig, setSavingConfigA, setWorkflowAConfig, setConfigSourceA, setShowEditConfigA)}
              label="A"
            />

            {/* Workflow B Configuration */}
            <WorkflowBenchmarkConfigCard
              workflowId={benchmarkWorkflowB}
              onWorkflowChange={setBenchmarkWorkflowB}
              config={workflowBConfig}
              configSource={configSourceB}
              loading={loadingConfigB}
              saving={savingConfigB}
              onEdit={handleOpenEditB}
              onSave={() => handleSaveConfig(benchmarkWorkflowB, workflowBConfig, setSavingConfigB, setWorkflowBConfig, setConfigSourceB, setShowEditConfigB)}
              label="B"
            />
          </div>
        </CardContent>
      </Card>

      <TemplateManagement
        templates={templates}
        loadingTemplates={loadingTemplates}
        selectedTemplate={selectedTemplate}
        onTemplateSelect={setSelectedTemplate}
        onTemplateDelete={deleteTemplate}
        onShowSaveDialog={() => setShowSaveDialog(true)}
        availableBenchmarkTypes={AVAILABLE_BENCHMARK_TYPES}
      />

      <SaveTemplateDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        templateName={newTemplateName}
        onTemplateNameChange={setNewTemplateName}
        templateDescription={newTemplateDescription}
        onTemplateDescriptionChange={setNewTemplateDescription}
        templateTypes={newTemplateTypes}
        onTemplateTypesChange={setNewTemplateTypes}
        availableBenchmarkTypes={AVAILABLE_BENCHMARK_TYPES}
        onSave={saveTemplate}
        onCancel={() => {
          setShowSaveDialog(false);
          setNewTemplateName('');
          setNewTemplateDescription('');
          setNewTemplateTypes(['settings']);
        }}
      />

      {/* Edit Configuration Dialog for Workflow A */}
      <EditBenchmarkConfigDialog
        open={showEditConfigA}
        onOpenChange={setShowEditConfigA}
        workflowLabel="A"
        editingConfig={editingConfigA}
        onEditingConfigChange={setEditingConfigA}
        savedConfig={workflowAConfig}
        onSave={() => {
          if (editingConfigA && benchmarkWorkflowA) {
            setWorkflowAConfig(editingConfigA);
            handleSaveConfig(benchmarkWorkflowA, editingConfigA, setSavingConfigA, setWorkflowAConfig, setConfigSourceA, setShowEditConfigA);
          }
        }}
        saving={savingConfigA}
        availableFlags={availableFlags.map(f => ({ name: f.name, description: f.description, enabled: f.enabled }))}
        loadingFlags={loadingFlags}
        flagsError={flagsError}
        onRefetchFlags={refetchFlags}
        flagsSearchQuery={flagsSearchQuery}
        onFlagsSearchQueryChange={setFlagsSearchQuery}
      />

      {/* Edit Configuration Dialog for Workflow B */}
      <EditBenchmarkConfigDialog
        open={showEditConfigB}
        onOpenChange={setShowEditConfigB}
        workflowLabel="B"
        editingConfig={editingConfigB}
        onEditingConfigChange={setEditingConfigB}
        savedConfig={workflowBConfig}
        onSave={() => {
          if (editingConfigB && benchmarkWorkflowB) {
            setWorkflowBConfig(editingConfigB);
            handleSaveConfig(benchmarkWorkflowB, editingConfigB, setSavingConfigB, setWorkflowBConfig, setConfigSourceB, setShowEditConfigB);
          }
        }}
        saving={savingConfigB}
        availableFlags={availableFlags.map(f => ({ name: f.name, description: f.description, enabled: f.enabled }))}
        loadingFlags={loadingFlags}
        flagsError={flagsError}
        onRefetchFlags={refetchFlags}
        flagsSearchQuery={flagsSearchQuery}
        onFlagsSearchQueryChange={setFlagsSearchQuery}
      />
    </div>
  );
}
