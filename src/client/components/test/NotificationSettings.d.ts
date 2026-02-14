/**
 * Notification Settings Component
 *
 * UI for configuring test notification preferences (browser, email, Slack).
 */
import { TestNotificationService } from '../../services/notifications/TestNotificationService';
interface NotificationSettingsProps {
    testNotificationService?: TestNotificationService;
}
export declare function NotificationSettings({ testNotificationService: injectedService }: NotificationSettingsProps): import("react/jsx-runtime").JSX.Element;
export {};
