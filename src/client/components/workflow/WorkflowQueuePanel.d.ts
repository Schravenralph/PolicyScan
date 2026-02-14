/**
 * WorkflowQueuePanel Component
 *
 * Displays workflow queue jobs (waiting and active) with management actions:
 * - Pause active jobs
 * - Resume paused jobs
 * - Remove jobs from queue
 */
interface WorkflowQueuePanelProps {
    className?: string;
}
export interface WorkflowQueuePanelRef {
    refresh: () => Promise<void>;
}
export declare const WorkflowQueuePanel: import("react").ForwardRefExoticComponent<WorkflowQueuePanelProps & import("react").RefAttributes<WorkflowQueuePanelRef>>;
export {};
