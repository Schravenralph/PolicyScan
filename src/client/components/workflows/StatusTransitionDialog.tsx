import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { WorkflowDocument, api } from '../../services/api';
import { AlertCircle, Loader2 } from 'lucide-react';
import { logError } from '../../utils/errorHandler';
import { t, translateStatus } from '../../utils/i18n';

type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';

interface StatusTransitionDialogProps {
    workflow: WorkflowDocument;
    validNextStatuses: WorkflowStatus[];
    onSubmit: (newStatus: WorkflowStatus, comment?: string, runningInstanceBehavior?: 'complete' | 'cancel') => void;
    onCancel: () => void;
}

const STATUS_DESCRIPTIONS: Record<WorkflowStatus, string> = {
    'Draft': t('workflowStatusDescription.draft'),
    'Testing': t('workflowStatusDescription.testing'),
    'Tested': t('workflowStatusDescription.tested'),
    'Published': t('workflowStatusDescription.published'),
    'Unpublished': t('workflowStatusDescription.unpublished'),
    'Deprecated': t('workflowStatusDescription.deprecated'),
};

export function StatusTransitionDialog({
    workflow,
    validNextStatuses,
    onSubmit,
    onCancel,
}: StatusTransitionDialogProps) {
    const [selectedStatus, setSelectedStatus] = useState<WorkflowStatus | null>(null);
    const [comment, setComment] = useState('');
    const [runningInstanceBehavior, setRunningInstanceBehavior] = useState<'complete' | 'cancel'>('complete');
    const [runningInstances, setRunningInstances] = useState<Array<{ _id: string; status: string; startTime: string }>>([]);
    const [loadingRunningInstances, setLoadingRunningInstances] = useState(false);

    const loadRunningInstances = useCallback(async () => {
        setLoadingRunningInstances(true);
        try {
            const instances = await api.getRunningInstances(workflow.id);
            setRunningInstances(instances);
        } catch (error) {
            logError(error, 'load-running-instances');
            // Don't block the UI if we can't load running instances
        } finally {
            setLoadingRunningInstances(false);
        }
    }, [workflow.id]);

    // Check if we're unpublishing/deprecating and load running instances
    useEffect(() => {
        const isUnpublishing = selectedStatus === 'Unpublished' || selectedStatus === 'Deprecated';
        const isPublished = workflow.status === 'Published';
        
        if (isUnpublishing && isPublished) {
            loadRunningInstances();
        } else {
            setRunningInstances([]);
        }
    }, [selectedStatus, workflow.status, loadRunningInstances]);

    const handleSubmit = () => {
        if (!selectedStatus) {
            alert(t('statusTransition.pleaseSelectStatus'));
            return;
        }

        // Check quality gates if publishing
        if (selectedStatus === 'Published') {
            // Quality gates will be checked server-side, but we can warn here
            if (!workflow.testMetrics || workflow.testMetrics.runCount < 3) {
                if (!confirm(t('statusTransition.publishWithoutQualityGates'))) {
                    return;
                }
            }
        }

        // Pass runningInstanceBehavior only if unpublishing/deprecating
        const behavior = (selectedStatus === 'Unpublished' || selectedStatus === 'Deprecated') 
            ? runningInstanceBehavior 
            : undefined;

        onSubmit(selectedStatus, comment || undefined, behavior);
    };

    return (
        <div className="space-y-4">
            <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {t('statusTransition.currentStatus')} <Badge>{translateStatus(workflow.status)}</Badge>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('statusTransition.selectNewStatus')}
                </p>
            </div>

            <div className="space-y-2">
                {validNextStatuses.map((status) => (
                    <label
                        key={status}
                        className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedStatus === status
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
                        }`}
                    >
                        <input
                            type="radio"
                            name="status"
                            value={status}
                            checked={selectedStatus === status}
                            onChange={() => setSelectedStatus(status)}
                            className="mt-1 mr-3"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Badge>{translateStatus(status)}</Badge>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                {STATUS_DESCRIPTIONS[status]}
                            </p>
                        </div>
                    </label>
                ))}
            </div>

            {selectedStatus && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('statusTransition.commentOptional')}
                    </label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                        placeholder={t('statusTransition.commentPlaceholder')}
                        rows={3}
                    />
                </div>
            )}

            {selectedStatus === 'Published' && workflow.testMetrics && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                        {t('statusTransition.qualityGatesCheck')}
                    </p>
                    <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                        <li>
                            {workflow.testMetrics.runCount >= 3 ? '✓' : '✗'} {t('statusTransition.minimumTestRuns')} {workflow.testMetrics.runCount}
                        </li>
                        <li>
                            {workflow.testMetrics.acceptanceRate >= 0.7 ? '✓' : '✗'} {t('statusTransition.acceptanceRate')} {(workflow.testMetrics.acceptanceRate * 100).toFixed(0)}%
                        </li>
                        <li>
                            {workflow.testMetrics.errorRate < 0.1 ? '✓' : '✗'} {t('statusTransition.errorRate')} {(workflow.testMetrics.errorRate * 100).toFixed(0)}%
                        </li>
                    </ul>
                </div>
            )}

            {/* Running Instances Warning */}
            {(selectedStatus === 'Unpublished' || selectedStatus === 'Deprecated') && workflow.status === 'Published' && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <div className="flex items-start gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                                {t('statusTransition.runningInstances')}
                            </p>
                            {loadingRunningInstances ? (
                                <div className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-300">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {t('statusTransition.checkingRunningInstances')}
                                </div>
                            ) : runningInstances.length > 0 ? (
                                <>
                                    <p className="text-xs text-orange-700 dark:text-orange-300 mb-2">
                                        {runningInstances.length === 1 
                                            ? t('statusTransition.activeInstancesSingular').replace('{{count}}', String(runningInstances.length))
                                            : t('statusTransition.activeInstancesPlural').replace('{{count}}', String(runningInstances.length))}
                                    </p>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-xs">
                                            <input
                                                type="radio"
                                                name="runningInstanceBehavior"
                                                value="complete"
                                                checked={runningInstanceBehavior === 'complete'}
                                                onChange={() => setRunningInstanceBehavior('complete')}
                                                className="text-orange-600"
                                            />
                                            <span className="text-orange-700 dark:text-orange-300">
                                                {t('statusTransition.letInstancesComplete')}
                                            </span>
                                        </label>
                                        <label className="flex items-center gap-2 text-xs">
                                            <input
                                                type="radio"
                                                name="runningInstanceBehavior"
                                                value="cancel"
                                                checked={runningInstanceBehavior === 'cancel'}
                                                onChange={() => setRunningInstanceBehavior('cancel')}
                                                className="text-orange-600"
                                            />
                                            <span className="text-orange-700 dark:text-orange-300">
                                                {t('statusTransition.cancelAllInstances')}
                                            </span>
                                        </label>
                                    </div>
                                </>
                            ) : (
                                <p className="text-xs text-orange-700 dark:text-orange-300">
                                    {t('statusTransition.noRunningInstances')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onCancel}>
                    {t('common.cancel')}
                </Button>
                <Button onClick={handleSubmit} disabled={!selectedStatus}>
                    {t('statusTransition.changeStatus')}
                </Button>
            </div>
        </div>
    );
}

