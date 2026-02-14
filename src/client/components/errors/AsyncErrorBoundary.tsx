/**
 * Async Error Boundary Component
 * 
 * Catches async errors in components that regular error boundaries cannot catch.
 * Uses a combination of error boundaries and promise rejection handling.
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { parseError } from '../../utils/errorHandler';
import { logError } from '../../utils/errorHandler';
import { ErrorReportingService } from '../../services/ErrorReportingService';
import { toast } from '../../utils/toast';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showToast?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AsyncErrorBoundary extends Component<Props, State> {
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  componentDidMount() {
    // Set up unhandled rejection handler for this component tree
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      // Only handle rejections that occur within this component's context
      // We can't perfectly scope this, but we can at least catch them
      const reason = event.reason;
      
      try {
        const errorInfo = parseError(reason);
        
        // Report error
        ErrorReportingService.reportError(reason, 'async-error-boundary').catch(() => {
          // Ignore reporting errors
        });
        
        // Log error
        logError(reason, 'async-error-boundary');
        
        // Show toast if enabled
        if (this.props.showToast !== false) {
          toast.error(
            errorInfo.title,
            `${errorInfo.message}${errorInfo.action ? ` ${errorInfo.action}` : ''}`
          );
        }
        
        // Update state to show error UI
        this.setState({
          hasError: true,
          error: reason instanceof Error ? reason : new Error(String(reason)),
        });
        
        // Prevent default handling
        event.preventDefault();
      } catch (handlerError) {
        console.error('[AsyncErrorBoundary] Error in rejection handler:', handlerError);
      }
    };
    
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentWillUnmount() {
    // Clean up event listener
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      this.setState({ errorInfo });
      
      // Report error
      ErrorReportingService.reportError(error, 'async-error-boundary', {
        componentStack: errorInfo.componentStack,
      }).catch(() => {
        // Ignore reporting errors
      });
      
      // Log error
      logError(error, 'async-error-boundary');
      
      // Show toast if enabled
      if (this.props.showToast !== false) {
        const errorInfo_parsed = parseError(error);
        toast.error(
          errorInfo_parsed.title,
          `${errorInfo_parsed.message}${errorInfo_parsed.action ? ` ${errorInfo_parsed.action}` : ''}`
        );
      }
      
      // Call optional error handler
      if (this.props.onError) {
        try {
          this.props.onError(error, errorInfo);
        } catch (handlerError) {
          console.error('[AsyncErrorBoundary] Error in onError callback:', handlerError);
        }
      }
    } catch (boundaryError) {
      console.error('[AsyncErrorBoundary] Error in componentDidCatch:', boundaryError);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorInfo = this.state.error ? parseError(this.state.error) : {
        title: 'Fout opgetreden',
        message: 'Er is een onverwachte fout opgetreden.',
        retryable: true,
        errorType: 'unknown' as const,
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              {errorInfo.title}
            </h1>

            <p className="text-gray-600 text-center mb-4">
              {errorInfo.message}
            </p>

            {errorInfo.action && (
              <p className="text-sm text-gray-500 text-center mb-6">
                {errorInfo.action}
              </p>
            )}

            <div className="flex flex-col gap-3">
              {errorInfo.retryable && (
                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Opnieuw proberen
                </button>
              )}
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Technische details (alleen in ontwikkeling)
                </summary>
                <div className="mt-2 space-y-4">
                  {this.state.error.stack && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">Stack Trace:</p>
                      <pre className="p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">Component Stack:</p>
                      <pre className="p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64">
                        {this.state.errorInfo.componentStack}
                      </pre>
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


