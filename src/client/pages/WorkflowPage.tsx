import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { WorkflowQueuePanelRef } from '../components/workflow/WorkflowQueuePanel';
import { Play, Download } from 'lucide-react';
import { toast } from '../utils/toast';
import { t, TranslationKey } from '../utils/i18n';
import { LogBubble, BaseLogEntry } from '../components/shared/LogBubble';
import { clusterLogs } from '../utils/logClustering';
import { translateLogMessage } from '../utils/logTranslations';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { WorkflowManagementView } from '../components/workflows/WorkflowManagementView';
import { WorkflowReviewDialog } from '../components/workflows/WorkflowReviewDialog';
import { RealTimeGraphVisualizer } from '../components/RealTimeGraphVisualizer';
import { WorkflowQueuePanel } from '../components/workflow/WorkflowQueuePanel';
import { FullNavigationGraph } from '../components/workflow/FullNavigationGraph';
import { useAuth } from '../context/AuthContext';
import { useWorkflows } from '../context/WorkflowContext';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { useSSE, type LogEventData, type JobStatusEventData } from '../hooks/useSSE';

// Use a function to access env to make it testable
const getWorkflowDebugEnabled = () => {
    try {
        return (import.meta.env as Record<string, string | undefined>).VITE_WORKFLOW_DEBUG === 'true';
    } catch {
        // Fallback for test environments where import.meta.env might not be available
        return false;
    }
};

const WORKFLOW_DEBUG_ENABLED = getWorkflowDebugEnabled();

const debugLog = (...args: unknown[]) => {
    if (WORKFLOW_DEBUG_ENABLED) {
        console.debug(...args);
    }
};

const WORKFLOW_LABELS: Record<string, { nameKey: TranslationKey; descriptionKey: TranslationKey }> = {
    'iplo-exploration': {
        nameKey: 'workflows.iploExploration.name',
        descriptionKey: 'workflows.iploExploration.description'
    },
    'standard-scan': {
        nameKey: 'workflows.standardScan.name',
        descriptionKey: 'workflows.standardScan.description'
    },
    'quick-iplo-scan': {
        nameKey: 'workflows.quickIploScan.name',
        descriptionKey: 'workflows.quickIploScan.description'
    },
    'bfs-3-hop': {
        nameKey: 'workflows.bfs3Hop.name',
        descriptionKey: 'workflows.bfs3Hop.description'
    },
    'external-links-exploration': {
        nameKey: 'workflows.externalLinks.name',
        descriptionKey: 'workflows.externalLinks.description'
    },
    'beleidsscan-graph': {
        nameKey: 'workflows.beleidsscanGraph.name',
        descriptionKey: 'workflows.beleidsscanGraph.description'
    },
    'horst-aan-de-maas': {
        nameKey: 'workflows.horstAanDeMaas.name',
        descriptionKey: 'workflows.horstAanDeMaas.description'
    },
    'horst-labor-migration': {
        nameKey: 'workflows.horstLaborMigration.name',
        descriptionKey: 'workflows.horstLaborMigration.description'
    },
    'beleidsscan-step-1-search-dso': {
        nameKey: 'workflows.beleidsscanStep1.name',
        descriptionKey: 'workflows.beleidsscanStep1.description'
    },
    'beleidsscan-step-2-enrich-dso': {
        nameKey: 'workflows.beleidsscanStep2.name',
        descriptionKey: 'workflows.beleidsscanStep2.description'
    },
    'beleidsscan-step-3-search-iplo': {
        nameKey: 'workflows.beleidsscanStep3.name',
        descriptionKey: 'workflows.beleidsscanStep3.description'
    },
    'beleidsscan-step-4-scan-sources': {
        nameKey: 'workflows.beleidsscanStep4.name',
        descriptionKey: 'workflows.beleidsscanStep4.description'
    },
    'beleidsscan-step-5-officiele-bekendmakingen': {
        nameKey: 'workflows.beleidsscanStep5.name',
        descriptionKey: 'workflows.beleidsscanStep5.description'
    },
    'beleidsscan-step-6-rechtspraak': {
        nameKey: 'workflows.beleidsscanStep6.name',
        descriptionKey: 'workflows.beleidsscanStep6.description'
    },
    'beleidsscan-step-7-common-crawl': {
        nameKey: 'workflows.beleidsscanStep7.name',
        descriptionKey: 'workflows.beleidsscanStep7.description'
    },
    'beleidsscan-step-9-merge-score': {
        nameKey: 'workflows.beleidsscanStep9.name',
        descriptionKey: 'workflows.beleidsscanStep9.description'
    }
};

interface Workflow {
    id: string;
    name: string;
    description: string;
    steps: unknown[];
}

