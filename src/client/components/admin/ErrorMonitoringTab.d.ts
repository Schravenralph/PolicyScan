/**
 * Error Monitoring Tab Component
 *
 * Displays and manages application errors with filtering, statistics, and resolution capabilities.
 */
interface ErrorMonitoringTabProps {
    onErrorSelect: (errorId: string) => void;
}
export declare function ErrorMonitoringTab({ onErrorSelect }: ErrorMonitoringTabProps): import("react/jsx-runtime").JSX.Element;
export {};
