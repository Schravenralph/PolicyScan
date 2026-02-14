/**
 * Test Run Comparison Visualization
 *
 * Visual comparison of two or more test runs with side-by-side metrics.
 */
interface TestRun {
    id: string;
    timestamp: string;
    testFile?: string;
    results: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
    };
}
interface TestRunComparisonVisualizationProps {
    runs: TestRun[];
    maxRuns?: number;
}
export declare function TestRunComparisonVisualization({ runs, maxRuns }: TestRunComparisonVisualizationProps): import("react/jsx-runtime").JSX.Element;
export {};
