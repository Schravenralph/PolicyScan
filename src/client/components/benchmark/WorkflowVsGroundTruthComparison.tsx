import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent } from '../ui/dialog';
import { Play, Loader2, AlertCircle, BarChart3, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { WorkflowSelector } from './WorkflowSelector';
import type { GroundTruthDataset } from './GroundTruthDatasetList';
import { GroundTruthMetricsChart } from './GroundTruthMetricsChart';
import { GroundTruthDatasetUpload } from './GroundTruthDatasetUpload';

interface GroundTruthEvaluationMetrics {
  precision_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  recall_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  f1_score: number;
  ndcg: {
    ndcg_at_k: {
      k1: number;
      k5: number;
      k10: number;
    };
    mean_ndcg: number;
  };
  map: number;
}

interface GroundTruthEvaluation {
  evaluationId: string;
  workflowId: string;
  workflowName: string;
  groundTruthId: string;
  groundTruthName: string;
  query: string;
  metrics: GroundTruthEvaluationMetrics;
  relevant_documents_found: number;
  total_relevant_documents: number;
  retrieved_documents: number;
  execution_time_ms: number;
  created_at: string | Date;
}

/**
 * WorkflowVsGroundTruthComparison Component
 * 
 * Allows users to compare a workflow against a ground truth dataset
 * and view precision, recall, F1, NDCG, and MAP metrics.
 * 
 * @component
 */
export function WorkflowVsGroundTruthComparison() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [datasets, setDatasets] = useState<GroundTruthDataset[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [evaluation, setEvaluation] = useState<GroundTruthEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setIsLoadingDatasets(true);
    try {
      const response = await api.get<{
        entries: GroundTruthDataset[];
        total: number;
      }>('/benchmark/ground-truth/datasets');
      setDatasets(response.entries || []);
    } catch (error) {
      logError(error, 'load-ground-truth-datasets');
      toast.error(t('benchmark.errorLoadingDatasets'), t('benchmark.errorLoadingDatasetsMessage'));
      setDatasets([]);
    } finally {
      setIsLoadingDatasets(false);
    }
  };

  const handleRunComparison = async () => {
    if (!selectedWorkflowId) {
      toast.error(t('benchmark.workflowRequired'), t('benchmark.workflowRequiredMessage'));
      return;
    }
    if (!selectedDatasetId) {
      toast.error(t('benchmark.datasetRequired'), t('benchmark.datasetRequiredMessage'));
      return;
    }
    if (!query.trim()) {
      toast.error(t('benchmark.queryRequired'), t('benchmark.queryRequiredMessage'));
      return;
    }

    setIsRunning(true);
    setError(null);
    setEvaluation(null);

    try {
      const response = await api.post<{
        success: boolean;
        evaluation: GroundTruthEvaluation;
      }>('/benchmark/compare-workflow-ground-truth', {
        workflowId: selectedWorkflowId,
        groundTruthId: selectedDatasetId,
        query: query.trim(),
      });

      setEvaluation(response.evaluation);
      toast.success(t('benchmark.comparisonCompleted'), t('benchmark.comparisonCompletedMessage'));
    } catch (error) {
      logError(error, 'compare-workflow-ground-truth');
      const errorMessage = error instanceof Error ? error.message : t('benchmark.comparisonError');
      setError(errorMessage);
      toast.error(t('benchmark.comparisonFailed'), errorMessage);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUploadSuccess = (dataset: GroundTruthDataset) => {
    // Refresh datasets list
    loadDatasets().then(() => {
      // Select the newly uploaded dataset
      setSelectedDatasetId(dataset._id);
    });
    // Close the upload dialog
    setShowUploadDialog(false);
    toast.success(t('benchmark.datasetUploaded'), t('benchmark.datasetUploadedMessage').replace('{{name}}', dataset.name));
  };

  const handleUploadCancel = () => {
    setShowUploadDialog(false);
  };

  const selectedDataset = datasets.find(d => d._id === selectedDatasetId);
  const canRun = selectedWorkflowId && selectedDatasetId && query.trim() && !isRunning;

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('benchmark.workflowVsGroundTruth')}</CardTitle>
          <CardDescription>
            {t('benchmark.workflowVsGroundTruthDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Selection */}
          <div className="space-y-2">
            <Label>{t('benchmark.workflowLabel')}</Label>
            <WorkflowSelector
              selectedWorkflows={selectedWorkflowId ? [selectedWorkflowId] : []}
              onSelectionChange={(ids) => setSelectedWorkflowId(ids[0] || '')}
              maxSelection={1}
              minSelection={0}
              label={t('benchmark.selectWorkflow')}
              description={t('benchmark.selectWorkflowDesc')}
            />
          </div>

          {/* Ground Truth Dataset Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('benchmark.groundTruthDataset')}</Label>
              {datasets.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUploadDialog(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('benchmark.uploadNewDataset')}
                </Button>
              )}
            </div>
            {isLoadingDatasets ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('benchmark.loadingDatasets')}</span>
              </div>
            ) : datasets.length === 0 ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                <p>{t('benchmark.noDatasetsAvailable')}</p>
                <p className="text-sm mt-1">{t('benchmark.uploadDatasetFirst')}</p>
                <Button
                  onClick={() => setShowUploadDialog(true)}
                  className="mt-4 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Upload Dataset
                </Button>
              </div>
            ) : (
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('benchmark.selectDataset')} />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset._id} value={dataset._id}>
                      <div className="flex flex-col">
                        <span>{dataset.name}</span>
                        {dataset.description && (
                          <span className="text-xs text-muted-foreground">{dataset.description}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {dataset.queries.length} queries
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedDataset && (
              <div className="text-sm text-muted-foreground">
                <p>Dataset: {selectedDataset.name}</p>
                {selectedDataset.description && <p>{selectedDataset.description}</p>}
                <p>{selectedDataset.queries.length} queries beschikbaar</p>
              </div>
            )}
          </div>

          {/* Query Input */}
          <div className="space-y-2">
            <Label htmlFor="query">{t('workflowComparison.query')} *</Label>
            <Input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bijv. arbeidsmigranten huisvesting"
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">
              De query moet overeenkomen met een query in het geselecteerde dataset.
            </p>
          </div>

          {/* Run Button */}
          <Button
            onClick={handleRunComparison}
            disabled={!canRun}
            className="w-full gap-2"
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Vergelijken...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Vergelijking
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
      {evaluation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Evaluatie Resultaten
            </CardTitle>
            <CardDescription>
              Workflow: {evaluation.workflowName} | Dataset: {evaluation.groundTruthName} | Query: {evaluation.query}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">{t('benchmark.relevantDocuments')}</p>
                <p className="text-2xl font-bold">
                  {evaluation.relevant_documents_found} / {evaluation.total_relevant_documents}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">{t('benchmark.retrievedDocuments')}</p>
                <p className="text-2xl font-bold">{evaluation.retrieved_documents}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">F1 Score</p>
                <p className="text-2xl font-bold">{evaluation.metrics.f1_score.toFixed(3)}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">MAP</p>
                <p className="text-2xl font-bold">{evaluation.metrics.map.toFixed(3)}</p>
              </div>
            </div>

            {/* Precision@K */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Precision@K</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Precision@1</p>
                  <p className="text-xl font-bold">{evaluation.metrics.precision_at_k.k1.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Precision@5</p>
                  <p className="text-xl font-bold">{evaluation.metrics.precision_at_k.k5.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Precision@10</p>
                  <p className="text-xl font-bold">{evaluation.metrics.precision_at_k.k10.toFixed(3)}</p>
                </div>
              </div>
            </div>

            {/* Recall@K */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Recall@K</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Recall@1</p>
                  <p className="text-xl font-bold">{evaluation.metrics.recall_at_k.k1.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Recall@5</p>
                  <p className="text-xl font-bold">{evaluation.metrics.recall_at_k.k5.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Recall@10</p>
                  <p className="text-xl font-bold">{evaluation.metrics.recall_at_k.k10.toFixed(3)}</p>
                </div>
              </div>
            </div>

            {/* NDCG@K */}
            <div>
              <h3 className="text-lg font-semibold mb-3">NDCG@K</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">NDCG@1</p>
                  <p className="text-xl font-bold">{evaluation.metrics.ndcg.ndcg_at_k.k1.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">NDCG@5</p>
                  <p className="text-xl font-bold">{evaluation.metrics.ndcg.ndcg_at_k.k5.toFixed(3)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">NDCG@10</p>
                  <p className="text-xl font-bold">{evaluation.metrics.ndcg.ndcg_at_k.k10.toFixed(3)}</p>
                </div>
              </div>
              <div className="mt-2 p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground">Mean NDCG</p>
                <p className="text-xl font-bold">{evaluation.metrics.ndcg.mean_ndcg.toFixed(3)}</p>
              </div>
            </div>

            {/* Charts Visualization */}
            <GroundTruthMetricsChart
              metrics={evaluation.metrics}
              workflowName={evaluation.workflowName}
            />

            {/* Execution Info */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Uitvoeringstijd: {Math.round(evaluation.execution_time_ms / 1000)}s</span>
                <span>Evaluatie ID: {evaluation.evaluationId}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <GroundTruthDatasetUpload
            onSuccess={handleUploadSuccess}
            onCancel={handleUploadCancel}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
