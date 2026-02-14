import { TestApiService } from '../services/api/TestApiService';
export interface UseTestLogsResult {
    logs: string[];
    setLogs: React.Dispatch<React.SetStateAction<string[]>>;
    autoScroll: boolean;
    setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
    logsContainerRef: React.RefObject<HTMLDivElement | null>;
    loadTestLogs: () => Promise<void>;
    startLogPolling: (onActivity?: () => void) => void;
    stopLogPolling: () => void;
    clearLogs: () => void;
}
export declare function useTestLogs(testApi: TestApiService, isRunning: boolean): UseTestLogsResult;
