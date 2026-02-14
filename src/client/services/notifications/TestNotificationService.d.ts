/**
 * Test Notification Service
 *
 * Handles browser, email, and Slack notifications for test events.
 */
export interface NotificationOptions {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
    silent?: boolean;
    data?: Record<string, unknown>;
}
export interface NotificationChannel {
    type: 'browser' | 'email' | 'slack';
    enabled: boolean;
    config?: Record<string, unknown>;
}
export declare class TestNotificationService {
    private static instance;
    private permission;
    private channels;
    private constructor();
    static getInstance(): TestNotificationService;
    /**
     * Request browser notification permission
     */
    requestPermission(): Promise<NotificationPermission>;
    /**
     * Send browser notification
     */
    sendBrowserNotification(options: NotificationOptions): Promise<void>;
    /**
     * Send email notification (requires backend API)
     */
    sendEmailNotification(options: {
        to: string;
        subject: string;
        body: string;
        html?: string;
    }): Promise<void>;
    /**
     * Send Slack notification (requires backend API)
     */
    sendSlackNotification(options: {
        channel?: string;
        text: string;
        blocks?: unknown[];
        attachments?: unknown[];
        webhookUrl?: string;
    }): Promise<void>;
    /**
     * Notify about test failure
     */
    notifyTestFailure(testInfo: {
        testId: string;
        testName: string;
        error: string;
        runId: string;
        severity?: 'low' | 'medium' | 'high' | 'critical';
    }): Promise<void>;
    /**
     * Notify about test completion
     */
    notifyTestCompletion(runInfo: {
        runId: string;
        status: 'completed' | 'failed' | 'cancelled';
        totalTests: number;
        passed: number;
        failed: number;
        duration: number;
    }): Promise<void>;
    /**
     * Notify about critical alert
     */
    notifyCriticalAlert(alert: {
        id: string;
        type: string;
        title: string;
        message: string;
        affectedTests?: string[];
    }): Promise<void>;
    /**
     * Enable/disable notification channel
     */
    setChannelEnabled(channelType: 'browser' | 'email' | 'slack', enabled: boolean): void;
    /**
     * Configure notification channel
     */
    configureChannel(channelType: 'browser' | 'email' | 'slack', config: Record<string, unknown>): void;
    /**
     * Get channel status
     */
    getChannelStatus(channelType: 'browser' | 'email' | 'slack'): NotificationChannel | null;
    /**
     * Load channel preferences from localStorage
     */
    private loadChannelPreferences;
    /**
     * Save channel preferences to localStorage
     */
    private saveChannelPreferences;
    /**
     * Get current permission status
     */
    getPermission(): NotificationPermission;
}
export declare function getTestNotificationService(): TestNotificationService;
