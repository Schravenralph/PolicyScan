import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { QualityMetricsCard } from './QualityMetricsCard';
import { FeedbackStatsCard } from './FeedbackStatsCard';
import { LearningControls } from './LearningControls';
import { QualityTrendsChart } from './QualityTrendsChart';
import { LearningSchedulerStatus } from './LearningSchedulerStatus';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';

interface QualityMetrics {
  documentQuality: Array<{
    documentId: string;
    clicks: number;
    accepts: number;
    rejects: number;
    rating: number;
    qualityScore: number;
  }>;
  sourceQuality: Array<{
    sourceUrl: string;
    documentCount: number;
    averageRating: number;
    acceptanceRate: number;
    clickThroughRate: number;
    qualityScore: number;
  }>;
  termImportance: Array<{
    term: string;
    frequency: number;
    averageRating: number;
    associatedAcceptRate: number;
    importanceScore: number;
  }>;
  overallCTR: number;
  overallAcceptanceRate: number;
}

interface LearningCycleResult {
  rankingBoosts: Array<{
    documentId: string;
    boost: number;
    reason: string;
  }>;
  dictionaryUpdates: Array<{
    term: string;
    synonyms: string[];
    confidence: number;
  }>;
  sourceUpdates: Array<{
    sourceUrl: string;
    qualityScore: number;
    deprecated: boolean;
  }>;
  metrics: QualityMetrics;
}

interface CycleStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'disabled';
  enabled?: boolean;
  message?: string;
  currentCycle?: {
    operationId: string;
    startTime: string;
    step?: string;
  };
  lastCycle?: {
    operationId: string;
    status: 'completed' | 'failed';
    completedAt: string;
    error?: string;
  };
}

