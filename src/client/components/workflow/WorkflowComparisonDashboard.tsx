import { useState, useMemo, useEffect, useRef } from 'react';
import { WorkflowSelector } from '../benchmark/WorkflowSelector';
import { useWorkflowComparison } from '../../hooks/useWorkflowComparison';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { CalendarIcon, AlertCircle, Play, ChevronUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { useWorkflows } from '../../context/WorkflowContext';
import { NewComparisonForm } from './NewComparisonForm';
import { EditBenchmarkConfigDialog } from './EditBenchmarkConfigDialog';
import { WorkflowComparisonPanes } from './WorkflowComparisonPanes';
import { ComparisonResults, type MetricData, type Winner } from './ComparisonResults';
import { ActiveComparisonsList } from './ActiveComparisonsList';
// Date formatting helper (date-fns not available, using native Date)
const formatDate = (date: Date | undefined): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
import { cn } from '../ui/utils';
import { Input } from '../ui/input';
import { api } from '../../services/api';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { t } from '../../utils/i18n';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

type QuickRange = '7d' | '30d' | '90d' | 'all';

export function WorkflowComparisonDashboard() {
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [quickRange, setQuickRange] = useState<QuickRange>('all');
  const [query, setQuery] = useState<string>('');
  const [showNewComparison, setShowNewComparison] = useState(false);
  
  // New comparison state
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonDescription, setComparisonDescription] = useState('');
  const [comparisonWorkflowA, setComparisonWorkflowA] = useState<string>('');
  const [comparisonWorkflowB, setComparisonWorkflowB] = useState<string>('');
  const [comparisonQueries, setComparisonQueries] = useState<string[]>(['']);
  const [comparisonLabelA, setComparisonLabelA] = useState(t('workflowComparison.workflowA'));
  const [comparisonLabelB, setComparisonLabelB] = useState(t('workflowComparison.workflowB'));
  const [isStartingComparison, setIsStartingComparison] = useState(false);
  
  // Active comparison tracking (support multiple comparisons)
  interface ComparisonStatus {
    _id?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    name?: string;
    description?: string;
    workflowA?: { workflowId: string; label?: string };
    workflowB?: { workflowId: string; label?: string };
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    currentRunIds?: {
      workflowA?: string;
      workflowB?: string;
    };
    results?: {
      workflowA?: { runId?: string; error?: string; [key: string]: unknown };
      workflowB?: { runId?: string; error?: string; [key: string]: unknown };
    };
    [key: string]: unknown;
  }
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [activeComparison, setActiveComparison] = useState<ComparisonStatus | null>(null);
  const [activeComparisons, setActiveComparisons] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [_pollingRetryCount, setPollingRetryCount] = useState(0);
  const [showActiveComparisonsList, setShowActiveComparisonsList] = useState(false);
  const [synchronizedScrolling, setSynchronizedScrolling] = useState(false);
  // Reserved for future scroll synchronization
  const _workflowAPaneRef = useRef<HTMLDivElement>(null);
  const _workflowBPaneRef = useRef<HTMLDivElement>(null);
  void _workflowAPaneRef;
  void _workflowBPaneRef;
  const { workflows: workflowDocuments } = useWorkflows();

  // Load active comparisons on mount and periodically
  useEffect(() => {
    const loadActiveComparisons = async () => {
      try {
        const comparisons = await api.listWorkflowComparisons({
          status: 'running',
          limit: 20,
        });
        const pendingComparisons = await api.listWorkflowComparisons({
          status: 'pending',
          limit: 20,
        });
        
        const allActive = [...comparisons, ...pendingComparisons].map(comp => ({
          id: comp._id,
          name: comp.name || t('workflowComparison.unnamedComparison'),
          status: comp.status,
        }));
        
        setActiveComparisons(allActive);
        
        // Restore selected comparison if it's still active
        const storedComparisonId = localStorage.getItem('activeWorkflowComparisonId');
        if (storedComparisonId && allActive.some(c => c.id === storedComparisonId)) {
          setActiveComparisonId(storedComparisonId);
        } else if (allActive.length > 0 && !activeComparisonId) {
          // Auto-select first active comparison if none selected
          setActiveComparisonId(allActive[0].id);
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error(t('workflowComparison.failedToLoadActiveComparisons')), 'load-active-comparisons');
      }
    };

    loadActiveComparisons();
    // Refresh active comparisons list every 10 seconds
    const intervalId = setInterval(loadActiveComparisons, 10000);

    return () => clearInterval(intervalId);
  }, [activeComparisonId]);

  // Restore active comparison from localStorage on mount
  useEffect(() => {
    const storedComparisonId = localStorage.getItem('activeWorkflowComparisonId');
    if (storedComparisonId) {
      // Verify the comparison is still active before restoring
      api.get<ComparisonStatus>(`/benchmark/compare-workflows/${storedComparisonId}`)
        .then((status) => {
          // Only restore if comparison is still running or pending
          if (status.status === 'running' || status.status === 'pending') {
            setActiveComparisonId(storedComparisonId);
            setActiveComparison(status);
          } else {
            // Comparison completed/failed/cancelled, remove from localStorage
            localStorage.removeItem('activeWorkflowComparisonId');
          }
        })
        .catch(() => {
          // Comparison not found or error, remove from localStorage
          localStorage.removeItem('activeWorkflowComparisonId');
        });
    }
  }, []);

  // Save active comparison ID to localStorage when it changes
  useEffect(() => {
    if (activeComparisonId) {
      localStorage.setItem('activeWorkflowComparisonId', activeComparisonId);
    } else {
      localStorage.removeItem('activeWorkflowComparisonId');
    }
  }, [activeComparisonId]);
  
  // Benchmark configuration state
  const [workflowAConfig, setWorkflowAConfig] = useState<{
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
    timeout?: number;
    maxRetries?: number;
    maxMemoryMB?: number;
    maxConcurrentRequests?: number;
  } | null>(null);
  const [workflowBConfig, setWorkflowBConfig] = useState<{
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
    timeout?: number;
    maxRetries?: number;
    maxMemoryMB?: number;
    maxConcurrentRequests?: number;
  } | null>(null);
  const [configSourceA, setConfigSourceA] = useState<'default' | 'custom' | null>(null);
  const [configSourceB, setConfigSourceB] = useState<'default' | 'custom' | null>(null);
  const [loadingConfigA, setLoadingConfigA] = useState(false);
  const [loadingConfigB, setLoadingConfigB] = useState(false);
  const [savingConfigA, setSavingConfigA] = useState(false);
  const [savingConfigB, setSavingConfigB] = useState(false);
  const [showEditConfigA, setShowEditConfigA] = useState(false);
  const [showEditConfigB, setShowEditConfigB] = useState(false);
  const [editingConfigA, setEditingConfigA] = useState<typeof workflowAConfig>(null);
  const [editingConfigB, setEditingConfigB] = useState<typeof workflowBConfig>(null);
  const [flagsSearchQuery, setFlagsSearchQuery] = useState('');

  // Use React Query hook for feature flags
  const { data: availableFlags = [], isLoading: loadingFlags, error: flagsQueryError, refetch: refetchFlags } = useFeatureFlags({
    filterSource: 'database', // Only show database flags (not environment variables)
  });
  const flagsError = flagsQueryError ? t('featureFlags.loadFailed') : (availableFlags.length === 0 ? `${t('featureFlags.noFlagsAvailable')}. ${t('featureFlags.configureFirst')}` : null);

  const { comparisons, loading, error } = useWorkflowComparison(
    selectedWorkflows,
    query || undefined
  );

  // Poll for active comparison status with retry logic
  useEffect(() => {
    if (!activeComparisonId) {
      setActiveComparison(null);
      setPollingError(null);
      setPollingRetryCount(0);
      return;
    }

    let isMounted = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5; // Stop polling after 5 consecutive errors

    const pollComparison = async (_isRetry = false) => {
      try {
        const status = await api.get<ComparisonStatus>(`/benchmark/compare-workflows/${activeComparisonId}`);
        if (isMounted) {
          setActiveComparison(status);
          setPollingError(null);
          consecutiveErrors = 0;
          setPollingRetryCount(0);
          
          // Stop polling if completed or failed
          if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
            // Clear from localStorage when comparison finishes
            localStorage.removeItem('activeWorkflowComparisonId');
            // Remove from active comparisons list
            setActiveComparisons(prev => prev.filter(c => c.id !== activeComparisonId));
            // Cleanup: Clear active comparison state after a delay to allow user to see results
            setTimeout(() => {
              if (isMounted && activeComparisonId === status._id) {
                setActiveComparison(null);
                setActiveComparisonId(null);
              }
            }, 30000); // Keep results visible for 30 seconds before cleanup
          } else {
            // Update status in active comparisons list
            setActiveComparisons(prev => prev.map(c => 
              c.id === activeComparisonId ? { ...c, status: status.status } : c
            ));
          }
        }
      } catch (err) {
        // Handle specific error cases
        if (err instanceof Error) {
          const errorWithStatusCode = err as Error & { statusCode?: number; code?: string };
          const is404 = 
            errorWithStatusCode.statusCode === 404 ||
            errorWithStatusCode.code === 'NOT_FOUND' ||
            err.message.toLowerCase().includes('not found') ||
            err.message.includes('404');
          
          if (is404) {
            // Comparison not found - stop polling and show appropriate message
            if (isMounted) {
              setPollingError(t('workflowComparison.comparisonNotFound'));
              // Clear from localStorage
              localStorage.removeItem('activeWorkflowComparisonId');
              setActiveComparisons(prev => prev.filter(c => c.id !== activeComparisonId));
              setActiveComparison(null);
              setActiveComparisonId(null);
            }
            return;
          }
          
          // Check if it's a 429 (rate limited)
          const is429 = 
            errorWithStatusCode.statusCode === 429 ||
            errorWithStatusCode.code === 'RATE_LIMIT_EXCEEDED' ||
            err.message.toLowerCase().includes('too many requests') ||
            err.message.includes('429');
          
          if (is429) {
            // Rate limited - back off but don't log as error
            consecutiveErrors++;
            if (isMounted) {
              setPollingError(t('workflowComparison.rateLimited'));
            }
            // Will continue polling with existing interval
            return;
          }
        }
        
        consecutiveErrors++;
        const errorMessage = err instanceof Error ? err.message : t('workflowComparison.failedToFetchStatus');
        logError(err instanceof Error ? err : new Error(errorMessage), 'poll-comparison-status');
        
        if (isMounted) {
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            setPollingError(t('workflowComparison.connectionLost').replace('{{count}}', String(MAX_CONSECUTIVE_ERRORS)));
            // Stop polling on persistent errors
            return;
          } else {
            setPollingError(t('workflowComparison.connectionIssue').replace('{{current}}', String(consecutiveErrors)).replace('{{max}}', String(MAX_CONSECUTIVE_ERRORS)));
          }
        }
      }
    };

    // Poll immediately, then every 3 seconds
    pollComparison();
    const intervalId = setInterval(() => pollComparison(false), 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeComparisonId]);

  // Retry polling manually
  const handleRetryPolling = () => {
    setPollingError(null);
    setPollingRetryCount(prev => prev + 1);
    // Trigger re-poll by updating a dependency or calling directly
    if (activeComparisonId) {
      api.get<ComparisonStatus>(`/benchmark/compare-workflows/${activeComparisonId}`)
        .then((status) => {
          setActiveComparison(status);
          setPollingError(null);
          setPollingRetryCount(0);
        })
        .catch((err) => {
          // Handle specific error cases
          if (err instanceof Error) {
            const errorWithStatusCode = err as Error & { statusCode?: number; code?: string };
            const is404 = 
              errorWithStatusCode.statusCode === 404 ||
              errorWithStatusCode.code === 'NOT_FOUND' ||
              err.message.toLowerCase().includes('not found') ||
              err.message.includes('404');
            
            if (is404) {
              setPollingError(t('workflowComparison.comparisonNotFound'));
              localStorage.removeItem('activeWorkflowComparisonId');
              setActiveComparisons(prev => prev.filter(c => c.id !== activeComparisonId));
              setActiveComparison(null);
              setActiveComparisonId(null);
              return;
            }
          }
          
          const errorMessage = err instanceof Error ? err.message : t('workflowComparison.failedToFetchStatus');
          setPollingError(errorMessage);
          logError(err instanceof Error ? err : new Error(errorMessage), 'retry-poll-comparison-status');
        });
    }
  };

  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    const now = new Date();
    if (range === 'all') {
      setDateRange({ from: undefined, to: undefined });
    } else {
      const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      setDateRange({ from, to: now });
    }
  };

  const comparisonA = useMemo(() => {
    return comparisons?.find((c) => c.workflowId === selectedWorkflows[0]) || null;
  }, [comparisons, selectedWorkflows]);

  const comparisonB = useMemo(() => {
    return comparisons?.find((c) => c.workflowId === selectedWorkflows[1]) || null;
  }, [comparisons, selectedWorkflows]);

  const hasBothWorkflows = selectedWorkflows.length >= 2;
  const canCompare = hasBothWorkflows && !loading && !error && comparisonA && comparisonB;

  const metricsData = useMemo((): MetricData[] => {
    if (!canCompare) return [];

    return [
      {
        metric: t('workflowComparison.averageExecutionTime'),
        unit: 'ms',
        workflowA: comparisonA.metrics.avgExecutionTime,
        workflowB: comparisonB.metrics.avgExecutionTime,
        better: (comparisonA.metrics.avgExecutionTime < comparisonB.metrics.avgExecutionTime ? 'A' : comparisonA.metrics.avgExecutionTime > comparisonB.metrics.avgExecutionTime ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
      {
        metric: t('workflowComparison.averageDocumentsFound'),
        unit: '',
        workflowA: comparisonA.metrics.avgDocumentsFound,
        workflowB: comparisonB.metrics.avgDocumentsFound,
        better: (comparisonA.metrics.avgDocumentsFound > comparisonB.metrics.avgDocumentsFound ? 'A' : comparisonA.metrics.avgDocumentsFound < comparisonB.metrics.avgDocumentsFound ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
      {
        metric: t('workflowComparison.averageScore'),
        unit: '',
        workflowA: comparisonA.metrics.avgScore,
        workflowB: comparisonB.metrics.avgScore,
        better: (comparisonA.metrics.avgScore > comparisonB.metrics.avgScore ? 'A' : comparisonA.metrics.avgScore < comparisonB.metrics.avgScore ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
      {
        metric: t('workflowComparison.minExecutionTime'),
        unit: 'ms',
        workflowA: comparisonA.metrics.minExecutionTime,
        workflowB: comparisonB.metrics.minExecutionTime,
        better: (comparisonA.metrics.minExecutionTime < comparisonB.metrics.minExecutionTime ? 'A' : comparisonA.metrics.minExecutionTime > comparisonB.metrics.minExecutionTime ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
      {
        metric: t('workflowComparison.maxExecutionTime'),
        unit: 'ms',
        workflowA: comparisonA.metrics.maxExecutionTime,
        workflowB: comparisonB.metrics.maxExecutionTime,
        better: (comparisonA.metrics.maxExecutionTime < comparisonB.metrics.maxExecutionTime ? 'A' : comparisonA.metrics.maxExecutionTime > comparisonB.metrics.maxExecutionTime ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
      {
        metric: t('workflowComparison.medianExecutionTime'),
        unit: 'ms',
        workflowA: comparisonA.metrics.medianExecutionTime,
        workflowB: comparisonB.metrics.medianExecutionTime,
        better: (comparisonA.metrics.medianExecutionTime < comparisonB.metrics.medianExecutionTime ? 'A' : comparisonA.metrics.medianExecutionTime > comparisonB.metrics.medianExecutionTime ? 'B' : 'tie') as 'A' | 'B' | 'tie',
      },
    ];
  }, [canCompare, comparisonA, comparisonB]);

  const trendData = useMemo(() => {
    if (!canCompare) return [];

    // Group results by time (simplified - using result index as time proxy)
    const data: Array<{
      index: number;
      workflowA: number;
      workflowB: number;
    }> = [];

    const maxLength = Math.max(comparisonA.results.length, comparisonB.results.length);
    for (let i = 0; i < maxLength; i++) {
      const resultA = comparisonA.results[i];
      const resultB = comparisonB.results[i];
      data.push({
        index: i + 1,
        workflowA: resultA?.metrics.averageScore || 0,
        workflowB: resultB?.metrics.averageScore || 0,
      });
    }

    return data;
  }, [canCompare, comparisonA, comparisonB]);

  const winner = useMemo((): Winner | null => {
    if (!canCompare) return null;

    let scoreA = 0;
    let scoreB = 0;

    metricsData.forEach((m) => {
      if (m.better === 'A') scoreA++;
      else if (m.better === 'B') scoreB++;
    });

    if (scoreA > scoreB) return { workflow: 'A', name: comparisonA.workflowName, score: scoreA };
    if (scoreB > scoreA) return { workflow: 'B', name: comparisonB.workflowName, score: scoreB };
    return { workflow: 'tie', name: t('workflowComparison.tie'), score: scoreA };
  }, [canCompare, metricsData, comparisonA, comparisonB]);

  const handleAddQuery = () => {
    setComparisonQueries((prev) => [...prev, '']);
  };

  const handleRemoveQuery = (index: number) => {
    setComparisonQueries((prev) => {
      if (prev.length <= 1) {
        toast.error(t('workflowComparison.atLeastOneQueryRequired'), t('workflowComparison.atLeastOneQueryRequiredMessage'));
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleQueryChange = (index: number, value: string) => {
    setComparisonQueries((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Feature flags are now loaded via React Query hook (useFeatureFlags)

  // Load benchmark config when workflow is selected
  interface BenchmarkConfig {
    featureFlags?: Record<string, boolean>;
    params?: Record<string, unknown>;
    timeout?: number;
    maxRetries?: number;
    maxMemoryMB?: number;
    maxConcurrentRequests?: number;
    _source?: 'custom' | 'default' | null;
  }
  useEffect(() => {
    const loadConfig = async (
      workflowId: string,
      setConfig: (config: BenchmarkConfig | null) => void,
      setConfigSource: (source: 'default' | 'custom' | null) => void,
      setLoading: (loading: boolean) => void
    ) => {
      if (!workflowId) {
        setConfig(null);
        setConfigSource(null);
        return;
      }
      setLoading(true);
      try {
        const config = await api.workflow.getBenchmarkConfig(workflowId);
        // API returns config with _source metadata indicating if it's default or custom
        // Backend now provides defaults for predefined workflows
        
        // Extract source from response (may be non-enumerable, so check directly)
        const source = config._source;
        
        // Remove _source from config before storing (it's metadata only)
        const { _source: _removedSource, ...configWithoutSource } = config;
        
        if (source) {
          // Use API-provided source
          setConfig(configWithoutSource);
          setConfigSource(source);
        } else if (config && Object.keys(config).length > 0 && 
            ((config.featureFlags && Object.keys(config.featureFlags).length > 0) || 
             (config.params && Object.keys(config.params).length > 0))) {
          // Fallback: Config has content - assume custom
          setConfig(configWithoutSource);
          setConfigSource('custom');
        } else {
          // Empty config - assume default
          setConfig({ featureFlags: {}, params: {} });
          setConfigSource('default');
        }
      } catch (error) {
        // Differentiate between workflow not found (404) and other errors
        const statusCode = (error as { statusCode?: number })?.statusCode || 
                          (error as { response?: { status?: number } })?.response?.status;
        if (statusCode === 404) {
          // Workflow not found - this is a real error
          console.error('Workflow not found:', workflowId);
          setConfig(null);
          setConfigSource(null);
        } else {
          // Other errors - use empty config as fallback (default)
          setConfig({ featureFlags: {}, params: {} });
          setConfigSource('default');
          // Only log at debug level - not a warning since defaults are expected
          console.debug('Using default config for workflow:', workflowId);
        }
      } finally {
        setLoading(false);
      }
    };

    loadConfig(comparisonWorkflowA, setWorkflowAConfig, setConfigSourceA, setLoadingConfigA);
    loadConfig(comparisonWorkflowB, setWorkflowBConfig, setConfigSourceB, setLoadingConfigB);
  }, [comparisonWorkflowA, comparisonWorkflowB]);

  const handleSaveConfig = async (
    workflowId: string,
    config: typeof workflowAConfig,
    setSaving: (saving: boolean) => void
  ) => {
    if (!workflowId || !config) return;
    setSaving(true);
    try {
      await api.workflow.setBenchmarkConfig(workflowId, config);
      toast.success(t('workflowComparison.configurationSaved'), t('workflowComparison.configurationSavedMessage'));
      // Reload config and mark as custom since it was just saved
      if (workflowId === comparisonWorkflowA) {
        const reloaded = await api.workflow.getBenchmarkConfig(workflowId);
        setWorkflowAConfig(reloaded);
        setConfigSourceA('custom');
        setShowEditConfigA(false);
      } else if (workflowId === comparisonWorkflowB) {
        const reloaded = await api.workflow.getBenchmarkConfig(workflowId);
        setWorkflowBConfig(reloaded);
        setConfigSourceB('custom');
        setShowEditConfigB(false);
      }
    } catch (error) {
      logError(error, 'save-benchmark-config');
      toast.error(t('workflowComparison.failedToSaveConfig'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditA = () => {
    setEditingConfigA(workflowAConfig || { featureFlags: {}, params: {} });
    setShowEditConfigA(true);
  };

  const handleOpenEditB = () => {
    setEditingConfigB(workflowBConfig || { featureFlags: {}, params: {} });
    setShowEditConfigB(true);
  };

  // Reserved for future use
  const _handleToggleFlag = (flagName: string, checked: boolean, isA: boolean) => {
    void _handleToggleFlag;
    if (isA) {
      setEditingConfigA(prev => ({
        ...prev,
        featureFlags: {
          ...(prev?.featureFlags || {}),
          [flagName]: checked,
        },
      }));
    } else {
      setEditingConfigB(prev => ({
        ...prev,
        featureFlags: {
          ...(prev?.featureFlags || {}),
          [flagName]: checked,
        },
      }));
    }
  };

  const handleStartComparison = async () => {
    if (!comparisonWorkflowA || !comparisonWorkflowB) {
      toast.error(t('workflowComparison.workflowsRequired'), t('workflowComparison.workflowsRequiredMessage'));
      return;
    }

    const validQueries = comparisonQueries.filter((q) => q.trim());
    if (validQueries.length === 0) {
      toast.error(t('workflowComparison.queryRequired'), t('workflowComparison.queryRequiredMessage'));
      return;
    }

    if (!comparisonName.trim()) {
      toast.error(t('workflowComparison.nameRequired'), t('workflowComparison.nameRequiredMessage'));
      return;
    }

    setIsStartingComparison(true);
    try {
      const response = await api.startWorkflowComparison({
        name: comparisonName.trim(),
        description: comparisonDescription.trim() || undefined,
        workflowA: {
          workflowId: comparisonWorkflowA,
          label: comparisonLabelA.trim() || undefined,
          runtimeSettings: workflowAConfig || undefined,
        },
        workflowB: {
          workflowId: comparisonWorkflowB,
          label: comparisonLabelB.trim() || undefined,
          runtimeSettings: workflowBConfig || undefined,
        },
        queries: validQueries,
        runsPerQuery: 1,
      });

      toast.success(t('workflowComparison.comparisonStarted'), t('workflowComparison.comparisonStartedMessage').replace('{{name}}', comparisonName));
      
      // Track active comparison
      setActiveComparisonId(response.comparisonId);
      // Persist to localStorage for page refresh recovery
      localStorage.setItem('activeWorkflowComparisonId', response.comparisonId);
      
      // Add to active comparisons list
      setActiveComparisons(prev => [...prev.filter(c => c.id !== response.comparisonId), {
        id: response.comparisonId,
        name: comparisonName.trim(),
        status: 'pending',
      }]);
      
      // Reset form
      setComparisonName('');
      setComparisonDescription('');
      setComparisonQueries(['']);
      setComparisonLabelA(t('workflowComparison.workflowA'));
      setComparisonLabelB(t('workflowComparison.workflowB'));
      setShowNewComparison(false);
    } catch (error) {
      logError(error, 'start-workflow-comparison');
      toast.error(t('workflowComparison.failedToStartComparison'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setIsStartingComparison(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('workflowComparison.workflowBenchmarkComparison')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('workflowComparison.historicalDescription')}
          </p>
        </div>
        <Button
          onClick={() => setShowNewComparison(!showNewComparison)}
          variant={showNewComparison ? 'default' : 'outline'}
        >
          {showNewComparison ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              {t('workflowComparison.hideNewComparison')}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {t('workflowComparison.startNewComparison')}
            </>
          )}
        </Button>
      </div>

      {/* New Comparison Form */}
      {showNewComparison && (
        <NewComparisonForm
          comparisonName={comparisonName}
          onComparisonNameChange={setComparisonName}
          comparisonDescription={comparisonDescription}
          onComparisonDescriptionChange={setComparisonDescription}
          comparisonWorkflowA={comparisonWorkflowA}
          onComparisonWorkflowAChange={setComparisonWorkflowA}
          comparisonWorkflowB={comparisonWorkflowB}
          onComparisonWorkflowBChange={setComparisonWorkflowB}
          comparisonQueries={comparisonQueries}
          onAddQuery={handleAddQuery}
          onRemoveQuery={handleRemoveQuery}
          onQueryChange={handleQueryChange}
          comparisonLabelA={comparisonLabelA}
          onComparisonLabelAChange={setComparisonLabelA}
          comparisonLabelB={comparisonLabelB}
          onComparisonLabelBChange={setComparisonLabelB}
          workflowAConfig={workflowAConfig}
          workflowBConfig={workflowBConfig}
          configSourceA={configSourceA}
          configSourceB={configSourceB}
          loadingConfigA={loadingConfigA}
          loadingConfigB={loadingConfigB}
          savingConfigA={savingConfigA}
          savingConfigB={savingConfigB}
          onOpenEditA={handleOpenEditA}
          onOpenEditB={handleOpenEditB}
          onSaveConfigA={() => handleSaveConfig(comparisonWorkflowA, workflowAConfig, setSavingConfigA)}
          onSaveConfigB={() => handleSaveConfig(comparisonWorkflowB, workflowBConfig, setSavingConfigB)}
          onStartComparison={handleStartComparison}
          isStartingComparison={isStartingComparison}
        />
      )}

      {/* Active Comparisons List */}
      <ActiveComparisonsList
        activeComparisons={activeComparisons}
        activeComparisonId={activeComparisonId}
        onComparisonSelect={setActiveComparisonId}
        showList={showActiveComparisonsList}
        onToggleList={() => setShowActiveComparisonsList(!showActiveComparisonsList)}
      />

      {/* Two-Pane Workflow Execution View for Active Comparison */}
      {activeComparison && (activeComparison.status === 'running' || activeComparison.status === 'pending' || activeComparison.status === 'completed' || activeComparison.status === 'failed') && (
        <WorkflowComparisonPanes
          activeComparison={activeComparison}
          workflowDocuments={workflowDocuments}
          synchronizedScrolling={synchronizedScrolling}
          onSynchronizedScrollingChange={setSynchronizedScrolling}
          pollingError={pollingError}
          onRetryPolling={handleRetryPolling}
        />
      )}

      {/* Historical Comparison Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workflowComparison.viewHistoricalComparisons')}</CardTitle>
          <CardDescription>
            {t('workflowComparison.historicalDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Selection */}
          <WorkflowSelector
            selectedWorkflows={selectedWorkflows}
            onSelectionChange={setSelectedWorkflows}
            maxSelection={2}
            minSelection={2}
            label={t('workflowComparison.selectWorkflowsToCompare')}
            description={t('workflowComparison.selectWorkflowsDescription')}
          />

          {/* Date Range and Query Filters */}
          <div className="space-y-4">
            {/* Quick Range Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('workflowComparison.quickRange')}</label>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as QuickRange[]).map((range) => (
                <Button
                  key={range}
                  variant={quickRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleQuickRange(range)}
                >
                  {range === 'all' ? t('workflowComparison.allTime') : range === '7d' ? t('workflowComparison.last7d') : range === '30d' ? t('workflowComparison.last30d') : t('workflowComparison.last90d')}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('workflowComparison.fromDate')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange.from && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? formatDate(dateRange.from) : t('workflowComparison.pickDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('workflowComparison.toDate')}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange.to && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? formatDate(dateRange.to) : t('workflowComparison.pickDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Query Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('workflowComparison.queryFilterOptional')}</label>
            <Input
              type="text"
              placeholder={t('workflowComparison.filterByQuery')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('workflowComparison.loadingComparisonData')}</p>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive font-medium">{t('workflowComparison.errorLoadingComparison')}</p>
            <p className="text-muted-foreground mt-2">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Comparison Results */}
      {canCompare && (
        <ComparisonResults
          comparisonA={comparisonA}
          comparisonB={comparisonB}
          metricsData={metricsData}
          trendData={trendData}
          winner={winner}
        />
      )}

      {/* Empty State */}
      {!loading && !error && !canCompare && hasBothWorkflows && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t('workflowComparison.noComparisonData')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Configuration Dialog for Workflow A */}
      <EditBenchmarkConfigDialog
        open={showEditConfigA}
        onOpenChange={setShowEditConfigA}
        workflowLabel="A"
        editingConfig={editingConfigA}
        onEditingConfigChange={setEditingConfigA}
        savedConfig={workflowAConfig}
        onSave={() => {
          if (editingConfigA) {
            setWorkflowAConfig(editingConfigA);
            handleSaveConfig(comparisonWorkflowA, editingConfigA, setSavingConfigA);
          }
        }}
        saving={savingConfigA}
        availableFlags={availableFlags}
        loadingFlags={loadingFlags}
        flagsError={flagsError}
        onRefetchFlags={refetchFlags}
        flagsSearchQuery={flagsSearchQuery}
        onFlagsSearchQueryChange={setFlagsSearchQuery}
      />

      {/* Edit Configuration Dialog for Workflow B */}
      <EditBenchmarkConfigDialog
        open={showEditConfigB}
        onOpenChange={setShowEditConfigB}
        workflowLabel="B"
        editingConfig={editingConfigB}
        onEditingConfigChange={setEditingConfigB}
        savedConfig={workflowBConfig}
        onSave={() => {
          if (editingConfigB) {
            setWorkflowBConfig(editingConfigB);
            handleSaveConfig(comparisonWorkflowB, editingConfigB, setSavingConfigB);
          }
        }}
        saving={savingConfigB}
        availableFlags={availableFlags}
        loadingFlags={loadingFlags}
        flagsError={flagsError}
        onRefetchFlags={refetchFlags}
        flagsSearchQuery={flagsSearchQuery}
        onFlagsSearchQueryChange={setFlagsSearchQuery}
      />
    </div>
  );
}

