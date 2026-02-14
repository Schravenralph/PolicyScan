import { memo, useMemo } from 'react';
import { Check, Edit2, Download, Copy, Trash2, Loader2, Workflow as WorkflowIcon, Flag } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
import { t } from '../../utils/i18n';

interface ConfigurationCardProps {
  config: WorkflowConfiguration;
  availableWorkflows: WorkflowDocument[];
  onActivate: (configId: string) => Promise<void>;
  onEdit: (config: WorkflowConfiguration) => void;
  onDelete: (config: WorkflowConfiguration) => void;
  onDuplicate: (config: WorkflowConfiguration) => Promise<void>;
  onExport: (config: WorkflowConfiguration) => Promise<void>;
  activatingId: string | null;
}

// Count enabled flags
function countEnabledFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

function ConfigurationCardComponent({
  config,
  availableWorkflows,
  onActivate,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  activatingId,
}: ConfigurationCardProps) {
  // Create a Map for O(1) lookup instead of O(n) find() for workflow name
  // This optimization is especially important when many configurations are displayed
  const workflowMap = useMemo(() => {
    const map = new Map<string, string>();
    availableWorkflows.forEach(workflow => {
      map.set(workflow.id, workflow.name || workflow.id);
    });
    return map;
  }, [availableWorkflows]);

  // Memoize workflow name lookup
  const workflowName = useMemo(() => {
    return workflowMap.get(config.workflowId) || config.workflowId;
  }, [workflowMap, config.workflowId]);

  // Memoize enabled flags count
  const enabledFlagsCount = useMemo(() => {
    return countEnabledFlags(config.featureFlags || {});
  }, [config.featureFlags]);

  return (
    <Card
      role="listitem"
      aria-labelledby={`config-title-${config._id}`}
      className={`transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${config.isActive ? 'border-primary' : 'hover:border-muted-foreground/50'
        }`}
      tabIndex={0}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle
                id={`config-title-${config._id}`}
                className="text-base truncate"
              >
                {config.name}
              </CardTitle>
              {config.isActive && (
                <Badge
                  variant="default"
                  className="shrink-0"
                  aria-label={t('configurationCard.activeConfiguration')}
                >
                  Actief
                </Badge>
              )}
            </div>
            {config.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {config.description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Workflow */}
        <div className="flex items-center gap-2 text-sm">
          <WorkflowIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">Workflow:</span>
          <span className="font-medium truncate" aria-label={`Workflow: ${workflowName}`}>
            {workflowName}
          </span>
        </div>

        {/* Feature Flags Count */}
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">Feature flags:</span>
          <Badge
            variant="outline"
            className="font-mono text-xs"
            aria-label={`${enabledFlagsCount} van ${Object.keys(config.featureFlags || {}).length} feature flags aangepast`}
          >
            {enabledFlagsCount} / {Object.keys(config.featureFlags || {}).length}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {!config.isActive && (
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => onActivate(config._id!)}
              disabled={activatingId === config._id}
              aria-label={`Activeer configuratie ${config.name}`}
            >
              {activatingId === config._id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Activeren
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(config)}
                aria-label={`Bewerk configuratie ${config.name}`}
              >
                <Edit2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('configurationCard.editConfiguration')}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport(config)}
                aria-label={`Exporteer configuratie ${config.name}`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('configurationCard.exportAsJson')}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDuplicate(config)}
                aria-label={`Dupliceer configuratie ${config.name}`}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('configurationCard.duplicateConfiguration')}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(config)}
                  disabled={config.isActive}
                  aria-label={config.isActive ? `Kan actieve configuratie ${config.name} niet verwijderen` : `Verwijder configuratie ${config.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{config.isActive ? t('configurationCard.deleteConfigurationDisabled') : t('configurationCard.deleteConfiguration')}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}

// Memoize ConfigurationCard to prevent unnecessary re-renders
// Only re-render when props actually change
export const ConfigurationCard = memo(ConfigurationCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.config._id === nextProps.config._id &&
    prevProps.config.isActive === nextProps.config.isActive &&
    prevProps.config.name === nextProps.config.name &&
    prevProps.config.description === nextProps.config.description &&
    prevProps.config.workflowId === nextProps.config.workflowId &&
    prevProps.activatingId === nextProps.activatingId &&
    prevProps.availableWorkflows.length === nextProps.availableWorkflows.length &&
    prevProps.onActivate === nextProps.onActivate &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onDuplicate === nextProps.onDuplicate &&
    prevProps.onExport === nextProps.onExport &&
    // Deep compare availableWorkflows array (by id for simplicity)
    (prevProps.availableWorkflows === nextProps.availableWorkflows ||
      (prevProps.availableWorkflows.length === nextProps.availableWorkflows.length &&
        prevProps.availableWorkflows.every((w, i) => w.id === nextProps.availableWorkflows[i]?.id)))
  );
});
