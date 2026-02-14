/**
 * WorkflowAlertService
 * 
 * Service for managing workflow timeout alerts and notifications.
 * Provides alerts for workflows approaching timeout limits and high timeout rates.
 */

import { getNotificationService } from '../NotificationService.js';
import { getWorkflowMetricsService } from './WorkflowMetricsService.js';
import { getAlertConfig } from '../../config/alertConfig.js';
import type { AlertChannel, AlertSeverity, AlertConfig } from '../../types/AlertTypes.js';
import { logger } from '../../utils/logger.js';
import { AlertingService } from '../monitoring/AlertingService.js';
import { getEmailService } from '../infrastructure/EmailService.js';
import { getWebhookService } from '../infrastructure/WebhookService.js';

/**
 * Alert data structure
 */
export interface WorkflowAlert {
  type: 'timeout_warning' | 'timeout_rate_high' | 'slow_execution';
  workflowId: string;
  workflowName: string;
  stepId?: string;
  stepName?: string;
  runId?: string;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Alert deduplication key
 */
type AlertKey = string;

/**
 * Service for managing workflow timeout alerts
 */
export class WorkflowAlertService {
  private alertingService: AlertingService;
  private sentAlerts: Map<AlertKey, Date> = new Map();
  private readonly ALERT_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.alertingService = new AlertingService();
  }

  /**
   * Check and send timeout warning alert if threshold is reached
   * 
   * @param runId - Run ID
   * @param workflowId - Workflow ID
   * @param workflowName - Workflow name
   * @param elapsedMs - Elapsed time in milliseconds
   * @param timeoutMs - Timeout limit in milliseconds
   * @param stepId - Optional step ID
   * @param stepName - Optional step name
   * @param userId - Optional user ID for in-app notifications
   */
  async checkTimeoutWarning(
    runId: string,
    workflowId: string,
    workflowName: string,
    elapsedMs: number,
    timeoutMs: number,
    stepId?: string,
    stepName?: string,
    userId?: string
  ): Promise<void> {
    try {
      const config = await getAlertConfig(workflowId, stepId);
      if (!config.enabled) {
        return;
      }

      const percentageUsed = (elapsedMs / timeoutMs) * 100;
      
      if (percentageUsed < config.timeoutThreshold) {
        return; // Below threshold
      }

      // Determine severity based on percentage
      const severity: AlertSeverity = 
        percentageUsed >= 95 ? 'critical' :
        percentageUsed >= 90 ? 'high' :
        percentageUsed >= 85 ? 'medium' :
        'low';

      const alert: WorkflowAlert = {
        type: 'timeout_warning',
        workflowId,
        workflowName,
        stepId,
        stepName,
        runId,
        severity,
        message: stepName
          ? `Workflow "${workflowName}" (step: "${stepName}") is at ${Math.round(percentageUsed)}% of timeout limit`
          : `Workflow "${workflowName}" is at ${Math.round(percentageUsed)}% of timeout limit`,
        timestamp: new Date(),
        metadata: {
          elapsedMs,
          timeoutMs,
          percentageUsed: Math.round(percentageUsed),
          runId,
        },
      };

      // Check deduplication
      const alertKey = this.getAlertKey(alert);
      if (this.isDuplicate(alertKey)) {
        logger.debug({ alertKey, workflowId, stepId }, 'Skipping duplicate timeout warning alert');
        return;
      }

      // Send alerts to configured channels
      await this.sendAlert(alert, config, userId);
      
      // Record alert sent
      this.sentAlerts.set(alertKey, new Date());
    } catch (error) {
      // Don't throw - alert failures shouldn't break workflow execution
      logger.error(
        { error, workflowId, stepId, runId },
        'Failed to check/send timeout warning alert'
      );
    }
  }

