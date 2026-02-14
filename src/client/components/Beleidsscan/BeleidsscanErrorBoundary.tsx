/**
 * BeleidsscanErrorBoundary
 * 
 * A wizard-specific error boundary that provides:
 * - Specialized fallback UI matching the wizard's design
 * - Integration with draft persistence for state recovery
 * - Enhanced error logging with wizard context
 * 
 * @see WI-WIZ-007 for implementation details
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Save, Home, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { logError } from '../../utils/errorHandler';
import { getUserFriendlyErrorMessage, getErrorGuidance } from '../../utils/errorMessages';
import { t } from '../../utils/i18n';

interface DraftSummary {
  step?: number;
  onderwerp?: string;
  selectedWebsites?: number;
  documents?: number;
  timestamp?: string;
}

interface BeleidsscanErrorBoundaryProps {
  children: ReactNode;
  /** Current wizard step for error logging context */
  currentStep?: number;
  /** Current query ID for error logging context */
  queryId?: string | null;
  /** Check if a draft exists in localStorage */
  hasDraft?: boolean;
  /** Summary of the available draft */
  draftSummary?: DraftSummary | null;
  /** Callback to restore from draft */
  onRestoreDraft?: () => void;
  /** Callback to go back to home/portal */
  onGoHome?: () => void;
  /** Fallback onGoHome for when prop is not provided */
  fallbackHomeUrl?: string;
}

interface BeleidsscanErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component specifically for the Beleidsscan wizard.
 * 
 * Catches render errors and provides recovery options including
 * restoring from a saved draft.
 * 
 * @example
 * ```tsx
 * <BeleidsscanErrorBoundary
 *   currentStep={step}
 *   queryId={queryId}
 *   hasDraft={hasDraft}
 *   draftSummary={lastDraftSummary}
 *   onRestoreDraft={handleRestoreDraft}
 *   onGoHome={onBack}
 * >
 *   <WizardSteps />
 * </BeleidsscanErrorBoundary>
 * ```
 */
export class BeleidsscanErrorBoundary extends Component<
  BeleidsscanErrorBoundaryProps,
  BeleidsscanErrorBoundaryState
> {
  constructor(props: BeleidsscanErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<BeleidsscanErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { currentStep, queryId } = this.props;

    // Log error with wizard context
    logError(error, `beleidsscan-wizard: step=${currentStep}, queryId=${queryId || 'none'}, stack=${errorInfo.componentStack?.substring(0, 100) || 'none'}`);

    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleRestoreDraft = (): void => {
    const { onRestoreDraft } = this.props;
    if (onRestoreDraft) {
      onRestoreDraft();
      // Reset error state after restoring
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  };

  handleGoHome = (): void => {
    const { onGoHome, fallbackHomeUrl } = this.props;
    if (onGoHome) {
      onGoHome();
    } else if (fallbackHomeUrl) {
      window.location.href = fallbackHomeUrl;
    }
  };

  formatTimestamp(timestamp?: string): string {
    if (!timestamp) return t('beleidsscanErrorBoundary.unknown');
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return t('beleidsscanErrorBoundary.unknown');
    return date.toLocaleString('nl-NL');
  }

  render(): ReactNode {
    const { children, hasDraft, draftSummary, currentStep, onGoHome } = this.props;
    const { hasError, error } = this.state;

    if (!hasError) {
      return children;
    }

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 bg-muted"
      >
        <div
          className="max-w-lg w-full bg-background rounded-xl shadow-lg p-8"
          role="alert"
          aria-live="assertive"
        >
          {/* Error Header */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center bg-destructive/10"
            >
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2
                className="text-2xl font-semibold font-serif text-foreground"
              >
                {t('beleidsscanErrorBoundary.title')}
              </h2>
              <p className="text-muted-foreground">
                {currentStep && t('beleidsscanErrorBoundary.stepOfWizard').replace('{{step}}', String(currentStep))}
              </p>
            </div>
          </div>

          {/* Error Message */}
          <div
            className="p-4 rounded-lg mb-6 bg-destructive/5"
          >
            <p className="text-sm text-foreground mb-2">
              {error ? getUserFriendlyErrorMessage(error, { step: currentStep }) : t('beleidsscanErrorBoundary.unexpectedError')}
            </p>
            {error && (() => {
              const guidance = getErrorGuidance(error, { step: currentStep });
              return guidance ? (
                <p className="text-sm text-muted-foreground">
                  {guidance}
                </p>
              ) : null;
            })()}
          </div>

          {/* Draft Recovery Option */}
          {hasDraft && draftSummary && (
            <div
              className="p-4 rounded-lg border-2 mb-6 border-primary bg-primary/5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Save className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">
                  {t('beleidsscanErrorBoundary.draftAvailable')}
                </h3>
              </div>
              <p className="text-sm mb-3 text-muted-foreground">
                {t('beleidsscanErrorBoundary.draftAvailableDescription')}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs mb-4 text-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span>{this.formatTimestamp(draftSummary.timestamp)}</span>
                </div>
                {draftSummary.step && (
                  <div>{t('beleidsscanErrorBoundary.step').replace('{{step}}', String(draftSummary.step))}</div>
                )}
                {draftSummary.selectedWebsites !== undefined && (
                  <div>{t('beleidsscanErrorBoundary.websites').replace('{{count}}', String(draftSummary.selectedWebsites))}</div>
                )}
                {draftSummary.documents !== undefined && (
                  <div>{t('beleidsscanErrorBoundary.documents').replace('{{count}}', String(draftSummary.documents))}</div>
                )}
              </div>
              <Button
                onClick={this.handleRestoreDraft}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="w-4 h-4" />
                {t('beleidsscanErrorBoundary.restoreDraft')}
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={this.handleRetry}
              variant="outline"
              className="flex-1 flex items-center justify-center gap-2 border-border text-foreground hover:bg-muted"
            >
              <RefreshCw className="w-4 h-4" />
              {t('beleidsscanErrorBoundary.tryAgain')}
            </Button>
            {onGoHome && (
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-2 border-primary text-primary hover:bg-primary/10"
              >
                <Home className="w-4 h-4" />
                {t('beleidsscanErrorBoundary.backToPortal')}
              </Button>
            )}
          </div>

          {/* Technical Details (Development) */}
          {process.env.NODE_ENV === 'development' && error && (
            <details className="mt-6">
              <summary
                className="cursor-pointer text-xs text-muted-foreground"
              >
                {t('beleidsscanErrorBoundary.technicalDetails')}
              </summary>
              <pre
                className="mt-2 p-3 rounded text-xs overflow-auto bg-muted text-foreground"
              >
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default BeleidsscanErrorBoundary;

