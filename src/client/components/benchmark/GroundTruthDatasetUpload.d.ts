import type { GroundTruthDataset } from './GroundTruthDatasetList';
interface GroundTruthDatasetUploadProps {
    onSuccess?: (dataset: GroundTruthDataset) => void;
    onCancel?: () => void;
}
/**
 * GroundTruthDatasetUpload Component
 *
 * Supports uploading ground truth datasets via JSON file or manual entry.
 * Includes validation, preview, and progress tracking.
 *
 * @component
 */
export declare function GroundTruthDatasetUpload({ onSuccess, onCancel, }: GroundTruthDatasetUploadProps): import("react/jsx-runtime").JSX.Element;
export {};
