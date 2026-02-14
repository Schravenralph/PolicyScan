import { BaseLogEntry } from '../components/shared/LogBubble';
interface UseRunLogsOptions {
    runId: string | null;
    pollDelay?: number;
    autoClearOnComplete?: boolean;
    clearDelay?: number;
}
interface UseRunLogsResult {
    logs: BaseLogEntry[];
    status: string;
    isLoading: boolean;
    error: Error | null;
}
/**
 * Shared hook for fetching run logs via WebSocket (with HTTP polling fallback).
 * Uses WebSocket for real-time updates, falls back to polling if WebSocket unavailable.
 */
export declare function useRunLogs({ runId, pollDelay, autoClearOnComplete, clearDelay }: UseRunLogsOptions): UseRunLogsResult;
export {};
