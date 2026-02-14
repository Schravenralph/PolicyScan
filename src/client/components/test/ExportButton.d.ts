/**
 * Export Button Component
 *
 * Provides export functionality for test data in various formats.
 */
interface ExportButtonProps {
    onExport: (format: 'csv' | 'json' | 'xlsx') => Promise<void>;
    disabled?: boolean;
    className?: string;
}
export declare function ExportButton({ onExport, disabled, className }: ExportButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
