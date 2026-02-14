/**
 * Dashboard Main Content Component
 * 
 * Extracted from TestDashboardPage to improve maintainability.
 * Contains summary cards, test execution timeline, flaky tests widget, and quick links.
 */

import { useNavigate } from 'react-router-dom';
import { TestApiService, type DashboardData } from '../../services/api/TestApiService';
import { TrendingUp, ExternalLink, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { TestRunsList } from './TestRunsList';
import { FailurePatternAnalysisWidget } from './FailurePatternAnalysisWidget';
import { ErrorLogsWidget } from './ErrorLogsWidget';
import { AdvancedAnalytics } from './AdvancedAnalytics';
import { ActiveFailuresWidget } from './ActiveFailuresWidget';
import type { TestStatistics } from '../../hooks/useTestStatistics';
import type { ActiveFailuresState } from '../../hooks/useActiveFailures';
import { DashboardSummaryCards } from './DashboardSummaryCards';
import { QuickComparisonWidget } from './QuickComparisonWidget';
import { DashboardQuickLinks } from './DashboardQuickLinks';
import { t } from '../../utils/i18n';

interface DashboardMainContentProps {
  dashboardData: DashboardData | null;
  testApiService: TestApiService;
  noDataHelp?: string | null;
  onLoadMore: () => Promise<void>;
  testRunsHasMore: boolean;
  testRunsLoadingMore: boolean;
  onFilteredDataChange: (data: {
    filter: { status?: string; dateRange?: string; testFile?: string; testType?: string };
    filteredTestRuns: Array<any>;
    displayedTestRuns: Array<any>;
  } | null) => void;
  flakyTestMetrics: {
    totalFlakyTests: number;
    flakyTests?: Array<{
      test_id?: string;
      suite?: string;
      pass_rate: number;
      flake_rate: number;
    }>;
  } | null;
  flakyTestMetricsLoading: boolean;
  statistics: TestStatistics | null;
  activeFailures: ActiveFailuresState | null;
  activeFailuresLoading: boolean;
}

export function DashboardMainContent({
  dashboardData,
  testApiService,
  noDataHelp,
  onLoadMore,
  testRunsHasMore,
  testRunsLoadingMore,
  onFilteredDataChange,
  flakyTestMetrics,
  flakyTestMetricsLoading,
  statistics,
  activeFailures,
  activeFailuresLoading,
}: DashboardMainContentProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Summary Cards */}
      {dashboardData && (
        <DashboardSummaryCards
          dashboardData={dashboardData}
          flakyTestMetrics={flakyTestMetrics}
          flakyTestMetricsLoading={flakyTestMetricsLoading}
        />
      )}

      {/* Quick Comparison Widget */}
      {dashboardData && dashboardData.recentRuns.length >= 2 && (
        <QuickComparisonWidget
          latestRun={dashboardData.recentRuns[0]}
          previousRun={dashboardData.recentRuns[1]}
        />
      )}

      {/* Statistics Widget */}
      {statistics && (
        <Card className="col-span-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Test Execution Statistics
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/tests/trends')}
              >
                {t('dashboardMainContent.viewDetailedTrends')}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-gray-500 mb-2">{t('dashboardMainContent.overallPassRate')}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{statistics.passRate.toFixed(1)}%</span>
                  {statistics.passRateTrend !== 0 && statistics.hasPrevious5Runs && (
                    <span className={`flex items-center gap-1 ${statistics.passRateTrend > 0 ? 'text-green-600' : 'text-red-600'} text-sm font-semibold`}>
                      {statistics.passRateTrend > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                      {Math.abs(statistics.passRateTrend).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {t('common.last5Runs')}: {statistics.last5PassRate.toFixed(1)}%
                  {statistics.hasPrevious5Runs && (
                    <span className="ml-1">
                      (vs previous: {statistics.previous5PassRate.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500 mb-2">{t('dashboardMainContent.averageDuration')}</div>
                <div className="text-3xl font-bold">
                  {(() => {
                    const seconds = Math.floor(statistics.avgDuration / 1000);
                    const minutes = Math.floor(seconds / 60);
                    if (minutes > 0) {
                      return `${minutes}m ${seconds % 60}s`;
                    }
                    return `${seconds}s`;
                  })()}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {t('dashboardMainContent.acrossRuns').replace('{{count}}', String(statistics.totalRuns))}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500 mb-2">{t('dashboardMainContent.totalTests')}</div>
                <div className="text-3xl font-bold">{statistics.totalTests}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {t('dashboardMainContent.testSummary').replace('{{passed}}', String(statistics.totalPassed)).replace('{{failed}}', String(statistics.totalFailed)).replace('{{skipped}}', String(statistics.totalSkipped))}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500 mb-2">{t('dashboardMainContent.failureRate')}</div>
                <div className="text-3xl font-bold text-red-600">{statistics.failureRate.toFixed(1)}%</div>
                <div className="text-xs text-gray-400 mt-1">
                  {statistics.runsWithFailures} {t('common.of')} {statistics.totalRuns} {t('common.runs')} {t('common.hadFailures')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Failures Widget */}
      <ActiveFailuresWidget
        activeFailures={activeFailures}
        loading={activeFailuresLoading}
        onNavigateToFailures={() => navigate('/tests/errors')}
      />

      {/* Test Execution Timeline */}
      <Card
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => navigate('/tests/timeline')}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>📅 Test Execution Timeline</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/tests/timeline');
              }}
              className="text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {t('dashboardMainContent.viewFull')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dashboardData && dashboardData.recentRuns && dashboardData.recentRuns.length > 0 ? (
            <div className="space-y-3">
              {/* Calculate test runs per day for last 7 days */}
              {(() => {
                const now = new Date();
                const days = 7;
                const dayData: Array<{ date: string; count: number; dateObj: Date }> = [];
                
                // Initialize last 7 days
                for (let i = days - 1; i >= 0; i--) {
                  const date = new Date(now);
                  date.setDate(date.getDate() - i);
                  date.setHours(0, 0, 0, 0);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = date.getDate();
                  dayData.push({
                    date: `${dayName} ${dayNum}`,
                    count: 0,
                    dateObj: date,
                  });
                }
                
                // Count runs per day
                dashboardData.recentRuns.forEach((run) => {
                  if (!run.timestamp) return;
                  const runDate = new Date(run.timestamp);
                  runDate.setHours(0, 0, 0, 0);
                  
                  const dayIndex = dayData.findIndex((d) => {
                    return d.dateObj.getTime() === runDate.getTime();
                  });
                  
                  if (dayIndex >= 0) {
                    dayData[dayIndex].count++;
                  }
                });
                
                const maxCount = Math.max(...dayData.map(d => d.count), 1);
                
                return (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600 mb-2">{t('common.last7DaysExecutionFrequency')}</div>
                    <div className="flex items-end gap-1 h-24">
                      {dayData.map((day, index) => {
                        const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex flex-col items-center justify-end" style={{ height: '80px' }}>
                              <div
                                className={`w-full rounded-t transition-all ${
                                  day.count > 0 
                                    ? 'bg-blue-500 hover:bg-blue-600' 
                                    : 'bg-gray-200'
                                }`}
                                style={{ height: `${height}%`, minHeight: day.count > 0 ? '4px' : '0' }}
                                title={`${day.date}: ${day.count} test run${day.count !== 1 ? 's' : ''}`}
                              />
                            </div>
                            <div className="text-xs text-gray-500 text-center" style={{ fontSize: '10px' }}>
                              <div>{day.date.split(' ')[0]}</div>
                              <div className="font-semibold">{day.date.split(' ')[1]}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-2">
                      {dashboardData.recentRuns.length} total runs in last 7 days
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">
              {t('testExecutionTimeline.noData')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flaky Tests Widget */}
      <Card 
        className={flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0 ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}
        onClick={() => {
          if (flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0) {
            navigate('/tests/trends#flake-detection');
          }
        }}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>🎲 Flaky Tests</CardTitle>
            {flakyTestMetrics && flakyTestMetrics.totalFlakyTests > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/tests/trends#flake-detection');
                }}
                className="text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('test.viewDetails')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {flakyTestMetricsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">{t('common.loading')}</span>
            </div>
          ) : flakyTestMetrics ? (
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold text-yellow-600 mb-2">
                  {flakyTestMetrics.totalFlakyTests}
                </div>
                <div className="text-sm text-gray-600">
                  {flakyTestMetrics.totalFlakyTests === 0 
                    ? t('test.noFlakyTestsDetected') 
                    : flakyTestMetrics.totalFlakyTests === 1
                    ? t('test.oneFlakyTestDetected')
                    : t('test.flakyTestsDetected').replace('{{count}}', String(flakyTestMetrics.totalFlakyTests))}
                </div>
              </div>

              {/* Top flaky tests */}
              {flakyTestMetrics.flakyTests && flakyTestMetrics.flakyTests.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-700 mb-2">{t('dashboardMainContent.topFlakyTests')}</div>
                  <div className="space-y-2">
                    {flakyTestMetrics.flakyTests.slice(0, 5).map((test, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex-1 truncate mr-2">
                          <span className="font-medium">{test.test_id || test.suite || t('common.unknown')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">
                            {(test.pass_rate * 100).toFixed(1)}% {t('dashboardMainContent.pass')}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            test.flake_rate > 0.5
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {(test.flake_rate * 100).toFixed(1)}% {t('dashboardMainContent.flake')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {flakyTestMetrics.flakyTests.length > 5 && (
                    <div className="text-xs text-gray-500 mt-2 italic">
                      {t('dashboardMainContent.andMore').replace('{{count}}', String(flakyTestMetrics.flakyTests.length - 5))}
                    </div>
                  )}
                </div>
              )}

              {flakyTestMetrics.totalFlakyTests > 0 && (
                <div className="pt-2 text-xs text-gray-500 italic">
                  {t('dashboardMainContent.clickToViewDetails')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">{t('dashboardMainContent.noFlakyTestsData')}</div>
          )}
        </CardContent>
      </Card>

      {/* Recent Test Runs */}
      <TestRunsList
        dashboardData={dashboardData}
        testApiService={testApiService}
        noDataHelp={noDataHelp || null}
        onLoadMore={onLoadMore}
        testRunsHasMore={testRunsHasMore}
        testRunsLoadingMore={testRunsLoadingMore}
        LOAD_MORE_INCREMENT={25}
        onFilteredDataChange={onFilteredDataChange}
      />

      {/* Failure Pattern Analysis */}
      <FailurePatternAnalysisWidget testApiService={testApiService} autoLoad={true} />

      {/* Error Logs Widget */}
      <ErrorLogsWidget testApiService={testApiService} />

      {/* Advanced Analytics */}
      <AdvancedAnalytics testApiService={testApiService} />

      {/* Quick Links to Trend Analysis */}
      <DashboardQuickLinks />
    </>
  );
}
