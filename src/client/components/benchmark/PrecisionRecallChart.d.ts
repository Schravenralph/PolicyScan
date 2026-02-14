interface PrecisionRecallChartProps {
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
    workflowName?: string;
    className?: string;
}
/**
 * Precision/Recall Curve Chart Component
 *
 * Displays precision and recall at different K values (1, 5, 10) as a line chart.
 * Shows both precision and recall curves for comparison.
 *
 * @component
 */
export declare function PrecisionRecallChart({ precisionAtK, recallAtK, workflowName, className, }: PrecisionRecallChartProps): import("react/jsx-runtime").JSX.Element;
export {};
