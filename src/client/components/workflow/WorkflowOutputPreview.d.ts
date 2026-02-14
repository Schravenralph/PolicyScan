/**
 * Workflow Output Preview Component
 *
 * Displays workflow output preview including endpoints and execution trace.
 */
interface WorkflowOutput {
    trace: {
        steps: Array<{
            stepName: string;
            status: string;
            urls?: string[];
        }>;
    };
    results?: {
        endpoints?: Array<{
            title: string;
            url: string;
        }>;
    };
}
interface WorkflowOutputPreviewProps {
    output: WorkflowOutput;
}
export declare function WorkflowOutputPreview({ output }: WorkflowOutputPreviewProps): import("react/jsx-runtime").JSX.Element;
export {};
