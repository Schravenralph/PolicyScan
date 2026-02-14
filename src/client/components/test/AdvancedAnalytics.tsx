import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, TrendingUp, Clock, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import { TestApiService } from '../../services/api/TestApiService';

interface AdvancedAnalyticsProps {
  testApiService?: TestApiService;
}

export function AdvancedAnalytics({ testApiService: injectedTestApiService }: AdvancedAnalyticsProps) {
  const testApi = useMemo(() => injectedTestApiService || new TestApiService(), [injectedTestApiService]);

  const [mttr, setMttr] = useState<number | null>(null);
  const [chronicOffenders, setChronicOffenders] = useState<Array<{
    testId: string;
    testFilePath: string;
    testName: string;
    failureCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
    averageResolutionTime?: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(5);

  const loadMTTR = useCallback(async () => {
    try {
      const result = await testApi.getMTTR();
      setMttr(typeof result.mttrHours === 'number' ? result.mttrHours : null);
    } catch (err) {
      console.error('Error loading MTTR:', err);
      // Don't set error - MTTR is optional
    }
  }, [testApi]);

  const loadChronicOffenders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await testApi.getChronicOffenders(threshold);
      setChronicOffenders(Array.isArray(result.chronicOffenders) ? result.chronicOffenders : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chronic offenders';
      setError(errorMessage);
      console.error('Error loading chronic offenders:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, threshold]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadMTTR(), loadChronicOffenders()]);
  }, [loadMTTR, loadChronicOffenders]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatDuration = (hours: number): string => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    } else if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours.toFixed(1)}h`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Advanced Analytics Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Advanced Analytics
            </CardTitle>
            <Button onClick={loadAll} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MTTR Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold">Mean Time To Resolution</h3>
                  </div>
                </div>
                {mttr !== null ? (
                  <div>
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {formatDuration(mttr)}
                    </div>
                    <p className="text-sm text-gray-600">
                      Average time to resolve test failures
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No data available</div>
                )}
              </CardContent>
            </Card>

            {/* Chronic Offenders Summary */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <h3 className="font-semibold">Chronic Offenders</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600" htmlFor="chronic-threshold">Threshold:</label>
                    <input
                      id="chronic-threshold"
                      type="number"
                      min="1"
                      max="50"
                      value={threshold}
                      onChange={(e) => {
                        const newThreshold = parseInt(e.target.value) || 5;
                        setThreshold(newThreshold);
                      }}
                      onBlur={loadChronicOffenders}
                      className="w-16 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Minimum number of failures to be considered a chronic offender"
                    />
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : error ? (
                  <div className="text-sm text-red-600">{error}</div>
                ) : (
                  <div>
                    <div className="text-3xl font-bold text-red-600 mb-2">
                      {chronicOffenders.length}
                    </div>
                    <p className="text-sm text-gray-600">
                      Tests failing {threshold}+ times
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Chronic Offenders List */}
      {chronicOffenders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Chronic Offenders Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {chronicOffenders.slice(0, 10).map((offender, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">
                        {offender.testName || offender.testFilePath}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {offender.testFilePath}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-600">
                          Failures: <span className="font-semibold text-red-600">{offender.failureCount}</span>
                        </span>
                        {offender.averageResolutionTime && (
                          <span className="text-gray-600">
                            Avg Resolution: <span className="font-semibold">{formatDuration(offender.averageResolutionTime / 3600)}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        First seen: {new Date(offender.firstSeenAt).toLocaleDateString()} | 
                        Last seen: {new Date(offender.lastSeenAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {chronicOffenders.length > 10 && (
                <div className="text-sm text-gray-500 text-center pt-2">
                  Showing top 10 of {chronicOffenders.length} chronic offenders
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

