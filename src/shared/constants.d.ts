/**
 * Shared constants used across client and server
 *
 * These constants are safe to use in both environments.
 */
/**
 * HTTP Status Codes
 * Standard HTTP status codes for consistent use across the application
 */
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly INTERNAL_SERVER_ERROR: 500;
    readonly SERVICE_UNAVAILABLE: 503;
};
/**
 * Pagination Defaults
 * Default values for pagination across the application
 */
export declare const PAGINATION: {
    readonly DEFAULT_LIMIT: 50;
    readonly MAX_LIMIT: 1000;
    readonly MIN_LIMIT: 1;
};
/**
 * Common Timeouts (in milliseconds)
 * Standard timeout values for various operations
 */
export declare const TIMEOUTS: {
    readonly SHORT: 5000;
    readonly MEDIUM: 30000;
    readonly LONG: 60000;
    readonly VERY_LONG: 300000;
    readonly HTTP_REQUEST: 30000;
    readonly EMBEDDING_INITIALIZATION: 60000;
};
/**
 * Common Delays (in milliseconds)
 * Standard delay values for retries, polling, etc.
 */
export declare const DELAYS: {
    readonly SHORT: 100;
    readonly MEDIUM: 500;
    readonly LONG: 1000;
    readonly VERY_LONG: 5000;
};
/**
 * Retry Configuration
 * Default retry values for operations
 */
export declare const RETRY: {
    readonly MAX_ATTEMPTS: 3;
    readonly INITIAL_DELAY: 1000;
    readonly MAX_DELAY: 30000;
};
/**
 * Common String Constants
 * Frequently used string values
 */
export declare const STRINGS: {
    readonly EMPTY: "";
    readonly SPACE: " ";
    readonly COMMA: ",";
    readonly SEMICOLON: ";";
    readonly COLON: ":";
    readonly DASH: "-";
    readonly UNDERSCORE: "_";
};
/**
 * Common Error Messages
 * Standard error messages for consistency
 */
export declare const ERROR_MESSAGES: {
    readonly NOT_FOUND: "Resource not found";
    readonly UNAUTHORIZED: "Unauthorized";
    readonly FORBIDDEN: "Forbidden";
    readonly BAD_REQUEST: "Bad request";
    readonly INTERNAL_ERROR: "Internal server error";
    readonly VALIDATION_FAILED: "Validation failed";
};
