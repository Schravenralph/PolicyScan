/**
 * Email Export Dialog Component
 * 
 * Dialog for sending document exports via email.
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { t } from '../../utils/i18n';

interface EmailExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailRecipients: string;
  onEmailRecipientsChange: (value: string) => void;
  onEmailExport: () => void;
  exporting: boolean;
  selectedCount: number;
  totalCount: number;
}

export function EmailExportDialog({
  open,
  onOpenChange,
  emailRecipients,
  onEmailRecipientsChange,
  onEmailExport,
  exporting,
  selectedCount,
  totalCount,
}: EmailExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.emailExport')}</DialogTitle>
          <DialogDescription>
            {t('common.emailExportDescription')}
            {selectedCount > 0 && (
              <span className="block mt-1 text-xs">
                {t('common.exporting')} {selectedCount} {t('common.of')} {totalCount} {t('common.selected')} {t('common.results')}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email-recipients">{t('common.recipients')}</Label>
            <Input
              id="email-recipients"
              type="text"
              placeholder={t('common.emailPlaceholder')}
              value={emailRecipients}
              onChange={(e) => onEmailRecipientsChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEmailRecipientsChange('');
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onEmailExport}
            disabled={exporting || !emailRecipients.trim()}
          >
            {exporting ? t('common.sending') : t('common.sendEmail')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
