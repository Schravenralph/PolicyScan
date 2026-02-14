/**
 * WizardSessionErrorDialog - Error dialog for wizard session creation failures
 *
 * Provides user-friendly error messages and recovery options when session creation fails.
 */
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
export declare function WizardSessionErrorDialog({ isOpen, onOpenChange, error, isRetrying, retryAttempt, hasDraft, onRetry, onContinueWithDraft, onStartFresh, onGoHome, }: WizardSessionErrorDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
