import type { CanonicalDocument } from '../../services/api';
import type { DocumentCounts } from './utils';
import { type LightweightDocument } from '../../utils/documentStateOptimization';
/**
 * Document type is now CanonicalDocument or LightweightDocument
 */
type Document = CanonicalDocument | LightweightDocument;
type FilterPreset = {
    id: string;
    name: string;
    filters: {
        documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
        documentTypeFilter: string | null;
        documentDateFilter: 'all' | 'week' | 'month' | 'year';
        documentWebsiteFilter: string | null;
        documentSearchQuery: string;
    };
};
type WebsiteInfo = {
    url: string;
    title: string;
};
interface Step3DocumentReviewProps {
    filteredDocuments: Document[];
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    documentSortBy: 'relevance' | 'date' | 'title' | 'website';
    documentSortDirection: 'asc' | 'desc';
    documentSearchQuery: string;
    documentTypeFilter: string | null;
    documentDateFilter: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter: string | null;
    debouncedDocumentSearchQuery: string;
    setDocumentFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
    setDocumentSortBy: (sortBy: 'relevance' | 'date' | 'title' | 'website') => void;
    setDocumentSortDirection: (direction: 'asc' | 'desc') => void;
    setDocumentSearchQuery: (query: string) => void;
    setDocumentTypeFilter: (filter: string | null) => void;
    setDocumentDateFilter: (filter: 'all' | 'week' | 'month' | 'year') => void;
    setDocumentWebsiteFilter: (filter: string | null) => void;
    handleSelectAllDocuments: () => void;
    handleStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
    handleBulkApprove: () => Promise<void>;
    handleBulkReject: () => Promise<void>;
    handleExportDocuments: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => void;
    handlePreviewDocument: (document: CanonicalDocument | LightweightDocument) => void;
    handleOpenWorkflowImport: () => void;
    setScrapingDocumentsFound: (count: number) => void;
    documentsLoadAttemptedRef: React.MutableRefObject<Map<string, number>>;
    filterPresets: FilterPreset[];
    saveFilterPreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
    deleteFilterPreset: (presetId: string) => void;
    saveDraftToStorage: () => void;
    uniqueDocumentTypes: string[];
    uniqueDocumentWebsites: WebsiteInfo[];
    documentCounts: DocumentCounts;
    overheidslagen: Array<{
        id: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
        label: string;
    }>;
    onFinalize?: () => Promise<void> | void;
}
export declare const Step3DocumentReview: React.FC<Step3DocumentReviewProps>;
export {};
