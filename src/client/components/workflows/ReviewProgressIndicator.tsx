/**
 * Review Progress Indicator Component
 * 
 * Displays review progress with statistics and progress bar.
 */

import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface ReviewProgressIndicatorProps {
  totalCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  filteredCount?: number;
  hasFilter: boolean;
}

export function ReviewProgressIndicator({
  totalCount,
  acceptedCount,
  rejectedCount,
  pendingCount,
  filteredCount,
  hasFilter,
}: ReviewProgressIndicatorProps) {
  const completionPercentage = totalCount > 0 ? ((acceptedCount + rejectedCount) / totalCount) * 100 : 0;

  return (
    <div className="flex-shrink-0 space-y-2 p-4 bg-muted rounded-lg">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t('workflowReview.reviewProgress')}</span>
        <span className="text-muted-foreground">
          {acceptedCount + rejectedCount} {t('common.of')} {totalCount} {t('common.reviewed')} ({Math.round(completionPercentage)}%)
        </span>
      </div>
      <Progress value={completionPercentage} className="h-2" />
      <div className="flex gap-4 flex-wrap text-xs">
        <Badge variant="secondary" className="text-xs">
          {t('workflowReview.total')}: {totalCount}
        </Badge>
        <Badge variant="default" className="bg-green-600 text-xs">
          {t('workflowReview.accepted')}: {acceptedCount}
        </Badge>
        <Badge variant="destructive" className="text-xs">
          {t('workflowReview.rejected')}: {rejectedCount}
        </Badge>
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {t('workflowReview.pending')}: {pendingCount}
          </Badge>
        )}
        {hasFilter && filteredCount !== undefined && (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
            {t('workflowReview.filtered')}: {filteredCount}
          </Badge>
        )}
      </div>
    </div>
  );
}
