/**
 * Browser Compatibility Warning Component
 *
 * Displays a warning banner when the browser is not fully compatible
 * or when recommended browser features are missing.
 */
interface BrowserCompatibilityWarningProps {
    onDismiss?: () => void;
    showOnlyIfIncompatible?: boolean;
}
export declare function BrowserCompatibilityWarning({ onDismiss, showOnlyIfIncompatible, }: BrowserCompatibilityWarningProps): import("react/jsx-runtime").JSX.Element | null;
export {};
