import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, Filter, Loader2, AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { TestApiService } from '../../services/api/TestApiService';
import { ErrorDetailDialog } from './ErrorDetailDialog';
import { t } from '../../utils/i18n';

interface ErrorItem {
  testName: string;
  filePath?: string;
  errorMessage?: string;
  stackTrace?: string;
  errorCategory?: string;
  errorPattern?: string;
  errorFingerprint?: string;
  errorSeverity?: string;
  occurrenceCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  testFilePath: string;
  executionTimestamp: string;
}

interface ErrorExplorerProps {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  testApiService?: TestApiService; // Optional dependency injection for testing
}

const categoryColors: Record<string, string> = {
  timeout: 'bg-purple-100 dark:bg-purple-950/30 text-purple-800 dark:text-purple-200',
  network: 'bg-primary/10 text-primary',
  assertion: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
  database: 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200',
  environment: 'bg-muted text-muted-foreground',
  memory: 'bg-pink-100 dark:bg-pink-950/30 text-pink-800 dark:text-pink-200',
  'type-error': 'bg-indigo-100 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200',
  permission: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
  'not-found': 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
  syntax: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
  playwright: 'bg-cyan-100 dark:bg-cyan-950/30 text-cyan-800 dark:text-cyan-200',
  other: 'bg-muted text-muted-foreground',
};

const severityColors = {
  low: 'bg-primary/10 text-primary',
  medium: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
  high: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
  critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
};

const ERROR_CATEGORIES = [
  'timeout',
  'network',
  'assertion',
  'database',
  'environment',
  'memory',
  'type-error',
  'permission',
  'not-found',
  'syntax',
  'playwright',
  'other',
] as const;

export function ErrorExplorer({ dateRange, testApiService: injectedTestApiService }: ErrorExplorerProps) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);

  // Filters
  const [errorCategory, setErrorCategory] = useState<string>('all');
  const [errorPattern, setErrorPattern] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [testFilePath, setTestFilePath] = useState<string>('');
  const [minOccurrences, setMinOccurrences] = useState<string>('');

  // Dialog state
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadErrors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof testApiService.getErrorLogs>[0] = {
        limit,
        skip: page * limit,
      };

      if (errorCategory && errorCategory !== 'all') params.errorCategory = errorCategory;
      if (errorPattern) params.errorPattern = errorPattern;
      if (errorMessage) params.errorMessage = errorMessage;
      if (testFilePath) params.testFilePath = testFilePath;
      if (minOccurrences) {
        const parsed = parseInt(minOccurrences, 10);
        if (!isNaN(parsed) && parsed > 0) {
          params.minOccurrences = parsed;
        }
      }
      if (dateRange?.from) params.timeRange = dateRange.from.toISOString();
      if (dateRange?.to) params.timeRange = dateRange.to.toISOString();

      const result = await testApiService.getErrorLogs(params) as { errors?: ErrorItem[]; pagination?: { total?: number; hasMore?: boolean }; [key: string]: unknown };
      setErrors(result.errors || []);
      setTotal(result.pagination?.total || 0);
      setHasMore(result.pagination?.hasMore || false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.failedToLoadErrors');
      setError(errorMessage);
      console.error('Error loading errors:', err);
      setErrors([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [errorCategory, errorPattern, errorMessage, testFilePath, minOccurrences, dateRange, page, limit, testApiService]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  const handleViewDetails = (fingerprint: string | undefined) => {
    if (fingerprint) {
      setSelectedFingerprint(fingerprint);
      setDialogOpen(true);
    }
  };

  const handleResetFilters = () => {
    setErrorCategory('all');
    setErrorPattern('');
    setErrorMessage('');
    setTestFilePath('');
    setMinOccurrences('');
    setPage(0);
  };

  const truncateMessage = (message: string | undefined, maxLength: number = 100) => {
    if (!message) return '';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return t('common.notAvailable');
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{t('errorExplorer.title')}</h2>
          <p className="text-gray-600 mt-1">{t('errorExplorer.description')}</p>
        </div>
        <Button onClick={loadErrors} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t('common.filter')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.category')}</label>
              <Select value={errorCategory} onValueChange={setErrorCategory}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.allCategories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allCategories')}</SelectItem>
                  {ERROR_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.pattern')}</label>
              <Input
                placeholder={t('admin.errorPattern')}
                value={errorPattern}
                onChange={(e) => setErrorPattern(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.errorMessage')}</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('admin.searchErrorMessage')}
                  value={errorMessage}
                  onChange={(e) => setErrorMessage(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.testFilePath')}</label>
              <Input
                placeholder={t('admin.filterByTestFile')}
                value={testFilePath}
                onChange={(e) => setTestFilePath(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.minOccurrences')}</label>
              <Input
                type="number"
                placeholder={t('admin.minimumOccurrences')}
                value={minOccurrences}
                onChange={(e) => setMinOccurrences(e.target.value)}
                min="0"
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleResetFilters} variant="outline" className="w-full">
                {t('common.resetFilters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Error List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('errorExplorer.title')} ({total.toLocaleString()})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">{t('errorExplorer.loadingErrors')}</span>
            </div>
          ) : errors.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>{t('errorExplorer.noErrorsFound')}</p>
              <p className="text-sm mt-2">{t('errorExplorer.tryAdjustingFilters')}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('errorExplorer.errorMessage')}</TableHead>
                    <TableHead>{t('errorExplorer.category')}</TableHead>
                    <TableHead>{t('errorExplorer.severity')}</TableHead>
                    <TableHead>{t('errorExplorer.testFile')}</TableHead>
                    <TableHead>{t('errorExplorer.occurrences')}</TableHead>
                    <TableHead>{t('common.lastSeen')}</TableHead>
                    <TableHead>{t('errorExplorer.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((errorItem, index) => (
                    <TableRow key={`${errorItem.errorFingerprint || index}-${errorItem.executionTimestamp}`}>
                      <TableCell className="max-w-md">
                        <div className="font-mono text-xs truncate" title={errorItem.errorMessage}>
                          {truncateMessage(errorItem.errorMessage)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {errorItem.errorCategory ? (
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              categoryColors[errorItem.errorCategory] || categoryColors.other
                            }`}
                          >
                            {errorItem.errorCategory}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {errorItem.errorSeverity ? (
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              severityColors[errorItem.errorSeverity as keyof typeof severityColors] ||
                              severityColors.low
                            }`}
                          >
                            {errorItem.errorSeverity}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs truncate max-w-xs" title={errorItem.testFilePath}>
                          {errorItem.testFilePath}
                        </div>
                      </TableCell>
                      <TableCell>
                        {errorItem.occurrenceCount !== undefined
                          ? errorItem.occurrenceCount.toLocaleString()
                          : t('common.notAvailable')}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(errorItem.lastSeen)}
                      </TableCell>
                      <TableCell>
                        {errorItem.errorFingerprint ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(errorItem.errorFingerprint)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            {t('common.view')}
                          </Button>
                        ) : (
                          <span className="text-gray-400 text-sm">{t('errorExplorer.noDetails')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  {t('common.showing')} {page * limit + 1} {t('common.to')} {Math.min((page + 1) * limit, total)} {t('common.of')} {total} {t('common.errors')}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore || loading}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Error Detail Dialog */}
      <ErrorDetailDialog
        fingerprint={selectedFingerprint}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

