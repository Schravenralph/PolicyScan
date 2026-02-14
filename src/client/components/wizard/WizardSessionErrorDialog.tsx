/**
 * WizardSessionErrorDialog - Error dialog for wizard session creation failures
 * 
 * Provides user-friendly error messages and recovery options when session creation fails.
 */

import { AlertTriangle, RefreshCw, FileText, Home, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface WizardSessionError {
  message: string;
  code?: string;
  retryable?: boolean;
  isNetworkError?: boolean;
  isServerError?: boolean;
  isTimeoutError?: boolean;
}

interface WizardSessionErrorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  error: WizardSessionError | null;
  isRetrying?: boolean;
  retryAttempt?: number;
  hasDraft?: boolean;
  onRetry: () => void;
  onContinueWithDraft?: () => void;
  onStartFresh?: () => void;
  onGoHome?: () => void;
}

/**
 * Map technical error messages to user-friendly messages
 */
function getUserFriendlyMessage(error: WizardSessionError): string {
  if (error.isNetworkError) {
    return t('wizardSessionError.networkError');
  }
  
  if (error.isTimeoutError) {
    return t('wizardSessionError.timeoutError');
  }
  
  if (error.isServerError) {
    return t('wizardSessionError.serverError');
  }
  
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return t('wizardSessionError.connectionError');
  }
  
  // Default to original message if no specific mapping
  return error.message || t('wizardSessionError.unknownError');
}

export function WizardSessionErrorDialog({
  isOpen,
  onOpenChange,
  error,
  isRetrying = false,
  retryAttempt = 0,
  hasDraft = false,
  onRetry,
  onContinueWithDraft,
  onStartFresh,
  onGoHome,
}: WizardSessionErrorDialogProps) {
  if (!error) return null;

  const userFriendlyMessage = getUserFriendlyMessage(error);
  const canRetry = error.retryable !== false && !isRetrying;

  const handleRetry = () => {
    onRetry();
  };

  const handleContinueWithDraft = () => {
    if (onContinueWithDraft) {
      onContinueWithDraft();
      onOpenChange(false);
    }
  };

  const handleStartFresh = () => {
    if (onStartFresh) {
      onStartFresh();
      onOpenChange(false);
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" role="alert" aria-live="assertive">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-destructive/10 flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-serif font-semibold text-foreground">
                {t('wizardSessionError.title')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                {userFriendlyMessage}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Retry Status */}
          {isRetrying && (
            <div className="p-4 rounded-lg bg-background border border-primary/20">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t('wizardSessionError.retrying')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('wizardSessionError.retryAttempt').replace('{{attempt}}', String(retryAttempt))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Details (for debugging) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="p-3 rounded-lg bg-background border border-border">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
                {t('wizardSessionError.technicalDetails')}
              </summary>
              <div className="mt-2 text-xs font-mono text-muted-foreground space-y-1">
                <div><strong>{t('wizardSessionError.code')}:</strong> {error.code || t('common.none')}</div>
                <div><strong>{t('wizardSessionError.message')}:</strong> {error.message}</div>
                <div><strong>{t('wizardSessionError.retryable')}:</strong> {error.retryable !== false ? t('common.yes') : t('common.no')}</div>
              </div>
            </details>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            {canRetry && (
              <Button
                onClick={handleRetry}
                disabled={isRetrying}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                aria-label={t('wizardSessionError.retryAriaLabel')}
              >
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('wizardSessionError.retry')}
              </Button>
            )}

            {hasDraft && onContinueWithDraft && (
              <Button
                onClick={handleContinueWithDraft}
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10"
                aria-label={t('wizardSessionError.continueWithDraftAriaLabel')}
              >
                <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('wizardSessionError.continueWithDraft')}
              </Button>
            )}

            {onStartFresh && (
              <Button
                onClick={handleStartFresh}
                variant="outline"
                className="w-full border-border text-foreground hover:bg-background"
                aria-label={t('wizardSessionError.startFreshAriaLabel')}
              >
                {t('wizardSessionError.startFresh')}
              </Button>
            )}

            {onGoHome && (
              <Button
                onClick={handleGoHome}
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                aria-label={t('wizardSessionError.goHomeAriaLabel')}
              >
                <Home className="w-4 h-4 mr-2" aria-hidden="true" />
                {t('wizardSessionError.goHome')}
              </Button>
            )}
          </div>

          {/* Help Text */}
          <div className="p-3 rounded-lg bg-background border border-border">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{t('wizardSessionError.tip')}</strong> {t('wizardSessionError.helpText')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


