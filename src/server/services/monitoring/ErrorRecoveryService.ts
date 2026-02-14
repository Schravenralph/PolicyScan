/**
 * Error Recovery Service
 * 
 * Provides error classification, retry strategies, and recovery workflows
 * for the ScraperOrchestrator.
 */

export enum ErrorType {
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
  TEMPORARY = 'temporary',
  PERMANENT = 'permanent'
}

export interface ErrorClassification {
  type: ErrorType;
  retryable: boolean;
  maxRetries: number;
  retryDelay: number;
  description: string;
}

export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  recovered: boolean;
}

/**
 * Service for error classification and recovery strategies
 */
export class ErrorRecoveryService {
  private retryStrategies: Map<string, RetryStrategy> = new Map();

  constructor() {
    // Default retry strategies for different scraper types
    this.retryStrategies.set('default', {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '429', '503', '504']
    });

    this.retryStrategies.set('iplo', {
      maxAttempts: 3, // Reduced from 5 - excessive retries waste resources
      baseDelay: 2000,
      maxDelay: 20000,
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '429', '503', '504']
    });

    this.retryStrategies.set('website', {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '429', '503', '504']
    });

    this.retryStrategies.set('google', {
      maxAttempts: 2,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      retryableErrors: ['429', '503', '504']
    });
  }

  /**
   * Classify an error as recoverable or fatal
   */
  classifyError(error: unknown): ErrorClassification {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Type guard for error with code property
    interface ErrorWithCode extends Error {
      code?: string;
    }
    
    // Type guard for error with response property
    interface ErrorWithResponse extends Error {
      response?: { status?: number };
      statusCode?: number;
    }
    
    const errorCode = (error as ErrorWithCode)?.code || '';
    const statusCode = (error as ErrorWithResponse)?.response?.status || (error as ErrorWithResponse)?.statusCode;

    // Network errors - usually recoverable
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'ENOTFOUND') {
      return {
        type: ErrorType.TEMPORARY,
        retryable: true,
        maxRetries: 3,
        retryDelay: 2000,
        description: 'Network error - likely temporary'
      };
    }

    // HTTP 429 (Rate Limit) - recoverable with delay
    if (statusCode === 429) {
      return {
        type: ErrorType.TEMPORARY,
        retryable: true,
        maxRetries: 5,
        retryDelay: 5000,
        description: 'Rate limit exceeded - retry after delay'
      };
    }

    // HTTP 503/504 (Service Unavailable) - recoverable
    if (statusCode === 503 || statusCode === 504) {
      return {
        type: ErrorType.TEMPORARY,
        retryable: true,
        maxRetries: 3,
        retryDelay: 3000,
        description: 'Service unavailable - likely temporary'
      };
    }

    // HTTP 400 (Bad Request) - permanent
    if (statusCode === 400) {
      return {
        type: ErrorType.PERMANENT,
        retryable: false,
        maxRetries: 0,
        retryDelay: 0,
        description: 'Bad request - permanent error'
      };
    }

    // HTTP 404 (Not Found) - permanent
    if (statusCode === 404) {
      return {
        type: ErrorType.PERMANENT,
        retryable: false,
        maxRetries: 0,
        retryDelay: 0,
        description: 'Resource not found - permanent error'
      };
    }

    // HTTP 403 (Forbidden) - permanent
    if (statusCode === 403) {
      return {
        type: ErrorType.PERMANENT,
        retryable: false,
        maxRetries: 0,
        retryDelay: 0,
        description: 'Access forbidden - permanent error'
      };
    }

    // HTTP 401 (Unauthorized) - permanent
    if (statusCode === 401) {
      return {
        type: ErrorType.PERMANENT,
        retryable: false,
        maxRetries: 0,
        retryDelay: 0,
        description: 'Unauthorized - permanent error'
      };
    }

    // Timeout errors - recoverable
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEDOUT')) {
      return {
        type: ErrorType.TEMPORARY,
        retryable: true,
        maxRetries: 3,
        retryDelay: 2000,
        description: 'Timeout error - likely temporary'
      };
    }

    // Default: treat as recoverable but with caution
    return {
      type: ErrorType.RECOVERABLE,
      retryable: true,
      maxRetries: 2,
      retryDelay: 1000,
      description: 'Unknown error - attempting recovery'
    };
  }

  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    scraperType: string = 'default',
    context?: { url?: string; operation?: string }
  ): Promise<RecoveryResult<T>> {
    const strategy = this.retryStrategies.get(scraperType) || this.retryStrategies.get('default')!;
    let lastError: Error | undefined;
    let delay = strategy.baseDelay;
    let attemptCount = 0;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      attemptCount = attempt;
      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts: attempt,
          recovered: attempt > 1
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const classification = this.classifyError(error);

        // Don't retry if error is not retryable
        if (!classification.retryable || attempt >= strategy.maxAttempts) {
          break;
        }

        // Check if error is in retryable list
        const errorCode = this.getErrorCode(error);
        const statusCode = this.getStatusCode(error);
        const shouldRetry = strategy.retryableErrors.some(
          retryableError => 
            errorCode.includes(retryableError) || 
            String(statusCode) === retryableError ||
            (lastError && lastError.message.includes(retryableError))
        );

        if (!shouldRetry && !classification.retryable) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < strategy.maxAttempts) {
          await this.sleep(Math.min(delay, strategy.maxDelay));
          delay *= strategy.backoffMultiplier;
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attemptCount, // Return actual number of attempts, not maxAttempts
      recovered: false
    };
  }

  /**
   * Get retry strategy for a scraper type
   */
  getRetryStrategy(scraperType: string): RetryStrategy {
    return this.retryStrategies.get(scraperType) || this.retryStrategies.get('default')!;
  }

  /**
   * Set custom retry strategy for a scraper type
   */
  setRetryStrategy(scraperType: string, strategy: RetryStrategy): void {
    this.retryStrategies.set(scraperType, strategy);
  }

  /**
   * Safely extract error code from unknown error
   */
  private getErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return typeof error.code === 'string' ? error.code : '';
    }
    return '';
  }

  /**
   * Safely extract status code from unknown error
   */
  private getStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      // Check for axios-style error: error.response.status
      if ('response' in error && 
          error.response && 
          typeof error.response === 'object' && 
          'status' in error.response &&
          typeof error.response.status === 'number') {
        return error.response.status;
      }
      // Check for direct statusCode property
      if ('statusCode' in error && typeof error.statusCode === 'number') {
        return error.statusCode;
      }
    }
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}












