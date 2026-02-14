import { useState, useEffect, memo } from 'react';
import { Check, Loader2, Flag, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { WorkflowConfiguration, ConfigurableFeatureFlag } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';
import { t } from '../../utils/i18n';
import { formatFeatureFlagState } from '../../utils/featureFlagFormatters.js';

interface FeatureFlagCategory {
  name: string;
  flags: ConfigurableFeatureFlag[];
}

interface ConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  config?: WorkflowConfiguration | null;
  availableWorkflows: WorkflowDocument[];
  flagCategories: FeatureFlagCategory[];
  onSubmit: (data: {
    name: string;
    description?: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
    isActive: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

function ConfigurationDialogComponent({
  open,
  onOpenChange,
  mode,
  config,
  availableWorkflows,
  flagCategories,
  onSubmit,
  isSaving,
}: ConfigurationDialogProps) {
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formWorkflowId, setFormWorkflowId] = useState('beleidsscan-wizard');
  const [formFeatureFlags, setFormFeatureFlags] = useState<Record<string, boolean>>({});
  const [formIsActive, setFormIsActive] = useState(false);

  // Initialize form when dialog opens or config changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && config) {
        setFormName(config.name);
        setFormDescription(config.description || '');
        setFormWorkflowId(config.workflowId);
        setFormFeatureFlags({ ...config.featureFlags });
        setFormIsActive(config.isActive);
      } else {
        // Reset for create mode
        setFormName('');
        setFormDescription('');
        setFormWorkflowId('beleidsscan-wizard');
        setFormFeatureFlags({});
        setFormIsActive(false);
      }
    }
  }, [open, mode, config]);

  // All workflows are compatible
  const compatibleWorkflows = availableWorkflows;

  // Toggle feature flag in form
  const toggleFlag = (flagName: string) => {
    setFormFeatureFlags(prev => ({
      ...prev,
      [flagName]: !prev[flagName],
    }));
  };

  // Count enabled flags
  const countEnabledFlags = (flags: Record<string, boolean>): number => {
    return Object.values(flags).filter(Boolean).length;
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;

    await onSubmit({
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      workflowId: formWorkflowId,
      featureFlags: formFeatureFlags,
      isActive: formIsActive,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col ">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('configurationDialog.createTitle') : t('configurationDialog.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('configurationDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="config-name">{t('configurationDialog.nameLabel')} *</Label>
            <Input
              id="config-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t('configurationDialog.namePlaceholder')}
              aria-required="true"
              aria-describedby={!formName.trim() ? "config-name-error" : undefined}
            />
            {!formName.trim() && (
              <span id="config-name-error" className="sr-only">
                {t('configurationDialog.nameRequired')}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="config-description">{t('configurationDialog.descriptionLabel')}</Label>
            <Textarea
              id="config-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder={t('configurationDialog.descriptionPlaceholder')}
              rows={2}
            />
          </div>

          {/* Workflow Selection */}
          <div className="space-y-2">
            <Label htmlFor="config-workflow">{t('configurationDialog.workflowLabel')}</Label>
            <Select value={formWorkflowId} onValueChange={setFormWorkflowId}>
              <SelectTrigger id="config-workflow" aria-label={t('configurationDialog.selectWorkflow')}>
                <SelectValue placeholder={t('configurationDialog.selectWorkflowPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {compatibleWorkflows.map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{workflow.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {workflow.description || ''}
                        </span>
                      </div>
                      {workflow.description && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="shrink-0 p-1 hover:bg-muted rounded"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t('configurationDialog.workflowInfoAria').replace('{{name}}', workflow.name)}
                              >
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm" side="right">
                              <div className="space-y-2">
                                {workflow.description && (
                                  <p className="text-sm">{workflow.description}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Set Active */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="config-is-active">Direct activeren</Label>
              <p className="text-sm text-muted-foreground" id="config-is-active-description">
                Maak deze configuratie direct actief na opslaan
              </p>
            </div>
            <Switch 
              id="config-is-active"
              checked={formIsActive} 
              onCheckedChange={setFormIsActive}
              aria-label={formIsActive ? t('configurationDialog.directActivateEnabled') : t('configurationDialog.directActivateDisabled')}
              aria-describedby="config-is-active-description"
            />
          </div>

          {/* Feature Flags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Feature Flag Aanpassingen</Label>
              <Badge variant="outline">
                {countEnabledFlags(formFeatureFlags)} aangepast
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Selecteer welke feature flags je wilt aanpassen voor deze configuratie.
              {t('configuration.onlyCheckedFlagsOverwritten')}
            </p>

            {flagCategories.length > 0 ? (
              <Accordion type="multiple" className="border rounded-lg">
                {flagCategories.map((category) => (
                  <AccordionItem key={category.name} value={category.name}>
                    <AccordionTrigger className="px-4 text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4" />
                        {category.name}
                        <Badge variant="secondary" className="ml-2 font-mono text-xs">
                          {category.flags.filter(f => formFeatureFlags[f.name] !== undefined).length} / {category.flags.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {category.flags.map((flag) => (
                          <div
                            key={flag.name}
                            className="flex items-center justify-between p-2 rounded border bg-muted/30"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-semibold truncate">
                                {getFeatureFlagDisplayName(flag.name)}
                              </span>
                              <Badge
                                variant={flag.currentValue ? 'default' : 'secondary'}
                                className="text-xs shrink-0"
                              >
                                Default: {flag.currentValue ? 'ON' : 'OFF'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {formFeatureFlags[flag.name] !== undefined && (
                                <Badge
                                  variant={formFeatureFlags[flag.name] ? 'default' : 'destructive'}
                                  className="text-xs"
                                >
                                  {formFeatureFlags[flag.name] ? 'ON' : 'OFF'}
                                </Badge>
                              )}
                              <Switch
                                checked={formFeatureFlags[flag.name] ?? false}
                                onCheckedChange={() => toggleFlag(flag.name)}
                                aria-label={`${getFeatureFlagDisplayName(flag.name)} ${formatFeatureFlagState(formFeatureFlags[flag.name] ?? false)}`}
                                aria-describedby={`flag-${flag.name}-description`}
                              />
                              <span id={`flag-${flag.name}-description`} className="sr-only">
                                {getFeatureFlagDisplayName(flag.name)} feature flag, standaard {formatFeatureFlagState(flag.currentValue)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="flex items-center justify-center py-8 border rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Feature flags laden...
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !formName.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Opslaan...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {mode === 'create' ? 'Aanmaken' : 'Opslaan'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Memoize ConfigurationDialog to prevent unnecessary re-renders
// Only re-render when props actually change
export const ConfigurationDialog = memo(ConfigurationDialogComponent, (prevProps, nextProps) => {
  return (
    prevProps.open === nextProps.open &&
    prevProps.onOpenChange === nextProps.onOpenChange &&
    prevProps.mode === nextProps.mode &&
    prevProps.config?._id === nextProps.config?._id &&
    prevProps.availableWorkflows.length === nextProps.availableWorkflows.length &&
    prevProps.flagCategories.length === nextProps.flagCategories.length &&
    prevProps.onSubmit === nextProps.onSubmit &&
    prevProps.isSaving === nextProps.isSaving
  );
});
