/**
 * Utility to parse timeout error messages and reconstruct Error objects
 * with suggestions and metadata for use with TimeoutErrorDisplay component
 */
/**
 * Parse a timeout error message string and extract metadata
 * This allows us to reconstruct timeout errors from stored error strings
 */
export declare function parseTimeoutError(errorMessage: string): Error & {
    suggestions?: string[];
    metadata?: {
        type?: string;
        timeoutSeconds?: number;
        elapsedSeconds?: number;
        percentageUsed?: number;
    };
} | null;
/**
 * Check if an error string is a timeout error
 */
export declare function isTimeoutErrorString(errorMessage: string): boolean;
