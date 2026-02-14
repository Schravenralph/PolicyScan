/**
 * Connection Health Check Utility
 * Checks if the backend API is accessible and provides diagnostic information
 */
export interface ConnectionHealthResult {
    healthy: boolean;
    apiUrl: string;
    isUsingProxy: boolean;
    isDirectConnection: boolean;
    error?: string;
    diagnostic?: string;
}
/**
 * Check if the backend API is accessible
 */
export declare function checkConnectionHealth(): Promise<ConnectionHealthResult>;
/**
 * Log connection health status to console (for debugging)
 */
export declare function logConnectionHealth(result: ConnectionHealthResult): void;
