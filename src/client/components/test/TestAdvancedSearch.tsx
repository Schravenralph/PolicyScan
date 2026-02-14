/**
 * Test Advanced Search Component
 * 
 * Advanced search interface for test runs with multiple filters and query options.
 */

import { useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Search, Filter, X, Calendar, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { t } from '../../utils/i18n';

interface TestAdvancedSearchProps {
  testApiService?: TestApiService;
  onResults?: (results: any[]) => void;
}

interface SearchFilters {
  query?: string;
  testType?: string;
  branch?: string;
  status?: 'all' | 'passed' | 'failed' | 'partial';
  startDate?: string;
  endDate?: string;
  minDuration?: number;
  maxDuration?: number;
  minPassRate?: number;
  maxPassRate?: number;
  limit?: number;
}

export function TestAdvancedSearch({ testApiService: injectedTestApiService, onResults }: TestAdvancedSearchProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [filters, setFilters] = useState<SearchFilters>({
    limit: 50,
  });
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const performSearch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const searchParams: any = {};
      if (filters.query) searchParams.query = filters.query;
      if (filters.testType && filters.testType !== 'all') searchParams.testType = filters.testType;
      if (filters.branch) searchParams.branch = filters.branch;
      if (filters.status && filters.status !== 'all') searchParams.status = filters.status;
      if (filters.startDate) searchParams.startDate = filters.startDate;
      if (filters.endDate) searchParams.endDate = filters.endDate;
      if (filters.limit) searchParams.limit = filters.limit;

      // Use getTestRuns with search parameters - note: getTestRuns requires testId, so we'll use a different approach
      // For now, use getTestStatistics which supports filtering
      const data = await testApi.getTestStatistics({
        timeRangeDays: searchParams.startDate ? Math.ceil((Date.now() - new Date(searchParams.startDate).getTime()) / (1000 * 60 * 60 * 24)) : undefined,
        testType: searchParams.testType,
        branch: searchParams.branch,
      }) as { results?: unknown[]; [key: string]: unknown };
      setResults(data.results || []);
      onResults?.(data.results || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      console.error('Error performing search:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, filters, onResults]);

  const clearFilters = useCallback(() => {
    setFilters({
      limit: 50,
    });
    setResults([]);
    setError(null);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.query ||
      (filters.testType && filters.testType !== 'all') ||
      filters.branch ||
      (filters.status && filters.status !== 'all') ||
      filters.startDate ||
      filters.endDate
    );
  }, [filters]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {t('testAdvancedSearch.advancedSearch')}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                {t('testAdvancedSearch.clear')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              <Filter className="w-4 h-4 mr-2" />
              {showAdvanced ? t('testAdvancedSearch.hide') : t('testAdvancedSearch.show')} {t('testAdvancedSearch.advancedSearch')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Basic Search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder={t('testAdvancedSearch.searchPlaceholder')}
                value={filters.query || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    performSearch();
                  }
                }}
              />
            </div>
            <Button onClick={performSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Quick Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('testAdvancedSearch.testType')}</label>
              <Select
                value={filters.testType || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, testType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('testAdvancedSearch.allTypes')}</SelectItem>
                  <SelectItem value="unit">Unit</SelectItem>
                  <SelectItem value="integration">Integration</SelectItem>
                  <SelectItem value="e2e">End-to-end</SelectItem>
                  <SelectItem value="visual">Visual</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('testAdvancedSearch.status')}</label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, status: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('testAdvancedSearch.all')}</SelectItem>
                  <SelectItem value="passed">{t('testAdvancedSearch.passed')}</SelectItem>
                  <SelectItem value="failed">{t('testAdvancedSearch.failed')}</SelectItem>
                  <SelectItem value="partial">{t('testAdvancedSearch.partial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('testAdvancedSearch.branch')}</label>
              <Input
                placeholder={t('testAdvancedSearch.filterByBranch')}
                value={filters.branch || ''}
                onChange={(e) => setFilters(prev => ({ ...prev, branch: e.target.value }))}
              />
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {t('testAdvancedSearch.startDate')}
                  </label>
                  <Input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {t('testAdvancedSearch.endDate')}
                  </label>
                  <Input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('testAdvancedSearch.limit')}</label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={filters.limit || 50}
                    onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) || 50 }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  Found {results.length} result{results.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="space-y-2">
                {results.map((result, idx) => {
                  const passRate = result.results?.total > 0
                    ? (result.results.passed / result.results.total) * 100
                    : 0;
                  return (
                    <Card key={result.id || idx}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-sm">{result.id?.substring(0, 8)}</span>
                              {result.testType && <Badge variant="outline">{result.testType}</Badge>}
                              {result.git?.branch && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <GitBranch className="w-3 h-3" />
                                  {result.git.branch}
                                </Badge>
                              )}
                              <span className="text-sm text-muted-foreground">
                                {new Date(result.timestamp || result.executionTimestamp).toLocaleString()}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <div className="text-sm text-muted-foreground">{t('testAdvancedSearch.total')}</div>
                                <div className="text-lg font-bold">{result.results?.total || 0}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">{t('testAdvancedSearch.passed')}</div>
                                <div className="text-lg font-bold text-green-600">{result.results?.passed || 0}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">{t('testAdvancedSearch.failed')}</div>
                                <div className="text-lg font-bold text-red-600">{result.results?.failed || 0}</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Duration</div>
                                <div className="text-lg font-bold">{(result.results?.duration || 0) / 1000}s</div>
                              </div>
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <div className="text-sm text-muted-foreground">Pass Rate</div>
                            <div className={`text-2xl font-bold ${
                              passRate >= 95 ? 'text-green-600' :
                              passRate >= 80 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {passRate.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && results.length === 0 && hasActiveFilters && (
            <div className="text-center text-muted-foreground py-8">
              No results found matching your search criteria
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


