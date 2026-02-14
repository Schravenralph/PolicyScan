/**
 * Quick Comparison Widget Component
 *
 * Compares the latest test run with the previous run.
 */
interface TestRun {
    id?: string;
    results?: {
        passed?: number;
        failed?: number;
        skipped?: number;
        total?: number;
        duration?: number;
    };
}
interface QuickComparisonWidgetProps {
    latestRun: TestRun;
    previousRun: TestRun;
}
export declare function QuickComparisonWidget({ latestRun, previousRun }: QuickComparisonWidgetProps): import("react/jsx-runtime").JSX.Element | null;
export {};
