import { BaseApiService } from './BaseApiService';
/**
 * Notification API service
 */
export declare class NotificationApiService extends BaseApiService {
    getNotifications(options?: {
        limit?: number;
        skip?: number;
        read?: boolean;
    }): Promise<{
        notification_id: string;
        user_id: string;
        type: "workflow_complete" | "workflow_failed" | "workflow_shared" | "system_maintenance" | "new_relevant_documents";
        title: string;
        message: string;
        link?: string;
        read: boolean;
        created_at: string;
        metadata?: Record<string, unknown>;
    }[]>;
    getUnreadNotificationCount(): Promise<{
        count: number;
    }>;
    markNotificationAsRead(notificationId: string): Promise<{
        notification_id: string;
        user_id: string;
        type: string;
        title: string;
        message: string;
        link?: string;
        read: boolean;
        created_at: string;
        metadata?: Record<string, unknown>;
    }>;
    markAllNotificationsAsRead(): Promise<{
        message: string;
        count: number;
    }>;
    deleteNotification(notificationId: string): Promise<{
        message: string;
    }>;
}
