/**
 * Utility functions for categorizing and handling wizard session creation errors
 */

import type { WizardSessionError } from '../components/wizard/WizardSessionErrorDialog';

/**
 * Categorize an error for wizard session creation
 */
export function categorizeSessionError(error: unknown): WizardSessionError {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const message = errorObj.message.toLowerCase();
  
  // Network errors
  if (
    errorObj instanceof TypeError && 
    (errorObj.message.includes('fetch') || errorObj.message.includes('network'))
  ) {
    return {
      message: errorObj.message,
      code: 'NETWORK_ERROR',
      retryable: true,
      isNetworkError: true,
    };
  }

  // Connection refused
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return {
      message: errorObj.message,
      code: 'ECONNREFUSED',
      retryable: true,
      isNetworkError: true,
    };
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out') || errorObj.name === 'TimeoutError' || errorObj.name === 'AbortError') {
    return {
      message: errorObj.message,
      code: 'TIMEOUT',
      retryable: true,
      isTimeoutError: true,
    };
  }

  // HTTP errors from API
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    const status = response?.status;

    if (status !== undefined) {
      // Server errors (5xx) - retryable
      if (status >= 500 && status < 600) {
        return {
          message: errorObj.message,
          code: `HTTP_${status}`,
          retryable: true,
          isServerError: true,
        };
      }

      // Rate limit (429) - retryable
      if (status === 429) {
        return {
          message: errorObj.message,
          code: 'HTTP_429',
          retryable: true,
          isServerError: true,
        };
      }

      // Client errors (4xx) - not retryable
      if (status >= 400 && status < 500) {
        return {
          message: errorObj.message,
          code: `HTTP_${status}`,
          retryable: false,
        };
      }
    }
  }

  // Socket errors
  if (
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('epipe') ||
    message.includes('broken pipe')
  ) {
    return {
      message: errorObj.message,
      code: 'CONNECTION_ERROR',
      retryable: true,
      isNetworkError: true,
    };
  }

  // Default - unknown error, assume not retryable
  return {
    message: errorObj.message,
    code: 'UNKNOWN_ERROR',
    retryable: false,
  };
}


