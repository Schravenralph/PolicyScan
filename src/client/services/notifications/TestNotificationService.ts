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

export class TestNotificationService {
  private static instance: TestNotificationService | null = null;
  private permission: NotificationPermission = 'default';
  private channels: Map<string, NotificationChannel> = new Map();

  private constructor() {
    // Initialize browser notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }

    // Load saved channel preferences
    this.loadChannelPreferences();
  }

  static getInstance(): TestNotificationService {
    if (!TestNotificationService.instance) {
      TestNotificationService.instance = new TestNotificationService();
    }
    return TestNotificationService.instance;
  }

  /**
   * Request browser notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission();
    }

    return this.permission;
  }

  /**
   * Send browser notification
   */
  async sendBrowserNotification(options: NotificationOptions): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (this.permission !== 'granted') {
      const newPermission = await this.requestPermission();
      if (newPermission !== 'granted') {
        return;
      }
    }

    const channel = this.channels.get('browser');
    if (!channel || !channel.enabled) {
      return;
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        badge: options.badge || '/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,
        data: options.data,
      });

      // Auto-close after 5 seconds (unless requireInteraction is true)
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Failed to send browser notification:', error);
    }
  }

  /**
   * Send email notification (requires backend API)
   */
  async sendEmailNotification(options: {
    to: string;
    subject: string;
    body: string;
    html?: string;
  }): Promise<void> {
    const channel = this.channels.get('email');
    if (!channel || !channel.enabled) {
      return;
    }

    try {
      const response = await fetch('/api/tests/notifications/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error(`Failed to send email: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  /**
   * Send Slack notification (requires backend API)
   */
  async sendSlackNotification(options: {
    channel?: string;
    text: string;
    blocks?: unknown[];
    attachments?: unknown[];
    webhookUrl?: string;
  }): Promise<void> {
    const channel = this.channels.get('slack');
    if (!channel || !channel.enabled) {
      return;
    }

    // Get webhook URL from options, config, or environment
    const webhookUrl = options.webhookUrl || 
                      (channel.config?.webhookUrl as string | undefined) ||
                      undefined;

    if (!webhookUrl) {
      throw new Error('Slack webhook URL is required. Please configure it in notification settings.');
    }

    try {
      const response = await fetch('/api/tests/notifications/slack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...options,
          webhookUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to send Slack message: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      throw error;
    }
  }

  /**
   * Notify about test failure
   */
  async notifyTestFailure(testInfo: {
    testId: string;
    testName: string;
    error: string;
    runId: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<void> {
    const severity = testInfo.severity || 'medium';
    const title = `Test Failed: ${testInfo.testName}`;
    const body = `Test ${testInfo.testId} failed with error: ${testInfo.error}`;

    // Browser notification
    await this.sendBrowserNotification({
      title,
      body,
      tag: `test-failure-${testInfo.runId}`,
      requireInteraction: severity === 'critical' || severity === 'high',
      data: {
        type: 'test-failure',
        testId: testInfo.testId,
        runId: testInfo.runId,
        severity,
      },
    });

    // Email notification for critical/high severity
    if (severity === 'critical' || severity === 'high') {
      const emailConfig = this.channels.get('email')?.config as { recipients?: string[] } | undefined;
      if (emailConfig?.recipients) {
        for (const recipient of emailConfig.recipients) {
          await this.sendEmailNotification({
            to: recipient,
            subject: title,
            body,
            html: `<p>${body}</p><p>Run ID: ${testInfo.runId}</p>`,
          });
        }
      }
    }

    // Slack notification
    await this.sendSlackNotification({
      text: `🚨 ${title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${title}*\n${body}\n*Run ID:* ${testInfo.runId}`,
          },
        },
      ],
    });
  }

  /**
   * Notify about test completion
   */
  async notifyTestCompletion(runInfo: {
    runId: string;
    status: 'completed' | 'failed' | 'cancelled';
    totalTests: number;
    passed: number;
    failed: number;
    duration: number;
  }): Promise<void> {
    const title = `Test Run ${runInfo.status === 'completed' ? 'Completed' : runInfo.status === 'failed' ? 'Failed' : 'Cancelled'}`;
    const body = `${runInfo.passed}/${runInfo.totalTests} tests passed in ${(runInfo.duration / 1000).toFixed(1)}s`;

    await this.sendBrowserNotification({
      title,
      body,
      tag: `test-completion-${runInfo.runId}`,
      requireInteraction: runInfo.status === 'failed',
      data: {
        type: 'test-completion',
        runId: runInfo.runId,
        status: runInfo.status,
      },
    });
  }

  /**
   * Notify about critical alert
   */
  async notifyCriticalAlert(alert: {
    id: string;
    type: string;
    title: string;
    message: string;
    affectedTests?: string[];
  }): Promise<void> {
    const title = `🚨 Critical Alert: ${alert.title}`;
    const body = alert.message;

    await this.sendBrowserNotification({
      title,
      body,
      tag: `alert-${alert.id}`,
      requireInteraction: true,
      data: {
        type: 'critical-alert',
        alertId: alert.id,
      },
    });

    // Always send email for critical alerts
    const emailConfig = this.channels.get('email')?.config as { recipients?: string[] } | undefined;
    if (emailConfig?.recipients) {
      for (const recipient of emailConfig.recipients) {
        await this.sendEmailNotification({
          to: recipient,
          subject: title,
          body,
          html: `<h2>${alert.title}</h2><p>${alert.message}</p>`,
        });
      }
    }

    // Slack notification
    await this.sendSlackNotification({
      text: title,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${alert.title}*\n${alert.message}`,
          },
        },
      ],
    });
  }

  /**
   * Enable/disable notification channel
   */
  setChannelEnabled(channelType: 'browser' | 'email' | 'slack', enabled: boolean): void {
    const channel = this.channels.get(channelType) || {
      type: channelType,
      enabled: false,
    };
    channel.enabled = enabled;
    this.channels.set(channelType, channel);
    this.saveChannelPreferences();
  }

  /**
   * Configure notification channel
   */
  configureChannel(channelType: 'browser' | 'email' | 'slack', config: Record<string, unknown>): void {
    const channel = this.channels.get(channelType) || {
      type: channelType,
      enabled: false,
    };
    channel.config = config;
    this.channels.set(channelType, channel);
    this.saveChannelPreferences();
  }

  /**
   * Get channel status
   */
  getChannelStatus(channelType: 'browser' | 'email' | 'slack'): NotificationChannel | null {
    return this.channels.get(channelType) || null;
  }

  /**
   * Load channel preferences from localStorage
   */
  private loadChannelPreferences(): void {
    try {
      const stored = localStorage.getItem('testNotificationChannels');
      if (stored) {
        const channels = JSON.parse(stored);
        Object.entries(channels).forEach(([type, config]) => {
          this.channels.set(type, config as NotificationChannel);
        });
      } else {
        // Default: browser enabled
        this.channels.set('browser', {
          type: 'browser',
          enabled: true,
        });
      }
    } catch (error) {
      console.warn('Failed to load notification channel preferences:', error);
      // Default: browser enabled
      this.channels.set('browser', {
        type: 'browser',
        enabled: true,
      });
    }
  }

  /**
   * Save channel preferences to localStorage
   */
  private saveChannelPreferences(): void {
    try {
      const channels: Record<string, NotificationChannel> = {};
      this.channels.forEach((channel, type) => {
        channels[type] = channel;
      });
      localStorage.setItem('testNotificationChannels', JSON.stringify(channels));
    } catch (error) {
      console.warn('Failed to save notification channel preferences:', error);
    }
  }

  /**
   * Get current permission status
   */
  getPermission(): NotificationPermission {
    return this.permission;
  }
}

export function getTestNotificationService(): TestNotificationService {
  return TestNotificationService.getInstance();
}

