import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Play, Pause, Square } from 'lucide-react';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { translateWorkflowName } from '../utils/logTranslations';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { TimeoutErrorDisplay } from '../components/errors/TimeoutErrorDisplay';
import { parseTimeoutError } from '../utils/timeoutErrorParser';

interface Run {
    _id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    startTime: string;
    endTime?: string;
    params: {
        workflowName?: string;
        queryId?: string;
        onderwerp?: string;
        [key: string]: unknown;
    };
    error?: string;
}

export function RunsPage() {
    const [runs, setRuns] = useState<Run[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadRuns();
        // Poll for updates every 5 seconds
        const interval = setInterval(loadRuns, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadRuns = async () => {
        try {
            const data = await api.workflow.getRecentRuns(100);
            // Ensure data is an array before setting it
            if (Array.isArray(data)) {
                setRuns(data as Run[]);
                setError(null);
            } else {
                logError(new Error('Invalid response format'), 'load-runs');
                setRuns([]);
                setError('Invalid response format from server');
            }
        } catch (error) {
            logError(error, 'load-runs');
            setRuns([]);
            setError(error instanceof Error ? error.message : 'Failed to load runs');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'failed':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'running':
                return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
            case 'paused':
                return <Pause className="w-5 h-5 text-yellow-500" />;
            case 'cancelled':
                return <Square className="w-5 h-5 text-gray-500" />;
            default:
                return <AlertCircle className="w-5 h-5 text-gray-400" />;
        }
    };

    const handlePauseRun = async (runId: string) => {
        try {
            await api.workflow.pauseRun(runId);
            toast.success(t('runsPage.runPaused'), 'De workflow run is gepauzeerd.');
            loadRuns(); // Refresh to show updated status
        } catch (error) {
            logError(error, 'pause-run');
            toast.error(t('runsPage.failedToPause'), 'Probeer het opnieuw.');
        }
    };

    const handleResumeRun = async (runId: string) => {
        try {
            await api.workflow.resumeRun(runId);
            toast.success(t('runsPage.runResumed'), 'De workflow run is hervat.');
            loadRuns(); // Refresh to show updated status
        } catch (error) {
            logError(error, 'resume-run');
            toast.error(t('runsPage.failedToResume'), 'Probeer het opnieuw.');
        }
    };

    const handleStopRun = async (runId: string) => {
        let retryDelay = 1000; // Start with 1 second
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                await api.workflow.cancelRun(runId);
                toast.success(t('runsPage.runStopped'), 'De workflow run is geannuleerd.');
                loadRuns(); // Refresh to show updated status
                return; // Success, exit retry loop
            } catch (error: unknown) {
                // Check if it's a rate limit error (429)
                const isRateLimit = error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429;
                
                if (isRateLimit && attempt < maxRetries - 1) {
                    // Rate limited - retry with exponential backoff
                    retryDelay = Math.min(retryDelay * 2, 10000); // Max 10 seconds
                    console.warn(`Rate limited (429). Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                
                // If we've exhausted retries, show error
                logError(error, 'stop-run');
                toast.error(t('runsPage.failedToStop'), 'Probeer het opnieuw.');
                return;
            }
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('nl-NL');
    };

    const getDuration = (start: string, end?: string) => {
        if (!end) return t('runsPage.running');
        const duration = new Date(end).getTime() - new Date(start).getTime();
        return `${(duration / 1000).toFixed(1)}s`;
    };

    if (isLoading) {
        return <div className="p-8">{t('runsPage.loading')}</div>;
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">{t('runsPage.error')} {error}</p>
                    <button
                        onClick={loadRuns}
                        className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        {t('runsPage.retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">{t('runsPage.title')}</h2>
                <p className="text-gray-500">{t('runsPage.description')}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.status')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.scanType')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.startTime')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.duration')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.details')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('runsPage.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {runs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    {t('runsPage.noRunsFound')}
                                </td>
                            </tr>
                        ) : (
                            runs.map((run) => (
                                <tr key={run._id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(run.status)}
                                            <span className="capitalize text-sm text-gray-900">{run.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                            {run.params?.workflowName || run.params?.queryId ? 'Beleidsscan' : run.type}
                                        </div>
                                        {run.params?.onderwerp && (
                                            <div className="text-sm text-gray-500">
                                                {t('runsPage.topic')} {run.params.onderwerp}
                                            </div>
                                        )}
                                        {run.params?.workflowName && (
                                            <div className="text-sm text-gray-500">
                                                {translateWorkflowName(run.params.workflowName)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(run.startTime)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {getDuration(run.startTime, run.endTime)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {run.error ? (() => {
                                            const timeoutError = parseTimeoutError(run.error);
                                            if (timeoutError) {
                                                return (
                                                    <div className="max-w-md">
                                                        <TimeoutErrorDisplay
                                                            error={timeoutError}
                                                            onRetry={() => {
                                                                // Retry logic could be added here
                                                                toast.info('Retry functionality', 'To retry this workflow, please start a new run.');
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }
                                            return (
                                                <span className="text-red-600 truncate max-w-xs block" title={run.error}>
                                                    {run.error}
                                                </span>
                                            );
                                        })() : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {(run.status === 'running' || run.status === 'paused') && (
                                            <div className="flex items-center gap-2">
                                                {run.status === 'paused' ? (
                                                    <button
                                                        onClick={() => handleResumeRun(run._id)}
                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title={t('runsPage.resume')}
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handlePauseRun(run._id)}
                                                        className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                                        title={t('runsPage.pause')}
                                                    >
                                                        <Pause className="w-4 h-4 fill-current" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleStopRun(run._id)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title={t('runsPage.stop')}
                                                >
                                                    <Square className="w-4 h-4 fill-current" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
