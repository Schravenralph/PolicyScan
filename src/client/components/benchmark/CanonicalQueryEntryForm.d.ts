/**
 * Canonical Query Entry Form Component
 *
 * Form for entering queries with canonical document selection (used in canonical upload mode).
 */
interface QueryEntry {
    query: string;
    relevant_documents: Array<{
        url: string;
        relevance: number;
        documentId?: string;
        source?: string;
    }>;
}
interface CanonicalQueryEntryFormProps {
    queries: QueryEntry[];
    onAddQuery: () => void;
    onRemoveQuery: (index: number) => void;
    onQueryChange: (index: number, field: 'query', value: string) => void;
    onRemoveDocument: (queryIndex: number, docIndex: number) => void;
    onDocumentChange: (queryIndex: number, docIndex: number, field: 'url' | 'relevance' | 'documentId' | 'source', value: string | number) => void;
    onDocumentsSelected: (queryIndex: number, selectedDocs: Array<{
        url: string;
        documentId?: string;
        source?: string;
    }>) => void;
    disabled?: boolean;
}
export declare function CanonicalQueryEntryForm({ queries, onAddQuery, onRemoveQuery, onQueryChange, onRemoveDocument, onDocumentChange, onDocumentsSelected, disabled, }: CanonicalQueryEntryFormProps): import("react/jsx-runtime").JSX.Element;
export {};
