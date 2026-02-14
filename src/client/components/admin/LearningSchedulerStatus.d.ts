interface ScheduledTask {
    id: string;
    name: string;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
    status: 'idle' | 'running' | 'failed';
    runningSince?: string;
    lastError?: string;
}
interface LearningSchedulerStatusProps {
    status: {
        enabled: boolean;
        tasks: ScheduledTask[];
    } | null;
    loading: boolean;
    onRecover: () => Promise<void>;
    recovering: boolean;
    onTriggerTask?: (taskId: string) => Promise<void>;
    triggeringTask?: string | null;
}
export declare function LearningSchedulerStatus({ status, loading, onRecover, recovering, onTriggerTask, triggeringTask, }: LearningSchedulerStatusProps): import("react/jsx-runtime").JSX.Element;
export {};
