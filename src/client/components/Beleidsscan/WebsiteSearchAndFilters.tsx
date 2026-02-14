/**
 * Website Search and Filters Component
 * 
 * Search input, filter dropdown, sort dropdown, bulk actions,
 * and selection summary for website selection.
 */

import { memo, useMemo } from 'react';
import { Search, Filter, X, Info, CheckSquare, Square } from 'lucide-react';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { BronWebsite } from '../../services/api';
import { t } from '../../utils/i18n';

interface WebsiteSearchAndFiltersProps {
  websiteSearchQuery: string;
  onSearchChange: (query: string) => void;
  websiteFilterType: string | null;
  onFilterChange: (type: string | null) => void;
  websiteSortBy: 'relevance' | 'name' | 'type';
  onSortChange: (sortBy: 'relevance' | 'name' | 'type') => void;
  uniqueWebsiteTypes: string[];
  selectedWebsites: string[];
  filteredAndSortedWebsites: BronWebsite[];
  suggestedWebsites: BronWebsite[];
  onSelectAll: () => void;
  onClearFilters: () => void;
}

function WebsiteSearchAndFiltersComponent({
  websiteSearchQuery,
  onSearchChange,
  websiteFilterType,
  onFilterChange,
  websiteSortBy,
  onSortChange,
  uniqueWebsiteTypes,
  selectedWebsites,
  filteredAndSortedWebsites,
  suggestedWebsites,
  onSelectAll,
  onClearFilters,
}: WebsiteSearchAndFiltersProps) {
  // Memoize computed values to prevent recalculation on every render
  const allSelected = useMemo(() => 
    selectedWebsites.length === filteredAndSortedWebsites.length && filteredAndSortedWebsites.length > 0,
    [selectedWebsites.length, filteredAndSortedWebsites.length]
  );
  const hasFilters = useMemo(() => 
    !!(websiteSearchQuery || websiteFilterType),
    [websiteSearchQuery, websiteFilterType]
  );

  return (
    <div className="mt-8 space-y-4" role="search" aria-label={t('websiteSearch.searchAndFilter')}>
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            id="website-search-input"
            placeholder={t('websiteSearch.searchPlaceholder')}
            value={websiteSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              // Standardize Enter key: prevent form submission, just filter
              if (e.key === 'Enter') {
                e.preventDefault();
                // Focus first result if available
                const firstWebsite = document.querySelector('[data-testid="website-suggestions-list"] button') as HTMLElement;
                firstWebsite?.focus();
              }
            }}
            className={`pl-10 pr-10 border-2 bg-background ${websiteSearchQuery ? 'border-primary' : 'border-border'}`}
            aria-label={t('websiteSearch.searchAria')}
            aria-describedby="website-search-help"
          />
          <span id="website-search-help" className="sr-only">{t('websiteSearch.searchHelp')}</span>
          {websiteSearchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-muted rounded"
              aria-label={t('websiteSearch.clearQuery')}
            >
              <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter by Type */}
        {uniqueWebsiteTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="website-type-filter" className="sr-only">{t('websiteSearch.filterByType')}</label>
            <select
              id="website-type-filter"
              value={websiteFilterType || ''}
              onChange={(e) => onFilterChange(e.target.value || null)}
              className={`px-3 py-2 border-2 rounded-lg text-sm bg-background border-border text-foreground ${websiteFilterType ? 'border-primary' : ''}`}
              aria-label={t('websiteSearch.filterByType')}
            >
              <option value="">{t('websiteSearch.allTypes')}</option>
              {uniqueWebsiteTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                title={t('websiteSearch.sortInfo')}
                aria-label={t('websiteSearch.sortInfoAria')}
              >
                <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80" role="tooltip">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-foreground">{t('websiteSearch.sortOptions')}</h4>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li><strong>{t('websiteSearch.sortByRelevance')}:</strong> {t('websiteSearch.sortByRelevanceDescription')}</li>
                  <li><strong>{t('websiteSearch.sortByName')}:</strong> {t('websiteSearch.sortByNameDescription')}</li>
                  <li><strong>{t('websiteSearch.sortByType')}:</strong> {t('websiteSearch.sortByTypeDescription')}</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
          <label htmlFor="website-sort-select" className="sr-only">{t('websiteSearch.sortBy')}</label>
          <select
            id="website-sort-select"
            value={websiteSortBy}
            onChange={(e) => onSortChange(e.target.value as 'relevance' | 'name' | 'type')}
            className="px-3 py-2 border-2 rounded-lg text-sm bg-background border-border text-foreground"
            aria-label={t('websiteSearch.sortBy')}
          >
            <option value="relevance">{t('websiteSearch.sortByRelevance')}</option>
            <option value="name">{t('websiteSearch.sortByName')}</option>
            <option value="type">{t('websiteSearch.sortByType')}</option>
          </select>
        </div>
      </div>

      {/* Selection Summary and Bulk Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-primary/5" role="region" aria-label={t('websiteSearch.selectionSummary')}>
        <div className="flex items-center gap-4">
          <button
            onClick={onSelectAll}
            data-testid="select-all-websites-button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 hover:shadow-sm transition-all bg-background border-primary text-primary"
            aria-label={allSelected ? t('websiteSearch.deselectAll') : t('websiteSearch.selectAll')}
          >
            {allSelected ? (
              <>
                <CheckSquare className="w-4 h-4" aria-hidden="true" />
                <span>{t('common.deselectAll')}</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" aria-hidden="true" />
                <span>{t('common.selectAll')}</span>
              </>
            )}
          </button>
          <div className="text-sm text-foreground" role="status" aria-live="polite" aria-atomic="true">
            <strong>{selectedWebsites.length}</strong> {t('websiteSearch.of')} <strong>{filteredAndSortedWebsites.length}</strong> {t('websiteSearch.websitesSelectedText')}
            {hasFilters && (
              <span className="ml-2 text-muted-foreground">
                {t('websiteSearch.ofTotal').replace('{{count}}', String(Array.isArray(suggestedWebsites) ? suggestedWebsites.length : 0))}
              </span>
            )}
          </div>
        </div>
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-2 text-sm px-3 py-1 rounded hover:bg-background transition-colors text-muted-foreground"
            aria-label={t('websiteSearch.clearFiltersAria')}
          >
            <X className="w-3 h-3" aria-hidden="true" />
            <span>{t('websiteSearch.clearFilters')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Memoize WebsiteSearchAndFilters to prevent unnecessary re-renders
// Only re-render when props actually change
export const WebsiteSearchAndFilters = memo(WebsiteSearchAndFiltersComponent, (prevProps, nextProps) => {
  return (
    prevProps.websiteSearchQuery === nextProps.websiteSearchQuery &&
    prevProps.onSearchChange === nextProps.onSearchChange &&
    prevProps.websiteFilterType === nextProps.websiteFilterType &&
    prevProps.onFilterChange === nextProps.onFilterChange &&
    prevProps.websiteSortBy === nextProps.websiteSortBy &&
    prevProps.onSortChange === nextProps.onSortChange &&
    prevProps.uniqueWebsiteTypes.length === nextProps.uniqueWebsiteTypes.length &&
    prevProps.selectedWebsites.length === nextProps.selectedWebsites.length &&
    prevProps.filteredAndSortedWebsites.length === nextProps.filteredAndSortedWebsites.length &&
    prevProps.suggestedWebsites.length === nextProps.suggestedWebsites.length &&
    prevProps.onSelectAll === nextProps.onSelectAll &&
    prevProps.onClearFilters === nextProps.onClearFilters
  );
});
