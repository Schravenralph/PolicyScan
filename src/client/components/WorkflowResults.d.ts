import { type BronDocument } from '../services/api';
import type { CanonicalDocument } from '../services/api';
interface WorkflowResultsProps {
    runId?: string;
    queryId?: string;
    onDocumentsLoaded?: (documents: BronDocument[] | CanonicalDocument[]) => void;
}
export declare function WorkflowResults({ runId, queryId, onDocumentsLoaded }: WorkflowResultsProps): import("react/jsx-runtime").JSX.Element;
export {};
