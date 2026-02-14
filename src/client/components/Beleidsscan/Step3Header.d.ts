/**
 * Step3 Header Component
 *
 * Header with title, loading state, error state, and action buttons.
 */
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
interface Step3HeaderProps {
    isLoadingDocuments: boolean;
    documentsError: string | null;
    documents: (CanonicalDocument | LightweightDocument)[];
    selectedDocuments: string[];
    onRetryDocumentLoad: () => void;
    onExport: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => void;
    onOpenWorkflowImport: () => void;
}
declare function Step3HeaderComponent({ isLoadingDocuments, documentsError, documents, selectedDocuments, onRetryDocumentLoad, onExport, onOpenWorkflowImport, }: Step3HeaderProps): import("react/jsx-runtime").JSX.Element;
export declare const Step3Header: import("react").MemoExoticComponent<typeof Step3HeaderComponent>;
export {};
