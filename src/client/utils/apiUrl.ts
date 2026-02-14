/**
 * Shared utility for API URL resolution
 * Ensures consistent API URL handling across the application
 * Prevents direct connections to unreachable hosts when Vite proxy is available
 */

interface GlobalWithViteApiUrl {
  __VITE_API_URL__?: string;
  import?: {
    meta?: {
      env?: {
        VITE_API_URL?: string;
      };
    };
  };
}

/**
 * Check if a hostname is in a private IP range or loopback
 * Includes: localhost, 127.0.0.1, ::1, 10.x.x.x, 192.168.x.x, 172.16-31.x.x
 */
function isPrivateHostname(hostname: string): boolean {
  // Loopback addresses
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return true;
  }

  // IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4Match) {
    // Not an IPv4 address - could be hostname, IPv6, etc.
    // For hostnames like "my-mac.local", we can't determine if they're private
    // without DNS lookup, so we'll treat them as potentially reachable
    return false;
  }

  const a = Number(ipv4Match[1]);
  const b = Number(ipv4Match[2]);

  // 10.0.0.0/8
  if (a === 10) return true;
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

/**
 * Check if a hostname is in the Docker bridge network range
 * Docker bridge commonly uses 172.17.0.0/16 through 172.31.0.0/16
 * This is a subset of the private range, but we call it out explicitly
 */
function isDockerBridgeIp(hostname: string): boolean {
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4Match) return false;
  
  const a = Number(ipv4Match[1]);
  const b = Number(ipv4Match[2]);
  
  // 172.17.0.0/16 through 172.31.0.0/16
  return a === 172 && b >= 17 && b <= 31;
}

/**
 * Warn once helper to prevent log spam
 */
const warnedUrls = new Set<string>();
function warnOnce(message: string, key: string) {
  if (!warnedUrls.has(key)) {
    console.warn(message);
    warnedUrls.add(key);
  }
}

// Cache the computed URL to prevent repeated computation and warnings
let cachedApiBaseUrl: string | null = null;
let cacheKey: string | null = null;

/**
 * Clear the API URL cache (useful for testing or when env vars change)
 */
export function clearApiUrlCache(): void {
  cachedApiBaseUrl = null;
  cacheKey = null;
  warnedUrls.clear();
}

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
export function getApiBaseUrl(): string {
  // Check for test override: prefer __VITE_API_URL__ (cleaner), fall back to globalThis.import.meta.env (for backward compatibility)
  const globalWithVite = globalThis as unknown as GlobalWithViteApiUrl;
  const globalOverride = globalWithVite.__VITE_API_URL__ ?? globalWithVite.import?.meta?.env?.VITE_API_URL;
  const envUrl = import.meta.env.VITE_API_URL;
  // Include window.location in cache key to ensure cache is invalidated when location changes
  const locationKey = typeof window !== 'undefined' ? `${window.location.hostname}:${window.location.port}` : '';
  const currentKey = `${globalOverride ?? ''}-${envUrl ?? ''}-${locationKey}`;
  
  // Return cached value if available and key matches
  if (cachedApiBaseUrl !== null && cacheKey === currentKey) {
    return cachedApiBaseUrl;
  }
  
  // Compute new value
  const raw = (globalOverride ?? envUrl ?? '').trim();
  
  // If empty, default to proxy
  if (!raw) {
    cachedApiBaseUrl = '/api';
    cacheKey = currentKey;
    return cachedApiBaseUrl;
  }
  
  // If relative URL, use as-is
  if (raw.startsWith('/')) {
    cachedApiBaseUrl = raw;
    cacheKey = currentKey;
    return cachedApiBaseUrl;
  }
  
  // Parse absolute URL
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Invalid URL format - safest fallback is proxy
    warnOnce(
      `[API URL] VITE_API_URL is set to invalid URL format (${raw}). Using proxy (/api) instead.`,
      `invalid-url-${raw}`
    );
    cachedApiBaseUrl = '/api';
    cacheKey = currentKey;
    return cachedApiBaseUrl;
  }
  
  // Detect development mode
  const isViteDev = import.meta.env.DEV === true ||
    (typeof window !== 'undefined' && window.location.port === '5173');
  
  // Detect test environment
  const isTestEnvironment = 
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.TEST === true) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITEST === true) ||
    (typeof globalThis !== 'undefined' && ((globalThis as any).__TEST__ === true || (globalThis as any).TEST_MODE === 'true'));
  
  // In test environments, always use the URL as-is (test server sets the correct URL)
  if (isTestEnvironment) {
    cachedApiBaseUrl = raw;
    cacheKey = currentKey;
    return cachedApiBaseUrl;
  }
  
  // In dev mode, proxy if target is not browser-reachable
  if (isViteDev) {
    // Check if URL points to Vite dev server itself (same origin)
    // This prevents misconfiguration where VITE_API_URL points to the Vite server
    // instead of using the proxy. The Vite dev server doesn't have backend routes.
    if (typeof window !== 'undefined') {
      // Check if URL points to Vite dev server using shared utility
      const isSame = isSameOrigin(raw);
      
      // Debug logging in dev mode - always log to help diagnose issues
      if (import.meta.env.DEV) {
        console.log('[API URL Debug]', {
          raw,
          windowOrigin: window.location.origin,
          windowHostname: window.location.hostname,
          windowPort: window.location.port,
          isViteDev,
          isSameOrigin: isSame,
        });
      }
      
      if (isSame) {
        warnOnce(
          `[API URL] VITE_API_URL (${raw}) points to the Vite dev server origin. ` +
          `Using Vite proxy (/api) instead. The Vite dev server proxies /api requests to the backend. ` +
          `Fix: Set VITE_API_URL=/api in your .env file.`,
          `vite-server-${raw}`
        );
        cachedApiBaseUrl = '/api';
        cacheKey = currentKey;
        return cachedApiBaseUrl;
      }
    }
    
    const isPrivate = isPrivateHostname(parsed.hostname);
    const isDocker = isDockerBridgeIp(parsed.hostname);
    
    if (isPrivate || isDocker) {
      const reason = isDocker 
        ? 'Docker bridge IPs cannot be accessed from browsers'
        : 'Private IP addresses may not be accessible from browsers';
      
      warnOnce(
        `[API URL] VITE_API_URL is set to ${raw}, but ${reason}. ` +
        `Using Vite proxy (/api) instead in development mode. ` +
        `This ensures the connection works correctly.`,
        `proxy-${raw}`
      );
      cachedApiBaseUrl = '/api';
      cacheKey = currentKey;
      return cachedApiBaseUrl;
    }
  }
  
  // For production or browser-reachable URLs, use the absolute URL
  cachedApiBaseUrl = raw;
  cacheKey = currentKey;
  return cachedApiBaseUrl;
}

