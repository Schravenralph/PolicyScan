/**
 * Manual Query Entry Form Component
 *
 * Form for entering queries with manual URL inputs (used in manual upload mode).
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
interface ManualQueryEntryFormProps {
    queries: QueryEntry[];
    onAddQuery: () => void;
    onRemoveQuery: (index: number) => void;
    onQueryChange: (index: number, field: 'query', value: string) => void;
    onAddDocument: (queryIndex: number) => void;
    onRemoveDocument: (queryIndex: number, docIndex: number) => void;
    onDocumentChange: (queryIndex: number, docIndex: number, field: 'url' | 'relevance' | 'documentId' | 'source', value: string | number) => void;
    disabled?: boolean;
}
export declare function ManualQueryEntryForm({ queries, onAddQuery, onRemoveQuery, onQueryChange, onAddDocument, onRemoveDocument, onDocumentChange, disabled, }: ManualQueryEntryFormProps): import("react/jsx-runtime").JSX.Element;
export {};
