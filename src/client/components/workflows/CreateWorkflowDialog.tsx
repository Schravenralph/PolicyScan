import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../ui/button';
import { Plus, Trash2, Settings } from 'lucide-react';
import { api } from '../../services/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { WorkflowInfoForm } from './WorkflowInfoForm';
import { ParameterInputRenderer } from './ParameterInputRenderer';
import { CategoryFilterButtons } from './CategoryFilterButtons';
import { WorkflowActionButtons } from './WorkflowActionButtons';

interface WorkflowStep {
    id: string;
    name: string;
    action: string;
    params?: Record<string, unknown>;
    next?: string;
    moduleId?: string; // Track which module was used
}

interface WorkflowModule {
    id: string;
    name: string;
    description: string;
    category: string;
    defaultParams: Record<string, unknown>;
    parameterSchema: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        label: string;
        description?: string;
        required?: boolean;
        default?: unknown;
        options?: Array<{ value: string | number; label: string }>;
        validation?: {
            min?: number;
            max?: number;
            pattern?: string;
        };
    }>;
}

interface CreateWorkflowDialogProps {
    onSubmit: (workflow: {
        id: string;
        name: string;
        description?: string;
        steps: WorkflowStep[];
    }) => void;
    onCancel: () => void;
    initialData?: {
        id: string;
        name: string;
        description?: string;
        steps: WorkflowStep[];
    };
}

