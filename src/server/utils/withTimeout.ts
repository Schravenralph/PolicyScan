/**
 * Timeout utility for wrapping async operations
 * 
 * Prevents operations from hanging indefinitely by enforcing timeouts.
 * Used throughout the codebase for database queries, API calls, and other async operations.
 */

/**
 * Wrap a promise with a timeout
 * 
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Optional name for error messages
 * @returns The promise result or throws timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName?: string
): Promise<T> {
  const operation = operationName || 'Operation';
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(
        `${operation} timed out after ${timeoutMs}ms`
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Default timeout values for common operations (in milliseconds)
 */
export const DEFAULT_TIMEOUTS = {
  /** Database query timeout - 30 seconds */
  DB_QUERY: 30000,
  /** Learning cycle timeout - 5 minutes */
  LEARNING_CYCLE: 5 * 60 * 1000,
  /** Individual learning operation timeout - 2 minutes */
  LEARNING_OPERATION: 2 * 60 * 1000,
  /** Dictionary update timeout - 1 minute */
  DICTIONARY_UPDATE: 60 * 1000,
  /** Pattern analysis timeout - 1 minute */
  PATTERN_ANALYSIS: 60 * 1000,
} as const;
