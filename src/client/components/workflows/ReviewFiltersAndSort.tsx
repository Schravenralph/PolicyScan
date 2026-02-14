/**
 * Review Filters and Sort Component
 * 
 * Filter and sort controls for candidate review.
 */

import { Search, ArrowUpDown } from 'lucide-react';
import { t } from '../../utils/i18n';

interface ReviewFiltersAndSortProps {
  filterQuery: string;
  onFilterChange: (query: string) => void;
  sortBy: 'relevance' | 'title' | 'url' | 'boost';
  onSortChange: (sortBy: 'relevance' | 'title' | 'url' | 'boost') => void;
  showOnlyAccepted: boolean;
  onShowOnlyAcceptedChange: (show: boolean) => void;
  showOnlyRejected: boolean;
  onShowOnlyRejectedChange: (show: boolean) => void;
  showOnlyPending: boolean;
  onShowOnlyPendingChange: (show: boolean) => void;
}

export function ReviewFiltersAndSort({
  filterQuery,
  onFilterChange,
  sortBy,
  onSortChange,
  showOnlyAccepted,
  onShowOnlyAcceptedChange,
  showOnlyRejected,
  onShowOnlyRejectedChange,
  showOnlyPending,
  onShowOnlyPendingChange,
}: ReviewFiltersAndSortProps) {
  return (
    <div className="flex-shrink-0 flex gap-2 p-2 bg-muted rounded-lg flex-wrap">
      <div className="flex-1 min-w-[200px] relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('workflowReview.filterCandidates')}
          value={filterQuery}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative">
          <ArrowUpDown className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as 'relevance' | 'title' | 'url' | 'boost')}
            className="pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary appearance-none bg-background"
          >
            <option value="relevance">{t('workflowReview.sortByRelevance')}</option>
            <option value="boost">{t('workflowReview.sortByBoostScore')}</option>
            <option value="title">{t('workflowReview.sortByTitle')}</option>
            <option value="url">{t('workflowReview.sortByUrl')}</option>
          </select>
        </div>
        <div className="flex gap-2 items-center text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyAccepted}
              onChange={(e) => {
                onShowOnlyAcceptedChange(e.target.checked);
                if (e.target.checked) {
                  onShowOnlyRejectedChange(false);
                  onShowOnlyPendingChange(false);
                }
              }}
              className="w-4 h-4"
            />
            <span>{t('workflowReview.accepted')}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyRejected}
              onChange={(e) => {
                onShowOnlyRejectedChange(e.target.checked);
                if (e.target.checked) {
                  onShowOnlyAcceptedChange(false);
                  onShowOnlyPendingChange(false);
                }
              }}
              className="w-4 h-4"
            />
            <span>{t('workflowReview.rejected')}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyPending}
              onChange={(e) => {
                onShowOnlyPendingChange(e.target.checked);
                if (e.target.checked) {
                  onShowOnlyAcceptedChange(false);
                  onShowOnlyRejectedChange(false);
                }
              }}
              className="w-4 h-4"
            />
            <span>{t('workflowReview.pending')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
