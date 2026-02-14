interface WorkflowMetrics {
    workflowId: string;
    workflowName: string;
    precisionAtK: {
        k1: number;
        k5: number;
        k10: number;
    };
    recallAtK: {
        k1: number;
        k5: number;
        k10: number;
    };
    f1Score: number;
    map: number;
    ndcg: {
        k1: number;
        k5: number;
        k10: number;
        mean_ndcg?: number;
    };
}
interface MetricsComparisonChartProps {
    workflows: WorkflowMetrics[];
    metricType: 'precision' | 'recall' | 'ndcg' | 'f1' | 'map';
    className?: string;
}
/**
 * Metrics Comparison Chart Component
 *
 * Displays a side-by-side comparison of metrics across multiple workflows.
 * Supports different metric types: precision, recall, NDCG, F1, and MAP.
 *
 * @component
 */
export declare function MetricsComparisonChart({ workflows, metricType, className, }: MetricsComparisonChartProps): import("react/jsx-runtime").JSX.Element;
export {};
