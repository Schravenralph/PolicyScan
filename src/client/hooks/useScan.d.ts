import { type JobProgressEvent } from './useWebSocket';
export interface ScanProgress {
    progress: number;
    status: string;
    documentsFound: number;
    estimatedTime: number | null;
}
export interface UseScanReturn {
    isScanning: boolean;
    progress: ScanProgress;
    runId: string | null;
    error: Error | null;
    jobFailures: JobProgressEvent[];
    startScan: (params: {
        queryId: string;
        websiteIds: string[];
        onderwerp: string;
        overheidslaag?: string;
        overheidsinstantie?: string;
    }) => Promise<string>;
    startScanViaWizard: (sessionId: string, queryId: string, revision?: number, executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>) => Promise<string>;
    stopScan: () => void;
    clearError: () => void;
}
/**
 * Custom hook for scan operations
 * Handles website scraping with progress tracking and workflow integration
 */
export declare function useScan(): UseScanReturn;
