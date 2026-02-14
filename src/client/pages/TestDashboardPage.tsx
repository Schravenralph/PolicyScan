import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { Play, CheckCircle2, Activity, Zap, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { useOptimizedPolling } from '../hooks/useOptimizedPolling';
import { useTestStatistics } from '../hooks/useTestStatistics';
import { useRealTimeUpdates } from '../hooks/useRealTimeUpdates';
import { useTestDashboardData } from '../hooks/useTestDashboardData';
import { useActiveFailures } from '../hooks/useActiveFailures';
import { useFlakyTestMetrics } from '../hooks/useFlakyTestMetrics';
import { useErrorLogs } from '../hooks/useErrorLogs';
import { useWorkflowStepsMonitoring } from '../hooks/useWorkflowStepsMonitoring';
import { useTestNotifications } from '../hooks/useTestNotifications';
import { useTestLogs } from '../hooks/useTestLogs';
import { useLogFiles } from '../hooks/useLogFiles';
import { useTestExecution } from '../hooks/useTestExecution';
import { useTestDashboardCallbacks } from '../hooks/useTestDashboardCallbacks';
import { useCommandExecution } from '../hooks/useCommandExecution';
import { TestExecutionSection } from '../components/test/TestExecutionSection';
import { DashboardMainContent } from '../components/test/DashboardMainContent';
import { TestDashboardLoadingError } from '../components/test/TestDashboardLoadingError';
import { WorkflowStepsCommands } from '../components/test/WorkflowStepsCommands';
import { DashboardWidgets } from '../components/test/DashboardWidgets';
import { TestExecutionTrigger } from '../components/test/TestExecutionTrigger';
import { CommandOutputPane } from '../components/test/CommandOutputPane';
import { ExecutionHistory } from '../components/test/ExecutionHistory';
import { TestDashboardHeader } from '../components/test/TestDashboardHeader';
import { CommandQueue } from '../components/test/CommandQueue';
import { t } from '../utils/i18n';

interface TestDashboardPageProps {
  testApiService?: TestApiService; // Optional dependency injection for testing
}

export function TestDashboardPage({ testApiService: injectedTestApiService }: TestDashboardPageProps = {}) {
  // Use dependency injection if provided, otherwise create instance
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const {
    dashboardData,
    testStatus,
    setTestStatus,
    loading,
    error: dashboardError,
    noDataHelp,
    testRunsHasMore,
    testRunsLoadingMore,
    loadDashboardData,
    loadTestStatus,
    loadMoreTestRuns
  } = useTestDashboardData(testApi);

  const [error, setError] = useState<string | null>(null);

  const {
    activeFailures,
    activeFailuresLoading,
    loadActiveFailures
  } = useActiveFailures(testApi);

  const {
    loadErrorLogs
  } = useErrorLogs(testApi);
  
  // Real-time updates preference (stored in localStorage)
  const { enabled: realTimeUpdatesEnabled, toggle: toggleRealTimeUpdates } = useRealTimeUpdates();
  
  const {
    flakyTestMetrics,
    flakyTestMetricsLoading,
    loadFlakyTestMetrics
  } = useFlakyTestMetrics(testApi);
  
  const {
    workflowStepsStatus,
    workflowStepsStatusLoading,
    loadWorkflowStepsStatus
  } = useWorkflowStepsMonitoring(testApi);

  // New Hooks
  const {
    notificationPermission,
    notificationsEnabled,
    toggleNotifications,
    showTestCompletionNotification,
    showCommandCompletionNotification
  } = useTestNotifications();

  const {
    logs,
    autoScroll,
    setAutoScroll,
    logsContainerRef,
    startLogPolling,
    stopLogPolling,
    clearLogs
  } = useTestLogs(testApi, testStatus?.running || false);

  const {
    logFiles,
    selectedLogFile,
    setSelectedLogFile,
    logFilesLoading,
    logDirectory,
    loadLogFiles
  } = useLogFiles(testApi);

  const {
    outputPaneOpen,
    setOutputPaneOpen,
    outputPaneCommand,
    outputPaneOutput,
    setOutputPaneOutput,
    outputPaneStatus,
    handleExecuteCommand,
    queue,
    cancelQueuedCommand,
    clearQueue
  } = useCommandExecution(testApi, showCommandCompletionNotification);
  
  // Optimized polling for dashboard data updates
  const dashboardPolling = useOptimizedPolling({
    pollFn: async () => {
      if (realTimeUpdatesEnabled && !testStatus?.running) {
        await loadDashboardData();
        await loadActiveFailures();
        await loadFlakyTestMetrics();
        await loadErrorLogs();
      }
    },
    baseInterval: 5000,
    activeInterval: 2000,
    idleInterval: 10000,
    enabled: realTimeUpdatesEnabled && !testStatus?.running,
    startActive: false,
    onActivityDetected: () => {
      loadDashboardData();
      loadActiveFailures();
      loadFlakyTestMetrics();
      loadErrorLogs();
    },
  });

  // State to store filtered test runs data from TestRunsList (for export functions)
  const [testRunsFilteredData, setTestRunsFilteredData] = useState<{
    filter: { status?: string; dateRange?: string; testFile?: string; testType?: string };
    filteredTestRuns: Array<any>;
    displayedTestRuns: Array<any>;
  } | null>(null);

  // Get callbacks and export functions from custom hook
  const {
    executionCallbacks,
    exportDashboardDataJSON,
    exportTestRunsJSON,
    exportTestRunsCSV,
  } = useTestDashboardCallbacks({
    showTestCompletionNotification,
    loadLogFiles,
    loadDashboardData,
    loadActiveFailures,
    loadFlakyTestMetrics,
    loadErrorLogs,
    dashboardPolling,
    setError,
    clearLogs,
    startLogPolling,
    stopLogPolling,
    dashboardData,
    testRunsFilteredData,
    activeFailures,
    flakyTestMetrics,
  });

  const {
    handleRunAllTests,
    handleStopTests,
    startStatusPolling,
    stopStatusPolling
  } = useTestExecution(testApi, testStatus, setTestStatus, loadTestStatus, executionCallbacks);

  // Calculate statistics from recent runs
  const statistics = useTestStatistics(dashboardData);
  
  // Toggle real-time updates with immediate refresh when enabling
  const handleToggleRealTimeUpdates = useCallback(() => {
    const wasEnabled = realTimeUpdatesEnabled;
    toggleRealTimeUpdates();
    
    // Trigger immediate refresh when enabling
    if (!wasEnabled) {
      loadDashboardData();
      loadActiveFailures();
      loadFlakyTestMetrics();
      loadErrorLogs();
      dashboardPolling.markActivity();
    }
  }, [realTimeUpdatesEnabled, toggleRealTimeUpdates, loadDashboardData, loadActiveFailures, loadFlakyTestMetrics, loadErrorLogs, dashboardPolling]);
  

  // Auto-update failure patterns when time window changes (debounced)

  // Use refs to store latest function references and track initialization
  const hasInitializedRef = useRef(false);
  const loadFunctionsRef = useRef({
    loadDashboardData,
    loadActiveFailures,
    loadFlakyTestMetrics,
    loadErrorLogs,
    loadTestStatus,
    startStatusPolling,
    stopStatusPolling,
    startLogPolling,
    stopLogPolling,
    dashboardPolling
  });

  // Update refs when functions change
  useEffect(() => {
    loadFunctionsRef.current = {
      loadDashboardData,
      loadActiveFailures,
      loadFlakyTestMetrics,
      loadErrorLogs,
      loadTestStatus,
      startStatusPolling,
      stopStatusPolling,
      startLogPolling,
      stopLogPolling,
      dashboardPolling
    };
  }, [loadDashboardData, loadActiveFailures, loadFlakyTestMetrics, loadErrorLogs, loadTestStatus, startStatusPolling, stopStatusPolling, startLogPolling, stopLogPolling, dashboardPolling]);

  // Initial load and check for running tests
  useEffect(() => {
    // Only run initial load once
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const funcs = loadFunctionsRef.current;
    funcs.loadDashboardData(true); // Reset pagination on initial load
    funcs.loadActiveFailures();
    funcs.loadFlakyTestMetrics();
    funcs.loadErrorLogs();
    
    // Check API first for current status, then check localStorage as fallback
    funcs.loadTestStatus().then(status => {
      if (status?.running) {
        // Store in localStorage with all relevant data
        localStorage.setItem('testExecutionStatus', JSON.stringify({
          running: true,
          startTime: status.startTime || new Date().toISOString(),
          lastRunId: status.lastRunId,
        }));
        // Resume polling automatically
        funcs.startStatusPolling();
        funcs.startLogPolling(() => funcs.dashboardPolling.markActivity());
      } else {
        // Check localStorage as fallback (in case API check failed but tests are still running)
        const storedTestStatus = localStorage.getItem('testExecutionStatus');
        if (storedTestStatus) {
          try {
            const parsed = JSON.parse(storedTestStatus);
            if (parsed.running && parsed.startTime) {
              // Check if test might still be running (within last 4 hours - tests can be long)
              const startTime = new Date(parsed.startTime).getTime();
              const now = Date.now();
              const fourHours = 4 * 60 * 60 * 1000;
              if (now - startTime < fourHours) {
                // Resume polling - API will confirm if tests are actually running
                funcs.startStatusPolling();
                funcs.startLogPolling(() => funcs.dashboardPolling.markActivity());
              } else {
                // Clean up stale state (older than 4 hours)
                localStorage.removeItem('testExecutionStatus');
              }
            }
          } catch (e) {
            console.error('Error parsing stored test status:', e);
            localStorage.removeItem('testExecutionStatus');
          }
        } else {
          // No stored state and API says not running - clear any stale state
          localStorage.removeItem('testExecutionStatus');
        }
      }
    }).catch(err => {
      // If API check fails, fall back to localStorage
      console.error('Error checking test status on mount:', err);
      const storedTestStatus = localStorage.getItem('testExecutionStatus');
      if (storedTestStatus) {
        try {
          const parsed = JSON.parse(storedTestStatus);
          if (parsed.running && parsed.startTime) {
            // Check if test might still be running (within last 4 hours)
            const startTime = new Date(parsed.startTime).getTime();
            const now = Date.now();
            const fourHours = 4 * 60 * 60 * 1000;
            if (now - startTime < fourHours) {
              // Resume polling - will verify with API
              funcs.startStatusPolling();
              funcs.startLogPolling(() => funcs.dashboardPolling.markActivity());
            } else {
              // Clean up stale state
              localStorage.removeItem('testExecutionStatus');
            }
          }
        } catch (e) {
          console.error('Error parsing stored test status:', e);
          localStorage.removeItem('testExecutionStatus');
        }
      }
    });

    return () => {
      const funcs = loadFunctionsRef.current;
      funcs.stopStatusPolling();
      funcs.stopLogPolling();
    };
     
  }, []); // Only run on mount - using ref to prevent re-runs

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input, textarea, or contenteditable element
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target.closest('input') || target.closest('textarea'))
      ) {
        return;
      }

      // Check for Ctrl/Cmd modifier
      const isModifierPressed = event.ctrlKey || event.metaKey;

      // Handle shortcuts
      // Note: Keyboard shortcuts for export menu and shortcuts dialog are now handled by TestDashboardHeader component
      if (event.key === 'r' || event.key === 'R') {
        if (isModifierPressed) {
          // Ctrl+R or Cmd+R - Refresh
          event.preventDefault();
          loadDashboardData();
          loadActiveFailures();
          loadErrorLogs();
          dashboardPolling.markActivity();
        } else if (!isModifierPressed) {
          // R key alone - Refresh (only if not in input)
          event.preventDefault();
          loadDashboardData();
          loadActiveFailures();
          loadErrorLogs();
          dashboardPolling.markActivity();
        }
      } else if ((event.key === 't' || event.key === 'T') && !testStatus?.running) {
        // T key - Run tests (only if not running)
        event.preventDefault();
        handleRunAllTests();
      } else if (event.key === 'Escape') {
        // Close any open dialogs (handled by individual components)
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadDashboardData, loadActiveFailures, loadErrorLogs, dashboardPolling, testStatus?.running, handleRunAllTests]);



  // Handle loading and error states
  const loadingErrorComponent = (
    <TestDashboardLoadingError
      loading={loading}
      hasData={!!dashboardData}
      dashboardError={dashboardError}
      error={error}
    />
  );

  // If loading, show loading component
  if (loading && !dashboardData) {
    return loadingErrorComponent;
  }

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />
      
      {/* Dashboard Widgets */}
      <DashboardWidgets testApiService={testApi} />
      
      {/* Test Execution Trigger */}
      {!testStatus?.running && (
        <TestExecutionTrigger
          testApiService={testApi}
          onRunStarted={(runId) => {
            console.log('Test run started:', runId);
            // Refresh status to show running state
            loadTestStatus();
          }}
        />
      )}
      
      {/* Header */}
      <TestDashboardHeader
        dashboardData={dashboardData}
        displayedTestRuns={testRunsFilteredData?.displayedTestRuns || dashboardData?.recentRuns || null}
        realTimeUpdatesEnabled={realTimeUpdatesEnabled}
        notificationsEnabled={notificationsEnabled}
        notificationPermission={notificationPermission}
        onToggleRealTimeUpdates={handleToggleRealTimeUpdates}
        onRefresh={() => {
          loadDashboardData();
          loadActiveFailures();
          loadErrorLogs();
          dashboardPolling.markActivity();
        }}
        onToggleNotifications={toggleNotifications}
        onExportDashboardDataJSON={exportDashboardDataJSON}
        onExportTestRunsJSON={exportTestRunsJSON}
        onExportTestRunsCSV={exportTestRunsCSV}
      />

      {/* No Data Help (Info) */}
      {noDataHelp && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 px-6 py-5 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📊</div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">{t('testDashboard.noDataTitle')}</h3>
              <p className="text-sm text-blue-800 mb-3">
                {t('testDashboard.noDataDescription')}
              </p>
              <div className="bg-white border border-blue-200 rounded-md p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">{t('testDashboard.noDataInstructions')}</p>
                <pre className="whitespace-pre-wrap font-mono text-xs text-blue-800 bg-blue-50 p-3 rounded border border-blue-200">
{noDataHelp}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {loadingErrorComponent}

      {/* Test Execution Section */}
      <TestExecutionSection
        testStatus={testStatus}
        testApiService={testApi}
        onRunTests={handleRunAllTests}
        onStopTests={handleStopTests}
        logFiles={logFiles}
        selectedLogFile={selectedLogFile}
        onSelectLogFile={setSelectedLogFile}
        logDirectory={logDirectory || undefined}
        logFilesLoading={logFilesLoading}
        onLoadLogFiles={loadLogFiles}
        logs={logs}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
        onClearLogs={clearLogs}
        logsContainerRef={logsContainerRef}
        workflowStepsStatus={workflowStepsStatus}
        workflowStepsStatusLoading={workflowStepsStatusLoading}
        onLoadWorkflowStepsStatus={loadWorkflowStepsStatus}
      />

      {/* Workflow Steps Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            {t('testDashboard.quickActions')}
          </CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            {t('testDashboard.quickActionsDescription')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="flex flex-col items-center justify-center p-4 h-auto hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => { void handleExecuteCommand('pnpm run test:workflow-steps:health', 'health'); }}
              title={t('testDashboard.healthCheckTitle')}
            >
              <CheckCircle2 className="w-5 h-5 mb-2 text-green-600" />
              <span className="text-sm font-semibold">{t('testDashboard.healthCheck')}</span>
              <code className="text-xs text-gray-600 mt-1">test:workflow-steps:health</code>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center justify-center p-4 h-auto hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => { void handleExecuteCommand('pnpm run test:workflow-steps', 'run'); }}
              title={t('testDashboard.runAllTestsTitle')}
            >
              <Play className="w-5 h-5 mb-2 text-blue-600" />
              <span className="text-sm font-semibold">{t('testDashboard.runAllTests')}</span>
              <code className="text-xs text-gray-600 mt-1">test:workflow-steps</code>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center justify-center p-4 h-auto hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => { void handleExecuteCommand('pnpm run test:workflow-steps:collect-bugs', 'collect-bugs'); }}
              title={t('testDashboard.collectBugsTitle')}
            >
              <Activity className="w-5 h-5 mb-2 text-orange-600" />
              <span className="text-sm font-semibold">{t('testDashboard.collectBugs')}</span>
              <code className="text-xs text-gray-600 mt-1">test:workflow-steps:collect-bugs</code>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center justify-center p-4 h-auto hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => { void handleExecuteCommand('pnpm run test:workflow-steps:report', 'generate-report'); }}
              title={t('testDashboard.generateReportTitle')}
            >
              <FileText className="w-5 h-5 mb-2 text-purple-600" />
              <span className="text-sm font-semibold">{t('testDashboard.generateReport')}</span>
              <code className="text-xs text-gray-600 mt-1">test:workflow-steps:report</code>
            </Button>
          </div>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>{t('testDashboard.note')}:</strong> {t('testDashboard.quickActionsNote')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Command Queue */}
      <CommandQueue
        queue={queue}
        onCancel={cancelQueuedCommand}
        onClear={clearQueue}
      />

      {/* Execution History */}
      <ExecutionHistory 
        testApi={testApi} 
        onRunCommand={handleExecuteCommand}
        limit={10}
      />

      {/* Workflow Steps Commands Reference */}
      <WorkflowStepsCommands onRunCommand={handleExecuteCommand} />

      {/* Dashboard Main Content */}
      <DashboardMainContent
        dashboardData={dashboardData}
        testApiService={testApi}
        noDataHelp={noDataHelp || undefined}
        onLoadMore={loadMoreTestRuns}
        testRunsHasMore={testRunsHasMore}
        testRunsLoadingMore={testRunsLoadingMore}
        onFilteredDataChange={setTestRunsFilteredData}
        flakyTestMetrics={flakyTestMetrics}
        flakyTestMetricsLoading={flakyTestMetricsLoading}
        statistics={statistics}
        activeFailures={activeFailures}
        activeFailuresLoading={activeFailuresLoading}
      />

      {/* Command Output Pane */}
      <CommandOutputPane
        isOpen={outputPaneOpen}
        onClose={() => setOutputPaneOpen(false)}
        command={outputPaneCommand}
        output={outputPaneOutput}
        status={outputPaneStatus}
        onClear={() => setOutputPaneOutput([])}
      />
    </div>
  );
}
