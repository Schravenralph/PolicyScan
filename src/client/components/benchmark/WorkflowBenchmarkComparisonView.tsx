import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Play, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';
import { useWorkflows } from '../../context/WorkflowContext';
import { WorkflowLogs } from '../WorkflowLogs';
import { api } from '../../services/api';
import { 
  useStartWorkflowBenchmarkComparison, 
  useWorkflowBenchmarkComparison,
  type WorkflowBenchmarkComparison 
} from '../../hooks/useWorkflowBenchmarkComparison';
import { t } from '../../utils/i18n';

// Benchmark config names (from settings-benchmark.ts)
const getBenchmarkConfigs = () => [
  { name: 'baseline', description: t('benchmark.config.baseline') },
  { name: 'hybrid-only', description: t('benchmark.config.hybridOnly') },
  { name: 'embeddings-only', description: t('benchmark.config.embeddingsOnly') },
  { name: 'full-hybrid', description: t('benchmark.config.fullHybrid') },
  { name: 'keyword-weighted', description: t('benchmark.config.keywordWeighted') },
  { name: 'semantic-weighted', description: t('benchmark.config.semanticWeighted') },
  { name: 'with-ocr', description: t('benchmark.config.withOcr') },
  { name: 'with-learning', description: t('benchmark.config.withLearning') },
  { name: 'with-ai-crawling', description: t('benchmark.config.withAiCrawling') },
  { name: 'all-features', description: t('benchmark.config.allFeatures') },
];

// WorkflowBenchmarkComparison type is now imported from hooks

