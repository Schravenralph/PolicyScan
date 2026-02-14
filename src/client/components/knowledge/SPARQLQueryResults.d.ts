/**
 * SPARQL Query Results Component
 *
 * Displays SPARQL query results with:
 * - Results table
 * - CSV export
 * - Loading/error states
 * - Different result types (records, boolean, triples)
 */
import type { SPARQLQueryResult } from '../../services/api/KnowledgeGraphManagementApiService';
interface SPARQLQueryResultsProps {
    queryResult: SPARQLQueryResult | null;
    queryLoading: boolean;
    queryError: string | null;
}
export declare function SPARQLQueryResults({ queryResult, queryLoading, queryError, }: SPARQLQueryResultsProps): import("react/jsx-runtime").JSX.Element;
export {};
