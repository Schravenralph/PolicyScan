/**
 * Dashboard Summary Cards Component
 * 
 * Displays summary statistics cards for test dashboard.
 */

import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import type { DashboardData } from '../../services/api/TestApiService';
import { t } from '../../utils/i18n';

interface DashboardSummaryCardsProps {
  dashboardData: DashboardData;
  flakyTestMetrics: {
    totalFlakyTests: number;
  } | null;
  flakyTestMetricsLoading: boolean;
}

export function DashboardSummaryCards({
  dashboardData,
  flakyTestMetrics,
  flakyTestMetricsLoading,
}: DashboardSummaryCardsProps) {
  const navigate = useNavigate();

  if (!dashboardData) return null;

  // Use suite-level metrics from summary (aggregated from all test runs)
  const suiteSummary = dashboardData.summary || dashboardData.mongodbSummary;
  const totalTests = (suiteSummary?.totalTests as number) || 0;
  const passedCount = (suiteSummary?.totalPassed as number) || 0;
  const failedCount = (suiteSummary?.totalFailed as number) || 0;
  const skippedCount = (suiteSummary?.totalSkipped as number) || 0;

  // Calculate percentages
  const passedPercentage = totalTests > 0 ? ((passedCount / totalTests) * 100).toFixed(1) : '0.0';
  const failedPercentage = totalTests > 0 ? ((failedCount / totalTests) * 100).toFixed(1) : '0.0';
  const skippedPercentage = totalTests > 0 ? ((skippedCount / totalTests) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-gray-600 mb-1">✅ {t('testDashboard.passed')}</div>
          <div className="text-3xl font-bold text-green-600">{passedCount.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">{passedPercentage}%</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-gray-600 mb-1">❌ {t('testDashboard.failed')}</div>
          <div className="text-3xl font-bold text-red-600">{failedCount.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">{failedPercentage}%</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-gray-600 mb-1">⏭️ {t('testDashboard.skipped')}</div>
          <div className="text-3xl font-bold text-yellow-600">{skippedCount.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">{skippedPercentage}%</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-gray-600 mb-1">📊 {t('testDashboard.totalTests')}</div>
          <div className="text-3xl font-bold">{totalTests.toLocaleString()}</div>
          {dashboardData.lastUpdated && (
            <div className="text-xs text-gray-500 mt-1">
              {t('testDashboard.updated')}: {new Date(dashboardData.lastUpdated).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card 
        className={flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0 ? 'cursor-pointer hover:bg-gray-50 transition-colors border-orange-200' : ''}
        onClick={() => {
          if (flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0) {
            navigate('/tests/trends#flake-detection');
          }
        }}
      >
        <CardContent className="pt-6">
          <div className="text-sm text-gray-600 mb-1">⚠️ {t('testDashboard.flakyTests')}</div>
          {flakyTestMetricsLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="text-3xl font-bold text-orange-600">
              {flakyTestMetrics?.totalFlakyTests || 0}
            </div>
          )}
          {flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {t('testDashboard.clickToViewDetails')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
