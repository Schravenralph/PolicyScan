import type { GroundTruthDataset } from './GroundTruthDatasetList';
interface GroundTruthDatasetViewProps {
    datasetId: string;
    dataset?: GroundTruthDataset;
    onBack?: () => void;
    onEdit?: (dataset: GroundTruthDataset) => void;
}
/**
 * GroundTruthDatasetView Component
 *
 * Displays detailed view of a ground truth dataset including all queries
 * and their relevant documents with relevance scores.
 *
 * @component
 */
export declare function GroundTruthDatasetView({ datasetId, dataset: initialDataset, onBack, onEdit, }: GroundTruthDatasetViewProps): import("react/jsx-runtime").JSX.Element;
export {};
