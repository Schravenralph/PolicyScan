import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { RealTimeGraphVisualizer } from '../RealTimeGraphVisualizer';
import { UnifiedWorkflowLogs } from '../workflow/UnifiedWorkflowLogs';
import { DocumentSourcesPanel } from '../workflow/DocumentSourcesPanel';
import { useRunLogs } from '../../hooks/useRunLogs';
import { t } from '../../utils/i18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface GraphVisualizerModalProps {
  isOpen: boolean;
  scrapingRunId: string | null;
  queryId?: string | null;
  onClose: () => void;
}

export function GraphVisualizerModal({
  isOpen,
  scrapingRunId,
  queryId,
  onClose,
}: GraphVisualizerModalProps) {
  const modalRef = useFocusTrap(isOpen, onClose);
  
  // Get workflow status to determine if it's running
  const { status } = useRunLogs({ 
    runId: scrapingRunId, 
    pollDelay: 2000,
    autoClearOnComplete: false
  });
  
  const isWorkflowRunning = status === 'running' || status === 'pending';

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="graph-visualizer-title"
    >
      <div 
        ref={modalRef}
        className="bg-white border-primary rounded-xl shadow-2xl w-full max-w-[95vw] xl:max-w-7xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden border-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Close Button */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h2 id="graph-visualizer-title" className="text-xl font-semibold font-serif text-foreground">
            Navigatiegrafiek Visualisatie
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="flex items-center gap-2"
            aria-label={t('graphVisualizerModal.close')}
          >
            <X className="w-4 h-4" />
            <span>Sluiten</span>
          </Button>
        </div>
        {scrapingRunId && /^[0-9a-fA-F]{24}$/.test(scrapingRunId) ? (
          <div className="flex-1 flex flex-col lg:flex-row gap-2 md:gap-4 p-2 md:p-4 min-h-0 overflow-hidden">
            {/* Document Sources - Left Side */}
            {queryId && (
              <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 flex flex-col min-h-0">
                <DocumentSourcesPanel
                  queryId={queryId}
                  workflowRunId={scrapingRunId}
                  isWorkflowRunning={isWorkflowRunning}
                />
              </div>
            )}
            {/* Navigation Graph - Center */}
            <div className="flex-1 min-w-0 flex flex-col">
              <RealTimeGraphVisualizer
                runId={scrapingRunId}
                onClose={onClose}
              />
            </div>
            {/* Workflow Logs - Right Side */}
            <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col">
              <UnifiedWorkflowLogs runId={scrapingRunId} variant="compact" />
            </div>
          </div>
        ) : scrapingRunId ? (
          <div className="flex-1 flex items-center justify-center flex-col p-8">
            <p className="text-red-600 mb-2 font-semibold">Invalid Workflow Run ID</p>
            <p className="text-sm text-muted-foreground mb-4">
              The workflow run ID format is invalid. Please start a new workflow.
            </p>
            <Button
              variant="outline"
              onClick={onClose}
              className="mt-4"
            >
              {t('beleidsscan.close')}
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground mb-2">{t('beleidsscan.startingScan')}</p>
            <p className="text-sm text-muted-foreground">{t('beleidsscan.graphVisualization')}</p>
            <Button
              variant="outline"
              onClick={onClose}
              className="mt-4"
            >
              {t('beleidsscan.close')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
