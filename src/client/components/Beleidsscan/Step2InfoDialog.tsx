/**
 * Step2 Info Dialog Component
 * 
 * Dialog providing help and information about website selection and scraping.
 */

import { memo } from 'react';
import { Search, Zap, FileText, AlertCircle, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { t } from '../../utils/i18n';

interface Step2InfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Step2InfoDialogComponent({
  open,
  onOpenChange,
}: Step2InfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
          aria-label={t('step2InfoDialog.moreInfoStep2')}
        >
          <Info className="w-4 h-4" aria-hidden="true" />
          {t('step2InfoDialog.moreInfo')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-semibold font-serif text-foreground">
            {t('step2InfoDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('step2InfoDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4 text-foreground">
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              {t('step2InfoDialog.websiteSelectionTitle')}
            </h4>
            <p className="text-sm mb-2 text-muted-foreground">
              {t('step2InfoDialog.websiteSelectionDescription')}
            </p>
            <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
              <li><strong>{t('step2InfoDialog.search')}:</strong> {t('step2InfoDialog.searchDescription')}</li>
              <li><strong>{t('step2InfoDialog.filter')}:</strong> {t('step2InfoDialog.filterDescription')}</li>
              <li><strong>{t('step2InfoDialog.sort')}:</strong> {t('step2InfoDialog.sortDescription')}</li>
              <li><strong>{t('step2InfoDialog.selectAll')}:</strong> {t('step2InfoDialog.selectAllDescription')}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              {t('step2InfoDialog.scrapingTitle')}
            </h4>
            <p className="text-sm mb-2 text-muted-foreground">
              {t('step2InfoDialog.scrapingDescription')}
            </p>
            <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
              <li>{t('step2InfoDialog.scrapingPoint1')}</li>
              <li>{t('step2InfoDialog.scrapingPoint2')}</li>
              <li>{t('step2InfoDialog.scrapingPoint3')}</li>
              <li>{t('step2InfoDialog.scrapingPoint4')}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {t('step2InfoDialog.graphVisualizationTitle')}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t('step2InfoDialog.graphVisualizationDescription')}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-destructive/5">
            <p className="text-sm font-medium mb-1 flex items-center gap-2 text-foreground">
              <AlertCircle className="w-4 h-4 text-destructive" />
              {t('step2InfoDialog.tip')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('step2InfoDialog.tipDescription')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoize Step2InfoDialog to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step2InfoDialog = memo(Step2InfoDialogComponent, (prevProps, nextProps) => {
  return (
    prevProps.open === nextProps.open &&
    prevProps.onOpenChange === nextProps.onOpenChange
  );
});
