/**
 * Enhanced error handling utility for Beleidsscan
 * Provides specific, actionable error messages with retry functionality
 *
 * This module integrates with the centralized error handling system
 */
export interface ErrorInfo {
    title: string;
    message: string;
    action?: string;
    retryable?: boolean;
    errorType: 'network' | 'validation' | 'server' | 'timeout' | 'permission' | 'unknown';
    statusCode?: number;
    code?: string;
}
export interface ErrorWithRetry extends ErrorInfo {
    onRetry?: () => void | Promise<void>;
}
/**
 * Parse API error response (from backend ErrorResponse format)
 */
export declare function parseApiErrorResponse(response: {
    error?: string;
    code?: string;
    message?: string;
    statusCode?: number;
}): ErrorInfo;
/**
 * Check if error is related to GraphDB backend not supporting hierarchical structure
 */
export declare function isGraphDBHierarchyError(error: unknown): boolean;
/**
 * Parse error and return specific error information
 */
export declare function parseError(error: unknown): ErrorInfo;
/**
 * Log error for debugging
 */
export declare function logError(error: unknown, context?: string): void;
/**
 * Create error message with retry functionality
 */
export declare function createErrorWithRetry(error: unknown, retryFn: () => void | Promise<void>, context?: string): ErrorWithRetry;
/**
 * Get user-friendly error message for specific operations
 * Uses centralized error message mapping
 */
export declare function getOperationErrorMessage(operation: string, error: unknown): ErrorInfo;
