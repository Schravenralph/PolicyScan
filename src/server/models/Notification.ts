import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

export type NotificationType = 
    | 'workflow_complete'
    | 'workflow_failed'
    | 'workflow_shared'
    | 'workflow_ownership_transferred'
    | 'workflow_access_removed'
    | 'system_maintenance'
    | 'new_relevant_documents'
    | 'review_request'
    | 'test_failure'
    | 'test_flaky'
    | 'test_performance_regression'
    | 'test_coverage_drop';

export interface NotificationDocument {
    _id?: ObjectId;
    notification_id: string; // Unique identifier (can be used for deduplication)
    user_id: ObjectId;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    read: boolean;
    created_at: Date;
    metadata?: {
        workflowId?: string;
        runId?: string;
        errorDetails?: string;
        sharedBy?: string;
        sharedByName?: string;
        reviewId?: string;
        moduleId?: string;
        moduleName?: string;
        candidateCount?: number;
        [key: string]: unknown;
    };
}

export interface NotificationCreateInput {
    user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: NotificationDocument['metadata'];
}

export interface NotificationResponse {
    notification_id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    read: boolean;
    created_at: Date;
    metadata?: NotificationDocument['metadata'];
}

const COLLECTION_NAME = 'notifications';

export class Notification {
    /**
     * Create a new notification
     */
    static async create(notificationData: NotificationCreateInput): Promise<NotificationDocument> {
        const db = getDB();
        const notificationId = new ObjectId().toString();
        
        const notification: NotificationDocument = {
            notification_id: notificationId,
            user_id: new ObjectId(notificationData.user_id),
            type: notificationData.type,
            title: notificationData.title,
            message: notificationData.message,
            link: notificationData.link,
            read: false,
            created_at: new Date(),
            metadata: notificationData.metadata || {},
        };

        const result = await db.collection<NotificationDocument>(COLLECTION_NAME).insertOne(notification);
        return { ...notification, _id: result.insertedId };
    }

    /**
     * Find a notification by ID
     */
    static async findById(id: string): Promise<NotificationDocument | null> {
        const db = getDB();
        return await db.collection<NotificationDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
    }

    /**
     * Find notifications by user ID
     */
    static async findByUserId(
        userId: string,
        options: {
            limit?: number;
            skip?: number;
            read?: boolean;
            sort?: Record<string, 1 | -1>;
        } = {}
    ): Promise<NotificationDocument[]> {
        const db = getDB();
        const { limit = 50, skip = 0, read, sort = { created_at: -1 } } = options;

        const query: { user_id: ObjectId; read?: boolean } = { user_id: new ObjectId(userId) };
        if (read !== undefined) {
            query.read = read;
        }

        return await db.collection<NotificationDocument>(COLLECTION_NAME)
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    /**
     * Count unread notifications for a user
     */
    static async countUnread(userId: string): Promise<number> {
        const db = getDB();
        return await db.collection<NotificationDocument>(COLLECTION_NAME).countDocuments({
            user_id: new ObjectId(userId),
            read: false,
        });
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(id: string): Promise<NotificationDocument | null> {
        const db = getDB();
        const result = await db.collection<NotificationDocument>(COLLECTION_NAME).findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: { read: true } },
            { returnDocument: 'after' }
        );

        return result || null;
    }

    /**
     * Mark all notifications as read for a user
     */
    static async markAllAsRead(userId: string): Promise<number> {
        const db = getDB();
        const result = await db.collection<NotificationDocument>(COLLECTION_NAME).updateMany(
            { user_id: new ObjectId(userId), read: false },
            { $set: { read: true } }
        );

        return result.modifiedCount;
    }

    /**
     * Delete a notification
     */
    static async delete(id: string): Promise<boolean> {
        const db = getDB();
        const result = await db.collection<NotificationDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
        return result.deletedCount > 0;
    }

    /**
     * Delete all read notifications for a user (cleanup)
     */
    static async deleteRead(userId: string, olderThanDays?: number): Promise<number> {
        const db = getDB();
        const query: { user_id: ObjectId; read: boolean; created_at?: { $lt: Date } } = {
            user_id: new ObjectId(userId),
            read: true,
        };

        if (olderThanDays) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            query.created_at = { $lt: cutoffDate };
        }

        const result = await db.collection<NotificationDocument>(COLLECTION_NAME).deleteMany(query);
        return result.deletedCount;
    }

    /**
     * Convert notification document to response format
     */
    static toResponse(notification: NotificationDocument): NotificationResponse {
        return {
            notification_id: notification.notification_id,
            user_id: notification.user_id.toString(),
            type: notification.type,
            title: notification.title,
            message: notification.message,
            link: notification.link,
            read: notification.read,
            created_at: notification.created_at,
            metadata: notification.metadata,
        };
    }
}

