import { Save } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence';
import { t } from '../../utils/i18n';

interface DraftRestorePromptDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pendingDraft: BeleidsscanDraft | null;
  overheidslagen: Array<{ id: string; label: string }>;
  onRestore: () => void;
  onDiscard: () => void;
  formatDraftTimestamp: (timestamp?: string | null) => string | null;
}

export function DraftRestorePromptDialog({
  isOpen,
  onOpenChange,
  pendingDraft,
  overheidslagen,
  onRestore,
  onDiscard,
  formatDraftTimestamp,
}: DraftRestorePromptDialogProps) {
  if (!pendingDraft) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif font-semibold text-foreground">
            {t('draftRestorePromptDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('draftRestorePromptDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4 text-foreground">
          {pendingDraft.onderwerp && (
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.subject')}</p>
              <p className="text-sm text-foreground">{pendingDraft.onderwerp}</p>
            </div>
          )}
          {pendingDraft.overheidslaag && (
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.governmentLayer')}</p>
              <p className="text-sm text-foreground">{overheidslagen.find(l => l.id === pendingDraft.overheidslaag)?.label}</p>
            </div>
          )}
          {pendingDraft.selectedEntity && (
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.entity')}</p>
              <p className="text-sm text-foreground">{pendingDraft.selectedEntity}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.lastSaved')}</p>
              <p className="text-sm text-foreground">{formatDraftTimestamp(pendingDraft.timestamp) || t('common.unknown')}</p>
            </div>
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.step')}</p>
              <p className="text-sm text-foreground">{t('draftRestorePromptDialog.stepValue').replace('{{step}}', String(pendingDraft.step || 1))}</p>
            </div>
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.websitesSelected')}</p>
              <p className="text-sm text-foreground">{pendingDraft.selectedWebsites?.length || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-background border border-border">
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('draftRestorePromptDialog.documentsFound')}</p>
              <p className="text-sm text-foreground">{pendingDraft.documents?.length || 0}</p>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {t('draftRestorePromptDialog.expirationNotice')}
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <Button
            onClick={() => {
              onDiscard();
              onOpenChange(false);
            }}
            variant="outline"
            className="flex-1 border-border text-foreground hover:bg-muted"
          >
            {t('draftRestorePromptDialog.ignoreAndContinue')}
          </Button>
          <Button
            onClick={onRestore}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="w-4 h-4 mr-2" />
            {t('draftRestorePromptDialog.restore')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


