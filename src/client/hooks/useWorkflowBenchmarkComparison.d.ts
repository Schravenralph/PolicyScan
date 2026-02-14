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
export declare function useStartWorkflowBenchmarkComparison(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
    comparisonId: string;
    message: string;
}, Error, StartComparisonInput, unknown>;
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
export declare function useWorkflowBenchmarkComparison(comparisonId: string | null, options?: {
    refetchInterval?: number | false;
    enabled?: boolean;
}): import("@tanstack/react-query").UseQueryResult<WorkflowBenchmarkComparison | null, Error>;
export {};
