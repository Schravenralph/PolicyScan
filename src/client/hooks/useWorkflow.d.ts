import type { WorkflowOutput, BronDocument, BronWebsite } from '../services/api';
export interface WorkflowOutputSummary {
    name: string;
    createdAt: Date;
}
export interface UseWorkflowReturn {
    availableOutputs: WorkflowOutputSummary[];
    selectedOutput: string | null;
    workflowOutput: WorkflowOutput | null;
    isLoading: boolean;
    isImporting: boolean;
    error: Error | null;
    loadOutputs: () => Promise<void>;
    loadOutput: (outputName: string) => Promise<void>;
    importOutput: (outputName: string, queryId: string) => Promise<{
        documents: BronDocument[];
        websites: BronWebsite[];
        documentsCreated: number;
        websitesCreated: number;
    }>;
    setSelectedOutput: (name: string | null) => void;
    setWorkflowOutput: (output: WorkflowOutput | null) => void;
    clearError: () => void;
}
/**
 * Custom hook for workflow management
 * Handles workflow output loading and importing
 */
export declare function useWorkflow(): UseWorkflowReturn;
