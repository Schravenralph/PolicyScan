import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { t, TranslationKey } from '../utils/i18n';
import type { ErrorDetail } from '../services/api/ErrorMonitoringApiService';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ErrorDetailModalProps {
    errorId: string | null;
    onClose: () => void;
    onResolve?: () => void;
}

export function ErrorDetailModal({ errorId, onClose, onResolve }: ErrorDetailModalProps) {
    const [error, setError] = useState<ErrorDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [resolving, setResolving] = useState(false);

    const fetchErrorDetails = useCallback(async () => {
        if (!errorId) return;

        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await api.errorMonitoring.getErrorById(errorId);
            setError(response as ErrorDetail);
        } catch (err) {
            logError(err, 'fetch-error-details');
            setErrorMessage(err instanceof Error ? err.message : t('errorDetail.failedFetch'));
        } finally {
            setLoading(false);
        }
    }, [errorId]);

    useEffect(() => {
        if (errorId) {
            fetchErrorDetails();
        }
    }, [errorId, fetchErrorDetails]);

    async function handleResolve() {
        if (!errorId || !error) return;

        setResolving(true);
        try {
            await api.errorMonitoring.resolveError(errorId);
            if (onResolve) {
                onResolve();
            }
            // Refresh error details to show updated status
            await fetchErrorDetails();
        } catch (err) {
            logError(err, 'resolve-error');
            setErrorMessage(err instanceof Error ? err.message : t('errorDetail.failedResolve'));
        } finally {
            setResolving(false);
        }
    }

    const isOpen = !!errorId;
    const modalRef = useFocusTrap(isOpen, onClose);

    if (!errorId) return null;

    const severityColors: Record<string, string> = {
        critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800',
        error: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800',
        warning: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800',
    };

    const componentColors: Record<string, string> = {
        scraper: 'bg-primary/10 text-primary',
        workflow: 'bg-purple-100 dark:bg-purple-950/30 text-purple-800 dark:text-purple-200',
        api: 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200',
        frontend: 'bg-pink-100 dark:bg-pink-950/30 text-pink-800 dark:text-pink-200',
        database: 'bg-indigo-100 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200',
        other: 'bg-muted text-muted-foreground',
    };

    return (
        <div 
            className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
            onClick={(e) => {
                // Close on backdrop click
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="error-detail-title"
        >
            <div 
                ref={modalRef}
                className="bg-white border-primary rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border-2"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 id="error-detail-title" className="text-xl font-semibold text-foreground">{t('errorDetail.title')}</h2>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-red-800 text-sm">{errorMessage}</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="space-y-6">
                            {/* Error Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.severity')}</label>
                                    <div className="mt-1">
                                        <span
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${severityColors[String(error.severity)] || 'bg-gray-100 text-gray-800 border-gray-300'}`}
                                        >
                                            {t(`errorDetail.severity.${error.severity}` as TranslationKey)}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.component')}</label>
                                    <div className="mt-1">
                                        <span
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${componentColors[String(error.component)] || 'bg-gray-100 text-gray-800'}`}
                                        >
                                            {t(`errorDetail.component.${error.component}` as TranslationKey)}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.status')}</label>
                                    <div className="mt-1">
                                        <span
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                                error.status === 'resolved'
                                                    ? 'bg-green-100 text-green-800'
                                                    : error.status === 'ignored'
                                                    ? 'bg-gray-100 text-gray-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                            }`}
                                        >
                                            {t(`errorDetail.status.${error.status}` as TranslationKey)}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.occurrences')}</label>
                                    <div className="mt-1 text-sm text-gray-900">{error.occurrence_count}</div>
                                </div>
                            </div>

                            {/* Process and Location Context */}
                            {((error.metadata?.process_name !== undefined && error.metadata?.process_name !== null) || 
                              (error.metadata?.file_path !== undefined && error.metadata?.file_path !== null) || 
                              (error.metadata?.request_path !== undefined && error.metadata?.request_path !== null)) && (
                                <div className="grid grid-cols-2 gap-4">
                                    {(error.metadata?.process_name !== undefined && error.metadata?.process_name !== null) && (
                                        <div>
                                            <label className="text-sm font-medium text-gray-500">{t('errorDetail.process')}</label>
                                            <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                                {String(error.metadata.process_name)}
                                            </div>
                                        </div>
                                    )}
                                    {(error.metadata?.file_path !== undefined && error.metadata?.file_path !== null) && (
                                        <div>
                                            <label className="text-sm font-medium text-gray-500">{t('errorDetail.fileLocation')}</label>
                                            <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                                {String(error.metadata.file_path)}
                                                {error.metadata.file_line !== undefined && (
                                                    <span className="text-gray-600">
                                                        :{String(error.metadata.file_line)}
                                                        {error.metadata.file_column !== undefined && `:${String(error.metadata.file_column)}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {(error.metadata?.request_path !== undefined && error.metadata?.request_path !== null) && (
                                        <div>
                                            <label className="text-sm font-medium text-gray-500">{t('errorDetail.request')}</label>
                                            <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                                {String(error.metadata.request_method || 'GET')} {String(error.metadata.request_path)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Error Message */}
                            <div>
                                <label className="text-sm font-medium text-gray-500">{t('errorDetail.errorMessage')}</label>
                                <div className="mt-1 p-3 bg-gray-50 rounded-md border border-gray-200">
                                    <p className="text-sm text-gray-900 font-mono whitespace-pre-wrap break-words">
                                        {error.message}
                                    </p>
                                </div>
                            </div>

                            {/* Stack Trace */}
                            {error.stack_trace && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.stackTrace')}</label>
                                    <div className="mt-1 p-3 bg-gray-900 rounded-md border border-gray-700 overflow-x-auto">
                                        <pre className="text-xs text-gray-100 whitespace-pre-wrap break-words">
                                            {error.stack_trace}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Timestamps */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.firstSeen')}</label>
                                    <div className="mt-1 text-sm text-gray-900">
                                        {new Date(error.first_seen).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.lastSeen')}</label>
                                    <div className="mt-1 text-sm text-gray-900">
                                        {new Date(error.last_seen).toLocaleString()}
                                    </div>
                                </div>
                                {error.resolved_at && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-500">{t('errorDetail.resolvedAt')}</label>
                                        <div className="mt-1 text-sm text-gray-900">
                                            {new Date(error.resolved_at).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            {error.metadata && Object.keys(error.metadata).length > 0 && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500">{t('errorDetail.additionalInfo')}</label>
                                    <div className="mt-1 p-3 bg-gray-50 rounded-md border border-gray-200">
                                        <pre className="text-xs text-gray-900 whitespace-pre-wrap break-words">
                                            {JSON.stringify(error.metadata, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Error ID */}
                            <div>
                                <label className="text-sm font-medium text-gray-500">{t('errorDetail.errorId')}</label>
                                <div className="mt-1 text-sm text-gray-900 font-mono">{error.error_id}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <a
                        href="/admin?tab=errors"
                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                        {t('errorDetail.viewDashboard')}
                    </a>
                    <div className="flex gap-3">
                        {error && error.status === 'open' && (
                            <button
                                onClick={handleResolve}
                                disabled={resolving}
                                className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-md hover:bg-green-700 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {resolving ? t('errorDetail.resolving') : t('errorDetail.markResolved')}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

