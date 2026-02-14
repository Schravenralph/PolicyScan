import { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TestApiService } from '../../services/api/TestApiService';
import { ErrorDetailDialog } from './ErrorDetailDialog';
import { t } from '../../utils/i18n';

interface ErrorPatternsProps {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  testApiService?: TestApiService; // Optional dependency injection for testing
}

interface PatternData {
  fingerprint: string;
  pattern: string;
  category: string;
  severity: string;
  occurrenceCount: number;
  affectedTestFiles: Array<{ filePath: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  firstSeen: string;
  lastSeen: string;
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

function TrendIndicator({ trend }: { trend: Array<{ date: string; count: number }> }) {
  if (trend.length < 2) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground text-sm">
        <Minus className="w-3 h-3" />
        <span>No trend</span>
      </div>
    );
  }

  const sortedTrend = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  const firstCount = sortedTrend[0]?.count || 0;
  const lastCount = sortedTrend[sortedTrend.length - 1]?.count || 0;
  const change = lastCount - firstCount;
  const changePercent = firstCount > 0 ? ((change / firstCount) * 100).toFixed(1) : '0.0';

  if (change === 0) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground text-sm">
        <Minus className="w-3 h-3" />
        <span>No change</span>
      </div>
    );
  }

  const isIncreasing = change > 0;
  return (
    <div className={`flex items-center gap-1 text-sm ${isIncreasing ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
      {isIncreasing ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      <span>{Math.abs(parseFloat(changePercent))}%</span>
    </div>
  );
}

export function ErrorPatterns({ dateRange, testApiService: injectedTestApiService }: ErrorPatternsProps) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<PatternData[]>([]);
  const [summary, setSummary] = useState<{ totalPatterns: number; totalOccurrences: number } | null>(null);
  const [minOccurrences, setMinOccurrences] = useState<string>('1');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<number | null>(null);

  // Dialog state
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadPatterns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use getFailurePatterns instead of getErrorPatterns
      const result = await testApiService.getFailurePatterns({
        timeRangeDays: dateRange?.from ? Math.ceil((Date.now() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) : undefined,
      }) as { patterns?: PatternData[]; summary?: { totalPatterns: number; totalOccurrences: number };[key: string]: unknown };
      setPatterns(result.patterns || []);
      setSummary(result.summary || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load error patterns';
      setError(errorMessage);
      console.error('Error loading error patterns:', err);
      setPatterns([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [minOccurrences, dateRange, testApiService]);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  const handleViewDetails = (fingerprint: string) => {
    setSelectedFingerprint(fingerprint);
    setDialogOpen(true);
  };

  const selectedPattern = useMemo(() => {
    if (selectedPatternIndex === null) return null;
    return patterns[selectedPatternIndex] || null;
  }, [selectedPatternIndex, patterns]);

  const selectedPatternTrendData = useMemo(() => {
    if (!selectedPattern) return [];
    return selectedPattern.trend
      .map((point) => ({
        date: new Date(point.date).toLocaleDateString(),
        count: point.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedPattern]);

  const formatDate = (dateString: string) => {
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
          <h2 className="text-2xl font-bold">Error Patterns</h2>
          <p className="text-gray-600 mt-1">{t('test.identifyProblematicErrorPatterns')}</p>
        </div>
        <Button onClick={loadPatterns} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Minimum Occurrences</label>
              <Input
                type="number"
                placeholder="Minimum occurrences"
                value={minOccurrences}
                onChange={(e) => setMinOccurrences(e.target.value)}
                min="1"
              />
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

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(summary.totalPatterns ?? 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Occurrences</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(summary.totalOccurrences ?? 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pattern List and Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern List */}
        <Card>
          <CardHeader>
            <CardTitle>Error Patterns ({patterns.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading patterns...</span>
              </div>
            ) : patterns.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No error patterns found</p>
                <p className="text-sm mt-2">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {patterns.map((pattern, index) => (
                  <div
                    key={pattern.fingerprint}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedPatternIndex === index
                      ? 'bg-primary/10 border-primary/30'
                      : 'hover:bg-muted border-border'
                      }`}
                    onClick={() => setSelectedPatternIndex(index)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate" title={pattern.pattern}>
                          {pattern.pattern}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {pattern.category && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${categoryColors[pattern.category] || categoryColors.other
                                }`}
                            >
                              {pattern.category}
                            </span>
                          )}
                          {pattern.severity && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${severityColors[pattern.severity as keyof typeof severityColors] ||
                                severityColors.low
                                }`}
                            >
                              {pattern.severity}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span>{(pattern.occurrenceCount ?? 0).toLocaleString()} occurrences</span>
                          <span>{pattern.affectedTestFiles.length} files</span>
                          <span>Last: {formatDate(pattern.lastSeen)}</span>
                        </div>
                        <div className="mt-1">
                          <TrendIndicator trend={pattern.trend} />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(pattern.fingerprint);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>
              Pattern Trend
              {selectedPattern && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  {selectedPattern.pattern}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPattern && selectedPatternTrendData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedPatternTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Occurrences"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-80 text-gray-500">
                <div className="text-center">
                  <p className="text-lg mb-2">📊</p>
                  <p>Select a pattern to view its trend</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Detail Dialog */}
      <ErrorDetailDialog
        fingerprint={selectedFingerprint}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

