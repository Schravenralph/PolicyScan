/**
 * Review Bulk Operations Component
 * 
 * Bulk action buttons for selecting, accepting, and rejecting candidates.
 */

import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface ReviewBulkOperationsProps {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkAccept: () => void;
  onBulkReject: () => void;
}

export function ReviewBulkOperations({
  onSelectAll,
  onDeselectAll,
  onBulkAccept,
  onBulkReject,
}: ReviewBulkOperationsProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between p-2 bg-muted/50 rounded-lg flex-wrap gap-2">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectAll}
          className="text-xs"
        >
          {t('workflowReview.selectAllVisible')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDeselectAll}
          className="text-xs"
        >
          {t('workflowReview.deselectAllVisible')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkAccept}
          className="text-xs text-green-700 border-green-300 hover:bg-green-50"
        >
          {t('workflowReview.acceptAllVisible')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkReject}
          className="text-xs text-red-700 border-red-300 hover:bg-red-50"
        >
          {t('workflowReview.rejectAllVisible')}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground hidden sm:block">
        <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs">Ctrl/Cmd+A</kbd> {t('workflowReview.selectAll')} | 
        <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs ml-1">Ctrl/Cmd+D</kbd> {t('workflowReview.deselect')} | 
        <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs ml-1">Ctrl/Cmd+Enter</kbd> {t('workflowReview.submit')}
      </div>
    </div>
  );
}
