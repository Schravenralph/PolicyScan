import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from '../../utils/toast';
import { Download, Search, Eye, Calendar, Globe, Zap, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { formatStrategy, formatDecisionType } from '../../utils/aiCrawlingUtils';
import { useDebounce } from '../../hooks/useDebounce';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Card } from '../ui/card';

interface AICrawlingTrace {
  _id?: string;
  sessionId: string;
  baseUrl: string;
  query: string;
  strategy: 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
  decisions: Array<{
    decisionType: string;
    timestamp: Date;
    confidence?: number;
    reasoning?: string;
    metadata?: Record<string, unknown>;
  }>;
  documentsFound: Array<{
    documentUrl: string;
    documentTitle?: string;
    foundVia: string;
    decisionIndex: number;
  }>;
  performanceMetrics: {
    totalDuration?: number;
    llmCalls?: number;
    llmLatency?: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface TraceWithExplanation extends AICrawlingTrace {
  explanation?: string;
  summary?: {
    strategy: string;
    documentsFound: number;
    decisionsMade: number;
    duration?: number;
    llmCalls?: number;
  };
}

export function AICrawlingTraceViewer() {
  const [traces, setTraces] = useState<TraceWithExplanation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<TraceWithExplanation | null>(null);
  const [expandedDecisions, setExpandedDecisions] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    baseUrl: '',
    query: '',
    strategy: 'all' as 'all' | 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    limit: 20,
    skip: 0,
    total: 0,
  });

  // Debounce filter changes to avoid excessive API calls
  const debouncedFilters = useDebounce(filters, 500);

