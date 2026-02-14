/**
 * Connection Health Check Utility
 * Checks if the backend API is accessible and provides diagnostic information
 */

// Use shared utility for consistent API URL handling
import { getApiBaseUrl, isUsingProxy, isDirectConnection } from './apiUrl';

export interface ConnectionHealthResult {
  healthy: boolean;
  apiUrl: string;
  isUsingProxy: boolean;
  isDirectConnection: boolean;
  error?: string;
  diagnostic?: string;
}

/**
 * Check if the backend API is accessible
 */
export async function checkConnectionHealth(): Promise<ConnectionHealthResult> {
  const apiBaseUrl = getApiBaseUrl();
  const healthUrl = `${apiBaseUrl}/health`;
  const usingProxy = isUsingProxy();
  const directConnection = isDirectConnection();
  
  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      credentials: 'include',
      // Short timeout for health check
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // For 500 errors, check if the response body indicates a connection error
      // The proxy may return 500 when it can't connect to the backend
      let isConnectionError = false;
      let errorDetails = `Backend returned status ${response.status}`;
      
      if (response.status >= 500) {
        try {
          // Try to parse the response body to check for connection errors
          const responseText = await response.text();
          const lowerText = responseText.toLowerCase();
          
          // Check if the error response indicates a connection problem
          if (lowerText.includes('econnrefused') ||
              lowerText.includes('connection refused') ||
              lowerText.includes('proxy error') ||
              lowerText.includes('getaddrinfo') ||
              lowerText.includes('enotfound') ||
              lowerText.includes('eai_again')) {
            isConnectionError = true;
            errorDetails = `Connection refused - backend server may not be running or may have failed to start.\n` +
              `Proxy error: ${responseText.substring(0, 200)}`;
          } else {
            // Try to parse as JSON to get more details
            try {
              const errorData = JSON.parse(responseText);
              if (errorData.message && typeof errorData.message === 'string') {
                const errorMsg = errorData.message.toLowerCase();
                if (errorMsg.includes('econnrefused') ||
                    errorMsg.includes('connection refused') ||
                    errorMsg.includes('proxy error')) {
                  isConnectionError = true;
                  errorDetails = errorData.message || errorDetails;
                }
                // Check for backend startup failures or dependency errors in the error message
                if (errorMsg.includes('cannot find module') ||
                    errorMsg.includes('missing dependency') ||
                    errorMsg.includes('module not found') ||
                    errorMsg.includes('cannot resolve') ||
                    errorMsg.includes('@turf') ||
                    errorMsg.includes('startup failed') ||
                    errorMsg.includes('failed to start')) {
                  // This might be a backend startup failure - extract details
                  const backendError = errorData.message;
                  errorDetails = `Backend startup failure detected:\n${backendError}\n\n` +
                    `This suggests the backend failed to start, possibly due to:\n` +
                    `- Missing dependencies (run: pnpm install)\n` +
                    `- Missing npm packages (check package.json)\n` +
                    `- Module resolution errors\n` +
                    `- Startup validation failures\n\n` +
                    `Check backend logs for full details: docker logs beleidsscan-backend`;
                  isConnectionError = true; // Treat as connection error since backend isn't running
                }
              }
              // Also check error.hint or error.details for additional context
              if (errorData.hint && typeof errorData.hint === 'string') {
                errorDetails += `\n\nHint: ${errorData.hint}`;
              }
            } catch {
              // Not JSON, check if text contains dependency/startup error indicators
              const lowerText = responseText.toLowerCase();
              if (lowerText.includes('cannot find module') ||
                  lowerText.includes('missing dependency') ||
                  lowerText.includes('module not found') ||
                  lowerText.includes('@turf') ||
                  lowerText.includes('startup failed')) {
                isConnectionError = true;
                errorDetails = `Backend startup failure detected in error response:\n${responseText.substring(0, 500)}\n\n` +
                  `Check backend logs for full details: docker logs beleidsscan-backend`;
              }
            }
          }
        } catch {
          // Failed to read response body, use default error
        }
      }
      
      return {
        healthy: false,
        apiUrl: healthUrl,
        isUsingProxy: usingProxy,
        isDirectConnection: directConnection,
        error: errorDetails,
        diagnostic: getDiagnosticMessage(usingProxy, directConnection, isConnectionError),
      };
    }

    // Try to parse response to verify it's valid JSON
    try {
      await response.json();
    } catch {
      // Response is not JSON, but that's okay for health check
    }

    return {
      healthy: true,
      apiUrl: healthUrl,
      isUsingProxy: usingProxy,
      isDirectConnection: directConnection,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isConnectionError = 
      errorMessage.includes('fetch') ||
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('NetworkError') ||
      errorMessage.includes('ERR_CONNECTION_REFUSED') ||
      errorMessage.includes('ERR_NETWORK') ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('timeout');

    // Enhanced error message for connection refused - link to startup issues
    let enhancedError = errorMessage;
    if (isConnectionError && (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection refused') || errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NETWORK') || errorMessage.includes('aborted') || errorMessage.includes('timeout'))) {
      enhancedError = 'Connection refused - backend server may not be running or may have failed to start.\n\n' +
        'Common causes:\n' +
        '- Missing dependencies (e.g., @turf/boolean-contains) - run: pnpm install\n' +
        '- Missing exports in code\n' +
        '- Database connection failures\n' +
        '- Startup validation errors\n' +
        '- Module resolution errors\n\n' +
        'Check backend logs for details:\n' +
        'docker logs beleidsscan-backend --tail 50 (if using Docker)\n' +
        'Look for: "Cannot find module", "Missing dependency", startup errors';
    }

    return {
      healthy: false,
      apiUrl: healthUrl,
      isUsingProxy: usingProxy,
      isDirectConnection: directConnection,
      error: enhancedError,
      diagnostic: getDiagnosticMessage(usingProxy, directConnection, isConnectionError),
    };
  }
}

