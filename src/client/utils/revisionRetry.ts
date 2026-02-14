/**
 * Utility for handling wizard session revision conflicts (409)
 * Provides functions to detect and automatically retry operations when a revision conflict occurs.
 */

/**
 * Helper function to check if an error is a revision conflict (409)
 */
export function isRevisionConflictError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status === 409;
  }
  return false;
}

/**
 * Helper function to extract actual revision from revision conflict error
 * Checks both response.data.actualRevision and response.data.context.actualRevision
 */
export function extractActualRevision(error: unknown): number | null {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { actualRevision?: number; context?: { actualRevision?: number } } } }).response;
    if (response?.data) {
      // Check direct property first
      if (typeof response.data.actualRevision === 'number') {
        return response.data.actualRevision;
      }
      // Check context property (backend puts it in context)
      if (response.data.context && typeof response.data.context === 'object' && 'actualRevision' in response.data.context) {
        const actualRevision = (response.data.context as { actualRevision?: number }).actualRevision;
        if (typeof actualRevision === 'number') {
          return actualRevision;
        }
      }
    }
  }
  return null;
}

/**
 * Helper function to retry an operation with automatic revision conflict resolution
 * Gets the latest revision and retries the operation with the updated revision
 *
 * @param operation - Function that returns a promise, receiving a function to get the current revision
 * @param getLatestRevision - Function that returns the latest session revision from the source of truth (server or state)
 * @param getLocalRevision - Function that returns the current local revision (cheap)
 * @param maxRetries - Maximum number of retries (default: 3)
 */
export async function withRevisionConflictRetry<T>(
  operation: (getRevision: () => number | undefined) => Promise<T>,
  getLatestRevision: () => Promise<number | undefined>,
  getLocalRevision: () => number | undefined,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown;
  let currentRetryRevision: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(() => {
        // Use the retried revision if available, otherwise fall back to local revision
        return currentRetryRevision !== undefined ? currentRetryRevision : getLocalRevision();
      });
    } catch (error) {
      lastError = error;

      // If it's a revision conflict and we have retries left
      if (isRevisionConflictError(error) && attempt < maxRetries) {
        // Try to extract actualRevision from error response
        const actualRevision = extractActualRevision(error);
        
        // Get the latest revision (updates state or just fetches)
        // Use actualRevision if available, otherwise fetch latest
        try {
          const newRevision = actualRevision !== null 
            ? actualRevision 
            : await getLatestRevision();
          
          if (newRevision !== undefined) {
            currentRetryRevision = newRevision;
            // Wait a bit before retrying to avoid immediate conflicts
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            continue; // Retry
          }
        } catch (reloadError) {
          // If fetching latest revision fails, throw original error
          throw error;
        }
      }

      throw error;
    }
  }

  throw lastError;
}
