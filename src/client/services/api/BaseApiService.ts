// Import CSRF service at the top - static import is more reliable than dynamic imports
import { csrfService } from '../csrfService';
// Import the normalized API URL utility to ensure consistent URL handling
import { getApiBaseUrl, isSameOrigin, isDockerInternalIp, normalizeToProxyUrl, clearApiUrlCache } from '../../utils/apiUrl';

// Get CSRF service - returns the statically imported service
const getCsrfService = async () => {
  return csrfService;
};

/**
 * Retry configuration for API requests
 */
interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
  retryableErrors?: string[];
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 1000,        // 1 second initial delay
  backoffMultiplier: 2,     // Exponential: 1s, 2s, 4s
  retryableStatusCodes: [500, 502, 503, 504], // Note: 429 excluded
  retryableErrors: ['timeout', 'network', 'fetch', 'econnreset', 'etimedout', 'econnrefused', 'enotfound']
};

/**
 * Check if an error is retryable based on the retry configuration
 */
function isRetryableError(error: unknown, config: Required<RetryConfig>): boolean {
  // Skip retry for 429 (rate limit) - already handled separately
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      return false;
    }
  }
  
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status === 429) {
      return false;
    }
  }
  
  // Skip retry for 4xx client errors (except 429 which is already handled)
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }
  
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status && response.status >= 400 && response.status < 500) {
      return false;
    }
  }
  
  // Check for HTTP status codes
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && config.retryableStatusCodes.includes(statusCode)) {
      return true;
    }
  }
  
  // Check for response status codes
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status && config.retryableStatusCodes.includes(response.status)) {
      return true;
    }
  }
  
  // Check error message for retryable patterns
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (config.retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()))) {
      return true;
    }
  }
  
  // Check for network errors (TypeError from fetch)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  // Check for AbortError (timeout) - retryable
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  
  return false;
}

/**
 * Normalize retry configuration based on method and options
 * GET requests default to retry enabled, mutations require explicit opt-in
 */
