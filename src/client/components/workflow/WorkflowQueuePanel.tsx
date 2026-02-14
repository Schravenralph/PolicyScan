/**
 * WorkflowQueuePanel Component
 * 
 * Displays workflow queue jobs (waiting and active) with management actions:
 * - Pause active jobs
 * - Resume paused jobs
 * - Remove jobs from queue
 */

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Pause, Play, Trash2, Clock, Activity } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';

interface QueueJob {
    jobId: string;
    workflowId: string;
    runId?: string;
    status: 'waiting' | 'active' | 'paused';
    createdAt: string;
    startedAt?: string;
    params: Record<string, unknown>;
}

interface WorkflowQueuePanelProps {
    className?: string;
}

export interface WorkflowQueuePanelRef {
    refresh: () => Promise<void>;
}

const SAFETY_POLL_INTERVAL = 60000; // Poll every 60 seconds as a safety net (only if no events)

export const WorkflowQueuePanel = forwardRef<WorkflowQueuePanelRef, WorkflowQueuePanelProps>(
    ({ className = '' }, ref) => {
    const [jobs, setJobs] = useState<QueueJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

    const fetchJobs = useCallback(async (retryCount = 0) => {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second

        try {
            const response = await api.workflow.getWorkflowQueueJobs();
            setJobs(response.jobs || []);
            setError(null);
        } catch (err) {
            logError(err as Error, 'fetch-queue-jobs');
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch queue jobs';
            
            // Retry on transient failures (network errors, 5xx errors)
            const isTransientError = errorMessage.includes('network') || 
                                   errorMessage.includes('timeout') ||
                                   errorMessage.includes('ECONNREFUSED') ||
                                   (err instanceof Error && 'status' in err && typeof (err as any).status === 'number' && (err as any).status >= 500);
            
            if (isTransientError && retryCount < MAX_RETRIES) {
                // Retry after delay
                setTimeout(() => {
                    fetchJobs(retryCount + 1);
                }, RETRY_DELAY * (retryCount + 1)); // Exponential backoff
                return;
            }
            
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, []);


    // Expose refresh function via ref
    useImperativeHandle(ref, () => ({
        refresh: async () => {
            await fetchJobs(0);
        }
    }), [fetchJobs]);

    useEffect(() => {
        // Initial fetch
        fetchJobs();
    }, [fetchJobs]);

    // Set up minimal polling as a safety net (only if queue has jobs)
    // Most updates come from event-driven refreshes (button press, job completion)
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        // Only poll if there are jobs in the queue (safety net for missed events)
        const hasJobs = jobs.length > 0;
        if (hasJobs) {
            intervalRef.current = setInterval(() => {
                fetchJobs();
            }, SAFETY_POLL_INTERVAL);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchJobs, jobs]);

    // All workflows should be in the queue - no need to fetch active runs separately

    const handlePause = async (jobId: string) => {
        if (actionLoading.has(jobId)) return;
        
        setActionLoading(prev => new Set(prev).add(jobId));
        try {
            await api.workflow.pauseQueueJob(jobId);
            toast.success('Job gepauzeerd', 'De workflow job is gepauzeerd.');
            await fetchJobs(); // Refresh immediately
        } catch (err) {
            logError(err as Error, 'pause-queue-job');
            toast.error('Fout bij pauzeren', err instanceof Error ? err.message : 'Kon job niet pauzeren.');
        } finally {
            setActionLoading(prev => {
                const next = new Set(prev);
                next.delete(jobId);
                return next;
            });
        }
    };

    const handleResume = async (jobId: string) => {
        if (actionLoading.has(jobId)) return;
        
        setActionLoading(prev => new Set(prev).add(jobId));
        try {
            await api.workflow.resumeQueueJob(jobId);
            toast.success('Job hervat', 'De workflow job is hervat.');
            await fetchJobs(); // Refresh immediately
        } catch (err) {
            logError(err as Error, 'resume-queue-job');
            toast.error('Fout bij hervatten', err instanceof Error ? err.message : 'Kon job niet hervatten.');
        } finally {
            setActionLoading(prev => {
                const next = new Set(prev);
                next.delete(jobId);
                return next;
            });
        }
    };

    const handleRemove = async (jobId: string) => {
        if (actionLoading.has(jobId)) return;
        
        if (!confirm('Weet je zeker dat je deze job uit de queue wilt verwijderen?')) {
            return;
        }
        
        setActionLoading(prev => new Set(prev).add(jobId));
        try {
            await api.workflow.removeQueueJob(jobId);
            toast.success('Job verwijderd', 'De workflow job is uit de queue verwijderd.');
            // Remove from local state immediately for better UX
            setJobs(prev => prev.filter(j => j.jobId !== jobId));
            // Refresh to get updated state, but filter out the deleted jobId to prevent re-adding
            try {
                const response = await api.workflow.getWorkflowQueueJobs();
                setJobs((response.jobs || []).filter(j => j.jobId !== jobId));
                setError(null);
            } catch (fetchErr) {
                // If refresh fails, keep the optimistic update
                logError(fetchErr as Error, 'refresh-after-remove');
            }
        } catch (err) {
            const error = err as Error & { response?: { status?: number; data?: { reason?: string } } };
            const errorMessage = error instanceof Error ? error.message : 'Kon job niet verwijderen.';
            
            // Check if error indicates job was already deleted (409 Conflict with specific reasons)
            const isAlreadyDeleted = error.response?.status === 409 && (
                error.response.data?.reason === 'job_removal_failed' ||
                error.response.data?.reason === 'job_in_non_removable_state' ||
                errorMessage.includes('already been removed') ||
                errorMessage.includes('already removed') ||
                errorMessage.includes('could not be removed')
            );
            
            if (isAlreadyDeleted) {
                // Job was already deleted on server - remove from client state
                setJobs(prev => prev.filter(j => j.jobId !== jobId));
                toast.success('Job verwijderd', 'De workflow job was al verwijderd.');
            } else {
                logError(error, 'remove-queue-job');
                toast.error('Fout bij verwijderen', errorMessage);
            }
        } finally {
            setActionLoading(prev => {
                const next = new Set(prev);
                next.delete(jobId);
                return next;
            });
        }
    };


    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('nl-NL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const waitingJobs = jobs.filter(j => j.status === 'waiting');
    const activeJobs = jobs.filter(j => j.status === 'active');
    const pausedJobs = jobs.filter(j => j.status === 'paused');

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 ${className}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Workflow Queue
                </h3>
                <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {waitingJobs.length} wachtend
                    </span>
                    <span className="flex items-center gap-1">
                        <Activity className="w-4 h-4" />
                        {activeJobs.length} actief
                    </span>
                    {pausedJobs.length > 0 && (
                        <span className="flex items-center gap-1">
                            <Pause className="w-4 h-4" />
                            {pausedJobs.length} gepauzeerd
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p>Queue laden...</p>
                </div>
            ) : error ? (
                <div className="text-center py-8 text-red-500">
                    <p>Fout: {error}</p>
                    {error.includes('queue service') || error.includes('Queue service') ? (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            Workflow queue service is niet beschikbaar. Workflows moeten in de queue worden geplaatst voor uitvoering.
                        </p>
                    ) : null}
                    <button
                        onClick={() => fetchJobs(0)}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Opnieuw proberen
                    </button>
                </div>
            ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <p>Geen jobs in de queue</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Active Jobs */}
                    {activeJobs.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-green-600" />
                                Actieve Jobs ({activeJobs.length})
                            </h4>
                            <div className="space-y-2">
                                {activeJobs.map((job) => (
                                    <div
                                        key={job.jobId}
                                        className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {job.workflowId}
                                                </span>
                                                <span className="px-2 py-0.5 text-xs font-semibold bg-green-600 text-white rounded">
                                                    ACTIEF
                                                </span>
                                            </div>
                                            {job.runId && (
                                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                                    Run ID: {job.runId.substring(0, 8)}...
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                Gestart: {job.startedAt ? formatDate(job.startedAt) : 'Onbekend'}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handlePause(job.jobId)}
                                                disabled={actionLoading.has(job.jobId)}
                                                className="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded transition-colors disabled:opacity-50"
                                                title="Pauzeren"
                                            >
                                                <Pause className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(job.jobId)}
                                                disabled={actionLoading.has(job.jobId)}
                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                                title="Verwijderen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Paused Jobs */}
                    {pausedJobs.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                <Pause className="w-4 h-4 text-yellow-600" />
                                Gepauzeerde Jobs ({pausedJobs.length})
                            </h4>
                            <div className="space-y-2">
                                {pausedJobs.map((job) => (
                                    <div
                                        key={job.jobId}
                                        className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {job.workflowId}
                                                </span>
                                                <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-600 text-white rounded">
                                                    GEPAUZEERD
                                                </span>
                                            </div>
                                            {job.runId && (
                                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                                    Run ID: {job.runId.substring(0, 8)}...
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                Gepauzeerd: {job.startedAt ? formatDate(job.startedAt) : formatDate(job.createdAt)}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleResume(job.jobId)}
                                                disabled={actionLoading.has(job.jobId)}
                                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50"
                                                title="Hervatten"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemove(job.jobId)}
                                                disabled={actionLoading.has(job.jobId)}
                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                                title="Verwijderen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Waiting Jobs */}
                    {waitingJobs.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-600" />
                                Wachtende Jobs ({waitingJobs.length})
                            </h4>
                            <div className="space-y-2">
                                {waitingJobs.map((job) => (
                                    <div
                                        key={job.jobId}
                                        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {job.workflowId}
                                                </span>
                                                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded">
                                                    WACHTEND
                                                </span>
                                            </div>
                                            {job.runId && (
                                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                                    Run ID: {job.runId.substring(0, 8)}...
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                Aangemaakt: {formatDate(job.createdAt)}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleRemove(job.jobId)}
                                                disabled={actionLoading.has(job.jobId)}
                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                                title="Verwijderen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
    }
);
