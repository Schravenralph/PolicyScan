import { Workflow as WorkflowIcon, Copy, Check, Loader2, Settings, FileText, Network, Zap, Scale } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { WorkflowConfigurationTemplate } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: WorkflowConfigurationTemplate | null;
  availableWorkflows: WorkflowDocument[];
  onUseTemplate: (template: WorkflowConfigurationTemplate, activate: boolean) => Promise<void>;
  isSaving: boolean;
}

// Get icon component by name
function getIconComponent(iconName?: string) {
  switch (iconName) {
    case 'FileText':
      return FileText;
    case 'Network':
      return Network;
    case 'Zap':
      return Zap;
    case 'Scale':
      return Scale;
    default:
      return Settings;
  }
}

// Get workflow name by ID
function getWorkflowName(workflowId: string, availableWorkflows: WorkflowDocument[]): string {
  const workflow = availableWorkflows.find(w => w.id === workflowId);
  return workflow?.name || workflowId;
}

// Count enabled flags
function countEnabledFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  availableWorkflows,
  onUseTemplate,
  isSaving,
}: TemplatePreviewDialogProps) {
  if (!template) return null;

  const IconComponent = getIconComponent(template.icon);

  const handleCreateCopy = async () => {
    await onUseTemplate(template, false);
  };

  const handleActivate = async () => {
    await onUseTemplate(template, true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col ">
        <DialogHeader>
          <DialogTitle>Template Preview: {template.name}</DialogTitle>
          <DialogDescription>
            Bekijk de instellingen van deze template voordat je deze gebruikt
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Template Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </div>
            </div>
            <p className="text-sm">{template.useCase}</p>
          </div>

          {/* Workflow */}
          <div className="space-y-2">
            <Label>Workflow</Label>
            <div className="flex items-center gap-2 text-sm">
              <WorkflowIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{getWorkflowName(template.workflowId, availableWorkflows)}</span>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="space-y-2">
            <Label>Feature Flags ({countEnabledFlags(template.featureFlags)} enabled)</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
              {Object.keys(template.featureFlags).length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen feature flags geconfigureerd</p>
              ) : (
                Object.entries(template.featureFlags).map(([flagName, enabled]) => (
                  <div key={flagName} className="flex items-center justify-between text-sm">
                    <span className="text-xs font-semibold">{getFeatureFlagDisplayName(flagName)}</span>
                    <Badge variant={enabled ? 'default' : 'outline'}>
                      {enabled ? 'Aan' : 'Uit'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annuleren
          </Button>
          <Button
            variant="outline"
            onClick={handleCreateCopy}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Aanmaken...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Kopie Aanmaken
              </>
            )}
          </Button>
          <Button
            onClick={handleActivate}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Activeren...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Activeren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

