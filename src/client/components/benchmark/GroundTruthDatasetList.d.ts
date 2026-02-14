/**
 * Ground Truth Dataset interface
 * Matches the format defined in WI-517
 */
export interface GroundTruthDataset {
    _id: string;
    name: string;
    description?: string;
    queries: Array<{
        query: string;
        relevant_documents: Array<{
            url: string;
            relevance: number;
        }>;
    }>;
    created_at: string | Date;
    created_by?: string;
}
interface GroundTruthDatasetListProps {
    onSelectDataset?: (dataset: GroundTruthDataset) => void;
    onUploadClick?: () => void;
    showActions?: boolean;
}
/**
 * GroundTruthDatasetList Component
 *
 * Displays a list of ground truth datasets with search, filter, and action capabilities.
 * Supports viewing dataset details and deleting datasets.
 *
 * @component
 */
export declare function GroundTruthDatasetList({ onSelectDataset, onUploadClick, showActions, }: GroundTruthDatasetListProps): import("react/jsx-runtime").JSX.Element;
export {};
