/**
 * Email Notification Service
 * 
 * Handles sending email notifications based on user email configurations.
 * Checks what, when, and how to send emails according to user preferences.
 */

import { logger } from '../../utils/logger.js';
import { getEmailService } from '../infrastructure/EmailService.js';
import { EmailConfiguration, type EmailConfigurationDocument } from '../../models/EmailConfiguration.js';
import { ensureDBConnection } from '../../config/database.js';
import { Counter, Histogram } from 'prom-client';
import { metricsRegistry } from '../../utils/metrics.js';
import { getEmailDigestService } from './EmailDigestService.js';

export type EmailEventType =
  | 'test_failure'
  | 'test_completion'
  | 'test_alert'
  | 'coverage_drop'
  | 'performance_regression'
  | 'flaky_test_detected'
  | 'test_suite_complete'
  | 'critical_failure';

export interface EmailNotificationData {
  eventType: EmailEventType;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  testId?: string;
  testName?: string;
  error?: string;
  runId?: string;
  testType?: string;
  testSuite?: string;
  details?: Record<string, unknown>;
}

export class EmailNotificationService {
  private static instance: EmailNotificationService | null = null;

  // Metrics
  private emailSentCounter: Counter<string>;
  private emailFailedCounter: Counter<string>;
  private emailSendDuration: Histogram<string>;

  private constructor() {
    // Initialize Prometheus metrics
    this.emailSentCounter = new Counter({
      name: 'email_notifications_sent_total',
      help: 'Total number of email notifications sent',
      labelNames: ['event_type', 'severity'],
      registers: [metricsRegistry],
    });

    this.emailFailedCounter = new Counter({
      name: 'email_notifications_failed_total',
      help: 'Total number of failed email notifications',
      labelNames: ['event_type', 'error_type'],
      registers: [metricsRegistry],
    });

    this.emailSendDuration = new Histogram({
      name: 'email_notification_send_duration_seconds',
      help: 'Duration of email notification sending in seconds',
      labelNames: ['event_type'],
      registers: [metricsRegistry],
    });
  }

  static getInstance(): EmailNotificationService {
    if (!EmailNotificationService.instance) {
      EmailNotificationService.instance = new EmailNotificationService();
    }
    return EmailNotificationService.instance;
  }

