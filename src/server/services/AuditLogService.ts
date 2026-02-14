import { Request } from 'express';
import { AuditLog, AuditLogCreateInput, AuditActionType, AuditTargetType } from '../models/AuditLog.js';
import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

/**
 * Service for managing audit logging operations
 */
export class AuditLogService {
    /**
     * Extract IP address from request
     */
    private static getIpAddress(req: Request): string | undefined {
        return (
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            (req.headers['x-real-ip'] as string) ||
            req.socket.remoteAddress ||
            undefined
        );
    }

    /**
     * Extract user agent from request
     */
    private static getUserAgent(req: Request): string | undefined {
        return req.headers['user-agent'];
    }

    /**
     * Log an admin action
     */
    static async logAction(
        req: Request,
        action: AuditActionType,
        targetType: AuditTargetType,
        targetId?: string,
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            // Check if database is available before attempting to log
            const { isDBConnected } = await import('../config/database.js');
            if (!isDBConnected()) {
                // Database not initialized in test environment - skip audit logging
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return; // Silently skip in test mode
                }
                // In non-test mode, log warning but don't throw
                console.warn('[AuditLogService] Database not initialized, skipping audit log');
                return;
            }

            // Get user from request (set by auth middleware)
            const user = req.user;
            if (!user?.userId) {
                console.warn('[AuditLogService] Cannot log action: user not found in request');
                return;
            }

            // Get user email from database if not in request
            let userEmail: string = user.email || 'unknown';
            if (!user.email) {
                try {
                    const db = getDB();
                    const userDoc = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
                    userEmail = userDoc?.email || 'unknown';
                } catch {
                    userEmail = 'unknown';
                }
            }

            const auditInput: AuditLogCreateInput = {
                userId: user.userId.toString(),
                userEmail: userEmail,
                action,
                targetType,
                targetId,
                details: details || {},
                ipAddress: this.getIpAddress(req),
                userAgent: this.getUserAgent(req),
            };

