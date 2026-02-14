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
export declare function useWorkflowComparison(workflowIds: string[], query?: string): UseWorkflowComparisonReturn;
