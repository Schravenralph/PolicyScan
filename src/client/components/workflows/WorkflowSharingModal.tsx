import { useState, useEffect, useCallback } from 'react';
import { Share2, UserPlus, X, Trash2, Edit, Eye, Play, Crown, Users, Globe, Lock, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useAuth } from '../../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { logError } from '../../utils/errorHandler';

type PermissionLevel = 'owner' | 'editor' | 'runner' | 'viewer';
type Visibility = 'private' | 'team' | 'public';

interface Permission {
    userId?: string;
    teamId?: string;
    level: PermissionLevel;
    grantedBy: string;
    grantedAt: string;
    userName?: string;
    userEmail?: string;
}

interface WorkflowPermissions {
    workflowId: string;
    ownerId: string;
    visibility: Visibility;
    permissions: Permission[];
}

interface ActivityLogEntry {
    timestamp: string;
    userId: string;
    userName?: string;
    action: string;
    details?: string;
}

interface WorkflowSharingModalProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
}

import type { TranslationKey } from '../../utils/i18n';

// Permission labels will be translated in component using t() function
const getPermissionLabels = (t: (key: TranslationKey) => string): Record<PermissionLevel, { label: string; icon: React.ReactNode; description: string }> => ({
    owner: { label: t('workflow.permissionLevels.owner'), icon: <Crown className="w-4 h-4" />, description: t('workflow.permissionLevels.ownerDesc') },
    editor: { label: t('workflow.permissionLevels.editor'), icon: <Edit className="w-4 h-4" />, description: t('workflow.permissionLevels.editorDesc') },
    runner: { label: t('workflow.permissionLevels.runner'), icon: <Play className="w-4 h-4" />, description: t('workflow.permissionLevels.runnerDesc') },
    viewer: { label: t('workflow.permissionLevels.viewer'), icon: <Eye className="w-4 h-4" />, description: t('workflow.permissionLevels.viewerDesc') },
});

// Visibility labels will be translated in component using t() function
const getVisibilityLabels = (t: (key: TranslationKey) => string): Record<Visibility, { label: string; icon: React.ReactNode; description: string }> => ({
    private: { label: t('workflow.visibility.private'), icon: <Lock className="w-4 h-4" />, description: t('workflow.visibility.privateDesc') },
    team: { label: t('workflow.visibility.team'), icon: <Users className="w-4 h-4" />, description: t('workflow.visibility.teamDesc') },
    public: { label: t('workflow.visibility.public'), icon: <Globe className="w-4 h-4" />, description: t('workflow.visibility.publicDesc') },
});

