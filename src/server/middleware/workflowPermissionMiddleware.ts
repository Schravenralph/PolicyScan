import { Request, Response, NextFunction } from 'express';
import { WorkflowPermissionModel, PermissionLevel } from '../models/WorkflowPermission.js';

/**
 * List of predefined workflow IDs that should be accessible to all authenticated users
 * (especially admins and developers)
 */
const PREDEFINED_WORKFLOWS = [
    'iplo-exploration',
    'standard-scan',
    'quick-iplo-scan',
    'external-links-exploration',
    'beleidsscan-graph',
    'bfs-3-hop',
    'horst-aan-de-maas',
    'horst-labor-migration',
    'beleidsscan-wizard',
    'beleidsscan-wizard-step1-search-dso',
    'beleidsscan-wizard-step2-enrich-dso',
    'beleidsscan-wizard-step3-search-iplo',
    'beleidsscan-wizard-step4-scan-known-sources',
    'beleidsscan-wizard-step5-search-officielebekendmakingen',
    'beleidsscan-wizard-step6-search-rechtspraak',
    'beleidsscan-wizard-step7-search-common-crawl',
    'beleidsscan-wizard-step9-merge-score'
];

/**
 * Check if a workflow ID is a predefined workflow
 */
function isPredefinedWorkflow(workflowId: string): boolean {
    return PREDEFINED_WORKFLOWS.includes(workflowId);
}

/**
 * Check if user is admin or developer
 */
function isAdminOrDeveloper(req: Request): boolean {
    return req.user?.role === 'admin' || req.user?.role === 'developer';
}

/**
 * Middleware to check if user has required permission for a workflow
 */
export function requireWorkflowPermission(requiredLevel: PermissionLevel) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const workflowId = req.params.id || req.params.workflowId;
            if (!workflowId) {
                return res.status(400).json({ error: 'Workflow ID is required' });
            }

            // Allow admins and developers to access predefined workflows without permission checks
            if (isPredefinedWorkflow(workflowId) && isAdminOrDeveloper(req)) {
                return next();
            }

            // For viewer permissions, allow all authenticated users to access predefined workflows
            // (predefined workflows are public and don't require database entries)
            if (isPredefinedWorkflow(workflowId) && requiredLevel === 'viewer') {
                return next();
            }

            // Check if workflow exists first (hasPermission returns false for non-existent workflows)
            if (!req.user?.userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const permission = await WorkflowPermissionModel.getUserPermission(workflowId, req.user.userId);
            if (permission === null) {
                // Could be non-existent workflow or no access - try to find workflow access to distinguish
                const access = await WorkflowPermissionModel.findByWorkflowId(workflowId);
                if (!access) {
                    // For predefined workflows without database entries:
                    // - Viewer: allow all authenticated users
                    // - Other levels: allow only admins/developers
                    if (isPredefinedWorkflow(workflowId)) {
                        if (requiredLevel === 'viewer' || isAdminOrDeveloper(req)) {
                            return next();
                        }
                    }
                    // Workflow doesn't exist - let route handler return 404
                    return next();
                }
                // Workflow exists but user has no access
                // Log denied access (async, don't block)
                const { AuditLogService } = await import('../services/AuditLogService.js');
                AuditLogService.logAuthorizationDecision(
                    req,
                    'workflow',
                    workflowId,
                    requiredLevel,
                    false,
                    undefined,
                    { 
                        requiredLevel,
                        reason: 'User has no access to workflow',
                    }
                ).catch((error) => {
                    // Don't fail request if audit logging fails
                    console.error('[workflowPermissionMiddleware] Failed to log authorization decision:', error);
                });
                
                return res.status(403).json({ 
                    error: `Insufficient permissions. Required: ${requiredLevel}` 
                });
            }

            if (!req.user?.userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const hasPermission = await WorkflowPermissionModel.hasPermission(
                workflowId,
                req.user.userId,
                requiredLevel
            );

            // Log authorization decision
            const { AuditLogService } = await import('../services/AuditLogService.js');
            if (hasPermission) {
                // Log granted access (async, don't block)
                AuditLogService.logAuthorizationDecision(
                    req,
                    'workflow',
                    workflowId,
                    requiredLevel,
                    true,
                    permission || undefined,
                    { 
                        requiredLevel,
                        userPermission: permission,
                    }
                ).catch((error) => {
                    // Don't fail request if audit logging fails
                    console.error('[workflowPermissionMiddleware] Failed to log authorization decision:', error);
                });
            } else {
                // Log denied access (async, don't block)
                AuditLogService.logAuthorizationDecision(
                    req,
                    'workflow',
                    workflowId,
                    requiredLevel,
                    false,
                    permission || undefined,
                    { 
                        requiredLevel,
                        userPermission: permission,
                        reason: 'User does not have required permission level',
                    }
                ).catch((error) => {
                    // Don't fail request if audit logging fails
                    console.error('[workflowPermissionMiddleware] Failed to log authorization decision:', error);
                });
                
                return res.status(403).json({ 
                    error: `Insufficient permissions. Required: ${requiredLevel}` 
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Middleware to check if user is workflow owner
 */
export function requireWorkflowOwner() {
    return requireWorkflowPermission('owner');
}

/**
 * Middleware to check if user can edit workflow
 */
export function requireWorkflowEditor() {
    return requireWorkflowPermission('editor');
}

/**
 * Middleware to check if user can run workflow
 */
export function requireWorkflowRunner() {
    return requireWorkflowPermission('runner');
}

/**
 * Middleware to check if user can view workflow
 * 
 * For predefined workflows, allows all authenticated users to view
 * (since predefined workflows are public and don't require database permissions)
 */
export function requireWorkflowViewer() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const workflowId = req.params.id || req.params.workflowId;
            if (!workflowId) {
                return res.status(400).json({ error: 'Workflow ID is required' });
            }

            // Allow all authenticated users to view predefined workflows
            // (predefined workflows are public and don't require database permissions)
            if (isPredefinedWorkflow(workflowId)) {
                return next();
            }

            // For non-predefined workflows, check permissions
            return requireWorkflowPermission('viewer')(req, res, next);
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Attach user's permission level to request
 */
export async function attachWorkflowPermission(req: Request, _res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return next();
        }

        const workflowId = req.params.id || req.params.workflowId;
        if (workflowId) {
            if (!req.user?.userId) {
                return next();
            }
            const permission = await WorkflowPermissionModel.getUserPermission(
                workflowId,
                req.user.userId
            );
            (req as Request & { workflowPermission?: PermissionLevel | null }).workflowPermission = permission;
        }

        next();
    } catch (error) {
        next(error);
    }
}

