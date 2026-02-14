/**
 * Workflow Timeout Warning Dialog
 * 
 * Warns users before workflow timeout and provides options to extend timeout or save progress.
 */

import React from 'react';
import { formatRemainingTime } from '../../utils/workflowTimeoutWarning';
import { t } from '../../utils/i18n';

export interface WorkflowTimeoutWarningDialogProps {
  isOpen: boolean;
  remainingMs: number;
  onExtend?: () => void;
  onSaveProgress?: () => void;
  onDismiss?: () => void;
}

export function WorkflowTimeoutWarningDialog({
  isOpen,
  remainingMs,
  onExtend,
  onSaveProgress,
  onDismiss,
}: WorkflowTimeoutWarningDialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  const remainingTime = formatRemainingTime(remainingMs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border-primary rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 border-2">
        <h2 className="text-xl font-semibold mb-4 text-yellow-600">{t('workflowTimeout.warning')}</h2>
        
        <div className="mb-4">
          <p className="text-gray-700 mb-2" dangerouslySetInnerHTML={{ __html: t('workflowTimeout.willTimeoutIn').replace('{{time}}', remainingTime) }} />
          <p className="text-sm text-gray-600">
            {t('workflowTimeout.extendOrSave')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {onExtend && (
            <button
              onClick={() => {
                onExtend();
                if (onDismiss) {
                  onDismiss();
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t('workflowTimeout.extendTimeout')}
            </button>
          )}
          
          {onSaveProgress && (
            <button
              onClick={() => {
                onSaveProgress();
                if (onDismiss) {
                  onDismiss();
                }
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              {t('workflowTimeout.saveProgress')}
            </button>
          )}
          
          <button
            onClick={() => {
              if (onDismiss) {
                onDismiss();
              }
            }}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            {t('workflowTimeout.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}