export function LearningDashboard() {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [minInteractions, setMinInteractions] = useState(5);
  const [minDocuments, setMinDocuments] = useState(3);
  const [lastLearningCycle, setLastLearningCycle] = useState<LearningCycleResult | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleStatus, setCycleStatus] = useState<CycleStatus | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [history, setHistory] = useState<Array<{
    operationId: string;
    status: 'completed' | 'failed';
    startTime: string;
    endTime: string;
    duration: number;
    result?: {
      rankingBoostsCount: number;
      dictionaryUpdatesCount: number;
      sourceUpdatesCount: number;
      sourcesDeprecated: number;
      termsAdded: number;
      synonymsAdded: number;
      overallCTR: number;
      overallAcceptanceRate: number;
    };
    error?: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<{
    enabled: boolean;
    tasks: Array<{
      id: string;
      name: string;
      enabled: boolean;
      lastRun?: string;
      nextRun?: string;
      status: 'idle' | 'running' | 'failed';
      runningSince?: string;
      lastError?: string;
    }>;
  } | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerRecovering, setSchedulerRecovering] = useState(false);
  const [triggeringTask, setTriggeringTask] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getQualityMetrics(minInteractions, minDocuments);
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
      logError(err, 'load-learning-metrics');
    } finally {
      setLoading(false);
    }
  }, [minInteractions, minDocuments]);

  const loadCycleStatus = useCallback(async () => {
    try {
      const status = await api.getLearningCycleStatus();
      setCycleStatus(status);
      
      // Update running state based on status
      if (status.status === 'running') {
        setRunningCycle(true);
      } else if (status.status === 'idle' || status.status === 'completed' || status.status === 'failed') {
        setRunningCycle(false);
      }
    } catch (err) {
      logError(err, 'load-cycle-status');
    }
  }, []);

  const handleRunLearningCycle = async () => {
    try {
      setRunningCycle(true);
      setError(null);
      const result = await api.runLearningCycle();
      setLastLearningCycle(result.result);
      // Reload metrics after learning cycle
      await loadMetrics();
      // Refresh status
      await loadCycleStatus();
    } catch (err) {
      // Handle 409 Conflict (cycle already running)
      const apiError = err as {
        statusCode?: number;
        response?: {
          status?: number;
          data?: {
            message?: string;
            currentCycle?: {
              operationId: string;
              startTime: string;
            };
          };
        };
        message?: string;
      };
      
      if (apiError?.statusCode === 409 || apiError?.response?.status === 409) {
        const errorData = apiError.response?.data;
        const errorMessage = errorData?.message || 'A learning cycle is already running. Please wait for it to complete.';
        setError(errorMessage);
        // Refresh status to show current cycle
        await loadCycleStatus();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to run learning cycle');
      }
      logError(err, 'run-learning-cycle');
    } finally {
      setRunningCycle(false);
    }
  };

  const handleRecoverCycle = async () => {
    try {
      setRecovering(true);
      setError(null);
      const result = await api.recoverLearningCycle(10);
      if (result.recovered > 0) {
        setError(null);
        // Refresh status after recovery
        await loadCycleStatus();
        // Show success message
        alert(`Successfully recovered ${result.recovered} stuck learning cycle(s)`);
      } else {
        setError('No stuck cycles found to recover');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recover learning cycle');
      logError(err, 'recover-learning-cycle');
    } finally {
      setRecovering(false);
    }
  };

  const handleCancelCycle = async () => {
    if (!cycleStatus?.currentCycle) return;
    
    if (!confirm('Are you sure you want to cancel the running learning cycle? This action cannot be undone.')) {
      return;
    }

    try {
      setCancelling(true);
      setError(null);
      await api.cancelLearningCycle(cycleStatus.currentCycle.operationId);
      // Refresh status after cancellation
      await loadCycleStatus();
      // Reload metrics
      await loadMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel learning cycle');
      logError(err, 'cancel-learning-cycle');
    } finally {
      setCancelling(false);
    }
  };

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await api.getLearningCycleHistory(10, 0);
      setHistory(data.cycles);
    } catch (err) {
      logError(err, 'load-learning-cycle-history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadSchedulerStatus = useCallback(async () => {
    try {
      setSchedulerLoading(true);
      const status = await api.getLearningSchedulerStatus();
      setSchedulerStatus(status);
    } catch (err) {
      logError(err, 'load-scheduler-status');
    } finally {
      setSchedulerLoading(false);
    }
  }, []);

  const handleRecoverScheduler = async () => {
    try {
      setSchedulerRecovering(true);
      setError(null);
      const result = await api.recoverLearningScheduler(30);
      if (result.recovered > 0) {
        alert(`Successfully recovered ${result.recovered} stuck scheduled task(s)`);
      } else {
        setError('No stuck tasks found to recover');
      }
      await loadSchedulerStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recover scheduled tasks');
      logError(err, 'recover-scheduler');
    } finally {
      setSchedulerRecovering(false);
    }
  };

  const handleTriggerTask = async (taskId: string) => {
    try {
      setTriggeringTask(taskId);
      setError(null);
      await api.triggerScheduledTask(taskId as 'rankings' | 'dictionaries' | 'sources' | 'monthly-review');
      // Refresh status after triggering
      await loadSchedulerStatus();
      // Start polling for status updates
      setTimeout(() => loadSchedulerStatus(), 2000);
    } catch (err) {
      const apiError = err as {
        statusCode?: number;
        response?: {
          status?: number;
          data?: {
            message?: string;
          };
        };
        message?: string;
      };
      
      if (apiError?.statusCode === 409 || apiError?.response?.status === 409) {
        const errorData = apiError.response?.data;
        setError(errorData?.message || 'Task is already running');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to trigger task');
      }
      logError(err, 'trigger-scheduled-task');
    } finally {
      setTriggeringTask(null);
    }
  };

  useEffect(() => {
    loadMetrics();
    loadCycleStatus();
    loadHistory();
    loadSchedulerStatus();
  }, [loadMetrics, loadCycleStatus, loadHistory, loadSchedulerStatus]);

  // Poll for scheduler status when tasks are running
  useEffect(() => {
    const hasRunningTasks = schedulerStatus?.tasks.some(t => t.status === 'running');
    if (!hasRunningTasks) return;

    const interval = setInterval(() => {
      loadSchedulerStatus();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [schedulerStatus, loadSchedulerStatus]);

  // Poll for status when cycle is running
  useEffect(() => {
    if (!runningCycle) return;

    const interval = setInterval(() => {
      loadCycleStatus();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [runningCycle, loadCycleStatus]);

  if (loading && !metrics) {
    return (
      <div className="p-6">
        <div className="text-center py-8 text-gray-500">{t('common.loadingMetrics')}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Learning & Quality Dashboard</h2>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">{t('admin.minInteractions')}</label>
            <input
              type="number"
              value={minInteractions}
              onChange={(e) => setMinInteractions(parseInt(e.target.value) || 5)}
              className="border rounded px-2 py-1 w-20 text-sm"
              min="1"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Min Documents:</label>
            <input
              type="number"
              value={minDocuments}
              onChange={(e) => setMinDocuments(parseInt(e.target.value) || 3)}
              className="border rounded px-2 py-1 w-20 text-sm"
              min="1"
            />
          </div>
          <button
            onClick={loadMetrics}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900 ml-4"
            aria-label={t('common.dismissError')}
          >
            ×
          </button>
        </div>
      )}

      {cycleStatus?.status === 'disabled' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
          <strong>{t('admin.learningServiceDisabled')}</strong> {t('admin.enableLearningService')}
        </div>
      )}

      {cycleStatus?.status === 'running' && cycleStatus.currentCycle && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded flex justify-between items-center">
          <div>
            <strong>Learning cycle is running...</strong>
            <div className="text-sm mt-1">
              {cycleStatus.currentCycle.step && (
                <div className="font-medium mb-1">
                  Current step: {cycleStatus.currentCycle.step}
                </div>
              )}
              Started: {new Date(cycleStatus.currentCycle.startTime).toLocaleString()}
              {(() => {
                const startTime = new Date(cycleStatus.currentCycle!.startTime).getTime();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                return ` (${minutes}m ${seconds}s ago)`;
              })()}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancelCycle}
              disabled={cancelling}
              className="px-3 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 text-sm disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Cycle'}
            </button>
            <button
              onClick={handleRecoverCycle}
              disabled={recovering}
              className="px-3 py-1 bg-yellow-600 dark:bg-yellow-700 text-white rounded hover:bg-yellow-700 dark:hover:bg-yellow-800 text-sm disabled:opacity-50"
            >
              {recovering ? 'Recovering...' : 'Recover if Stuck'}
            </button>
          </div>
        </div>
      )}

      {metrics && (
        <>
          <QualityMetricsCard metrics={metrics} />
          <FeedbackStatsCard metrics={metrics} />
          <QualityTrendsChart dateRange={dateRange} onDateRangeChange={setDateRange} />
          <LearningControls
            onRunCycle={handleRunLearningCycle}
            running={runningCycle}
            lastResult={lastLearningCycle}
            cycleStatus={cycleStatus}
            history={history}
            historyLoading={historyLoading}
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory(!showHistory)}
            onRefreshHistory={loadHistory}
          />
          <LearningSchedulerStatus
            status={schedulerStatus}
            loading={schedulerLoading}
            onRecover={handleRecoverScheduler}
            recovering={schedulerRecovering}
            onTriggerTask={handleTriggerTask}
            triggeringTask={triggeringTask}
          />
        </>
      )}
    </div>
  );
}

