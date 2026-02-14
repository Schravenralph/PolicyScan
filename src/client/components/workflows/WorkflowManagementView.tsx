import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, FileText, Share2, Users, Eye, Edit, Play, Crown } from 'lucide-react';
import { api, WorkflowDocument } from '../../services/api';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { logError } from '../../utils/errorHandler';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { CreateWorkflowDialog } from './CreateWorkflowDialog';
import { WorkflowDetailsDialog } from './WorkflowDetailsDialog';
import { StatusTransitionDialog } from './StatusTransitionDialog';
import { WorkflowSharingModal } from './WorkflowSharingModal';
import { useAuth } from '../../context/AuthContext';

type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';

const STATUS_COLORS: Record<WorkflowStatus, string> = {
    'Draft': 'bg-muted text-muted-foreground',
    'Testing': 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
    'Tested': 'bg-primary/10 text-primary',
    'Published': 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200',
    'Unpublished': 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
    'Deprecated': 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
};

type PermissionLevel = 'owner' | 'editor' | 'runner' | 'viewer';

interface WorkflowWithPermission extends WorkflowDocument {
    myPermission?: PermissionLevel | null;
}

const PERMISSION_ICONS: Record<PermissionLevel, React.ReactNode> & { [key: string]: React.ReactNode } = {
    owner: <Crown className="w-3 h-3 text-yellow-600" />,
    editor: <Edit className="w-3 h-3 text-blue-600" />,
    runner: <Play className="w-3 h-3 text-green-600" />,
    viewer: <Eye className="w-3 h-3 text-gray-600" />,
    null: null,
};

const PERMISSION_BADGE_COLORS: Record<PermissionLevel, string> & { [key: string]: string } = {
    owner: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    runner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    null: '',
};

