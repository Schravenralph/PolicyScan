import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { usePerformanceMetrics } from '../../hooks/usePerformanceMetrics';
import { t } from '../../utils/i18n';

type TimeRange = '1h' | '6h' | '24h' | '7d';

export function PerformanceDashboard() {
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const { statistics, baseline, comparison, timeSeries, loading, error, refresh, isRefreshing } =
        usePerformanceMetrics({
            refreshInterval: autoRefresh ? 30000 : 0,
            enabled: autoRefresh,
            timeRange,
        });

    if (loading && !statistics) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">{t('performance.loadingMetrics')}</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-800 font-semibold">{t('performance.errorLoading')}</div>
                <div className="text-red-600 text-sm mt-1">{error.message}</div>
                <button
                    onClick={() => refresh()}
                    className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                    {t('performance.retry')}
                </button>
            </div>
        );
    }

    if (!statistics) {
        return (
            <div className="text-center py-8 text-gray-500">
                {t('performance.noDataAvailable')}
            </div>
        );
    }

    // Format time series data for charts
    const responseTimeData = timeSeries?.map((point) => ({
        timestamp: new Date(point.timestamp).toLocaleTimeString(),
        p50: Math.round(point.p50),
        p95: Math.round(point.p95),
        p99: Math.round(point.p99),
    })) || [];

    const errorRateData = timeSeries?.map((point) => ({
        timestamp: new Date(point.timestamp).toLocaleTimeString(),
        errorRate: (point.error_rate * 100).toFixed(2),
        errorCount: point.error_count,
        totalRequests: point.total_requests,
    })) || [];

    const throughputData = timeSeries?.map((point) => ({
        timestamp: new Date(point.timestamp).toLocaleTimeString(),
        throughput: Math.round(point.throughput * 100) / 100,
    })) || [];

    // Chart config reserved for future use
    // const chartConfig = {
    //     p50: { label: 'P50', color: '#3b82f6' },
    //     p95: { label: 'P95', color: '#8b5cf6' },
    //     p99: { label: 'P99', color: '#ef4444' },
    //     errorRate: { label: 'Error Rate (%)', color: '#ef4444' },
    //     throughput: { label: 'Throughput (req/h)', color: '#10b981' },
    // };

    return (
        <div className="space-y-6">
            {/* Header with controls */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Performance Dashboard</h2>
                <div className="flex gap-2 items-center">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                        {(['1h', '6h', '24h', '7d'] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-3 py-1 text-sm rounded ${
                                    timeRange === range
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                {range === '7d' ? t('common.sevenDays') : range.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded"
                        />
                        Auto-refresh
                    </label>
                    <button
                        onClick={() => refresh()}
                        disabled={isRefreshing}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600 mb-1">P95 Response Time</div>
                    <div className="text-2xl font-bold text-blue-600">{Math.round(statistics.p95)}ms</div>
                    {baseline && (
                        <div className="text-xs text-gray-500 mt-1">
                            Baseline: {Math.round(baseline.p95)}ms
                        </div>
                    )}
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600 mb-1">Error Rate</div>
                    <div className="text-2xl font-bold text-red-600">
                        {(statistics.error_rate * 100).toFixed(2)}%
                    </div>
                    {baseline && (
                        <div className="text-xs text-gray-500 mt-1">
                            Baseline: {(baseline.error_rate * 100).toFixed(2)}%
                        </div>
                    )}
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600 mb-1">Throughput</div>
                    <div className="text-2xl font-bold text-green-600">
                        {Math.round(statistics.throughput)} req/h
                    </div>
                    {baseline && (
                        <div className="text-xs text-gray-500 mt-1">
                            Baseline: {Math.round(baseline.throughput)} req/h
                        </div>
                    )}
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Requests</div>
                    <div className="text-2xl font-bold text-gray-800">
                        {statistics.total_requests.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        Errors: {statistics.error_count}
                    </div>
                </div>
            </div>

            {/* Alerts */}
            {comparison && comparison.alerts.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="font-semibold text-yellow-800 mb-2">{t('admin.performanceAlerts')}</div>
                    <div className="space-y-1">
                        {comparison.alerts.map((alert, idx) => (
                            <div key={idx} className="text-sm">
                                <span className={`font-medium ${
                                    alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'
                                }`}>
                                    {alert.severity === 'critical' ? '🔴' : '⚠️'} {alert.metric}:
                                </span>
                                <span className="ml-2">
                                    {alert.value.toFixed(2)} (baseline: {alert.baseline_value.toFixed(2)}, 
                                    deviation: {alert.deviation_percent > 0 ? '+' : ''}
                                    {alert.deviation_percent.toFixed(1)}%)
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Response Time Chart */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Response Time Percentiles</h3>
                {responseTimeData.length > 0 ? (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={responseTimeData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="timestamp" />
                                <YAxis label={{ value: 'Response Time (ms)', angle: -90, position: 'insideLeft' }} />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="p50"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    name="P50"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="p95"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    name="P95"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="p99"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    name="P99"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">No time-series data available</div>
                )}
            </div>

            {/* Error Rate Chart */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Error Rate</h3>
                {errorRateData.length > 0 ? (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={errorRateData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="timestamp" />
                                <YAxis label={{ value: 'Error Rate (%)', angle: -90, position: 'insideLeft' }} />
                                <Tooltip
                                    formatter={(value: number) => [`${value}%`, 'Error Rate']}
                                />
                                <Legend />
                                <Bar dataKey="errorRate" fill="#ef4444" name="Error Rate (%)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">No time-series data available</div>
                )}
            </div>

            {/* Throughput Chart */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Throughput</h3>
                {throughputData.length > 0 ? (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={throughputData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="timestamp" />
                                <YAxis label={{ value: 'Requests per Hour', angle: -90, position: 'insideLeft' }} />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="throughput"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    name="Throughput (req/h)"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">No time-series data available</div>
                )}
            </div>

            {/* Current Statistics Table */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Current Statistics</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Metric
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Current Value
                                </th>
                                {baseline && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Baseline
                                    </th>
                                )}
                                {comparison && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Deviation
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            <tr>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    P50 Response Time
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {Math.round(statistics.p50)}ms
                                </td>
                                {baseline && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(baseline.p50)}ms
                                    </td>
                                )}
                                {comparison && (
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        comparison.deviations.p50 > 0 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                        {comparison.deviations.p50 > 0 ? '+' : ''}
                                        {comparison.deviations.p50.toFixed(1)}%
                                    </td>
                                )}
                            </tr>
                            <tr>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    P95 Response Time
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {Math.round(statistics.p95)}ms
                                </td>
                                {baseline && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(baseline.p95)}ms
                                    </td>
                                )}
                                {comparison && (
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        comparison.deviations.p95 > 0 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                        {comparison.deviations.p95 > 0 ? '+' : ''}
                                        {comparison.deviations.p95.toFixed(1)}%
                                    </td>
                                )}
                            </tr>
                            <tr>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    P99 Response Time
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {Math.round(statistics.p99)}ms
                                </td>
                                {baseline && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(baseline.p99)}ms
                                    </td>
                                )}
                                {comparison && (
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        comparison.deviations.p99 > 0 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                        {comparison.deviations.p99 > 0 ? '+' : ''}
                                        {comparison.deviations.p99.toFixed(1)}%
                                    </td>
                                )}
                            </tr>
                            <tr>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    Error Rate
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {(statistics.error_rate * 100).toFixed(2)}%
                                </td>
                                {baseline && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {(baseline.error_rate * 100).toFixed(2)}%
                                    </td>
                                )}
                                {comparison && (
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        comparison.deviations.error_rate > 0 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                        {comparison.deviations.error_rate > 0 ? '+' : ''}
                                        {comparison.deviations.error_rate.toFixed(1)}%
                                    </td>
                                )}
                            </tr>
                            <tr>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    Throughput
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {Math.round(statistics.throughput)} req/h
                                </td>
                                {baseline && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(baseline.throughput)} req/h
                                    </td>
                                )}
                                {comparison && (
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        comparison.deviations.throughput < 0 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                        {comparison.deviations.throughput > 0 ? '+' : ''}
                                        {comparison.deviations.throughput.toFixed(1)}%
                                    </td>
                                )}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}





