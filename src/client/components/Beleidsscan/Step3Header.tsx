/**
 * Step3 Header Component
 * 
 * Header with title, loading state, error state, and action buttons.
 */

import { memo } from 'react';
import { RefreshCw, AlertCircle, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { ExportMenu } from './ExportMenu';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import { t } from '../../utils/i18n';

interface Step3HeaderProps {
  isLoadingDocuments: boolean;
  documentsError: string | null;
  documents: (CanonicalDocument | LightweightDocument)[];
  selectedDocuments: string[];
  onRetryDocumentLoad: () => void;
  onExport: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => void;
  onOpenWorkflowImport: () => void;
}

function Step3HeaderComponent({
  isLoadingDocuments,
  documentsError,
  documents,
  selectedDocuments,
  onRetryDocumentLoad,
  onExport,
  onOpenWorkflowImport,
}: Step3HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex-1">
        <h2 id="step3-title" className="text-3xl mb-3 font-semibold font-serif text-foreground" data-testid="step3-heading">
          {t('step3Header.title')}
        </h2>
        {isLoadingDocuments ? (
          <div className="flex items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">
              {t('step3Header.loadingDocuments')}
            </p>
          </div>
        ) : documentsError ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10" role="alert" aria-live="assertive">
            <AlertCircle className="w-4 h-4 text-destructive" aria-hidden="true" />
            <p className="text-destructive">
              {documentsError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryDocumentLoad}
              className="ml-auto border-destructive text-destructive hover:bg-destructive/10"
              aria-label={t('step3.tryAgainAria')}
            >
              <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
              {t('step3.tryAgain')}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
            {t('step3Header.documentsFound').replace('{{count}}', String(documents.length))}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Export Button */}
        {documents.length > 0 && !isLoadingDocuments && !documentsError && (
          <ExportMenu
            selectedCount={selectedDocuments.length}
            onExport={onExport}
          />
        )}
        {/* Workflow Import Button - kept as it's a functional button, not just info */}
        {onOpenWorkflowImport && (
          <Button
            onClick={onOpenWorkflowImport}
            variant="outline"
            className="flex items-center gap-2 border-purple-500 text-purple-500 hover:bg-purple-50"
            aria-label={t('step3.importWorkflowResultsAria')}
          >
            <Zap className="w-4 h-4" aria-hidden="true" />
            <span>{t('step3Header.importWorkflow')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// Memoize Step3Header to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3Header = memo(Step3HeaderComponent, (prevProps, nextProps) => {
  return (
    prevProps.isLoadingDocuments === nextProps.isLoadingDocuments &&
    prevProps.documentsError === nextProps.documentsError &&
    prevProps.documents.length === nextProps.documents.length &&
    prevProps.selectedDocuments.length === nextProps.selectedDocuments.length &&
    prevProps.onRetryDocumentLoad === nextProps.onRetryDocumentLoad &&
    prevProps.onExport === nextProps.onExport &&
    prevProps.onOpenWorkflowImport === nextProps.onOpenWorkflowImport
  );
});
