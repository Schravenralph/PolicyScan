/**
 * Step1 Info Dialog Component
 * 
 * Dialog providing help and information about query configuration.
 */

import { memo } from 'react';
import { Building2, Map as MapIcon, Search, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { t } from '../../utils/i18n';

interface Step1InfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Step1InfoDialogComponent({
  open,
  onOpenChange,
}: Step1InfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Info className="w-4 h-4" />
          {t('step1.moreInfo')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-semibold font-serif text-foreground">
            {t('step1.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('step1.infoTitle')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4 text-foreground">
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {t('step1.selectGovernmentLayer')}
            </h4>
            <p className="text-sm mb-2 text-muted-foreground">
              {t('step1.selectGovernmentLayerDescription')}
            </p>
            <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
              <li><strong>{t('common.governmentType.gemeente')}:</strong> {t('step1.municipality').replace('Gemeente: ', '')}</li>
              <li><strong>{t('common.governmentType.waterschap')}:</strong> {t('step1.waterschap').replace('Waterschap: ', '')}</li>
              <li><strong>{t('common.governmentType.provincie')}:</strong> {t('step1.province').replace('Provincie: ', '')}</li>
              <li><strong>{t('common.governmentType.rijk')}:</strong> {t('step1.national').replace('Rijksoverheid: ', '')}</li>
              <li><strong>{t('common.governmentType.kennisinstituut')}:</strong> {t('step1.knowledgeInstitute').replace('Kennisinstituut: ', '')}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-primary" />
              {t('step1.selectEntity')}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t('step1.selectEntityDescription')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              {t('step1.enterSubject')}
            </h4>
            <p className="text-sm mb-2 text-muted-foreground">
              {t('step1.enterSubjectDescription')}
            </p>
            <ul className="text-sm space-y-1 ml-6 list-disc text-foreground">
              <li>{t('step1.tip1')}</li>
              <li>{t('step1.tip2')}</li>
              <li>{t('step1.tip3')}</li>
              <li>{t('step1.tip4')}</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-primary/5">
            <p className="text-sm font-medium mb-1 text-foreground">
              {t('step1.whatHappensNext')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('step1.whatHappensNextDescription')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoize Step1InfoDialog to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step1InfoDialog = memo(Step1InfoDialogComponent, (prevProps, nextProps) => {
  return (
    prevProps.open === nextProps.open &&
    prevProps.onOpenChange === nextProps.onOpenChange
  );
});
