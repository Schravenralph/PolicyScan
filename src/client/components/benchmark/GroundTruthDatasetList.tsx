import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Search, Trash2, Eye, Calendar, FileText, Plus, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

/**
 * Ground Truth Dataset interface
 * Matches the format defined in WI-517
 */
export interface GroundTruthDataset {
  _id: string;
  name: string;
  description?: string;
  queries: Array<{
    query: string;
    relevant_documents: Array<{
      url: string;
      relevance: number; // 0-4 scale or binary (0/1)
    }>;
  }>;
  created_at: string | Date;
  created_by?: string;
}

interface GroundTruthDatasetListProps {
  onSelectDataset?: (dataset: GroundTruthDataset) => void;
  onUploadClick?: () => void;
  showActions?: boolean;
}

/**
 * GroundTruthDatasetList Component
 * 
 * Displays a list of ground truth datasets with search, filter, and action capabilities.
 * Supports viewing dataset details and deleting datasets.
 * 
 * @component
 */
export function GroundTruthDatasetList({
  onSelectDataset,
  onUploadClick,
  showActions = true,
}: GroundTruthDatasetListProps) {
  const [datasets, setDatasets] = useState<GroundTruthDataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const announcementRef = useRef<HTMLDivElement>(null);

  const loadDatasets = React.useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      const queryToUse = search !== undefined ? search : searchQuery.trim();
      if (queryToUse) {
        params.append('search', queryToUse);
      }
      const queryString = params.toString();
      const endpoint = queryString 
        ? `/benchmark/ground-truth/datasets?${queryString}`
        : '/benchmark/ground-truth/datasets';
      
      const response = await api.get<{
        entries: GroundTruthDataset[];
        total: number;
      }>(endpoint);
      const loadedDatasets = response.entries || [];
      setDatasets(loadedDatasets);
      
      // Announce results to screen readers
      if (loadedDatasets.length === 0) {
        setAnnouncement(searchQuery 
          ? t('groundTruth.noDatasetsFoundFor').replace('{{query}}', searchQuery)
          : t('groundTruth.noDatasetsAvailable'));
      } else {
        setAnnouncement(t('groundTruth.datasetsLoaded')
          .replace('{{count}}', String(loadedDatasets.length))
          .replace('{{plural}}', loadedDatasets.length !== 1 ? 's' : ''));
      }
    } catch (error) {
      logError(error, 'load-ground-truth-datasets');
      toast.error(t('groundTruth.failedToLoadDatasets'), t('groundTruth.failedToLoadDatasetsDesc'));
      setDatasets([]);
      setAnnouncement(t('groundTruth.errorLoadingDatasets'));
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Load datasets on mount
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Debounced search - reload datasets when search query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadDatasets(searchQuery.trim());
    }, 300); // Debounce search by 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadDatasets]);

  const handleDelete = async (datasetId: string, datasetName: string) => {
    if (!confirm(t('groundTruth.confirmDeleteDataset').replace('{{name}}', datasetName))) {
      return;
    }

    setDeletingId(datasetId);
    try {
      await api.delete(`/benchmark/ground-truth/datasets/${datasetId}`);
      
      // Reload datasets to reflect the deletion
      await loadDatasets(searchQuery.trim());
      toast.success(t('groundTruth.datasetDeleted'), t('groundTruth.datasetDeletedDesc').replace('{{name}}', datasetName));
      setAnnouncement(t('groundTruth.datasetDeletedAnnouncement').replace('{{name}}', datasetName));
    } catch (error) {
      logError(error, 'delete-ground-truth-dataset');
      toast.error(t('groundTruth.failedToDeleteDataset'), t('groundTruth.failedToDeleteDatasetDesc'));
      setAnnouncement(t('groundTruth.errorDeletingDataset'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = (dataset: GroundTruthDataset) => {
    if (onSelectDataset) {
      onSelectDataset(dataset);
    }
  };

  const getQueryCount = (dataset: GroundTruthDataset): number => {
    return dataset.queries?.length || 0;
  };

  const formatDate = (date: string | Date): string => {
    try {
      return new Date(date).toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return t('common.unknown');
    }
  };

  // Clear announcement after it's been read
  useEffect(() => {
    if (announcement && announcementRef.current) {
      const timer = setTimeout(() => setAnnouncement(''), 1000);
      return () => clearTimeout(timer);
    }
  }, [announcement]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <div role="status" aria-live="polite" aria-busy="true">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" />
            <p>{t('groundTruth.loadingDatasets')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Screen reader announcements */}
      <div
        ref={announcementRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Header with search and upload */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <label htmlFor="dataset-search" className="sr-only">
            {t('groundTruth.searchDatasets')}
          </label>
          <Search 
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" 
            aria-hidden="true"
          />
          <Input
            id="dataset-search"
            type="search"
            placeholder={t('groundTruth.searchDatasetsPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={t('groundTruth.searchDatasetsAriaLabel')}
            aria-describedby="search-description"
          />
          <span id="search-description" className="sr-only">
            {t('groundTruth.searchDatasetsDescription')}
          </span>
        </div>
        {onUploadClick && (
          <Button 
            onClick={onUploadClick} 
            className="gap-2"
            aria-label={t('groundTruth.uploadNewDataset')}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Upload Dataset
          </Button>
        )}
      </div>

      {/* Dataset list */}
      {datasets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            {searchQuery ? (
              <div role="status" aria-live="polite">
                <p>{t('groundTruth.noDatasetsFoundFor').replace('{{query}}', searchQuery)}</p>
              </div>
            ) : (
              <div className="space-y-2" role="status" aria-live="polite">
                <FileText className="w-12 h-12 mx-auto text-gray-300" aria-hidden="true" />
                <p>{t('groundTruth.noDatasetsYet')}</p>
                {onUploadClick && (
                  <Button 
                    onClick={onUploadClick} 
                    variant="outline" 
                    className="mt-4"
                    aria-label={t('groundTruth.uploadFirstDataset')}
                  >
                    <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                    {t('groundTruth.uploadFirstDatasetButton')}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div 
          role="list" 
          aria-label={t('groundTruth.datasetsAvailable')
            .replace('{{count}}', String(datasets.length))
            .replace('{{plural}}', datasets.length !== 1 ? 's' : '')}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {datasets.map((dataset) => (
            <Card 
              key={dataset._id} 
              className="hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
              role="listitem"
              aria-label={`${t('groundTruth.dataset')}: ${dataset.name}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg" id={`dataset-title-${dataset._id}`}>
                      {dataset.name}
                    </CardTitle>
                    {dataset.description && (
                      <CardDescription className="mt-1 line-clamp-2" id={`dataset-desc-${dataset._id}`}>
                        {dataset.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Metadata */}
                  <div 
                    className="flex items-center gap-4 text-sm text-muted-foreground"
                    role="group"
                    aria-label={t('groundTruth.datasetInfo')}
                  >
                    <div className="flex items-center gap-1" aria-label={`${getQueryCount(dataset)} ${t('groundTruth.queries')}`}>
                      <FileText className="w-3 h-3" aria-hidden="true" />
                      <span>{getQueryCount(dataset)} {t('groundTruth.queries')}</span>
                    </div>
                    <div className="flex items-center gap-1" aria-label={`${t('groundTruth.createdOn')} ${formatDate(dataset.created_at)}`}>
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      <time dateTime={new Date(dataset.created_at).toISOString()}>
                        {formatDate(dataset.created_at)}
                      </time>
                    </div>
                  </div>

                  {/* Actions */}
                  {showActions && (
                    <div 
                      className="flex items-center gap-2 pt-2 border-t"
                      role="group"
                      aria-label={`${t('groundTruth.actionsFor')} ${dataset.name}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(dataset)}
                        className="flex-1 gap-2"
                        aria-label={`${t('groundTruth.viewDataset')} ${dataset.name}`}
                        aria-describedby={`dataset-title-${dataset._id}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleView(dataset);
                          }
                        }}
                      >
                        <Eye className="w-3 h-3" aria-hidden="true" />
                        Bekijken
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(dataset._id, dataset.name)}
                            disabled={deletingId === dataset._id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`${t('groundTruth.deleteDataset')} ${dataset.name}`}
                            aria-describedby={`dataset-title-${dataset._id}`}
                            aria-busy={deletingId === dataset._id}
                            onKeyDown={(e) => {
                              if ((e.key === 'Enter' || e.key === ' ') && deletingId !== dataset._id) {
                                e.preventDefault();
                                handleDelete(dataset._id, dataset.name);
                              }
                            }}
                          >
                            {deletingId === dataset._id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                <span className="sr-only">Verwijderen...</span>
                              </>
                            ) : (
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Dataset verwijderen</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

