import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { ArrowLeft, ExternalLink, Calendar, FileText, User, Star, Search } from 'lucide-react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import type { GroundTruthDataset } from './GroundTruthDatasetList';

interface GroundTruthDatasetViewProps {
  datasetId: string;
  dataset?: GroundTruthDataset; // Optional: can pass dataset directly to avoid API call
  onBack?: () => void;
  onEdit?: (dataset: GroundTruthDataset) => void;
}

/**
 * GroundTruthDatasetView Component
 * 
 * Displays detailed view of a ground truth dataset including all queries
 * and their relevant documents with relevance scores.
 * 
 * @component
 */
export function GroundTruthDatasetView({
  datasetId,
  dataset: initialDataset,
  onBack,
  onEdit,
}: GroundTruthDatasetViewProps) {
  const [dataset, setDataset] = useState<GroundTruthDataset | null>(initialDataset || null);
  const [isLoading, setIsLoading] = useState(!initialDataset);
  const [error, setError] = useState<string | null>(null);
  const [expandedQueries, setExpandedQueries] = useState<Set<number>>(new Set([0])); // First query expanded by default
  const [searchQuery, setSearchQuery] = useState('');

  const loadDataset = useCallback(async () => {
    // Validate ID format first
    if (!/^[0-9a-fA-F]{24}$/.test(datasetId)) {
      setError(t('groundTruth.invalidDatasetIdFormat'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<{ success: boolean; dataset: GroundTruthDataset }>(
        `/benchmark/ground-truth/datasets/${datasetId}`
      );
      setDataset(response.dataset);
    } catch (error) {
      // Handle specific error cases
      if (error instanceof Error) {
        const errorWithStatusCode = error as Error & { statusCode?: number; code?: string };
        const is404 = 
          errorWithStatusCode.statusCode === 404 ||
          errorWithStatusCode.code === 'NOT_FOUND' ||
          error.message.toLowerCase().includes('not found') ||
          error.message.includes('404');
        
        if (is404) {
          // Don't log 404s as errors - they're expected when dataset doesn't exist
          setError(t('groundTruth.datasetNotFound'));
          setDataset(null);
        } else {
          // Log other errors
          logError(error, 'load-ground-truth-dataset');
          const errorMessage = error.message || t('groundTruth.failedToLoadDataset');
          toast.error(t('groundTruth.error'), errorMessage);
          setError(errorMessage);
          setDataset(null);
        }
      } else {
        // Non-Error object
        logError(error, 'load-ground-truth-dataset');
        const errorMessage = t('groundTruth.failedToLoadDataset');
        toast.error(t('groundTruth.error'), errorMessage);
        setError(errorMessage);
        setDataset(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    if (!initialDataset) {
      loadDataset();
    }
  }, [datasetId, initialDataset, loadDataset]);

  const toggleQuery = (index: number) => {
    setExpandedQueries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    if (!dataset) return;
    setExpandedQueries(new Set(dataset.queries.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedQueries(new Set());
  };

  const formatDate = (date: string | Date): string => {
    try {
      return new Date(date).toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return t('common.unknown');
    }
  };

  const getRelevanceBadge = (relevance: number) => {
    const variants: Record<number, 'default' | 'secondary' | 'outline'> = {
      4: 'default',
      3: 'default',
      2: 'secondary',
      1: 'secondary',
      0: 'outline',
    };
    const labels: Record<number, string> = {
      4: t('groundTruth.veryRelevant'),
      3: t('groundTruth.relevant'),
      2: t('groundTruth.moderatelyRelevant'),
      1: t('groundTruth.somewhatRelevant'),
      0: t('groundTruth.notRelevant'),
    };
    const colors: Record<number, string> = {
      4: 'bg-green-600 text-white',
      3: 'bg-green-500 text-white',
      2: 'bg-yellow-500 text-white',
      1: 'bg-orange-500 text-white',
      0: 'bg-gray-400 text-white',
    };

    return (
      <Badge variant={variants[relevance] || 'outline'} className={colors[relevance] || ''}>
        <Star className="w-3 h-3 mr-1" />
        {relevance} - {labels[relevance] || t('common.unknown')}
      </Badge>
    );
  };

  const filteredQueries = dataset?.queries.filter(q => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      q.query.toLowerCase().includes(query) ||
      q.relevant_documents.some(doc => doc.url.toLowerCase().includes(query))
    );
  }) || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <p>Dataset laden...</p>
        </CardContent>
      </Card>
    );
  }

  if (!dataset) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <p className="text-lg font-medium mb-2">
            {error || t('groundTruth.datasetNotFound')}
          </p>
          <p className="text-sm mb-6">
            Controleer of het ID correct is of selecteer een andere dataset.
          </p>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Terug naar overzicht
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const totalDocuments = dataset.queries.reduce(
    (sum, q) => sum + q.relevant_documents.length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {onBack && (
                  <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <CardTitle className="text-2xl">{dataset.name}</CardTitle>
              </div>
              {dataset.description && (
                <CardDescription className="text-base mt-2">
                  {dataset.description}
                </CardDescription>
              )}
            </div>
            {onEdit && (
              <Button variant="outline" onClick={() => onEdit(dataset)}>
                Bewerken
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{dataset.queries.length}</p>
                <p className="text-xs text-muted-foreground">Queries</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{totalDocuments}</p>
                <p className="text-xs text-muted-foreground">Documenten</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{formatDate(dataset.created_at)}</p>
                <p className="text-xs text-muted-foreground">Aangemaakt</p>
              </div>
            </div>
            {dataset.created_by && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{dataset.created_by}</p>
                  <p className="text-xs text-muted-foreground">Auteur</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search and Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={t('groundTruth.searchInQueriesOrUrls')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            {t('benchmark.expandAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            {t('benchmark.collapseAll')}
          </Button>
        </div>
      </div>

      {/* Queries List */}
      {filteredQueries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <p>Geen queries gevonden voor "{searchQuery}".</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredQueries.map((queryEntry) => {
            const originalIndex = dataset.queries.findIndex(q => q === queryEntry);
            const isExpanded = expandedQueries.has(originalIndex);

            return (
              <Card key={originalIndex} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleQuery(originalIndex)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">Query {originalIndex + 1}</Badge>
                        <Badge variant="secondary">
                          {queryEntry.relevant_documents.length} documenten
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{queryEntry.query}</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm">
                      {isExpanded ? '▼' : '▶'}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {queryEntry.relevant_documents.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Geen relevante documenten voor deze query.
                          </p>
                        ) : (
                          queryEntry.relevant_documents.map((doc, docIndex) => (
                            <Card key={docIndex} className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    {getRelevanceBadge(doc.relevance)}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                    <a
                                      href={doc.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline break-all"
                                    >
                                      {doc.url}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Samenvatting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Totaal Queries</p>
              <p className="text-2xl font-bold">{dataset.queries.length}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Totaal Documenten</p>
              <p className="text-2xl font-bold">{totalDocuments}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Gem. Documenten/Query</p>
              <p className="text-2xl font-bold">
                {dataset.queries.length > 0
                  ? (totalDocuments / dataset.queries.length).toFixed(1)
                  : '0'}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Gem. Relevance</p>
              <p className="text-2xl font-bold">
                {totalDocuments > 0
                  ? (
                      dataset.queries.reduce(
                        (sum, q) =>
                          sum +
                          q.relevant_documents.reduce(
                            (docSum, doc) => docSum + doc.relevance,
                            0
                          ),
                        0
                      ) / totalDocuments
                    ).toFixed(1)
                  : '0'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

