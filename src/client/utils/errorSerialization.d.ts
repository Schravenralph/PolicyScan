/**
 * Error Serialization Utility
 *
 * Safely serializes error objects, handling circular references and
 * formatting error details for display in the UI.
 */
/**
 * Safely serialize an error object, handling circular references
 */
export declare function serializeError(error: unknown): string;
/**
 * Format error details for display
 */
export declare function formatErrorDetails(error: unknown): {
    message: string;
    details?: string;
    stack?: string;
};
