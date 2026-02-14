/**
 * Workflow Comparison Panes Component
 * 
 * Two-pane layout for displaying workflow execution logs side-by-side
 * with synchronized scrolling support.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Progress } from '../ui/progress';
import { Skeleton } from '../ui/skeleton';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { UnifiedWorkflowLogs } from './UnifiedWorkflowLogs';
import { t, translateStatus } from '../../utils/i18n';

interface ComparisonStatus {
  _id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  name?: string;
  description?: string;
  workflowA?: { workflowId: string; label?: string };
  workflowB?: { workflowId: string; label?: string };
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  currentRunIds?: {
    workflowA?: string;
    workflowB?: string;
  };
  results?: {
    workflowA?: { runId?: string; error?: string; [key: string]: unknown };
    workflowB?: { runId?: string; error?: string; [key: string]: unknown };
  };
  [key: string]: unknown;
}

interface WorkflowDocument {
  id: string;
  name: string;
}

interface WorkflowComparisonPanesProps {
  activeComparison: ComparisonStatus;
  workflowDocuments: WorkflowDocument[];
  synchronizedScrolling: boolean;
  onSynchronizedScrollingChange: (enabled: boolean) => void;
  pollingError: string | null;
  onRetryPolling: () => void;
}

export function WorkflowComparisonPanes({
  activeComparison,
  workflowDocuments,
  synchronizedScrolling,
  onSynchronizedScrollingChange,
  pollingError,
  onRetryPolling,
}: WorkflowComparisonPanesProps) {
  const workflowAId = activeComparison.currentRunIds?.workflowA || activeComparison.results?.workflowA?.runId;
  const workflowBId = activeComparison.currentRunIds?.workflowB || activeComparison.results?.workflowB?.runId;
  const isRunning = activeComparison.status === 'running' || activeComparison.status === 'pending';

  const workflowAName = 
    activeComparison.workflowA?.label || 
    workflowDocuments.find(w => w.id === activeComparison.workflowA?.workflowId)?.name || 
    activeComparison.workflowA?.workflowId || 
    t('workflowComparison.workflowA');

  const workflowBName = 
    activeComparison.workflowB?.label || 
    workflowDocuments.find(w => w.id === activeComparison.workflowB?.workflowId)?.name || 
    activeComparison.workflowB?.workflowId || 
    t('workflowComparison.workflowB');

  return (
    <div className="space-y-4" data-testid="workflow-comparison-view">
      <Card data-testid="comparison-progress-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle data-testid="comparison-title">{t('workflowComparison.comparisonProgress')}</CardTitle>
              <CardDescription data-testid="comparison-description">
                {activeComparison.name && <span>{activeComparison.name} - </span>}
                {activeComparison.startedAt && (
                  <span>{t('workflowComparison.started')}: {new Date(activeComparison.startedAt).toLocaleString()}</span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {pollingError && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="retry-polling-button"
                  onClick={onRetryPolling}
                  className="text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {t('common.retry')}
                </Button>
              )}
              <Badge 
                variant={
                  activeComparison.status === 'running' ? 'default' : 
                  activeComparison.status === 'completed' ? 'default' : 
                  activeComparison.status === 'failed' ? 'destructive' : 
                  'secondary'
                }
                data-testid={`comparison-status-badge-${activeComparison._id}`}
              >
                {translateStatus(activeComparison.status)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        {pollingError && (
          <CardContent>
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md" data-testid="polling-error-message">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive flex-1">{pollingError}</p>
              <Button
                variant="outline"
                size="sm"
                data-testid="retry-connection-button"
                onClick={onRetryPolling}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry Connection
              </Button>
            </div>
          </CardContent>
        )}
        {activeComparison.status === 'failed' && activeComparison.error && (
          <CardContent>
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md" data-testid="comparison-error-message">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive mb-1">{t('workflowComparison.comparisonFailed')}</p>
                <p className="text-sm text-destructive/80">{activeComparison.error}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
      
      {/* Two-Pane Layout for Workflow Logs */}
      {((workflowAId || workflowBId) || isRunning || activeComparison.status === 'failed') && (
        <div className="space-y-2">
          {/* Synchronized Scrolling Toggle */}
          <div className="flex items-center justify-end gap-2">
            <Label htmlFor="sync-scroll" className="text-sm text-muted-foreground cursor-pointer">
              {t('workflowComparison.synchronizedScrolling')}
            </Label>
            <Switch
              id="sync-scroll"
              checked={synchronizedScrolling}
              onCheckedChange={onSynchronizedScrollingChange}
              data-testid="synchronized-scrolling-toggle"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]" data-testid="two-pane-layout">
            {/* Workflow A Pane */}
            <div className="flex flex-col bg-card rounded-lg border p-4" data-testid="workflow-a-pane">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {workflowAName}
                  </h3>
                  {activeComparison.workflowA?.label && (
                    <Badge variant="outline">{activeComparison.workflowA.label}</Badge>
                  )}
                  {activeComparison.results?.workflowA?.error && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {t('workflowComparison.failed')}
                    </Badge>
                  )}
                </div>
              </div>
              {/* Progress Indicator for Workflow A */}
              {isRunning && (
                <div className="mb-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('workflowComparison.progress')}</span>
                    <span>{workflowAId ? t('workflowComparison.running') : t('workflowComparison.waitingForRunId')}</span>
                  </div>
                  <Progress 
                    value={workflowAId ? 50 : 10} 
                    className="h-1"
                    data-testid="workflow-a-progress"
                  />
                </div>
              )}
              {activeComparison.results?.workflowA?.error && (
                <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                  <p className="font-medium mb-1">{t('workflowComparison.workflowAError')}</p>
                  <p>{activeComparison.results.workflowA.error}</p>
                </div>
              )}
              <div className="flex-1 min-h-0">
                {!workflowAId && isRunning ? (
                  <div className="h-full flex flex-col gap-2 p-4" data-testid="workflow-a-loading-skeleton">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <UnifiedWorkflowLogs 
                    runId={workflowAId || null} 
                    variant="compact"
                    className="h-full"
                  />
                )}
              </div>
            </div>

            {/* Workflow B Pane */}
            <div className="flex flex-col bg-card rounded-lg border p-4" data-testid="workflow-b-pane">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {workflowBName}
                  </h3>
                  {activeComparison.workflowB?.label && (
                    <Badge variant="outline">{activeComparison.workflowB.label}</Badge>
                  )}
                  {activeComparison.results?.workflowB?.error && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {t('workflowComparison.failed')}
                    </Badge>
                  )}
                </div>
              </div>
              {/* Progress Indicator for Workflow B */}
              {isRunning && (
                <div className="mb-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('workflowComparison.progress')}</span>
                    <span>{workflowBId ? t('workflowComparison.running') : t('workflowComparison.waitingForRunId')}</span>
                  </div>
                  <Progress 
                    value={workflowBId ? 50 : 10} 
                    className="h-1"
                    data-testid="workflow-b-progress"
                  />
                </div>
              )}
              {activeComparison.results?.workflowB?.error && (
                <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                  <p className="font-medium mb-1">{t('workflowComparison.workflowBError')}</p>
                  <p>{activeComparison.results.workflowB.error}</p>
                </div>
              )}
              <div className="flex-1 min-h-0">
                {!workflowBId && isRunning ? (
                  <div className="h-full flex flex-col gap-2 p-4" data-testid="workflow-b-loading-skeleton">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <UnifiedWorkflowLogs 
                    runId={workflowBId || null} 
                    variant="compact"
                    className="h-full"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
