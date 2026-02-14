/**
 * Scraping Info Dialog Component
 * 
 * Dialog providing information about the scraping process.
 */

import { memo } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { t } from '../../utils/i18n';

interface ScrapingInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

function ScrapingInfoDialogComponent({
  open,
  onOpenChange,
  disabled,
}: ScrapingInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
          disabled={disabled}
        >
          <Info className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif font-semibold text-foreground">
            {t('scrapingInfoDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('scrapingInfoDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4 text-foreground">
          <div className="p-3 rounded-lg bg-primary/5">
            <p className="text-sm font-medium mb-1">{t('scrapingInfoDialog.step1')}</p>
            <p className="text-xs text-muted-foreground">
              {t('scrapingInfoDialog.step1Description')}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5">
            <p className="text-sm font-medium mb-1">{t('scrapingInfoDialog.step2')}</p>
            <p className="text-xs text-muted-foreground">
              {t('scrapingInfoDialog.step2Description')}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5">
            <p className="text-sm font-medium mb-1">{t('scrapingInfoDialog.step3')}</p>
            <p className="text-xs text-muted-foreground">
              {t('scrapingInfoDialog.step3Description')}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/5">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{t('scrapingInfoDialog.note')}</strong> {t('scrapingInfoDialog.noteDescription')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoize ScrapingInfoDialog to prevent unnecessary re-renders
// Only re-render when props actually change
export const ScrapingInfoDialog = memo(ScrapingInfoDialogComponent, (prevProps, nextProps) => {
  return (
    prevProps.open === nextProps.open &&
    prevProps.onOpenChange === nextProps.onOpenChange &&
    prevProps.disabled === nextProps.disabled
  );
});
