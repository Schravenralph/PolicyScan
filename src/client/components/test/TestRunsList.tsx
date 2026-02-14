/**
 * Test Runs List Component
 * 
 * Displays a list of test runs with filtering, pagination, and pipeline expansion capabilities.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, CheckCircle2, XCircle, SkipForward, Workflow, Layers, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { DashboardData } from '../../services/api/TestApiService';
import type { TestApiService } from '../../services/api/TestApiService';
import { useTestRunsFiltering } from '../../hooks/useTestRunsFiltering';
import { usePipelineVisualization } from '../../hooks/usePipelineVisualization';
import { t } from '../../utils/i18n';

interface TestRunsListProps {
  dashboardData: DashboardData | null;
  testApiService: TestApiService;
  noDataHelp: string | null;
  onLoadMore?: () => Promise<void>;
  testRunsHasMore?: boolean;
  testRunsLoadingMore?: boolean;
  LOAD_MORE_INCREMENT?: number;
  onFilteredDataChange?: (data: {
    filter: ReturnType<typeof useTestRunsFiltering>['filter'];
    filteredTestRuns: ReturnType<typeof useTestRunsFiltering>['filteredTestRuns'];
    displayedTestRuns: ReturnType<typeof useTestRunsFiltering>['displayedTestRuns'];
  }) => void;
}

export function TestRunsList({
  dashboardData,
  testApiService,
  noDataHelp,
  onLoadMore,
  testRunsHasMore = false,
  testRunsLoadingMore = false,
  LOAD_MORE_INCREMENT = 25,
  onFilteredDataChange,
}: TestRunsListProps) {
  // Pipeline visualization state
  const {
    expandedPipelines,
    pipelineDetails,
    togglePipelineExpansion
  } = usePipelineVisualization(testApiService);

  // Test runs filtering and pagination
  const {
    filter: testRunsFilter,
    setFilter: setTestRunsFilter,
    filteredTestRuns,
    hasActiveFilters,
    clearFilters: clearTestRunsFilters,
    displayedTestRuns,
    displayLimit: testRunsDisplayLimit,
    setDisplayLimit: setTestRunsDisplayLimit,
    hasMore: hasMoreTestRuns,
  } = useTestRunsFiltering(dashboardData);

  // Notify parent component of filtered data changes for export functions
  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange({
        filter: testRunsFilter,
        filteredTestRuns,
        displayedTestRuns,
      });
    }
  }, [onFilteredDataChange, testRunsFilter, filteredTestRuns, displayedTestRuns]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>📋 Recent Test Runs</CardTitle>
          {hasActiveFilters && (
            <Button
              onClick={clearTestRunsFilters}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              {t('testRunsList.clearFilters')}
            </Button>
          )}
        </div>
        {/* Filter Controls */}
        <div className="mt-4 flex gap-4 flex-wrap items-end">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t('testRunsList.status')}</label>
            <select
              value={testRunsFilter.status || 'all'}
              onChange={(e) => {
                setTestRunsFilter(prev => ({ ...prev, status: e.target.value as 'all' | 'passed' | 'failed' | 'skipped' }));
              }}
              className="text-sm border border-gray-300 rounded px-3 py-1 bg-white"
            >
              <option value="all">{t('testRuns.all')}</option>
              <option value="passed">{t('testRuns.passed')}</option>
              <option value="failed">{t('testRuns.failed')}</option>
              <option value="skipped">{t('testRuns.skipped')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Date Range</label>
            <select
              value={testRunsFilter.dateRange || 'all'}
              onChange={(e) => {
                setTestRunsFilter(prev => ({ ...prev, dateRange: e.target.value as '24h' | '7d' | '30d' | 'all' }));
              }}
              className="text-sm border border-gray-300 rounded px-3 py-1 bg-white"
            >
              <option value="all">{t('testRuns.allTime')}</option>
              <option value="24h">{t('testRuns.last24Hours')}</option>
              <option value="7d">{t('testRuns.last7Days')}</option>
              <option value="30d">{t('testRuns.last30Days')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Test Type</label>
            <select
              value={testRunsFilter.testType || 'all'}
              onChange={(e) => {
                setTestRunsFilter(prev => ({ ...prev, testType: e.target.value as 'all' | 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other' }));
              }}
              className="text-sm border border-gray-300 rounded px-3 py-1 bg-white"
            >
              <option value="all">{t('testRuns.allTypes')}</option>
              <option value="unit">{t('testRuns.unit')}</option>
              <option value="integration">{t('testRuns.integration')}</option>
              <option value="e2e">{t('testRuns.e2e')}</option>
              <option value="visual">{t('testRuns.visual')}</option>
              <option value="performance">{t('testRuns.performance')}</option>
              <option value="workflow-steps">{t('testRuns.workflowSteps')}</option>
              <option value="other">{t('testRuns.other')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t('testRunsList.testFile')}</label>
            <input
              type="text"
              placeholder={t('testRuns.filterByTestFile')}
              value={testRunsFilter.testFile || ''}
              onChange={(e) => {
                setTestRunsFilter(prev => ({ ...prev, testFile: e.target.value }));
              }}
              className="text-sm border border-gray-300 rounded px-3 py-1 w-48"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!dashboardData || dashboardData.recentRuns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {noDataHelp ? (
              <div>
                <div className="text-4xl mb-3">📊</div>
                <p className="text-lg font-medium mb-2">{t('testRunsList.noDataAvailable')}</p>
                <p className="text-sm">{t('testRunsList.runTestsFirst')}</p>
                <p className="text-xs text-gray-400 mt-4">{t('testRunsList.seeInstructions')}</p>
              </div>
            ) : (
              <p>{t('testRunsList.noDataAvailable')}. {t('testRunsList.runTestsFirst')}</p>
            )}
          </div>
        ) : filteredTestRuns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{t('test.noTestRunsMatchFilters')}</p>
            {hasActiveFilters && (
              <Button
                onClick={clearTestRunsFilters}
                variant="outline"
                size="sm"
                className="mt-4"
              >
                {t('testRunsList.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedTestRuns.map((run) => {
              // Detect if this is a pipeline run
              const isPipelineRun = run.id?.includes('workflow-steps-pipeline-') || 
                                   run.testFile?.includes('workflow-steps') ||
                                   run.testType === 'workflow-steps';
              const isStepRun = run.id?.includes('-step-') && run.id?.includes('workflow-steps-pipeline-');
              
              const statusIcon = 
                (run.results?.failed || 0) > 0 ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (run.results?.skipped || 0) > 0 ? (
                  <SkipForward className="w-5 h-5 text-yellow-500" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                );
              
              const statusColor = 
                (run.results?.failed || 0) > 0 ? 'border-red-500' :
                (run.results?.skipped || 0) > 0 ? 'border-yellow-500' :
                'border-green-500';

              // Extract step number from step run ID if applicable
              const stepNumberMatch = isStepRun && run.id ? run.id.match(/-step-(\d+)$/) : null;
              const stepNumber = stepNumberMatch ? stepNumberMatch[1] : null;

              // Get pipeline details if expanded
              const isExpanded = isPipelineRun && run.id && expandedPipelines.has(run.id);
              const details = isPipelineRun && run.id ? pipelineDetails[run.id] : undefined;
              const isLoading = details?.loading;
              const hasError = details?.error;

              return (
                <div
                  key={run.id}
                  className={`border-l-4 ${statusColor} ${isPipelineRun ? 'bg-blue-50 border-l-blue-500' : 'bg-white'} rounded-lg shadow-sm hover:shadow-md transition-all`}
                >
                  <div
                    className={`p-4 ${isPipelineRun ? 'cursor-pointer' : ''}`}
                    onClick={isPipelineRun && run.id ? (e) => {
                      e.preventDefault();
                      if (run.id) togglePipelineExpansion(run.id);
                    } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {statusIcon}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isPipelineRun && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                <Workflow className="w-3 h-3" />
                                Pipeline
                              </span>
                            )}
                            {isStepRun && stepNumber && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                <Layers className="w-3 h-3" />
                                Step {stepNumber}
                              </span>
                            )}
                            <div className="font-semibold">
                              {run.testFile || run.id || t('testRuns.unknown')}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {run.timestamp ? new Date(run.timestamp).toLocaleString() : t('common.notAvailable')}
                            {isPipelineRun && details?.statistics && (
                              <span className="ml-2 text-xs text-blue-600">
                                • {details.statistics.passedScenarios} passed, {details.statistics.failedScenarios} failed
                                {details.steps.length > 0 && (
                                  <span> • {details.steps.length} steps</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        {run.results && (
                          <div className="text-sm">
                            <span className="text-green-600">{run.results.passed || 0} passed</span>
                            {(run.results.failed ?? 0) > 0 && (
                              <span className="text-red-600 ml-2">{run.results.failed ?? 0} failed</span>
                            )}
                            {(run.results.skipped ?? 0) > 0 && (
                              <span className="text-yellow-600 ml-2">{run.results.skipped ?? 0} skipped</span>
                            )}
                          </div>
                        )}
                        {isPipelineRun ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (run.id) togglePipelineExpansion(run.id);
                            }}
                            className="p-1 hover:bg-blue-100 rounded transition-colors"
                            title={isExpanded ? t('testRuns.collapseSteps') : t('testRuns.expandSteps')}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-blue-600" />
                            )}
                          </button>
                        ) : (
                          <Link
                            to={`/tests/runs/${run.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pipeline Step Breakdown */}
                  {isPipelineRun && isExpanded && (
                    <div className="border-t border-blue-200 bg-blue-50/50 px-4 py-3">
                      {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading pipeline steps...
                        </div>
                      )}
                      {hasError && (
                        <div className="text-sm text-red-600">
                          {t('testRuns.failedToLoadPipeline')} {hasError}
                        </div>
                      )}
                      {!isLoading && !hasError && details?.steps && details.steps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-blue-700 mb-2">
                            Pipeline Steps ({details.steps.length} total)
                          </div>
                          {details.steps.map((step, idx) => {
                            const stepStatusIcon = 
                              step.status === 'failed' ? (
                                <XCircle className="w-4 h-4 text-red-500" />
                              ) : step.status === 'skipped' ? (
                                <SkipForward className="w-4 h-4 text-yellow-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              );

                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-sm bg-white rounded p-2 border border-blue-100"
                              >
                                <div className="flex items-center gap-2">
                                  {stepStatusIcon}
                                  <span className="font-medium">
                                    Step {step.stepNumber || '?'}: {step.stepName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span>
                                    {step.scenarios.passed}/{step.scenarios.total} scenarios
                                  </span>
                                  <span>
                                    {((step.duration || 0) / 1000).toFixed(1)}s
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {details.statistics && (
                            <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-gray-600">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="font-medium">Total Scenarios:</span> {details.statistics.totalScenarios}
                                </div>
                                <div>
                                  <span className="font-medium">Pass Rate:</span> {details.statistics.passRate.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {!isLoading && !hasError && (!details?.steps || details.steps.length === 0) && (
                        <div className="text-sm text-gray-500">
                          No step details available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Load More button - for client-side pagination when filters are active */}
            {hasMoreTestRuns && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => setTestRunsDisplayLimit(prev => prev + LOAD_MORE_INCREMENT)}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Load More ({Math.min(LOAD_MORE_INCREMENT, filteredTestRuns.length - testRunsDisplayLimit)} more)
                </Button>
              </div>
            )}
            
            {/* Load More button - for server-side pagination when no filters are active */}
            {!hasActiveFilters && testRunsHasMore && onLoadMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={onLoadMore}
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={testRunsLoadingMore}
                >
                  {testRunsLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${LOAD_MORE_INCREMENT} more)`
                  )}
                </Button>
              </div>
            )}
            
            {/* Show total count when all are displayed */}
            {filteredTestRuns.length > 0 && !hasMoreTestRuns && !testRunsHasMore && (
              <div className="text-center pt-4 text-sm text-gray-500">
                Showing all {filteredTestRuns.length} test run{filteredTestRuns.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
