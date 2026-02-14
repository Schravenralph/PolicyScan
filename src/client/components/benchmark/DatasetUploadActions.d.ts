/**
 * Dataset Upload Actions Component
 *
 * Action buttons for cancel, preview, and upload.
 */
interface DatasetUploadActionsProps {
    onCancel?: () => void;
    onPreview: () => void;
    onSubmit: () => void;
    isUploading: boolean;
    canSubmit: boolean;
}
export declare function DatasetUploadActions({ onCancel, onPreview, onSubmit, isUploading, canSubmit, }: DatasetUploadActionsProps): import("react/jsx-runtime").JSX.Element;
export {};
