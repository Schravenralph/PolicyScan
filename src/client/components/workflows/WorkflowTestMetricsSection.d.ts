/**
 * Workflow Test Metrics Section Component
 *
 * Displays test metrics for workflows that are not in 'Tested' status.
 */
interface WorkflowTestMetricsSectionProps {
    testMetrics: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: string;
    };
}
export declare function WorkflowTestMetricsSection({ testMetrics }: WorkflowTestMetricsSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
