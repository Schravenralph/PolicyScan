import { useCallback, useMemo } from 'react';
import { Clock, Save, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

interface DraftBannerProps {
  hasDraft: boolean;
  lastDraftSavedAt: string | null;
  lastDraftSummary?: {
    step: number;
    selectedWebsites: number;
    documents: number;
  } | null;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  loadDraftFromStorage: () => unknown;
}

export function DraftBanner({
  hasDraft,
  lastDraftSavedAt,
  lastDraftSummary,
  onRestoreDraft,
  onDiscardDraft,
  loadDraftFromStorage,
}: DraftBannerProps) {
  // Memoize formatDraftTimestamp to prevent function recreation on every render
  const formatDraftTimestamp = useCallback((timestamp?: string | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('nl-NL');
  }, []);

  // Memoize formatted timestamp to prevent recalculation
  const formattedTimestamp = useMemo(() => formatDraftTimestamp(lastDraftSavedAt), [formatDraftTimestamp, lastDraftSavedAt]);

  if (!hasDraft) {
    return null;
  }

  return (
    <div
      className="mb-10 p-4 rounded-xl border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-primary/5 border-primary/20"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">{t('draftBanner.draftSaved')}</p>
          <p className="text-xs text-muted-foreground">
            {formattedTimestamp || t('draftBanner.recentlySaved')} · {t('draftBanner.step').replace('{{step}}', String(lastDraftSummary?.step || 1))} · {t('draftBanner.websites').replace('{{count}}', String(lastDraftSummary?.selectedWebsites ?? 0))} · {t('draftBanner.documents').replace('{{count}}', String(lastDraftSummary?.documents ?? 0))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => {
            const draft = loadDraftFromStorage();
            if (draft) {
              onRestoreDraft();
            } else {
              toast.info(t('draftBanner.noDraftFound'), t('draftBanner.noDraftFoundDescription'));
            }
          }}
        >
          <Save className="w-4 h-4" />
          {t('draftBanner.resumeDraft')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          onClick={onDiscardDraft}
        >
          <XCircle className="w-4 h-4" />
          {t('draftBanner.discardDraft')}
        </Button>
      </div>
    </div>
  );
}
