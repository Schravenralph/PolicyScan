/**
 * Error Reporting Service
 * 
 * Provides centralized error reporting functionality for sending errors
 * to monitoring services and tracking error frequency.
 */

import { logError } from '../utils/errorHandler';
import { parseError } from '../utils/errorHandler';
import type { ErrorInfo } from '../utils/errorHandler';

export interface ErrorReport {
  error: Error | unknown;
  context?: string;
  errorInfo?: ErrorInfo;
  timestamp: string;
  userAgent?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorReportResult {
  success: boolean;
  errorId?: string;
  error?: string;
}

export class ErrorReportingService {
  private static errorCounts: Map<string, number> = new Map();
  private static readonly MAX_ERRORS_PER_CONTEXT = 10; // Max errors per context before throttling
  private static readonly THROTTLE_WINDOW_MS = 60 * 1000; // 1 minute throttle window
  private static errorTimestamps: Map<string, number[]> = new Map();

  /**
   * Report an error to the monitoring service
   */
  static async reportError(
    error: Error | unknown,
    context?: string,
    metadata?: Record<string, unknown>
  ): Promise<ErrorReportResult> {
    try {
      // Check if we should throttle this error
      if (this.shouldThrottle(context || 'unknown')) {
        return {
          success: false,
          error: 'Error reporting throttled due to high error frequency',
        };
      }

      const errorInfo = parseError(error);
      const report: ErrorReport = {
        error,
        context: context || 'unknown',
        errorInfo,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        metadata,
      };

      // Track error frequency
      this.trackError(context || 'unknown');

      // Log error locally
      logError(error, context);

      // In production, send to error tracking service
      if (process.env.NODE_ENV === 'production') {
        try {
          // Send to backend error monitoring endpoint if available
          const response = await fetch('/api/errors/report', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(report),
          });

          if (response.ok) {
            const result = await response.json();
            return {
              success: true,
              errorId: result.errorId,
            };
          } else {
            // If backend reporting fails, log but don't fail
            console.warn('Failed to report error to backend:', response.statusText);
          }
        } catch (fetchError) {
          // If fetch fails, log but don't fail
          console.warn('Failed to send error report:', fetchError);
        }
      }

      // Always return success even if reporting fails
      // This prevents error reporting failures from breaking the application
      return {
        success: true,
      };
    } catch (reportingError) {
      // If error reporting itself fails, log but don't throw
      console.error('Error reporting service failed:', reportingError);
      return {
        success: false,
        error: reportingError instanceof Error ? reportingError.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if error reporting should be throttled
   */
  private static shouldThrottle(context: string): boolean {
    const now = Date.now();
    const timestamps = this.errorTimestamps.get(context) || [];
    
    // Remove timestamps outside throttle window
    const recentTimestamps = timestamps.filter(ts => now - ts < this.THROTTLE_WINDOW_MS);
    
    // Update timestamps
    this.errorTimestamps.set(context, recentTimestamps);
    
    // Check if we've exceeded max errors
    if (recentTimestamps.length >= this.MAX_ERRORS_PER_CONTEXT) {
      return true;
    }
    
    // Add current timestamp
    recentTimestamps.push(now);
    this.errorTimestamps.set(context, recentTimestamps);
    
    return false;
  }

  /**
   * Track error frequency for monitoring
   */
  private static trackError(context: string): void {
    const count = this.errorCounts.get(context) || 0;
    this.errorCounts.set(context, count + 1);
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): {
    totalErrors: number;
    errorsByContext: Record<string, number>;
  } {
    const errorsByContext: Record<string, number> = {};
    let totalErrors = 0;

    for (const [context, count] of this.errorCounts.entries()) {
      errorsByContext[context] = count;
      totalErrors += count;
    }

    return {
      totalErrors,
      errorsByContext,
    };
  }

  /**
   * Reset error statistics
   */
  static resetStats(): void {
    this.errorCounts.clear();
    this.errorTimestamps.clear();
  }

  /**
   * Check if error is critical and should trigger alerts
   */
  static isCriticalError(error: unknown): boolean {
    const errorInfo = parseError(error);
    
    // Critical error types
    const criticalTypes: ErrorInfo['errorType'][] = ['server', 'network'];
    
    // Critical status codes
    const criticalStatusCodes = [500, 502, 503, 504];
    
    return (
      criticalTypes.includes(errorInfo.errorType) ||
      (errorInfo.statusCode !== undefined && criticalStatusCodes.includes(errorInfo.statusCode))
    );
  }
}


