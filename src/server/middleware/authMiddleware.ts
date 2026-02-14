import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthenticationError } from '../services/auth/AuthService.js';
import { UserRole } from '../models/User.js';
import { getTokenBlacklistService } from '../services/security/TokenBlacklistService.js';
import { AuditLogService } from '../services/AuditLogService.js';

/**
 * Middleware to authenticate requests using JWT token
 * Supports both Authorization header and query parameter (for SSE/EventSource compatibility)
 */
export function authenticate(authService: AuthService) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get token from Authorization header (preferred method)
            let token: string | undefined;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7); // Remove 'Bearer ' prefix
            }
            
            // Fallback to query parameter for SSE/EventSource requests
            // EventSource API doesn't support custom headers, so we accept token in query string
            if (!token && req.query.token && typeof req.query.token === 'string') {
                token = req.query.token;
            }
            
            if (!token) {
                throw new AuthenticationError('No token provided');
            }

            // Check if token is blacklisted
            const blacklistService = getTokenBlacklistService();
            const isBlacklisted = await blacklistService.isBlacklisted(token);
            
            if (isBlacklisted) {
                throw new AuthenticationError('Token has been revoked');
            }

            // Verify token
            const payload = authService.verifyToken(token);

            // Security: Ensure token is intended for authentication (default)
            if (payload.scope && payload.scope !== 'auth') {
                throw new AuthenticationError('Invalid token scope');
            }

            // Check if user's tokens are blacklisted (user-level revocation)
            // Pass token issuance time (iat) to allow tokens issued AFTER revocation
            const iat = (payload as any).iat;
            const userBlacklisted = await blacklistService.isUserBlacklisted(payload.userId, iat);
            if (userBlacklisted) {
                throw new AuthenticationError('User tokens have been revoked');
            }

            // Attach user info to request
            req.user = {
                userId: payload.userId,
                role: payload.role,
            };

            next();
        } catch (error) {
            if (error instanceof AuthenticationError) {
                res.status(401).json({ error: error.message });
            } else {
                res.status(401).json({ error: 'Authentication failed' });
            }
        }
    };
}

/**
 * Middleware to authorize based on user roles
 */
export function authorize(allowedRoles: UserRole[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const hasAccess = req.user.role ? allowedRoles.includes(req.user.role) : false;
        
        // Log authorization decision
        if (hasAccess) {
            // Log granted access (async, don't block)
            AuditLogService.logAuthorizationDecision(
                req,
                'system',
                req.path,
                allowedRoles.join(','),
                true,
                req.user.role,
                { allowedRoles }
            ).catch((error) => {
                // Don't fail request if audit logging fails
                console.error('[authMiddleware] Failed to log authorization decision:', error);
            });
        } else {
            // Log denied access (async, don't block)
            AuditLogService.logAuthorizationDecision(
                req,
                'system',
                req.path,
                allowedRoles.join(','),
                false,
                req.user.role,
                { 
                    allowedRoles,
                    reason: 'User role not in allowed roles',
                }
            ).catch((error) => {
                // Don't fail request if audit logging fails
                console.error('[authMiddleware] Failed to log authorization decision:', error);
            });
            
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

/**
 * Optional authentication - attaches user if token present, but doesn't fail if missing
 */
export function optionalAuth(authService: AuthService) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const payload = authService.verifyToken(token);

                // Security: Ensure token is intended for authentication
                if (payload.scope && payload.scope !== 'auth') {
                    throw new Error('Invalid token scope');
                }

                req.user = {
                    userId: payload.userId,
                    role: payload.role,
                };
            }
        } catch {
            // Silently fail - this is optional auth
        }
        next();
    };
}
