/**
 * User Management Admin Routes
 * 
 * Routes for managing users in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase, executeDatabaseOperation } from './shared/databaseHelpers.js';
import { parsePagination, sendPaginatedOrArray } from './shared/responseHelpers.js';
import { validateObjectId, validateRole, validateBoolean } from './shared/validation.js';
import { sanitizeInput, asyncHandler } from './shared/middleware.js';
import { mapUserToAdminDto } from '../../utils/mappers.js';
import { throwIfNotFound } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError } from '../../types/errors.js';
import { AuditLogService } from '../../services/AuditLogService.js';
import { AuthService } from '../../services/auth/AuthService.js';
import type { UserDocument } from './shared/types.js';

/**
 * Register user management routes
 * 
 * @param router - Express router instance
 * @param authService - Authentication service instance
 */
export function registerUserRoutes(router: Router, authService?: AuthService): void {
    /**
     * GET /api/admin/users
     * Get all users with pagination
     */
    router.get('/users', asyncHandler(async (req: Request, res: Response) => {
        // Ensure database connection is active before operations
        const db = await getDatabase();
        const { limit, skip, page } = parsePagination(req.query, {
            defaultLimit: 20,
            maxLimit: 100
        });

        const usersCollection = db.collection<UserDocument>('users');
        const [users, total] = await Promise.all([
            db.collection<UserDocument>('users')
                .find({}, { projection: { passwordHash: 0 } })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            usersCollection.countDocuments({})
        ]);

        const usersList = users.map(mapUserToAdminDto);

        // Return array directly for backward compatibility with tests
        // If pagination metadata is needed, it can be requested via ?includePagination=true
        sendPaginatedOrArray(
            res,
            usersList,
            total,
            limit,
            page,
            skip,
            req.query.includePagination === 'true'
        );
    }));

    /**
     * PATCH /api/admin/users/:id/role
     * Update user role
     */
    router.patch('/users/:id/role',
        sanitizeInput,
        asyncHandler(async (req: Request, res: Response) => {
            const idString = validateObjectId(req.params.id, 'User ID');
            const id = new ObjectId(idString);
            const { role } = req.body;

            const validatedRole = validateRole(role);

            const db = await getDatabase();
            const usersCollection = db.collection<UserDocument>('users');
            const user = await usersCollection.findOneAndUpdate(
                { _id: id },
                { $set: { role: validatedRole, updatedAt: new Date() } },
                { returnDocument: 'after' }
            );

            throwIfNotFound(user, 'User', idString);

            res.json({
                success: true,
                message: '[i18n:apiMessages.userRoleUpdated]',
                user: mapUserToAdminDto(user!),
                timestamp: new Date().toISOString(),
            });
        })
    );

    /**
     * PATCH /api/admin/users/:id/status
     * Update user active status
     */
    router.patch('/users/:id/status',
        sanitizeInput,
        asyncHandler(async (req: Request, res: Response) => {
            const idString = validateObjectId(req.params.id, 'User ID');
            const id = new ObjectId(idString);
            const { active } = req.body;

            const validatedActive = validateBoolean(active, 'active');

            // Ensure database connection is active before operations
            const db = await getDatabase();
            const usersCollection = db.collection<UserDocument>('users');
            const user = await usersCollection.findOne({ _id: id });
            throwIfNotFound(user, 'User', idString);

            const oldStatus = user.active ?? true;
            await usersCollection.updateOne(
                { _id: id },
                { $set: { active: validatedActive } }
            );

            // Log audit entry
            await AuditLogService.logUserStatusChange(req, idString, oldStatus, validatedActive);

            res.json({ message: validatedActive ? '[i18n:apiMessages.userActivated]' : '[i18n:apiMessages.userDeactivated]' });
        })
    );

    /**
     * POST /api/admin/users/:id/reset-password
     * Admin reset user password
     */
    router.post('/users/:id/reset-password',
        sanitizeInput,
        asyncHandler(async (req: Request, res: Response) => {
            const idString = validateObjectId(req.params.id, 'User ID');
            const id = new ObjectId(idString);
            const { newPassword } = req.body;

            if (!newPassword || typeof newPassword !== 'string') {
                throw new BadRequestError('Password is required');
            }

            if (newPassword.length < 8) {
                throw new BadRequestError('Password must be at least 8 characters long');
            }

            // Ensure database connection is active before operations
            const db = await getDatabase();
            const usersCollection = db.collection<UserDocument>('users');

            await executeDatabaseOperation(async () => {
                const user = await usersCollection.findOne({ _id: id });
                throwIfNotFound(user, 'User', idString);

                // Need AuthService for hashing
                if (!authService) {
                    // Should not happen if properly initialized
                    throw new ServiceUnavailableError('AuthService not available', {
                        userId: idString,
                        reason: 'auth_service_not_initialized',
                        operation: 'updatePassword'
                    });
                }

                const passwordHash = await authService.hashPassword(newPassword);

                await usersCollection.updateOne(
                    { _id: id },
                    {
                        $set: {
                            passwordHash,
                            updatedAt: new Date(),
                            // Clear any lockout
                            failedLoginAttempts: 0,
                        },
                        $unset: { lockoutUntil: '', lastFailedLogin: '' }
                    }
                );
            }, 'UserRoutes.resetPassword');

            // Revoke all tokens for the user
            if (authService) {
                await authService.revokeAllUserTokens(idString);
            }

            // Log audit entry
            await AuditLogService.logAction(req, 'user_password_reset', 'user', idString, {
                targetUserId: idString
            });

            res.json({ message: '[i18n:apiMessages.passwordReset]' });
        })
    );
}