/**
 * Preset configuration for Beleidsscan Wizard Workflow
 */
interface BeleidsscanPresetConfig {
    id: string;
    name: string;
    description: string;
    onderwerp: string;
    thema: string;
    overheidsinstantie: string;
    overheidslaag: string;
    selectedWebsites: string[];
}

/**
 * Pre-defined preset configurations for Beleidsscan Wizard Workflow
 */
const BELEIDSSCAN_PRESET_CONFIGS: BeleidsscanPresetConfig[] = [
    {
        id: 'municipality-amsterdam',
        name: 'Gemeente Scan (Amsterdam)',
        description: 'Klimaatadaptatie scan voor Gemeente Amsterdam',
        onderwerp: 'klimaatadaptatie',
        thema: 'wateroverlast',
        overheidsinstantie: 'Gemeente Amsterdam',
        overheidslaag: 'gemeente',
        selectedWebsites: []
    },
    {
        id: 'province-noord-holland',
        name: 'Provincie Scan (Noord-Holland)',
        description: 'Waterbeheer scan voor Provincie Noord-Holland',
        onderwerp: 'waterbeheer',
        thema: 'klimaat',
        overheidsinstantie: 'Provincie Noord-Holland',
        overheidslaag: 'provincie',
        selectedWebsites: []
    },
    {
        id: 'quick-test',
        name: 'Snelle Test Scan',
        description: 'Snelle test scan voor Horst aan de Maas',
        onderwerp: 'beleid',
        thema: '',
        overheidsinstantie: 'Horst aan de Maas',
        overheidslaag: 'gemeente',
        selectedWebsites: []
    }
];

