/**
 * Dataset Preview Section Component
 *
 * Displays preview of dataset before upload.
 */
import type { GroundTruthDataset } from './GroundTruthDatasetList';
interface DatasetPreviewSectionProps {
    previewData: GroundTruthDataset | null;
}
export declare function DatasetPreviewSection({ previewData }: DatasetPreviewSectionProps): import("react/jsx-runtime").JSX.Element | null;
export {};
