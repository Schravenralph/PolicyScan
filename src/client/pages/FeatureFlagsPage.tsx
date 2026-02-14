import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import type {
  FeatureFlag,
  FeatureFlagCategory,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types/featureFlags.js';
import {
  getFeatureFlagCategories,
  separateFlagsBySource,
  separateFlagsByDependencies,
  filterFlagsByCategory,
  groupFlagsByCategory,
  calculateCategoryStats,
  getEffectiveFlagState,
} from '../utils/featureFlagUtils.js';
import { useFeatureFlagsManagement } from '../hooks/useFeatureFlagsManagement.js';
import { useFeatureFlagTemplates } from '../hooks/useFeatureFlagTemplates.js';
import { useFeatureFlagValidation } from '../hooks/useFeatureFlagValidation.js';
import { FeatureFlagDialogs } from '../components/feature-flags/FeatureFlagDialogs.js';
import { FeatureFlagList } from '../components/feature-flags/FeatureFlagList.js';
import { FeatureFlagTemplateSection } from '../components/feature-flags/FeatureFlagTemplateSection.js';
import { FeatureFlagHeader } from '../components/feature-flags/FeatureFlagHeader.js';

export function FeatureFlagsPage() {
  const navigate = useNavigate();
  
  // Initialize hooks
  const flagsManagement = useFeatureFlagsManagement();
  const validation = useFeatureFlagValidation();
  const templatesHook = useFeatureFlagTemplates();
  
  // Component-level state (shared between hooks)
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkFlags, setBulkFlags] = useState<Record<string, boolean>>({});
  const [bulkConfigName, setBulkConfigName] = useState('');
  const [, setApplyingBulk] = useState(false);
  const [selectedFlagForDeps, setSelectedFlagForDeps] = useState<string | null>(null);
  const [showDependencies, setShowDependencies] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FeatureFlagCategory | 'All'>('All');
  const [viewMode, _setViewMode] = useState<'list' | 'grouped'>('list');
  
  // Draft mode state - allows staging changes before saving
  const [draftMode, setDraftMode] = useState(false);
  const [draftFlags, setDraftFlags] = useState<Record<string, boolean>>({});
  const [savingDraft, setSavingDraft] = useState(false);
  
  // Dialog visibility state
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState<string | null>(null);
  const [showCancelDraftDialog, setShowCancelDraftDialog] = useState(false);
  const [showDeleteTemplateDialog, setShowDeleteTemplateDialog] = useState(false);
  
  // Template form state
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateIsPublic, setNewTemplateIsPublic] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  
  // Extract state and methods from hooks for convenience
  const { flags, loading, refreshing, updating, dependencyGraphs, loadFlags, refreshCache, loadDependencyGraphs, setFlags, setUpdating } = flagsManagement;
  const { validationErrors, validationWarnings, validateBulkConfig, setValidationErrors, setValidationWarnings } = validation;
  const { templates, loadTemplates, saveCurrentAsTemplate: saveTemplateHook, applyTemplate: applyTemplateHook, deleteTemplate: deleteTemplateHook, getTemplateDifferences } = templatesHook;

  const updateFlag = async (flagName: string, enabled: boolean, cascade = true) => {
    // If in draft mode, just update the draft state (no validation until save)
    if (draftMode) {
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
      setValidationErrors(prev => {
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
      await loadFlags();
    } catch (error: unknown) {
      console.error('Error updating feature flag:', error);
      
      // Extract validation errors if present
      if (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object') {
        
        const errorData = error.response.data as { error?: string; validation?: ValidationResult };
        
        if (errorData.validation) {
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
      await loadFlags();
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(flagName);
        return next;
      });
    }
  };

  const startBulkEdit = () => {
    const initialBulkFlags: Record<string, boolean> = {};
    databaseFlags.forEach(flag => {
      initialBulkFlags[flag.name] = flag.enabled;
    });
    setBulkFlags(initialBulkFlags);
    setBulkEditMode(true);
  };

  const cancelBulkEdit = () => {
    setBulkEditMode(false);
    setBulkFlags({});
    setBulkConfigName('');
  };

  // Draft mode functions
  const enableDraftMode = () => {
    const initialDraftFlags: Record<string, boolean> = {};
    databaseFlags.forEach(flag => {
      initialDraftFlags[flag.name] = flag.enabled;
    });
    setDraftFlags(initialDraftFlags);
    setDraftMode(true);
  };

  const cancelDraftMode = () => {
    if (hasPendingChanges()) {
      setShowCancelDraftDialog(true);
    } else {
      setDraftMode(false);
      setDraftFlags({});
      setValidationErrors({});
      setValidationWarnings({});
    }
  };

  const confirmCancelDraftMode = () => {
    setDraftMode(false);
    setDraftFlags({});
    setValidationErrors({});
    setValidationWarnings({});
    setShowCancelDraftDialog(false);
  };

  const saveDraftChanges = async () => {
    try {
      setSavingDraft(true);
      
      // Build complete flag configuration (current flags + draft changes)
      const completeFlags: Record<string, boolean> = {};
      databaseFlags.forEach(flag => {
        completeFlags[flag.name] = flag.enabled;
      });
      // Apply draft changes
      Object.entries(draftFlags).forEach(([flagName, enabled]) => {
        completeFlags[flagName] = enabled;
      });
      
      // Validate all changes first
      const validation = await validateBulkConfig(completeFlags);
      
      // In draft mode, show warnings for issues but allow save (errors will block save)
      const warningsByFlag: Record<string, ValidationWarning[]> = {};
      const errorsByFlag: Record<string, ValidationError[]> = {};
      
      // Convert dependency/required errors to warnings in draft mode
      validation.errors.forEach(err => {
        if (err.type === 'required' || err.type === 'dependency') {
          // Convert to warning
          if (!warningsByFlag[err.flag]) {
            warningsByFlag[err.flag] = [];
          }
          warningsByFlag[err.flag].push({
            type: 'recommendation',
            flag: err.flag,
            message: err.message,
            relatedFlags: err.relatedFlags,
          });
        } else {
          // Keep conflicts and mutually-exclusive as errors (block save)
          if (!errorsByFlag[err.flag]) {
            errorsByFlag[err.flag] = [];
          }
          errorsByFlag[err.flag].push(err);
        }
      });
      
      // Add existing warnings
      validation.warnings.forEach(warning => {
        if (!warningsByFlag[warning.flag]) {
          warningsByFlag[warning.flag] = [];
        }
        warningsByFlag[warning.flag].push(warning);
      });
      
      setValidationWarnings(warningsByFlag);
      
      // Only block save if there are actual errors (conflicts, mutually-exclusive)
      if (validation.errors.length > 0 && Object.keys(errorsByFlag).length > 0) {
        setValidationErrors(errorsByFlag);
        validation.errors.forEach(err => {
          if (err.type === 'conflict' || err.type === 'mutually-exclusive') {
            toast.error('Validation failed', err.message);
          }
        });
        return;
      }
      
      // Auto-enable required flags to resolve warnings
      const autoEnabledFlags: string[] = [];
      Object.entries(warningsByFlag).forEach(([flagName, warnings]) => {
        warnings.forEach(warning => {
          if (warning.relatedFlags && warning.relatedFlags.length > 0) {
            warning.relatedFlags.forEach(relatedFlag => {
              // Check if the flag that requires this related flag is enabled in draft
              const flagEnabled = completeFlags[flagName];
              const relatedFlagEnabled = completeFlags[relatedFlag];
              
              if (flagEnabled && !relatedFlagEnabled) {
                // Auto-enable the required flag
                if (draftFlags[relatedFlag] !== true) {
                  draftFlags[relatedFlag] = true;
                  autoEnabledFlags.push(relatedFlag);
                }
              }
            });
          }
        });
      });
      
      // If we auto-enabled any flags, re-validate
      if (autoEnabledFlags.length > 0) {
        // Update complete flags with auto-enabled flags
        autoEnabledFlags.forEach(flagName => {
          completeFlags[flagName] = true;
        });
        
        // Re-validate with auto-enabled flags
        const revalidation = await validateBulkConfig(completeFlags);
        
        // Update warnings/errors with revalidation results
        const updatedWarningsByFlag: Record<string, ValidationWarning[]> = {};
        const updatedErrorsByFlag: Record<string, ValidationError[]> = {};
        
        revalidation.errors.forEach(err => {
          if (err.type === 'required' || err.type === 'dependency') {
            if (!updatedWarningsByFlag[err.flag]) {
              updatedWarningsByFlag[err.flag] = [];
            }
            updatedWarningsByFlag[err.flag].push({
              type: 'recommendation',
              flag: err.flag,
              message: err.message,
              relatedFlags: err.relatedFlags,
            });
          } else {
            if (!updatedErrorsByFlag[err.flag]) {
              updatedErrorsByFlag[err.flag] = [];
            }
            updatedErrorsByFlag[err.flag].push(err);
          }
        });
        
        revalidation.warnings.forEach(warning => {
          if (!updatedWarningsByFlag[warning.flag]) {
            updatedWarningsByFlag[warning.flag] = [];
          }
          updatedWarningsByFlag[warning.flag].push(warning);
        });
        
        setValidationWarnings(updatedWarningsByFlag);
        setValidationErrors(updatedErrorsByFlag);
        
        if (revalidation.errors.length > 0 && Object.keys(updatedErrorsByFlag).length > 0) {
          revalidation.errors.forEach(err => {
            if (err.type === 'conflict' || err.type === 'mutually-exclusive') {
              toast.error('Validation failed', err.message);
            }
          });
          return;
        }
        
        if (autoEnabledFlags.length > 0) {
          toast.info(
            'Auto-enabled required flags',
            `Automatically enabled: ${autoEnabledFlags.join(', ')}`
          );
        }
      }
      
      // Show warnings but allow save
      if (Object.keys(warningsByFlag).length > 0) {
        Object.values(warningsByFlag).flat().forEach(warning => {
          toast.warning('Warning', warning.message);
        });
      }
      
      // Clear validation errors (only warnings remain)
      setValidationErrors({});

      // Apply all changes directly via API (bypassing draft mode check)
      // Include auto-enabled flags in the changes
      const changedFlags = Object.entries(draftFlags).filter(([flagName, enabled]) => {
        const currentFlag = flags.find(f => f.name === flagName);
        return currentFlag && currentFlag.enabled !== enabled;
      });

      if (changedFlags.length === 0) {
        toast.info('No changes to save', 'All flags are already in the desired state');
        cancelDraftMode();
        return;
      }

      // Sort flags by dependency order: required flags first, then flags that require them
      const sortedFlags = [...changedFlags].sort(([flagA, enabledA], [flagB, enabledB]) => {
        // If enabling a flag, check if it requires the other flag
        if (enabledA && enabledB) {
          const graphA = dependencyGraphs.get(flagA);
          const graphB = dependencyGraphs.get(flagB);
          
          // If flagA requires flagB, save flagB first
          if (graphA?.requires.includes(flagB)) {
            return 1; // flagB comes first
          }
          // If flagB requires flagA, save flagA first
          if (graphB?.requires.includes(flagA)) {
            return -1; // flagA comes first
          }
        }
        
        // If disabling, order doesn't matter as much, but disable dependents first
        if (!enabledA && enabledB) {
          const graphA = dependencyGraphs.get(flagA);
          if (graphA?.requiredBy?.includes(flagB)) {
            return -1; // Disable flagA (dependent) first
          }
        }
        if (enabledA && !enabledB) {
          const graphB = dependencyGraphs.get(flagB);
          if (graphB?.requiredBy?.includes(flagA)) {
            return 1; // Disable flagB (dependent) first
          }
        }
        
        return 0; // Keep original order if no dependency
      });

      // Apply changes one by one to handle cascade operations properly
      for (const [flagName, enabled] of sortedFlags) {
        try {
          setUpdating(prev => new Set(prev).add(flagName));
          setValidationErrors(prev => {
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
          }>(`/feature-flags/${flagName}`, { enabled, cascade: true });

          // Update local state
          setFlags(prev => prev.map(flag => 
            flag.name === flagName 
              ? { ...flag, enabled, source: 'database' as const }
              : flag
          ));

          // Show warnings if any
          if (response.warnings && response.warnings.length > 0) {
            response.warnings.forEach(warning => {
              toast.warning('Warning', warning.message);
            });
          }
        } catch (error: unknown) {
          console.error(`Error updating flag ${flagName}:`, error);
          
          // Extract validation errors if present
          if (error && typeof error === 'object' && 'response' in error && 
            error.response && typeof error.response === 'object' && 'data' in error.response &&
            error.response.data && typeof error.response.data === 'object') {
            
            const errorData = error.response.data as { error?: string; validation?: ValidationResult };
            
            if (errorData.validation) {
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
                : `Failed to update ${flagName}`;
              toast.error('Update failed', errorMessage);
            }
          } else {
            toast.error('Update failed', `Failed to update ${flagName}`);
          }
        } finally {
          setUpdating(prev => {
            const next = new Set(prev);
            next.delete(flagName);
            return next;
          });
        }
      }
      
      // Reload flags to get updated states
      await loadFlags();
      
      toast.success(
        'Changes saved',
        `Updated ${changedFlags.length} feature flag${changedFlags.length !== 1 ? 's' : ''}`
      );
      
      // Clear all validation state
      setValidationErrors({});
      setValidationWarnings({});
      cancelDraftMode();
    } catch (error: unknown) {
      console.error('Error saving draft changes:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to save changes';
      toast.error('Save failed', errorMessage);
    } finally {
      setSavingDraft(false);
    }
  };

  // Get the effective flag state (draft or actual) - using utility function
  const getFlagState = (flag: FeatureFlag): boolean => {
    return getEffectiveFlagState(flag, draftMode, draftFlags);
  };

  // Check if there are pending changes
  const hasPendingChanges = (): boolean => {
    if (!draftMode) return false;
    return databaseFlags.some(flag => {
      const draftValue = draftFlags[flag.name];
      return draftValue !== undefined && draftValue !== flag.enabled;
    });
  };

  // Count pending changes
  const getPendingChangesCount = (): number => {
    if (!draftMode) return 0;
    return databaseFlags.filter(flag => {
      const draftValue = draftFlags[flag.name];
      return draftValue !== undefined && draftValue !== flag.enabled;
    }).length;
  };

  const _updateBulkFlag = (flagName: string, enabled: boolean) => {
    setBulkFlags(prev => ({
      ...prev,
      [flagName]: enabled,
    }));
  };
  void _updateBulkFlag;

  const _applyBulkConfig = async () => {
    void _applyBulkConfig;
    try {
      setApplyingBulk(true);
      
      // Validate configuration first
      const validation = await validateBulkConfig(bulkFlags);
      if (!validation.valid) {
        validation.errors.forEach(err => {
          toast.error('Validation failed', err.message);
        });
        return;
      }

      await api.post('/feature-flags/benchmark-config', {
        flags: bulkFlags,
        name: bulkConfigName || undefined,
      });
      
      await loadFlags();
      toast.success(
        'Bulk configuration applied',
        `Updated ${Object.keys(bulkFlags).length} feature flags${bulkConfigName ? ` (${bulkConfigName})` : ''}`
      );
      cancelBulkEdit();
    } catch (error: unknown) {
      console.error('Error applying bulk config:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to apply bulk configuration';
      toast.error('Bulk update failed', errorMessage);
    } finally {
      setApplyingBulk(false);
    }
  };

  // Wrapper for saveCurrentAsTemplate that handles dialog state
  const saveCurrentAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Template name required', 'Please enter a template name');
      return;
    }

    try {
      setSavingTemplate(true);
      
      // Use draft flags if in draft mode, otherwise use current flags
      const flagsToSave = draftMode && Object.keys(draftFlags).length > 0
        ? draftFlags
        : flags.reduce((acc, flag) => {
            if (flag.source === 'database') {
              acc[flag.name] = flag.enabled;
            }
            return acc;
          }, {} as Record<string, boolean>);
      
      await saveTemplateHook(newTemplateName, newTemplateDescription, newTemplateIsPublic, flagsToSave);
      
      setShowSaveTemplateDialog(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateIsPublic(false);
    } catch (error) {
      // Error already handled by hook
    } finally {
      setSavingTemplate(false);
    }
  };

  // Wrapper for applyTemplate that handles loading flags and dialog state
  const applyTemplate = async (templateId: string, templateName: string) => {
    try {
      setApplyingTemplate(templateId);
      await applyTemplateHook(templateId, templateName);
      await loadFlags();
      setShowTemplatePreview(null);
    } catch (error) {
      // Error already handled by hook
    } finally {
      setApplyingTemplate(null);
    }
  };

  // Wrapper for deleteTemplate that handles dialog state
  const deleteTemplate = (templateId: string, templateName: string) => {
    setTemplateToDelete({ id: templateId, name: templateName });
    setShowDeleteTemplateDialog(true);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      await deleteTemplateHook(templateToDelete.id, templateToDelete.name);
      setShowDeleteTemplateDialog(false);
      setTemplateToDelete(null);
    } catch (error) {
      // Error already handled by hook
    }
  };

  // Wrapper for getTemplateDifferences that uses hook method
  const getTemplateDifferencesLocal = (templateFlags: Record<string, boolean>) => {
    return getTemplateDifferences(templateFlags, flags);
  };

  useEffect(() => {
    loadFlags();
    loadDependencyGraphs();
    loadTemplates();
  }, [loadDependencyGraphs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading feature flags...</div>
      </div>
    );
  }

  // Use utility functions for flag organization
  const { environmentFlags, databaseFlags } = separateFlagsBySource(flags);
  const { independentFlags, dependentFlags } = separateFlagsByDependencies(databaseFlags, dependencyGraphs);
  
  // Category filtering
  const filteredDatabaseFlags = filterFlagsByCategory(databaseFlags, selectedCategory);
  const filteredIndependentFlags = filterFlagsByCategory(independentFlags, selectedCategory);
  const filteredDependentFlags = filterFlagsByCategory(dependentFlags, selectedCategory);
  
  // Get categories and group flags
  const categories = getFeatureFlagCategories();
  const flagsByCategory = groupFlagsByCategory(databaseFlags, categories);
  
  // Calculate category statistics (considering draft mode)
  const categoryStats = calculateCategoryStats(flagsByCategory, draftMode, draftFlags);
  
  // Bulk operations by category
  const enableCategoryFlags = async (category: FeatureFlagCategory) => {
    const categoryFlags = flagsByCategory[category];
    
    if (draftMode) {
      // Update draft state for all flags in category
      setDraftFlags(prev => {
        const updated = { ...prev };
        categoryFlags.forEach(flag => {
          if (flag.source === 'database') {
            updated[flag.name] = true;
          }
        });
        return updated;
      });
      toast.success(`Enabled all ${category} flags in draft`, `${categoryFlags.length} flags updated`);
    } else {
      // Apply immediately
      const updates = categoryFlags.map(flag => 
        updateFlag(flag.name, true)
      );
      await Promise.all(updates);
      toast.success(`Enabled all ${category} flags`, `${categoryFlags.length} flags enabled`);
    }
  };
  
  const disableCategoryFlags = async (category: FeatureFlagCategory) => {
    const categoryFlags = flagsByCategory[category];
    
    if (draftMode) {
      // Update draft state for all flags in category
      setDraftFlags(prev => {
        const updated = { ...prev };
        categoryFlags.forEach(flag => {
          if (flag.source === 'database') {
            updated[flag.name] = false;
          }
        });
        return updated;
      });
      toast.success(`Disabled all ${category} flags in draft`, `${categoryFlags.length} flags updated`);
    } else {
      // Apply immediately
      const updates = categoryFlags.map(flag => 
        updateFlag(flag.name, false)
      );
      await Promise.all(updates);
      toast.success(`Disabled all ${category} flags`, `${categoryFlags.length} flags disabled`);
    }
  };

  return (
    <div className="space-y-6">
      <FeatureFlagHeader
        bulkEditMode={bulkEditMode}
        draftMode={draftMode}
        databaseFlagsCount={databaseFlags.length}
        savingDraft={savingDraft}
        refreshing={refreshing}
        hasPendingChanges={hasPendingChanges()}
        pendingChangesCount={getPendingChangesCount()}
        onNavigateToTemplates={() => navigate('/feature-flags/templates')}
        onSaveTemplate={() => setShowSaveTemplateDialog(true)}
        onEnableDraftMode={enableDraftMode}
        onStartBulkEdit={startBulkEdit}
        onCancelDraftMode={cancelDraftMode}
        onSaveDraftChanges={saveDraftChanges}
        onRefreshCache={refreshCache}
      />

      {!bulkEditMode && (
        <FeatureFlagList
          environmentFlags={environmentFlags}
          databaseFlags={databaseFlags}
          filteredDatabaseFlags={filteredDatabaseFlags}
          filteredIndependentFlags={filteredIndependentFlags}
          filteredDependentFlags={filteredDependentFlags}
          flagsByCategory={flagsByCategory}
          categoryStats={categoryStats}
          categories={categories}
          viewMode={viewMode}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          draftMode={draftMode}
          draftFlags={draftFlags}
          updating={updating}
          validationErrors={validationErrors}
          validationWarnings={validationWarnings}
          dependencyGraphs={dependencyGraphs}
          selectedFlagForDeps={selectedFlagForDeps}
          showDependencies={showDependencies}
          onUpdateFlag={updateFlag}
          onViewDependencies={(flagName) => {
            setSelectedFlagForDeps(flagName);
            setShowDependencies(true);
          }}
          onCloseDependencies={() => setShowDependencies(false)}
          onEnableCategoryFlags={enableCategoryFlags}
          onDisableCategoryFlags={disableCategoryFlags}
          getFlagState={getFlagState}
        />
      )}

      {flags.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No feature flags found
        </div>
      )}

      {/* Template Management Section */}
      <FeatureFlagTemplateSection
        templates={templates}
        bulkEditMode={bulkEditMode}
        applyingTemplate={applyingTemplate}
        showTemplatePreview={showTemplatePreview}
        onTemplatePreviewChange={setShowTemplatePreview}
        onApplyTemplate={applyTemplate}
        onDeleteTemplate={deleteTemplate}
        getTemplateDifferences={getTemplateDifferencesLocal}
        flags={flags}
      />

      {/* All Dialogs */}
      <FeatureFlagDialogs
        showSaveTemplateDialog={showSaveTemplateDialog}
        onSaveTemplateDialogChange={setShowSaveTemplateDialog}
        newTemplateName={newTemplateName}
        onNewTemplateNameChange={setNewTemplateName}
        newTemplateDescription={newTemplateDescription}
        onNewTemplateDescriptionChange={setNewTemplateDescription}
        newTemplateIsPublic={newTemplateIsPublic}
        onNewTemplateIsPublicChange={setNewTemplateIsPublic}
        savingTemplate={savingTemplate}
        onSaveTemplate={saveCurrentAsTemplate}
        showTemplatePreview={showTemplatePreview}
        onTemplatePreviewChange={setShowTemplatePreview}
        templates={templates}
        getTemplateDifferences={getTemplateDifferencesLocal}
        applyingTemplate={applyingTemplate}
        onApplyTemplate={applyTemplate}
        showCancelDraftDialog={showCancelDraftDialog}
        onCancelDraftDialogChange={setShowCancelDraftDialog}
        pendingChangesCount={getPendingChangesCount()}
        onConfirmCancelDraft={confirmCancelDraftMode}
        showDeleteTemplateDialog={showDeleteTemplateDialog}
        onDeleteTemplateDialogChange={setShowDeleteTemplateDialog}
        templateToDelete={templateToDelete}
        onConfirmDeleteTemplate={confirmDeleteTemplate}
      />
    </div>
  );
}
