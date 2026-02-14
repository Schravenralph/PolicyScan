/**
 * BeleidsscanConfigurationPage
 * 
 * Configuration page for selecting which workflow to use in the Beleidsscan wizard
 * and managing feature flags per workflow configuration.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Plus, Play, Settings, Loader2, FileText, Network, Zap, Scale } from 'lucide-react';
import { useWorkflowConfiguration } from '../hooks/useWorkflowConfiguration';
import { api } from '../services/api';
import type {
  WorkflowConfiguration,
  WorkflowConfigurationCreateInput,
  ConfigurableFeatureFlag,
  WorkflowConfigurationTemplate,
} from '../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../services/api/WorkflowApiService';
import { toast } from '../utils/toast';
import { DeleteConfigurationDialog } from '../components/Beleidsscan/DeleteConfigurationDialog';
import { ActiveConfigurationCard } from '../components/Beleidsscan/ActiveConfigurationCard';
import { ConfigurationCard } from '../components/Beleidsscan/ConfigurationCard';
import { ConfigurationTemplatesSection } from '../components/Beleidsscan/ConfigurationTemplatesSection';
import { ConfigurationDialog } from '../components/Beleidsscan/ConfigurationDialog';
import { TemplatePreviewDialog } from '../components/Beleidsscan/TemplatePreviewDialog';
import { ImportConfigurationDialog } from '../components/Beleidsscan/ImportConfigurationDialog';

interface FeatureFlagCategory {
  name: string;
  flags: ConfigurableFeatureFlag[];
}

export function BeleidsscanConfigurationPage() {
  const navigate = useNavigate();
  const {
    configurations,
    activeConfiguration,
    availableWorkflows,
    availableFeatureFlags,
    templates,
    isLoading,
    loadConfigurations,
    loadAvailableFeatureFlags,
    loadTemplates,
    refreshActiveConfiguration,
    createConfiguration,
    updateConfiguration,
    activateConfiguration,
    deleteConfiguration,
    duplicateConfiguration,
  } = useWorkflowConfiguration();

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<WorkflowConfiguration | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowConfigurationTemplate | null>(null);
  
  // Import states
  const [importFileName, setImportFileName] = useState('');
  const [importData, setImportData] = useState<{
    version: number;
    exportedAt: string;
    configuration: {
      name: string;
      description?: string;
      workflowId: string;
      featureFlags: Record<string, boolean>;
    };
  } | null>(null);
  const [importName, setImportName] = useState('');

  // Form states (reserved for future use)
  const [, setFormName] = useState('');
  const [, setFormDescription] = useState('');
  const [, setFormWorkflowId] = useState('beleidsscan-wizard');
  const [, setFormFeatureFlags] = useState<Record<string, boolean>>({});
  const [, setFormIsActive] = useState(false);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  
  // Accessibility: Status announcements
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Load feature flags and templates on mount
  useEffect(() => {
    loadAvailableFeatureFlags();
    loadTemplates();
  }, [loadAvailableFeatureFlags, loadTemplates]);

  // Clear status message after announcement
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage('');
      }, 5000); // Clear after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Group feature flags by category
  const flagCategories = useMemo((): FeatureFlagCategory[] => {
    const categories = new Map<string, ConfigurableFeatureFlag[]>();
    
    for (const flag of availableFeatureFlags) {
      const category = flag.category || 'Other';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(flag);
    }

    return Array.from(categories.entries())
      .map(([name, flags]) => ({ name, flags }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availableFeatureFlags]);

  // Reset form
  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormWorkflowId('beleidsscan-wizard');
    setFormFeatureFlags({});
    setFormIsActive(false);
    setSelectedConfig(null);
  };

  // Open create dialog
  const handleOpenCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  // Open edit dialog
  const handleOpenEdit = (config: WorkflowConfiguration) => {
    setSelectedConfig(config);
    setFormName(config.name);
    setFormDescription(config.description || '');
    setFormWorkflowId(config.workflowId);
    setFormFeatureFlags({ ...config.featureFlags });
    setFormIsActive(config.isActive);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const handleOpenDelete = (config: WorkflowConfiguration) => {
    setSelectedConfig(config);
    setShowDeleteDialog(true);
  };

  // Handle create/update via ConfigurationDialog
  const handleConfigurationSubmit = async (data: {
    name: string;
    description?: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
    isActive: boolean;
  }) => {
    setIsSaving(true);
    try {
      if (showCreateDialog) {
        const input: WorkflowConfigurationCreateInput = {
          name: data.name,
          description: data.description,
          workflowId: data.workflowId,
          featureFlags: data.featureFlags,
          isActive: data.isActive,
        };
        await createConfiguration(input);
        setStatusMessage(`Configuratie "${data.name}" is succesvol aangemaakt`);
        setShowCreateDialog(false);
      } else if (showEditDialog && selectedConfig?._id) {
        await updateConfiguration(selectedConfig._id, {
          name: data.name,
          description: data.description,
          workflowId: data.workflowId,
          featureFlags: data.featureFlags,
          isActive: data.isActive,
        });
        setStatusMessage(`Configuratie "${data.name}" is succesvol bijgewerkt`);
        setShowEditDialog(false);
      }
      resetForm();
    } catch {
      // Error handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedConfig?._id) return;

    setIsDeleting(true);
    try {
      const deletedName = selectedConfig.name;
      await deleteConfiguration(selectedConfig._id);
      setStatusMessage(`Configuratie "${deletedName}" is verwijderd`);
      setShowDeleteDialog(false);
      resetForm();
    } catch {
      // Error handled by hook
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle activate
  const handleActivate = async (configId: string) => {
    setActivatingId(configId);
    try {
      await activateConfiguration(configId);
      // Cache is already updated by activateConfiguration hook
      const config = configurations.find(c => c._id === configId);
      if (config) {
        setStatusMessage(`Configuratie "${config.name}" is nu actief`);
      }
    } catch {
      // Error handled by hook
    } finally {
      setActivatingId(null);
    }
  };

  // Handle duplicate
  const handleDuplicate = async (config: WorkflowConfiguration) => {
    try {
      await duplicateConfiguration(config._id!, `${config.name} (kopie)`);
    } catch {
      // Error handled by hook
    }
  };

  // Handle export
  const handleExport = async (config: WorkflowConfiguration) => {
    try {
      await api.workflowConfiguration.exportConfiguration(config._id!);
      toast.success('Configuratie geëxporteerd', `"${config.name}" is succesvol geëxporteerd`);
    } catch (error) {
      toast.error('Fout bij exporteren', error instanceof Error ? error.message : 'Kon configuratie niet exporteren');
    }
  };

  // Handle import file select
  const handleImportFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          toast.error('Fout bij lezen', 'Kon bestand niet lezen');
          return;
        }

        const parsed = JSON.parse(text);
        
        // Validate structure
        if (!parsed.configuration) {
          toast.error('Ongeldig bestand', 'Bestand mist configuratie data');
          return;
        }

        if (!parsed.configuration.workflowId) {
          toast.error('Ongeldig bestand', 'Configuratie mist workflow ID');
          return;
        }

        setImportData(parsed);
        setImportName(parsed.configuration.name || '');
      } catch (error) {
        toast.error('Fout bij parseren', 'Kon JSON bestand niet parseren');
        setImportData(null);
      }
    };
    reader.readAsText(file);
  };

  // Handle import
  const handleImport = async () => {
    if (!importData) return;

    setIsSaving(true);
    try {
      const imported = await api.workflowConfiguration.importConfiguration(
        importData,
        importName.trim() || undefined
      );
      setStatusMessage(`Configuratie "${imported.name}" is succesvol geïmporteerd`);
      setShowImportDialog(false);
      setImportData(null);
      setImportFileName('');
      setImportName('');
      await loadConfigurations();
    } catch (error) {
      toast.error('Fout bij importeren', error instanceof Error ? error.message : 'Kon configuratie niet importeren');
    } finally {
      setIsSaving(false);
    }
  };

  // Get icon component by name
  const getIconComponent = (iconName?: string): React.ComponentType<{ className?: string }> => {
    const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
      FileText,
      Network,
      Zap,
      Scale,
    };
    return iconMap[iconName || ''] || Settings;
  };

  // Handle template preview
  const handleTemplatePreview = (template: WorkflowConfigurationTemplate) => {
    setSelectedTemplate(template);
    setShowTemplatePreview(true);
  };

  // Generate unique name for configuration based on template
  const generateUniqueName = (baseName: string): string => {
    const baseCopyName = `${baseName} - Kopie`;
    const existingNames = new Set(configurations.map(c => c.name));
    
    if (!existingNames.has(baseCopyName)) {
      return baseCopyName;
    }
    
    // Find the highest number suffix
    let maxNumber = 1;
    const namePattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - Kopie (\\d+)$`);
    configurations.forEach(config => {
      const match = config.name.match(namePattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= maxNumber) {
          maxNumber = num + 1;
        }
      }
    });
    
    return `${baseName} - Kopie ${maxNumber}`;
  };

  // Handle use template
  const handleUseTemplate = async (template: WorkflowConfigurationTemplate, activate: boolean = false) => {
    setIsSaving(true);
    try {
      // Check if a configuration matching this template already exists
      const baseCopyName = `${template.name} - Kopie`;
      const existingConfig = configurations.find(
        config => 
          config.name === baseCopyName &&
          config.workflowId === template.workflowId &&
          JSON.stringify(config.featureFlags) === JSON.stringify(template.featureFlags)
      );

      if (existingConfig) {
        // Configuration already exists - activate it if requested
        if (activate && !existingConfig.isActive) {
          await activateConfiguration(existingConfig._id!);
          setStatusMessage(`Configuratie "${existingConfig.name}" is geactiveerd`);
        } else {
          setStatusMessage(`Configuratie "${existingConfig.name}" bestaat al`);
        }
        setShowTemplatePreview(false);
        setSelectedTemplate(null);
        return;
      }

      // Create new configuration with unique name
      const uniqueName = generateUniqueName(template.name);
      const input: WorkflowConfigurationCreateInput = {
        name: uniqueName,
        description: template.description,
        workflowId: template.workflowId,
        featureFlags: { ...template.featureFlags },
        isActive: activate,
      };
      await createConfiguration(input);
      setStatusMessage(`Configuratie "${input.name}" is succesvol aangemaakt van template`);
      setShowTemplatePreview(false);
      setSelectedTemplate(null);
    } catch {
      // Error handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      {/* ARIA Live Region for Status Announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        role="status"
      >
        {statusMessage}
      </div>
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Beleidsscan Configuratie</h1>
            <p className="text-muted-foreground mt-1">
              Selecteer welke workflow en feature flags worden gebruikt in de Beleidsscan wizard
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/beleidsscan')}
            >
              <Play className="h-4 w-4 mr-2" />
              Naar Beleidsscan
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe Configuratie
            </Button>
          </div>
        </div>

        {/* Active Configuration Card */}
        {activeConfiguration && (
          <ActiveConfigurationCard
            activeConfiguration={activeConfiguration}
            availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
            onEdit={handleOpenEdit}
            onRefresh={refreshActiveConfiguration}
            isLoading={isLoading}
          />
        )}

        {/* Templates Section */}
        <ConfigurationTemplatesSection
          templates={templates}
          availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
          onUseTemplate={handleUseTemplate}
          onPreviewTemplate={handleTemplatePreview}
          isSaving={isSaving}
          getIconComponent={getIconComponent}
        />

        {/* Loading State */}
        {isLoading && configurations.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && configurations.length === 0 && (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Settings className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Geen configuraties</h3>
              <p className="text-muted-foreground mb-4 max-w-md">
                Maak een configuratie aan om te bepalen welke workflow en feature flags worden gebruikt in de Beleidsscan wizard.
              </p>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Eerste Configuratie Aanmaken
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Configuration Cards */}
        {configurations.length > 0 && (
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            role="list"
            aria-label="Workflow configuraties"
          >
            {configurations.map((config) => (
              <ConfigurationCard
                key={config._id}
                config={config}
                availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
                onActivate={handleActivate}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
                onDuplicate={handleDuplicate}
                onExport={handleExport}
                activatingId={activatingId}
              />
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <ConfigurationDialog
          open={showCreateDialog || showEditDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              resetForm();
            }
          }}
          mode={showCreateDialog ? 'create' : 'edit'}
          config={selectedConfig}
          availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
          flagCategories={flagCategories}
          onSubmit={handleConfigurationSubmit}
          isSaving={isSaving}
        />

        {/* Delete Confirmation Dialog */}
        <DeleteConfigurationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          config={selectedConfig}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />

        {/* Template Preview Dialog */}
        <TemplatePreviewDialog
          open={showTemplatePreview}
          onOpenChange={(open) => {
            setShowTemplatePreview(open);
            if (!open) {
              setSelectedTemplate(null);
            }
          }}
          template={selectedTemplate}
          availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
          onUseTemplate={handleUseTemplate}
          isSaving={isSaving}
        />

        {/* Import Configuration Dialog */}
        <ImportConfigurationDialog
          open={showImportDialog}
          onOpenChange={(open) => {
            setShowImportDialog(open);
            if (!open) {
              setImportData(null);
              setImportFileName('');
              setImportName('');
            }
          }}
          importFileName={importFileName}
          importData={importData}
          importName={importName}
          availableWorkflows={availableWorkflows as unknown as WorkflowDocument[]}
          onFileSelect={handleImportFileSelect}
          onImportNameChange={setImportName}
          onImport={handleImport}
          isSaving={isSaving}
        />
      </div>
    </Layout>
  );
}

