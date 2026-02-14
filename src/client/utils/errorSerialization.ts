/**
 * Error Serialization Utility
 * 
 * Safely serializes error objects, handling circular references and
 * formatting error details for display in the UI.
 */

/**
 * Safely serialize an error object, handling circular references
 */
export function serializeError(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  // Handle Error objects
  if (error instanceof Error) {
    return error.message || error.toString();
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle objects - use JSON.stringify with circular reference handling
  if (typeof error === 'object') {
    try {
      // Use a Set to track visited objects
      const visited = new WeakSet();
      
      const replacer = (_key: string, value: unknown) => {
        if (value === null || value === undefined) {
          return value;
        }
        
        if (typeof value === 'object') {
          if (visited.has(value as object)) {
            return '[Circular Reference]';
          }
          visited.add(value as object);
        }
        
        return value;
      };
      
      return JSON.stringify(error, replacer, 2);
    } catch (e) {
      // If serialization fails, return a fallback
      return `Error object: ${String(error)}`;
    }
  }

  return String(error);
}

/**
 * Format error details for display
 */
export function formatErrorDetails(error: unknown): {
  message: string;
  details?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message || 'Unknown error',
      details: error.name !== 'Error' ? error.name : undefined,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    return {
      message: errorObj.message as string || errorObj.error as string || 'Unknown error',
      details: serializeError(error),
    };
  }

  return {
    message: String(error),
  };
}


