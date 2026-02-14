/**
 * Failure Pattern Analysis Widget
 * 
 * Displays failure patterns, summary statistics, and recommendations.
 */

import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { TestApiService } from '../../services/api/TestApiService';
import { useDebounce } from '../../hooks/useDebounce';

interface FailurePatternAnalysisWidgetProps {
  testApiService: TestApiService;
  autoLoad?: boolean;
}

export function FailurePatternAnalysisWidget({
  testApiService,
  autoLoad = false,
}: FailurePatternAnalysisWidgetProps) {
  const [failurePatterns, setFailurePatterns] = useState<any>(null);
  const [failurePatternsLoading, setFailurePatternsLoading] = useState(false);
  const [failurePatternsError, setFailurePatternsError] = useState<string | null>(null);
  const [failurePatternTimeWindow, setFailurePatternTimeWindow] = useState<number>(30);

  const loadFailurePatterns = useCallback(async () => {
    setFailurePatternsLoading(true);
    setFailurePatternsError(null);

    try {
      const patterns = await testApiService.getFailurePatterns({
        timeRangeDays: failurePatternTimeWindow,
      });
      setFailurePatterns(patterns);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load failure patterns';
      setFailurePatternsError(errorMessage);
      console.error('Error loading failure patterns:', err);
    } finally {
      setFailurePatternsLoading(false);
    }
  }, [testApiService, failurePatternTimeWindow]);

  // Debounce time window changes to avoid excessive API calls
  const debouncedFailurePatternTimeWindow = useDebounce(failurePatternTimeWindow, 500);

  // Auto-load patterns when time window changes (debounced)
  useEffect(() => {
    if (autoLoad && debouncedFailurePatternTimeWindow) {
      loadFailurePatterns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFailurePatternTimeWindow, autoLoad]);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadFailurePatterns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 Failure Pattern Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="failurePatternTimeWindow" className="text-sm font-medium">
              Time Window:
            </label>
            <select
              id="failurePatternTimeWindow"
              value={failurePatternTimeWindow}
              onChange={(e) => setFailurePatternTimeWindow(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          <Button onClick={loadFailurePatterns} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Load Patterns
          </Button>
        </div>

        {failurePatternsLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-600">Loading failure patterns...</span>
          </div>
        )}

        {failurePatternsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{failurePatternsError}</span>
            </div>
          </div>
        )}

        {failurePatterns && !failurePatternsLoading && (
          <div className="space-y-6">
            {failurePatterns.patterns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">✅</div>
                <p>No failure patterns found. All tests are passing!</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">📊 Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-600 mb-1">Total Patterns</div>
                        <div className="text-2xl font-bold">{failurePatterns.patterns.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-600 mb-1">Total Failures</div>
                        <div className="text-2xl font-bold text-red-600">{failurePatterns.totalFailures || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-600 mb-1">Critical</div>
                        <div className="text-2xl font-bold text-red-600">
                          {failurePatterns.summary?.bySeverity?.critical || 0}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-gray-600 mb-1">High</div>
                        <div className="text-2xl font-bold text-yellow-600">
                          {failurePatterns.summary?.bySeverity?.high || 0}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Top Patterns */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">🔝 Top Failure Patterns</h3>
                  <div className="space-y-3">
                    {failurePatterns.patterns.slice(0, 10).map((pattern: any) => {
                      const severityColors: Record<string, string> = {
                        critical: 'bg-red-600',
                        high: 'bg-orange-500',
                        medium: 'bg-yellow-500',
                        low: 'bg-blue-500',
                      };
                      return (
                        <div
                          key={pattern.id}
                          className="border border-gray-200 rounded-lg p-4 bg-white"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-semibold text-white uppercase ${
                                    severityColors[pattern.severity] || 'bg-blue-500'
                                  }`}
                                >
                                  {pattern.severity}
                                </span>
                                <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                                  {pattern.category}
                                </span>
                              </div>
                              <div className="font-semibold text-gray-900 mb-1">{pattern.pattern}</div>
                              <div className="text-sm text-gray-600">
                                Occurrences: {pattern.frequency} | Affected Tests: {pattern.affectedTests.length} | Environments: {pattern.affectedEnvironments.length}
                              </div>
                            </div>
                          </div>
                          {pattern.rootCauseSuggestions && pattern.rootCauseSuggestions.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs font-semibold text-gray-600 mb-2">💡 Root Cause Suggestions:</div>
                              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                {pattern.rootCauseSuggestions.map((suggestion: string, idx: number) => (
                                  <li key={idx}>{suggestion}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommendations */}
                {failurePatterns.recommendations && failurePatterns.recommendations.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">💡 Recommendations</h3>
                    <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {failurePatterns.recommendations.map((rec: string, idx: number) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!failurePatterns && !failurePatternsLoading && !failurePatternsError && (
          <div className="text-center py-8 text-gray-500">
            <p>Click "Load Patterns" to analyze failure patterns.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

