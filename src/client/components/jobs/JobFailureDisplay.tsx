/**
 * Job Failure Display Component
 * 
 * Standardizes error display for job failures across the application.
 * Shows error details in an expandable UI with consistent styling.
 */

import { useState } from 'react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Info } from 'lucide-react';
import { JobProgressEvent } from '../../hooks/useWebSocket';
import { formatErrorDetails } from '../../utils/errorSerialization';
import { parseError } from '../../utils/errorHandler';
import { translateLogMessage } from '../../utils/logTranslations';
import { t } from '../../utils/i18n';

interface JobFailureDisplayProps {
  event: JobProgressEvent;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
  variant?: 'alert' | 'text'; // 'alert' for full UI, 'text' for simple text display
}

export function JobFailureDisplay({ 
  event, 
  onRetry, 
  onDismiss,
  showDetails: initialShowDetails = false,
  variant = 'alert'
}: JobFailureDisplayProps) {
  const [showDetails, setShowDetails] = useState(initialShowDetails);
  const [copied, setCopied] = useState(false);

  // Check for partial failure - status might be in metadata or error field
  const isPartialFailure = event.type === 'job_completed' && (
    (event.data.metadata && typeof event.data.metadata === 'object' && 'status' in event.data.metadata && event.data.metadata.status === 'completed_with_errors') ||
    (event.data.error && typeof event.data.error === 'string' && event.data.error.includes('completed_with_errors'))
  );

  // Only render if this is a job_failed event or a partial failure
  if (event.type !== 'job_failed' && !isPartialFailure) {
    return null;
  }

  let errorMessage = '';
  let errorDetails: unknown = null;
  let partialErrors: Array<{ documentId: string; error: string }> = [];

  if (event.type === 'job_failed') {
    errorMessage = event.data.error || t('jobs.jobFailed');
    errorDetails = event.data.errorDetails;
  } else if (isPartialFailure) {
    errorMessage = event.data.message || t('jobs.jobCompletedWithErrors');
    // Try to extract errors from result
    const result = event.data.result as { errors?: Array<{ documentId: string; error: string }> } | undefined;
    if (result?.errors && Array.isArray(result.errors)) {
      partialErrors = result.errors;
      errorDetails = result.errors;
    }
  }

  // Parse error for user-friendly message
  const errorInfo = parseError(errorMessage);
  const formattedDetails = errorDetails ? formatErrorDetails(errorDetails) : null;

  // Simple text variant for workflow logs pane
  // Uses high contrast red text that works on dark background (gray-900)
  if (variant === 'text') {
    if (isPartialFailure) {
      // Use translated error message from errorInfo if available, and translate any i18n keys
      const displayMessage = translateLogMessage(errorInfo.message || errorMessage);
      return (
        <div className="text-yellow-400 dark:text-yellow-400 text-sm font-medium">
          ⚠️ {t('jobs.jobCompletedWithErrors')} ({event.jobType}): {partialErrors.length > 0 ? `${partialErrors.length} ${t('jobs.errors')}` : displayMessage}
        </div>
      );
    }
    // Translate error message in case it contains i18n keys
    const translatedError = translateLogMessage(errorInfo.title || errorInfo.message || errorMessage);
    return (
        <div className="text-red-400 dark:text-red-400 text-sm font-medium">
          ❌ {t('jobs.jobFailed')} ({event.jobType}): {translatedError}
        </div>
    );
  }

  const handleCopyDetails = async () => {
    const detailsText = formattedDetails 
      ? `${formattedDetails.message}\n\n${formattedDetails.details || ''}\n\n${formattedDetails.stack || ''}`
      : errorMessage;
    
    try {
      await navigator.clipboard.writeText(detailsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  const alertVariant = isPartialFailure ? "default" : "destructive";
  const titleColor = isPartialFailure ? "text-yellow-900 dark:text-yellow-200" : "text-red-900 dark:text-red-200";
  const messageColor = isPartialFailure ? "text-yellow-900 dark:text-yellow-200" : "text-red-900 dark:text-red-200";
  const subMessageColor = isPartialFailure ? "text-yellow-800 dark:text-yellow-300" : "text-red-800 dark:text-red-300";
  const borderColor = isPartialFailure ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20" : undefined; // default alert might need override

  return (
    <Alert variant={alertVariant} className={`job-failure-display ${isPartialFailure ? borderColor : ''}`}>
      {isPartialFailure ? <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-400" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertTitle className={`flex items-center justify-between ${titleColor}`}>
        <span>{isPartialFailure ? t('jobs.jobCompletedWithErrorsTitle') : t('jobs.jobFailedTitle')}: {event.jobType}</span>
        {errorDetails != null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="h-6 px-2"
          >
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <div>
          <p className={`font-medium mb-2 ${messageColor}`}>
            {translateLogMessage(errorInfo.title || errorInfo.message || errorMessage)}
          </p>
          {errorInfo.message && errorInfo.message !== errorInfo.title && (
            <p className={`text-sm ${subMessageColor}`}>
              {translateLogMessage(errorInfo.message)}
            </p>
          )}
          {errorInfo.action && (
            <p className={`text-sm ${subMessageColor} mt-2`}>
              <strong>{t('jobs.action')}</strong> {errorInfo.action}
            </p>
          )}
        </div>

        {showDetails && (
          <div className="mt-4 p-3 bg-muted dark:bg-gray-800 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-foreground">{t('jobs.errorDetails')}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyDetails}
                className="h-6 px-2"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="h-4 w-4 text-foreground" />
                )}
              </Button>
            </div>

            {isPartialFailure && partialErrors.length > 0 ? (
              <div className="space-y-2">
                {partialErrors.map((err, idx) => (
                  <div key={idx} className="text-xs p-2 bg-background dark:bg-gray-900 text-foreground rounded border border-yellow-200 dark:border-yellow-800">
                    <div className="font-semibold">{t('jobs.document')} {err.documentId}</div>
                    <div className="text-red-500">{err.error}</div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {formattedDetails?.details && (
                  <pre className="text-xs overflow-auto max-h-48 p-2 bg-background dark:bg-gray-900 text-foreground rounded border">
                    {formattedDetails.details}
                  </pre>
                )}
                {formattedDetails?.stack && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold mb-2 text-foreground">{t('jobs.stackTrace')}</summary>
                    <pre className="overflow-auto max-h-48 p-2 bg-background dark:bg-gray-900 text-foreground rounded border mt-2">
                      {formattedDetails.stack}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        {!showDetails && errorDetails != null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(true)}
            className="mt-2"
          >
            {t('jobs.showDetails')}
          </Button>
        )}

        <div className="flex gap-2 mt-4">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
            >
              {t('jobs.retryJob')}
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
            >
              {t('jobs.dismiss')}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
