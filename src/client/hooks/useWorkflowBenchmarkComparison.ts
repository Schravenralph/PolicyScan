import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export interface WorkflowBenchmarkComparison {
  id: string;
  name?: string;
  workflowAId: string;
  workflowBId: string;
  configAName: string;
  configBName: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflowARunId?: string;
  workflowBRunId?: string;
  results?: {
    workflowA: {
      workflowId: string;
      workflowName: string;
      configName: string;
      configDescription: string;
      runId: string;
      status: 'completed' | 'failed' | 'cancelled';
      executionTimeMs: number;
      documentsFound: number;
      documents: Array<{
        url: string;
        title: string;
        score: number;
        rank: number;
      }>;
      metrics: {
        averageScore?: number;
        topScore?: number;
        documentsWithScores: number;
      };
      error?: string;
    };
    workflowB: {
      workflowId: string;
      workflowName: string;
      configName: string;
      configDescription: string;
      runId: string;
      status: 'completed' | 'failed' | 'cancelled';
      executionTimeMs: number;
      documentsFound: number;
      documents: Array<{
        url: string;
        title: string;
        score: number;
        rank: number;
      }>;
      metrics: {
        averageScore?: number;
        topScore?: number;
        documentsWithScores: number;
      };
      error?: string;
    };
    comparison: {
      executionTimeDiff: number;
      documentsFoundDiff: number;
      averageScoreDiff: number;
      topScoreDiff: number;
      commonDocuments: number;
      uniqueToA: number;
      uniqueToB: number;
    };
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface StartComparisonInput {
  workflowAId: string;
  workflowBId: string;
  configAName: string;
  configBName: string;
  query: string;
  name?: string;
  timeout?: number;
}

/**
 * React Query hook for starting a workflow benchmark comparison
 * 
 * @example
 * ```tsx
 * const startComparison = useStartWorkflowBenchmarkComparison();
 * 
 * const handleStart = async () => {
 *   const result = await startComparison.mutateAsync({
 *     workflowAId: 'workflow-1',
 *     workflowBId: 'workflow-2',
 *     configAName: 'baseline',
 *     configBName: 'full-hybrid',
 *     query: 'test query',
 *   });
 * };
 * ```
 */
export function useStartWorkflowBenchmarkComparison() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartComparisonInput) => {
      const response = await api.post<{
        success: boolean;
        comparisonId: string;
        message: string;
      }>('/benchmark/workflow-comparison', input);
      
      if (!response.success) {
        throw new Error(response.message || 'Failed to start comparison');
      }
      
      return response;
    },
    onSuccess: (data) => {
      // Invalidate comparison queries to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ['workflow-benchmark-comparison', data.comparisonId],
      });
    },
  });
}

/**
 * React Query hook for fetching a workflow benchmark comparison by ID
 * 
 * @param comparisonId - The comparison ID to fetch
 * @param options - Options for polling
 * @example
 * ```tsx
 * const { data: comparison, isLoading } = useWorkflowBenchmarkComparison('comparison-123', {
 *   refetchInterval: 3000, // Poll every 3 seconds
 * });
 * ```
 */
export function useWorkflowBenchmarkComparison(
  comparisonId: string | null,
  options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['workflow-benchmark-comparison', comparisonId],
    queryFn: async () => {
      if (!comparisonId) return null;
      return await api.get<WorkflowBenchmarkComparison>(`/benchmark/workflow-comparison/${comparisonId}`);
    },
    enabled: !!comparisonId && (options?.enabled !== false),
    refetchInterval: (query): number | false | undefined => {
      // Stop polling if comparison is completed, failed, or cancelled
      const data = query.state.data as WorkflowBenchmarkComparison | null;
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      // Use provided refetchInterval or default to 3000ms (poll every 3 seconds)
      return options?.refetchInterval ?? 3000;
    },
    staleTime: 0, // Comparison status is always stale (needs fresh fetch)
  });
}

