import { useEffect, useState, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TestApiService } from '../../services/api/TestApiService';

interface ErrorCategoriesData {
  categories: Array<{
    category: string;
    count: number;
    percentage: number;
    trend: Array<{ date: string; count: number }>;
    severity: { low: number; medium: number; high: number; critical: number };
  }>;
  summary: {
    totalErrors: number;
    totalCategories: number;
    dateRange: { from?: string; to?: string };
  };
}

interface ErrorOverviewProps {
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  testApiService?: TestApiService; // Optional dependency injection for testing
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function ErrorOverview({ dateRange, testApiService: injectedTestApiService }: ErrorOverviewProps) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ErrorCategoriesData | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Use getErrorLogs and group by category
      const result = await testApiService.getErrorLogs({
        timeRange: dateRange?.from?.toISOString(),
        limit: 1000,
      }) as { errors?: Array<{ errorCategory?: string; [key: string]: unknown }>; [key: string]: unknown };
      // Group errors by category
      const categoryCounts: Record<string, number> = {};
      (result.errors || []).forEach((error) => {
        const category = error.errorCategory || 'unknown';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
      const totalErrors = (result.errors || []).length;
      const totalCategories = Object.keys(categoryCounts).length;
      const categories: ErrorCategoriesData['categories'] = Object.entries(categoryCounts).map(([category, count]) => ({
        category,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
        trend: [],
        severity: { low: 0, medium: 0, high: 0, critical: 0 },
      }));
      const formattedData: ErrorCategoriesData = {
        categories,
        summary: {
          totalErrors,
          totalCategories,
          dateRange: {
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
          },
        },
      };
      setData(formattedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load error categories';
      setError(errorMessage);
      console.error('Error loading error categories:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange, testApiService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Prepare chart data
  const categoryChartData = data?.categories.map(cat => ({
    name: cat.category,
    count: cat.count,
    percentage: cat.percentage,
  })) || [];

  // Get top 10 most common error patterns (using categories for now)
  const topPatterns = data?.categories
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(cat => ({
      category: cat.category,
      count: cat.count,
      percentage: cat.percentage,
    })) || [];

  // Prepare trend data for line chart (aggregate all categories)
  const trendDataMap = new Map<string, number>();
  data?.categories.forEach(cat => {
    cat.trend.forEach(point => {
      const existing = trendDataMap.get(point.date) || 0;
      trendDataMap.set(point.date, existing + point.count);
    });
  });
  const trendData = Array.from(trendDataMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Error Overview</h2>
          <p className="text-gray-600 mt-1">Error statistics and trends by category</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data.summary.totalErrors.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data.summary.totalCategories}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Date Range</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {data.summary.dateRange.from && (
                  <div>From: {new Date(data.summary.dateRange.from).toLocaleDateString()}</div>
                )}
                {data.summary.dateRange.to && (
                  <div>To: {new Date(data.summary.dateRange.to).toLocaleDateString()}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Errors by Category - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Errors by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : categoryChartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#3b82f6" name="Error Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>No error category data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Errors by Category - Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Error Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : categoryChartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {categoryChartData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>No error distribution data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Frequency Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Error Frequency Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : trendData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
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
                    name="Error Count"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>No trend data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Most Common Error Patterns */}
      <Card>
        <CardHeader>
          <CardTitle>Most Common Error Patterns (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : topPatterns.length > 0 ? (
            <div className="space-y-2">
              {topPatterns.map((pattern, index) => (
                <div
                  key={pattern.category}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-medium w-8">#{index + 1}</span>
                    <span className="font-medium">{pattern.category}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600">{pattern.count.toLocaleString()} errors</span>
                    <span className="text-sm text-gray-500">({pattern.percentage.toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>No error patterns available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

