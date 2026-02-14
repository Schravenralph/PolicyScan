/**
 * Centralized HTTP Client Configuration
 * 
 * Provides shared HTTP/HTTPS agents with connection pooling and a factory
 * function for creating configured axios instances. This ensures consistent
 * connection pooling, timeouts, and retry behavior across all HTTP requests.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import { logger } from '../utils/logger.js';
import { isRetryableError as isRetryableErrorUtil } from '../utils/retry.js';
import { CircuitBreakerManager } from '../services/infrastructure/CircuitBreaker.js';

// HTTP timeout constants for different scenarios
export const HTTP_TIMEOUTS = {
  SHORT: 5000,      // 5 seconds - quick API calls
  STANDARD: 30000,  // 30 seconds - standard operations
  LONG: 120000,     // 2 minutes - long-running operations
  VERY_LONG: 300000, // 5 minutes - very long operations (e.g., file downloads)
  EXTRA_LONG: 600000, // 10 minutes - for very slow APIs like Gemini with large contexts
} as const;

// Create HTTP agents with connection pooling
// These are shared across all HTTP clients to maximize connection reuse
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
  maxSockets: 50,        // Maximum number of sockets per host
  maxFreeSockets: 10,    // Maximum number of free sockets per host
  timeout: 60000,        // Socket timeout in milliseconds
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

// Export agents for use in other modules (e.g., GraphDB)
export { httpAgent, httpsAgent };

// Circuit breaker manager for HTTP requests
// Creates circuit breakers per service hostname to prevent cascading failures
const circuitBreakerManager = new CircuitBreakerManager();

/**
 * Get circuit breaker manager instance
 * Used for monitoring and stats
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
  return circuitBreakerManager;
}

/**
 * Create a configured axios instance with connection pooling and default settings
 * 
 * @param config - Optional axios configuration to merge with defaults
 * @returns Configured axios instance
 */