  const loadTraces = useCallback(async () => {
    setLoading(true);
    try {
      // Validate dates before sending
      const startDate = debouncedFilters.startDate ? new Date(debouncedFilters.startDate) : null;
      const endDate = debouncedFilters.endDate ? new Date(debouncedFilters.endDate) : null;
      
      if (startDate && isNaN(startDate.getTime())) {
        toast.error(t('admin.invalidDate'), t('admin.invalidStartDate'));
        setLoading(false);
        return;
      }
      
      if (endDate && isNaN(endDate.getTime())) {
        toast.error(t('admin.invalidDate'), t('admin.invalidEndDate'));
        setLoading(false);
        return;
      }
      
      if (startDate && endDate && startDate > endDate) {
        toast.error(t('admin.invalidDate'), t('admin.startDateMustBeBeforeEndDate'));
        setLoading(false);
        return;
      }

      const queryParams: Record<string, string> = {};
      if (debouncedFilters.baseUrl) queryParams.baseUrl = debouncedFilters.baseUrl;
      if (debouncedFilters.query) queryParams.query = debouncedFilters.query;
      if (debouncedFilters.strategy && debouncedFilters.strategy !== 'all') queryParams.strategy = debouncedFilters.strategy;
      if (debouncedFilters.startDate) queryParams.startDate = debouncedFilters.startDate;
      if (debouncedFilters.endDate) queryParams.endDate = debouncedFilters.endDate;
      queryParams.limit = pagination.limit.toString();
      queryParams.skip = pagination.skip.toString();

      const result = await api.listAICrawlingTraces(queryParams);
      setTraces(result.traces || []);
      setPagination(prev => ({ ...prev, total: result.total || 0 }));
    } catch (error: unknown) {
      logError(error, 'load-ai-crawling-traces');
      const errorMessage = (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || 
                           (error instanceof Error ? error.message : String(error)) || 
                           'Onbekende fout';
      toast.error(t('admin.failedToLoadTraces'), t('admin.failedToLoadTracesDesc').replace('{{error}}', errorMessage));
    } finally {
      setLoading(false);
    }
  }, [debouncedFilters, pagination.skip, pagination.limit]);

  // Reload when filters change (debounced) or pagination changes
  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  const handleViewTrace = async (trace: AICrawlingTrace) => {
    try {
      const fullTrace = await api.getAICrawlingTrace(trace.sessionId);
      setSelectedTrace(fullTrace.trace as TraceWithExplanation);
    } catch (error: unknown) {
      logError(error, 'load-trace-details');
      const errorMessage = (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || 
                           (error instanceof Error ? error.message : String(error)) || 
                           'Onbekende fout';
      toast.error(t('admin.failedToLoadTraceDetails'), t('admin.failedToLoadTraceDetailsDesc').replace('{{error}}', errorMessage));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Use API service instead of direct fetch
      const blob = await api.aiCrawling.exportAICrawlingTraces(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-crawling-traces-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(t('admin.tracesExported'), t('admin.tracesExportedSuccessfully'));
    } catch (error: unknown) {
      logError(error, 'export-traces');
      const errorMessage = error instanceof Error ? error.message : String(error) || t('common.unknownError');
      toast.error(t('admin.failedToExportTraces'), t('admin.failedToExportTracesDesc').replace('{{error}}', errorMessage));
    } finally {
      setExporting(false);
    }
  };


  const toggleDecision = (index: number) => {
    setExpandedDecisions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI Crawling Traces</h2>
        <Button 
          onClick={handleExport} 
          variant="outline" 
          disabled={exporting}
          aria-label={exporting ? t('admin.exportingTraces') : t('admin.exportTraces')}
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? t('admin.exportingTraces') : t('common.export')}
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="baseUrl">{t('admin.labelWebsiteUrl')}</Label>
            <Input
              id="baseUrl"
              value={filters.baseUrl}
              onChange={(e) => setFilters({ ...filters, baseUrl: e.target.value })}
              placeholder={t('admin.filterByUrl')}
            />
          </div>
          <div>
            <Label htmlFor="query">{t('admin.labelQuery')}</Label>
            <Input
              id="query"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder={t('admin.filterByQuery')}
            />
          </div>
          <div>
            <Label htmlFor="strategy">{t('admin.labelStrategy')}</Label>
            <Select
              value={filters.strategy}
              onValueChange={(value) => setFilters({ ...filters, strategy: value as 'all' | 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid' })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('common.allStrategies')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.strategyAll')}</SelectItem>
                <SelectItem value="site_search">{t('admin.strategySiteSearch')}</SelectItem>
                <SelectItem value="ai_navigation">{t('admin.strategyAINavigation')}</SelectItem>
                <SelectItem value="traditional_crawl">{t('admin.strategyTraditionalCrawl')}</SelectItem>
                <SelectItem value="hybrid">{t('admin.strategyHybrid')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="startDate">{t('admin.labelStartDate')}</Label>
            <Input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="endDate">{t('admin.labelEndDate')}</Label>
            <Input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button 
              onClick={loadTraces} 
              className="w-full"
              aria-label="Zoek traces met geselecteerde filters"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>
        </div>
      </Card>

      {/* Traces List */}
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : traces.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          {filters.baseUrl || filters.query || (filters.strategy && filters.strategy !== 'all') || filters.startDate || filters.endDate
            ? 'Geen traces gevonden voor de geselecteerde filters. Probeer andere filters.'
            : 'Geen traces gevonden. Start een AI-geleide crawl om traces te genereren.'}
        </Card>
      ) : (
        <div className="space-y-4">
          {traces.map((trace) => (
            <Card key={trace.sessionId} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{trace.baseUrl}</span>
                    <span className="text-sm text-gray-500">•</span>
                    <span className="text-sm text-gray-500">{trace.query}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      {formatStrategy(trace.strategy)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {trace.documentsFound.length} documents
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(trace.createdAt).toLocaleString('nl-NL')}
                    </span>
                    {trace.performanceMetrics?.totalDuration && (
                      <span>
                        {(trace.performanceMetrics.totalDuration / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewTrace(trace)}
                  aria-label={`Bekijk details voor trace ${trace.sessionId}`}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Button>
              </div>
            </Card>
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {t('common.showing')} {pagination.skip + 1} {t('common.to')} {Math.min(pagination.skip + pagination.limit, pagination.total)} {t('common.of')} {pagination.total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.skip === 0}
                onClick={() => setPagination({ ...pagination, skip: Math.max(0, pagination.skip - pagination.limit) })}
              >
                {t('common.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.skip + pagination.limit >= pagination.total}
                onClick={() => setPagination({ ...pagination, skip: pagination.skip + pagination.limit })}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Trace Detail Dialog */}
      {selectedTrace && (
        <Dialog open={!!selectedTrace} onOpenChange={() => setSelectedTrace(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('admin.traceDetails')}</DialogTitle>
              <DialogDescription>
                {t('admin.completeTraceInformation')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Summary */}
              {selectedTrace.summary && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Strategy</div>
                      <div className="font-medium">{formatStrategy(selectedTrace.summary.strategy)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Documents Found</div>
                      <div className="font-medium">{selectedTrace.summary.documentsFound}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Decisions Made</div>
                      <div className="font-medium">{selectedTrace.summary.decisionsMade}</div>
                    </div>
                    {selectedTrace.summary.duration && (
                      <div>
                        <div className="text-gray-500">Duration</div>
                        <div className="font-medium">{(selectedTrace.summary.duration / 1000).toFixed(1)}s</div>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Explanation */}
              {selectedTrace.explanation && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Explanation</h3>
                  <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded">
                    {selectedTrace.explanation}
                  </pre>
                </Card>
              )}

              {/* Decisions */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Decision Timeline</h3>
                <div className="space-y-2">
                  {(selectedTrace.decisions || []).map((decision, index) => (
                    <div key={index} className="border-l-2 border-blue-500 pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{formatDecisionType(decision.decisionType)}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(decision.timestamp).toLocaleString('nl-NL')}
                          </div>
                          {decision.confidence !== undefined && (
                            <div className="text-sm text-gray-600 mt-1">
                              Confidence: {(decision.confidence * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDecision(index)}
                          aria-label={expandedDecisions.has(index) ? t('admin.hideDecisionDetails') : t('admin.showDecisionDetails')}
                          aria-expanded={expandedDecisions.has(index)}
                        >
                          {expandedDecisions.has(index) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      {expandedDecisions.has(index) && (
                        <div className="mt-2 space-y-2">
                          {decision.reasoning && (
                            <div className="text-sm">
                              <div className="font-medium mb-1">Reasoning:</div>
                              <div className="text-gray-600 whitespace-pre-wrap">{decision.reasoning}</div>
                            </div>
                          )}
                          {decision.metadata && Object.keys(decision.metadata).length > 0 && (
                            <div className="text-sm">
                              <div className="font-medium mb-1">Metadata:</div>
                              <pre className="text-gray-600 text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                {JSON.stringify(decision.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Documents Found */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Documents Found</h3>
                <div className="space-y-2">
                  {(selectedTrace.documentsFound || []).map((doc, index) => (
                    <div key={index} className="border-l-2 border-green-500 pl-4 py-2">
                      <div className="font-medium">{doc.documentTitle || doc.documentUrl}</div>
                      <div className="text-sm text-gray-500">{doc.documentUrl}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Found via: {formatStrategy(doc.foundVia)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Performance Metrics */}
              {selectedTrace.performanceMetrics && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Performance Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {selectedTrace.performanceMetrics.totalDuration && (
                      <div>
                        <div className="text-gray-500">Total Duration</div>
                        <div className="font-medium">{(selectedTrace.performanceMetrics.totalDuration / 1000).toFixed(1)}s</div>
                      </div>
                    )}
                    {selectedTrace.performanceMetrics.llmCalls !== undefined && (
                      <div>
                        <div className="text-gray-500">{t('aiUsage.llmCalls')}</div>
                        <div className="font-medium">{selectedTrace.performanceMetrics.llmCalls}</div>
                      </div>
                    )}
                    {selectedTrace.performanceMetrics.cacheHits !== undefined && (
                      <div>
                        <div className="text-gray-500">{t('aiUsage.cacheHits')}</div>
                        <div className="font-medium">{selectedTrace.performanceMetrics.cacheHits}</div>
                      </div>
                    )}
                    {selectedTrace.performanceMetrics.cacheMisses !== undefined && (
                      <div>
                        <div className="text-gray-500">{t('aiUsage.cacheMisses')}</div>
                        <div className="font-medium">{selectedTrace.performanceMetrics.cacheMisses}</div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

