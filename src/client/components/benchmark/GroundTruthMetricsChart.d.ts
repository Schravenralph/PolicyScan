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
interface GroundTruthMetricsChartProps {
    metrics: GroundTruthEvaluationMetrics;
    workflowName?: string;
    className?: string;
    onExport?: (format: 'png' | 'svg') => void;
}
/**
 * Ground Truth Metrics Chart Component
 *
 * Main component that combines all visualization charts for ground truth evaluation metrics.
 * Includes precision/recall curve, NDCG chart, and export functionality.
 *
 * @component
 */
export declare function GroundTruthMetricsChart({ metrics, workflowName, className, onExport, }: GroundTruthMetricsChartProps): import("react/jsx-runtime").JSX.Element;
/**
 * Export function for comparing multiple workflows
 */
export declare function GroundTruthMetricsComparison({ workflows, className, }: {
    workflows: Array<{
        workflowId: string;
        workflowName: string;
        metrics: GroundTruthEvaluationMetrics;
    }>;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export {};
