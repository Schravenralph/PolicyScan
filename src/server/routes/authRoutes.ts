import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { logger } from '../utils/logger.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validation.js';
import { authSchemas } from '../validation/authSchemas.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { getEmailService } from '../services/infrastructure/EmailService.js';
import { generatePasswordResetEmail } from '../services/infrastructure/emailTemplates.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { AuditLogService } from '../services/AuditLogService.js';
import jwt from 'jsonwebtoken';
import { BadRequestError, AuthorizationError, ServiceUnavailableError } from '../types/errors.js';
import type { AuthService } from '../services/auth/AuthService.js';
import { getEnv } from '../config/env.js';

export function createAuthRoutes(authService: AuthService): Router {
    const router = Router();
    const emailService = getEmailService();

    /**
     * POST /api/auth/register
     * Register a new user
     */
    router.post('/register', authLimiter, validate(authSchemas.register), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { name, email, password, role } = req.body;
        const userData = { name, email, password, role };
        const user = await authService.register(userData);

        // Log registration for audit
        if (user._id) {
            await AuditLogService.logAuthEvent(
                req,
                'register',
                user._id.toString(),
                user.email,
                true,
                { role: user.role }
            ).catch((error) => {
                // Don't fail registration if audit logging fails
                logger.error({ error }, 'Failed to log registration audit event');
            });
        }

        res.status(201).json({
            message: '[i18n:apiMessages.userRegistered]',
            user,
        });
    }));

    /**
     * POST /api/auth/login
     * Login with email and password
     */
    router.post('/login', authLimiter, validate(authSchemas.login), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { email, password } = req.body;

        try {
            const { user, token } = await authService.login(email, password);

            // Log successful login for audit
            if (user._id) {
                await AuditLogService.logAuthEvent(
                    req,
                    'login',
                    user._id.toString(),
                    user.email,
                    true
                ).catch((error) => {
                    // Don't fail login if audit logging fails
                    logger.error({ error }, 'Failed to log login audit event');
                });
            }

            res.json({
                message: '[i18n:apiMessages.loginSuccessful]',
                user,
                token,
            });
        } catch (error) {
            // Log failed login attempt for audit
            await AuditLogService.logAuthEvent(
                req,
                'login',
                undefined,
                email,
                false,
                { error: error instanceof Error ? error.message : String(error) }
            ).catch((auditError) => {
                // Don't fail if audit logging fails
                logger.error({ error: auditError }, 'Failed to log login failure audit event');
            });

            // Re-throw the original error
            throw error;
        }
    }));

    /**
     * POST /api/auth/logout
     * Logout (revoke token and log for auditing)
     */
    router.post('/logout', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId || req.user?.id;
        const authHeader = req.headers.authorization;
        const token = authHeader?.substring(7); // Remove 'Bearer ' prefix

        // Revoke the current token
        if (token && userId) {
            try {
                await authService.revokeToken(token);
            } catch (error) {
                // Log error but don't fail logout
                logger.error({ error }, 'Failed to revoke token on logout');
            }
        }

        // Log for audit purposes
        if (userId) {
            await AuditLogService.logAuthEvent(
                req,
                'logout',
                userId,
                undefined,
                true,
                { tokenRevoked: !!token }
            ).catch((error) => {
                // Don't fail logout if audit logging fails
                logger.error({ error }, 'Failed to log logout audit event');
            });
        }

        logger.info({ userId }, 'User logged out');
        res.json({ message: '[i18n:apiMessages.logoutSuccessful]' });
    }));

    /**
     * GET /api/auth/me
     * Get current user profile
     */
    router.get('/me', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const user = await authService.getUserById(req.user?.userId || '');
        throwIfNotFound(user, 'User', req.user?.userId || '');
        res.json({ user });
    }));

    /**
     * PATCH /api/auth/me
     * Update current user profile
     */
    router.patch('/me', authenticate(authService), validate(authSchemas.updateProfile), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { name, email } = req.body;
        const updates: { name?: string; email?: string } = {};
        if (name) {
            updates.name = name;
        }
        if (email) {
            updates.email = email;
        }
        const user = await authService.updateProfile(req.user?.userId || '', updates);
        res.json({
            message: '[i18n:apiMessages.profileUpdated]',
            user,
        });
    }));

    /**
     * POST /api/auth/forgot-password
     * Request password reset token (sends via email)
     */
    router.post('/forgot-password', authLimiter, validate(authSchemas.forgotPassword), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.body;
        // Find user by email (don't reveal if user exists for security)
        const user = await authService.getUserByEmail(email);
        // Always return the same message regardless of whether user exists
        // This prevents email enumeration attacks
        const responseMessage = '[i18n:apiMessages.passwordResetLinkSent]';

        // If user exists, send reset email
        if (user) {
            try {
                // Generate reset token
                const resetToken = authService.generateResetToken(user._id);
                // Build reset link
                // Use FRONTEND_URL from configuration (defaults to http://localhost:5173 in dev)
                // We use getEnv() instead of req.get('host') to prevent Host Header Injection attacks
                const frontendUrl = getEnv().FRONTEND_URL;
                const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

                // Generate email content
                const { text, html } = generatePasswordResetEmail({
                    resetLink,
                    userName: user.name,
                    expirationHours: 1,
                });

                // Send email asynchronously (don't block response)
                emailService.send({
                    to: user.email,
                    subject: 'Password Reset Request - Beleidsscan',
                    text,
                    html,
                }).catch((error) => {
                    // Log error but don't fail the request
                    logger.error({ error, userId: user._id, email: user.email }, 'Failed to send password reset email');
                });

                // Log password reset request for audit
                await AuditLogService.logAuthEvent(
                    req,
                    'password_reset_request',
                    user._id.toString(),
                    user.email,
                    true
                ).catch((error) => {
                    // Don't fail if audit logging fails
                    logger.error({ error }, 'Failed to log password reset request audit event');
                });

                logger.info({ userId: user._id, email: user.email }, 'Password reset email sent');
            } catch (error) {
                // Log error but don't reveal to client
                logger.error({ error, email }, 'Error processing password reset request');
            }
        }

        // Always return the same response (security best practice)
        res.json({
            message: responseMessage,
        });
    }));

    /**
     * POST /api/auth/reset-password
     * Reset password with token
     */
    router.post('/reset-password', authLimiter, validate(authSchemas.resetPassword), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { token, newPassword } = req.body;

        try {
            // Decode token to get userId for audit logging (without verification - resetPassword will verify)
            let userId: string | undefined;
            let userEmail: string | undefined;
            try {
                const decoded = jwt.decode(token) as { userId?: string } | null;
                userId = decoded?.userId;

                // Get user email from database if we have userId
                if (userId) {
                    try {
                        const user = await authService.getUserById(userId);
                        userEmail = user?.email;
                    } catch {
                        // Ignore - we'll log without email (non-critical for audit logging)
                    }
                }
            } catch {
                // Ignore - we'll log without user details
            }

            // Reset password (this will verify the token)
            await authService.resetPassword(token, newPassword);

            // Log successful password reset for audit
            await AuditLogService.logAuthEvent(
                req,
                'password_reset',
                userId,
                userEmail,
                true
            ).catch((error) => {
                // Don't fail if audit logging fails
                logger.error({ error }, 'Failed to log password reset audit event');
            });

            res.json({ message: '[i18n:apiMessages.passwordResetSuccessful]' });
        } catch (error) {
            // Log failed password reset attempt for audit
            await AuditLogService.logAuthEvent(
                req,
                'password_reset',
                undefined,
                undefined,
                false,
                { error: error instanceof Error ? error.message : String(error) }
            ).catch((auditError) => {
                // Don't fail if audit logging fails
                logger.error({ error: auditError }, 'Failed to log password reset failure audit event');
            });

            // Re-throw the original error
            throw error;
        }
    }));

    /**
     * POST /api/auth/revoke-token
     * Revoke a specific token (admin or self)
     */
    router.post('/revoke-token', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { token } = req.body;
        const userId = req.user?.userId || req.user?.id;

        if (!token || typeof token !== 'string') {
            throw new BadRequestError('Token is required');
        }

        // Decode token to verify ownership (unless admin)
        const decoded = authService.verifyToken(token) as { userId?: string } | null;
        const tokenUserId = decoded?.userId;

        // Only allow revoking own tokens unless admin
        if (req.user?.role !== 'admin' && tokenUserId !== userId) {
            throw new AuthorizationError('Cannot revoke tokens belonging to other users');
        }

        const revoked = await authService.revokeToken(token);

        if (!revoked) {
            throw new ServiceUnavailableError('Failed to revoke token');
        }

        // Log revocation for audit
        await AuditLogService.logAuthEvent(
            req,
            'logout',
            tokenUserId || userId,
            undefined,
            true,
            {
                action: 'token_revoked',
                revokedBy: userId,
                isAdmin: req.user?.role === 'admin',
            }
        ).catch((error) => {
            logger.error({ error }, 'Failed to log token revocation audit event');
        });

        res.json({ message: '[i18n:apiMessages.tokenRevoked]' });
    }));

    /**
     * POST /api/auth/revoke-all-tokens
     * Revoke all tokens for the current user (or specified user if admin)
     */
    router.post('/revoke-all-tokens', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { targetUserId } = req.body;
        const userId = req.user?.userId || req.user?.id;

        // Determine which user's tokens to revoke
        let revokeUserId: string;
        if (targetUserId && req.user?.role === 'admin') {
            // Admin can revoke any user's tokens
            revokeUserId = targetUserId;
        } else {
            // Regular users can only revoke their own tokens
            revokeUserId = userId || '';
        }

        if (!revokeUserId) {
            throw new BadRequestError('User ID is required');
        }

        const revoked = await authService.revokeAllUserTokens(revokeUserId);

        if (!revoked) {
            throw new ServiceUnavailableError('Failed to revoke user tokens');
        }

        // Log revocation for audit
        await AuditLogService.logAuthEvent(
            req,
            'logout',
            revokeUserId,
            undefined,
            true,
            {
                action: 'all_tokens_revoked',
                revokedBy: userId,
                isAdmin: req.user?.role === 'admin',
            }
        ).catch((error) => {
            logger.error({ error }, 'Failed to log token revocation audit event');
        });

        res.json({
            message: '[i18n:apiMessages.allTokensRevoked]',
            userId: revokeUserId,
        });
    }));

    return router;
}
