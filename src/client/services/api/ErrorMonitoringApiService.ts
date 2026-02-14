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
export class ErrorMonitoringApiService extends BaseApiService {
  async getErrorById(errorId: string): Promise<ErrorDetail> {
    return this.request<ErrorDetail>(`/errors/${errorId}`);
  }

  async resolveError(errorId: string): Promise<void> {
    return this.request<void>(`/errors/${errorId}/resolve`, {
      method: 'PATCH',
    });
  }

  async resolveTestErrors(): Promise<{
    message: string;
    resolvedCount: number;
    totalTestErrors: number;
  }> {
    return this.request<{
      message: string;
      resolvedCount: number;
      totalTestErrors: number;
    }>('/admin/errors/resolve-test-errors', {
      method: 'POST',
    });
  }
}