/**
 * Check if we're using the Vite proxy (relative URL)
 */
export function isUsingProxy(): boolean {
  const url = getApiBaseUrl();
  return url.startsWith('/');
}

/**
 * Get default port for a protocol
 */
function getDefaultPort(protocol: string): string {
  return protocol === 'https:' ? '443' : '80';
}

/**
 * Check if two hostnames match (handles localhost/127.0.0.1 equivalence)
 */
function hostnamesMatch(hostname1: string, hostname2: string): boolean {
  return hostname1 === hostname2 ||
    (hostname1 === 'localhost' && hostname2 === '127.0.0.1') ||
    (hostname1 === '127.0.0.1' && hostname2 === 'localhost');
}

/**
 * Check if a URL points to the Vite dev server (same origin)
 * Handles localhost/127.0.0.1 equivalence and port normalization
 */
export function isSameOrigin(url: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Relative URLs (starting with /) are same-origin by definition in browsers
  if (url.startsWith('/')) {
    return true;
  }

  // Non-HTTP URLs can't be same-origin
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const viteServerOrigin = window.location.origin;
    const urlOrigin = `${urlObj.protocol}//${urlObj.host}`;
    
    // Primary check: exact origin match (most reliable)
    if (viteServerOrigin === urlOrigin) {
      return true;
    }
    
    // Secondary check: hostname/port match with localhost/127.0.0.1 equivalence
    const viteServerHostname = window.location.hostname;
    const viteServerPort = window.location.port || getDefaultPort(window.location.protocol);
    const urlHostname = urlObj.hostname;
    const urlPort = urlObj.port || getDefaultPort(urlObj.protocol);
    
    return hostnamesMatch(urlHostname, viteServerHostname) && urlPort === viteServerPort;
  } catch (error) {
    // URL parsing failed
    if (import.meta.env.DEV) {
      console.warn('[isSameOrigin] URL parsing failed', { url, error });
    }
    return false;
  }
}

/**
 * Check if a URL contains a Docker internal IP address
 * Docker bridge network uses 172.17.0.0/16 through 172.31.0.0/16
 */
export function isDockerInternalIp(url: string): boolean {
  // Check if URL string contains Docker IP pattern
  const dockerInternalIpPattern = /172\.(1[7-9]|2[0-9]|3[0-1])\.\d+\.\d+/;
  if (dockerInternalIpPattern.test(url)) {
    return true;
  }
  
  // Also check hostname if URL can be parsed
  try {
    const urlObj = new URL(url);
    return isDockerBridgeIp(urlObj.hostname);
  } catch {
    // URL parsing failed, pattern check above is sufficient
    return false;
  }
}

/**
 * Normalize a URL to use the Vite proxy (/api)
 * Extracts the endpoint path and ensures it starts with /api
 */
export function normalizeToProxyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const endpointPath = urlObj.pathname + urlObj.search;
    return endpointPath.startsWith('/api') ? endpointPath : `/api${endpointPath}`;
  } catch {
    // If URL parsing fails, try to extract path from string
    // This handles edge cases where URL might be malformed
    const match = url.match(/\/[^?#]*/);
    if (match) {
      const path = match[0];
      return path.startsWith('/api') ? path : `/api${path}`;
    }
    // Fallback: return /api
    return '/api';
  }
}

/**
 * Check if we're using a direct connection to localhost:4000
 */
export function isDirectConnection(): boolean {
  const url = getApiBaseUrl();
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' && parsed.port === '4000';
  } catch {
    // Not a valid URL, so not a direct connection
    return false;
  }
}

