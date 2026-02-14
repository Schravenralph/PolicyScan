import { Router, Request, Response } from 'express';
import { getNotificationService } from '../services/NotificationService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, AuthenticationError, AuthorizationError } from '../types/errors.js';
import { getTestFailureNotificationService } from '../services/testing/TestFailureNotificationService.js';
import type { AuthService } from '../services/auth/AuthService.js';

export function createNotificationRoutes(authService: AuthService): Router {
    const router = Router();
    const notificationService = getNotificationService();

    // All notification routes require authentication
    router.use(authenticate(authService));

    /**
     * GET /api/notifications
     * Get all notifications for the authenticated user
     */
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const skip = parseInt(req.query.skip as string) || 0;
        const read = req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined;

        const notifications = await notificationService.getUserNotifications(userId, {
            limit,
            skip,
            read,
        });

        res.json(notifications);
    }));

    /**
     * GET /api/notifications/unread-count
     * Get unread notification count for the authenticated user
     */
    router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const count = await notificationService.getUnreadCount(userId);
        res.json({ count });
    }));

    /**
     * PATCH /api/notifications/:id/read
     * Mark a notification as read
     */
    router.patch('/:id/read', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const { id } = req.params;

        // Verify the notification belongs to the user
        const { Notification } = await import('../models/Notification.js');
        const notification = await Notification.findById(id);
        if (!notification) {
            throw new NotFoundError('Notification', id);
        }

        if (notification.user_id.toString() !== userId) {
            throw new AuthorizationError(`Unauthorized: Notification ${id} belongs to user ${notification.user_id.toString()}, but request is from user ${userId}`);
        }

        const updated = await notificationService.markAsRead(id);
        if (!updated) {
            throw new NotFoundError('Notification', id);
        }

        res.json(updated);
    }));

    /**
     * POST /api/notifications/mark-all-read
     * Mark all notifications as read for the authenticated user
     */
    router.post('/mark-all-read', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const count = await notificationService.markAllAsRead(userId);
        res.json({ message: '[i18n:apiMessages.allNotificationsMarkedRead]', count });
    }));

    /**
     * DELETE /api/notifications/:id
     * Delete a notification
     */
    router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const { id } = req.params;

        // Verify the notification belongs to the user
        const { Notification } = await import('../models/Notification.js');
        const notification = await Notification.findById(id);
        if (!notification) {
            throw new NotFoundError('Notification', id);
        }

        if (notification.user_id.toString() !== userId) {
            throw new AuthorizationError(`Unauthorized: Notification ${id} belongs to user ${notification.user_id.toString()}, but request is from user ${userId}`);
        }

        const deleted = await notificationService.deleteNotification(id);
        if (!deleted) {
            throw new NotFoundError('Notification', id);
        }

        res.json({ message: '[i18n:apiMessages.notificationDeleted]' });
    }));

    /**
     * GET /api/notifications/preferences
     * Get notification preferences for the authenticated user
     */
    router.get('/preferences', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const testFailureService = getTestFailureNotificationService();
        const preferences = await testFailureService.getUserPreferences(userId);
        res.json(preferences);
    }));

    /**
     * PUT /api/notifications/preferences
     * Update notification preferences for the authenticated user
     */
    router.put('/preferences', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User not authenticated');
        }

        const preferences = {
            userId,
            emailEnabled: req.body.emailEnabled ?? false,
            slackEnabled: req.body.slackEnabled ?? false,
            inAppEnabled: req.body.inAppEnabled ?? true,
            notificationTypes: {
                testFailureAfterPassing: req.body.notificationTypes?.testFailureAfterPassing ?? true,
                flakyTest: req.body.notificationTypes?.flakyTest ?? true,
                performanceRegression: req.body.notificationTypes?.performanceRegression ?? true,
                coverageDrop: req.body.notificationTypes?.coverageDrop ?? true,
                generalFailure: req.body.notificationTypes?.generalFailure ?? true,
            },
            quietHours: req.body.quietHours,
        };

        const testFailureService = getTestFailureNotificationService();
        await testFailureService.saveUserPreferences(preferences);
        res.json(preferences);
    }));

    return router;
}
