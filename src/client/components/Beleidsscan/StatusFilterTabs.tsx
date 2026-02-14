/**
 * Status Filter Tabs Component
 * 
 * Tabs for filtering documents by review status (all/pending/approved/rejected)
 * with counts and info popovers.
 */

import { memo } from 'react';
import { CheckCircle2, XCircle, Circle, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { t } from '../../utils/i18n';

type DocumentFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface DocumentCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

interface StatusFilterTabsProps {
  documentFilter: DocumentFilter;
  setDocumentFilter: (filter: DocumentFilter) => void;
  documentCounts: DocumentCounts;
  isLoadingDocuments: boolean;
  onSelectionClear: () => void;
}

function StatusFilterTabsComponent({
  documentFilter,
  setDocumentFilter,
  documentCounts,
  isLoadingDocuments,
  onSelectionClear,
}: StatusFilterTabsProps) {
  const getIcon = (filter: DocumentFilter) => {
    if (filter === 'approved') return <CheckCircle2 className="w-4 h-4" aria-hidden="true" />;
    if (filter === 'rejected') return <XCircle className="w-4 h-4" aria-hidden="true" />;
    if (filter === 'pending') return <Circle className="w-4 h-4" aria-hidden="true" />;
    return null;
  };

  const getCount = (filterKey: DocumentFilter) => {
    switch(filterKey) {
      case 'all': return documentCounts.total;
      case 'approved': return documentCounts.accepted;
      case 'rejected': return documentCounts.rejected;
      case 'pending': return documentCounts.pending;
      default: return 0;
    }
  };

  const getLabel = (filter: DocumentFilter) => {
    switch(filter) {
      case 'all': return t('statusFilterTabs.label.all');
      case 'pending': return t('statusFilterTabs.label.pending');
      case 'approved': return t('statusFilterTabs.label.approved');
      case 'rejected': return t('statusFilterTabs.label.rejected');
    }
  };

  const getTitle = (filter: DocumentFilter) => {
    switch(filter) {
      case 'all': return t('statusFilterTabs.title.all');
      case 'pending': return t('statusFilterTabs.title.pending');
      case 'approved': return t('statusFilterTabs.title.approved');
      case 'rejected': return t('statusFilterTabs.title.rejected');
    }
  };

  const getDescription = (filter: DocumentFilter) => {
    switch(filter) {
      case 'all': return t('statusFilterTabs.description.all');
      case 'pending': return t('statusFilterTabs.description.pending');
      case 'approved': return t('statusFilterTabs.description.approved');
      case 'rejected': return t('statusFilterTabs.description.rejected');
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-center" role="tablist" aria-label={t('statusFilterTabs.filterByStatus')}>
      {(['all', 'pending', 'approved', 'rejected'] as const).map((filter) => {
        const isActive = documentFilter === filter;

        return (
          <div key={filter} className="flex items-center gap-1">
            <button
              onClick={() => {
                setDocumentFilter(filter);
                onSelectionClear();
              }}
              disabled={isLoadingDocuments}
              data-testid={`document-filter-tab-${filter}`}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-background border-dashed border-border text-foreground hover:border-primary/50'
              }`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`document-filter-${filter}`}
            >
              {getIcon(filter)}
              <span>{getLabel(filter)}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
              }`}>
                {getCount(filter)}
              </span>
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="p-1 hover:bg-muted rounded transition-colors"
                  title={t('statusFilterTabs.filterInfo')}
                  aria-label={t('statusFilterTabs.filterInfoAria')}
                >
                  <Info className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-foreground">
                    {getTitle(filter)}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {getDescription(filter)}
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
    </div>
  );
}

// Memoize StatusFilterTabs to prevent unnecessary re-renders
// Only re-render when props actually change
export const StatusFilterTabs = memo(StatusFilterTabsComponent, (prevProps, nextProps) => {
  return (
    prevProps.documentFilter === nextProps.documentFilter &&
    prevProps.isLoadingDocuments === nextProps.isLoadingDocuments &&
    prevProps.documentCounts.total === nextProps.documentCounts.total &&
    prevProps.documentCounts.pending === nextProps.documentCounts.pending &&
    prevProps.documentCounts.accepted === nextProps.documentCounts.accepted &&
    prevProps.documentCounts.rejected === nextProps.documentCounts.rejected &&
    prevProps.setDocumentFilter === nextProps.setDocumentFilter &&
    prevProps.onSelectionClear === nextProps.onSelectionClear
  );
});
