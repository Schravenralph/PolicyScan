/**
 * Workflow Timeout Warning Dialog
 *
 * Warns users before workflow timeout and provides options to extend timeout or save progress.
 */
import React from 'react';
export interface WorkflowTimeoutWarningDialogProps {
    isOpen: boolean;
    remainingMs: number;
    onExtend?: () => void;
    onSaveProgress?: () => void;
    onDismiss?: () => void;
}
export declare function WorkflowTimeoutWarningDialog({ isOpen, remainingMs, onExtend, onSaveProgress, onDismiss, }: WorkflowTimeoutWarningDialogProps): React.ReactElement | null;
