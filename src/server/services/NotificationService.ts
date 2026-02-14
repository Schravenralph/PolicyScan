import { Notification, NotificationCreateInput, NotificationResponse } from '../models/Notification.js';
import { logger } from '../utils/logger.js';

export class NotificationService {
    /**
     * Create a workflow completion notification
     */
    async createWorkflowCompleteNotification(
        userId: string,
        workflowName: string,
        runId: string,
        workflowId?: string
    ): Promise<NotificationResponse> {
        const notification = await Notification.create({
            user_id: userId,
            type: 'workflow_complete',
            title: `Workflow "${workflowName}" completed`,
            message: `Workflow "${workflowName}" has completed successfully.`,
            link: `/workflows/${workflowId || 'runs'}/${runId}`,
            metadata: {
                workflowId,
                runId,
            },
        });

        return Notification.toResponse(notification);
    }

    /**
     * Create a workflow failure notification
     */
    async createWorkflowFailureNotification(
        userId: string,
        workflowName: string,
        runId: string,
        errorDetails: string,
        workflowId?: string
    ): Promise<NotificationResponse> {
        logger.error({ userId, workflowName, runId, errorDetails }, 'Creating workflow failure notification');
        const notification = await Notification.create({
            user_id: userId,
            type: 'workflow_failed',
            title: `Workflow "${workflowName}" failed`,
            message: `Workflow "${workflowName}" encountered an error: ${errorDetails}`,
            link: `/workflows/${workflowId || 'runs'}/${runId}`,
            metadata: {
                workflowId,
                runId,
                errorDetails,
            },
        });

        return Notification.toResponse(notification);
    }

    /**
     * Create a workflow sharing notification
     */
    async createWorkflowSharedNotification(
        userId: string,
        workflowName: string,
        sharedBy: string,
        sharedByName: string,
        workflowId: string,
        message?: string
    ): Promise<NotificationResponse> {
        const notification = await Notification.create({
            user_id: userId,
            type: 'workflow_shared',
            title: `${sharedByName} shared a workflow with you`,
            message: message || `${sharedByName} shared the workflow "${workflowName}" with you.`,
            link: `/workflows/${workflowId}`,
            metadata: {
                workflowId,
                sharedBy,
                sharedByName,
            },
        });

        return Notification.toResponse(notification);
    }

    /**
     * Create a system maintenance notification
     */
    async createSystemMaintenanceNotification(
        userId: string,
        title: string,
        message: string
    ): Promise<NotificationResponse> {
        const notification = await Notification.create({
            user_id: userId,
            type: 'system_maintenance',
            title,
            message,
        });

        return Notification.toResponse(notification);
    }

    /**
     * Create a review request notification
     */
    async createReviewRequestNotification(
        userId: string,
        runId: string,
        workflowId: string,
        moduleName: string,
        moduleId: string,
        candidateCount: number
    ): Promise<NotificationResponse> {
        const notification = await Notification.create({
            user_id: userId,
            type: 'review_request',
            title: `Review required: ${moduleName}`,
            message: `A workflow run requires your review. ${candidateCount} candidate${candidateCount !== 1 ? 's' : ''} need${candidateCount === 1 ? 's' : ''} review.`,
            link: `/workflows/runs/${runId}`,
            metadata: {
                workflowId,
                runId,
                reviewId: undefined, // Will be set when review is created
                moduleId,
                moduleName,
                candidateCount,
            },
        });

        return Notification.toResponse(notification);
    }

    /**
     * Get all notifications for a user
     */
    async getUserNotifications(
        userId: string,
        options: {
            limit?: number;
            skip?: number;
            read?: boolean;
        } = {}
    ): Promise<NotificationResponse[]> {
        const notifications = await Notification.findByUserId(userId, options);
        return notifications.map(Notification.toResponse);
    }

    /**
     * Get unread notification count for a user
     */
    async getUnreadCount(userId: string): Promise<number> {
        return Notification.countUnread(userId);
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId: string): Promise<NotificationResponse | null> {
        const notification = await Notification.markAsRead(notificationId);
        return notification ? Notification.toResponse(notification) : null;
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string): Promise<number> {
        return Notification.markAllAsRead(userId);
    }

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId: string): Promise<boolean> {
        return Notification.delete(notificationId);
    }

    /**
     * Create a test failure notification
     */
    async createTestFailureNotification(
        userId: string,
        testRunId: string,
        testFile: string | null,
        failureCount: number,
        totalTests: number,
        failures: Array<{ test: string; file: string; error: string }>,
        testResultUrl?: string
    ): Promise<NotificationResponse> {
        const notification = await Notification.create({
            user_id: userId,
            type: 'test_failure',
            title: `❌ Test Failure: ${failureCount} failure${failureCount !== 1 ? 's' : ''}`,
            message: `${failureCount} of ${totalTests} test${totalTests !== 1 ? 's' : ''} failed${testFile ? ` in ${testFile}` : ''}.`,
            link: testResultUrl || `/tests/runs/${testRunId}`,
            metadata: {
                testRunId,
                testFile,
                failureCount,
                totalTests,
                failures: failures.slice(0, 10), // Limit to first 10 failures
            },
        });

        return Notification.toResponse(notification);
    }

    /**
     * Create a notification (generic method)
     */
    async createNotification(input: NotificationCreateInput): Promise<NotificationResponse> {
        const notification = await Notification.create(input);
        return Notification.toResponse(notification);
    }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
    if (!notificationServiceInstance) {
        notificationServiceInstance = new NotificationService();
    }
    return notificationServiceInstance;
}

