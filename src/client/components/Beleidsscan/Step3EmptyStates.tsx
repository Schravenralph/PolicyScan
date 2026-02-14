/**
 * Step3 Empty States Component
 * 
 * Empty state displays for no documents found and no filtered documents.
 */

import { memo } from 'react';
import { Filter, FileText, ArrowLeft, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface Step3EmptyStatesProps {
  hasDocuments: boolean;
  hasFilteredDocuments: boolean;
  documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
  onClearFilter: () => void;
  onGoToStep2: () => void;
  onOpenWorkflowImport: () => void;
}

function Step3EmptyStatesComponent({
  hasDocuments,
  hasFilteredDocuments,
  documentFilter,
  onClearFilter,
  onGoToStep2,
  onOpenWorkflowImport,
}: Step3EmptyStatesProps) {
  if (hasFilteredDocuments) {
    return null; // Don't show empty state if there are filtered documents
  }

  if (hasDocuments) {
    // No documents match the current filter
    return (
      <div className="mt-8 p-8 rounded-xl text-center bg-destructive/10 border border-destructive/20">
        <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h4 className="text-lg mb-2 font-semibold font-serif text-foreground">
          Geen documenten met deze filter
        </h4>
        <p className="mb-4 text-sm text-foreground">
          {t('step3.noDocumentsWithStatus').replace('{{status}}', 
            documentFilter === 'pending' ? t('step3.status.pending') : 
            documentFilter === 'approved' ? t('step3.status.approved') : 
            t('step3.status.rejected')
          )}
        </p>
        <Button
          onClick={onClearFilter}
          variant="outline"
          className="mt-2 border-primary text-primary hover:bg-primary/10"
          aria-label={t('step3.showAllDocumentsAria')}
        >
          {t('step3.showAllDocuments')}
        </Button>
      </div>
    );
  }

  // No documents found at all
  return (
    <div className="mt-8 p-8 rounded-xl text-center bg-destructive/10 border border-destructive/20">
      <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
      <h4 className="text-xl mb-2 font-serif font-semibold text-foreground">
        {t('common.noDocumentsFound')}
      </h4>
      <p className="mb-4 text-foreground">
        {t('step3.noDocumentsFoundDescription')}
      </p>
      <div className="space-y-2 text-sm text-left max-w-md mx-auto mb-6 text-muted-foreground">
        <p><strong className="text-foreground">{t('step3.possibleCauses')}</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t('step3.cause1')}</li>
          <li>{t('step3.cause2')}</li>
          <li>{t('step3.cause3')}</li>
        </ul>
      </div>
      <div className="flex gap-4 justify-center">
        <Button
          onClick={onGoToStep2}
          variant="outline"
          className="border-primary text-primary hover:bg-primary/10"
          aria-label={t('step3.scrapeMoreWebsitesAria')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('step3.scrapeMoreWebsites')}
        </Button>
        <Button
          onClick={onOpenWorkflowImport}
          variant="outline"
          className="border-purple-500 text-purple-500 hover:bg-purple-50"
          aria-label={t('beleidsscan.importWorkflowResults')}
        >
          <Zap className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('beleidsscan.importWorkflowResults')}
        </Button>
      </div>
    </div>
  );
}

// Memoize Step3EmptyStates to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3EmptyStates = memo(Step3EmptyStatesComponent, (prevProps, nextProps) => {
  return (
    prevProps.hasDocuments === nextProps.hasDocuments &&
    prevProps.hasFilteredDocuments === nextProps.hasFilteredDocuments &&
    prevProps.documentFilter === nextProps.documentFilter &&
    prevProps.onClearFilter === nextProps.onClearFilter &&
    prevProps.onGoToStep2 === nextProps.onGoToStep2 &&
    prevProps.onOpenWorkflowImport === nextProps.onOpenWorkflowImport
  );
});
