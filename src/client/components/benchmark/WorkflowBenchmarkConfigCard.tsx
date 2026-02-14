/**
 * Workflow Benchmark Config Card Component
 * 
 * Displays and manages benchmark configuration for a single workflow.
 */

import { Settings, Edit2, Save, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { WorkflowSelector } from './WorkflowSelector';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';
import { t } from '../../utils/i18n';

type WorkflowBenchmarkConfig = {
  featureFlags?: Record<string, boolean>;
  params?: Record<string, unknown>;
  timeout?: number;
  maxRetries?: number;
  maxMemoryMB?: number;
  maxConcurrentRequests?: number;
} | null;

interface WorkflowBenchmarkConfigCardProps {
  workflowId: string;
  onWorkflowChange: (workflowId: string) => void;
  config: WorkflowBenchmarkConfig;
  configSource: 'default' | 'custom' | null;
  loading: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  label: string;
}

export function WorkflowBenchmarkConfigCard({
  workflowId,
  onWorkflowChange,
  config,
  configSource,
  loading,
  saving,
  onEdit,
  onSave,
  label,
}: WorkflowBenchmarkConfigCardProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Workflow {label}</Label>
        <WorkflowSelector
          selectedWorkflows={workflowId ? [workflowId] : []}
          onSelectionChange={(ids) => onWorkflowChange(ids[0] || '')}
          maxSelection={1}
          minSelection={0}
          label=""
          description=""
        />
      </div>
      {workflowId && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {t('benchmark.benchmarkConfiguration')}
                {configSource && (
                  <Badge 
                    variant={configSource === 'custom' ? 'default' : 'secondary'} 
                    className="text-xs"
                    title={configSource === 'custom' ? t('benchmark.usingCustomConfig') : t('benchmark.usingDefaultConfig')}
                  >
                    {configSource === 'custom' ? t('benchmark.custom') : t('benchmark.default')}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onEdit}
                  disabled={loading}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSave}
                  disabled={saving || loading || !config}
                >
                  {saving ? (
                    <AlertCircle className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <p className="text-xs text-muted-foreground">{t('benchmark.loadingConfiguration')}</p>
            ) : config ? (
              <div className="space-y-2 text-xs">
                {config.featureFlags && Object.keys(config.featureFlags).length > 0 ? (
                  <div>
                    <p className="font-medium mb-1">Feature Flags:</p>
                    <div className="space-y-1">
                      {Object.entries(config.featureFlags).map(([flag, value]) => (
                        <div key={flag} className="flex items-center gap-2">
                          <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                            {value ? 'ON' : 'OFF'}
                          </Badge>
                          <span className="text-xs">{getFeatureFlagDisplayName(flag)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('benchmark.noConfigurationSet')}</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
