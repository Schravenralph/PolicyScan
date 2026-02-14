import { BaseApiService } from './BaseApiService';

/**
 * Notification API service
 */
export class NotificationApiService extends BaseApiService {
  async getNotifications(options?: { limit?: number; skip?: number; read?: boolean }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.skip) params.append('skip', options.skip.toString());
    if (options?.read !== undefined) params.append('read', options.read.toString());

    return this.request<
      Array<{
        notification_id: string;
        user_id: string;
        type:
          | 'workflow_complete'
          | 'workflow_failed'
          | 'workflow_shared'
          | 'system_maintenance'
          | 'new_relevant_documents';
        title: string;
        message: string;
        link?: string;
        read: boolean;
        created_at: string;
        metadata?: Record<string, unknown>;
      }>
    >(`/notifications${params.toString() ? `?${params.toString()}` : ''}`);
  }

  async getUnreadNotificationCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request<{
      notification_id: string;
      user_id: string;
      type: string;
      title: string;
      message: string;
      link?: string;
      read: boolean;
      created_at: string;
      metadata?: Record<string, unknown>;
    }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    });
  }

  async markAllNotificationsAsRead() {
    return this.request<{ message: string; count: number }>('/notifications/mark-all-read', {
      method: 'POST',
    });
  }

  async deleteNotification(notificationId: string) {
    return this.request<{ message: string }>(`/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  }
}

