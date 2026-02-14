/**
 * CSRF Token Service
 * Manages CSRF token fetching and storage
 */
/**
 * CSRF Token Service
 */
declare class CsrfService {
    private token;
    private tokenExpiry;
    private fetchingPromise;
    /**
     * Get CSRF token from cache or fetch a new one
     */
    getToken(): Promise<string>;
    /**
     * Fetch a new CSRF token from the server
     */
    private fetchToken;
    /**
     * Clear cached CSRF token (useful for logout or token refresh)
     */
    clearToken(): void;
    /**
     * Check if a token is valid (not expired)
     */
    hasValidToken(): boolean;
}
export declare const csrfService: CsrfService;
export {};
