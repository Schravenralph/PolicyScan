import { BaseApiService } from './BaseApiService';
export interface ErrorDetail {
    _id: string;
    error_id: string;
    timestamp: string;
    severity: 'critical' | 'error' | 'warning';
    component: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
    message: string;
    stack_trace?: string;
    user_id?: string;
    request_id?: string;
    metadata?: Record<string, unknown>;
    status: 'open' | 'resolved' | 'ignored';
    resolved_at?: string;
    resolved_by?: string;
    occurrence_count: number;
    first_seen: string;
    last_seen: string;
    error_signature: string;
}
/**
 * Error Monitoring API service
 */
export declare class ErrorMonitoringApiService extends BaseApiService {
    getErrorById(errorId: string): Promise<ErrorDetail>;
    resolveError(errorId: string): Promise<void>;
    resolveTestErrors(): Promise<{
        message: string;
        resolvedCount: number;
        totalTestErrors: number;
    }>;
}