export function WorkflowManagementView() {
    const { user } = useAuth();
    const [editingWorkflow, setEditingWorkflow] = useState<WorkflowWithPermission | null>(null);
    const [workflows, setWorkflows] = useState<WorkflowWithPermission[]>([]);
    const [sharedWorkflows, setSharedWorkflows] = useState<WorkflowWithPermission[]>([]);
    const [filteredWorkflows, setFilteredWorkflows] = useState<WorkflowWithPermission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDocument | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showDetailsDialog, setShowDetailsDialog] = useState(false);
    const [showStatusDialog, setShowStatusDialog] = useState(false);
    const [showSharingModal, setShowSharingModal] = useState(false);
    const [sharingWorkflowId, setSharingWorkflowId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'my-workflows' | 'shared-with-me'>('my-workflows');

    const loadWorkflows = useCallback(async () => {
        try {
            setIsLoading(true);
            // Always load all workflows - filtering is done on the frontend
            const data = await api.getManagedWorkflows();
            // Load permissions for each workflow
            const workflowsWithPermissions = await Promise.all(
                data.map(async (workflow) => {
                    try {
                        const permissions = await api.getWorkflowPermissions(workflow.id);
                        const myPermission: PermissionLevel | null = permissions.ownerId === user?._id 
                            ? 'owner' 
                            : (permissions.permissions.find(p => p.userId === user?._id)?.level as PermissionLevel | undefined) || null;
                        return { ...workflow, myPermission } as WorkflowWithPermission;
                    } catch {
                        // If permission check fails, assume owner if createdBy matches
                        const myPermission: PermissionLevel | null = workflow.createdBy === user?._id ? 'owner' : null;
                        return { 
                            ...workflow, 
                            myPermission 
                        } as WorkflowWithPermission;
                    }
                })
            );
            setWorkflows(workflowsWithPermissions);
        } catch (error) {
            logError(error, 'load-workflows');
            toast.error(t('workflowManagement.loadFailed'), t('common.tryAgainLater'));
        } finally {
            setIsLoading(false);
        }
    }, [user?._id]);

    const loadSharedWorkflows = useCallback(async () => {
        try {
            const data = await api.getSharedWorkflows();
            setSharedWorkflows(data as WorkflowWithPermission[]);
        } catch (error) {
            logError(error, 'load-shared-workflows');
            // Don't show error toast for shared workflows as it's optional
        }
    }, []);

    const filterWorkflows = useCallback(() => {
        const sourceWorkflows = activeTab === 'my-workflows' ? workflows : sharedWorkflows;
        let filtered = sourceWorkflows;

        if (statusFilter !== 'all') {
            // Treat null/undefined status as 'Published' (user wants all workflows considered published)
            filtered = filtered.filter(w => {
                const workflowStatus = w.status || 'Published';
                return workflowStatus === statusFilter;
            });
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(w =>
                w.name.toLowerCase().includes(query) ||
                w.description?.toLowerCase().includes(query) ||
                w.id.toLowerCase().includes(query)
            );
        }

        setFilteredWorkflows(filtered);
    }, [workflows, sharedWorkflows, statusFilter, searchQuery, activeTab]);

    useEffect(() => {
        loadWorkflows();
        loadSharedWorkflows();
    }, [loadWorkflows, loadSharedWorkflows]);

    useEffect(() => {
        filterWorkflows();
    }, [filterWorkflows]);

    const handleCreateWorkflow = async (workflowData: {
        id: string;
        name: string;
        description?: string;
        steps: Array<{
            id: string;
            name: string;
            action: string;
            params?: Record<string, unknown>;
            next?: string;
        }>;
    }) => {
        try {
            await api.createWorkflow(workflowData);
            toast.success(t('workflowManagement.created'), t('workflowManagement.createdDesc'));
            setShowCreateDialog(false);
            loadWorkflows();
            loadSharedWorkflows();
        } catch (error: unknown) {
            logError(error, 'create-workflow');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflowManagement.createFailed'), message);
        }
    };

    const handleEditWorkflow = async (workflowData: {
        id: string;
        name: string;
        description?: string;
        steps: Array<{
            id: string;
            name: string;
            action: string;
            params?: Record<string, unknown>;
            next?: string;
        }>;
    }) => {
        if (!editingWorkflow) {
            return;
        }

        try {
            // Validate workflow status (must be Draft or Testing)
            // Treat null status as Published (not editable)
            const workflowStatus = editingWorkflow.status || 'Published';
            if (workflowStatus !== 'Draft' && workflowStatus !== 'Testing') {
                toast.error(t('workflowManagement.cannotEdit'), t('workflowManagement.cannotEditDesc'));
                setEditingWorkflow(null);
                setShowCreateDialog(false);
                return;
            }

            // Validate permissions (must be owner or editor)
            if (editingWorkflow.myPermission !== 'owner' && editingWorkflow.myPermission !== 'editor') {
                toast.error(t('workflowManagement.permissionDenied'), t('workflowManagement.permissionDeniedDesc'));
                setEditingWorkflow(null);
                setShowCreateDialog(false);
                return;
            }

            await api.updateWorkflow(editingWorkflow.id, {
                name: workflowData.name,
                description: workflowData.description,
                steps: workflowData.steps,
            });
            toast.success(t('workflowManagement.updated'), t('workflowManagement.updatedDesc'));
            setEditingWorkflow(null);
            setShowCreateDialog(false);
            loadWorkflows();
            loadSharedWorkflows();
        } catch (error: unknown) {
            logError(error, 'update-workflow');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflowManagement.updateFailed'), message);
        }
    };

    const handleStatusChange = async (
        workflowId: string, 
        newStatus: WorkflowStatus, 
        comment?: string,
        runningInstanceBehavior?: 'complete' | 'cancel'
    ) => {
        try {
            const result = await api.updateWorkflowStatus(workflowId, newStatus, comment, runningInstanceBehavior);
            let message = t('workflowManagement.statusChanged').replace('{{status}}', newStatus);
            
            // Show info about running instances if they were handled
            if (result.runningInstancesHandled) {
                const { total, cancelled, completed } = result.runningInstancesHandled;
                if (total > 0) {
                    const instanceText = total === 1 ? t('workflowManagement.runningInstance') : t('workflowManagement.runningInstances').replace('{{count}}', String(total));
                    message += ` ${total} ${instanceText} `;
                    if (cancelled > 0 && completed > 0) {
                        message += `(${cancelled} ${t('workflowManagement.cancelled')}, ${completed} ${t('workflowManagement.allowedToComplete')})`;
                    } else if (cancelled > 0) {
                        message += t('workflowManagement.cancelled');
                    } else {
                        message += t('workflowManagement.willComplete');
                    }
                }
            }
            
            toast.success(t('workflowManagement.statusUpdated'), message);
            setShowStatusDialog(false);
            setSelectedWorkflow(null);
            loadWorkflows();
            loadSharedWorkflows();
        } catch (error: unknown) {
            logError(error, 'update-workflow-status');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflowManagement.statusUpdateFailed'), message);
        }
    };

    const handleDeleteWorkflow = async (workflow: WorkflowDocument) => {
        if (!confirm(t('workflowManagement.deleteConfirm').replace('{{name}}', workflow.name))) {
            return;
        }

        try {
            await api.deleteWorkflow(workflow.id);
            toast.success(t('workflowManagement.deleted'), t('workflowManagement.deletedDesc'));
            loadWorkflows();
            loadSharedWorkflows();
        } catch (error: unknown) {
            logError(error, 'delete-workflow');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflowManagement.deleteFailed'), message);
        }
    };

    const getValidNextStatuses = (currentStatus: WorkflowStatus | null | undefined): WorkflowStatus[] => {
        // Treat null/undefined status as 'Published' (user wants all workflows considered published)
        const status = currentStatus || 'Published';
        const transitions: Record<WorkflowStatus, WorkflowStatus[]> = {
            'Draft': ['Testing', 'Deprecated'],
            'Testing': ['Draft', 'Tested', 'Deprecated'],
            'Tested': ['Draft', 'Testing', 'Published', 'Deprecated'],
            'Published': ['Unpublished', 'Deprecated'],
            'Unpublished': ['Draft', 'Published', 'Deprecated'],
            'Deprecated': [],
        };
        return transitions[status] || [];
    };

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="text-gray-500">{t('workflowManagement.loading')}</div>
            </div>
        );
    }

    const handleShareClick = (workflowId: string) => {
        setSharingWorkflowId(workflowId);
        setShowSharingModal(true);
    };

    const handleSharingModalClose = () => {
        setShowSharingModal(false);
        setSharingWorkflowId(null);
        loadWorkflows();
        loadSharedWorkflows();
    };

    return (
        <div className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('workflowManagement.title')}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {t('workflowManagement.subtitle')}
                    </p>
                </div>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="w-4 h-4" />
                            {t('workflowManagement.createWorkflow')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingWorkflow ? t('workflowManagement.editWorkflow') : t('workflowManagement.createNewWorkflow')}</DialogTitle>
                        </DialogHeader>
                        <CreateWorkflowDialog
                            onSubmit={editingWorkflow ? handleEditWorkflow : handleCreateWorkflow}
                            onCancel={() => {
                                setShowCreateDialog(false);
                                setEditingWorkflow(null);
                            }}
                            initialData={editingWorkflow ? {
                                id: editingWorkflow.id,
                                name: editingWorkflow.name,
                                description: editingWorkflow.description,
                                steps: editingWorkflow.steps,
                            } : undefined}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Tabs for My Workflows and Shared with Me */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'my-workflows' | 'shared-with-me')} className="mb-6">
                <TabsList>
                    <TabsTrigger value="my-workflows">
                        <FileText className="w-4 h-4 mr-2" />
                        {t('workflowManagement.myWorkflows')} ({workflows.length})
                    </TabsTrigger>
                    <TabsTrigger value="shared-with-me">
                        <Users className="w-4 h-4 mr-2" />
                        {t('workflowManagement.sharedWithMe')} ({sharedWorkflows.length})
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Filters */}
            <div className="mb-6 flex gap-4 items-center">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder={t('workflowManagement.searchWorkflows')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={statusFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter('all')}
                    >
                        {t('workflowManagement.all')}
                    </Button>
                    {(['Draft', 'Testing', 'Tested', 'Published', 'Unpublished', 'Deprecated'] as WorkflowStatus[]).map((status) => (
                        <Button
                            key={status}
                            variant={statusFilter === status ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter(status)}
                        >
                            {status}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Workflow List */}
            {filteredWorkflows.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    {searchQuery || statusFilter !== 'all' ? t('workflowManagement.noWorkflowsMatchFilters') : t('workflowManagement.noWorkflowsYet')}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredWorkflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {workflow.name}
                                        </h3>
                                        {workflow.myPermission && (
                                            <Badge className={PERMISSION_BADGE_COLORS[workflow.myPermission]} variant="outline">
                                                <span className="flex items-center gap-1">
                                                    {PERMISSION_ICONS[workflow.myPermission]}
                                                    {workflow.myPermission}
                                                </span>
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {workflow.description || t('workflowManagement.noDescription')}
                                    </p>
                                </div>
                                <Badge className={STATUS_COLORS[workflow.status || 'Published']}>
                                    {workflow.status || 'Published'}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
                                <FileText className="w-4 h-4" />
                                <span>{workflow.steps.length} {t('workflowManagement.steps')}</span>
                                {workflow.version > 1 && (
                                    <>
                                        <span>•</span>
                                        <span>v{workflow.version}</span>
                                    </>
                                )}
                            </div>

                            {workflow.testMetrics && (
                                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-gray-600 dark:text-gray-400">{t('workflowManagement.testRuns')}:</span>
                                        <span className="font-medium">{workflow.testMetrics.runCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-gray-600 dark:text-gray-400">{t('workflowManagement.acceptance')}:</span>
                                        <span className="font-medium">{(workflow.testMetrics.acceptanceRate * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600 dark:text-gray-400">{t('workflowManagement.errorRate')}:</span>
                                        <span className="font-medium">{(workflow.testMetrics.errorRate * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setSelectedWorkflow(workflow);
                                        setShowDetailsDialog(true);
                                    }}
                                >
                                    <FileText className="w-4 h-4" />
                                    {t('workflowManagement.details')}
                                </Button>
                                {(workflow.myPermission === 'owner' || workflow.myPermission === 'editor') && (
                                    <>
                                        {((workflow.status || 'Published') === 'Draft' || (workflow.status || 'Published') === 'Testing') && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingWorkflow(workflow);
                                                    setShowCreateDialog(true);
                                                }}
                                            >
                                                <Edit className="w-4 h-4" />
                                                {t('common.edit')}
                                            </Button>
                                        )}
                                        {getValidNextStatuses(workflow.status || 'Published').length > 0 && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setSelectedWorkflow(workflow);
                                                    setShowStatusDialog(true);
                                                }}
                                            >
                                                {t('workflowManagement.changeStatus')}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleShareClick(workflow.id)}
                                        >
                                            <Share2 className="w-4 h-4" />
                                            {t('workflowManagement.share')}
                                        </Button>
                                    </>
                                )}
                                {workflow.myPermission === 'owner' && ((workflow.status || 'Published') === 'Draft' || (workflow.status || 'Published') === 'Deprecated') && (
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleDeleteWorkflow(workflow)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Dialogs */}
            {selectedWorkflow && (
                <>
                    <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                            <WorkflowDetailsDialog
                                workflow={selectedWorkflow}
                                onClose={() => {
                                    setShowDetailsDialog(false);
                                    setSelectedWorkflow(null);
                                }}
                            />
                        </DialogContent>
                    </Dialog>

                    <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('workflowManagement.changeStatus')}</DialogTitle>
                            </DialogHeader>
                            <StatusTransitionDialog
                                workflow={selectedWorkflow}
                                validNextStatuses={getValidNextStatuses(selectedWorkflow.status || 'Published')}
                                onSubmit={(newStatus, comment, runningInstanceBehavior) => {
                                    handleStatusChange(selectedWorkflow.id, newStatus, comment, runningInstanceBehavior);
                                }}
                                onCancel={() => {
                                    setShowStatusDialog(false);
                                    setSelectedWorkflow(null);
                                }}
                            />
                        </DialogContent>
                    </Dialog>
                </>
            )}

            {/* Sharing Modal */}
            {sharingWorkflowId && (
                <WorkflowSharingModal
                    workflowId={sharingWorkflowId}
                    isOpen={showSharingModal}
                    onClose={handleSharingModalClose}
                />
            )}
        </div>
    );
}

