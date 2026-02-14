import { useState, useCallback, useEffect } from 'react';
import { TestStatus } from '../services/api/TestApiService';

export interface UseTestNotificationsResult {
  notificationPermission: NotificationPermission;
  notificationsEnabled: boolean;
  toggleNotifications: () => Promise<void>;
  showTestCompletionNotification: (status: TestStatus) => void;
  showCommandCompletionNotification: (command: string, success: boolean, duration: number) => void;
}

export function useTestNotifications(): UseTestNotificationsResult {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('testNotificationsEnabled');
      return stored ? JSON.parse(stored) : false;
    } catch (error) {
      console.warn('Invalid testNotificationsEnabled value in localStorage, resetting to default:', error);
      localStorage.removeItem('testNotificationsEnabled');
      return false;
    }
  });

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    if (notificationPermission === 'default') {
      // Request permission
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          localStorage.setItem('testNotificationsEnabled', JSON.stringify(true));
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    } else if (notificationPermission === 'granted') {
      // Toggle enabled state
      const newEnabled = !notificationsEnabled;
      setNotificationsEnabled(newEnabled);
      localStorage.setItem('testNotificationsEnabled', JSON.stringify(newEnabled));
    }
  }, [notificationPermission, notificationsEnabled]);

  // Show test completion notification
  const showTestCompletionNotification = useCallback((status: TestStatus) => {
    if (!('Notification' in window) || notificationPermission !== 'granted' || !notificationsEnabled) {
      return;
    }

    const title = status.error
      ? `Tests Completed: Error`
      : `Tests Completed`;

    const body = status.error
      ? `Error: ${status.error}`
      : `Test execution finished. Check the dashboard for results.`;

    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo.svg',
        tag: 'test-completion',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => {
        notification.close();
      }, 10000);
    } catch (err) {
      console.error('Error showing notification:', err);
    }
  }, [notificationPermission, notificationsEnabled]);

  // Show command completion notification
  const showCommandCompletionNotification = useCallback((command: string, success: boolean, duration: number) => {
    if (!('Notification' in window) || notificationPermission !== 'granted' || !notificationsEnabled) {
      return;
    }

    const durationSec = (duration / 1000).toFixed(1);

    try {
      const notification = new Notification(
        success ? 'Command Completed' : 'Command Failed',
        {
          body: `${command} ${success ? 'finished' : 'failed'} in ${durationSec}s`,
          icon: '/logo.svg',
          tag: 'command-completion',
          requireInteraction: false,
        }
      );

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 10000);
    } catch (err) {
      console.error('Error showing notification:', err);
    }
  }, [notificationPermission, notificationsEnabled]);

  return {
    notificationPermission,
    notificationsEnabled,
    toggleNotifications,
    showTestCompletionNotification,
    showCommandCompletionNotification
  };
}
