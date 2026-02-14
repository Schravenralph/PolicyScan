/**
 * Workflow Recovery Dialog
 * 
 * Displays recovery options when a workflow fails or is cancelled.
 * Allows users to view partial results and resume from checkpoint.
 */

import React from 'react';
import type { PartialWorkflowResult } from '../../utils/workflowRecovery';
import { t } from '../../utils/i18n';

export interface WorkflowRecoveryDialogProps {
  isOpen: boolean;
  partialResults: PartialWorkflowResult | null;
  onClose: () => void;
  onResume?: () => void;
  onViewResults?: () => void;
  onDismiss?: () => void;
}

export function WorkflowRecoveryDialog({
  isOpen,
  partialResults,
  onClose,
  onResume,
  onViewResults,
  onDismiss,
}: WorkflowRecoveryDialogProps): React.ReactElement | null {
  if (!isOpen || !partialResults) {
    return null;
  }

  const { completedSteps, documentsFound, error, canResume } = partialResults;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border-primary rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 border-2">
        <h2 className="text-xl font-semibold mb-4">{t('workflowRecovery.title')}</h2>
        
        <div className="mb-4">
          <p className="text-gray-700 mb-2">
            {t('workflowRecovery.description')}
          </p>
          
          {completedSteps.length > 0 && (
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-600">{t('workflowRecovery.completedSteps')}:</p>
              <p className="text-sm text-gray-800">{t('workflowRecovery.stepsCompleted').replace('{{count}}', String(completedSteps.length))}</p>
            </div>
          )}
          
          {documentsFound !== undefined && (
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-600">{t('workflowRecovery.documentsFound')}:</p>
              <p className="text-sm text-gray-800">{t('workflowRecovery.documentsCount').replace('{{count}}', String(documentsFound))}</p>
            </div>
          )}
          
          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded">
              <p className="text-sm font-medium text-red-800">{t('workflowRecovery.error')}:</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {canResume && onResume && (
            <button
              onClick={() => {
                onResume();
                onClose();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t('workflowRecovery.resumeWorkflow')}
            </button>
          )}
          
          {onViewResults && (
            <button
              onClick={() => {
                onViewResults();
                onClose();
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              {t('workflowRecovery.viewPartialResults')}
            </button>
          )}
          
          <button
            onClick={() => {
              if (onDismiss) {
                onDismiss();
              }
              onClose();
            }}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            {t('workflowRecovery.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}


