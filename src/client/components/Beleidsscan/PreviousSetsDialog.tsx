import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, Calendar, Building2, FileText, Globe, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { api, type QueryData } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';

export interface PreviousSetsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSet: (query: QueryData) => void;
}

/**
 * Dialog component for selecting from previous completed query sets.
 * 
 * Allows users to view, search, filter, and load previously completed query sets
 * into the wizard to continue working with them.
 * 
 * @example
 * ```tsx
 * <PreviousSetsDialog
 *   isOpen={showPreviousSets}
 *   onClose={() => setShowPreviousSets(false)}
 *   onSelectSet={handleLoadQuerySet}
 * />
 * ```
 */
export const PreviousSetsDialog: React.FC<PreviousSetsDialogProps> = ({
  isOpen,
  onClose,
  onSelectSet
}) => {
  const [completedQueries, setCompletedQueries] = useState<QueryData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Debounce search query to prevent excessive filtering (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'topic' | 'entity'>('date');

  // Load completed queries when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadCompletedQueries();
    }
  }, [isOpen]);

  const loadCompletedQueries = async () => {
    setIsLoading(true);
    try {
      const queries = await api.query.getCompletedQueries({ limit: 100 });
      setCompletedQueries(Array.isArray(queries) ? queries : []);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(t('workflow.failedToLoadCompletedQueries')), 'load-completed-queries');
      setCompletedQueries([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Memoize lowercased search query to avoid calling toLowerCase() multiple times
  // This optimization is especially important when filtering many queries
  const searchQueryLower = useMemo(() => 
    debouncedSearchQuery.trim() ? debouncedSearchQuery.toLowerCase() : null,
    [debouncedSearchQuery]
  );

  // Filter and sort queries
  const filteredQueries = useMemo(() => {
    let filtered = [...completedQueries];

    // Search filter (use memoized lowercased query)
    if (searchQueryLower) {
      filtered = filtered.filter(q =>
        q.onderwerp?.toLowerCase().includes(searchQueryLower) ||
        q.overheidsinstantie?.toLowerCase().includes(searchQueryLower) ||
        q.overheidstype?.toLowerCase().includes(searchQueryLower)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(q => q.overheidstype === filterType);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date': {
          const dateA = a.finalizedAt ? new Date(a.finalizedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const dateB = b.finalizedAt ? new Date(b.finalizedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return dateB - dateA; // Most recent first
        }
        case 'topic':
          return (a.onderwerp || '').localeCompare(b.onderwerp || '');
        case 'entity':
          return (a.overheidsinstantie || '').localeCompare(b.overheidsinstantie || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [completedQueries, searchQueryLower, filterType, sortBy]);

  const handleSelectQuery = (query: QueryData) => {
    onSelectSet(query);
    onClose();
  };

  // Memoize formatDate to prevent function recreation on every render
  // This is especially important when rendering many query items
  const formatDate = useCallback((date?: string | Date) => {
    if (!date) return t('common.unknown');
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getGovernmentTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      'gemeente': t('common.governmentType.gemeente'),
      'waterschap': t('common.governmentType.waterschap'),
      'provincie': t('common.governmentType.provincie'),
      'rijk': t('common.governmentType.rijk'),
      'kennisinstituut': t('common.governmentType.kennisinstituut')
    };
    return labels[type || ''] || type || t('common.unknown');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border-primary rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border-2">
        {/* Modal Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold font-serif text-foreground">
                {t('previousSetsDialog.title')}
              </h3>
              <p className="text-sm mt-1 text-muted-foreground">
                {t('previousSetsDialog.description')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="p-4 border-b border-border">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t('previousSets.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-border bg-background"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border-2 rounded-lg text-sm bg-background border-border text-foreground"
            >
              <option value="all">{t('previousSets.allTypes')}</option>
              <option value="gemeente">{t('common.governmentType.gemeente')}</option>
              <option value="waterschap">{t('common.governmentType.waterschap')}</option>
              <option value="provincie">{t('common.governmentType.provincie')}</option>
              <option value="rijk">{t('common.governmentType.rijk')}</option>
              <option value="kennisinstituut">{t('common.governmentType.kennisinstituut')}</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'topic' | 'entity')}
              className="px-3 py-2 border-2 rounded-lg text-sm bg-background border-border text-foreground"
            >
              <option value="date">{t('previousSets.sortByDate')}</option>
              <option value="topic">{t('previousSets.sortByTopic')}</option>
              <option value="entity">{t('previousSets.sortByEntity')}</option>
            </select>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('previousSets.loading')}</span>
            </div>
          ) : filteredQueries.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium text-foreground">
                {searchQuery || filterType !== 'all'
                  ? t('previousSets.noResults')
                  : t('previousSets.noCompletedQueries')}
              </p>
              <p className="text-sm mt-2 text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? t('common.tryOtherSearchTerms')
                  : t('previousSets.completeQuerySetToSee')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQueries.map((query) => (
                <div
                  key={query._id}
                  className="border-2 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer border-border bg-background hover:border-primary/50"
                  onClick={() => handleSelectQuery(query)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {getGovernmentTypeLabel(query.overheidstype)}
                        </span>
                        {query.overheidsinstantie && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-muted-foreground">
                              {query.overheidsinstantie}
                            </span>
                          </>
                        )}
                      </div>
                      <h4 className="text-lg font-semibold mb-2 text-foreground">
                        {query.onderwerp}
                      </h4>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(query.finalizedAt || query.createdAt)}</span>
                        </div>
                        {query.websiteUrls && query.websiteUrls.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Globe className="w-4 h-4" />
                            <span>{t('previousSetsDialog.websites').replace('{{count}}', String(query.websiteUrls.length)).replace('{{plural}}', query.websiteUrls.length !== 1 ? 's' : '')}</span>
                          </div>
                        )}
                        {query.documentUrls && query.documentUrls.length > 0 && (
                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            <span>{t('previousSetsDialog.documents').replace('{{count}}', String(query.documentUrls.length)).replace('{{plural}}', query.documentUrls.length !== 1 ? 'en' : '')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectQuery(query);
                      }}
                      className="border-primary text-primary hover:bg-primary/10"
                    >
                      {t('previousSetsDialog.load')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-border text-foreground hover:bg-muted"
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
};

