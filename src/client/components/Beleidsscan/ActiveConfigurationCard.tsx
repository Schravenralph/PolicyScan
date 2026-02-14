import { useMemo, memo } from 'react';
import { Sparkles, RefreshCw, Edit2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
import { t } from '../../utils/i18n';

interface ActiveConfigurationCardProps {
  activeConfiguration: WorkflowConfiguration;
  availableWorkflows: WorkflowDocument[];
  onEdit: (config: WorkflowConfiguration) => void;
  onRefresh: () => Promise<void>;
  isLoading: boolean;
}

// Count enabled flags
function countEnabledFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

function ActiveConfigurationCardComponent({
  activeConfiguration,
  availableWorkflows,
  onEdit,
  onRefresh,
  isLoading,
}: ActiveConfigurationCardProps) {
  // Create a Map for O(1) lookup instead of O(n) find() for workflow name
  const workflowMap = useMemo(() => {
    const map = new Map<string, string>();
    availableWorkflows.forEach(workflow => {
      map.set(workflow.id, workflow.name || workflow.id);
    });
    return map;
  }, [availableWorkflows]);

  // Memoize workflow name lookup
  const workflowName = useMemo(() => {
    return workflowMap.get(activeConfiguration.workflowId) || activeConfiguration.workflowId;
  }, [workflowMap, activeConfiguration.workflowId]);


  return (
    <Card 
      className="border-2 border-primary/30 bg-primary/10"
      role="region"
      aria-labelledby="active-config-title"
      aria-describedby="active-config-description"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle id="active-config-title" className="text-lg">
            Actieve Configuratie
          </CardTitle>
        </div>
        <CardDescription id="active-config-description">
          Deze configuratie wordt momenteel gebruikt in de Beleidsscan wizard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-semibold text-lg">{activeConfiguration.name}</div>
            <div className="text-sm text-muted-foreground">
              Workflow: <span className="font-medium text-foreground">{workflowName}</span>
            </div>
            {activeConfiguration.description && (
              <div className="text-sm text-muted-foreground">
                {activeConfiguration.description}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {countEnabledFlags(activeConfiguration.featureFlags || {})} flags aangepast
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label={t('activeConfigurationCard.refreshFromServerAria')}
              title={t('activeConfigurationCard.refreshFromServerTitle')}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Vernieuwen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(activeConfiguration)}
              aria-label={`Bewerk actieve configuratie ${activeConfiguration.name}`}
            >
              <Edit2 className="h-4 w-4 mr-1" aria-hidden="true" />
              Bewerken
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const ActiveConfigurationCard = memo(ActiveConfigurationCardComponent);
