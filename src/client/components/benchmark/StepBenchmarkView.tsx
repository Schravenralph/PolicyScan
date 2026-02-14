import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Play, Loader2, AlertCircle, CheckCircle2, Clock, X } from 'lucide-react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { WorkflowSelector } from './WorkflowSelector';
import type { WorkflowDocument } from '../../services/api/WorkflowApiService';
import { useWorkflows } from '../../context/WorkflowContext';

interface StepBenchmarkConfig {
  workflowId: string;
  stepId: string;
  context?: Record<string, unknown>;
  useRealContext?: boolean;
  featureFlags?: Record<string, boolean>;
  query?: string;
  runsPerStep?: number;
  name?: string;
}

interface StepBenchmarkResult {
  stepId: string;
  stepName: string;
  executionTimeMs: number;
  documentsFound?: number;
  documentsProcessed?: number;
  memoryUsageMB?: number;
  contextSize?: number;
  error?: string;
  featureFlags?: Record<string, boolean>;
  result?: Record<string, unknown>;
}

interface StepBenchmarkRun {
  _id: string;
  name: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  context?: Record<string, unknown>;
  useRealContext: boolean;
  featureFlags?: Record<string, boolean>;
  query?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  results?: StepBenchmarkResult[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Step Benchmark View Component
 * 
 * Allows users to benchmark individual workflow steps in isolation.
 * Supports mock context injection and real context from previous steps.
 * 
 * @component
 */
export function StepBenchmarkView() {
  const { workflows, getWorkflowById } = useWorkflows();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedStepId, setSelectedStepId] = useState<string>('');
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [query, setQuery] = useState<string>('');
  const [useRealContext, setUseRealContext] = useState<boolean>(false);
  const [runsPerStep, setRunsPerStep] = useState<number>(1);
  const [benchmarkName, setBenchmarkName] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [benchmarkRun, setBenchmarkRun] = useState<StepBenchmarkRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedWorkflowId) {
      // Try to find by id first, then by _id for backward compatibility
      const found = getWorkflowById(selectedWorkflowId) || 
                    workflows.find((w) => w._id === selectedWorkflowId);
      setWorkflow(found || null);
      if (!found) {
        setSelectedStepId('');
      }
    } else {
      setWorkflow(null);
      setSelectedStepId('');
    }
  }, [selectedWorkflowId, workflows, getWorkflowById]);

  useEffect(() => {
    // Poll for status if benchmark is running
    if (benchmarkRun && (benchmarkRun.status === 'pending' || benchmarkRun.status === 'running')) {
      const interval = setInterval(() => {
        pollBenchmarkStatus(benchmarkRun._id);
      }, 2000); // Poll every 2 seconds
      setPollingInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkRun?.status]);


  const handleStartBenchmark = async () => {
    if (!selectedWorkflowId) {
      toast.error('Workflow vereist', 'Selecteer een workflow.');
      return;
    }
    if (!selectedStepId) {
      toast.error('Step vereist', 'Selecteer een workflow step.');
      return;
    }

    setIsRunning(true);
    setError(null);
    setBenchmarkRun(null);

    try {
      const config: StepBenchmarkConfig = {
        workflowId: selectedWorkflowId,
        stepId: selectedStepId,
        query: query.trim() || undefined,
        useRealContext,
        runsPerStep: runsPerStep || 1,
        name: benchmarkName.trim() || undefined,
      };

      const response = await api.post<{ success: boolean; runId: string }>(
        '/benchmark/step',
        config
      );

      // Poll for initial status
      await pollBenchmarkStatus(response.runId);

      toast.success('Benchmark gestart', 'De step benchmark is succesvol gestart.');
    } catch (error) {
      logError(error, 'start-step-benchmark');
      const errorMessage = error instanceof Error ? error.message : t('benchmark.genericError');
      setError(errorMessage);
      toast.error('Benchmark mislukt', errorMessage);
    } finally {
      setIsRunning(false);
    }
  };

  const pollBenchmarkStatus = async (runId: string) => {
    try {
      const response = await api.get<StepBenchmarkRun>(`/benchmark/step/${runId}`);
      setBenchmarkRun(response);

      if (response.status === 'completed' || response.status === 'failed') {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (error) {
      logError(error, 'poll-step-benchmark-status');
    }
  };

  const handleCancelBenchmark = async () => {
    if (!benchmarkRun) return;

    try {
      await api.post(`/benchmark/step/${benchmarkRun._id}/cancel`);
      await pollBenchmarkStatus(benchmarkRun._id);
      toast.success('Benchmark geannuleerd', 'De step benchmark is geannuleerd.');
    } catch (error) {
      logError(error, 'cancel-step-benchmark');
      toast.error('Fout', 'Kan benchmark niet annuleren.');
    }
  };

  const selectedStep = workflow?.steps?.find((s) => s.id === selectedStepId);
  const canRun = selectedWorkflowId && selectedStepId && !isRunning;

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle>Step-by-Step Workflow Benchmark</CardTitle>
          <CardDescription>
            Benchmark individuele workflow steps in isolatie om performance bottlenecks te identificeren
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Selection */}
          <div className="space-y-2">
            <Label>Workflow *</Label>
            <WorkflowSelector
              selectedWorkflows={selectedWorkflowId ? [selectedWorkflowId] : []}
              onSelectionChange={(ids) => setSelectedWorkflowId(ids[0] || '')}
              maxSelection={1}
              minSelection={0}
              label="Selecteer Workflow"
              description="Selecteer een workflow om te benchmarken"
            />
          </div>

          {/* Step Selection */}
          {workflow && workflow.steps && workflow.steps.length > 0 && (
            <div className="space-y-2">
              <Label>Step *</Label>
              <Select value={selectedStepId} onValueChange={setSelectedStepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een step" />
                </SelectTrigger>
                <SelectContent>
                  {workflow.steps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      <div className="flex flex-col">
                        <span>{step.name || step.id}</span>
                        {step.action && (
                          <span className="text-xs text-muted-foreground">Action: {step.action}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStep && (
                <div className="text-sm text-muted-foreground">
                  <p>Step: {selectedStep.name || selectedStep.id}</p>
                  {selectedStep.action && <p>Action: {selectedStep.action}</p>}
                </div>
              )}
            </div>
          )}

          {/* Query Input */}
          <div className="space-y-2">
            <Label htmlFor="query">Query (optioneel)</Label>
            <Input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bijv. arbeidsmigranten huisvesting"
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">
              Query wordt gebruikt als context voor de step (indien nodig)
            </p>
          </div>

          {/* Context Configuration */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="useRealContext"
                checked={useRealContext}
                onCheckedChange={(checked) => setUseRealContext(checked === true)}
                disabled={isRunning}
              />
              <Label htmlFor="useRealContext" className="cursor-pointer">
                Gebruik echte context (voer vorige steps uit)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Als ingeschakeld, worden alle vorige steps uitgevoerd om echte context te krijgen.
              Anders wordt minimale context gebruikt.
            </p>
          </div>

          {/* Runs Per Step */}
          <div className="space-y-2">
            <Label htmlFor="runsPerStep">Aantal runs per step</Label>
            <Input
              id="runsPerStep"
              type="number"
              min="1"
              max="100"
              value={runsPerStep}
              onChange={(e) => setRunsPerStep(parseInt(e.target.value) || 1)}
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">
              Aantal keer dat de step wordt uitgevoerd voor statistische betrouwbaarheid (1-100)
            </p>
          </div>

          {/* Benchmark Name */}
          <div className="space-y-2">
            <Label htmlFor="benchmarkName">Benchmark naam (optioneel)</Label>
            <Input
              id="benchmarkName"
              value={benchmarkName}
              onChange={(e) => setBenchmarkName(e.target.value)}
              placeholder="Bijv. DSO Discovery Performance Test"
              disabled={isRunning}
            />
          </div>

          {/* Run Button */}
          <Button
            onClick={handleStartBenchmark}
            disabled={!canRun}
            className="w-full gap-2"
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starten...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Step Benchmark
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800 dark:text-red-200">Fout</p>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display */}
      {benchmarkRun && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {benchmarkRun.status === 'completed' && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  {benchmarkRun.status === 'running' && (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  )}
                  {benchmarkRun.status === 'failed' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  {benchmarkRun.status === 'pending' && (
                    <Clock className="w-5 h-5 text-yellow-600" />
                  )}
                  Benchmark Resultaten
                </CardTitle>
                <CardDescription>
                  {benchmarkRun.name} | Step: {benchmarkRun.stepName}
                </CardDescription>
              </div>
              {benchmarkRun.status === 'running' && (
                <Button variant="outline" size="sm" onClick={handleCancelBenchmark}>
                  <X className="w-4 h-4 mr-2" />
                  Annuleren
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status Badge */}
            <div>
              <Badge
                variant={
                  benchmarkRun.status === 'completed'
                    ? 'default'
                    : benchmarkRun.status === 'failed'
                      ? 'destructive'
                      : benchmarkRun.status === 'running'
                        ? 'secondary'
                        : 'outline'
                }
              >
                {benchmarkRun.status === 'completed' && 'Voltooid'}
                {benchmarkRun.status === 'running' && 'Bezig...'}
                {benchmarkRun.status === 'failed' && 'Mislukt'}
                {benchmarkRun.status === 'pending' && 'In wachtrij'}
                {benchmarkRun.status === 'cancelled' && 'Geannuleerd'}
              </Badge>
            </div>

            {/* Error Message */}
            {benchmarkRun.error && (
              <div className="p-3 border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">Fout:</p>
                <p className="text-sm text-red-700 dark:text-red-300">{benchmarkRun.error}</p>
              </div>
            )}

            {/* Results */}
            {benchmarkRun.results && benchmarkRun.results.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Resultaten ({benchmarkRun.results.length} runs)</h3>
                {benchmarkRun.results.map((result, index) => (
                  <Card key={index} className="border">
                    <CardHeader>
                      <CardTitle className="text-base">Run {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Uitvoeringstijd</p>
                          <p className="text-lg font-bold">
                            {(result.executionTimeMs / 1000).toFixed(2)}s
                          </p>
                        </div>
                        {result.documentsFound !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">{t('benchmark.documentsFound')}</p>
                            <p className="text-lg font-bold">{result.documentsFound}</p>
                          </div>
                        )}
                        {result.memoryUsageMB !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Geheugengebruik</p>
                            <p className="text-lg font-bold">{result.memoryUsageMB.toFixed(2)} MB</p>
                          </div>
                        )}
                        {result.contextSize !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Context grootte</p>
                            <p className="text-lg font-bold">
                              {(result.contextSize / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        )}
                      </div>
                      {result.error && (
                        <div className="mt-2 p-2 border border-red-300 rounded bg-red-50 dark:bg-red-900/20">
                          <p className="text-sm text-red-800 dark:text-red-200">{result.error}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Summary Statistics */}
                {benchmarkRun.results.length > 1 && (
                  <Card className="border-primary">
                    <CardHeader>
                      <CardTitle className="text-base">Samenvatting</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Gemiddelde tijd</p>
                          <p className="text-lg font-bold">
                            {(
                              benchmarkRun.results.reduce(
                                (sum, r) => sum + r.executionTimeMs,
                                0
                              ) /
                              benchmarkRun.results.length /
                              1000
                            ).toFixed(2)}
                            s
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Min tijd</p>
                          <p className="text-lg font-bold">
                            {(
                              Math.min(...benchmarkRun.results.map((r) => r.executionTimeMs)) / 1000
                            ).toFixed(2)}
                            s
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Max tijd</p>
                          <p className="text-lg font-bold">
                            {(
                              Math.max(...benchmarkRun.results.map((r) => r.executionTimeMs)) / 1000
                            ).toFixed(2)}
                            s
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('benchmark.totalDocuments')}</p>
                          <p className="text-lg font-bold">
                            {benchmarkRun.results.reduce(
                              (sum, r) => sum + (r.documentsFound || 0),
                              0
                            )}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

