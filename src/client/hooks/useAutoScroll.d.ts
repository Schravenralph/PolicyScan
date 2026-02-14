import { BaseLogEntry } from '../components/shared/LogBubble';
interface UseAutoScrollProps {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    logs: BaseLogEntry[];
    runningWorkflowId?: string | null;
}
export declare function useAutoScroll({ scrollContainerRef, logs, runningWorkflowId }: UseAutoScrollProps): void;
export {};
