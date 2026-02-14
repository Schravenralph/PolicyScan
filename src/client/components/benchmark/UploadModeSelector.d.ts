/**
 * Upload Mode Selector Component
 *
 * Selector for choosing upload mode: file, manual, or canonical.
 */
type UploadMode = 'file' | 'manual' | 'canonical';
interface UploadModeSelectorProps {
    uploadMode: UploadMode;
    onModeChange: (mode: UploadMode) => void;
    disabled?: boolean;
}
export declare function UploadModeSelector({ uploadMode, onModeChange, disabled, }: UploadModeSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
