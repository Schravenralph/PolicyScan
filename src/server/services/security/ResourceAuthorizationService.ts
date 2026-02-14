import { Request } from 'express';
import { ObjectId } from 'mongodb';
import { UserRole } from '../../models/User.js';
import { WorkflowPermissionModel, PermissionLevel } from '../../models/WorkflowPermission.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { AuthorizationError } from '../../types/errors.js';

/**
 * Resource types that can be protected with resource-level authorization
 */
export type ResourceType = 'workflow' | 'query' | 'workflowRun' | 'workflowConfiguration' | 'document';

/**
 * Access actions that can be performed on resources
 */
export type ResourceAction = 'view' | 'edit' | 'delete' | 'run' | 'admin';

/**
 * Authorization result
 */
export interface AuthorizationResult {
    allowed: boolean;
    reason?: string;
    permissionLevel?: PermissionLevel | 'owner' | 'none';
}

/**
 * Service for resource-level authorization checks
 * 
 * Provides fine-grained access control beyond role-based authorization.
 * Supports ownership-based access control and permission-based access.
 */
export class ResourceAuthorizationService {
    private static instance: ResourceAuthorizationService;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): ResourceAuthorizationService {
        if (!ResourceAuthorizationService.instance) {
            ResourceAuthorizationService.instance = new ResourceAuthorizationService();
        }
        return ResourceAuthorizationService.instance;
    }

    /**
     * Check if a user has permission to perform an action on a resource
     * 
     * @param userId - User ID requesting access
     * @param userRole - User role (for admin/developer bypass)
     * @param resourceType - Type of resource
     * @param resourceId - ID of the resource
     * @param action - Action being performed
     * @returns Authorization result
     */
    async checkPermission(
        userId: string,
        userRole: UserRole,
        resourceType: ResourceType,
        resourceId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        try {
            // Admins and developers have full access to all resources
            if (userRole === 'admin' || userRole === 'developer') {
                return {
                    allowed: true,
                    permissionLevel: 'admin' as PermissionLevel,
                    reason: 'Admin or developer role',
                };
            }

            // Check resource-specific authorization
            switch (resourceType) {
                case 'workflow':
                    return await this.checkWorkflowPermission(userId, resourceId, action);
                case 'query':
                    return await this.checkQueryPermission(userId, resourceId, action);
                case 'workflowRun':
                    return await this.checkWorkflowRunPermission(userId, resourceId, action);
                case 'workflowConfiguration':
                    return await this.checkWorkflowConfigurationPermission(userId, resourceId, action);
                case 'document':
                    return await this.checkDocumentPermission(userId, resourceId, action);
                default:
                    logger.warn({ resourceType, resourceId }, 'Unknown resource type for authorization check');
                    return {
                        allowed: false,
                        reason: `Unknown resource type: ${resourceType}`,
                        permissionLevel: 'none',
                    };
            }
        } catch (error) {
            logger.error(
                { error, userId, resourceType, resourceId, action },
                'Error checking resource authorization'
            );
            // Fail closed - deny access on error
            return {
                allowed: false,
                reason: 'Error checking authorization',
                permissionLevel: 'none',
            };
        }
    }

    /**
     * Check workflow permission using existing WorkflowPermissionModel
     */
    private async checkWorkflowPermission(
        userId: string,
        workflowId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        const permission = await WorkflowPermissionModel.getUserPermission(workflowId, userId);
        
        if (permission === null) {
            return {
                allowed: false,
                reason: 'No access to workflow',
                permissionLevel: 'none',
            };
        }

        // Map action to required permission level
        const requiredLevel = this.getRequiredPermissionLevel(action);
        
        // Check if user's permission level is sufficient
        const hasPermission = this.hasPermissionLevel(permission, requiredLevel);
        
        return {
            allowed: hasPermission,
            reason: hasPermission ? undefined : `Insufficient permission level. Required: ${requiredLevel}, has: ${permission}`,
            permissionLevel: permission,
        };
    }

    /**
     * Check query permission (ownership-based)
     */
    private async checkQueryPermission(
        userId: string,
        queryId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        const db = getDB();
        
        if (!ObjectId.isValid(queryId)) {
            return {
                allowed: false,
                reason: 'Invalid query ID',
                permissionLevel: 'none',
            };
        }

        const query = await db.collection('queries').findOne({ _id: new ObjectId(queryId) });
        
        if (!query) {
            return {
                allowed: false,
                reason: 'Query not found',
                permissionLevel: 'none',
            };
        }

        // Check ownership (queries are user-owned)
        const ownerId = query.createdBy || query.userId;
        if (!ownerId) {
            // Legacy queries without ownership - deny access for safety
            logger.warn({ queryId }, 'Query has no owner, denying access');
            return {
                allowed: false,
                reason: 'Query has no owner',
                permissionLevel: 'none',
            };
        }

        const isOwner = ownerId.toString() === userId;
        
        return {
            allowed: isOwner,
            reason: isOwner ? undefined : 'Not the owner of this query',
            permissionLevel: isOwner ? 'owner' : 'none',
        };
    }

    /**
     * Check workflow run permission (ownership-based)
     * 
     * For pause/stop operations, we allow access even if the run has no owner (legacy runs)
     * to ensure users can always stop their workflows. This is a safety feature.
     */
    private async checkWorkflowRunPermission(
        userId: string,
        runId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        const db = getDB();
        
        if (!ObjectId.isValid(runId)) {
            return {
                allowed: false,
                reason: 'Invalid run ID',
                permissionLevel: 'none',
            };
        }

        const run = await db.collection('runs').findOne({ _id: new ObjectId(runId) });
        
        if (!run) {
            // Log additional context for debugging SSE connection issues
            logger.warn(
                {
                    runId,
                    userId,
                    action,
                    // Check if run exists with different query to see if it's a timing issue
                    runExistsCheck: 'failed'
                },
                '[Auth] Workflow run not found in authorization check - may be timing issue or run was deleted'
            );
            return {
                allowed: false,
                reason: 'Workflow run not found',
                permissionLevel: 'none',
            };
        }

        // Check ownership (workflow runs are user-owned)
        const ownerId = run.createdBy || run.userId;
        
        // For pause/stop/cancel operations, allow access even if run has no owner (legacy runs)
        // This ensures users can always stop their workflows, which is a safety feature
        const isControlAction = action === 'edit' || action === 'delete';
        
            if (!ownerId) {
                if (isControlAction) {
                    // Allow pause/stop for legacy runs without owners (safety feature)
                    // This ensures users can always stop their workflows, even if ownership wasn't tracked
                    logger.info({ runId, action, userId }, 'Allowing control action on legacy run without owner');
                    return {
                        allowed: true,
                        reason: 'Legacy run without owner - control actions allowed for safety',
                        permissionLevel: 'owner' as PermissionLevel, // Use 'owner' level for legacy runs to allow control
                    };
                } else {
                    // For view operations, deny access to legacy runs without owners
                    logger.warn({ runId, action }, 'Workflow run has no owner, denying access');
                    return {
                        allowed: false,
                        reason: 'Workflow run has no owner',
                        permissionLevel: 'none',
                    };
                }
            }

        const isOwner = ownerId.toString() === userId;
        
        // For SSE 'view' operations on recently created runs, be more lenient
        // This handles race conditions where the run was just created and ownership
        // might not be fully propagated or there's a timing issue
        const isSSEView = action === 'view';
        const runAge = run.startTime ? Date.now() - new Date(run.startTime).getTime() : Infinity;
        const isRecentlyCreated = runAge < 5000; // Less than 5 seconds old
        
        if (!isOwner) {
            // Log ownership mismatch for debugging
            logger.warn(
                {
                    runId,
                    userId,
                    ownerId: ownerId.toString(),
                    action,
                    runStatus: run.status,
                    createdBy: run.createdBy,
                    hasUserId: !!run.userId,
                    runAge,
                    isRecentlyCreated,
                    isSSEView
                },
                '[Auth] Ownership mismatch in authorization check'
            );
            
            // Allow SSE view access to recently created runs even if ownership doesn't match
            // This handles race conditions where the run was just created
            if (isSSEView && isRecentlyCreated && run.status !== 'cancelled') {
                logger.info(
                    {
                        runId,
                        userId,
                        ownerId: ownerId.toString(),
                        runAge
                    },
                    '[Auth] Allowing SSE view access to recently created run despite ownership mismatch (race condition handling)'
                );
                return {
                    allowed: true,
                    reason: 'Recently created run - allowing SSE access for race condition handling',
                    permissionLevel: 'owner' as PermissionLevel,
                };
            }
        }
        
        return {
            allowed: isOwner,
            reason: isOwner ? undefined : 'Not the owner of this workflow run',
            permissionLevel: isOwner ? 'owner' : 'none',
        };
    }

    /**
     * Check workflow configuration permission (ownership-based)
     */
    private async checkWorkflowConfigurationPermission(
        userId: string,
        configId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        const db = getDB();
        
        if (!ObjectId.isValid(configId)) {
            return {
                allowed: false,
                reason: 'Invalid configuration ID',
                permissionLevel: 'none',
            };
        }

        const config = await db.collection('workflow_configurations').findOne({ _id: new ObjectId(configId) });
        
        if (!config) {
            return {
                allowed: false,
                reason: 'Workflow configuration not found',
                permissionLevel: 'none',
            };
        }

        // Check ownership
        const ownerId = config.createdBy;
        if (!ownerId) {
            logger.warn({ configId }, 'Workflow configuration has no owner, denying access');
            return {
                allowed: false,
                reason: 'Workflow configuration has no owner',
                permissionLevel: 'none',
            };
        }

        const isOwner = ownerId.toString() === userId;
        
        return {
            allowed: isOwner,
            reason: isOwner ? undefined : 'Not the owner of this workflow configuration',
            permissionLevel: isOwner ? 'owner' : 'none',
        };
    }

    /**
     * Check document permission (ownership-based via query)
     */
    private async checkDocumentPermission(
        userId: string,
        documentId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        const db = getDB();
        
        if (!ObjectId.isValid(documentId)) {
            return {
                allowed: false,
                reason: 'Invalid document ID',
                permissionLevel: 'none',
            };
        }

        const document = await db.collection('brondocumenten').findOne({ _id: new ObjectId(documentId) });
        
        if (!document) {
            return {
                allowed: false,
                reason: 'Document not found',
                permissionLevel: 'none',
            };
        }

        // Documents are owned via their query
        if (!document.queryId) {
            // Documents without a query are considered public (legacy)
            return {
                allowed: true,
                reason: 'Document has no query association (legacy)',
                permissionLevel: 'viewer' as PermissionLevel,
            };
        }

        // Check query ownership
        const query = await db.collection('queries').findOne({ _id: document.queryId });
        if (!query) {
            return {
                allowed: false,
                reason: 'Document query not found',
                permissionLevel: 'none',
            };
        }

        const ownerId = query.createdBy || query.userId;
        if (!ownerId) {
            return {
                allowed: true, // Legacy documents without ownership
                reason: 'Document query has no owner (legacy)',
                permissionLevel: 'viewer' as PermissionLevel,
            };
        }

        const isOwner = ownerId.toString() === userId;
        
        return {
            allowed: isOwner,
            reason: isOwner ? undefined : 'Not the owner of this document',
            permissionLevel: isOwner ? 'owner' : 'none',
        };
    }

    /**
     * Map action to required permission level
     */
    private getRequiredPermissionLevel(action: ResourceAction): PermissionLevel {
        switch (action) {
            case 'view':
                return 'viewer';
            case 'edit':
            case 'run':
                return 'editor';
            case 'delete':
            case 'admin':
                return 'owner';
            default:
                return 'viewer';
        }
    }

    /**
     * Check if user's permission level is sufficient for required level
     */
    private hasPermissionLevel(userLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
        const levels: PermissionLevel[] = ['viewer', 'editor', 'owner'];
        const userIndex = levels.indexOf(userLevel);
        const requiredIndex = levels.indexOf(requiredLevel);
        
        return userIndex >= requiredIndex;
    }

    /**
     * Check authorization from Express request
     * Convenience method for middleware usage
     */
    async checkFromRequest(
        req: Request,
        resourceType: ResourceType,
        resourceId: string,
        action: ResourceAction
    ): Promise<AuthorizationResult> {
        if (!req.user) {
            return {
                allowed: false,
                reason: 'Authentication required',
                permissionLevel: 'none',
            };
        }

        return await this.checkPermission(
            req.user.userId || '',
            req.user.role || 'client',
            resourceType,
            resourceId,
            action
        );
    }
}

/**
 * Get the resource authorization service instance
 */
export function getResourceAuthorizationService(): ResourceAuthorizationService {
    return ResourceAuthorizationService.getInstance();
}