export function WorkflowBenchmarkComparisonView() {
  const { workflows } = useWorkflows();
  const [workflowAId, setWorkflowAId] = useState<string>('');
  const [workflowBId, setWorkflowBId] = useState<string>('');
  const [configAName, setConfigAName] = useState<string>('');
  const [configBName, setConfigBName] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [timeout, setTimeout] = useState<number | undefined>(undefined);
  
  const [comparisonId, setComparisonId] = useState<string | null>(null);

  // Restore active comparison from localStorage on mount
  useEffect(() => {
    const storedComparisonId = localStorage.getItem('workflow-benchmark-comparison-active-id');
    if (storedComparisonId && !comparisonId) {
      // Verify the comparison is still active before restoring
      api.get<WorkflowBenchmarkComparison>(`/benchmark/workflow-comparison/${storedComparisonId}`)
        .then((status) => {
          // Only restore if comparison is still running or pending
          if (status.status === 'running' || status.status === 'pending') {
            setComparisonId(storedComparisonId);
          } else {
            // Comparison completed/failed/cancelled, remove from localStorage
            localStorage.removeItem('workflow-benchmark-comparison-active-id');
          }
        })
        .catch(() => {
          // Comparison not found or error, remove from localStorage
          localStorage.removeItem('workflow-benchmark-comparison-active-id');
        });
    }
  }, []); // Only run on mount

  // Save active comparison ID to localStorage when it changes
  useEffect(() => {
    if (comparisonId) {
      localStorage.setItem('workflow-benchmark-comparison-active-id', comparisonId);
    } else {
      localStorage.removeItem('workflow-benchmark-comparison-active-id');
    }
  }, [comparisonId]);

  // Use React Query hooks for comparison operations
  const startComparison = useStartWorkflowBenchmarkComparison();
  const { data: comparison = null, isLoading: _isLoadingComparison, error: comparisonError, refetch: refetchComparison } = useWorkflowBenchmarkComparison(
    comparisonId,
    {
      enabled: !!comparisonId, // Only poll when comparisonId is set
    }
  );

  // Show toast notifications when status changes
  useEffect(() => {
    if (comparison?.status === 'completed') {
      toast.success(t('workflowComparison.comparisonComplete'), t('workflowComparison.comparisonCompleteMessage'));
      // Clear from localStorage when comparison completes
      localStorage.removeItem('workflow-benchmark-comparison-active-id');
    } else if (comparison?.status === 'failed') {
      toast.error(t('workflowComparison.comparisonFailed'), comparison.error || t('workflowComparison.comparisonFailedMessage'));
      // Clear from localStorage when comparison fails
      localStorage.removeItem('workflow-benchmark-comparison-active-id');
      // Clear from localStorage when comparison fails
      localStorage.removeItem('activeWorkflowBenchmarkComparisonId');
    }
  }, [comparison?.status, comparison?.error]);

  // Start comparison
  const handleStartComparison = useCallback(async () => {
    if (!workflowAId || !workflowBId || !configAName || !configBName || !query.trim()) {
      toast.error(t('workflowComparison.validationError'), t('workflowComparison.validationErrorMessage'));
      return;
    }

    try {
      const response = await startComparison.mutateAsync({
        workflowAId,
        workflowBId,
        configAName,
        configBName,
        query,
        name: name.trim() || undefined,
        timeout,
      });

      setComparisonId(response.comparisonId);
      // Note: localStorage persistence is handled by useEffect that watches comparisonId
      toast.success(t('workflowComparison.comparisonStarted'), t('workflowComparison.comparisonCompleteMessage'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('workflowComparison.failedToStartComparison');
      logError(err instanceof Error ? err : new Error(errorMessage), 'start-workflow-benchmark-comparison');
      toast.error(t('common.error'), errorMessage);
    }
  }, [workflowAId, workflowBId, configAName, configBName, query, name, timeout, startComparison]);

  const loading = startComparison.isPending;
  const error = startComparison.error ? (startComparison.error instanceof Error ? startComparison.error.message : t('workflowComparison.failedToStartComparison')) : null;

  // Get workflow names
  const workflowAName = workflows.find(w => w.id === workflowAId)?.name || workflowAId;
  const workflowBName = workflows.find(w => w.id === workflowBId)?.name || workflowBId;

  // Get config descriptions (reserved for future use)
  // const configADescription = BENCHMARK_CONFIGS.find(c => c.name === configAName)?.description || '';
  // const configBDescription = BENCHMARK_CONFIGS.find(c => c.name === configBName)?.description || '';

  const isValid = workflowAId && workflowBId && configAName && configBName && query.trim();
  const isRunning = comparison?.status === 'running' || comparison?.status === 'pending';
  const isCompleted = comparison?.status === 'completed';
  const isFailed = comparison?.status === 'failed';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('workflowComparison.workflowBenchmarkComparison')}</CardTitle>
          <CardDescription>
            Compare two workflows with different benchmark configurations to see performance differences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Form */}
          <div className="space-y-4">
            {/* Workflow Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-a">{t('workflowComparison.workflowA')}</Label>
                <Select value={workflowAId} onValueChange={setWorkflowAId}>
                  <SelectTrigger id="workflow-a">
                    <SelectValue placeholder={t('workflowComparison.selectWorkflowA')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workflow-b">{t('workflowComparison.workflowB')}</Label>
                <Select value={workflowBId} onValueChange={setWorkflowBId}>
                  <SelectTrigger id="workflow-b">
                    <SelectValue placeholder={t('workflowComparison.selectWorkflowB')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Config Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="config-a">{t('workflowComparison.configA')}</Label>
                <Select value={configAName} onValueChange={setConfigAName}>
                  <SelectTrigger id="config-a">
                    <SelectValue placeholder={t('workflowComparison.selectConfigA')} />
                  </SelectTrigger>
                  <SelectContent>
                    {getBenchmarkConfigs().map((config) => (
                      <SelectItem key={config.name} value={config.name}>
                        <div className="flex flex-col">
                          <span className="font-medium">{config.name}</span>
                          <span className="text-xs text-muted-foreground">{config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="config-b">{t('workflowComparison.configB')}</Label>
                <Select value={configBName} onValueChange={setConfigBName}>
                  <SelectTrigger id="config-b">
                    <SelectValue placeholder={t('workflowComparison.selectConfigB')} />
                  </SelectTrigger>
                  <SelectContent>
                    {getBenchmarkConfigs().map((config) => (
                      <SelectItem key={config.name} value={config.name}>
                        <div className="flex flex-col">
                          <span className="font-medium">{config.name}</span>
                          <span className="text-xs text-muted-foreground">{config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Query */}
            <div className="space-y-2">
              <Label htmlFor="query">{t('workflowComparison.query')} *</Label>
              <Textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('workflowComparison.enterSearchQuery')}
                rows={3}
              />
            </div>

            {/* Optional Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('workflowComparison.nameOptional')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('workflowComparison.comparisonName')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">{t('workflowComparison.timeoutOptional')}</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={timeout || ''}
                  onChange={(e) => setTimeout(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={t('workflowComparison.defaultTimeout')}
                  min={60}
                  max={7200}
                />
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-800 dark:text-red-300">{error}</AlertDescription>
              </Alert>
            )}

            {/* Start Button */}
            <Button
              onClick={handleStartComparison}
              disabled={!isValid || loading || isRunning}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('workflowComparison.starting')}
                </>
              ) : isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('workflowComparison.running')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Comparison
                </>
              )}
            </Button>
          </div>

          {/* Two-Pane Workflow Execution View */}
          {comparison && (comparison.workflowARunId || comparison.workflowBRunId || comparison.status === 'failed') && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{t('workflowComparison.comparisonProgress')}</CardTitle>
                      <CardDescription>
                        {comparison.startedAt && (
                          <span>Started: {new Date(comparison.startedAt).toLocaleString()}</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {comparisonError && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchComparison()}
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      <Badge variant={
                        comparison.status === 'running' ? 'default' : 
                        comparison.status === 'completed' ? 'default' : 
                        comparison.status === 'failed' ? 'destructive' : 
                        'secondary'
                      }>
                        {comparison.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                {comparisonError && (
                  <CardContent>
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <p className="text-sm text-destructive flex-1">
                        {comparisonError instanceof Error ? comparisonError.message : t('workflowComparison.failedToFetchStatus')}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchComparison()}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry Connection
                      </Button>
                    </div>
                  </CardContent>
                )}
                {comparison.status === 'failed' && comparison.error && (
                  <CardContent>
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive mb-1">{t('workflowComparison.comparisonFailed')}</p>
                        <p className="text-sm text-destructive/80">{comparison.error}</p>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
              
              {/* Two-Pane Layout for Workflow Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                {/* Workflow A Pane */}
                <div className="flex flex-col bg-card rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{workflowAName}</h3>
                      <Badge variant="outline">{configAName}</Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <WorkflowLogs 
                      runId={comparison.workflowARunId || null} 
                      className="h-full"
                    />
                  </div>
                </div>

                {/* Workflow B Pane */}
                <div className="flex flex-col bg-card rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{workflowBName}</h3>
                      <Badge variant="outline">{configBName}</Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <WorkflowLogs 
                      runId={comparison.workflowBRunId || null} 
                      className="h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {isCompleted && comparison?.results && (
            <Card>
              <CardHeader>
                <CardTitle>{t('workflowComparison.comparisonResults')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Metrics Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('workflowComparison.workflowA')}</CardTitle>
                      <CardDescription>{workflowAName} - {configAName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">{t('workflowComparison.executionTime')}:</span>
                        <span className="text-sm font-medium">{(comparison.results.workflowA.executionTimeMs / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">{t('workflowComparison.documentsFound')}:</span>
                        <span className="text-sm font-medium">{comparison.results.workflowA.documentsFound}</span>
                      </div>
                      {comparison.results.workflowA.metrics.averageScore !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-sm">{t('workflowComparison.averageScore')}:</span>
                          <span className="text-sm font-medium">{comparison.results.workflowA.metrics.averageScore.toFixed(2)}</span>
                        </div>
                      )}
                      {comparison.results.workflowA.metrics.topScore !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-sm">{t('workflowComparison.topScore')}:</span>
                          <span className="text-sm font-medium">{comparison.results.workflowA.metrics.topScore.toFixed(2)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('workflowComparison.workflowB')}</CardTitle>
                      <CardDescription>{workflowBName} - {configBName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">{t('workflowComparison.executionTime')}:</span>
                        <span className="text-sm font-medium">{(comparison.results.workflowB.executionTimeMs / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">{t('workflowComparison.documentsFound')}:</span>
                        <span className="text-sm font-medium">{comparison.results.workflowB.documentsFound}</span>
                      </div>
                      {comparison.results.workflowB.metrics.averageScore !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-sm">{t('workflowComparison.averageScore')}:</span>
                          <span className="text-sm font-medium">{comparison.results.workflowB.metrics.averageScore.toFixed(2)}</span>
                        </div>
                      )}
                      {comparison.results.workflowB.metrics.topScore !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-sm">{t('workflowComparison.topScore')}:</span>
                          <span className="text-sm font-medium">{comparison.results.workflowB.metrics.topScore.toFixed(2)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Comparison Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('workflowComparison.differences')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">{t('workflowComparison.executionTimeDifference')}:</span>
                      <span className={`text-sm font-medium ${comparison.results.comparison.executionTimeDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {comparison.results.comparison.executionTimeDiff > 0 ? '+' : ''}
                        {(comparison.results.comparison.executionTimeDiff / 1000).toFixed(2)}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('workflowComparison.documentsFoundDifference')}:</span>
                      <span className={`text-sm font-medium ${comparison.results.comparison.documentsFoundDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {comparison.results.comparison.documentsFoundDiff > 0 ? '+' : ''}
                        {comparison.results.comparison.documentsFoundDiff}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('workflowComparison.commonDocuments')}:</span>
                      <span className="text-sm font-medium">{comparison.results.comparison.commonDocuments}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('workflowComparison.uniqueToA')}:</span>
                      <span className="text-sm font-medium">{comparison.results.comparison.uniqueToA}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">{t('workflowComparison.uniqueToB')}:</span>
                      <span className="text-sm font-medium">{comparison.results.comparison.uniqueToB}</span>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          )}

          {/* Failed State */}
          {isFailed && comparison && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-red-800 dark:text-red-300">
                {t('workflowComparison.comparisonFailed')} {comparison.error || t('workflowComparison.unknownError')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

