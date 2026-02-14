/**
 * Workflow Recovery Dialog
 *
 * Displays recovery options when a workflow fails or is cancelled.
 * Allows users to view partial results and resume from checkpoint.
 */
import React from 'react';
import type { PartialWorkflowResult } from '../../utils/workflowRecovery';
export interface WorkflowRecoveryDialogProps {
    isOpen: boolean;
    partialResults: PartialWorkflowResult | null;
    onClose: () => void;
    onResume?: () => void;
    onViewResults?: () => void;
    onDismiss?: () => void;
}
export declare function WorkflowRecoveryDialog({ isOpen, partialResults, onClose, onResume, onViewResults, onDismiss, }: WorkflowRecoveryDialogProps): React.ReactElement | null;
