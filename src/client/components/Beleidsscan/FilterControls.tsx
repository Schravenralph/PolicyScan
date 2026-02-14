import React, { useCallback, memo } from 'react';
import {
  Search,
  X,
  ArrowUpDown,
  Filter,
  Calendar,
  Globe,
  Save,
  ChevronDown,
} from 'lucide-react';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

type FilterPreset = {
  id: string;
  name: string;
  filters: {
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    documentTypeFilter: string | null;
    documentDateFilter: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter: string | null;
    documentSearchQuery: string;
  };
};

type WebsiteInfo = { url: string; title: string };

interface FilterControlsProps {
  // Search
  documentSearchQuery: string;
  setDocumentSearchQuery: (query: string) => void;

  // Sort
  documentSortBy: 'relevance' | 'date' | 'title' | 'website';
  documentSortDirection: 'asc' | 'desc';
  setDocumentSortBy: (sortBy: 'relevance' | 'date' | 'title' | 'website') => void;
  setDocumentSortDirection: (direction: 'asc' | 'desc') => void;

  // Filters
  documentTypeFilter: string | null;
  documentDateFilter: 'all' | 'week' | 'month' | 'year';
  documentWebsiteFilter: string | null;
  documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
  setDocumentTypeFilter: (filter: string | null) => void;
  setDocumentDateFilter: (filter: 'all' | 'week' | 'month' | 'year') => void;
  setDocumentWebsiteFilter: (filter: string | null) => void;
  setDocumentFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;

  // Options
  uniqueDocumentTypes: string[];
  uniqueDocumentWebsites: WebsiteInfo[];
  filterPresets: FilterPreset[];
  deleteFilterPreset: (presetId: string) => void;
  isLoadingDocuments: boolean;

  // Preset dialog
  setShowPresetDialog: (show: boolean) => void;
  setPresetName: (name: string) => void;
}

