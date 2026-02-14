/**
 * Job Failure Display Component
 *
 * Standardizes error display for job failures across the application.
 * Shows error details in an expandable UI with consistent styling.
 */
import { JobProgressEvent } from '../../hooks/useWebSocket';
interface JobFailureDisplayProps {
    event: JobProgressEvent;
    onRetry?: () => void;
    onDismiss?: () => void;
    showDetails?: boolean;
    variant?: 'alert' | 'text';
}
export declare function JobFailureDisplay({ event, onRetry, onDismiss, showDetails: initialShowDetails, variant }: JobFailureDisplayProps): import("react/jsx-runtime").JSX.Element | null;
export {};
