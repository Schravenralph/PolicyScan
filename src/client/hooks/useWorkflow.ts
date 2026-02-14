import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { WorkflowOutput, BronDocument, BronWebsite } from '../services/api';
import { logError } from '../utils/errorHandler';

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
export function useWorkflow(): UseWorkflowReturn {
  const [availableOutputs, setAvailableOutputs] = useState<WorkflowOutputSummary[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const [workflowOutput, setWorkflowOutput] = useState<WorkflowOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadOutputs = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const outputs = await api.getWorkflowOutputs();
      setAvailableOutputs(
        outputs.map((o) => ({
          name: o.name,
          createdAt: new Date(o.createdAt),
        }))
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load workflow outputs');
      setError(error);
      logError(error, 'load-workflow-outputs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOutput = useCallback(async (outputName: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const output = await api.getWorkflowOutput(outputName);
      setWorkflowOutput(output);
      setSelectedOutput(outputName);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load workflow output');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importOutput = useCallback(
    async (
      outputName: string,
      queryId: string
    ): Promise<{
      documents: BronDocument[];
      websites: BronWebsite[];
      documentsCreated: number;
      websitesCreated: number;
    }> => {
      setIsImporting(true);
      setError(null);
      try {
        const result = await api.convertWorkflowOutputToDocuments(outputName, queryId);
        return {
          documents: result.documents,
          websites: result.websites,
          documentsCreated: result.documentsCreated,
          websitesCreated: result.websitesCreated,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to import workflow output');
        setError(error);
        throw error;
      } finally {
        setIsImporting(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    availableOutputs,
    selectedOutput,
    workflowOutput,
    isLoading,
    isImporting,
    error,
    loadOutputs,
    loadOutput,
    importOutput,
    setSelectedOutput,
    setWorkflowOutput,
    clearError,
  };
}

