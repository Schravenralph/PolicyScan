/**
 * Timeout Error Display Component
 * 
 * Displays user-friendly timeout error messages with actionable suggestions
 */

import React from 'react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { t } from '../../utils/i18n';
import { translateLogMessage } from '../../utils/logTranslations';

interface TimeoutErrorDisplayProps {
  error: Error & { suggestions?: string[]; metadata?: { type?: string; timeoutSeconds?: number; elapsedSeconds?: number; percentageUsed?: number } };
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Check if an error is a timeout error
 */
function isTimeoutError(error: Error): boolean {
  return (
    error.name.includes('Timeout') ||
    error.message.includes('timed out') ||
    error.message.includes('exceeded') ||
    error.message.includes('timeout')
  );
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

export function TimeoutErrorDisplay({ error, onRetry, onDismiss }: TimeoutErrorDisplayProps) {
  if (!isTimeoutError(error)) {
    return null;
  }

  const suggestions = error.suggestions || [];
  const metadata = error.metadata || {};

  return (
    <Alert variant="destructive" className="timeout-error-display">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2 text-red-900 dark:text-red-200">
        <Clock className="h-4 w-4" />
        {t('errors.timeout.title')}
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <div>
          <p className="font-medium mb-2 text-red-900 dark:text-red-200">
            {translateLogMessage(error.message)}
          </p>
          {metadata.timeoutSeconds && metadata.elapsedSeconds && (
            <div className="text-sm text-red-800 dark:text-red-300 space-y-1">
              <p>
                {t('errors.timeout.limit')}: {formatDuration(metadata.timeoutSeconds)} | 
                {t('errors.timeout.elapsed')}: {formatDuration(metadata.elapsedSeconds)}
              </p>
              {metadata.percentageUsed && (
                <p>
                  {t('errors.timeout.percentageUsed').replace('{{percentage}}', String(Math.round(metadata.percentageUsed)))}
                </p>
              )}
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="timeout-suggestions">
            <h4 className="font-semibold text-sm mb-2 text-red-900 dark:text-red-200">{t('errors.timeout.suggestions')}</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-800 dark:text-red-300 [&_li]:text-red-800 dark:[&_li]:text-red-300">
              {suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {t('errors.timeout.retry')}
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
            >
              {t('errors.timeout.dismiss')}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Wrapper component that conditionally renders TimeoutErrorDisplay
 * Falls back to generic error display if not a timeout error
 */
interface ErrorDisplayWrapperProps {
  error: Error;
  onRetry?: () => void;
  onDismiss?: () => void;
  fallbackComponent?: React.ComponentType<{ error: Error }>;
}

export function ErrorDisplayWrapper({ error, onRetry, onDismiss, fallbackComponent: FallbackComponent }: ErrorDisplayWrapperProps) {
  if (isTimeoutError(error)) {
    return <TimeoutErrorDisplay error={error} onRetry={onRetry} onDismiss={onDismiss} />;
  }

  if (FallbackComponent) {
    return <FallbackComponent error={error} />;
  }

  // Default error display
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-red-900 dark:text-red-200">{t('errors.generic.title')}</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">{error.message}</AlertDescription>
    </Alert>
  );
}


