/**
 * Session ID management for tracking user sessions
 * Used for feedback collection and analytics
 */
/**
 * Get or create a session ID
 * Session IDs persist for 24 hours, then a new one is created
 */
export declare function getSessionId(): string;
/**
 * Get the current user ID from auth token or return undefined
 */
export declare function getUserId(): string | undefined;