            // Log asynchronously to avoid blocking the request
            await AuditLog.create(auditInput).catch((error) => {
                // Check if it's a MongoDB client closed error (common in tests)
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                    // Silently skip in test mode - don't log errors
                    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                        return;
                    }
                }
                // Only log non-client-closed errors, or client-closed errors in non-test mode
                if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.error('[AuditLogService] Failed to create audit log:', error);
                }
                // Don't throw - audit logging should not break the application
            });
        } catch (error) {
            // Check if it's a MongoDB client closed error (common in tests)
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                // Silently skip in test mode - don't log errors
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            // Only log non-client-closed errors, or client-closed errors in non-test mode
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[AuditLogService] Error logging action:', error);
            }
            // Don't throw - audit logging should not break the application
        }
    }

    /**
     * Log user role change
     */
    static async logUserRoleChange(
        req: Request,
        targetUserId: string,
        oldRole: string,
        newRole: string
    ): Promise<void> {
        await this.logAction(req, 'user_role_changed', 'user', targetUserId, {
            oldRole,
            newRole,
        });
    }

    /**
     * Log user status change
     */
    static async logUserStatusChange(
        req: Request,
        targetUserId: string,
        oldStatus: boolean,
        newStatus: boolean
    ): Promise<void> {
        await this.logAction(req, 'user_status_changed', 'user', targetUserId, {
            oldStatus,
            newStatus,
        });
    }

    /**
     * Log password reset
     */
    static async logPasswordReset(req: Request, targetUserId: string): Promise<void> {
        await this.logAction(req, 'user_password_reset', 'user', targetUserId);
    }

    /**
     * Log workflow pause
     */
    static async logWorkflowPause(req: Request, workflowId: string): Promise<void> {
        await this.logAction(req, 'workflow_paused', 'workflow', workflowId);
    }

    /**
     * Log workflow resume
     */
    static async logWorkflowResume(req: Request, workflowId: string): Promise<void> {
        await this.logAction(req, 'workflow_resumed', 'workflow', workflowId);
    }

    /**
     * Log threshold update
     */
    static async logThresholdUpdate(
        req: Request,
        thresholdId: string,
        changes: Record<string, unknown>
    ): Promise<void> {
        await this.logAction(req, 'threshold_updated', 'threshold', thresholdId, changes);
    }

    /**
     * Log multiple threshold updates
     */
    static async logThresholdUpdates(
        req: Request,
        updates: Array<{ thresholdId: string; changes: Record<string, unknown> }>
    ): Promise<void> {
        if (updates.length === 0) return;

        try {
            // Check if database is available
            const { isDBConnected } = await import('../config/database.js');
            if (!isDBConnected()) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
                console.warn('[AuditLogService] Database not initialized, skipping audit log');
                return;
            }

            // Get user from request
            const user = req.user;
            if (!user?.userId) {
                console.warn('[AuditLogService] Cannot log action: user not found in request');
                return;
            }

            // Get user email
            let userEmail: string = user.email || 'unknown';
            if (!user.email) {
                try {
                    const db = getDB();
                    const userDoc = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
                    userEmail = userDoc?.email || 'unknown';
                } catch {
                    userEmail = 'unknown';
                }
            }

            const ipAddress = this.getIpAddress(req);
            const userAgent = this.getUserAgent(req);

            const auditInputs: AuditLogCreateInput[] = updates.map(update => ({
                userId: user.userId?.toString() || 'unknown',
                userEmail,
                action: 'threshold_updated',
                targetType: 'threshold',
                targetId: update.thresholdId,
                details: update.changes,
                ipAddress,
                userAgent,
            }));

            await AuditLog.insertMany(auditInputs).catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                        return;
                    }
                }
                if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.error('[AuditLogService] Failed to create audit logs:', error);
                }
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[AuditLogService] Error logging threshold updates:', error);
            }
        }
    }

    /**
     * Log system config change
     */
    static async logSystemConfigChange(
        req: Request,
        configKey: string,
        changes: Record<string, unknown>
    ): Promise<void> {
        await this.logAction(req, 'system_config_changed', 'system', configKey, changes);
    }

    /**
     * Log audit log export
     */
    static async logAuditLogExport(req: Request, filters: Record<string, unknown>): Promise<void> {
        await this.logAction(req, 'audit_log_exported', 'audit_log', undefined, { filters });
    }

    /**
     * Log authentication event (login, logout, register)
     * 
     * This method handles authentication events that may occur before
     * the user is authenticated (e.g., login, register).
     * 
     * @param req - Request object (for IP address and user agent)
     * @param action - Authentication action type
     * @param userId - User ID (if available)
     * @param userEmail - User email (if available)
     * @param success - Whether the action was successful
     * @param details - Additional details (e.g., failure reason)
     */
    static async logAuthEvent(
        req: Request,
        action: 'login' | 'logout' | 'register' | 'password_reset_request' | 'password_reset',
        userId?: string,
        userEmail?: string,
        success: boolean = true,
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            // Check if database is available
            const { isDBConnected } = await import('../config/database.js');
            if (!isDBConnected()) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
                console.warn('[AuditLogService] Database not initialized, skipping audit log');
                return;
            }

            // Map action to AuditActionType
            let auditAction: AuditActionType;
            switch (action) {
                case 'login':
                    auditAction = success ? 'admin_login' : 'login_failure';
                    break;
                case 'logout':
                    auditAction = 'admin_logout';
                    break;
                case 'register':
                    auditAction = 'user_created';
                    break;
                case 'password_reset_request':
                    auditAction = 'password_reset_request';
                    break;
                case 'password_reset':
                    auditAction = 'user_password_reset';
                    break;
                default:
                    auditAction = 'system_config_changed'; // Fallback
            }

            // Get user email from database if not provided
            let finalUserEmail: string = userEmail || 'unknown';
            if (!userEmail && userId) {
                try {
                    const db = getDB();
                    const userDoc = await db.collection('users').findOne({ _id: new ObjectId(userId) });
                    finalUserEmail = userDoc?.email || 'unknown';
                } catch {
                    finalUserEmail = 'unknown';
                }
            }

            const auditInput: AuditLogCreateInput = {
                userId: userId || 'system',
                userEmail: finalUserEmail,
                action: auditAction,
                targetType: 'user',
                targetId: userId,
                details: {
                    ...details,
                    authAction: action,
                    success,
                },
                ipAddress: this.getIpAddress(req),
                userAgent: this.getUserAgent(req),
            };

            // Log asynchronously to avoid blocking the request
            await AuditLog.create(auditInput).catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                        return;
                    }
                }
                if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.error('[AuditLogService] Failed to create audit log:', error);
                }
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[AuditLogService] Error logging auth event:', error);
            }
        }
    }

    /**
     * Log data access event
     * 
     * Logs when users access sensitive data (documents, workflows, etc.)
     * 
     * @param req - Request object
     * @param resourceType - Type of resource accessed
     * @param resourceId - ID of resource accessed
     * @param action - Action performed (view, export, etc.)
     * @param details - Additional details
     */
    static async logDataAccess(
        req: Request,
        resourceType: 'document' | 'workflow' | 'user' | 'query' | 'other',
        resourceId: string,
        action: 'view' | 'export' | 'download' | 'access',
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            // Check if database is available
            const { isDBConnected } = await import('../config/database.js');
            if (!isDBConnected()) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
                return;
            }

            // Get user from request
            const user = req.user;
            if (!user?.userId) {
                // Data access without authentication - log as system
                return;
            }

            // Get user email
            let userEmail: string = user.email || 'unknown';
            if (!user.email) {
                try {
                    const db = getDB();
                    const userDoc = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
                    userEmail = userDoc?.email || 'unknown';
                } catch {
                    userEmail = 'unknown';
                }
            }

            const auditInput: AuditLogCreateInput = {
                userId: user.userId.toString(),
                userEmail,
                action: 'system_config_changed', // Use generic action for data access
                targetType: resourceType === 'document' ? 'other' : resourceType === 'workflow' ? 'workflow' : 'other',
                targetId: resourceId,
                details: {
                    ...details,
                    dataAccessAction: action,
                    resourceType,
                },
                ipAddress: this.getIpAddress(req),
                userAgent: this.getUserAgent(req),
            };

            await AuditLog.create(auditInput).catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                        return;
                    }
                }
                if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.error('[AuditLogService] Failed to create audit log:', error);
                }
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[AuditLogService] Error logging data access:', error);
            }
        }
    }

    /**
     * Log authorization decision
     * 
     * Logs when authorization decisions are made (granted or denied access)
     * 
     * @param req - Request object
     * @param resourceType - Type of resource being accessed
     * @param resourceId - ID of resource being accessed
     * @param requiredPermission - Required permission level or role
     * @param granted - Whether access was granted
     * @param userPermission - User's actual permission level or role (if available)
     * @param details - Additional details (e.g., reason for denial)
     */
    static async logAuthorizationDecision(
        req: Request,
        resourceType: 'workflow' | 'user' | 'system' | 'other',
        resourceId: string,
        requiredPermission: string,
        granted: boolean,
        userPermission?: string,
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            // Check if database is available
            const { isDBConnected } = await import('../config/database.js');
            if (!isDBConnected()) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
                return;
            }

            // Get user from request
            const user = req.user;
            if (!user?.userId) {
                // Authorization check without authentication - log as system
                return;
            }

            // Get user email
            let userEmail: string = user.email || 'unknown';
            if (!user.email) {
                try {
                    const db = getDB();
                    const userDoc = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
                    userEmail = userDoc?.email || 'unknown';
                } catch {
                    userEmail = 'unknown';
                }
            }

            const auditInput: AuditLogCreateInput = {
                userId: user.userId.toString(),
                userEmail,
                action: granted ? 'system_config_changed' : 'system_config_changed', // Use generic action for now
                targetType: resourceType,
                targetId: resourceId,
                details: {
                    ...details,
                    authorizationDecision: granted ? 'granted' : 'denied',
                    requiredPermission,
                    userPermission: userPermission || user.role,
                    userRole: user.role,
                    httpMethod: req.method,
                    httpPath: req.path,
                },
                ipAddress: this.getIpAddress(req),
                userAgent: this.getUserAgent(req),
            };

            await AuditLog.create(auditInput).catch((error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                        return;
                    }
                }
                if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.error('[AuditLogService] Failed to create authorization audit log:', error);
                }
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('MongoClientClosed') || errorMsg.includes('client was closed')) {
                if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                    return;
                }
            }
            if (!(process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.error('[AuditLogService] Error logging authorization decision:', error);
            }
        }
    }
}
