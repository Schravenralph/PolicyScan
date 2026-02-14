/**
 * Library Filters Component
 * 
 * Provides filtering controls for the library page:
 * - Query ID filter
 * - Workflow Run ID filter
 * - Review Status filter
 * - Source filter
 * - Active filters display with remove buttons
 */

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface LibraryFiltersProps {
  queryIdFilter: string;
  onQueryIdFilterChange: (value: string) => void;
  workflowRunIdFilter: string;
  onWorkflowRunIdFilterChange: (value: string) => void;
  reviewStatusFilter: 'pending_review' | 'approved' | 'rejected' | 'needs_revision' | 'all';
  onReviewStatusFilterChange: (value: 'pending_review' | 'approved' | 'rejected' | 'needs_revision' | 'all') => void;
  sourceFilter: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'all';
  onSourceFilterChange: (value: 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'all') => void;
  onPageReset: () => void;
}

export function LibraryFilters({
  queryIdFilter,
  onQueryIdFilterChange,
  workflowRunIdFilter,
  onWorkflowRunIdFilterChange,
  reviewStatusFilter,
  onReviewStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  onPageReset,
}: LibraryFiltersProps) {
  const hasActiveFilters = queryIdFilter.trim() || workflowRunIdFilter.trim() || reviewStatusFilter !== 'all' || sourceFilter !== 'all';

  return (
    <>
      {/* Filter Controls */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="queryId-filter" className="mb-2 block">
            {t('libraryFilters.filterByQueryId')}
          </Label>
          <Input
            id="queryId-filter"
            placeholder={t('libraryFilters.queryIdPlaceholder')}
            value={queryIdFilter}
            onChange={(e) => {
              onQueryIdFilterChange(e.target.value);
              onPageReset();
            }}
            className="w-full"
          />
        </div>
        <div>
          <Label htmlFor="workflowRunId-filter" className="mb-2 block">
            {t('libraryFilters.filterByWorkflowRunId')}
          </Label>
          <Input
            id="workflowRunId-filter"
            placeholder={t('libraryFilters.workflowRunIdPlaceholder')}
            value={workflowRunIdFilter}
            onChange={(e) => {
              onWorkflowRunIdFilterChange(e.target.value);
              onPageReset();
            }}
            className="w-full"
          />
        </div>
        <div>
          <Label htmlFor="reviewStatus-filter" className="mb-2 block">
            {t('libraryFilters.filterByReviewStatus')}
          </Label>
          <select
            id="reviewStatus-filter"
            value={reviewStatusFilter}
            onChange={(e) => {
              onReviewStatusFilterChange(e.target.value as typeof reviewStatusFilter);
              onPageReset();
            }}
            className="w-full h-10 px-3 py-2 text-sm border border-input bg-background rounded-md"
          >
            <option value="all">{t('libraryFilters.allStatuses')}</option>
            <option value="pending_review">{t('libraryFilters.pendingReview')}</option>
            <option value="approved">{t('libraryFilters.approved')}</option>
            <option value="rejected">{t('libraryFilters.rejected')}</option>
            <option value="needs_revision">{t('libraryFilters.needsRevision')}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="source-filter" className="mb-2 block">
            {t('libraryFilters.filterBySource')}
          </Label>
          <select
            id="source-filter"
            value={sourceFilter}
            onChange={(e) => {
              onSourceFilterChange(e.target.value as typeof sourceFilter);
              onPageReset();
            }}
            className="w-full h-10 px-3 py-2 text-sm border border-input bg-background rounded-md"
          >
            <option value="all">{t('libraryFilters.allSources')}</option>
            <option value="DSO">{t('libraryFilters.source.dso')}</option>
            <option value="Rechtspraak">{t('libraryFilters.source.rechtspraak')}</option>
            <option value="Wetgeving">{t('libraryFilters.source.wetgeving')}</option>
            <option value="Gemeente">{t('libraryFilters.source.gemeente')}</option>
            <option value="PDOK">{t('libraryFilters.source.pdok')}</option>
            <option value="Web">{t('libraryFilters.source.web')}</option>
          </select>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap gap-2">
          {queryIdFilter.trim() && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t('libraryFilters.queryId')} {queryIdFilter.trim()}
              <button
                onClick={() => {
                  onQueryIdFilterChange('');
                  onPageReset();
                }}
                className="ml-1 hover:text-destructive"
                aria-label={t('libraryFilters.removeQueryIdFilter')}
              >
                ×
              </button>
            </Badge>
          )}
          {workflowRunIdFilter.trim() && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t('libraryFilters.workflowRunId')} {workflowRunIdFilter.trim()}
              <button
                onClick={() => {
                  onWorkflowRunIdFilterChange('');
                  onPageReset();
                }}
                className="ml-1 hover:text-destructive"
                aria-label={t('libraryFilters.removeWorkflowRunIdFilter')}
              >
                ×
              </button>
            </Badge>
          )}
          {reviewStatusFilter !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t('libraryFilters.status')} {reviewStatusFilter === 'pending_review' ? t('libraryFilters.pendingReview') : reviewStatusFilter === 'approved' ? t('libraryFilters.approved') : reviewStatusFilter === 'rejected' ? t('libraryFilters.rejected') : t('libraryFilters.needsRevision')}
              <button
                onClick={() => {
                  onReviewStatusFilterChange('all');
                  onPageReset();
                }}
                className="ml-1 hover:text-destructive"
                aria-label={t('libraryFilters.removeReviewStatusFilter')}
              >
                ×
              </button>
            </Badge>
          )}
          {sourceFilter !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t('libraryFilters.source')} {sourceFilter}
              <button
                onClick={() => {
                  onSourceFilterChange('all');
                  onPageReset();
                }}
                className="ml-1 hover:text-destructive"
                aria-label={t('libraryFilters.removeSourceFilter')}
              >
                ×
              </button>
            </Badge>
          )}
        </div>
      )}
    </>
  );
}
