import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { ArrowLeft, RefreshCw, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import type { SustainabilityMetrics, SustainabilityKPI } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { t } from '../../utils/i18n';

interface FeatureDashboardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  featureKey: string;
  colorScheme: {
    primary: string; // CSS color value (e.g., '#3b82f6' or 'rgb(59, 130, 246)')
    secondary: string;
    accent: string;
  };
  getMetrics: (startDate: Date, endDate: Date) => Promise<SustainabilityMetrics>;
  getKPIs: (startDate: Date, endDate: Date) => Promise<SustainabilityKPI[]>;
  customMetrics?: React.ReactNode;
}

export function FeatureDashboard({
  title,
  description,
  icon,
  featureKey: _featureKey,
  colorScheme,
  getMetrics,
  getKPIs,
  customMetrics,
}: FeatureDashboardProps) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<SustainabilityMetrics | null>(null);
  const [kpis, setKpis] = useState<SustainabilityKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const endDate = new Date();
      const startDate = new Date();
      
      switch (dateRange) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case 'all':
          startDate.setFullYear(2020, 0, 1); // Start from 2020
          break;
      }

      const [metricsData, kpisData] = await Promise.all([
        getMetrics(startDate, endDate),
        getKPIs(startDate, endDate),
      ]);

      setMetrics(metricsData);
      setKpis(kpisData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <Card className="bg-gradient-to-br from-gray-50 to-gray-100">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
            <span className="ml-3 text-gray-600">{t('sustainability.loadingMetrics')}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchMetrics} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Generate time series data for charts
  // Note: Currently generates mock time series data based on current metrics with variation
  // In the future, this could be enhanced to fetch real historical data from the API
  const generateTimeSeriesData = () => {
    const data = [];
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
    const endDate = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      // Generate data points based on current metrics with realistic variation
      const baseCacheHitRate = metrics ? metrics.cacheHitRate * 100 : 0;
      const baseApiCallsAvoided = metrics ? Math.floor(metrics.apiCallsAvoided / days) : 0;
      const baseCo2Savings = metrics ? metrics.co2Savings / days : 0;
      
      data.push({
        date: date.toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' }),
        cacheHitRate: Math.max(0, Math.min(100, baseCacheHitRate + (Math.random() * 10 - 5))),
        apiCallsAvoided: Math.max(0, baseApiCallsAvoided + Math.floor(Math.random() * 10 - 5)),
        co2Savings: Math.max(0, baseCo2Savings + (Math.random() * 0.001 - 0.0005)),
      });
    }
    return data;
  };

  const chartData = generateTimeSeriesData();

  const chartConfig: ChartConfig = {
    cacheHitRate: {
      label: t('sustainability.cacheHitRate'),
      color: `hsl(var(--chart-1))`,
    },
    apiCallsAvoided: {
      label: t('sustainability.apiCallsAvoided'),
      color: `hsl(var(--chart-2))`,
    },
    co2Savings: {
      label: t('sustainability.co2Savings'),
      color: `hsl(var(--chart-3))`,
    },
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          onClick={() => navigate('/sustainability')}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Terug naar Duurzaamheidsbeleid
        </Button>
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <h1 className="text-4xl font-bold text-gray-900">{title}</h1>
        </div>
        <p className="text-xl text-gray-600">{description}</p>
      </div>

      {/* Date Range Selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as const).map((range) => (
                <Button
                  key={range}
                  onClick={() => setDateRange(range)}
                  variant={dateRange === range ? 'default' : 'outline'}
                  size="sm"
                  style={dateRange === range ? { backgroundColor: colorScheme.primary, borderColor: colorScheme.primary, color: 'white' } : {}}
                  className={dateRange === range ? 'hover:opacity-90' : ''}
                >
                  {range === 'all' ? t('sustainability.all') : range.toUpperCase()}
                </Button>
              ))}
            </div>
            <Button onClick={fetchMetrics} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Vernieuwen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      {metrics && (
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: colorScheme.primary }}>
                  {metrics.cacheHitRate ? (metrics.cacheHitRate * 100).toFixed(1) : '0'}%
                </div>
                <div className="text-sm text-gray-600">Cache Hit Rate</div>
                <div className="text-xs text-gray-500 mt-1">
                  {metrics.cacheHits.toLocaleString()} / {metrics.totalCacheRequests.toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: colorScheme.secondary }}>
                  {metrics.apiCallsAvoided.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">API Calls Avoided</div>
                <div className="text-xs text-gray-500 mt-1">
                  {metrics.totalAPICalls.toLocaleString()} total calls
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: colorScheme.accent }}>
                  {metrics.co2Savings.toFixed(4)} kg
                </div>
                <div className="text-sm text-gray-600">CO2 Savings</div>
                <div className="text-xs text-gray-500 mt-1">
                  {metrics.totalCO2Emitted.toFixed(4)} kg emitted
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1 text-green-600">
                  ${metrics.costSavings.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Cost Savings</div>
                <div className="text-xs text-gray-500 mt-1">
                  ${metrics.energyCostSavings.toFixed(2)} energy
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom Metrics */}
      {customMetrics}

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Cache Hit Rate Trend</CardTitle>
            <CardDescription>Percentage of requests served from cache over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <ChartTooltipContent
                        active={active}
                        payload={payload as unknown as Array<typeof payload[0] & { name?: string; value?: unknown; dataKey?: string; payload?: Record<string, unknown>; color?: string; fill?: string; }>}
                        formatter={(value) => [
                          typeof value === 'number' ? value.toFixed(2) : String(value),
                          'Cache Hit Rate (%)',
                        ]}
                      />
                    );
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cacheHitRate"
                  stroke={colorScheme.primary}
                  strokeWidth={2}
                  name="Cache Hit Rate (%)"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Calls Avoided</CardTitle>
            <CardDescription>Number of API calls avoided through caching</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <ChartTooltipContent
                        active={active}
                        payload={payload as unknown as Array<typeof payload[0] & { name?: string; value?: unknown; dataKey?: string; payload?: Record<string, unknown>; color?: string; fill?: string; }>}
                        formatter={(value) => [
                          typeof value === 'number' ? value.toLocaleString() : String(value),
                          'API Calls Avoided',
                        ]}
                      />
                    );
                  }}
                />
                <Legend />
                <Bar
                  dataKey="apiCallsAvoided"
                  fill={colorScheme.secondary}
                  name="API Calls Avoided"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* KPIs */}
      {kpis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Performance Indicators</CardTitle>
            <CardDescription>Detailed metrics and targets for this feature</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {kpis.map((kpi) => (
                <div key={kpi.name} className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{kpi.name}</span>
                    <div className="flex items-center gap-2">
                      {kpi.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-600" />}
                      {kpi.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-600" />}
                      <span className="font-bold" style={{ color: colorScheme.primary }}>
                        {typeof kpi.value === 'number' ? kpi.value.toFixed(2) : 'N/A'} {kpi.unit}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{kpi.description}</p>
                  {kpi.target && (
                    <div className="mt-2 text-xs text-gray-500">
                      Target: {kpi.target} {kpi.unit}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

