/**
 * Comparison Results Component
 *
 * Displays the results of workflow comparisons including:
 * - Summary section with winner
 * - Metrics comparison table
 * - Trend analysis chart
 * - Document discovery comparison
 */
interface WorkflowComparison {
    workflowId: string;
    workflowName: string;
    runs: number;
    metrics: {
        avgExecutionTime: number;
        avgDocumentsFound: number;
        avgScore: number;
    };
}
export interface MetricData {
    metric: string;
    workflowA: number;
    workflowB: number;
    unit: string;
    better: 'A' | 'B' | 'tie';
}
interface TrendDataPoint {
    index: number;
    workflowA: number;
    workflowB: number;
}
export interface Winner {
    workflow: 'A' | 'B' | 'tie';
    name: string;
    score: number;
}
interface ComparisonResultsProps {
    comparisonA: WorkflowComparison;
    comparisonB: WorkflowComparison;
    metricsData: MetricData[];
    trendData: TrendDataPoint[];
    winner: Winner | null;
}
export declare function ComparisonResults({ comparisonA, comparisonB, metricsData, trendData, winner, }: ComparisonResultsProps): import("react/jsx-runtime").JSX.Element;
export {};