  /**
   * Check if an email should be sent for a given event
   */
  async shouldSendEmail(
    userId: string,
    eventType: EmailEventType,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<boolean> {
    try {
      await ensureDBConnection();
      const config = await EmailConfiguration.findByUserId(userId);

      if (!config || !config.enabled) {
        return false;
      }

      const eventConfig = config.events.find(e => e.eventType === eventType);
      if (!eventConfig || !eventConfig.enabled) {
        return false;
      }

      // Check frequency - if not immediate, queue for digest instead
      if (eventConfig.frequency !== 'immediate') {
        // Queue for digest (would be handled by digest service)
        return false;
      }

      // Check severity threshold
      if (eventConfig.severity && severity) {
        const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        const eventSeverity = severityLevels[eventConfig.severity as keyof typeof severityLevels] || 0;
        const eventSeverityLevel = severityLevels[severity] || 0;
        if (eventSeverityLevel < eventSeverity) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error({ error, userId, eventType }, 'Error checking if email should be sent');
      return false;
    }
  }

  /**
   * Send immediate email notification
   */
  async sendImmediateEmail(
    userId: string,
    data: EmailNotificationData
  ): Promise<void> {
    try {
      const shouldSend = await this.shouldSendEmail(userId, data.eventType, data.severity);
      if (!shouldSend) {
        logger.debug({ userId, eventType: data.eventType }, 'Email not sent - configuration prevents it');
        return;
      }

      await ensureDBConnection();
      const config = await EmailConfiguration.findByUserId(userId);
      if (!config) {
        logger.warn({ userId }, 'Email configuration not found');
        return;
      }

      const emailService = getEmailService();
      if (!emailService.isAvailable()) {
        logger.warn('Email service not available');
        return;
      }

      const { subject, text, html } = this.formatEmail(data, config);

      // Send to all recipients with error handling per recipient
      const emailPromises = config.recipients.map(async (recipient) => {
        try {
          await emailService.send({
            to: recipient,
            subject,
            text,
            html,
          });
        } catch (error) {
          // Log error but don't fail entire notification if one recipient fails
          logger.error({ error, recipient, userId, eventType: data.eventType }, 'Failed to send email to recipient');
          // Re-throw to track in metrics, but Promise.all will still wait for all
          throw error;
        }
      });

      const startTime = Date.now();
      await Promise.all(emailPromises);
      const duration = (Date.now() - startTime) / 1000;

      // Record metrics
      this.emailSentCounter.inc({
        event_type: data.eventType,
        severity: data.severity || 'unknown',
      });
      this.emailSendDuration.observe(
        { event_type: data.eventType },
        duration
      );

      logger.info({ userId, eventType: data.eventType, recipients: config.recipients.length, duration }, 'Email notification sent');
    } catch (error) {
      // Record failure metric
      this.emailFailedCounter.inc({
        event_type: data.eventType,
        error_type: error instanceof Error ? error.constructor.name : 'unknown',
      });
      logger.error({ error, userId, eventType: data.eventType }, 'Error sending email notification');
    }
  }

  /**
   * Format email content based on configuration
   */
  private formatEmail(
    data: EmailNotificationData,
    config: EmailConfigurationDocument
  ): { subject: string; text: string; html: string } {
    const eventLabels: Record<EmailEventType, string> = {
      test_failure: 'Test Failure',
      test_completion: 'Test Completion',
      test_alert: 'Test Alert',
      coverage_drop: 'Coverage Drop',
      performance_regression: 'Performance Regression',
      flaky_test_detected: 'Flaky Test Detected',
      test_suite_complete: 'Test Suite Complete',
      critical_failure: 'Critical Failure',
    };

    const subject = `[Test Dashboard] ${eventLabels[data.eventType] || data.eventType}${data.testName ? `: ${data.testName}` : ''}`;

    let text = `${eventLabels[data.eventType] || data.eventType}\n\n`;
    if (data.testName) {
      text += `Test: ${data.testName}\n`;
    }
    if (data.testId) {
      text += `Test ID: ${data.testId}\n`;
    }
    if (data.runId) {
      text += `Run ID: ${data.runId}\n`;
    }
    if (data.error && config.format.includeStackTrace) {
      text += `\nError:\n${data.error}\n`;
    }
    if (data.details && config.format.includeDetails) {
      text += `\nDetails:\n${JSON.stringify(data.details, null, 2)}\n`;
    }

    let html = '';
    if (config.format.format === 'html' || config.format.format === 'html_template') {
      html = this.formatHtmlEmail(data, config);
    } else {
      html = text.replace(/\n/g, '<br>');
    }

    return { subject, text, html };
  }

  /**
   * Format HTML email
   */
  private formatHtmlEmail(
    data: EmailNotificationData,
    config: EmailConfigurationDocument
  ): string {
    const eventLabels: Record<EmailEventType, string> = {
      test_failure: 'Test Failure',
      test_completion: 'Test Completion',
      test_alert: 'Test Alert',
      coverage_drop: 'Coverage Drop',
      performance_regression: 'Performance Regression',
      flaky_test_detected: 'Flaky Test Detected',
      test_suite_complete: 'Test Suite Complete',
      critical_failure: 'Critical Failure',
    };

    const severityColors: Record<string, string> = {
      low: '#3b82f6',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626',
    };

    const severityColor = data.severity ? severityColors[data.severity] || '#6b7280' : '#6b7280';

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${severityColor}; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
          .detail { margin: 10px 0; }
          .label { font-weight: bold; color: #6b7280; }
          .error { background: #fee2e2; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .details { background: #f3f4f6; padding: 10px; border-radius: 5px; margin: 10px 0; }
          pre { background: #1f2937; color: #f9fafb; padding: 10px; border-radius: 5px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${eventLabels[data.eventType] || data.eventType}</h2>
          </div>
          <div class="content">
    `;

    if (data.testName) {
      html += `<div class="detail"><span class="label">Test:</span> ${data.testName}</div>`;
    }
    if (data.testId) {
      html += `<div class="detail"><span class="label">Test ID:</span> ${data.testId}</div>`;
    }
    if (data.runId) {
      html += `<div class="detail"><span class="label">Run ID:</span> ${data.runId}</div>`;
    }
    if (data.severity) {
      html += `<div class="detail"><span class="label">Severity:</span> <span style="color: ${severityColor};">${data.severity.toUpperCase()}</span></div>`;
    }

    if (data.error && config.format.includeStackTrace) {
      html += `<div class="error"><strong>Error:</strong><pre>${data.error}</pre></div>`;
    }

    if (data.details && config.format.includeDetails) {
      html += `<div class="details"><strong>Details:</strong><pre>${JSON.stringify(data.details, null, 2)}</pre></div>`;
    }

    html += `
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }
}

export function getEmailNotificationService(): EmailNotificationService {
  return EmailNotificationService.getInstance();
}

