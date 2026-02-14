/**
 * Workflow Quality Gates Section Component
 *
 * Displays quality gates status for tested workflows.
 */
interface WorkflowQualityGatesSectionProps {
    qualityGates: {
        passed: boolean;
        reasons: string[];
    } | null;
    loading: boolean;
    testMetrics?: {
        runCount: number;
        acceptanceRate: number;
        errorRate: number;
        lastTestRun?: string;
    };
}
export declare function WorkflowQualityGatesSection({ qualityGates, loading, testMetrics, }: WorkflowQualityGatesSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
