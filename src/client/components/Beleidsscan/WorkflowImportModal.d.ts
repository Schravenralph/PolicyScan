import React from 'react';
import type { WorkflowOutput } from '../../services/api';
export interface WorkflowOutputSummary {
    name: string;
    createdAt: Date | string;
}
export interface WorkflowImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableOutputs: WorkflowOutputSummary[];
    selectedOutput: string | null;
    workflowOutput: WorkflowOutput | null;
    isLoading: boolean;
    isImporting: boolean;
    onSelectOutput: (outputName: string) => void;
    onImport: () => void;
    onLoadOutputs: () => void;
}
/**
 * Modal component for importing workflow results into Beleidsscan.
 *
 * Allows users to select from available workflow outputs and import
 * their results as documents in the current scan.
 *
 * @example
 * ```tsx
 * <WorkflowImportModal
 *   isOpen={showWorkflowImport}
 *   onClose={() => setShowWorkflowImport(false)}
 *   availableOutputs={availableWorkflowOutputs}
 *   selectedOutput={selectedWorkflowOutput}
 *   workflowOutput={workflowOutput}
 *   isLoading={isLoadingWorkflowOutputs}
 *   isImporting={isImportingWorkflow}
 *   onSelectOutput={loadWorkflowOutput}
 *   onImport={handleImportWorkflowResults}
 *   onLoadOutputs={loadWorkflowOutputs}
 * />
 * ```
 */
export declare const WorkflowImportModal: React.FC<WorkflowImportModalProps>;
