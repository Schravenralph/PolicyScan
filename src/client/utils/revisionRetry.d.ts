/**
 * Utility for handling wizard session revision conflicts (409)
 * Provides functions to detect and automatically retry operations when a revision conflict occurs.
 */
/**
 * Helper function to check if an error is a revision conflict (409)
 */
export declare function isRevisionConflictError(error: unknown): boolean;
/**
 * Helper function to extract actual revision from revision conflict error
 * Checks both response.data.actualRevision and response.data.context.actualRevision
 */
export declare function extractActualRevision(error: unknown): number | null;
/**
 * Helper function to retry an operation with automatic revision conflict resolution
 * Gets the latest revision and retries the operation with the updated revision
 *
 * @param operation - Function that returns a promise, receiving a function to get the current revision
 * @param getLatestRevision - Function that returns the latest session revision from the source of truth (server or state)
 * @param getLocalRevision - Function that returns the current local revision (cheap)
 * @param maxRetries - Maximum number of retries (default: 3)
 */
export declare function withRevisionConflictRetry<T>(operation: (getRevision: () => number | undefined) => Promise<T>, getLatestRevision: () => Promise<number | undefined>, getLocalRevision: () => number | undefined, maxRetries?: number): Promise<T>;