function normalizeRetryConfig(
  retryOption: RetryConfig | boolean | undefined,
  method: string
): Required<RetryConfig> | null {
  // If explicitly false, disable retry
  if (retryOption === false) {
    return null;
  }
  
  // For GET requests, default to retry enabled
  if (retryOption === undefined && method === 'GET') {
    return DEFAULT_RETRY_CONFIG;
  }
  
  // For mutations, require explicit opt-in
  if (retryOption === undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }
  
  // If true, use defaults
  if (retryOption === true) {
    return DEFAULT_RETRY_CONFIG;
  }
  
  // If RetryConfig object, merge with defaults
  if (typeof retryOption === 'object') {
    return {
      maxRetries: retryOption.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
      retryDelay: retryOption.retryDelay ?? DEFAULT_RETRY_CONFIG.retryDelay,
      backoffMultiplier: retryOption.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
      retryableStatusCodes: retryOption.retryableStatusCodes ?? DEFAULT_RETRY_CONFIG.retryableStatusCodes,
      retryableErrors: retryOption.retryableErrors ?? DEFAULT_RETRY_CONFIG.retryableErrors
    };
  }
  
  return null;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(attempt: number, config: Required<RetryConfig>): number {
  // Exponential backoff: delay = retryDelay * (backoffMultiplier ^ attempt)
  const baseDelay = config.retryDelay * Math.pow(config.backoffMultiplier, attempt);
  
  // Add jitter (10% random variation) to prevent thundering herd
  const jitter = baseDelay * 0.1 * Math.random();
  const delay = baseDelay + jitter;
  
  // Cap at reasonable maximum (30 seconds)
  return Math.min(delay, 30000);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build full URL from base URL and endpoint, handling edge cases
 */
function buildUrl(apiBaseUrl: string, endpoint: string): string {
  // Absolute URL - use as-is
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  
  // Check if endpoint already includes base URL with proper boundary check
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  if (endpoint === base || endpoint.startsWith(`${base}/`)) {
    return endpoint;
  }
  
  // Ensure proper joining: apiBaseUrl might end with /, endpoint might start with /
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}

/**
 * Build headers with authentication and CSRF tokens, merging with custom headers
 */
function buildHeaders(
  customHeaders?: HeadersInit,
  token?: string | null,
  csrfToken?: string
): Headers {
  const headers = new Headers(customHeaders);
  
  // Set Content-Type if not already set
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  // Add Authorization token if available
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Add CSRF token if available
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  
  return headers;
}

/**
 * Fetch with timeout - creates its own controller and timer
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Parse error response from API
 */
async function parseErrorResponse(
  response: Response
): Promise<{ data: unknown; status: number }> {
  const text = await response.text();
  let errorData: unknown;
  try {
    errorData = text ? JSON.parse(text) : { message: response.statusText };
  } catch {
    errorData = { message: response.statusText };
  }
  return { data: errorData, status: response.status };
}

/**
 * Create API error object with consistent structure
 */
async function toApiError(
  errorData: unknown,
  response: Response,
  endpoint: string,
  method: string,
  apiBaseUrl: string
): Promise<Error & {
  response?: { status: number; data: unknown; url?: string };
  code?: string;
  statusCode?: number;
  endpoint?: string;
  method?: string;
}> {
  const { parseApiErrorResponse } = await import('../../utils/errorHandler');
  const errorInfo = parseApiErrorResponse(
    typeof errorData === 'object' && errorData !== null
      ? { ...(errorData as { code?: string; message?: string; statusCode?: number }), statusCode: response.status }
      : { message: response.statusText, statusCode: response.status }
  );

  const error = new Error(errorInfo.message || `API Error: ${response.status}`) as Error & {
    response?: { status: number; data: unknown; url?: string };
    code?: string;
    statusCode?: number;
    endpoint?: string;
    method?: string;
  };
  
  const fullUrl = buildUrl(apiBaseUrl, endpoint);
  error.response = {
    status: response.status,
    data: errorData,
    url: fullUrl,
  };
  error.code = errorInfo.code;
  error.statusCode = errorInfo.statusCode;
  error.endpoint = endpoint;
  error.method = method;
  
  return error;
}

/**
 * Base API service with common functionality for all domain-specific services
 */
export abstract class BaseApiService {
  /**
   * Get authentication token from localStorage
   * Safe for non-browser contexts (SSR, test runners, privacy contexts)
   */
  protected getAuthToken(): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    } catch {
      return null;
    }
  }

  /**
   * Generic request method with error handling, authentication, and retry logic
   * 
   * Note: GET requests default to retry enabled. For GET endpoints that trigger
   * side effects (report generation, export kickoffs), explicitly set retry: false
   * to prevent duplicate work.
   */
  protected async request<T>(
    endpoint: string,
    options?: RequestInit & { 
      responseType?: 'json' | 'blob'; 
      timeout?: number;
      retry?: RetryConfig | boolean; // true = use defaults, false = no retry, object = custom config
    }
  ): Promise<T> {
    // Get API base URL dynamically on each request to ensure proper normalization
    // This ensures Docker internal IPs and remote access scenarios are handled correctly
    let apiBaseUrl = getApiBaseUrl();
    
    // CRITICAL: Check if the base URL itself points to Vite dev server
    // This catches misconfigurations before building the full URL
    if (apiBaseUrl.startsWith('http') && isSameOrigin(apiBaseUrl)) {
      console.error(
        `[BaseApiService] CRITICAL: API base URL (${apiBaseUrl}) points to Vite dev server. ` +
        `Normalizing to /api. This indicates VITE_API_URL is misconfigured. ` +
        `Fix: Set VITE_API_URL=/api in your .env file and restart the dev server.`
      );
      apiBaseUrl = '/api';
      clearApiUrlCache(); // Force cache refresh
    }
    
    const token = this.getAuthToken();
    
    // Extract custom options, ensuring retry doesn't leak into fetch()
    const {
      responseType: responseTypeOption,
      timeout,
      retry: _retry,
      headers: customHeaders,
      signal: _ignoredSignal,
      ...restFetchOptions
    } = options as RequestInit & { 
      responseType?: 'json' | 'blob'; 
      timeout?: number;
      retry?: RetryConfig | boolean;
    } || {};
    
    const responseType = responseTypeOption || 'json';
    const method = restFetchOptions.method || 'GET';
    
    // Default timeout: 180 seconds (3 minutes) - longer than proxy/server timeouts
    // This ensures client timeout happens after proxy timeout, providing better error messages
    const requestTimeout = timeout || 180000;

    // Get CSRF token for mutation requests (POST, PATCH, PUT, DELETE)
    let csrfToken: string | undefined;
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      try {
        const csrf = await getCsrfService();
        csrfToken = await csrf.getToken();
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('Failed to get CSRF token:', error);
        }
        // Continue without CSRF token - backend will reject if required
      }
    }

    // Build full URL using helper function
    let fullUrl = buildUrl(apiBaseUrl, endpoint);

    // CRITICAL SAFEGUARD: Check if URL points to Vite dev server (same origin) FIRST
    // This is the most common misconfiguration and should be caught immediately
    // The Vite dev server doesn't have backend routes, so this will always fail
    // ALWAYS check this, not just in dev mode, to catch misconfigurations
    if (fullUrl.startsWith('http')) {
      const isSame = isSameOrigin(fullUrl);
      
      // Also check if port is 5173 (Vite default port) as a fallback
      let urlPort = '';
      try {
        const urlObj = new URL(fullUrl);
        urlPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      } catch {
        // URL parsing failed, continue
      }
      const isVitePort = urlPort === '5173' || fullUrl.includes(':5173');
      
      if (isSame || (isVitePort && typeof window !== 'undefined' && window.location.port === '5173')) {
        console.error(
          `[BaseApiService] CRITICAL: Detected Vite dev server URL in request (${fullUrl}). ` +
          `The Vite dev server doesn't have backend routes. ` +
          `Normalizing to use Vite proxy (/api) instead. ` +
          `This indicates VITE_API_URL is misconfigured. ` +
          `Fix: Set VITE_API_URL=/api in your .env file and restart the dev server.`
        );
        fullUrl = normalizeToProxyUrl(fullUrl);
        console.log('[BaseApiService] Normalized URL to:', fullUrl);
        
        // Clear the API URL cache to force recomputation with correct value
        clearApiUrlCache();
      }
    }

    // CRITICAL SAFEGUARD: Double-check for Docker internal IPs before making request
    // This prevents any edge cases where normalization might have been bypassed
    // Docker internal IPs (172.17.x.x - 172.31.x.x) cannot be accessed from browsers
    if (isDockerInternalIp(fullUrl)) {
      if (import.meta.env.DEV) {
        console.error(
          `[BaseApiService] CRITICAL: Detected Docker internal IP in URL (${fullUrl}). ` +
          `Browsers cannot connect to Docker internal IPs. ` +
          `Normalizing to use Vite proxy (/api) instead. ` +
          `This indicates VITE_API_URL may be misconfigured. ` +
          `Fix: Set VITE_API_URL=/api in your .env file.`
        );
      }
      fullUrl = normalizeToProxyUrl(fullUrl);
    }

    try {
      // Build headers properly - extract from fetchOptions to prevent overwrite
      const headers = buildHeaders(customHeaders, token, csrfToken);
      
      // Use fetchWithTimeout helper to ensure timeout is always applied
      const response = await fetchWithTimeout(fullUrl, {
        ...restFetchOptions,
        headers,
      }, requestTimeout);

      if (!response.ok) {
        // Parse error response using helper
        let { data: errorData } = await parseErrorResponse(response);

        // Handle rate limit errors (429) - fail immediately, don't retry
        if (response.status === 429) {
          const error = await toApiError(
            errorData,
            response,
            endpoint,
            method,
            apiBaseUrl
          );
          error.statusCode = 429;
          throw error;
        }

        // Handle CSRF token errors - clear token and retry once
        if (response.status === 403) {
          // Check if it's a session expiry error (missing _csrf secret cookie)
          const isSessionExpired = 
            typeof errorData === 'object' &&
            errorData !== null &&
            (
              (errorData as { message?: string }).message?.includes('Session invalid or expired') ||
              (errorData as { error?: string }).error?.includes('Session invalid or expired')
            );

          if (isSessionExpired) {
            // Clear CSRF token and fetch a new one (this will set the _csrf secret cookie)
            const csrf = await getCsrfService();
            csrf.clearToken();
            
            // Retry with new CSRF token (fetching the token will establish the session)
            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
              try {
                const newCsrfToken = await csrf.getToken();
                // Use fetchWithTimeout to ensure timeout is applied to retry
                // Use buildUrl to ensure consistent URL building
                const retryHeaders = buildHeaders(customHeaders, token, newCsrfToken);
                const retryResponse = await fetchWithTimeout(
                  fullUrl,
                  {
                    ...restFetchOptions,
                    headers: retryHeaders,
                  },
                  requestTimeout
                );

                if (retryResponse.ok) {
                  if (retryResponse.status === 204) {
                    return {} as T;
                  }
                  if (responseType === 'blob') {
                    return retryResponse.blob() as T;
                  }
                  return retryResponse.json();
                }
              } catch (retryError) {
                // Retry failed, fall through to error handling
                // If it's an AbortError from timeout, we'll handle it below
                if (!(retryError instanceof Error && retryError.name === 'AbortError')) {
                  // For other errors, fall through to error handling
                }
              }
            }
          }

          // Check if it's a CSRF error (token verification failed or token missing)
          const isCsrfError = 
            typeof errorData === 'object' &&
            errorData !== null &&
            (
              (errorData as { error?: string }).error?.includes('CSRF') ||
              (errorData as { message?: string }).message?.includes('CSRF')
            );

          if (isCsrfError) {
            // Clear CSRF token and retry once
            const csrf = await getCsrfService();
            csrf.clearToken();
            
            // Retry with new CSRF token
            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
              try {
                const newCsrfToken = await csrf.getToken();
                // Use fetchWithTimeout to ensure timeout is applied to retry
                // Use buildUrl to ensure consistent URL building
                const retryHeaders = buildHeaders(customHeaders, token, newCsrfToken);
                const retryResponse = await fetchWithTimeout(
                  fullUrl,
                  {
                    ...restFetchOptions,
                    headers: retryHeaders,
                  },
                  requestTimeout
                );

                if (retryResponse.ok) {
                  if (retryResponse.status === 204) {
                    return {} as T;
                  }
                  if (responseType === 'blob') {
                    return retryResponse.blob() as T;
                  }
                  return retryResponse.json();
                }
              } catch (retryError) {
                // Retry failed, fall through to error handling
                // If it's an AbortError from timeout, we'll handle it below
                if (!(retryError instanceof Error && retryError.name === 'AbortError')) {
                  // For other errors, fall through to error handling
                }
              }
            }
          }
        }

        // Check for 404 errors that might indicate misconfiguration
        // (request sent to Vite dev server instead of backend via proxy)
        let isViteDevServer404 = false;
        if (response.status === 404 && import.meta.env.DEV) {
          // Check if response is non-JSON (Vite dev server returns HTML for 404, not JSON)
          const contentType = response.headers.get('content-type') || '';
          const isNonJsonResponse = !contentType.includes('application/json');
          
          // Check if URL points to Vite dev server using shared utility
          const urlPointsToVite = isSameOrigin(fullUrl);
          
          // Also check if URL string contains :5173 as a fallback (for edge cases)
          const urlContainsVitePort = fullUrl.includes(':5173');
          
          // If we have a non-JSON 404 response and URL points to Vite dev server, it's likely a misconfiguration
          if (isNonJsonResponse && (urlPointsToVite || urlContainsVitePort)) {
            isViteDevServer404 = true;
            console.error(
              '[BaseApiService] 404 error: Request was made to Vite dev server instead of backend. ' +
              'This usually means VITE_API_URL is misconfigured. ' +
              'Fix: Set VITE_API_URL=/api in your .env file to use the Vite proxy.'
            );
            // Enhance error data to indicate this is a Vite dev server issue
            if (typeof errorData === 'object' && errorData !== null) {
              (errorData as { message?: string; isViteDevServer404?: boolean }).isViteDevServer404 = true;
              (errorData as { message?: string }).message = 
                'API request failed: VITE_API_URL may be misconfigured. ' +
                'The request was sent to the Vite dev server instead of the backend. ' +
                'Fix: Set VITE_API_URL=/api in your .env file to use the Vite proxy.';
            } else {
              errorData = {
                message: 'API request failed: VITE_API_URL may be misconfigured. ' +
                  'The request was sent to the Vite dev server instead of the backend. ' +
                  'Fix: Set VITE_API_URL=/api in your .env file to use the Vite proxy.',
                isViteDevServer404: true,
              };
            }
          }
        }

        // Use centralized error parsing - always includes statusCode
        const error = await toApiError(errorData, response, endpoint, method, apiBaseUrl);
        
        // Add flag to error object for easier detection downstream
        if (isViteDevServer404) {
          (error as { isViteDevServer404?: boolean }).isViteDevServer404 = true;
          // Enhance error message to make it clear this is a configuration issue
          error.message = 'API request failed: VITE_API_URL may be misconfigured. ' +
            'The request was sent to the Vite dev server instead of the backend. ' +
            'Fix: Set VITE_API_URL=/api in your .env file to use the Vite proxy.';
        }
        
        throw error;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      if (responseType === 'blob') {
        return response.blob() as T;
      }

      return response.json();
    } catch (error) {
      // Check if retry is enabled and error is retryable
      const retryConfig = normalizeRetryConfig(options?.retry, method);
      
      // Skip retry for errors that were already handled (429, CSRF 403)
      const errorStatus = (error as { statusCode?: number; response?: { status?: number } })?.statusCode ||
                         (error as { response?: { status?: number } })?.response?.status;
      
      const isAlreadyHandled = errorStatus === 429 || errorStatus === 403;
      
      if (retryConfig && !isAlreadyHandled && isRetryableError(error, retryConfig)) {
        // Attempt retry with exponential backoff
        let lastError = error;
        
        for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
          const delay = calculateRetryDelay(attempt, retryConfig);
          
          if (import.meta.env.DEV) {
            console.warn(
              `[BaseApiService] Retrying ${method} ${endpoint} (attempt ${attempt + 1}/${retryConfig.maxRetries}) after ${Math.round(delay)}ms`,
              error instanceof Error ? error.message : String(error)
            );
          }
          
          await sleep(delay);
          
          try {
            // Re-fetch CSRF token if needed for mutations
            let retryCsrfToken = csrfToken;
            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
              try {
                const csrf = await getCsrfService();
                retryCsrfToken = await csrf.getToken();
              } catch (csrfError) {
                if (import.meta.env.DEV) {
                  console.warn('Failed to get CSRF token for retry:', csrfError);
                }
                // Continue without CSRF token - backend will reject if required
              }
            }
            
            // Use helpers for consistent URL building and timeout handling
            const retryHeaders = buildHeaders(customHeaders, token, retryCsrfToken);
            const retryResponse = await fetchWithTimeout(
              fullUrl,
              {
                ...restFetchOptions,
                headers: retryHeaders,
              },
              requestTimeout
            );
            
            if (!retryResponse.ok) {
              // Parse error response - always includes statusCode
              const { data: errorData } = await parseErrorResponse(retryResponse);
              
              // Handle rate limit errors (429) - fail immediately, don't retry further
              if (retryResponse.status === 429) {
                const rateLimitError = await toApiError(
                  errorData,
                  retryResponse,
                  endpoint,
                  method,
                  apiBaseUrl
                );
                rateLimitError.statusCode = 429;
                throw rateLimitError;
              }
              
              // Create error with statusCode always included
              const httpError = await toApiError(
                errorData,
                retryResponse,
                endpoint,
                method,
                apiBaseUrl
              );
              
              // Check if this error is still retryable
              if (attempt < retryConfig.maxRetries - 1 && isRetryableError(httpError, retryConfig)) {
                lastError = httpError;
                continue; // Retry again
              }
              
              throw httpError;
            }
            
            // Success - handle response
            if (retryResponse.status === 204) {
              return {} as T;
            }
            
            if (responseType === 'blob') {
              return retryResponse.blob() as T;
            }
            
            return retryResponse.json();
          } catch (retryError) {
            lastError = retryError;
            
            // Check if error is still retryable
            if (attempt < retryConfig.maxRetries - 1 && isRetryableError(retryError, retryConfig)) {
              continue; // Retry again
            }
            
            // Not retryable or max retries reached, break and fall through to error handling
            break;
          }
        }
        
        // All retries exhausted, use last error
        const finalError = lastError;
        
        // Handle AbortError (timeout)
        if (finalError instanceof Error && finalError.name === 'AbortError') {
          throw new Error(
            `Request timeout after ${requestTimeout / 1000} seconds. The server may be processing a long-running operation. Please try again or check the server status.`
          );
        }
        
        // Enhanced error handling for network issues
        if (finalError instanceof TypeError && finalError.message.includes('fetch')) {
          throw new Error(
            `Failed to connect to backend. Is the server running at ${apiBaseUrl}?`
          );
        }
        
        // Handle socket hang up and EPIPE errors (connection closed unexpectedly)
        if (finalError instanceof Error) {
          const errorMessage = finalError.message.toLowerCase();
          if (errorMessage.includes('socket hang up') || 
              errorMessage.includes('econnreset') || 
              errorMessage.includes('socket hangup') ||
              errorMessage.includes('epipe') ||
              errorMessage.includes('broken pipe')) {
            throw new Error(
              `Connection to server was closed unexpectedly. This may occur if the request takes longer than the proxy timeout (${requestTimeout / 1000}s) or if the client disconnected. Please try again or use a polling endpoint for long-running operations.`
            );
          }
        }
        
        throw finalError;
      }
      
      // Handle AbortError (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${requestTimeout / 1000} seconds. The server may be processing a long-running operation. Please try again or check the server status.`
        );
      }
      
      // Enhanced error handling for network issues
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Failed to connect to backend. Is the server running at ${apiBaseUrl}?`
        );
      }
      
      // Handle socket hang up and EPIPE errors (connection closed unexpectedly)
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('socket hang up') || 
            errorMessage.includes('econnreset') || 
            errorMessage.includes('socket hangup') ||
            errorMessage.includes('epipe') ||
            errorMessage.includes('broken pipe')) {
          throw new Error(
            `Connection to server was closed unexpectedly. This may occur if the request takes longer than the proxy timeout (${requestTimeout / 1000}s) or if the client disconnected. Please try again or use a polling endpoint for long-running operations.`
          );
        }
      }
      
      throw error;
    }
  }

  /**
   * GET request
   */
  protected async get<T>(endpoint: string, options?: { responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * POST request
   */
  protected async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  protected async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  protected async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  protected async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }
}

