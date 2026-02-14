import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';

export interface WorkflowComparison {
  workflowId: string;
  workflowName: string;
  query: string;
  runs: number;
  metrics: {
    avgExecutionTime: number;
    avgDocumentsFound: number;
    avgScore: number;
    minExecutionTime: number;
    maxExecutionTime: number;
    stdDevExecutionTime: number;
    medianExecutionTime: number;
  };
  results: Array<{
    id: string;
    benchmarkRunId: string;
    workflowId: string;
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
  }>;
}

export interface UseWorkflowComparisonReturn {
  comparisons: WorkflowComparison[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWorkflowComparison(
  workflowIds: string[],
  query?: string
): UseWorkflowComparisonReturn {
  const [comparisons, setComparisons] = useState<WorkflowComparison[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComparisons = useCallback(async () => {
    if (workflowIds.length === 0) {
      setComparisons(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.compareWorkflows(workflowIds, query);
      setComparisons(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to compare workflows';
      setError(errorMessage);
      logError(err, 'compare-workflows');
      toast.error('Fout', 'Kan workflows niet vergelijken.');
      setComparisons(null);
    } finally {
      setLoading(false);
    }
  }, [workflowIds, query]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  return {
    comparisons,
    loading,
    error,
    refetch: fetchComparisons,
  };
}