export function CreateWorkflowDialog({ onSubmit, onCancel, initialData }: CreateWorkflowDialogProps) {
    const [id, setId] = useState(initialData?.id || '');
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [steps, setSteps] = useState<WorkflowStep[]>(initialData?.steps || []);
    const [modules, setModules] = useState<WorkflowModule[]>([]);
    const [isLoadingModules, setIsLoadingModules] = useState(true);
    const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const hasMatchedModulesRef = useRef<string | null>(null);

    const loadModules = useCallback(async () => {
        try {
            setIsLoadingModules(true);
            const response = await api.getWorkflowModules();
            // Map API response to WorkflowModule format
            // The API returns { modules: [...] } or an array directly
            const modulesArray = Array.isArray(response) 
                ? response 
                : (response.modules || []);
            
            // Ensure all required fields are present and properly typed
            // Handle both flat structure and nested metadata structure
            interface ApiModule {
              id?: string;
              name?: string;
              description?: string;
              category?: string;
              defaultParams?: Record<string, unknown>;
              parameterSchema?: Record<string, unknown>;
              metadata?: ApiModule;
            }
            const mappedModules: WorkflowModule[] = modulesArray.map((module: ApiModule) => {
                // Handle nested metadata structure from /api/workflows/modules
                const metadata = module.metadata || module;
                return {
                    id: metadata.id || module.id || '',
                    name: metadata.name || module.name || '',
                    description: metadata.description || module.description || '',
                    category: metadata.category || module.category || 'uncategorized',
                    defaultParams: module.defaultParams || {},
                    parameterSchema: (module.parameterSchema || {}) as Record<string, {
                        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
                        label: string;
                        description?: string;
                        required?: boolean;
                        default?: unknown;
                        options?: Array<{ value: string | number; label: string }>;
                        validation?: {
                            min?: number;
                            max?: number;
                            pattern?: string;
                        };
                    }>,
                };
            });
            
            setModules(mappedModules);
        } catch (error) {
            logError(error, 'load-modules');
        } finally {
            setIsLoadingModules(false);
        }
    }, []);

    useEffect(() => {
        loadModules();
    }, [loadModules]);

    // Auto-match modules when editing a workflow (US-006: Module parameter persistence)
    useEffect(() => {
        // Reset ref if initialData changes
        if (initialData?.id !== hasMatchedModulesRef.current) {
            hasMatchedModulesRef.current = initialData?.id || null;
        }
        
        // Only run when modules are loaded and initialData is provided
        if (!initialData || modules.length === 0 || initialData.steps.length === 0) {
            return;
        }

        // Match existing steps to modules
        const updatedSteps = initialData.steps.map((step) => {
            if (step.moduleId) {
                // Already matched
                return step;
            }
            
            // Try to find matching module by action
            const stepAction = String(step.action || '').toLowerCase();
            const matchedModule = modules.find(m => {
                const moduleId = String(m.id || '').toLowerCase();
                return stepAction === moduleId || stepAction.includes(moduleId);
            });
            
            if (matchedModule) {
                // Auto-match the module
                return {
                    ...step,
                    moduleId: matchedModule.id,
                };
            }
            
            return step;
        });
        
        // Check if any steps were actually updated
        const hasChanges = updatedSteps.some((step, index) => {
            const originalStep = initialData.steps[index];
            return step.moduleId !== originalStep?.moduleId;
        });
        
        if (hasChanges) {
            setSteps(updatedSteps);
        }
    }, [modules, initialData]);

    const getFilteredModules = () => {
        if (categoryFilter === 'all') return modules;
        return modules.filter(m => m.category === categoryFilter);
    };

    const getCategories = () => {
        const categories = new Set(modules.map(m => m.category).filter((cat): cat is string => Boolean(cat)));
        return Array.from(categories).sort();
    };

    const addStep = () => {
        const newStepId = `step-${steps.length + 1}`;
        setSteps([...steps, { id: newStepId, name: '', action: '', next: '' }]);
        setExpandedStepIndex(steps.length); // Expand the new step
    };

    const removeStep = (index: number) => {
        setSteps(prev => prev.filter((_, i) => i !== index));
        if (expandedStepIndex === index) {
            setExpandedStepIndex(null);
        } else if (expandedStepIndex !== null && expandedStepIndex > index) {
            setExpandedStepIndex(prev => prev !== null ? prev - 1 : null);
        }
    };

    const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        setSteps(newSteps);
    };

    const selectModule = (index: number, moduleId: string) => {
        const module = modules.find(m => m.id === moduleId);
        if (!module) return;

        const step = steps[index];
        const defaultParams = { ...module.defaultParams };
        
        // Auto-populate step name and action from module
        // The action should match the module ID exactly (backend validates using moduleRegistry.get(step.action))
        updateStep(index, {
            moduleId: module.id,
            name: module.name,
            action: module.id, // Use module ID directly as action
            params: { ...step.params, ...defaultParams },
        });
        
        // Expand step to show parameters
        setExpandedStepIndex(index);
    };

    const updateStepParam = (stepIndex: number, paramKey: string, value: unknown) => {
        const step = steps[stepIndex];
        const currentParams = step.params || {};
        updateStep(stepIndex, {
            params: {
                ...currentParams,
                [paramKey]: value,
            },
        });
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!id || !name || steps.length === 0) {
            toast.error(t('workflow.create.validationFailed'), t('workflow.create.validationFailedDesc'));
            return;
        }

        // Validate steps
        for (const step of steps) {
            if (!step.id || !step.name || !step.action) {
                toast.error(t('workflow.create.validationFailed'), t('workflow.create.stepValidationFailed').replace('{{stepId}}', step.id || 'unknown'));
                return;
            }
        }

        // Auto-link steps sequentially if next is not set
        const linkedSteps = steps.map((step, index) => {
            const cleaned: WorkflowStep = {
                id: step.id,
                name: step.name,
                action: step.action,
            };
            
            // Set next step automatically if not specified and not last step
            if (!step.next && index < steps.length - 1) {
                cleaned.next = steps[index + 1].id;
            } else if (step.next && step.next.trim()) {
                cleaned.next = step.next;
            }
            
            // Include params if they exist and are not empty
            if (step.params && Object.keys(step.params).length > 0) {
                // Filter out undefined/null values
                const filteredParams: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(step.params)) {
                    if (value !== undefined && value !== null && value !== '') {
                        filteredParams[key] = value;
                    }
                }
                if (Object.keys(filteredParams).length > 0) {
                    cleaned.params = filteredParams;
                }
            }
            
            return cleaned;
        });

        onSubmit({
            id,
            name,
            description: description || undefined,
            steps: linkedSteps,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <WorkflowInfoForm
                id={id}
                name={name}
                description={description}
                onIdChange={setId}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                isEditing={!!initialData}
            />

            <div>
                <div className="flex items-center justify-between mb-2">
                    <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('workflow.workflowModules')} <span className="text-red-500">*</span>
                    </Label>
                    <Button type="button" size="sm" variant="outline" onClick={addStep}>
                        <Plus className="w-4 h-4 mr-1" />
                        {t('workflow.addModule')}
                    </Button>
                </div>

                {/* Category Filter */}
                <CategoryFilterButtons
                    categories={getCategories()}
                    selectedCategory={categoryFilter}
                    onCategoryChange={setCategoryFilter}
                />

                <div className="space-y-3">
                    {steps.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">
                            <p>{t('workflow.noModulesAdded')}</p>
                        </div>
                    ) : (
                        steps.map((step, index) => {
                            const module = step.moduleId ? modules.find(m => m.id === step.moduleId) : null;
                            const isExpanded = expandedStepIndex === index;
                            
                            return (
                                <div key={index} className="p-4 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {t('workflow.step')} {index + 1}
                                                </span>
                                                {module && (
                                                    <Badge variant="secondary">{module.category}</Badge>
                                                )}
                                            </div>
                                            {module && (
                                                <p className="text-xs text-gray-500">{module.description}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {module && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setExpandedStepIndex(isExpanded ? null : index)}
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Button>
                                            )}
                                            {steps.length > 1 && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => removeStep(index)}
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <Label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                {t('workflow.selectModule')} <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={step.moduleId || ''}
                                                onValueChange={(value) => selectModule(index, value)}
                                                disabled={isLoadingModules}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={isLoadingModules ? t('workflow.loadingModules') : t('workflow.chooseModule')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {getFilteredModules().map(mod => (
                                                        <SelectItem key={mod.id} value={mod.id}>
                                                            <div>
                                                                <div className="font-medium">{mod.name}</div>
                                                                <div className="text-xs text-gray-500">{mod.description}</div>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {module && isExpanded && (
                                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
                                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {t('workflow.moduleParameters')}
                                                </h4>
                                                {Object.entries(module.parameterSchema).map(([paramKey, paramDef]) => {
                                                    const currentValue = step.params?.[paramKey];
                                                    return (
                                                        <div key={paramKey}>
                                                            <ParameterInputRenderer
                                                                stepIndex={index}
                                                                paramKey={paramKey}
                                                                paramDef={paramDef}
                                                                value={currentValue}
                                                                onValueChange={updateStepParam}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                                {Object.keys(module.parameterSchema).length === 0 && (
                                                    <p className="text-xs text-gray-500">{t('workflow.noConfigurableParameters')}</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Manual override fields (hidden when module is selected) */}
                                        {!module && (
                                            <>
                                                <div>
                                                    <Label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                        {t('workflow.stepId')} <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Input
                                                        type="text"
                                                        value={step.id}
                                                        onChange={(e) => updateStep(index, { id: e.target.value })}
                                                        placeholder={t('workflow.stepIdPlaceholder')}
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                        {t('workflow.stepName')} <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Input
                                                        type="text"
                                                        value={step.name}
                                                        onChange={(e) => updateStep(index, { name: e.target.value })}
                                                        placeholder={t('workflow.stepNamePlaceholder')}
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                        {t('workflow.action')} <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Input
                                                        type="text"
                                                        value={step.action}
                                                        onChange={(e) => updateStep(index, { action: e.target.value })}
                                                        placeholder={t('workflow.stepActionPlaceholder')}
                                                        required
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <WorkflowActionButtons
                onCancel={onCancel}
                isEditing={!!initialData}
            />
        </form>
    );
}
