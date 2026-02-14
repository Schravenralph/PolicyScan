import { TestStatus } from '../services/api/TestApiService';
export interface UseTestNotificationsResult {
    notificationPermission: NotificationPermission;
    notificationsEnabled: boolean;
    toggleNotifications: () => Promise<void>;
    showTestCompletionNotification: (status: TestStatus) => void;
    showCommandCompletionNotification: (command: string, success: boolean, duration: number) => void;
}
export declare function useTestNotifications(): UseTestNotificationsResult;
