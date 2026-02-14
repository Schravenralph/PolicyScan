import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

interface AIUsageStats {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  averageDuration: number;
  errorRate: number;
  callsByProvider: Record<string, number>;
  callsByModel: Record<string, number>;
  callsByOperation: Record<string, number>;
  tokensByProvider: Record<string, number>;
  costByProvider: Record<string, number>;
}

interface DailyMetric {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
}

interface CacheStats {
  hitRate: number;
  hits: number;
  misses: number;
  total: number;
  costSavings: number;
}

interface CarbonFootprint {
  totalCO2: number;
  totalTokens: number;
  averageCO2Per1KTokens: number;
  breakdownByProvider: Record<string, number>;
}

export function AIUsageDashboard() {
  const [stats, setStats] = useState<AIUsageStats | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [carbonFootprint, setCarbonFootprint] = useState<CarbonFootprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [operationFilter, setOperationFilter] = useState<string>('');

  const getDays = (range: '7d' | '30d' | '90d'): number => {
    switch (range) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const days = getDays(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Build query parameters with optional operation filter
      const queryParams = new URLSearchParams({
        startDate: startDateStr,
        endDate: endDateStr,
      });
      if (operationFilter) {
        queryParams.append('operation', operationFilter);
      }

      // Fetch all data in parallel
      const [statsRes, dailyRes, cacheRes, carbonRes] = await Promise.all([
        api.get<AIUsageStats>(`/ai-usage/stats?${queryParams.toString()}`),
        api.get<DailyMetric[]>(`/ai-usage/daily?${queryParams.toString()}`),
        api.get<CacheStats>(`/ai-usage/cache-stats?${queryParams.toString()}`),
        api.get<CarbonFootprint>(`/ai-usage/carbon-footprint?${queryParams.toString()}`),
      ]);

      setStats(statsRes);
      setDailyMetrics(dailyRes);
      setCacheStats(cacheRes);
      setCarbonFootprint(carbonRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedToLoadAIUsageData'));
      console.error('Error fetching AI usage data:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange, operationFilter]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeRange, fetchData]);

  if (loading && !stats) {
    return (
      <div className="p-6">
        <div className="text-center">{t('aiUsage.loadingData')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">{t('aiUsage.error')} {error}</div>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">AI Usage Monitoring & Analytics</h2>
        <div className="flex gap-2">
          <select
            value={operationFilter}
            onChange={(e) => setOperationFilter(e.target.value)}
            className="px-3 py-2 border rounded"
            disabled={!stats}
          >
            <option value="">{t('common.allOperations')}</option>
            {stats && Object.keys(stats.callsByOperation || {}).map((op) => (
              <option key={op} value={op}>
                {op.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
            className="px-3 py-2 border rounded"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? t('common.refreshing') : t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total API Calls</div>
            <div className="text-2xl font-bold">{stats.totalCalls.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Tokens</div>
            <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Cost</div>
            <div className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Cache Hit Rate</div>
            <div className="text-2xl font-bold">{(stats.cacheHitRate * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Cache Statistics */}
      {cacheStats && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">{t('aiUsage.cachePerformance')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">{t('aiUsage.hitRate')}</div>
              <div className="text-2xl font-bold">{(cacheStats.hitRate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">{t('aiUsage.cacheHits')}</div>
              <div className="text-2xl font-bold">{cacheStats.hits.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">{t('aiUsage.cacheMisses')}</div>
              <div className="text-2xl font-bold">{cacheStats.misses.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Cost Savings</div>
              <div className="text-2xl font-bold text-green-600">${cacheStats.costSavings.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Carbon Footprint */}
      {carbonFootprint && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">{t('aiUsage.carbonFootprintEstimate')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total CO₂ Equivalent</div>
              <div className="text-2xl font-bold">{carbonFootprint.totalCO2.toFixed(4)} kg</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Tokens</div>
              <div className="text-2xl font-bold">{carbonFootprint.totalTokens.toLocaleString()}</div>
            </div>
          </div>
          {Object.keys(carbonFootprint.breakdownByProvider).length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Breakdown by Provider:</div>
              <div className="space-y-1">
                {Object.entries(carbonFootprint.breakdownByProvider).map(([provider, co2]) => (
                  <div key={provider} className="flex justify-between">
                    <span className="capitalize">{provider}:</span>
                    <span>{co2.toFixed(4)} kg CO₂</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Daily Metrics Chart */}
      {dailyMetrics.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">{t('aiUsage.dailyApiCalls')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">{t('aiUsage.date')}</th>
                  <th className="text-right p-2">{t('aiUsage.calls')}</th>
                  <th className="text-right p-2">{t('aiUsage.tokens')}</th>
                  <th className="text-right p-2">{t('aiUsage.cost')}</th>
                  <th className="text-right p-2">{t('aiUsage.cacheHits')}</th>
                  <th className="text-right p-2">{t('aiUsage.errors')}</th>
                </tr>
              </thead>
              <tbody>
                {dailyMetrics.map((metric) => (
                  <tr key={metric.date} className="border-b">
                    <td className="p-2">{metric.date}</td>
                    <td className="text-right p-2">{metric.calls.toLocaleString()}</td>
                    <td className="text-right p-2">{metric.tokens.toLocaleString()}</td>
                    <td className="text-right p-2">${metric.cost.toFixed(2)}</td>
                    <td className="text-right p-2">{metric.cacheHits.toLocaleString()}</td>
                    <td className="text-right p-2 text-red-600">{metric.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Breakdown by Provider/Model/Operation */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.keys(stats.callsByProvider).length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-4">Calls by Provider</h3>
              <div className="space-y-2">
                {Object.entries(stats.callsByProvider)
                  .sort(([, a], [, b]) => b - a)
                  .map(([provider, count]) => (
                    <div key={provider} className="flex justify-between">
                      <span className="capitalize">{provider}:</span>
                      <span className="font-semibold">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {Object.keys(stats.callsByModel).length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-4">Calls by Model</h3>
              <div className="space-y-2">
                {Object.entries(stats.callsByModel)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([model, count]) => (
                    <div key={model} className="flex justify-between">
                      <span className="truncate">{model}:</span>
                      <span className="font-semibold">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {Object.keys(stats.callsByOperation).length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-4">{t('admin.callsByOperation')}</h3>
              <div className="space-y-2">
                {Object.entries(stats.callsByOperation)
                  .sort(([, a], [, b]) => b - a)
                  .map(([operation, count]) => (
                    <div key={operation} className="flex justify-between">
                      <span className="capitalize">{operation.replace(/_/g, ' ')}:</span>
                      <span className="font-semibold">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Rechtspraak Query Expansion Metrics */}
          {stats.callsByOperation['rechtspraak_query_expansion'] && (
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
              <h3 className="text-xl font-semibold mb-4">Rechtspraak Query Expansion</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Total Expansions</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.callsByOperation['rechtspraak_query_expansion'].toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Cache Hit Rate</div>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.cacheHitRate > 0 
                      ? `${(stats.cacheHitRate * 100).toFixed(1)}%`
                      : t('common.notAvailable')}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Estimated Cost</div>
                  <div className="text-2xl font-bold">
                    ${stats.totalCost > 0 ? stats.totalCost.toFixed(4) : '0.0000'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (for Rechtspraak expansion)
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-600 mb-2">{t('admin.performanceMetrics')}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Avg Duration</div>
                    <div className="font-semibold">
                      {stats.averageDuration > 0 
                        ? `${(stats.averageDuration / 1000).toFixed(2)}s`
                        : t('common.notAvailable')}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Tokens</div>
                    <div className="font-semibold">{stats.totalTokens.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Error Rate</div>
                    <div className="font-semibold text-red-600">
                      {(stats.errorRate * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Cost per Expansion</div>
                    <div className="font-semibold">
                      ${stats.callsByOperation['rechtspraak_query_expansion'] > 0
                        ? (stats.totalCost / stats.callsByOperation['rechtspraak_query_expansion']).toFixed(6)
                        : '0.000000'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <a
                  href="/admin?tab=ai-usage&operation=rechtspraak_query_expansion"
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View detailed metrics →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

