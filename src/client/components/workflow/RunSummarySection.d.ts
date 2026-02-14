/**
 * Run Summary Section Component
 *
 * Displays workflow run status, controls, output summary, and convert button.
 */
interface WorkflowRun {
    id: string;
    status: string;
    startTime: string;
    params?: Record<string, unknown>;
    type?: string;
    outputPaths?: {
        jsonPath: string;
    };
}
interface WorkflowOutput {
    trace: {
        totalUrlsVisited: number;
        steps: Array<{
            stepName: string;
            status: string;
            urls?: string[];
        }>;
    };
    results?: {
        summary?: {
            totalDocuments: number;
            newlyDiscovered: number;
            errors: number;
        };
        endpoints?: Array<{
            title: string;
            url: string;
        }>;
    };
}
interface RunSummarySectionProps {
    run: WorkflowRun | null;
    output: WorkflowOutput | null;
    queryId: string | null;
    documentsCount: number;
    isConverting: boolean;
    onPauseRun: () => void;
    onResumeRun: () => void;
    onStopRun: () => void;
    onRefresh: () => void;
    onConvertToDocuments: () => void;
}
export declare function RunSummarySection({ run, output, queryId, documentsCount, isConverting, onPauseRun, onResumeRun, onStopRun, onRefresh, onConvertToDocuments, }: RunSummarySectionProps): import("react/jsx-runtime").JSX.Element | null;
export {};
