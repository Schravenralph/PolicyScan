/**
 * WorkflowList Component
 * 
 * Displays a list of workflow cards with inputs and execution controls.
 */

import { useState } from 'react';
import { Play } from 'lucide-react';
import { t } from '../../utils/i18n';
import { WORKFLOWS } from '../../config/constants';
import { WORKFLOW_LABELS } from '../../config/workflowLabels';

interface Workflow {
    id: string;
    name: string;
    description: string;
    steps: unknown[];
}

interface WorkflowListProps {
    workflows: Workflow[];
    workflowsError: Error | null;
    workflowsLoading: boolean;
    currentWorkflowId: string | null;
    runStatus: string | null;
    runningWorkflowId: string | null;
    onRunWorkflow: (id: string, params: Record<string, unknown>) => Promise<void>;
    onResumeWorkflow: () => void;
    onPauseWorkflow: () => void;
    onStopWorkflow: () => void;
    onRefetchWorkflows: () => void;
}

export function WorkflowList({
    workflows,
    workflowsError,
    workflowsLoading,
    currentWorkflowId,
    runStatus,
    runningWorkflowId,
    onRunWorkflow,
    onResumeWorkflow,
    onPauseWorkflow,
    onStopWorkflow,
    onRefetchWorkflows,
}: WorkflowListProps) {
    const [inputValues, setInputValues] = useState<Record<string, Record<string, string>>>({});

    const handleInputChange = (workflowId: string, field: string, value: string) => {
        setInputValues(prev => ({
            ...prev,
            [workflowId]: {
                ...prev[workflowId],
                [field]: value
            }
        }));
    };

    return (
        <div className="lg:col-span-1 space-y-6">
            {/* Error message if workflows failed to load */}
            {workflowsError && workflows.length === 0 && !workflowsLoading && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                            <span className="text-red-600 dark:text-red-400 text-xl">⚠️</span>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                                {t('workflowList.loadError')}
                            </h3>
                            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                                {workflowsError.message || t('workflowList.loadErrorDesc')}
                            </p>
                            <button
                                onClick={onRefetchWorkflows}
                                className="text-sm px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                                {t('common.retry')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Empty state when no workflows and no error */}
            {!workflowsError && workflows.length === 0 && !workflowsLoading && (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
                    <p className="text-gray-600 dark:text-gray-400">
                        {t('workflowList.noWorkflows')}
                    </p>
                    <button
                        onClick={onRefetchWorkflows}
                        className="mt-3 text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                        {t('common.refresh')}
                    </button>
                </div>
            )}
            
            {workflows.map((workflow, index) => {
                const labels = WORKFLOW_LABELS[workflow.id];
                const localizedName = labels ? t(labels.nameKey) : workflow.name;
                const localizedDescription = labels ? t(labels.descriptionKey) : workflow.description;
                const workflowInputs = inputValues[workflow.id] || {};

                const isSubjectRequired = workflow.id.startsWith(WORKFLOWS.BELEIDSSCAN_STEP_PREFIX) ||
                                          WORKFLOWS.REQUIRING_ONDERWERP.includes(workflow.id as typeof WORKFLOWS.REQUIRING_ONDERWERP[number]);
                const isSubjectEmpty = !workflowInputs.subject?.trim();
                const isActionDisabled = isSubjectRequired && isSubjectEmpty;
                const randomnessValue = workflowInputs.randomness ?? '0.3';

                // Use a composite key to ensure uniqueness even if IDs somehow duplicate
                const uniqueKey = `workflow-${workflow.id}-${index}`;

                return (
                    <div key={uniqueKey} data-testid={`workflow-card-${workflow.id}`} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow p-6">
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
                                        <label htmlFor={`query-${workflow.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('workflowPage.semanticTarget')}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={t('workflowPage.semanticTargetPlaceholder')}
                                            className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                            id={`query-${workflow.id}`}
                                            data-testid={`iplo-semantic-target-input`}
                                            value={workflowInputs.query || ''}
                                            onChange={(e) => handleInputChange(workflow.id, 'query', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`randomness-${workflow.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('workflowPage.explorationRandomness')}
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            className="w-full"
                                            id={`randomness-${workflow.id}`}
                                            data-testid={`iplo-randomness-input`}
                                            value={randomnessValue}
                                            onChange={(e) => handleInputChange(workflow.id, 'randomness', e.target.value)}
                                        />
                                        <div className="flex justify-between text-[10px] text-gray-500">
                                            <span>{t('workflowPage.focused')}</span>
                                            <span>{t('workflowPage.chaotic')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Workflow Inputs - Subject and Location (for workflows requiring onderwerp) */}
                            {isSubjectRequired && (
                                <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <div>
                                        <label htmlFor={`subject-${workflow.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('workflowPage.subjectLabel')}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={t('workflowPage.subjectPlaceholder')}
                                            className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                            id={`subject-${workflow.id}`}
                                            data-testid={`subject-input-${workflow.id}`}
                                            value={workflowInputs.subject || ''}
                                            onChange={(e) => handleInputChange(workflow.id, 'subject', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`location-${workflow.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('workflowPage.locationLabel')}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={t('workflowPage.locationPlaceholder')}
                                            className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white"
                                            id={`location-${workflow.id}`}
                                            data-testid={`location-input-${workflow.id}`}
                                            value={workflowInputs.location || ''}
                                            onChange={(e) => handleInputChange(workflow.id, 'location', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        // Build params based on workflow type
                                        const params: Record<string, unknown> = {};
                                        
                                        if (workflow.id === 'iplo-exploration') {
                                            params.query = workflowInputs.query;
                                            params.randomness = parseFloat(randomnessValue);
                                        } else if (isSubjectRequired) {
                                            // For workflows requiring onderwerp, use onderwerp and overheidsinstantie
                                            // Trim and validate that onderwerp is not empty
                                            const onderwerpValue = workflowInputs.subject?.trim();
                                            if (onderwerpValue) {
                                                params.onderwerp = onderwerpValue;
                                                params.query = onderwerpValue; // Also set query for compatibility
                                            }
                                            const locationValue = workflowInputs.location?.trim();
                                            if (locationValue) {
                                                params.overheidsinstantie = locationValue;
                                            }
                                        }

                                        onRunWorkflow(workflow.id, params);
                                    }}
                                    disabled={isActionDisabled}
                                    data-testid={`workflow-run-button-${workflow.id}`}
                                    className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors ${
                                        isActionDisabled
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
    );
}

