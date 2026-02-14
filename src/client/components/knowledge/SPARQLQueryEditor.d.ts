/**
 * SPARQL Query Editor Component
 *
 * Provides a text editor for SPARQL queries with:
 * - Query input textarea
 * - Execute/Save buttons
 * - Query history dropdown
 * - Query templates dropdown
 * - Error display
 */
interface QueryTemplate {
    name: string;
    query: string;
}
interface SPARQLQueryEditorProps {
    query: string;
    onQueryChange: (query: string) => void;
    onExecute: () => void;
    onSave: () => void;
    queryLoading: boolean;
    queryError: string | null;
    queryHistory: string[];
    onLoadFromHistory: (query: string) => void;
    queryTemplates: QueryTemplate[];
    onLoadTemplate: (query: string) => void;
}
export declare function SPARQLQueryEditor({ query, onQueryChange, onExecute, onSave, queryLoading, queryError, queryHistory, onLoadFromHistory, queryTemplates, onLoadTemplate, }: SPARQLQueryEditorProps): import("react/jsx-runtime").JSX.Element;
export {};
