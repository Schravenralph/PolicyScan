/**
 * Error Logs Widget Component
 *
 * Displays application error logs with filtering capabilities (time range, severity, component, test run ID).
 */
import type { TestApiService } from '../../services/api/TestApiService';
interface ErrorLog {
    _id?: string;
    error_id?: string;
    timestamp?: string | Date;
    severity?: 'critical' | 'error' | 'warning';
    component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
    message?: string;
    stack_trace?: string;
    status?: 'open' | 'resolved' | 'ignored';
    occurrence_count?: number;
    testRunId?: string;
}
interface ErrorLogsWidgetProps {
    testApiService: TestApiService;
    onErrorLogsLoaded?: (errorLogs: ErrorLog[]) => void;
}
export declare function ErrorLogsWidget({ testApiService, onErrorLogsLoaded }: ErrorLogsWidgetProps): import("react/jsx-runtime").JSX.Element;
export {};
