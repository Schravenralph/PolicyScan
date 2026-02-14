/**
 * Utility for retrying website generation operations with exponential backoff
 * Handles transient failures (network errors, 5xx server errors, rate limits) but not client errors (4xx)
 */

import { retryWithBackoff, isRetryableError } from './sessionRetry';

export interface WebsiteGenerationRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

const DEFAULT_CONFIG: WebsiteGenerationRetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 2000, // Start with 2 seconds for API operations
  maxDelayMs: 30000, // Max 30 seconds delay
  backoffMultiplier: 2,
  retryableStatusCodes: [500, 502, 503, 504, 429],
};

/**
 * Check if an error is retryable for website generation
 * Includes rate limit (429) and server errors (5xx)
 */
export function isWebsiteGenerationRetryableError(
  error: unknown,
  retryableStatusCodes: number[] = DEFAULT_CONFIG.retryableStatusCodes
): boolean {
  // Use base retryable error check
  if (isRetryableError(error, retryableStatusCodes)) {
    return true;
  }

  // Check for specific API errors
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    const status = response?.status;
    
    if (status === 429) {
      // Rate limit - always retryable
      return true;
    }

    // Check for OpenAI-specific errors
    const data = response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const errorData = (data as { error?: { type?: string; code?: string } }).error;
      if (errorData?.type === 'rate_limit_error' || errorData?.code === 'rate_limit_exceeded') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Retry website generation with exponential backoff
 * 
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWebsiteGeneration<T>(
  operation: () => Promise<T>,
  config: Partial<WebsiteGenerationRetryConfig> = {},
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Use the base retry utility but with website generation-specific error checking
  return retryWithBackoff(
    operation,
    finalConfig,
    onRetry
  );
}

/**
 * Extract error type for better error messages
 */
export function getWebsiteGenerationErrorType(error: unknown): {
  type: 'rate_limit' | 'api_error' | 'timeout' | 'network' | 'auth' | 'unknown';
  message: string;
  retryable: boolean;
} {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    const status = response?.status;
    const data = response?.data;

    if (status === 429) {
      return {
        type: 'rate_limit',
        message: 'Te veel verzoeken. Probeer het over een paar momenten opnieuw.',
        retryable: true,
      };
    }

    if (status === 401 || status === 403) {
      return {
        type: 'auth',
        message: 'API authenticatie mislukt. Controleer uw API keys.',
        retryable: false,
      };
    }

    if (status && status >= 500 && status < 600) {
      return {
        type: 'api_error',
        message: 'Server fout. Probeer het over een paar momenten opnieuw.',
        retryable: true,
      };
    }

    // Check for OpenAI-specific errors
    if (data && typeof data === 'object' && 'error' in data) {
      const errorData = (data as { error?: { type?: string; message?: string } }).error;
      if (errorData?.type === 'rate_limit_error') {
        return {
          type: 'rate_limit',
          message: errorData.message || 'Rate limit bereikt. Probeer het over een paar momenten opnieuw.',
          retryable: true,
        };
      }
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        message: 'Het genereren duurt te lang. Probeer het opnieuw.',
        retryable: true,
      };
    }
    if (message.includes('network') || message.includes('fetch')) {
      return {
        type: 'network',
        message: 'Netwerkfout. Controleer uw internetverbinding.',
        retryable: true,
      };
    }
  }

  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : 'Onbekende fout opgetreden.',
    retryable: false,
  };
}


