/**
 * DocumentSelector Component
 *
 * Allows users to browse and select canonical documents from different sources
 * (DSO/STOP-TPOD, IMRO, Rechtspraak) for ground truth datasets.
 */
type DocumentSource = 'DSO' | 'Rechtspraak';
interface DocumentSelectorProps {
    onDocumentsSelected: (documents: Array<{
        documentId: string;
        url: string;
        title: string;
        source: string;
    }>) => void;
    selectedDocumentIds?: Set<string>;
    source?: DocumentSource;
}
export declare function DocumentSelector({ onDocumentsSelected, selectedDocumentIds, source, }: DocumentSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
