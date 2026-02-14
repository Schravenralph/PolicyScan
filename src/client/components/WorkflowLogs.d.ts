/**
 * WorkflowLogs Component
 *
 * Component for displaying workflow execution logs in real-time.
 * Shows log entries with severity levels, timestamps, and filtering options.
 */
interface WorkflowLogsProps {
    runId: string | null;
    className?: string;
}
export declare function WorkflowLogs({ runId, className }: WorkflowLogsProps): import("react/jsx-runtime").JSX.Element;
export {};
