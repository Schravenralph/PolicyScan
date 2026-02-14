/**
 * Timeout Error Display Component
 *
 * Displays user-friendly timeout error messages with actionable suggestions
 */
import React from 'react';
interface TimeoutErrorDisplayProps {
    error: Error & {
        suggestions?: string[];
        metadata?: {
            type?: string;
            timeoutSeconds?: number;
            elapsedSeconds?: number;
            percentageUsed?: number;
        };
    };
    onRetry?: () => void;
    onDismiss?: () => void;
}
export declare function TimeoutErrorDisplay({ error, onRetry, onDismiss }: TimeoutErrorDisplayProps): import("react/jsx-runtime").JSX.Element | null;
/**
 * Wrapper component that conditionally renders TimeoutErrorDisplay
 * Falls back to generic error display if not a timeout error
 */
interface ErrorDisplayWrapperProps {
    error: Error;
    onRetry?: () => void;
    onDismiss?: () => void;
    fallbackComponent?: React.ComponentType<{
        error: Error;
    }>;
}
export declare function ErrorDisplayWrapper({ error, onRetry, onDismiss, fallbackComponent: FallbackComponent }: ErrorDisplayWrapperProps): import("react/jsx-runtime").JSX.Element;
export {};