function FilterControlsComponent({
  documentSearchQuery,
  setDocumentSearchQuery,
  documentSortBy,
  documentSortDirection,
  setDocumentSortBy,
  setDocumentSortDirection,
  documentTypeFilter,
  documentDateFilter,
  documentWebsiteFilter,
  documentFilter,
  setDocumentTypeFilter,
  setDocumentDateFilter,
  setDocumentWebsiteFilter,
  setDocumentFilter,
  uniqueDocumentTypes,
  uniqueDocumentWebsites,
  filterPresets,
  deleteFilterPreset,
  isLoadingDocuments,
  setShowPresetDialog,
  setPresetName,
}: FilterControlsProps): React.ReactElement {
  const hasActiveFilters = !!(documentSearchQuery || documentTypeFilter || documentDateFilter !== 'all' || documentWebsiteFilter);

  // Memoize clear filters handler to prevent unnecessary re-renders
  const handleClearFilters = useCallback(() => {
    setDocumentSearchQuery('');
    setDocumentTypeFilter(null);
    setDocumentDateFilter('all');
    setDocumentWebsiteFilter(null);
  }, [setDocumentSearchQuery, setDocumentTypeFilter, setDocumentDateFilter, setDocumentWebsiteFilter]);

  const handleApplyPreset = (preset: FilterPreset) => {
    setDocumentFilter(preset.filters.documentFilter);
    setDocumentTypeFilter(preset.filters.documentTypeFilter);
    setDocumentDateFilter(preset.filters.documentDateFilter);
    setDocumentWebsiteFilter(preset.filters.documentWebsiteFilter);
    setDocumentSearchQuery(preset.filters.documentSearchQuery);
  };

  const handleSavePreset = () => {
    if (documentSearchQuery || documentTypeFilter || documentDateFilter !== 'all' || documentWebsiteFilter || documentFilter !== 'all') {
      setPresetName('');
      setShowPresetDialog(true);
    } else {
      toast.info(t('filterControls.noFilters'), t('filterControls.noFiltersDescription'));
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4" role="search" aria-label={t('filterControls.searchAndFilter')}>
      {/* Search Input */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input
          id="document-search-input"
          placeholder={t('filterControls.searchPlaceholder')}
          value={documentSearchQuery}
          onChange={(e) => setDocumentSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            // Standardize Enter key: prevent form submission, just filter
            if (e.key === 'Enter') {
              e.preventDefault();
              // Focus first result if available
              const firstDocument = document.querySelector('[data-testid="document-list"] button') as HTMLElement;
              firstDocument?.focus();
            }
          }}
          disabled={isLoadingDocuments}
          className={`pl-10 pr-10 border-2 disabled:opacity-50 disabled:cursor-not-allowed bg-background ${documentSearchQuery ? 'border-primary' : 'border-border'}`}
          aria-label={t('filterControls.searchAria')}
          aria-describedby="document-search-help"
        />
        <span id="document-search-help" className="sr-only">{t('filterControls.searchHelp')}</span>
        {documentSearchQuery && (
          <button
            onClick={() => setDocumentSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-muted rounded"
            aria-label={t('filterControls.clearQuery')}
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Sort Dropdown */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="document-sort-select" className="sr-only">{t('filterControls.sortBy')}</label>
        <select
          id="document-sort-select"
          value={documentSortBy}
          onChange={(e) => setDocumentSortBy(e.target.value as 'relevance' | 'date' | 'title' | 'website')}
          disabled={isLoadingDocuments}
          className={`px-3 py-2 border-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-background text-foreground ${documentSortBy !== 'relevance' ? 'border-primary' : 'border-border'}`}
          aria-label={t('filterControls.sortBy')}
        >
          <option value="relevance">{t('filterControls.sortByRelevance')}</option>
          <option value="date">{t('filterControls.sortByDate')}</option>
          <option value="title">{t('filterControls.sortByTitle')}</option>
          <option value="website">{t('filterControls.sortByWebsite')}</option>
        </select>
        {documentSortBy !== 'relevance' && (
          <button
            onClick={() => setDocumentSortDirection(documentSortDirection === 'asc' ? 'desc' : 'asc')}
            className="p-2 hover:bg-muted rounded transition-colors"
            title={`Sorteer ${documentSortDirection === 'asc' ? t('filterControls.sortAscending') : t('filterControls.sortDescending')}`}
            aria-label={`Sorteer ${documentSortDirection === 'asc' ? t('filterControls.sortAscending') : t('filterControls.sortDescending')}`}
          >
            <span aria-hidden="true">{documentSortDirection === 'asc' ? '↑' : '↓'}</span>
          </button>
        )}
      </div>

      {/* Type Filter */}
      {uniqueDocumentTypes.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="document-type-filter" className="sr-only">{t('filterControls.filterByType')}</label>
          <select
            id="document-type-filter"
            value={documentTypeFilter || ''}
            onChange={(e) => setDocumentTypeFilter(e.target.value || null)}
            disabled={isLoadingDocuments}
            className={`px-3 py-2 border-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-background text-foreground ${documentTypeFilter ? 'border-primary' : 'border-border'}`}
            aria-label={t('filterControls.filterByType')}
          >
            <option value="">{t('filterControls.allTypes')}</option>
            {uniqueDocumentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      )}

      {/* Date Filter */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="document-date-filter" className="sr-only">{t('filterControls.filterByDate')}</label>
        <select
          id="document-date-filter"
          value={documentDateFilter}
          onChange={(e) => setDocumentDateFilter(e.target.value as 'all' | 'week' | 'month' | 'year')}
          disabled={isLoadingDocuments}
          className={`px-3 py-2 border-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-background text-foreground ${documentDateFilter !== 'all' ? 'border-primary' : 'border-border'}`}
          aria-label={t('filterControls.filterByDate')}
        >
          <option value="all">{t('filterControls.allDates')}</option>
          <option value="week">{t('filterControls.lastWeek')}</option>
          <option value="month">{t('filterControls.lastMonth')}</option>
          <option value="year">{t('filterControls.lastYear')}</option>
        </select>
      </div>

      {/* Website Filter */}
      {uniqueDocumentWebsites.length > 0 && (
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="document-website-filter" className="sr-only">{t('filterControls.filterByWebsite')}</label>
          <select
            id="document-website-filter"
            value={documentWebsiteFilter || ''}
            onChange={(e) => setDocumentWebsiteFilter(e.target.value || null)}
            disabled={isLoadingDocuments}
            className={`px-3 py-2 border-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-background text-foreground ${documentWebsiteFilter ? 'border-primary' : 'border-border'}`}
            aria-label={t('filterControls.filterByWebsite')}
          >
            <option value="">{t('filterControls.allWebsites')}</option>
            {uniqueDocumentWebsites.map((website) => (
              <option key={website.url} value={website.url}>{website.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={handleClearFilters}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded hover:bg-muted transition-colors text-muted-foreground"
          aria-label={t('filterControls.clearFiltersAria')}
        >
          <X className="w-3 h-3" aria-hidden="true" />
          {t('filterControls.clearFilters')}
        </button>
      )}

      {/* Filter Presets */}
      <div className="flex items-center gap-2">
        <Save className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 text-sm px-3 py-2 rounded border-2 hover:bg-muted transition-colors bg-background border-border text-foreground"
              aria-label={t('filterControls.filterPresets')}
            >
              <span>{t('filterControls.presets')}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t('filterControls.filterPresetsLabel')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {filterPresets.length === 0 ? (
              <DropdownMenuItem disabled>
                <span className="text-xs text-muted-foreground">{t('filterControls.noPresetsSaved')}</span>
              </DropdownMenuItem>
            ) : (
              filterPresets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-2">
                  <DropdownMenuItem
                    onClick={() => handleApplyPreset(preset)}
                    className="flex-1"
                  >
                    {preset.name}
                  </DropdownMenuItem>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFilterPreset(preset.id);
                      toast.success(t('filterControls.presetDeleted'), t('filterControls.presetDeletedDescription').replace('{{name}}', preset.name));
                    }}
                    className="p-1 hover:bg-red-50 rounded text-red-600"
                    aria-label={t('filterControls.deletePreset').replace('{{name}}', preset.name)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSavePreset}>
              <Save className="w-4 h-4 mr-2" />
              {t('filterControls.saveCurrentFilters')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Memoize FilterControls to prevent unnecessary re-renders
// Only re-render when props actually change
export const FilterControls = memo(FilterControlsComponent, (prevProps, nextProps) => {
  return (
    prevProps.documentSearchQuery === nextProps.documentSearchQuery &&
    prevProps.documentSortBy === nextProps.documentSortBy &&
    prevProps.documentSortDirection === nextProps.documentSortDirection &&
    prevProps.documentTypeFilter === nextProps.documentTypeFilter &&
    prevProps.documentDateFilter === nextProps.documentDateFilter &&
    prevProps.documentWebsiteFilter === nextProps.documentWebsiteFilter &&
    prevProps.documentFilter === nextProps.documentFilter &&
    prevProps.uniqueDocumentTypes.length === nextProps.uniqueDocumentTypes.length &&
    prevProps.uniqueDocumentWebsites.length === nextProps.uniqueDocumentWebsites.length &&
    prevProps.filterPresets.length === nextProps.filterPresets.length &&
    prevProps.isLoadingDocuments === nextProps.isLoadingDocuments &&
    prevProps.setDocumentSearchQuery === nextProps.setDocumentSearchQuery &&
    prevProps.setDocumentSortBy === nextProps.setDocumentSortBy &&
    prevProps.setDocumentSortDirection === nextProps.setDocumentSortDirection &&
    prevProps.setDocumentTypeFilter === nextProps.setDocumentTypeFilter &&
    prevProps.setDocumentDateFilter === nextProps.setDocumentDateFilter &&
    prevProps.setDocumentWebsiteFilter === nextProps.setDocumentWebsiteFilter &&
    prevProps.setDocumentFilter === nextProps.setDocumentFilter &&
    prevProps.deleteFilterPreset === nextProps.deleteFilterPreset &&
    prevProps.setShowPresetDialog === nextProps.setShowPresetDialog &&
    prevProps.setPresetName === nextProps.setPresetName
  );
});



