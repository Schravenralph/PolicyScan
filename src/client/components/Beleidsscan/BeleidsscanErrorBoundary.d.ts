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
export declare class BeleidsscanErrorBoundary extends Component<BeleidsscanErrorBoundaryProps, BeleidsscanErrorBoundaryState> {
    constructor(props: BeleidsscanErrorBoundaryProps);
    static getDerivedStateFromError(error: Error): Partial<BeleidsscanErrorBoundaryState>;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleRetry: () => void;
    handleRestoreDraft: () => void;
    handleGoHome: () => void;
    formatTimestamp(timestamp?: string): string;
    render(): ReactNode;
}
export default BeleidsscanErrorBoundary;
