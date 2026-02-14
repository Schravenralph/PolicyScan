import React from 'react';
import { X, RefreshCw, FileText, Check, Download, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

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
export const WorkflowImportModal: React.FC<WorkflowImportModalProps> = ({
  isOpen,
  onClose,
  availableOutputs,
  selectedOutput,
  workflowOutput,
  isLoading,
  isImporting,
  onSelectOutput,
  onImport,
  onLoadOutputs: _onLoadOutputs
}) => {
  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border-primary rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border-2">
        {/* Modal Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold font-serif text-foreground">
                {t('workflowImportModal.title')}
              </h3>
              <p className="text-sm mt-1 text-muted-foreground">
                {t('beleidsscan.selectWorkflowOutputToImport')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label={t('workflowImportModal.close')}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('workflowImportModal.loading')}</span>
            </div>
          ) : availableOutputs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-foreground">{t('beleidsscan.noWorkflowOutputs')}</p>
              <p className="text-sm mt-2 text-muted-foreground">
                {t('workflowImportModal.noOutputsDescription')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOutputs.map((output) => (
                <button
                  key={output.name}
                  onClick={() => onSelectOutput(output.name)}
                  className={`w-full p-4 rounded-lg border-2 hover:shadow-md transition-all text-left ${selectedOutput === output.name
                      ? 'bg-muted border-primary'
                      : 'bg-background border-primary/50'
                    }`}
                  aria-pressed={selectedOutput === output.name}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary"
                    >
                      <FileText className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">
                        {output.name ? output.name.split('_')[0].replace(/-/g, ' ') : t('workflowImportModal.unknownOutput')}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {output.createdAt instanceof Date
                          ? output.createdAt.toLocaleString('nl-NL')
                          : new Date(output.createdAt).toLocaleString('nl-NL')}
                      </p>
                    </div>
                    {selectedOutput === output.name && (
                      <Check className="w-5 h-5 text-primary" aria-hidden="true" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected Output Preview */}
          {workflowOutput && (
            <div className="mt-6 p-4 rounded-lg bg-muted">
              <h4 className="font-medium mb-3 text-foreground">
                {t('beleidsscan.workflowResultsPreview')}
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg bg-background">
                  <div className="text-2xl font-bold text-primary">
                    {workflowOutput.trace?.totalUrlsVisited || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('workflowImportModal.urlsVisited')}</div>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <div className="text-2xl font-bold text-primary">
                    {workflowOutput.results?.summary?.totalDocuments || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('workflowImportModal.documents')}</div>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <div className="text-2xl font-bold text-destructive">
                    {workflowOutput.results?.endpoints?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('workflowImportModal.endpoints')}</div>
                </div>
              </div>

              {/* Endpoint Preview */}
              {workflowOutput.results?.endpoints && workflowOutput.results.endpoints.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2 text-foreground">
                    {t('workflowImportModal.foundEndpoints').replace('{{count}}', String(workflowOutput.results?.endpoints?.length || 0))}:
                  </h5>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(workflowOutput.results?.endpoints || []).slice(0, 5).map((endpoint, idx) => (
                      <div key={idx} className="text-sm flex items-center gap-2 p-2 rounded bg-background">
                        <ExternalLink className="w-3 h-3 flex-shrink-0 text-primary" />
                        <span className="truncate text-foreground">{endpoint.title}</span>
                      </div>
                    ))}
                    {(workflowOutput.results?.endpoints?.length || 0) > 5 && (
                      <p className="text-xs text-center py-1 text-muted-foreground">
                        {t('workflowImportModal.andMore').replace('{{count}}', String((workflowOutput.results?.endpoints?.length || 0) - 5))}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            className="border-border text-foreground hover:bg-muted"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onImport}
            disabled={!selectedOutput || !workflowOutput || isImporting}
            className={`${selectedOutput && workflowOutput && !isImporting
                ? 'bg-primary hover:bg-primary/90'
                : 'bg-muted text-muted-foreground'
              } text-primary-foreground`}
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {t('workflowImportModal.importing')}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t('workflowImportModal.importDocuments').replace('{{count}}', String(workflowOutput?.results?.summary?.totalDocuments || 0))}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

