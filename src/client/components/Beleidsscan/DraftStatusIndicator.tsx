/**
 * Draft Status Indicator Component
 * 
 * Shows draft status with last saved timestamp and summary.
 */

import { memo } from 'react';
import { Save, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { DraftSummary } from '../../hooks/useDraftPersistence.js';
import { t } from '../../utils/i18n';

interface DraftStatusIndicatorProps {
  hasDraft: boolean;
  lastDraftSavedAt: string | null;
  lastDraftSummary: DraftSummary | null;
  formatTimestamp: (timestamp?: string | null) => string | null;
}

function DraftStatusIndicatorComponent({
  hasDraft,
  lastDraftSavedAt,
  lastDraftSummary,
  formatTimestamp,
}: DraftStatusIndicatorProps) {
  if (!hasDraft) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
          aria-label={t('draftStatusIndicator.viewDraftStatusAria')}
          title={t('draftStatusIndicator.viewDraftStatus')}
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm font-medium">Concept opgeslagen</span>
          {lastDraftSavedAt && (
            <Clock className="w-3 h-3 opacity-70" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold mb-1 text-foreground">
              Conceptstatus
            </h4>
            {lastDraftSavedAt && (
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" aria-hidden="true" />
                Laatst opgeslagen: {formatTimestamp(lastDraftSavedAt)}
              </p>
            )}
          </div>
          {lastDraftSummary && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-1 text-foreground">
                Samenvatting:
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Stap: {lastDraftSummary.step}</li>
                <li>Geselecteerde websites: {lastDraftSummary.selectedWebsites}</li>
                <li>Documenten: {lastDraftSummary.documents}</li>
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Memoize DraftStatusIndicator to prevent unnecessary re-renders
// Only re-render when props actually change
export const DraftStatusIndicator = memo(DraftStatusIndicatorComponent, (prevProps, nextProps) => {
  return (
    prevProps.hasDraft === nextProps.hasDraft &&
    prevProps.lastDraftSavedAt === nextProps.lastDraftSavedAt &&
    prevProps.formatTimestamp === nextProps.formatTimestamp &&
    // Deep compare lastDraftSummary object
    (prevProps.lastDraftSummary === nextProps.lastDraftSummary ||
      (prevProps.lastDraftSummary?.step === nextProps.lastDraftSummary?.step &&
        prevProps.lastDraftSummary?.selectedWebsites === nextProps.lastDraftSummary?.selectedWebsites &&
        prevProps.lastDraftSummary?.documents === nextProps.lastDraftSummary?.documents))
  );
});