/**
 * Get diagnostic message based on connection type and error
 */
function getDiagnosticMessage(
  isUsingProxy: boolean,
  isDirectConnection: boolean,
  isConnectionError: boolean
): string {
  if (!isConnectionError) {
    return 'Backend is accessible but returned an error. Check backend logs for details.';
  }

  if (isDirectConnection) {
    return `Direct connection to backend failed.\n` +
      `1. Ensure backend is running: pnpm run dev:backend\n` +
      `2. Check if port 4000 is available: lsof -i :4000\n` +
      `3. Check backend health: curl http://localhost:4000/health\n` +
      `4. If using Docker, check backend logs: docker logs beleidsscan-backend\n` +
      `5. If using Docker, verify backend is healthy: docker ps | grep backend\n` +
      `6. Common causes: missing exports, database connection failures, startup validation errors\n` +
      `7. Consider using Vite proxy by setting VITE_API_URL=/api\n` +
      `8. Restart Vite dev server after starting backend`;
  }

  if (isUsingProxy) {
    return `Vite proxy connection failed.\n` +
      `1. Check backend logs for startup errors:\n` +
      `   docker logs beleidsscan-backend --tail 50\n` +
      `   Look for: "Cannot find module", "Missing dependency", "@turf", startup failures\n` +
      `2. If missing dependencies are found:\n` +
      `   - Run: pnpm install (to install missing packages)\n` +
      `   - Check package.json for required dependencies\n` +
      `   - Restart backend: docker compose restart backend\n` +
      `3. Verify backend container is running:\n` +
      `   docker ps | grep beleidsscan-backend\n` +
      `4. Check backend container health:\n` +
      `   docker inspect beleidsscan-backend --format="{{.State.Health.Status}}"` +
      `5. Test backend health endpoint:\n` +
      `   curl http://localhost:4000/health\n` +
      `6. Common startup failure causes:\n` +
      `   - Missing npm packages (e.g., @turf/boolean-contains)\n` +
      `   - Missing exports in code\n` +
      `   - Database connection failures\n` +
      `   - Startup validation errors\n` +
      `   - Module resolution errors\n` +
      `7. Restart Vite dev server: pnpm run dev\n` +
      `8. Hard refresh browser: Ctrl+Shift+R (Cmd+Shift+R on Mac)`;
  }

  return `Connection to backend failed.\n` +
    `1. Verify backend is running and accessible\n` +
    `2. Check backend health: curl http://localhost:4000/health\n` +
    `3. If using Docker, check backend logs: docker logs beleidsscan-backend\n` +
    `4. If using Docker, verify backend is healthy: docker ps | grep backend\n` +
    `5. Common causes: missing exports, database connection failures, startup validation errors\n` +
    `6. Check VITE_API_URL environment variable\n` +
    `7. Restart both frontend and backend servers`;
}

/**
 * Log connection health status to console (for debugging)
 */
export function logConnectionHealth(result: ConnectionHealthResult): void {
  if (result.healthy) {
    console.log('✅ Backend connection healthy:', result.apiUrl);
  } else {
    console.error('❌ Backend connection failed:', result.error);
    console.warn('Diagnostic:', result.diagnostic);
    console.log('Connection type:', {
      isUsingProxy: result.isUsingProxy,
      isDirectConnection: result.isDirectConnection,
      apiUrl: result.apiUrl,
    });
  }
}

