import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface QueryIdLinkageStats {
  success: boolean;
  totalDocuments: number;
  withQueryId: number;
  withoutQueryId: number;
  linkageIssues: number;
  linkageRate: number;
  bySource: Record<string, {
    total: number;
    withQueryId: number;
    withoutQueryId: number;
    linkageIssues: number;
  }>;
  timestamp: string;
}

type TimeRange = '24h' | '7d' | '30d';

export function QueryIdLinkageDashboard() {
  const [stats, setStats] = useState<QueryIdLinkageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const getDays = (range: TimeRange): number => {
    switch (range) {
      case '24h': return 1;
      case '7d': return 7;
      case '30d': return 30;
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

      const queryParams = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const response = await api.get<QueryIdLinkageStats>(
        `/canonical-documents/monitoring/queryid-linkage?${queryParams.toString()}`
      );

      setStats(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queryId linkage statistics');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading queryId linkage statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800 font-semibold">Error loading queryId linkage statistics</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <Button onClick={fetchData} className="mt-2" variant="destructive">
          Retry
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500">
        No queryId linkage data available
      </div>
    );
  }

  const linkageRateColor = stats.linkageRate >= 95 ? 'text-green-600' : stats.linkageRate >= 80 ? 'text-yellow-600' : 'text-red-600';
  const linkageRateBg = stats.linkageRate >= 95 ? 'bg-green-50' : stats.linkageRate >= 80 ? 'bg-yellow-50' : 'bg-red-50';

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">QueryId Linkage Monitoring</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Time Range:</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="auto-refresh" className="text-sm text-gray-600">
              Auto-refresh (30s)
            </label>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalDocuments.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">With QueryId</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.withQueryId.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.totalDocuments > 0
                ? ((stats.withQueryId / stats.totalDocuments) * 100).toFixed(1)
                : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Without QueryId</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.withoutQueryId.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.totalDocuments > 0
                ? ((stats.withoutQueryId / stats.totalDocuments) * 100).toFixed(1)
                : 0}% of total
            </div>
          </CardContent>
        </Card>

        <Card className={linkageRateBg}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Linkage Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${linkageRateColor}`}>
              {stats.linkageRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.linkageIssues > 0 && (
                <span className="text-red-600">{stats.linkageIssues} linkage issues</span>
              )}
              {stats.linkageIssues === 0 && <span className="text-green-600">No issues</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linkage Issues Alert */}
      {stats.linkageIssues > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">⚠️ Linkage Issues Detected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              {stats.linkageIssues} document{stats.linkageIssues !== 1 ? 's' : ''} have a workflowRunId but are missing a queryId.
              This may indicate a problem with the document persistence workflow.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Breakdown by Source */}
      {Object.keys(stats.bySource).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Linkage Statistics by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Source</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">With QueryId</th>
                    <th className="text-right p-2">Without QueryId</th>
                    <th className="text-right p-2">Linkage Rate</th>
                    <th className="text-right p-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.bySource).map(([source, sourceStats]) => {
                    const sourceLinkageRate = sourceStats.total > 0
                      ? (sourceStats.withQueryId / sourceStats.total) * 100
                      : 0;
                    const hasIssues = sourceStats.linkageIssues > 0;

                    return (
                      <tr key={source} className={`border-b ${hasIssues ? 'bg-yellow-50' : ''}`}>
                        <td className="p-2 font-medium">{source}</td>
                        <td className="p-2 text-right">{sourceStats.total.toLocaleString()}</td>
                        <td className="p-2 text-right text-green-600">
                          {sourceStats.withQueryId.toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-yellow-600">
                          {sourceStats.withoutQueryId.toLocaleString()}
                        </td>
                        <td className={`p-2 text-right ${sourceLinkageRate >= 95 ? 'text-green-600' : sourceLinkageRate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {sourceLinkageRate.toFixed(1)}%
                        </td>
                        <td className={`p-2 text-right ${hasIssues ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {sourceStats.linkageIssues > 0 ? sourceStats.linkageIssues : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Updated */}
      <div className="text-sm text-gray-500 text-center">
        Last updated: {new Date(stats.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
