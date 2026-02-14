/**
 * CSRF Token Service
 * Manages CSRF token fetching and storage
 */

import { getApiBaseUrl } from '../utils/apiUrl';

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_EXPIRY_KEY = 'csrf_token_expiry';
const CSRF_TOKEN_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * CSRF Token Service
 */
class CsrfService {
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private fetchingPromise: Promise<string> | null = null;

  /**
   * Get CSRF token from cache or fetch a new one
   */
  async getToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    // Check localStorage for cached token
    const cachedToken = localStorage.getItem(CSRF_TOKEN_KEY);
    const cachedExpiry = localStorage.getItem(CSRF_TOKEN_EXPIRY_KEY);
    
    if (cachedToken && cachedExpiry && Date.now() < parseInt(cachedExpiry, 10)) {
      this.token = cachedToken;
      this.tokenExpiry = parseInt(cachedExpiry, 10);
      return this.token;
    }

    // If already fetching, wait for that promise
    if (this.fetchingPromise) {
      return this.fetchingPromise;
    }

    // Fetch new token
    this.fetchingPromise = this.fetchToken();
    try {
      const token = await this.fetchingPromise;
      return token;
    } finally {
      this.fetchingPromise = null;
    }
  }

  /**
   * Fetch a new CSRF token from the server
   */
  private async fetchToken(): Promise<string> {
    try {
      const apiUrl = `${getApiBaseUrl()}/csrf-token`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include', // Include cookies if using session-based auth
      });

      if (!response.ok) {
        // Try to get more detailed error information
        let errorMessage = `Failed to fetch CSRF token: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = `Failed to fetch CSRF token: ${errorData.message}`;
          }
          if (errorData.hint) {
            errorMessage += ` (${errorData.hint})`;
          }
        } catch {
          // If error response is not JSON, use status text
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const token = data.csrfToken || response.headers.get('X-CSRF-Token');

      if (!token) {
        throw new Error('CSRF token not found in response');
      }

      // Cache the token
      this.token = token;
      this.tokenExpiry = Date.now() + CSRF_TOKEN_DURATION;
      
      // Store in localStorage
      localStorage.setItem(CSRF_TOKEN_KEY, token);
      localStorage.setItem(CSRF_TOKEN_EXPIRY_KEY, this.tokenExpiry.toString());

      return token;
    } catch (error) {
      // Clear cache on error
      this.token = null;
      this.tokenExpiry = null;
      localStorage.removeItem(CSRF_TOKEN_KEY);
      localStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
      
      // Enhance error message for network issues
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Failed to connect to backend API. Please ensure the backend server is running and accessible at ${getApiBaseUrl()}. ` +
          `If you just started the backend, try refreshing the page or restarting the Vite dev server.`
        );
      }
      throw error;
    }
  }

  /**
   * Clear cached CSRF token (useful for logout or token refresh)
   */
  clearToken(): void {
    this.token = null;
    this.tokenExpiry = null;
    localStorage.removeItem(CSRF_TOKEN_KEY);
    localStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
  }

  /**
   * Check if a token is valid (not expired)
   */
  hasValidToken(): boolean {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return true;
    }
    
    const cachedToken = localStorage.getItem(CSRF_TOKEN_KEY);
    const cachedExpiry = localStorage.getItem(CSRF_TOKEN_EXPIRY_KEY);
    return !!(cachedToken && cachedExpiry && Date.now() < parseInt(cachedExpiry, 10));
  }
}

// Export singleton instance
export const csrfService = new CsrfService();