  /**
   * Check and send timeout rate alert if threshold is exceeded
   * 
   * @param workflowId - Workflow ID
   * @param workflowName - Workflow name
   * @param stepId - Optional step ID
   * @param stepName - Optional step name
   */
  async checkTimeoutRate(
    workflowId: string,
    workflowName: string,
    stepId?: string,
    stepName?: string
  ): Promise<void> {
    try {
      const config = await getAlertConfig(workflowId, stepId);
      if (!config.enabled) {
        return;
      }

      const metricsService = getWorkflowMetricsService();
      const stats = stepId
        ? await metricsService.getStepStats(workflowId, stepId)
        : await metricsService.getWorkflowStats(workflowId);

      if (!stats) {
        return; // No metrics available
      }

      const timeoutRate = stats.timeoutRate * 100; // Convert to percentage
      
      if (timeoutRate < config.timeoutRateThreshold) {
        return; // Below threshold
      }

      // Determine severity based on timeout rate
      const severity: AlertSeverity = 
        timeoutRate >= 25 ? 'critical' :
        timeoutRate >= 15 ? 'high' :
        timeoutRate >= 10 ? 'medium' :
        'low';

      const alert: WorkflowAlert = {
        type: 'timeout_rate_high',
        workflowId,
        workflowName,
        stepId,
        stepName,
        severity,
        message: stepName
          ? `Workflow "${workflowName}" (step: "${stepName}") has high timeout rate: ${Math.round(timeoutRate)}%`
          : `Workflow "${workflowName}" has high timeout rate: ${Math.round(timeoutRate)}%`,
        timestamp: new Date(),
        metadata: {
          timeoutRate: Math.round(timeoutRate),
          totalExecutions: stats.count,
          timeouts: Math.round(stats.count * stats.timeoutRate),
          averageDuration: stats.averageDuration,
        },
      };

      // Check deduplication
      const alertKey = this.getAlertKey(alert);
      if (this.isDuplicate(alertKey)) {
        logger.debug({ alertKey, workflowId, stepId }, 'Skipping duplicate timeout rate alert');
        return;
      }

      // Send alerts to configured channels
      await this.sendAlert(alert, config);
      
      // Record alert sent
      this.sentAlerts.set(alertKey, new Date());
    } catch (error) {
      // Don't throw - alert failures shouldn't break workflow execution
      logger.error(
        { error, workflowId, stepId },
        'Failed to check/send timeout rate alert'
      );
    }
  }

  /**
   * Send alert to configured channels
   * 
   * @private
   */
  private async sendAlert(
    alert: WorkflowAlert,
    config: AlertConfig,
    userId?: string
  ): Promise<void> {
    const channelPromises = config.channels.map(channel => {
      return this.sendToChannel(alert, channel, config, userId).catch(error => {
        // Log but don't throw - alert delivery failures shouldn't break workflow
        logger.error(
          { error, alert, channel },
          `Failed to send alert to ${channel} channel`
        );
      });
    });

    await Promise.allSettled(channelPromises);
  }

  /**
   * Send alert to a specific channel
   * 
   * @private
   */
  private async sendToChannel(
    alert: WorkflowAlert,
    channel: AlertChannel,
    config: AlertConfig,
    userId?: string
  ): Promise<void> {
    switch (channel) {
      case 'in-app':
        await this.sendInAppAlert(alert, userId);
        break;
      case 'email':
        await this.sendEmailAlert(alert, config);
        break;
      case 'slack':
        await this.sendSlackAlert(alert);
        break;
    }
  }

  /**
   * Send in-app notification
   * 
   * @private
   */
  private async sendInAppAlert(alert: WorkflowAlert, userId?: string): Promise<void> {
    if (!userId) {
      logger.debug({ alert }, 'Skipping in-app alert - no userId provided');
      return;
    }

    try {
      const notificationService = getNotificationService();
      
      // Create notification based on alert type
      if (alert.type === 'timeout_warning') {
        await notificationService.createWorkflowFailureNotification(
          userId,
          alert.workflowName,
          alert.runId || '',
          alert.message,
          alert.workflowId
        );
      } else {
        // For timeout rate alerts, use system maintenance notification type
        await notificationService.createSystemMaintenanceNotification(
          userId,
          `Workflow Alert: ${alert.workflowName}`,
          alert.message
        );
      }
    } catch (error) {
      logger.error({ error, alert, userId }, 'Failed to send in-app alert');
      throw error;
    }
  }

  /**
   * Send email alert
   * 
   * @private
   */
  private async sendEmailAlert(
    alert: WorkflowAlert,
    config: AlertConfig
  ): Promise<void> {
    const recipients = config.recipients || [];
    if (recipients.length === 0) {
      logger.debug({ alert }, 'Skipping email alert - no recipients configured');
      return;
    }

    const emailService = getEmailService();
    const emailSubject = `[${alert.severity.toUpperCase()}] ${alert.message}`;
    const emailBody = this.formatEmailBody(alert);
    const emailHtml = this.formatEmailHtml(alert);

    const sendPromises = recipients.map(async (to) => {
      try {
        await emailService.send({
          to,
          subject: emailSubject,
          text: emailBody,
          html: emailHtml,
        });
      } catch (error) {
        logger.error({ error, to, alert }, 'Failed to send workflow alert email');
      }
    });

    await Promise.allSettled(sendPromises);
  }

