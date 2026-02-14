interface NDCGChartProps {
    ndcgData: {
        k1: number;
        k5: number;
        k10: number;
        mean_ndcg?: number;
    };
    workflowName?: string;
    className?: string;
}
/**
 * NDCG@K Bar Chart Component
 *
 * Displays NDCG scores at different K values (1, 5, 10) as a bar chart.
 *
 * @component
 */
export declare function NDCGChart({ ndcgData, workflowName, className }: NDCGChartProps): import("react/jsx-runtime").JSX.Element;
export {};
