import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { TrendingDown, Download, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import type { SustainabilityMetrics, SustainabilityKPI } from '../services/api';
import { t } from '../utils/i18n';
import { toast } from '../utils/toast';

export function SustainabilityMetricsCard() {
  const [metrics, setMetrics] = useState<SustainabilityMetrics | null>(null);
  const [kpis, setKpis] = useState<SustainabilityKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days

      const [metricsData, kpisData] = await Promise.all([
        api.sustainability.getMetrics(startDate, endDate),
        api.sustainability.getKPIs(startDate, endDate),
      ]);

      setMetrics(metricsData);
      setKpis(kpisData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sustainability.loadMetricsFailed'));
      console.error('Error fetching sustainability metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleDownload = async (format: 'json' | 'csv' | 'pdf') => {
    try {
      setDownloading(true);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      await api.sustainability.downloadReport(format, startDate, endDate);
    } catch (err) {
      console.error('Error downloading report:', err);
      toast.error(t('sustainability.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <Card className="mb-8 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="ml-3 text-gray-600">{t('sustainability.loadingMetrics')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-8 bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchMetrics}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              {t('sustainability.retry')}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cacheHitRate = metrics && metrics.cacheHitRate != null ? (metrics.cacheHitRate * 100).toFixed(1) : '0';
  const co2Savings = metrics && metrics.co2Savings != null ? metrics.co2Savings.toFixed(4) : '0';
  const costSavings = metrics && metrics.costSavings != null ? metrics.costSavings.toFixed(2) : '0';

  return (
    <Card className="mb-8 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-6 h-6 text-emerald-600" />
            <CardTitle className="text-2xl">{t('sustainability.impact.title')}</CardTitle>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('json')}
              disabled={downloading}
              className="px-3 py-1.5 text-sm bg-white border border-emerald-300 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50"
              title={t('sustainability.downloadJson')}
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
            <button
              onClick={() => handleDownload('csv')}
              disabled={downloading}
              className="px-3 py-1.5 text-sm bg-white border border-emerald-300 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50"
              title={t('sustainability.downloadCsv')}
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading}
              className="px-3 py-1.5 text-sm bg-white border border-emerald-300 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50"
              title={t('sustainability.downloadPdf')}
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={fetchMetrics}
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-white border border-emerald-300 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50"
              title={t('sustainability.refreshMetrics')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <CardDescription className="text-base">{t('sustainability.impact.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-6 bg-white rounded-lg shadow-sm">
            <div className="text-4xl font-bold text-emerald-600 mb-2">{cacheHitRate}%</div>
            <div className="text-sm text-gray-600">{t('sustainability.cacheHitRate')}</div>
            {metrics && (
              <div className="text-xs text-gray-500 mt-1">
                {metrics.cacheHits.toLocaleString()} {t('sustainability.hits')} / {metrics.totalCacheRequests.toLocaleString()} {t('sustainability.requests')}
              </div>
            )}
          </div>
          <div className="text-center p-6 bg-white rounded-lg shadow-sm">
            <div className="text-4xl font-bold text-blue-600 mb-2">{co2Savings} kg</div>
            <div className="text-sm text-gray-600">{t('sustainability.co2Savings')}</div>
            {metrics && (
              <div className="text-xs text-gray-500 mt-1">
                {metrics.apiCallsAvoided.toLocaleString()} {t('sustainability.apiCallsAvoided')}
              </div>
            )}
          </div>
          <div className="text-center p-6 bg-white rounded-lg shadow-sm">
            <div className="text-4xl font-bold text-purple-600 mb-2">${costSavings}</div>
            <div className="text-sm text-gray-600">{t('sustainability.costSavings')}</div>
            {metrics && metrics.energyCostSavings != null && (
              <div className="text-xs text-gray-500 mt-1">
                ${metrics.energyCostSavings.toFixed(2)} {t('sustainability.energySavings')}
              </div>
            )}
          </div>
        </div>
        
        {kpis.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">{t('sustainability.keyPerformanceIndicators')}</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {kpis.map((kpi) => (
                <div key={kpi.name} className="p-4 bg-white rounded-lg border border-emerald-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{kpi.name}</span>
                    <span className="text-emerald-600 font-bold">
                      {kpi.value != null ? kpi.value.toFixed(2) : t('common.notAvailable')} {kpi.unit}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{kpi.description}</p>
                  {kpi.target && (
                    <div className="mt-2 text-xs text-gray-500">
                      {t('sustainability.target')} {kpi.target} {kpi.unit}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-white rounded-lg border-l-4 border-emerald-500">
          <p className="text-gray-700 text-sm">{t('sustainability.impact.note')}</p>
        </div>
      </CardContent>
    </Card>
  );
}


