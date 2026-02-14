import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { History, User, Calendar, RotateCcw, AlertTriangle, Package, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api, WorkflowDocument } from '../../services/api';
import { WorkflowSharingModal } from './WorkflowSharingModal';
import { toast } from '../../utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { logError } from '../../utils/errorHandler';
import { WorkflowQualityGatesSection } from './WorkflowQualityGatesSection';
import { WorkflowTestMetricsSection } from './WorkflowTestMetricsSection';
import { WorkflowStepsSection } from './WorkflowStepsSection';
import { WorkflowActionsSection } from './WorkflowActionsSection';
import { t, translateStatus } from '../../utils/i18n';

type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';

interface WorkflowDetailsDialogProps {
    workflow: WorkflowDocument;
    onClose: () => void;
}

const STATUS_COLORS: Record<WorkflowStatus, string> = {
    'Draft': 'bg-muted text-muted-foreground',
    'Testing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'Tested': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Published': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Unpublished': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'Deprecated': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function WorkflowDetailsDialog({ workflow, onClose }: WorkflowDetailsDialogProps) {
    const [showSharingModal, setShowSharingModal] = useState(false);
    const [showRollbackDialog, setShowRollbackDialog] = useState(false);
    const [selectedRollbackVersion, setSelectedRollbackVersion] = useState<number | null>(null);
    const [rollbackComment, setRollbackComment] = useState('');
    const [rollbackPreview, setRollbackPreview] = useState<{
        currentVersion: number;
        targetVersion: number;
        changes: Array<{
            field: string;
            current: unknown;
            previous: unknown;
        }>;
        warnings: string[];
    } | null>(null);
    const [qualityGates, setQualityGates] = useState<{ passed: boolean; reasons: string[] } | null>(null);
    const [history, setHistory] = useState<{
        id: string;
        name: string;
        version: number;
        statusHistory: Array<{
            status: string;
            timestamp: string;
            userId?: string;
            comment?: string;
        }>;
        publishedBy?: string;
        publishedAt?: string;
        testMetrics?: {
            runCount: number;
            acceptanceRate: number;
            errorRate: number;
            lastTestRun?: string;
        };
    } | null>(null);
    const [versionHistory, setVersionHistory] = useState<Array<{
        version: number;
        status: string;
        publishedBy?: string;
        publishedAt?: string;
        changes?: string[];
    }>>([]);
    const [loadingQualityGates, setLoadingQualityGates] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [loadingRollback, setLoadingRollback] = useState(false);
    const [modules, setModules] = useState<Array<{
        id: string;
        name: string;
        description: string;
        category: string;
        usedInSteps: Array<{ stepId: string; stepName: string; params?: Record<string, unknown> }>;
    }>>([]);
    const [loadingModules, setLoadingModules] = useState(false);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [isDuplicating, setIsDuplicating] = useState(false);

    const loadQualityGates = useCallback(async () => {
        try {
            setLoadingQualityGates(true);
            const result = await api.checkQualityGates(workflow.id);
            setQualityGates(result);
        } catch (error) {
            logError(error, 'load-quality-gates');
        } finally {
            setLoadingQualityGates(false);
        }
    }, [workflow.id]);

    const loadHistory = useCallback(async () => {
        try {
            setLoadingHistory(true);
            const data = await api.getWorkflowHistory(workflow.id);
            setHistory(data);
        } catch (error) {
            logError(error, 'load-workflow-history');
        } finally {
            setLoadingHistory(false);
        }
    }, [workflow.id]);

    const loadVersionHistory = useCallback(async () => {
        try {
            setLoadingVersions(true);
            const data = await api.getVersionHistory(workflow.id, { limit: 50 });
            setVersionHistory(data.versions || []);
        } catch (error) {
            logError(error, 'load-version-history');
        } finally {
            setLoadingVersions(false);
        }
    }, [workflow.id]);

    const loadModules = useCallback(async () => {
        try {
            setLoadingModules(true);
            const allModules = await api.getWorkflowModules();
            
            // Map workflow steps to modules
            const moduleMap = new Map<string, {
                id: string;
                name: string;
                description: string;
                category: string;
                usedInSteps: Array<{ stepId: string; stepName: string; params?: Record<string, unknown> }>;
            }>();

            // Find which modules are used in this workflow
            for (const step of workflow.steps) {
                const stepAction = String(step.action || '').toLowerCase();
                
                // Try to find matching module
                for (const module of allModules.modules || []) {
                    const moduleId = String(module.metadata?.id || '').toLowerCase();
                    if (stepAction === moduleId || stepAction.includes(moduleId)) {
                        const moduleIdKey = module.metadata?.id || step.action;
                        if (!moduleMap.has(moduleIdKey)) {
                            moduleMap.set(moduleIdKey, {
                                id: moduleIdKey,
                                name: module.metadata?.name || step.name,
                                description: module.metadata?.description || '',
                                category: module.metadata?.category || 'unknown',
                                usedInSteps: [],
                            });
                        }
                        const moduleInfo = moduleMap.get(moduleIdKey)!;
                        moduleInfo.usedInSteps.push({
                            stepId: step.id,
                            stepName: step.name,
                            params: step.params,
                        });
                        break;
                    }
                }
            }

            setModules(Array.from(moduleMap.values()));
        } catch (error) {
            logError(error, 'load-modules');
        } finally {
            setLoadingModules(false);
        }
    }, [workflow.steps]);

    const handlePreviewRollback = async (version: number) => {
        try {
            const preview = await api.previewRollback(workflow.id, version);
            setRollbackPreview(preview);
            setSelectedRollbackVersion(version);
        } catch (error) {
            logError(error, 'preview-rollback');
            toast.error(t('toastMessages.failedToPreviewRollback'), error instanceof Error ? error.message : t('toastMessages.pleaseTryAgain'));
        }
    };

    const handleRollback = async () => {
        if (!selectedRollbackVersion) return;

        if (!confirm(t('workflowDetails.confirmRollback').replace('{{version}}', String(selectedRollbackVersion)))) {
            return;
        }

        try {
            setLoadingRollback(true);
            await api.rollbackWorkflow(workflow.id, selectedRollbackVersion, rollbackComment || undefined);
            toast.success(t('toastMessages.workflowRolledBack'), t('workflowDetails.workflowRolledBackMessage').replace('{{version}}', String(selectedRollbackVersion)));
            setShowRollbackDialog(false);
            setSelectedRollbackVersion(null);
            setRollbackComment('');
            setRollbackPreview(null);
            // Reload data
            loadHistory();
            loadVersionHistory();
            // Close dialog and reload parent
            onClose();
            window.location.reload(); // Simple way to refresh the workflow list
        } catch (error) {
            logError(error, 'rollback-workflow');
            toast.error(t('toastMessages.failedToRollback'), error instanceof Error ? error.message : t('toastMessages.pleaseTryAgain'));
        } finally {
            setLoadingRollback(false);
        }
    };

    const handleExportWorkflow = () => {
        try {
            const exportData = {
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                steps: workflow.steps,
                version: workflow.version,
                status: workflow.status,
                exportedAt: new Date().toISOString(),
            };
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow-${workflow.id}-${workflow.version}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(t('toastMessages.workflowExported'), t('workflowDetails.workflowExportedMessage'));
        } catch (error) {
            logError(error, 'export-workflow');
            toast.error(t('toastMessages.failedToExport'), error instanceof Error ? error.message : t('toastMessages.pleaseTryAgain'));
        }
    };

    const handleCopyWorkflow = async () => {
        try {
            setIsDuplicating(true);
            const duplicateName = `${workflow.name} (Copy)`;
            const duplicateId = `${workflow.id}-copy-${Date.now()}`;
            
            await api.createWorkflow({
                id: duplicateId,
                name: duplicateName,
                description: workflow.description,
                steps: workflow.steps,
            });
            
            toast.success(t('toastMessages.workflowDuplicated'), t('workflowDetails.workflowDuplicatedMessage').replace('{{name}}', duplicateName));
            onClose();
            // Reload parent to show new workflow
            window.location.reload();
        } catch (error) {
            logError(error, 'duplicate-workflow');
            toast.error(t('toastMessages.failedToDuplicate'), error instanceof Error ? error.message : t('toastMessages.pleaseTryAgain'));
        } finally {
            setIsDuplicating(false);
        }
    };

    const toggleModuleExpansion = (moduleId: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(moduleId)) {
                next.delete(moduleId);
            } else {
                next.add(moduleId);
            }
            return next;
        });
    };

    useEffect(() => {
        loadQualityGates();
        loadHistory();
        loadModules();
        if (workflow.version > 1) {
            loadVersionHistory();
        }
    }, [workflow.id, workflow.version, loadQualityGates, loadHistory, loadModules, loadVersionHistory]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-foreground">{workflow.name}</h3>
                    <Badge className={STATUS_COLORS[workflow.status]}>
                        {translateStatus(workflow.status)}
                    </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{workflow.description || t('workflowDetails.noDescription')}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>ID: {workflow.id}</span>
                    <span>Version: {workflow.version}</span>
                </div>
            </div>

            {/* Quality Gates */}
            {workflow.status === 'Tested' && (
                <WorkflowQualityGatesSection
                    qualityGates={qualityGates}
                    loading={loadingQualityGates}
                    testMetrics={workflow.testMetrics}
                />
            )}

            {/* Test Metrics */}
            {workflow.testMetrics && workflow.status !== 'Tested' && (
                <WorkflowTestMetricsSection testMetrics={workflow.testMetrics} />
            )}

            {/* Workflow Steps */}
            <WorkflowStepsSection steps={workflow.steps} />

            {/* Modules Used (US-006: Module Reuse Tracking) */}
            <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    {t('workflowDetails.modulesUsed')} ({modules.length})
                </h4>
                {loadingModules ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('workflowDetails.loadingModules')}
                    </div>
                ) : modules.length === 0 ? (
                    <div className="text-sm text-gray-500 italic">
                        {t('workflowDetails.noModulesDetected')}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {modules.map((module) => {
                            const isExpanded = expandedModules.has(module.id);
                            return (
                                <div key={module.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => toggleModuleExpansion(module.id)}
                                                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                                    aria-label={isExpanded ? t('common.collapse') : t('common.expand')}
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4" />
                                                    )}
                                                </button>
                                                <div className="font-medium text-gray-900 dark:text-white">{module.name}</div>
                                                <Badge variant="secondary" className="text-xs">
                                                    {module.category}
                                                </Badge>
                                            </div>
                                            {module.description && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                                                    {module.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 ml-6">
                                        {t(module.usedInSteps.length === 1 ? 'workflowDetails.usedInSteps_one' : 'workflowDetails.usedInSteps_other').replace('{{count}}', String(module.usedInSteps.length))}
                                    </div>
                                    {isExpanded && (
                                        <div className="mt-3 ml-6 space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                            {module.usedInSteps.map((step) => (
                                                <div key={step.stepId} className="p-2 bg-background rounded border border-border">
                                                    <div className="font-medium text-gray-900 dark:text-white mb-1">{step.stepName}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                        {t('workflowDetails.stepId')}: {step.stepId}
                                                    </div>
                                                    {step.params && Object.keys(step.params).length > 0 && (
                                                        <div className="mt-2">
                                                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('workflowDetails.parameters')}:</div>
                                                            <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                                                                <pre className="whitespace-pre-wrap break-words">
                                                                    {JSON.stringify(step.params, null, 2)}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Status History */}
            {history && (
                <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <History className="w-5 h-5" />
                        {t('workflowDetails.statusHistory')}
                    </h4>
                {loadingHistory ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('common.loading')}
                    </div>
                ) : (
                        <div className="space-y-2">
                            {history.statusHistory?.map((entry, index: number) => (
                                <div key={index} className="flex items-center gap-3 text-sm">
                                    <Badge className={STATUS_COLORS[entry.status as WorkflowStatus]}>
                                        {entry.status}
                                    </Badge>
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </span>
                                    {entry.userId && (
                                        <span className="text-gray-500 dark:text-gray-500 text-xs">
                                            {t('workflowDetails.by')} {entry.userId}
                                        </span>
                                    )}
                                    {entry.comment && (
                                        <span className="text-gray-500 dark:text-gray-500 text-xs italic">
                                            - {entry.comment}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Version History with Rollback */}
            {workflow.version > 1 && (
                <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <History className="w-5 h-5" />
                            {t('workflowDetails.versionHistory')}
                        </h4>
                        <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    {t('workflowDetails.rollback')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{t('workflowDetails.rollbackWorkflow')}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {t('workflowDetails.selectVersionToRollback')}
                                        </label>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {loadingVersions ? (
                                                <div className="text-sm text-gray-500">{t('workflowDetails.loadingVersions')}</div>
                                            ) : versionHistory.length > 0 ? (
                                                versionHistory
                                                    .filter(v => v.version < workflow.version)
                                                    .map((version) => (
                                                        <label
                                                            key={version.version}
                                                            className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                                                                selectedRollbackVersion === version.version
                                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="rollback-version"
                                                                value={version.version}
                                                                checked={selectedRollbackVersion === version.version}
                                                                onChange={() => handlePreviewRollback(version.version)}
                                                                className="mt-1 mr-3"
                                                            />
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <Badge>v{version.version}</Badge>
                                                                    <Badge className={STATUS_COLORS[version.status as WorkflowStatus]}>
                                                                        {version.status}
                                                                    </Badge>
                                                                </div>
                                                                {version.publishedAt && (
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                        {t('workflowDetails.published')}: {new Date(version.publishedAt).toLocaleString()}
                                                                    </div>
                                                                )}
                                                                {version.publishedBy && (
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                        {t('workflowDetails.by')}: {version.publishedBy}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </label>
                                                    ))
                                            ) : (
                                                <div className="text-sm text-gray-500">{t('workflowDetails.noPreviousVersions')}</div>
                                            )}
                                        </div>
                                    </div>

                                    {rollbackPreview && (
                                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                                    {t('workflowDetails.rollbackPreview')}
                                                </span>
                                            </div>
                                            <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                                                <div>{t('workflowDetails.currentVersion')}: {rollbackPreview.currentVersion}</div>
                                                <div>{t('workflowDetails.targetVersion')}: {rollbackPreview.targetVersion}</div>
                                                {rollbackPreview.warnings.length > 0 && (
                                                    <div className="mt-2">
                                                        <div className="font-medium">{t('workflowDetails.warnings')}:</div>
                                                        <ul className="list-disc list-inside">
                                                            {rollbackPreview.warnings.map((warning, idx) => (
                                                                <li key={idx}>{warning}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {rollbackPreview.changes.length > 0 && (
                                                    <div className="mt-2">
                                                        <div className="font-medium">{t('workflowDetails.changes')}:</div>
                                                        <ul className="list-disc list-inside">
                                                            {rollbackPreview.changes.map((change, idx) => (
                                                                <li key={idx}>
                                                                    {change.field}: {String(change.current)} → {String(change.previous)}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('workflowDetails.commentOptional')}
                                        </label>
                                        <textarea
                                            value={rollbackComment}
                                            onChange={(e) => setRollbackComment(e.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                                            placeholder={t('workflowDetails.rollbackNotePlaceholder')}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t">
                                        <Button variant="outline" onClick={() => {
                                            setShowRollbackDialog(false);
                                            setSelectedRollbackVersion(null);
                                            setRollbackComment('');
                                            setRollbackPreview(null);
                                        }}>
                                            {t('common.cancel')}
                                        </Button>
                                        <Button
                                            onClick={handleRollback}
                                            disabled={!selectedRollbackVersion || loadingRollback}
                                        >
                                            {loadingRollback ? t('workflowDetails.rollingBack') : t('workflowDetails.rollbackToVersion')}
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    {loadingVersions ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('workflowDetails.loadingVersionHistory')}
                        </div>
                    ) : versionHistory.length > 0 ? (
                        <div className="space-y-2">
                            {versionHistory.map((version) => (
                                <div key={version.version} className="flex items-center gap-3 text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                    <Badge>v{version.version}</Badge>
                                    <Badge className={STATUS_COLORS[version.status as WorkflowStatus]}>
                                        {version.status}
                                    </Badge>
                                    {version.publishedAt && (
                                        <span className="text-gray-600 dark:text-gray-400">
                                            {new Date(version.publishedAt).toLocaleString()}
                                        </span>
                                    )}
                                    {version.publishedBy && (
                                        <span className="text-gray-500 dark:text-gray-500 text-xs">
                                            {t('workflowDetails.by')} {version.publishedBy}
                                        </span>
                                    )}
                                    {version.version === workflow.version && (
                                        <Badge variant="outline" className="ml-auto">{t('workflowDetails.current')}</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500">{t('workflowDetails.noVersionHistory')}</div>
                    )}
                </div>
            )}

            {/* Published Info */}
            {workflow.publishedBy && workflow.publishedAt && (
                <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <User className="w-5 h-5" />
                        {t('workflowDetails.publicationInfo')}
                    </h4>
                    <div className="text-sm space-y-1">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <User className="w-4 h-4" />
                            {t('workflowDetails.publishedBy')}: {workflow.publishedBy}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Calendar className="w-4 h-4" />
                            {t('workflowDetails.publishedAt')}: {new Date(workflow.publishedAt).toLocaleString()}
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <WorkflowActionsSection
                onExport={handleExportWorkflow}
                onDuplicate={handleCopyWorkflow}
                onShare={() => setShowSharingModal(true)}
                onClose={onClose}
                isDuplicating={isDuplicating}
            />

            {/* Sharing Modal */}
            <WorkflowSharingModal
                workflowId={workflow.id}
                isOpen={showSharingModal}
                onClose={() => setShowSharingModal(false)}
            />
        </div>
    );
}

