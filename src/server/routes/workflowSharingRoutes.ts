import { Router, Request, Response } from 'express';
import { WorkflowPermissionModel, PermissionLevel, Visibility } from '../models/WorkflowPermission.js';
import { WorkflowActivityModel } from '../models/WorkflowPermission.js';
import { WorkflowModel } from '../models/Workflow.js';
import { AuthService } from '../services/auth/AuthService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireWorkflowOwner, requireWorkflowEditor, requireWorkflowViewer, attachWorkflowPermission } from '../middleware/workflowPermissionMiddleware.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthorizationError } from '../types/errors.js';

export function createWorkflowSharingRouter(authService: AuthService): Router {
    const router = Router();

    // All routes require authentication
    router.use(authenticate(authService));

    /**
     * POST /api/workflows/:id/share
     * Share workflow with a user or team
     */
    router.post('/:id/share', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { userId, teamId, level } = req.body;

        if (!userId && !teamId) {
            throw new BadRequestError('Either userId or teamId is required');
        }

        if (!level || !['owner', 'editor', 'runner', 'viewer'].includes(level)) {
            throw new BadRequestError('Valid permission level is required');
        }

        // Security: Prevent granting owner permissions via share endpoint
        // Ownership should only be transferred via the dedicated transfer-ownership endpoint
        if (level === 'owner') {
            throw new BadRequestError('Cannot grant owner permission via share endpoint. Use the transfer-ownership endpoint instead.');
        }

        // Prevent sharing with self
        if (userId && userId === req.user!.userId) {
            throw new BadRequestError('Cannot share workflow with yourself');
        }

        // Verify workflow exists
        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        // Verify user exists if userId provided
        if (userId) {
            try {
                const user = await authService.getUserById(userId);
                throwIfNotFound(user, 'User', userId);
            } catch (error) {
                if (error instanceof NotFoundError) {
                    throw error;
                }
                // Invalid userId format
                throw new NotFoundError('User', userId);
            }
        }

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        let access;
        if (userId) {
            access = await WorkflowPermissionModel.shareWithUser(
                id,
                userId,
                level as PermissionLevel,
                req.user.userId
            );
        } else if (teamId) {
            access = await WorkflowPermissionModel.shareWithTeam(
                id,
                teamId,
                level as PermissionLevel,
                req.user.userId
            );
        }

        throwIfNotFound(access, 'Workflow sharing access');

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            userId ? 'shared_with_user' : 'shared_with_team',
            userId 
                ? `Shared with user ${userId} as ${level}`
                : `Shared with team ${teamId} as ${level}`
        );

        // Create notification for the user if workflow was shared with a user
        if (userId) {
            try {
                const { getNotificationService } = await import('../services/NotificationService.js');
                const notificationService = getNotificationService();
                const sharedByName = user?.name || 'Someone';
                await notificationService.createWorkflowSharedNotification(
                    userId,
                    workflow.name,
                    req.user.userId,
                    sharedByName,
                    id
                );
            } catch (notificationError) {
                // Don't fail the share operation if notification creation fails
                logger.error({ error: notificationError, workflowId: id, userId }, 'Failed to create workflow sharing notification');
            }
        }

        res.json(access);
    }));

    /**
     * DELETE /api/workflows/:id/share/team/:teamId
     * Remove access for a team
     */
    router.delete('/:id/share/team/:teamId', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id, teamId } = req.params;

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        const access = await WorkflowPermissionModel.removeTeamAccess(id, teamId);
        throwIfNotFound(access, 'Team access');

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            'removed_team_access',
            `Removed access for team ${teamId}`
        );

        res.json({ message: '[i18n:apiMessages.teamAccessRemoved]', access });
    }));

    /**
     * DELETE /api/workflows/:id/share/:userId
     * Remove access for a user
     */
    router.delete('/:id/share/:userId', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id, userId } = req.params;

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        const access = await WorkflowPermissionModel.removeUserAccess(id, userId);
        throwIfNotFound(access, 'User access');

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            'removed_user_access',
            `Removed access for user ${userId}`
        );

        // Send notification to removed user (optional, as per user story)
        try {
            const { getNotificationService } = await import('../services/NotificationService.js');
            const notificationService = getNotificationService();
            const workflow = await WorkflowModel.findById(id);
            const removedBy = user?.name || 'Workflow owner';
            
            await notificationService.createNotification({
                user_id: userId,
                type: 'workflow_access_removed',
                title: `Access removed from "${workflow?.name || 'workflow'}"`,
                message: `${removedBy} removed your access to this workflow.`,
                link: `/workflows`,
                metadata: {
                    workflowId: id,
                    workflowName: workflow?.name,
                    removedBy: req.user.userId,
                    removedByName: removedBy
                }
            });
        } catch (notificationError) {
            // Don't fail the removal if notification creation fails
            logger.error({ error: notificationError, workflowId: id, userId }, 'Failed to create access removal notification');
        }

        res.json({ message: '[i18n:apiMessages.accessRemoved]', access });
    }));

    /**
     * PATCH /api/workflows/:id/permissions/:userId
     * Update permission level for a user
     */
    router.patch('/:id/permissions/:userId', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id, userId } = req.params;
        const { level } = req.body;

        if (!level || !['owner', 'editor', 'runner', 'viewer'].includes(level)) {
            throw new BadRequestError('Valid permission level is required');
        }

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        const access = await WorkflowPermissionModel.updateUserPermission(
            id,
            userId,
            level as PermissionLevel,
            req.user.userId
        );

        throwIfNotFound(access, 'Permission update');

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            'updated_permission',
            `Updated permission for user ${userId} to ${level}`
        );

        res.json(access);
    }));

    /**
     * POST /api/workflows/:id/transfer-ownership
     * Transfer workflow ownership to another user
     */
    router.post('/:id/transfer-ownership', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { newOwnerId } = req.body;

        if (!newOwnerId) {
            throw new BadRequestError('newOwnerId is required');
        }

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        // Verify new owner exists
        try {
            const newOwner = await authService.getUserById(newOwnerId);
            throwIfNotFound(newOwner, 'New owner', newOwnerId);
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw error;
            }
            // Invalid userId format
            throw new NotFoundError('New owner', newOwnerId);
        }

        // Get current access to find owner
        const currentAccess = await WorkflowPermissionModel.findByWorkflowId(id);
        throwIfNotFound(currentAccess, 'Workflow access', id);

        const previousOwnerId = currentAccess.ownerId;
        const access = await WorkflowPermissionModel.transferOwnership(
            id,
            newOwnerId,
            previousOwnerId
        );

        throwIfNotFound(access, 'Ownership transfer');

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            'transferred_ownership',
            `Transferred ownership from ${previousOwnerId} to ${newOwnerId}`
        );

        // Send notification to new owner
        try {
            const { getNotificationService } = await import('../services/NotificationService.js');
            const notificationService = getNotificationService();
            const workflow = await WorkflowModel.findById(id);
            const previousOwner = await authService.getUserById(previousOwnerId);
            const previousOwnerName = previousOwner?.name || 'Previous owner';
            
            await notificationService.createNotification({
                user_id: newOwnerId,
                type: 'workflow_ownership_transferred',
                title: `You are now the owner of "${workflow?.name || 'workflow'}"`,
                message: `${previousOwnerName} transferred ownership of this workflow to you.`,
                link: `/workflows/manage/${id}`,
                metadata: {
                    workflowId: id,
                    workflowName: workflow?.name,
                    previousOwnerId,
                    previousOwnerName,
                    transferredBy: req.user.userId
                }
            });
        } catch (notificationError) {
            // Don't fail the transfer if notification creation fails
            logger.error({ error: notificationError, workflowId: id, newOwnerId }, 'Failed to create ownership transfer notification');
        }

        res.json(access);
    }));

    /**
     * GET /api/workflows/:id/activity
     * Get activity log for a workflow
     */
    router.get('/:id/activity', attachWorkflowPermission, requireWorkflowEditor(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        const activities = await WorkflowActivityModel.getActivityLog(id);
        res.json(activities);
    }));

    /**
     * GET /api/workflows/shared-with-me
     * List workflows shared with current user
     */
    router.get('/shared-with-me', asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            throw new AuthorizationError('Authentication required');
        }

        const userId = req.user.userId; // Already checked above
        if (!userId) {
            throw new AuthorizationError('User ID is required');
        }
        const sharedPermissions = await WorkflowPermissionModel.getSharedWorkflowsWithPermissions(userId);
        const workflowIds = sharedPermissions.map(p => p.workflowId);

        // Fetch all workflows (fetch individually since findByIds doesn't exist)
        const workflows = await Promise.all(
            workflowIds.map(id => WorkflowModel.findById(id))
        );
        const validWorkflows = workflows.filter((w): w is NonNullable<typeof w> => w !== null);

        // Create a map for fast permission lookup
        const permissionMap = new Map(
            sharedPermissions.map(p => [p.workflowId, p.permission])
        );
        
        // Attach permission level for each workflow
        const workflowsWithPermissions = validWorkflows.map((workflow: typeof validWorkflows[0]) => ({
            ...workflow,
            myPermission: permissionMap.get(workflow.id),
        }));

        res.json(workflowsWithPermissions);
    }));

    /**
     * GET /api/workflows/:id/permissions
     * Get current permissions for a workflow
     */
    router.get('/:id/permissions', attachWorkflowPermission, requireWorkflowViewer(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        const access = await WorkflowPermissionModel.findByWorkflowId(id);
        throwIfNotFound(access, 'Workflow access', id);

        // Get user details for permissions
        const userIds = access.permissions
            .map(p => p.userId)
            .filter((id): id is string => !!id);

        const users = userIds.length > 0
            ? await authService.getUsersByIds(userIds)
            : [];

        const userMap = new Map(users.map(u => [u.id, u]));

        const permissionsWithUsers = access.permissions.map(perm => {
            if (perm.userId) {
                const user = userMap.get(perm.userId);
                return {
                    ...perm,
                    userName: user?.name,
                    userEmail: user?.email,
                };
            }
            return perm;
        });

        res.json({
            workflowId: id,
            ownerId: access.ownerId,
            visibility: access.visibility,
            permissions: permissionsWithUsers,
        });
    }));

    /**
     * PATCH /api/workflows/:id/visibility
     * Update workflow visibility
     */
    router.patch('/:id/visibility', requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { visibility } = req.body;

        if (!visibility || !['private', 'team', 'public'].includes(visibility)) {
            throw new BadRequestError('Valid visibility is required (private, team, or public)');
        }

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        const access = await WorkflowPermissionModel.updateVisibility(
            id,
            visibility as Visibility
        );

        throwIfNotFound(access, 'Visibility update');

        if (!req.user?.userId) {
            throw new AuthorizationError('Authentication required');
        }

        // Log activity
        const user = await authService.getUserById(req.user.userId);
        await WorkflowActivityModel.addActivity(
            id,
            req.user.userId,
            user?.name,
            'updated_visibility',
            `Updated visibility to ${visibility}`
        );

        res.json(access);
    }));

    return router;
}

