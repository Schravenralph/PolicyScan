/**
 * Step3 Info Dialogs Component
 * 
 * Dialogs providing help and information about document review
 * and workflow import functionality.
 */

import { memo } from 'react';
import { Info, CheckSquare, Filter, FileText, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { t } from '../../utils/i18n';

interface Step3InfoDialogsProps {
  showStep3Info: boolean;
  setShowStep3Info: (show: boolean) => void;
  showWorkflowInfo: boolean;
  setShowWorkflowInfo: (show: boolean) => void;
  onOpenWorkflowImport: () => void;
}

function Step3InfoDialogsComponent({
  showStep3Info,
  setShowStep3Info,
  showWorkflowInfo,
  setShowWorkflowInfo,
  onOpenWorkflowImport,
}: Step3InfoDialogsProps) {
  return (
    <>
      <Dialog open={showStep3Info} onOpenChange={setShowStep3Info}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
            aria-label={t('step3InfoDialogs.helpReviewingDocuments')}
          >
            <Info className="w-4 h-4" aria-hidden="true" />
            <span>Hulp</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-semibold font-serif text-foreground">
              {t('step3.title')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('step3.reviewInfoTitle')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4 text-foreground">
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                Document statusen
              </h4>
              <p className="text-sm mb-2 text-muted-foreground">
                Elk document heeft een status die u kunt instellen:
              </p>
              <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                <li><strong>{t('step3.toReview')}:</strong> {t('step3.toReviewDescription')}</li>
                <li><strong>{t('step3.approved')}:</strong> {t('step3.approvedDescription')}</li>
                <li><strong>{t('step3.rejected')}:</strong> {t('step3.rejectedDescription')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Filteren en sorteren
              </h4>
              <p className="text-sm mb-2 text-muted-foreground">
                Gebruik de filter tabs om documenten te bekijken op basis van status:
              </p>
              <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
                <li><strong>{t('step3.all')}:</strong> {t('step3.allDescription')}</li>
                <li><strong>{t('step3.toReview')}:</strong> {t('step3.toReviewOnlyDescription')}</li>
                <li><strong>{t('step3.approved')}:</strong> {t('step3.approvedOnlyDescription')}</li>
                <li><strong>{t('step3.rejected')}:</strong> {t('step3.rejectedOnlyDescription')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                Bulk acties
              </h4>
              <p className="text-sm text-muted-foreground">
                Selecteer meerdere documenten met de checkboxes en gebruik de bulk acties om ze tegelijk
                goed te keuren of af te keuren. Dit bespaart tijd bij het beoordelen van grote aantallen documenten.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Document details
              </h4>
              <p className="text-sm text-muted-foreground">
                Elk document toont een samenvatting, relevantie voor uw zoekopdracht, en een link naar de originele bron.
                Gebruik deze informatie om te bepalen of het document relevant is voor uw onderzoek.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm font-medium mb-1 text-foreground">
                Volgende stappen
              </p>
              <p className="text-sm text-muted-foreground">
                {t('step3.afterReviewing')}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-2">
        <Dialog open={showWorkflowInfo} onOpenChange={setShowWorkflowInfo}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
              aria-label={t('step3InfoDialogs.workflowImportInfoAria')}
            >
              <Info className="w-4 h-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif font-semibold text-foreground">
                {t('beleidsscan.workflowImportDialogTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('beleidsscan.workflowImportDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4 text-foreground">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4 text-purple-600" />
                  {t('beleidsscan.workflowImportWhatTitle')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('beleidsscan.workflowImportWhatBody')}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-sm">{t('beleidsscan.workflowImportHowTitle')}</h4>
                <ol className="text-sm space-y-1 ml-6 list-decimal text-foreground">
                  <li>{t('beleidsscan.workflowImportStepStart')}</li>
                  <li>{t('beleidsscan.selectWorkflowOutputStep')}</li>
                  <li>{t('beleidsscan.workflowImportStepPreview')}</li>
                  <li>{t('beleidsscan.workflowImportStepImport')}</li>
                </ol>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{t('beleidsscan.tipLabel')}</strong>{' '}
                  {t('beleidsscan.workflowImportTipText')}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          onClick={onOpenWorkflowImport}
          variant="outline"
          className="flex items-center gap-2 border-purple-500 text-purple-500 hover:bg-purple-50"
          aria-label={t('beleidsscan.importWorkflowResults')}
        >
          <Zap className="w-4 h-4" aria-hidden="true" />
          <span>{t('beleidsscan.importWorkflowResults')}</span>
        </Button>
      </div>
    </>
  );
}

// Memoize Step3InfoDialogs to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3InfoDialogs = memo(Step3InfoDialogsComponent, (prevProps, nextProps) => {
  return (
    prevProps.showStep3Info === nextProps.showStep3Info &&
    prevProps.setShowStep3Info === nextProps.setShowStep3Info &&
    prevProps.showWorkflowInfo === nextProps.showWorkflowInfo &&
    prevProps.setShowWorkflowInfo === nextProps.setShowWorkflowInfo &&
    prevProps.onOpenWorkflowImport === nextProps.onOpenWorkflowImport
  );
});