export function WorkflowSharingModal({ workflowId, isOpen, onClose }: WorkflowSharingModalProps) {
    const { user } = useAuth();
    const [permissions, setPermissions] = useState<WorkflowPermissions | null>(null);
    const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [shareUserId, setShareUserId] = useState('');
    const [shareLevel, setShareLevel] = useState<PermissionLevel>('viewer');
    const [activeTab, setActiveTab] = useState<'permissions' | 'activity'>('permissions');
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [transferUserId, setTransferUserId] = useState('');
    
    // Get translated labels
    const PERMISSION_LABELS = getPermissionLabels(t);
    const VISIBILITY_LABELS = getVisibilityLabels(t);

    const loadPermissions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.getWorkflowPermissions(workflowId);
            setPermissions({
                ...data,
                permissions: data.permissions.map(p => ({
                    ...p,
                    level: p.level as PermissionLevel
                }))
            });
        } catch (error) {
            logError(error, 'load-permissions');
            toast.error(t('workflow.loadPermissionsFailed'), t('common.tryAgainLater'));
        } finally {
            setIsLoading(false);
        }
    }, [workflowId]);

    const loadActivityLog = useCallback(async () => {
        try {
            const data = await api.getWorkflowActivity(workflowId);
            setActivityLog(data);
        } catch (error) {
            logError(error, 'load-activity-log');
        }
    }, [workflowId]);

    useEffect(() => {
        if (isOpen) {
            loadPermissions();
            loadActivityLog();
        }
    }, [isOpen, workflowId, loadPermissions, loadActivityLog]);

    const handleShare = async () => {
        if (!shareUserId.trim()) {
            toast.error(t('workflow.userIdRequired'), t('workflow.userIdRequiredDesc'));
            return;
        }

        try {
            await api.shareWorkflow(workflowId, shareUserId, undefined, shareLevel);
            toast.success(t('workflow.sharedSuccess'), `${t('workflow.sharedSuccess')} met ${shareUserId} als ${PERMISSION_LABELS[shareLevel].label}.`);
            setShareUserId('');
            setShareLevel('viewer');
            loadPermissions();
            loadActivityLog();
        } catch (error) {
            logError(error, 'share-workflow');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflow.shareFailed'), message);
        }
    };

    const handleRemoveAccess = async (userId: string) => {
        if (!confirm(t('admin.confirmRemoveAccess'))) {
            return;
        }

        try {
            await api.removeWorkflowAccess(workflowId, userId);
            toast.success(t('workflow.accessRemovedSuccess'), t('workflow.accessRemovedSuccess'));
            loadPermissions();
            loadActivityLog();
        } catch (error) {
            logError(error, 'remove-workflow-access');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflow.removeAccessFailed'), message);
        }
    };

    const handleUpdatePermission = async (userId: string, level: PermissionLevel) => {
        try {
            await api.updateWorkflowPermission(workflowId, userId, level);
            toast.success(t('workflow.permissionUpdatedSuccess'), `${t('workflow.permissionUpdatedSuccess')} naar ${PERMISSION_LABELS[level].label}.`);
            loadPermissions();
            loadActivityLog();
        } catch (error) {
            logError(error, 'update-workflow-permission');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflow.updatePermissionFailed'), message);
        }
    };

    const handleUpdateVisibility = async (visibility: Visibility) => {
        try {
            await api.updateWorkflowVisibility(workflowId, visibility);
            toast.success(t('workflow.visibilityUpdatedSuccess'), `${t('workflow.visibilityUpdatedSuccess')} naar ${VISIBILITY_LABELS[visibility].label}.`);
            loadPermissions();
            loadActivityLog();
        } catch (error) {
            logError(error, 'update-workflow-visibility');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflow.updateVisibilityFailed'), message);
        }
    };

    const handleTransferOwnership = async () => {
        if (!transferUserId.trim()) {
            toast.error(t('workflow.userIdRequired'), t('workflow.userIdRequiredDesc'));
            return;
        }

        if (!confirm(t('workflow.transferOwnershipConfirm').replace('{{userId}}', transferUserId))) {
            return;
        }

        try {
            await api.transferWorkflowOwnership(workflowId, transferUserId);
            toast.success(t('workflow.ownershipTransferred'), t('workflow.ownershipTransferredDesc').replace('{{userId}}', transferUserId));
            setTransferUserId('');
            setShowTransferDialog(false);
            loadPermissions();
            loadActivityLog();
        } catch (error) {
            logError(error, 'transfer-workflow-ownership');
            const message = error instanceof Error ? error.message : t('common.tryAgainLater');
            toast.error(t('workflow.transferOwnershipFailed'), message);
        }
    };

    const isOwner = permissions?.ownerId === user?._id;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border-primary rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border-2">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Share2 className="w-5 h-5 text-muted-foreground" />
                        <h2 className="text-xl font-semibold text-foreground">{t('workflow.shareTitle')}</h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">{t('workflow.loading')}</div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'permissions' | 'activity')}>
                            <TabsList className="mb-6">
                                <TabsTrigger value="permissions">{t('workflow.permissions')}</TabsTrigger>
                                <TabsTrigger value="activity">{t('workflow.activityLog')}</TabsTrigger>
                            </TabsList>

                            <TabsContent value="permissions" className="space-y-6">
                                {/* Visibility Settings */}
                                {isOwner && (
                                    <div className="space-y-4">
                                        <Label>{t('workflow.visibility')}</Label>
                                        <div className="flex gap-2">
                                            {(['private', 'team', 'public'] as Visibility[]).map((vis) => {
                                                const label = VISIBILITY_LABELS[vis];
                                                return (
                                                    <Button
                                                        key={vis}
                                                        variant={permissions?.visibility === vis ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => handleUpdateVisibility(vis)}
                                                        className="flex items-center gap-2"
                                                    >
                                                        {label.icon}
                                                        {label.label}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {VISIBILITY_LABELS[permissions?.visibility || 'private'].description}
                                        </p>
                                    </div>
                                )}

                                {/* Share with User */}
                                {isOwner && (
                                    <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                                        <Label>{t('workflow.shareWithUser')}</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder={t('workflow.userPlaceholder')}
                                                value={shareUserId}
                                                onChange={(e) => setShareUserId(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Select value={shareLevel} onValueChange={(v) => setShareLevel(v as PermissionLevel)}>
                                                <SelectTrigger className="w-40">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.entries(PERMISSION_LABELS).map(([level, label]) => (
                                                        <SelectItem key={level} value={level}>
                                                            <div className="flex items-center gap-2">
                                                                {label.icon}
                                                                {label.label}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button onClick={handleShare}>
                                                <UserPlus className="w-4 h-4" />
                                                {t('workflow.share')}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Current Permissions */}
                                <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                                    <div className="flex items-center justify-between">
                                        <Label>{t('workflow.currentPermissions')}</Label>
                                        {isOwner && (
                                            <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        <ArrowRight className="w-4 h-4 mr-2" />
                                                        {t('workflow.transferOwnership')}
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>{t('workflow.transferWorkflowOwnership')}</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <Label>{t('workflow.newOwnerLabel')}</Label>
                                                            <Input
                                                                placeholder={t('workflow.userPlaceholder')}
                                                                value={transferUserId}
                                                                onChange={(e) => setTransferUserId(e.target.value)}
                                                                className="mt-2"
                                                            />
                                                        </div>
                                                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                                                            <strong>{t('workflow.note')}:</strong> {t('workflow.transferOwnershipNote')}
                                                        </div>
                                                        <div className="flex justify-end gap-3">
                                                            <Button variant="outline" onClick={() => {
                                                                setShowTransferDialog(false);
                                                                setTransferUserId('');
                                                            }}>
                                                                {t('common.cancel')}
                                                            </Button>
                                                            <Button onClick={handleTransferOwnership} disabled={!transferUserId.trim()}>
                                                                {t('workflow.transferOwnership')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                                            <Crown className="w-4 h-4 text-yellow-600" />
                                            <div className="flex-1">
                                                <div className="font-medium">{t('workflow.owner')}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {permissions?.ownerId}
                                                </div>
                                            </div>
                                        </div>
                                        {permissions?.permissions.map((perm, idx) => (
                                            <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                {PERMISSION_LABELS[perm.level].icon}
                                                <div className="flex-1">
                                                    <div className="font-medium">
                                                        {perm.userName || perm.userId || perm.teamId}
                                                    </div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                                        {perm.userEmail || perm.userId || perm.teamId}
                                                    </div>
                                                </div>
                                                <Badge>{perm.level}</Badge>
                                                {isOwner && perm.userId && (
                                                    <div className="flex gap-1">
                                                        <Select
                                                            value={perm.level}
                                                            onValueChange={(v) => handleUpdatePermission(perm.userId!, v as PermissionLevel)}
                                                        >
                                                            <SelectTrigger className="w-32">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {Object.entries(PERMISSION_LABELS).map(([level, label]) => (
                                                                    <SelectItem key={level} value={level}>
                                                                        {label.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemoveAccess(perm.userId!)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {(!permissions?.permissions || permissions.permissions.length === 0) && (
                                            <div className="text-center py-4 text-gray-500 text-sm">
                                                {t('workflow.noSharedUsers')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="activity" className="space-y-4">
                                <div className="space-y-2">
                                    {activityLog.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500">{t('workflow.noActivity')}</div>
                                    ) : (
                                        activityLog
                                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                            .map((entry, idx) => (
                                                <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="font-medium">{entry.userName || entry.userId}</div>
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            {new Date(entry.timestamp).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                        {entry.action}
                                                        {entry.details && (
                                                            <span className="ml-2 text-gray-500">- {entry.details}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </div>
        </div>
    );
}

