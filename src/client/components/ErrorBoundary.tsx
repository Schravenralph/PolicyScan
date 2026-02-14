/**
 * Error Boundary Component
 * Catches React component errors and displays user-friendly error messages
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { getErrorMessage } from '../utils/errorMessages';
import { logError } from '../utils/errorHandler';
import { checkConnectionHealth } from '../utils/connectionHealth';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  healthCheck: {
    checked: boolean;
    healthy?: boolean;
    diagnostic?: string;
    apiUrl?: string;
  } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      healthCheck: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Store errorInfo in state for display
    this.setState({
      errorInfo,
    });

    // Log error using centralized error handler
    logError(error, 'error-boundary');
    
    // Log errorInfo separately for development debugging (without wrapping in Error)
    if (process.env.NODE_ENV === 'development') {
      console.group('🔴 ErrorBoundary - ErrorInfo Details');
      console.error('Component Stack:', errorInfo.componentStack);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      console.error('Full Error Object:', error);
      console.error('Full ErrorInfo Object:', errorInfo);
      console.groupEnd();
    }

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Asynchronously check backend health for debugging context (non-blocking)
    // This provides additional diagnostic information without delaying error display
    this.checkBackendHealthAsync(error);

    // In production, you might want to send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  /**
   * Check backend health asynchronously for debugging context
   * This is non-blocking - error is shown immediately, health check adds context when available
   */
  private checkBackendHealthAsync(error: Error): void {
    // Only check health for network-related errors or if error suggests backend issues
    const errorMessage = error.message.toLowerCase();
    const isNetworkRelatedError = 
      errorMessage.includes('fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('connection refused') ||
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('timeout') ||
      (error as any).code === 'ECONNREFUSED' ||
      (error as any).code === 'ETIMEDOUT' ||
      (error as any).code === 'ENOTFOUND';

    if (isNetworkRelatedError) {
      // Check health asynchronously - don't await, just fire and forget
      checkConnectionHealth()
        .then((health) => {
          // Update state with health check results (non-blocking)
          this.setState({
            healthCheck: {
              checked: true,
              healthy: health.healthy,
              diagnostic: health.diagnostic,
              apiUrl: health.apiUrl,
            },
          });
          
          // Log health check results for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log('[ErrorBoundary] Backend health check completed:', {
              healthy: health.healthy,
              apiUrl: health.apiUrl,
              isUsingProxy: health.isUsingProxy,
              diagnostic: health.diagnostic,
            });
          }
        })
        .catch((healthError) => {
          // Health check itself failed - still update state to indicate we tried
          this.setState({
            healthCheck: {
              checked: true,
              healthy: false,
              diagnostic: `Health check failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`,
            },
          });
          
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ErrorBoundary] Backend health check failed:', healthError);
          }
        });
    } else {
      // Not a network error - mark health check as not applicable
      this.setState({
        healthCheck: {
          checked: true,
        },
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      healthCheck: null,
    });
  };

  handleGoHome = () => {
    // Use window.location for error boundary since router may not be available
    // This is acceptable for error recovery scenarios
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      const errorCode = this.state.error?.message || 'INTERNAL_SERVER_ERROR';
      const errorMessage = getErrorMessage(errorCode);

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              {errorMessage.title}
            </h1>

            <p className="text-gray-600 text-center mb-4">
              {errorMessage.message}
            </p>

            {errorMessage.action && (
              <p className="text-sm text-gray-500 text-center mb-6">
                {errorMessage.action}
              </p>
            )}

            <div className="flex flex-col gap-3">
              {errorMessage.retryable && (
                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Opnieuw proberen
                </button>
              )}

              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <Home className="w-4 h-4" />
                Terug naar startpagina
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Technische details (alleen in ontwikkeling)
                </summary>
                <div className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64 space-y-3">
                  <div>
                    <div className="font-semibold mb-1">Error Message:</div>
                    <pre className="whitespace-pre-wrap break-words">
                      {this.state.error.message}
                    </pre>
                  </div>
                  
                  <div>
                    <div className="font-semibold mb-1">Error Stack:</div>
                    <pre className="whitespace-pre-wrap break-words">
                      {this.state.error.stack}
                    </pre>
                  </div>
                  
                  {this.state.errorInfo && (
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="font-semibold mb-1">Component Stack (ErrorInfo):</div>
                      <pre className="whitespace-pre-wrap break-words">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  
                  {this.state.healthCheck && (
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="font-semibold mb-1">Backend Health Check:</div>
                      {this.state.healthCheck.checked ? (
                        <div className="space-y-1">
                          <div>
                            Status: {this.state.healthCheck.healthy === undefined 
                              ? 'Not applicable (non-network error)'
                              : this.state.healthCheck.healthy 
                                ? '✅ Healthy' 
                                : '❌ Unhealthy'}
                          </div>
                          {this.state.healthCheck.apiUrl && (
                            <div>API URL: {this.state.healthCheck.apiUrl}</div>
                          )}
                          {this.state.healthCheck.diagnostic && (
                            <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                              <div className="font-semibold mb-1">Diagnostic:</div>
                              <pre className="whitespace-pre-wrap break-words text-xs">
                                {this.state.healthCheck.diagnostic}
                              </pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-gray-500">Checking backend health...</div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap components with ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback} onError={onError}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