export function createHttpClient(config?: AxiosRequestConfig): AxiosInstance {
  const client = axios.create({
    timeout: HTTP_TIMEOUTS.STANDARD,
    httpAgent,
    httpsAgent,
    ...config,
  });

  // Add request interceptor to enforce timeout on all requests
  // This ensures that even if timeout is not explicitly set, a default timeout is applied
  client.interceptors.request.use((requestConfig) => {
    // If no timeout is set, use the default STANDARD timeout
    if (!requestConfig.timeout) {
      requestConfig.timeout = HTTP_TIMEOUTS.STANDARD;
      logger.debug(
        { url: requestConfig.url, method: requestConfig.method },
        'HTTP request without explicit timeout, using default STANDARD timeout (30s)'
      );
    }

    // Get service hostname for circuit breaker
    let serviceHostname = 'unknown';
    try {
      if (requestConfig.url) {
        const url = new URL(requestConfig.url, requestConfig.baseURL || 'http://localhost');
        serviceHostname = url.hostname;
      } else if (requestConfig.baseURL) {
        const url = new URL(requestConfig.baseURL);
        serviceHostname = url.hostname;
      }
    } catch (error) {
      // If URL parsing fails, use 'unknown'
      logger.debug({ error, url: requestConfig.url }, 'Failed to parse URL for circuit breaker');
    }

    // Store service hostname for response interceptor
    (requestConfig as AxiosRequestConfig & { _serviceHostname?: string })._serviceHostname = serviceHostname;

    // Store start time and timeout for monitoring
    const timeout = requestConfig.timeout || HTTP_TIMEOUTS.STANDARD;
    const startTime = Date.now();
    const warningThreshold = timeout * 0.8; // 80% threshold
    
    // Store metadata for response interceptor
    (requestConfig as AxiosRequestConfig & { _startTime?: number; _timeout?: number; _warningThreshold?: number; _warningLogged?: boolean })._startTime = startTime;
    (requestConfig as AxiosRequestConfig & { _startTime?: number; _timeout?: number; _warningThreshold?: number; _warningLogged?: boolean })._timeout = timeout;
    (requestConfig as AxiosRequestConfig & { _startTime?: number; _timeout?: number; _warningThreshold?: number; _warningLogged?: boolean })._warningThreshold = warningThreshold;
    (requestConfig as AxiosRequestConfig & { _startTime?: number; _timeout?: number; _warningThreshold?: number; _warningLogged?: boolean })._warningLogged = false;

    // Set up timeout warning timer
    const warningTimer = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      const configWithMetadata = requestConfig as AxiosRequestConfig & { _warningLogged?: boolean };
      if (!configWithMetadata._warningLogged) {
        configWithMetadata._warningLogged = true;
        logger.warn(
          {
            url: requestConfig.url,
            method: requestConfig.method,
            elapsed,
            timeout,
            percentageUsed: (elapsed / timeout) * 100,
          },
          'HTTP request approaching timeout (80% threshold)'
        );
      }
    }, warningThreshold);

    // Clear timer when request completes (handled in response interceptor)
    (requestConfig as AxiosRequestConfig & { _warningTimer?: NodeJS.Timeout })._warningTimer = warningTimer;

    return requestConfig;
  });

  // Add request interceptor to check circuit breaker state before making request
  client.interceptors.request.use(async (requestConfig) => {
    // Get service hostname for circuit breaker
    const serviceHostname = (requestConfig as AxiosRequestConfig & { _serviceHostname?: string })._serviceHostname || 'unknown';
    
    // Check circuit breaker state
    const breaker = circuitBreakerManager.getBreaker(serviceHostname);
    if (breaker.isOpen()) {
      logger.warn(
        {
          serviceHostname,
          url: requestConfig.url,
          method: requestConfig.method,
        },
        'Circuit breaker is OPEN - failing fast'
      );
      const circuitError = new Error(`Circuit breaker is OPEN for ${serviceHostname} - service is unavailable`);
      (circuitError as { code?: string }).code = 'ECIRCUITOPEN';
      return Promise.reject(circuitError);
    }

    return requestConfig;
  });

  // Add response interceptor for timeout monitoring and circuit breaker recording
  client.interceptors.response.use(
    (response) => {
      // Clear warning timer on successful response
      const config = response.config as AxiosRequestConfig & { _warningTimer?: NodeJS.Timeout; _startTime?: number; _timeout?: number; _serviceHostname?: string };
      if (config._warningTimer) {
        clearTimeout(config._warningTimer);
      }

      // Record success in circuit breaker
      if (config._serviceHostname && config._serviceHostname !== 'unknown') {
        try {
          const breaker = circuitBreakerManager.getBreaker(config._serviceHostname);
          breaker.recordSuccess();
        } catch (error) {
          // Circuit breaker error - log but don't fail the request
          logger.debug({ error, serviceHostname: config._serviceHostname }, 'Circuit breaker error on success');
        }
      }

      // Log duration if request took significant time
      if (config._startTime && config._timeout) {
        const duration = Date.now() - config._startTime;
        const percentageUsed = (duration / config._timeout) * 100;
        
        if (percentageUsed > 50) {
          logger.debug(
            {
              url: config.url,
              method: config.method,
              duration,
              timeout: config._timeout,
              percentageUsed,
            },
            'HTTP request completed'
          );
        }
      }

      return response;
    },
    (error: AxiosError) => {
      // Clear warning timer on error
      const config = error.config as AxiosRequestConfig & { _warningTimer?: NodeJS.Timeout; _startTime?: number; _timeout?: number; _serviceHostname?: string };
      if (config?._warningTimer) {
        clearTimeout(config._warningTimer);
      }

      // Record failure in circuit breaker
      if (config?._serviceHostname && config._serviceHostname !== 'unknown') {
        try {
          const breaker = circuitBreakerManager.getBreaker(config._serviceHostname);
          breaker.recordFailure();
          
          // Log if circuit opened
          if (breaker.isOpen()) {
            logger.warn(
              {
                serviceHostname: config._serviceHostname,
                url: config.url,
                method: config.method,
              },
              'Circuit breaker opened after failure'
            );
          }
        } catch (breakerError) {
          // Circuit breaker error - log but don't fail the request
          logger.debug({ error: breakerError, serviceHostname: config._serviceHostname }, 'Circuit breaker error on failure');
        }
      }

      // Log timeout errors
      if (config?._startTime && config?._timeout) {
        const duration = Date.now() - config._startTime;
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        
        if (isTimeout) {
          logger.error(
            {
              url: config.url,
              method: config.method,
              duration,
              timeout: config._timeout,
              percentageUsed: (duration / config._timeout) * 100,
            },
            'HTTP request timed out'
          );
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Default HTTP client instance
 * Use this for most HTTP requests throughout the application
 */
export const httpClient = createHttpClient();

// Add response interceptor for automatic retry on transient errors
httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig & { retryCount?: number; retryMax?: number };

    // Don't retry if retry count exceeded or if retry is disabled
    if (!config || config.retryCount === undefined) {
      config.retryCount = 0;
    }
    if (config.retryMax === undefined) {
      config.retryMax = 3; // Default: 3 retries
    }

    if (config.retryCount >= config.retryMax) {
      return Promise.reject(error);
    }

    // Check if error is retryable using centralized retry utility
    // This now includes 429 (rate limit) errors
    if (!isRetryableErrorUtil(error)) {
      return Promise.reject(error);
    }

    // Check for EPIPE and connection errors (client disconnection)
    const isConnectionError = 
      error.code === 'EPIPE' ||
      (error.code === 'ECONNRESET' && error.message?.includes('socket hang up'));
    
    // Don't retry on EPIPE if it's a client disconnection (not a server issue)
    if (isConnectionError) {
      return Promise.reject(error);
    }

    config.retryCount += 1;

    // Calculate delay with exponential backoff
    const initialDelay = 1000; // 1 second
    const multiplier = 2;
    const maxDelay = 30000; // 30 seconds
    let delay = Math.min(initialDelay * Math.pow(multiplier, config.retryCount - 1), maxDelay);

    // Check for Retry-After header (for rate limit errors)
    if (error.response?.status === 429 && error.response.headers) {
      const retryAfter = error.response.headers['retry-after'] || error.response.headers['Retry-After'];
      if (retryAfter) {
        const retryAfterValue = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
        const retryAfterSeconds = parseInt(retryAfterValue, 10);
        if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
          delay = Math.min(retryAfterSeconds * 1000, maxDelay); // Convert to milliseconds
          logger.warn({
            attempt: config.retryCount,
            maxRetries: config.retryMax,
            delay,
            retryAfter: retryAfterSeconds,
            url: config.url,
            method: config.method,
            status: error.response.status,
          }, 'Rate limit detected, using Retry-After header delay');
        }
      } else {
        logger.warn({
          attempt: config.retryCount,
          maxRetries: config.retryMax,
          delay,
          url: config.url,
          method: config.method,
          status: error.response.status,
        }, 'Rate limit error (429) without Retry-After header, using exponential backoff');
      }
    } else {
      logger.warn({
        attempt: config.retryCount,
        maxRetries: config.retryMax,
        delay,
        url: config.url,
        method: config.method,
        status: error.response?.status,
      }, 'HTTP request failed, retrying...');
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    return httpClient(config);
  }
);

/**
 * Check if an error is retryable
 * 
 * @deprecated Use the centralized isRetryableError from utils/retry.ts instead
 * This function is kept for backward compatibility but delegates to the centralized utility
 * 
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Delegate to centralized retry utility
  return isRetryableErrorUtil(error);
}

/**
 * Close HTTP agents and free up connections
 * This should be called during graceful shutdown to ensure all connections are properly closed
 */
export function closeHttpAgents(): void {
  try {
    httpAgent.destroy();
    logger.debug('HTTP agent destroyed');
  } catch (error) {
    logger.warn({ error }, 'Error destroying HTTP agent');
  }
  
  try {
    httpsAgent.destroy();
    logger.debug('HTTPS agent destroyed');
  } catch (error) {
    logger.warn({ error }, 'Error destroying HTTPS agent');
  }
}





