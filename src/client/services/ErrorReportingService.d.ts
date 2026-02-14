/**
 * Error Reporting Service
 *
 * Provides centralized error reporting functionality for sending errors
 * to monitoring services and tracking error frequency.
 */
import type { ErrorInfo } from '../utils/errorHandler';
export interface ErrorReport {
    error: Error | unknown;
    context?: string;
    errorInfo?: ErrorInfo;
    timestamp: string;
    userAgent?: string;
    url?: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}
export interface ErrorReportResult {
    success: boolean;
    errorId?: string;
    error?: string;
}
export declare class ErrorReportingService {
    private static errorCounts;
    private static readonly MAX_ERRORS_PER_CONTEXT;
    private static readonly THROTTLE_WINDOW_MS;
    private static errorTimestamps;
    /**
     * Report an error to the monitoring service
     */
    static reportError(error: Error | unknown, context?: string, metadata?: Record<string, unknown>): Promise<ErrorReportResult>;
    /**
     * Check if error reporting should be throttled
     */
    private static shouldThrottle;
    /**
     * Track error frequency for monitoring
     */
    private static trackError;
    /**
     * Get error statistics
     */
    static getErrorStats(): {
        totalErrors: number;
        errorsByContext: Record<string, number>;
    };
    /**
     * Reset error statistics
     */
    static resetStats(): void;
    /**
     * Check if error is critical and should trigger alerts
     */
    static isCriticalError(error: unknown): boolean;
}
