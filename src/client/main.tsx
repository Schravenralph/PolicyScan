import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { WorkflowProvider } from './context/WorkflowContext'
import { QueryClientProvider } from './services/query/QueryClientProvider'
import { logError } from './utils/errorHandler'
import { initializeCrashDiagnostics } from './utils/crashDiagnostics'

// Initialize crash diagnostics FIRST - before anything else
// This captures errors even if console is wiped
initializeCrashDiagnostics();

// Global fetch interceptor to handle 404 errors gracefully
// This prevents page crashes when incorrect API routes are accessed
// (e.g., /api/beleidsscan instead of /api/wizard/*)
// CRITICAL: Set up immediately to catch any fetch calls, including browser prefetch
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  // Safely extract URL from fetch arguments
  // fetch() can be called with: (url, options) or (Request object)
  let url = 'unknown';
  try {
    if (typeof args[0] === 'string') {
      url = args[0];
    } else if (args[0] instanceof Request) {
      url = args[0].url;
    } else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) {
      url = String(args[0].url || 'unknown');
    }
  } catch (error) {
    // If URL extraction fails, log and continue with original fetch
    console.warn('[Fetch Interceptor] Failed to extract URL from fetch arguments:', error);
    return originalFetch(...args);
  }
  
  // Skip interception for debug server calls to prevent infinite recursion
  const isDebugServerCall = url.includes('127.0.0.1:7242') || url.includes('localhost:7242');
  if (isDebugServerCall) {
    return originalFetch(...args);
  }
  try {
    const response = await originalFetch(...args);
    
    // Handle 404 errors for API routes gracefully
    if (!response.ok && response.status === 404) {
      // url variable is already available from above
      // Check if this is an API route
      if (url.includes('/api/')) {
        // Try to parse error response for helpful messages
        try {
          const errorData = await response.clone().json();
          if (errorData?.message || errorData?.hint) {
            // Log the error but don't crash the page
            console.warn('[Fetch Interceptor] 404 API error:', {
              url,
              message: errorData.message,
              hint: errorData.hint,
              correctRoutes: errorData.correctRoutes,
            });
            // Return the response so the caller can handle it
            return response;
          }
        } catch {
          // If JSON parsing fails, just log the 404
          console.warn('[Fetch Interceptor] 404 API error (non-JSON response):', url);
        }
      }
    }
    
    return response;
  } catch (error) {
    // Log fetch errors but don't crash the page
    // url variable is already available from above
    console.error('[Fetch Interceptor] Fetch error:', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    // Re-throw to let the caller handle it
    throw error;
  }
};

// Global error handler for unhandled JavaScript errors
// This catches errors that error boundaries cannot catch (e.g., errors in event handlers, timers, etc.)
// Using capture phase to catch errors early, before they propagate
window.addEventListener('error', (event: ErrorEvent) => {
  try {
    // Extract error information safely
    const error = event.error || new Error(event.message || 'Unknown error');
    const context = `unhandled-error:${event.filename || 'unknown'}:${event.lineno || 'unknown'}:${event.colno || 'unknown'}`;
    
    // Log the error for debugging (wrap in try-catch to prevent logError failures from breaking handler)
    try {
      logError(error, context);
    } catch (logError) {
      // Fallback to console.error if logError fails
      console.error('[Global Error Handler] Failed to log error via logError:', logError);
      console.error('[Global Error Handler] Original error:', error);
    }
    
    // Log to console for debugging with full context
    console.error('[Global Error Handler] Unhandled error:', {
      message: event.message,
      error,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    // Prevent default error handling that might close the page
    // This allows the application to continue running even after errors
    event.preventDefault();
    event.stopPropagation();
    
    // Return true to prevent default browser error handling
    return true;
  } catch (handlerError) {
    // If the error handler itself fails, log it but don't throw
    // This prevents error handler failures from causing infinite loops
    console.error('[Global Error Handler] Error handler itself failed:', handlerError);
    // Still try to prevent default behavior
    try {
      event.preventDefault();
    } catch {
      // Ignore if preventDefault also fails
    }
    return true;
  }
}, true); // Use capture phase to catch errors early

// Global unhandled promise rejection handler
// This catches async errors that error boundaries cannot catch
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  try {
    // Extract rejection reason safely
    const reason = event.reason;
    
    // Log the error for debugging (wrap in try-catch to prevent logError failures from breaking handler)
    try {
      logError(reason, 'unhandled-promise-rejection');
    } catch (logError) {
      // Fallback to console.error if logError fails
      console.error('[Global Error Handler] Failed to log promise rejection via logError:', logError);
      console.error('[Global Error Handler] Original rejection reason:', reason);
    }
    
    // Log to console for debugging with full context
    console.error('[Global Error Handler] Unhandled promise rejection:', {
      reason,
      promise: event.promise,
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    // Prevent default error handling that might close the page
    // This allows the application to continue running even after promise rejections
    event.preventDefault();
    
    // Return true to prevent default browser error handling
    return true;
  } catch (handlerError) {
    // If the error handler itself fails, log it but don't throw
    // This prevents error handler failures from causing infinite loops
    console.error('[Global Error Handler] Promise rejection handler itself failed:', handlerError);
    // Still try to prevent default behavior
    try {
      event.preventDefault();
    } catch {
      // Ignore if preventDefault also fails
    }
    return true;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider>
      <AuthProvider>
        <WorkflowProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </WorkflowProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