  /**
   * Format email HTML
   *
   * @private
   */
  private formatEmailHtml(alert: WorkflowAlert): string {
    const color =
      alert.severity === 'critical' ? '#ff0000' :
      alert.severity === 'high' ? '#ff9900' :
      alert.severity === 'medium' ? '#ffcc00' :
      '#cccccc';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${color}; color: white; padding: 10px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">Workflow Alert: ${alert.workflowName}</h2>
        </div>
        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 0 0 5px 5px;">
          <p><strong>Type:</strong> ${alert.type.replace(/_/g, ' ').toUpperCase()}</p>
          <p><strong>Severity:</strong> <span style="color: ${color}; font-weight: bold;">${alert.severity.toUpperCase()}</span></p>
          <p><strong>Message:</strong> ${alert.message}</p>
          ${alert.stepName ? `<p><strong>Step:</strong> ${alert.stepName}</p>` : ''}

          ${alert.metadata ? `
          <div style="background-color: #f5f5f5; padding: 10px; margin-top: 15px; border-radius: 5px;">
            <h3 style="margin-top: 0; font-size: 16px;">Details</h3>
            <ul style="list-style-type: none; padding: 0;">
              ${Object.entries(alert.metadata).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            Timestamp: ${alert.timestamp.toISOString()}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Send Slack alert
   * 
   * @private
   */
  private async sendSlackAlert(alert: WorkflowAlert): Promise<void> {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      logger.debug({ alert }, 'Skipping Slack alert - no webhook URL configured');
      return;
    }

    const color = 
      alert.severity === 'critical' ? '#ff0000' :
      alert.severity === 'high' ? '#ff9900' :
      alert.severity === 'medium' ? '#ffcc00' :
      '#cccccc';

    const payload = {
      text: `⚠️ Workflow Alert: ${alert.workflowName}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Type',
              value: alert.type.replace(/_/g, ' ').toUpperCase(),
              short: true,
            },
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Workflow',
              value: alert.workflowName,
              short: true,
            },
            ...(alert.stepName ? [{
              title: 'Step',
              value: alert.stepName,
              short: true,
            }] : []),
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
          ],
          footer: 'Beleidsscan Workflow Alert',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    };

    const webhookService = getWebhookService();
    const result = await webhookService.sendWebhook({
      url: slackWebhookUrl,
      payload,
      timeoutMs: 10000, // 10 seconds
      maxRetries: 3,
    });

    if (!result.success) {
      logger.error(
        { 
          error: result.error, 
          attemptCount: result.attemptCount,
          statusCode: result.statusCode,
          alert 
        },
        'Failed to send Slack alert after retries'
      );
      // Don't throw - alert delivery failures shouldn't break workflow
    }
  }

  /**
   * Format email body (plain text)
   * 
   * @private
   */
  private formatEmailBody(alert: WorkflowAlert): string {
    const lines = [
      `Workflow Alert: ${alert.workflowName}`,
      '',
      `Type: ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
      `Severity: ${alert.severity.toUpperCase()}`,
      `Message: ${alert.message}`,
      '',
    ];

    if (alert.stepName) {
      lines.push(`Step: ${alert.stepName}`);
    }

    if (alert.metadata) {
      lines.push('');
      lines.push('Details:');
      for (const [key, value] of Object.entries(alert.metadata)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    lines.push('');
    lines.push(`Timestamp: ${alert.timestamp.toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Get deduplication key for alert
   * 
   * @private
   */
  private getAlertKey(alert: WorkflowAlert): AlertKey {
    // Use type, workflowId, stepId, and rounded percentage/timeout rate for deduplication
    const key = `${alert.type}:${alert.workflowId}:${alert.stepId || ''}:`;
    
    if (alert.type === 'timeout_warning' && alert.metadata?.percentageUsed) {
      // Round to nearest 5% to dedupe similar warnings
      const rounded = Math.round((alert.metadata.percentageUsed as number) / 5) * 5;
      return `${key}${rounded}`;
    } else if (alert.type === 'timeout_rate_high' && alert.metadata?.timeoutRate) {
      // Round to nearest 5% to dedupe similar rates
      const rounded = Math.round((alert.metadata.timeoutRate as number) / 5) * 5;
      return `${key}${rounded}`;
    }
    
    return key;
  }

  /**
   * Check if alert is duplicate (sent recently)
   * 
   * @private
   */
  private isDuplicate(alertKey: AlertKey): boolean {
    const lastSent = this.sentAlerts.get(alertKey);
    if (!lastSent) {
      return false;
    }

    const timeSinceLastSent = Date.now() - lastSent.getTime();
    return timeSinceLastSent < this.ALERT_DEDUP_WINDOW_MS;
  }

  /**
   * Clean up old alert records (call periodically)
   */
  cleanupOldAlerts(): void {
    const now = Date.now();
    const cutoff = now - this.ALERT_DEDUP_WINDOW_MS * 2; // Keep records for 2x dedup window

    for (const [key, timestamp] of this.sentAlerts.entries()) {
      if (timestamp.getTime() < cutoff) {
        this.sentAlerts.delete(key);
      }
    }
  }
}

/**
 * Get or create a singleton instance of WorkflowAlertService
 */
let alertServiceInstance: WorkflowAlertService | null = null;

export function getWorkflowAlertService(): WorkflowAlertService {
  if (!alertServiceInstance) {
    alertServiceInstance = new WorkflowAlertService();
  }
  return alertServiceInstance;
}


