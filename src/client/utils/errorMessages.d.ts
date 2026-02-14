/**
 * Error Message Utilities
 *
 * Provides user-friendly error message formatting and mapping
 * to improve error message clarity across the application.
 */
/**
 * Error context for better error messages
 */
export interface ErrorContext {
    action?: string;
    field?: string;
    value?: string;
    step?: number;
    resource?: string;
}
/**
 * Error message map structure
 */
export interface ErrorMessageMap {
    title: string;
    message: string;
    action?: string;
    retryable: boolean;
}
/**
 * Error messages mapped by error code
 */
export declare const errorMessages: Record<string, ErrorMessageMap>;
/**
 * Operation-specific error messages
 */
export declare const operationErrorMessages: Record<string, ErrorMessageMap>;
/**
 * Get error message by error code
 */
export declare function getErrorMessage(code: string): ErrorMessageMap;
/**
 * Get error message by HTTP status code
 */
export declare function getErrorMessageForStatus(status: number): ErrorMessageMap;
/**
 * Get operation-specific error message
 */
export declare function getOperationErrorMessage(operation: string, errorCode?: string): ErrorMessageMap;
/**
 * Format a user-friendly error message with context
 */
export declare function formatErrorMessage(error: Error | string, context?: ErrorContext): string;
/**
 * Map technical error messages to user-friendly messages
 */
export declare function getUserFriendlyErrorMessage(error: Error | string, context?: ErrorContext): string;
/**
 * Get actionable guidance for common errors
 */
export declare function getErrorGuidance(error: Error | string, context?: ErrorContext): string | null;
/**
 * Format validation error with field context
 */
export declare function formatValidationError(field: string, error: string): string;
/**
 * Get error severity level for UI styling
 */
export type ErrorSeverity = 'error' | 'warning' | 'info';
export declare function getErrorSeverity(error: Error | string): ErrorSeverity;
