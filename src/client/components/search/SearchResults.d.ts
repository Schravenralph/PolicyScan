/**
 * Search Results Component
 *
 * Displays search results including documents and related entities.
 */
interface SearchResult {
    documents: Array<{
        id: string;
        content: string;
        score: number;
        sourceUrl?: string;
        metadata: Record<string, unknown>;
    }>;
    relatedEntities: Array<{
        id: string;
        type: string;
        name: string;
        description?: string;
        category?: string;
    }>;
}
interface SearchResultsProps {
    results: SearchResult;
    selectedIds: Set<string>;
    exporting: boolean;
    includeCitations: boolean;
    citationFormat: 'apa' | 'custom';
    onToggleSelection: (docId: string) => void;
    onToggleSelectAll: () => void;
    onExport: (format: 'csv' | 'pdf') => Promise<void>;
    onEmailExport: () => void;
    onIncludeCitationsChange: (checked: boolean) => void;
    onCitationFormatChange: (format: 'apa' | 'custom') => void;
    onShowEmailDialog: () => void;
}
export declare function SearchResults({ results, selectedIds, exporting, includeCitations, citationFormat, onToggleSelection, onToggleSelectAll, onExport, onEmailExport: _onEmailExport, onIncludeCitationsChange, onCitationFormatChange, onShowEmailDialog, }: SearchResultsProps): import("react/jsx-runtime").JSX.Element;
export {};
