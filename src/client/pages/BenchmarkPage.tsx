import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, FileText, Settings } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BenchmarkDiffView } from '../components/benchmark/BenchmarkDiffView';
import { BenchmarkResultsList } from '../components/benchmark/BenchmarkResultsList';
import { WorkflowComparisonDashboard } from '../components/workflow/WorkflowComparisonDashboard';
import { ComparisonModeSelector, type ComparisonMode } from '../components/benchmark/ComparisonModeSelector';
import { WorkflowVsGroundTruthComparison } from '../components/benchmark/WorkflowVsGroundTruthComparison';
import { StepBenchmarkView } from '../components/benchmark/StepBenchmarkView';
import { BenchmarkConfigTab } from '../components/benchmark/BenchmarkConfigTab';
import { toast } from '../utils/toast';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';

interface BenchmarkRun {
  id: string;
  name: string;
  query?: string;
  queries?: string[];
  benchmarkTypes: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  results?: BenchmarkResult[];
}

interface BenchmarkResult {
  id: string;
  benchmarkType: string;
  configName: string;
  documents: Array<{
    url: string;
    titel: string;
    samenvatting: string;
    score: number;
    rank: number;
  }>;
  metrics: {
    documentsFound: number;
    averageScore: number;
  };
}

export function BenchmarkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'compare' | 'workflows' | 'steps'>('config');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('workflow-vs-workflow');

  useEffect(() => {
    loadBenchmarkRuns();
    
    // Check for template flags in URL params (for backward compatibility)
    const templateName = searchParams.get('template');
    const flagsParam = searchParams.get('flags');
    
    if (templateName && flagsParam) {
      const applyTemplate = async () => {
        try {
          const flags = JSON.parse(decodeURIComponent(flagsParam));
          await api.post('/feature-flags/benchmark-config', {
            flags,
            name: templateName,
          });
          setSearchParams({});
          toast.success(
            'Template applied',
            `Template "${templateName}" has been applied.`
          );
        } catch (error) {
          console.error('Error parsing template flags from URL:', error);
          toast.error('Invalid template data', 'Failed to parse template flags from URL');
        }
      };
      
      applyTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBenchmarkRuns = async () => {
    try {
      const data = await api.get<BenchmarkRun[]>('/benchmark/runs');
      setRuns(data);
    } catch (error) {
      // Silently handle 404 errors (endpoint may not be available due to OpenAPI validation)
      const statusCode = (error as { statusCode?: number })?.statusCode || 
                        (error as { response?: { status?: number } })?.response?.status;
      if (statusCode === 404) {
        // Endpoint not found - likely due to OpenAPI validation, set empty array
        setRuns([]);
        return;
      }
      // Only log and show errors for non-404 cases
      logError(error, 'load-benchmark-runs');
      toast.error('Failed to load benchmark runs', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleSelectRun = async (run: BenchmarkRun) => {
    try {
      // Always fetch full run data to ensure we have complete document data
      // The list endpoint returns simplified results without full documents
      const fullRun = await api.getBenchmarkRun(run.id);
      setSelectedRun(fullRun as BenchmarkRun);
      setActiveTab('compare');
    } catch (error) {
      logError(error, 'select-benchmark-run');
      toast.error('Failed to load benchmark run', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleCancelBenchmark = async (runId: string) => {
    try {
      await api.cancelBenchmark(runId);
      toast.success('Benchmark cancelled', 'The benchmark has been cancelled successfully.');
      
      // Update the run status in the list
      setRuns((prev) => {
        return prev.map((run) => {
          if (run.id === runId) {
            return { ...run, status: 'cancelled' as const };
          }
          return run;
        });
      });
      
      // Reload runs to get updated status
      loadBenchmarkRuns();
    } catch (error) {
      logError(error, 'cancel-benchmark');
      toast.error('Failed to cancel benchmark', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-blue-600" />
          Benchmarking
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Compare different system configurations to see which settings generate better end results.
          Focus on result quality, not just performance metrics.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col">
        <TabsList className="mb-6">
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Benchmark Configs
          </TabsTrigger>
          <TabsTrigger value="results">
            <FileText className="w-4 h-4 mr-2" />
            Results
          </TabsTrigger>
          <TabsTrigger value="compare" disabled={!selectedRun}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="workflows">
            <BarChart3 className="w-4 h-4 mr-2" />
            Compare Workflows
          </TabsTrigger>
          <TabsTrigger value="steps">
            <Settings className="w-4 h-4 mr-2" />
            Step Benchmark
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex-1 overflow-y-auto">
          <BenchmarkConfigTab />
        </TabsContent>

        <TabsContent value="results" className="flex-1">
          <BenchmarkResultsList 
            runs={runs} 
            onSelectRun={handleSelectRun}
            onCancelRun={handleCancelBenchmark}
          />
        </TabsContent>

        <TabsContent value="compare" className="flex-1">
          {selectedRun ? (
            <BenchmarkDiffView run={selectedRun} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Select a benchmark run from the Results tab to compare results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="workflows" className="flex-1">
          <div className="space-y-6">
            <ComparisonModeSelector
              mode={comparisonMode}
              onModeChange={setComparisonMode}
            />
            {comparisonMode === 'workflow-vs-workflow' ? (
              <WorkflowComparisonDashboard />
            ) : (
              <WorkflowVsGroundTruthComparison />
            )}
          </div>
        </TabsContent>

        <TabsContent value="steps" className="flex-1">
          <StepBenchmarkView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
