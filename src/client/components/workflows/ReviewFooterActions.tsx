/**
 * Review Footer Actions Component
 * 
 * Footer action buttons for the review dialog.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface ReviewFooterActionsProps {
  candidateCount: number;
  acceptedCount: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ReviewFooterActions({
  candidateCount,
  acceptedCount,
  submitting,
  onCancel,
  onSubmit,
}: ReviewFooterActionsProps) {
  return (
    <div className="flex-shrink-0 flex justify-between items-center gap-2 pt-4 border-t flex-wrap">
      <div className="text-sm text-muted-foreground">
        {t('workflowReview.candidatesShown').replace('{{count}}', String(candidateCount)).replace('{{plural}}', candidateCount !== 1 ? 'en' : '')}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={submitting || acceptedCount === 0}
          className="min-w-[180px]"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('workflowReview.submitting')}
            </>
          ) : (
            t('workflowReview.saveAndContinue').replace('{{count}}', String(acceptedCount))
          )}
        </Button>
      </div>
    </div>
  );
}