export function WorkflowPage() {
    const { isAuthenticated } = useAuth();
    const { workflows: workflowDocuments, isLoading: workflowsLoading } = useWorkflows();
    const [activeTab, setActiveTab] = useState<'published' | 'manage'>('published');
    const [logs, setLogs] = useState<BaseLogEntry[]>([]);
    const [runStatus, setRunStatus] = useState<string | null>(null);
    const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null); // This stores the runId
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null); // This stores the workflow.id
    const [showReviewDialog, setShowReviewDialog] = useState(false);
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
    const processedLogIdsRef = useRef<Set<string>>(new Set());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const scrollRafRef = useRef<number | null>(null);
    const queuePanelRef = useRef<WorkflowQueuePanelRef>(null);
    const pendingLogsRef = useRef<BaseLogEntry[]>([]);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Status polling removed - now using SSE for real-time status updates

    // Convert WorkflowDocument[] to Workflow[] format used by this component
    const workflows = useMemo<Workflow[]>(() => {
        return workflowDocuments.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description || '',
            steps: w.steps || [],
        }));
    }, [workflowDocuments]);

    const isLoading = workflowsLoading;

    // Auto-scroll to bottom when new logs appear
    useEffect(() => {
        if (!scrollContainerRef.current || logs.length === 0) return;

        const container = scrollContainerRef.current;
        const scrollThreshold = 100;
        const isNearBottom = 
            container.scrollHeight - container.scrollTop - container.clientHeight < scrollThreshold;
        const isInitialContent = container.scrollHeight <= container.clientHeight;

        if (isNearBottom || isInitialContent) {
            if (scrollRafRef.current !== null) {
                cancelAnimationFrame(scrollRafRef.current);
            }
            scrollRafRef.current = requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
                scrollRafRef.current = null;
            });
        }

        return () => {
            if (scrollRafRef.current !== null) {
                cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [logs.length]);

    // Helper function to convert SSE log to BaseLogEntry
    const convertLogToBaseEntry = useCallback((log: LogEventData['log'], currentStatus: string | null): BaseLogEntry | null => {
        // Filter out debug logs from user-facing UI (unless in development with debug enabled)
        const logLevel = log.level || 'info';
        const isDebugLog = logLevel === 'debug';
        const shouldShowDebug = WORKFLOW_DEBUG_ENABLED;
        
        if (isDebugLog && !shouldShowDebug) {
            return null; // Skip debug logs in production/normal mode
        }
        
        // Generate log ID
        const logId = `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
        
        // Skip if already processed
        if (processedLogIdsRef.current.has(logId)) {
            return null;
        }
        
        processedLogIdsRef.current.add(logId);
        
        const formattedMessage = typeof log.message === 'string' ? log.message : '';
        
        // Skip logs with empty messages
        if (!formattedMessage.trim()) {
            return null;
        }
        
        const localizedMessage = translateLogMessage(formattedMessage);
        
        // Handle timestamp
        let timestamp: Date | string;
        if (log.timestamp instanceof Date) {
            timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
        } else if (typeof log.timestamp === 'string') {
            const date = new Date(log.timestamp);
            timestamp = isNaN(date.getTime()) ? new Date() : date;
        } else {
            timestamp = new Date();
        }
        
        const level: 'info' | 'warn' | 'error' | 'debug' = (logLevel === 'error' || logLevel === 'info' || logLevel === 'warn' || logLevel === 'debug') 
            ? logLevel as 'info' | 'warn' | 'error' | 'debug' 
            : 'info';
        
        const icon = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🤖';
        const color = level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-blue-400';
        
        return {
            id: logId,
            timestamp,
            message: formattedMessage,
            formattedMessage: localizedMessage,
            localizedMessage,
            thoughtBubble: undefined,
            level,
            isComplete: currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled',
            icon,
            color
        };
    }, []);

    // Batch log updates to reduce re-renders and clustering overhead
    const flushPendingLogs = useCallback(() => {
        if (pendingLogsRef.current.length === 0) return;
        
        const logsToAdd = pendingLogsRef.current;
        pendingLogsRef.current = [];
        
        setLogs(prev => {
            // Filter out duplicates
            const existingLogIds = new Set(prev.map(log => log.id));
            const trulyNewLogs = logsToAdd.filter(log => !existingLogIds.has(log.id));
            
            if (trulyNewLogs.length === 0) {
                return prev;
            }
            
            // Add new logs and apply clustering once (not on every update)
            const allLogs = [...prev, ...trulyNewLogs];
            const clustered = clusterLogs(allLogs, {
                maxClusterSize: 50,
                minClusterSize: 1
            });
            
            debugLog(`[WorkflowPage] Added ${trulyNewLogs.length} new logs, total: ${allLogs.length}, clustered: ${clustered.length}`);
            return clustered;
        });
    }, []);

    // SSE connection for real-time log and status streaming (per TOOL-006)
    const { isConnected: sseConnected } = useSSE(
        runningWorkflowId ? `/api/runs/${runningWorkflowId}/events` : '',
        {
            enabled: !!runningWorkflowId,
            onLog: (data: LogEventData) => {
                if (data.runId !== runningWorkflowId) return; // Ignore logs for other runs
                
                const baseEntry = convertLogToBaseEntry(data.log, runStatus);
                if (!baseEntry) return; // Skip debug logs or duplicates
                
                // Add to pending logs batch
                pendingLogsRef.current.push(baseEntry);
                
                // Debounce log updates (batch every 500ms for better performance)
                if (debounceTimeoutRef.current) {
                    clearTimeout(debounceTimeoutRef.current);
                }
                
                debounceTimeoutRef.current = setTimeout(() => {
                    flushPendingLogs();
                }, 500);
            },
            onJobStatus: (data: JobStatusEventData) => {
                if (data.runId !== runningWorkflowId) return; // Ignore status for other runs
                
                // Update run status from SSE event
                setRunStatus(data.status);
                
                // Show review dialog if workflow is paused
                if (data.status === 'paused' && runningWorkflowId) {
                    setShowReviewDialog(true);
                }
                
                // Mark all logs as complete if workflow is done
                if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                    // Flush any pending logs immediately before marking complete
                    if (debounceTimeoutRef.current) {
                        clearTimeout(debounceTimeoutRef.current);
                        debounceTimeoutRef.current = null;
                    }
                    flushPendingLogs();
                    
                    setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
                    
                    // Clean up after a delay
                    setTimeout(() => {
                        setRunningWorkflowId(null);
                        setCurrentWorkflowId(null);
                        setRunStatus(null);
                    }, 5000); // Keep status visible for 5 seconds after completion
                }
                
                // Refresh queue panel when job completes or fails
                if ((data.status === 'completed' || data.status === 'failed') && queuePanelRef.current) {
                    queuePanelRef.current.refresh().catch(err => {
                        console.error('[WorkflowPage] Failed to refresh queue panel after job status change:', err);
                    });
                }
            },
            onCompleted: (data) => {
                if (data.runId !== runningWorkflowId) return;
                
                // Flush any pending logs immediately before marking complete
                if (debounceTimeoutRef.current) {
                    clearTimeout(debounceTimeoutRef.current);
                    debounceTimeoutRef.current = null;
                }
                flushPendingLogs();
                
                // Handle workflow completion
                setRunStatus('completed');
                setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
                
                // Clean up after a delay
                setTimeout(() => {
                    setRunningWorkflowId(null);
                    setCurrentWorkflowId(null);
                    setRunStatus(null);
                }, 5000);
            },
        }
    );

    // Fetch initial logs and status when runId changes (for catch-up)
    useEffect(() => {
        if (!runningWorkflowId) {
            setLogs([]);
            setRunStatus(null);
            processedLogIdsRef.current.clear();
            pendingLogsRef.current = [];
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
                debounceTimeoutRef.current = null;
            }
            return;
        }

        const fetchInitialData = async () => {
            try {
                const run = await api.workflow.getRun(runningWorkflowId);
                if (run) {
                    setRunStatus(run.status);
                    
                    // Update current workflow ID from run params
                    if (run.params?.workflowId && typeof run.params.workflowId === 'string') {
                        setCurrentWorkflowId(run.params.workflowId);
                    }
                    
                    // Load initial logs for catch-up (SSE will handle new logs in real-time)
                    if (run.logs && run.logs.length > 0) {
                        const initialLogs: BaseLogEntry[] = [];
                        
                        run.logs.forEach((log: Record<string, unknown>) => {
                            const logLevel = typeof log.level === 'string' ? log.level : 'info';
                            if (logLevel === 'debug' && !WORKFLOW_DEBUG_ENABLED) return;
                            
                            const logId = (typeof log.id === 'string' ? log.id : undefined)
                                || `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
                            
                            if (!processedLogIdsRef.current.has(logId)) {
                                processedLogIdsRef.current.add(logId);
                                
                                const formattedMessage = typeof log.formattedMessage === 'string'
                                    ? log.formattedMessage
                                    : typeof log.message === 'string'
                                        ? log.message
                                        : '';
                                
                                if (!formattedMessage.trim()) return;
                                
                                const localizedMessage = translateLogMessage(formattedMessage);
                                
                                let timestamp: Date | string;
                                if (log.timestamp instanceof Date) {
                                    timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
                                } else if (typeof log.timestamp === 'string') {
                                    const date = new Date(log.timestamp);
                                    timestamp = isNaN(date.getTime()) ? new Date() : date;
                                } else {
                                    timestamp = new Date();
                                }
                                
                                const level: 'info' | 'warn' | 'error' | 'debug' = (typeof log.level === 'string' && (log.level === 'error' || log.level === 'info' || log.level === 'warn' || log.level === 'debug')) 
                                    ? log.level as 'info' | 'warn' | 'error' | 'debug' 
                                    : 'info';
                                
                                const icon = typeof log.icon === 'string' ? log.icon : (level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🤖');
                                const color = typeof log.color === 'string'
                                    ? log.color
                                    : (level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-blue-400');
                                
                                initialLogs.push({
                                    id: logId,
                                    timestamp,
                                    message: formattedMessage,
                                    formattedMessage: localizedMessage,
                                    localizedMessage,
                                    thoughtBubble: typeof log.thoughtBubble === 'string' ? log.thoughtBubble : undefined,
                                    level,
                                    isComplete: run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
                                    icon,
                                    color
                                });
                            }
                        });
                        
                        if (initialLogs.length > 0) {
                            setLogs(prev => {
                                const existingLogIds = new Set(prev.map(log => log.id));
                                const newLogs = initialLogs.filter(log => !existingLogIds.has(log.id));
                                if (newLogs.length === 0) return prev;
                                
                                const allLogs = [...prev, ...newLogs];
                                return clusterLogs(allLogs, {
                                    maxClusterSize: 50,
                                    minClusterSize: 1
                                });
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[WorkflowPage] Error fetching initial run data:`, error);
                logError(error, 'fetch-initial-run-data');
            }
        };

        fetchInitialData();
    }, [runningWorkflowId]);

    // Status updates now come from SSE (job_status and completed events)
    // No polling needed - SSE provides real-time status updates
    // Initial status is fetched in fetchInitialData effect above

    // Cleanup on unmount or when runId changes
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
                debounceTimeoutRef.current = null;
            }
            // Flush any pending logs before cleanup
            if (pendingLogsRef.current.length > 0) {
                flushPendingLogs();
            }
        };
    }, [runningWorkflowId, flushPendingLogs]);

    const handlePauseWorkflow = async () => {
        if (!runningWorkflowId) return;
        try {
            // Get queue jobs to find the jobId for this runId
            const queueResponse = await api.workflow.getWorkflowQueueJobs();
            const job = queueResponse.jobs.find(j => j.runId === runningWorkflowId);
            
            if (!job) {
                throw new Error('Job niet gevonden in queue voor deze workflow run');
            }
            
            // Use the same API as the queue panel pause button
            await api.workflow.pauseQueueJob(job.jobId);
            toast.success('Job gepauzeerd', 'De workflow job is gepauzeerd.');
            
            // Refresh the queue panel to show updated status
            if (queuePanelRef.current) {
                await queuePanelRef.current.refresh();
            }
        } catch (error) {
            logError(error, 'pause-workflow');
            toast.error(t('workflowPage.failedToPause'), error instanceof Error ? error.message : 'Probeer het opnieuw.');
        }
    };

    const handleResumeWorkflow = async () => {
        if (!runningWorkflowId) return;
        try {
            // Get queue jobs to find the jobId for this runId
            const queueResponse = await api.workflow.getWorkflowQueueJobs();
            const job = queueResponse.jobs.find(j => j.runId === runningWorkflowId);
            
            if (!job) {
                throw new Error('Job niet gevonden in queue voor deze workflow run');
            }
            
            // Use the same API as the queue panel resume button
            await api.workflow.resumeQueueJob(job.jobId);
            toast.success('Job hervat', 'De workflow job is hervat.');
            
            // Refresh the queue panel to show updated status
            if (queuePanelRef.current) {
                await queuePanelRef.current.refresh();
            }
        } catch (error) {
            logError(error, 'resume-workflow');
            toast.error(t('workflowPage.failedToResume'), error instanceof Error ? error.message : 'Probeer het opnieuw.');
        }
    };

    const handleStopWorkflow = async () => {
        if (!runningWorkflowId) return;
        try {
            await api.workflow.cancelRun(runningWorkflowId);
        } catch (error) {
            logError(error, 'stop-workflow');
            toast.error(t('workflowPage.failedToStop'), 'Probeer het opnieuw.');
        }
    };

    const handleDownloadLogs = () => {
        if (logs.length === 0) return;
        
        // Format logs as text
        const logText = logs.map((log) => {
            const formattedMessage = log.localizedMessage || log.formattedMessage || log.message || '';
            const thoughtBubble = log.thoughtBubble;
            const timestamp = log.timestamp || '';
            const level = log.level || 'info';
            
            let text = `[${timestamp}] ${level.toUpperCase()}\n`;
            text += `${formattedMessage}\n`;
            if (thoughtBubble && !/Ik werk de navigatiegrafiek bij|Navigation graph.*updated|graph.*updated|Updating graph|Merging.*graph|Consolidating.*graph/i.test(thoughtBubble)) {
                text += `💭 ${thoughtBubble}\n`;
            }
            text += '\n';
            return text;
        }).join('---\n');
        
        // Create blob and download
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const runId = runningWorkflowId || currentWorkflowId || 'unknown';
        link.download = `workflow-logs-${runId}-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleRunWorkflow = async (id: string, customParams: Record<string, unknown> = {}) => {
        console.log(`[WorkflowPage] Starting workflow ${id} with params:`, customParams);
        setLogs([]); // Clear previous logs
        processedLogIdsRef.current.clear(); // Clear processed log IDs
        console.log('[WorkflowPage] Cleared previous logs and processed log IDs');
        
        debugLog(`[WorkflowPage] Starting workflow ${id} with params:`, customParams);
        
        try {
            const result = await api.workflow.runWorkflow(id, {
                mode: 'dev',
                ...customParams
            } as Parameters<typeof api.workflow.runWorkflow>[1]);

            debugLog(`[WorkflowPage] Workflow API response:`, result);
            console.log('[WorkflowPage] Workflow API response:', result);

            // The API returns { runId: '...' }
            if (result.runId) {
                debugLog(`[WorkflowPage] Workflow started successfully, runId: ${result.runId}`);
                console.log(`[WorkflowPage] Workflow started successfully, runId: ${result.runId}`);
                setRunningWorkflowId(result.runId);
                setCurrentWorkflowId(id); // Store the workflow ID
                
                // Refresh queue panel to show the newly queued job
                if (queuePanelRef.current) {
                    queuePanelRef.current.refresh().catch(err => {
                        console.error('[WorkflowPage] Failed to refresh queue panel:', err);
                    });
                }
                
                toast.success('Workflow gestart', 'De workflow is gestart. Bekijk de voortgang hieronder.');
            } else {
                const error = new Error('No runId returned from API');
                logError(error, 'start-workflow');
                console.error('[WorkflowPage] API response missing runId:', result);
                toast.warning('Workflow gestart', 'Kan voortgang niet volgen (geen runId ontvangen).');
            }

        } catch (error) {
            console.error('[WorkflowPage] Error starting workflow:', error);
            logError(error, 'start-workflow');
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast.error(t('workflowPage.failedToStart'), `Fout: ${errorMessage}`);
        }
    };

    if (isLoading && activeTab === 'published') {
        return <div className="p-8">{t('workflowPage.loading')}</div>;
    }

    return (
        <div className="p-8 h-full flex flex-col">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('workflowPage.title')}</h2>
                <p className="text-gray-500 dark:text-gray-400">
                    {t('workflowPage.description')}
                </p>
                <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                    {t('workflowPage.tip')}
                </div>
            </div>

            {/* Tabs for Published vs Managed Workflows */}
            {isAuthenticated ? (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'published' | 'manage')} className="mb-6">
                    <TabsList>
                        <TabsTrigger value="published">Published Workflows</TabsTrigger>
                        <TabsTrigger value="manage">Manage Workflows</TabsTrigger>
                    </TabsList>
                    <TabsContent value="manage" className="mt-6">
                        <WorkflowManagementView />
                    </TabsContent>
                    <TabsContent value="published" className="mt-6">
                        {/* Published workflows view - shown below */}
                    </TabsContent>
                </Tabs>
            ) : null}

            {/* Published workflows view - shown when not authenticated or when published tab is active */}
            {(!isAuthenticated || activeTab === 'published') && (
            <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    {workflows.map((workflow) => {
                        const labels = WORKFLOW_LABELS[workflow.id];
                        const localizedName = labels ? t(labels.nameKey) : workflow.name;
                        const localizedDescription = labels ? t(labels.descriptionKey) : workflow.description;

                        return (
                            <div key={workflow.id} data-testid={`workflow-card-${workflow.id}`} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{localizedName}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{localizedDescription}</p>
                                    </div>
                                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                        <Play className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                        <span className="font-medium">{workflow.steps.length} {t('workflowPage.steps')}</span>
                                    </div>

                                    {/* Semantic Workflow Inputs */}
                                    {workflow.id === 'iplo-exploration' && (
                                        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    {t('workflowPage.semanticTarget')}
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g., bodem, water"
                                                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                                    id={`query-${workflow.id}`}
                                                    data-testid={`iplo-semantic-target-input`}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    {t('workflowPage.explorationRandomness')}
                                                </label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    defaultValue="0.3"
                                                    className="w-full"
                                                    id={`randomness-${workflow.id}`}
                                                    data-testid={`iplo-randomness-input`}
                                                />
                                                <div className="flex justify-between text-[10px] text-gray-500">
                                                    <span>{t('workflowPage.focused')}</span>
                                                    <span>{t('workflowPage.chaotic')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Beleidsscan Workflow Inputs - Subject and Location */}
                                    {(workflow.id.startsWith('beleidsscan-step-') || 
                                      workflow.id === 'beleidsscan-wizard' || 
                                      workflow.id === 'beleidsscan-graph' ||
                                      workflow.id === 'standard-scan' ||
                                      workflow.id === 'bfs-3-hop') && (
                                        <div className="space-y-3">
                                            {/* Preset Configuration Selector - Only for beleidsscan-wizard */}
                                            {workflow.id === 'beleidsscan-wizard' && (
                                                <div className="mb-4">
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                        Vooraf ingestelde configuraties
                                                    </label>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {BELEIDSSCAN_PRESET_CONFIGS.map((preset) => (
                                                            <button
                                                                key={preset.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedPresetId(preset.id);
                                                                    // Populate input fields with preset values
                                                                    const subjectInput = document.getElementById(`subject-${workflow.id}`) as HTMLInputElement;
                                                                    const themaInput = document.getElementById(`thema-${workflow.id}`) as HTMLInputElement;
                                                                    const locationInput = document.getElementById(`location-${workflow.id}`) as HTMLInputElement;
                                                                    const overheidslaagSelect = document.getElementById(`overheidslaag-${workflow.id}`) as HTMLSelectElement;
                                                                    
                                                                    if (subjectInput) subjectInput.value = preset.onderwerp;
                                                                    if (themaInput) themaInput.value = preset.thema;
                                                                    if (locationInput) locationInput.value = preset.overheidsinstantie;
                                                                    if (overheidslaagSelect && preset.overheidslaag) {
                                                                        // Normalize to lowercase for comparison
                                                                        const normalizedValue = preset.overheidslaag.toLowerCase().trim();
                                                                        overheidslaagSelect.value = normalizedValue;
                                                                    }
                                                                }}
                                                                className={`p-3 text-left rounded-lg border transition-colors ${
                                                                    selectedPresetId === preset.id
                                                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400'
                                                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                                }`}
                                                                data-testid={`preset-${preset.id}`}
                                                            >
                                                                <div className="font-medium text-sm text-gray-900 dark:text-white">
                                                                    {preset.name}
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                    {preset.description}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700 space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Onderwerp *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., klimaatadaptatie, bodem"
                                                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                                        id={`subject-${workflow.id}`}
                                                        data-testid={`subject-input-${workflow.id}`}
                                                    />
                                                </div>
                                                {workflow.id === 'beleidsscan-wizard' && (
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Thema (Theme) - Optioneel
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g., wateroverlast, klimaat"
                                                            className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                                            id={`thema-${workflow.id}`}
                                                            data-testid={`thema-input-${workflow.id}`}
                                                        />
                                                    </div>
                                                )}
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                        Locatie (Location) - Optioneel
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., Gemeente Amsterdam, Horst aan de Maas"
                                                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                                        id={`location-${workflow.id}`}
                                                        data-testid={`location-input-${workflow.id}`}
                                                    />
                                                </div>
                                                {workflow.id === 'beleidsscan-wizard' && (
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Overheidslaag (Government Level) - Optioneel
                                                        </label>
                                                        <select
                                                            className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                                            id={`overheidslaag-${workflow.id}`}
                                                            data-testid={`overheidslaag-select-${workflow.id}`}
                                                            defaultValue=""
                                                        >
                                                            <option value="">-- Selecteer overheidslaag --</option>
                                                            <option value="gemeente">Gemeente</option>
                                                            <option value="provincie">Provincie</option>
                                                            <option value="rijk">Rijksoverheid</option>
                                                            <option value="waterschap">Waterschap</option>
                                                            <option value="kennisinstituut">Kennisinstituut</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                debugLog(`[WorkflowPage] Button clicked for workflow: ${workflow.id}`);
                                                
                                                const queryInput = document.getElementById(`query-${workflow.id}`) as HTMLInputElement;
                                                const randomnessInput = document.getElementById(`randomness-${workflow.id}`) as HTMLInputElement;
                                                const subjectInput = document.getElementById(`subject-${workflow.id}`) as HTMLInputElement;
                                                const locationInput = document.getElementById(`location-${workflow.id}`) as HTMLInputElement;
                                                const themaInput = document.getElementById(`thema-${workflow.id}`) as HTMLInputElement;

                                                // Build params based on workflow type
                                                const params: Record<string, unknown> = {};
                                                
                                                if (workflow.id === 'iplo-exploration') {
                                                    params.query = queryInput?.value?.trim() || undefined;
                                                    // Get randomness value, defaulting to 0.3 if not set
                                                    const randomnessValue = randomnessInput?.value || randomnessInput?.getAttribute('value') || '0.3';
                                                    const parsed = parseFloat(randomnessValue);
                                                    if (!isNaN(parsed)) {
                                                        params.randomness = parsed;
                                                    } else {
                                                        // Fallback to default if parsing fails
                                                        params.randomness = 0.3;
                                                    }
                                                    debugLog(`[WorkflowPage] IPLO exploration params:`, params);
                                                } else if (
                                                    workflow.id.startsWith('beleidsscan-step-') || 
                                                    workflow.id === 'beleidsscan-wizard' || 
                                                    workflow.id === 'beleidsscan-graph' ||
                                                    workflow.id === 'standard-scan' ||
                                                    workflow.id === 'bfs-3-hop'
                                                ) {
                                                    // For workflows requiring onderwerp, use onderwerp and overheidsinstantie
                                                    if (subjectInput?.value) {
                                                        params.onderwerp = subjectInput.value.trim();
                                                        params.query = subjectInput.value.trim(); // Also set query for compatibility
                                                    }
                                                    if (locationInput?.value) {
                                                        params.overheidsinstantie = locationInput.value.trim();
                                                    }
                                                    
                                                    // For beleidsscan-wizard, include thema and overheidslaag
                                                    if (workflow.id === 'beleidsscan-wizard') {
                                                        const overheidslaagSelect = document.getElementById(`overheidslaag-${workflow.id}`) as HTMLSelectElement;
                                                        
                                                        // Read values from input fields (which may have been populated by preset)
                                                        if (themaInput?.value) {
                                                            params.thema = themaInput.value.trim();
                                                        }
                                                        if (overheidslaagSelect?.value) {
                                                            // Normalize to lowercase (case-insensitive)
                                                            params.overheidslaag = overheidslaagSelect.value.toLowerCase().trim();
                                                        }
                                                        
                                                        // If a preset is selected, use preset values for any empty fields
                                                        // This ensures preset values are used even if user clears a field
                                                        if (selectedPresetId) {
                                                            const preset = BELEIDSSCAN_PRESET_CONFIGS.find(p => p.id === selectedPresetId);
                                                            if (preset) {
                                                                // Use preset values if fields are empty (allows manual override)
                                                                if (!params.onderwerp && preset.onderwerp) {
                                                                    params.onderwerp = preset.onderwerp;
                                                                    params.query = preset.onderwerp;
                                                                }
                                                                if (!params.thema && preset.thema) {
                                                                    params.thema = preset.thema;
                                                                }
                                                                if (!params.overheidsinstantie && preset.overheidsinstantie) {
                                                                    params.overheidsinstantie = preset.overheidsinstantie;
                                                                }
                                                                if (!params.overheidslaag && preset.overheidslaag) {
                                                                    params.overheidslaag = preset.overheidslaag;
                                                                }
                                                                if (preset.selectedWebsites.length > 0 && !params.selectedWebsites) {
                                                                    params.selectedWebsites = preset.selectedWebsites;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

                                                handleRunWorkflow(workflow.id, params);
                                            }}
                                            disabled={((workflow.id.startsWith('beleidsscan-step-') || workflow.id === 'beleidsscan-wizard' || workflow.id === 'beleidsscan-graph' || workflow.id === 'standard-scan' || workflow.id === 'bfs-3-hop') && !(document.getElementById(`subject-${workflow.id}`) as HTMLInputElement)?.value)}
                                            data-testid={`workflow-run-button-${workflow.id}`}
                                            className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors ${((workflow.id.startsWith('beleidsscan-step-') || workflow.id === 'beleidsscan-wizard' || workflow.id === 'beleidsscan-graph' || workflow.id === 'standard-scan' || workflow.id === 'bfs-3-hop') && !(document.getElementById(`subject-${workflow.id}`) as HTMLInputElement)?.value)
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                        >
                                            <Play className="w-4 h-4" />
                                            {t('workflowPage.run')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Column: Logs Panel, Navigation Graph, and Queue */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Logs Panel */}
                    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col h-[600px]" data-testid="execution-logs-panel">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                            <h3 className="text-lg font-semibold text-gray-200">{t('workflowPage.workflowThoughts')}</h3>
                            <div className="flex items-center gap-3">
                                {logs.length > 0 && (
                                    <button
                                        onClick={handleDownloadLogs}
                                        className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                                        title={t('workflowPage.downloadLogsTooltip')}
                                    >
                                        <Download className="w-4 h-4 text-gray-400" />
                                    </button>
                                )}
                                {runStatus && (
                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${runStatus === 'completed' ? 'bg-green-900 text-green-300' :
                                        runStatus === 'failed' ? 'bg-red-900 text-red-300' :
                                            'bg-blue-900 text-blue-300'
                                        }`}>
                                        {runStatus === 'completed'
                                            ? t('workflowLogs.status.completed')
                                            : runStatus === 'failed'
                                              ? t('workflowLogs.status.failed')
                                              : runStatus === 'running'
                                                ? t('workflowLogs.status.running')
                                                : runStatus === 'pending'
                                                  ? t('workflowLogs.status.pending')
                                                  : runStatus === 'cancelled'
                                                    ? t('workflowLogs.status.cancelled')
                                                    : runStatus}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div 
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto space-y-4 p-3"
                        >
                            {logs.length === 0 ? (
                                <div className="text-gray-500 italic text-center py-8">
                                    {runningWorkflowId && (runStatus === 'running' || runStatus === 'pending') ? (
                                        <div>
                                            <div className="mb-2">{t('workflowLogs.status.pending')}...</div>
                                            <div className="text-xs text-gray-400">Wachten op logs van de workflow...</div>
                                        </div>
                                    ) : (
                                        t('workflowPage.noLogsAvailable')
                                    )}
                                </div>
                            ) : (
                                <>
                                    {logs.map((log, index) => (
                                        <LogBubble
                                            key={log.id || `log-${index}`}
                                            log={log}
                                            variant="inline"
                                            enableFadeOut={false}
                                            nextLog={index < logs.length - 1 ? logs[index + 1] : null}
                                        />
                                    ))}
                                </>
                            )}
                            {/* Auto-scroll anchor */}
                            <div ref={logEndRef} id="log-end" />
                        </div>
                    </div>

                    {/* Navigation Graph - Always displayed */}
                    <div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                {t('workflowPage.navigationGraph')}
                                {runningWorkflowId && (
                                    <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                        (Live voor run: {runningWorkflowId.substring(0, 8)}...)
                                    </span>
                                )}
                            </h3>
                            <div className="h-[600px] w-full">
                                {runningWorkflowId ? (
                                    <RealTimeGraphVisualizer
                                        runId={runningWorkflowId}
                                    />
                                ) : (
                                    <FullNavigationGraph />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Queue Management Panel - Display below navigation graph */}
                    <div>
                        <WorkflowQueuePanel 
                            ref={queuePanelRef}
                        />
                    </div>
                </div>
            </div>
            </>
            )}

            {/* Review Dialog */}
            {runningWorkflowId && currentWorkflowId && (
                <WorkflowReviewDialog
                    runId={runningWorkflowId}
                    workflowId={currentWorkflowId}
                    open={showReviewDialog}
                    onOpenChange={setShowReviewDialog}
                    onReviewComplete={() => {
                        setShowReviewDialog(false);
                        // Polling will automatically pick up the status change
                    }}
                />
            )}
        </div>
    );
}
