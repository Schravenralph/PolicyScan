import { TestApiService } from '../services/api/TestApiService';
export interface ErrorLog {
    _id?: string;
    error_id: string;
    timestamp: string;
    severity: 'critical' | 'error' | 'warning';
    component: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
    message: string;
    stack_trace?: string;
    status: 'open' | 'resolved' | 'ignored';
    occurrence_count: number;
    testRunId?: string;
}
export interface ErrorLogsFilter {
    severity?: 'critical' | 'error' | 'warning';
    component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
    testRunId?: string;
    timeRange?: '24h' | '7d' | '30d';
}
interface UseErrorLogsResult {
    errorLogs: ErrorLog[];
    errorLogsLoading: boolean;
    errorLogsError: string | null;
    errorLogsFilter: ErrorLogsFilter;
    setErrorLogsFilter: React.Dispatch<React.SetStateAction<ErrorLogsFilter>>;
    loadErrorLogs: (filterOverride?: ErrorLogsFilter) => Promise<void>;
}
export declare function useErrorLogs(testApi: TestApiService): UseErrorLogsResult;
export {};
