/**
 * Shared utility for API URL resolution
 * Ensures consistent API URL handling across the application
 * Prevents direct connections to unreachable hosts when Vite proxy is available
 */
/**
 * Clear the API URL cache (useful for testing or when env vars change)
 */
export declare function clearApiUrlCache(): void;
/**
 * Get the API base URL with validation and normalization
 *
 * Rules:
 * - If VITE_API_URL is empty, default to '/api' (use Vite proxy)
 * - If VITE_API_URL is a relative URL (starts with '/'), use it as-is
 * - If VITE_API_URL is an absolute URL:
 *   - In development (Vite dev server), proxy if the target host is not browser-reachable
 *     (localhost, private IP ranges, Docker bridge IPs)
 *   - In production or when target is browser-reachable, use the absolute URL
 * - Test environment override: check globalThis.__VITE_API_URL__ first (preferred),
 *   or globalThis.import.meta.env.VITE_API_URL (for backward compatibility with existing test setup)
 *
 * Results are cached to prevent repeated computation and warning spam.
 */
export declare function getApiBaseUrl(): string;
/**
 * Check if we're using the Vite proxy (relative URL)
 */
export declare function isUsingProxy(): boolean;
/**
 * Check if a URL points to the Vite dev server (same origin)
 * Handles localhost/127.0.0.1 equivalence and port normalization
 */
export declare function isSameOrigin(url: string): boolean;
/**
 * Check if a URL contains a Docker internal IP address
 * Docker bridge network uses 172.17.0.0/16 through 172.31.0.0/16
 */
export declare function isDockerInternalIp(url: string): boolean;
/**
 * Normalize a URL to use the Vite proxy (/api)
 * Extracts the endpoint path and ensures it starts with /api
 */
export declare function normalizeToProxyUrl(url: string): string;
/**
 * Check if we're using a direct connection to localhost:4000
 */
export declare function isDirectConnection(): boolean;
