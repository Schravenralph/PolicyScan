/**
 * Email Digest Service
 * 
 * Handles scheduled email digests (daily, weekly, hourly) based on user email configurations.
 * Collects events and sends them as digest emails at scheduled times.
 */

import { logger } from '../../utils/logger.js';
import { ensureDBConnection } from '../../config/database.js';
import { EmailConfiguration, type EmailConfigurationDocument, type EmailScheduleConfiguration } from '../../models/EmailConfiguration.js';
import { getEmailService } from '../infrastructure/EmailService.js';
import { metricsRegistry } from '../../utils/metrics.js';
// Import cron-parser with version-agnostic compatibility
// Supports both v4 (parseExpression on default export) and v5 (parseExpression on default export)
// Runtime detection ensures compatibility regardless of installed version
import cronParser from 'cron-parser';

// Type guard to check if parseExpression exists
// Handles both object and function exports (cron-parser v4 exports a function with parseExpression property)
function hasParseExpression(obj: any): obj is { parseExpression: (expression: string, options?: any) => any } {
  return (typeof obj === 'object' || typeof obj === 'function') && 
         obj !== null && 
         typeof obj.parseExpression === 'function';
}

// Type guard to check if CronExpressionParser exists (v4 legacy API)
function hasCronExpressionParser(obj: any): obj is { CronExpressionParser: { parse: (expression: string, options?: any) => any } } {
  return typeof obj === 'object' && obj !== null && 
         (typeof obj.CronExpressionParser === 'object' || typeof obj.CronExpressionParser === 'function') &&
         typeof obj.CronExpressionParser?.parse === 'function';
}

// Type guard to check if parse exists (when default export is the parser class/function)
function hasParseMethod(obj: any): obj is { parse: (expression: string, options?: any) => any } {
  return (typeof obj === 'object' || typeof obj === 'function') &&
         obj !== null &&
         typeof obj.parse === 'function';
}

/**
 * Parse a cron expression with version-agnostic compatibility
 * Works with both cron-parser v4 and v5
 */
function parseCronExpression(expression: string, options?: any) {
  // Try v5/v4 API: parseExpression on default export (most common)
  if (hasParseExpression(cronParser)) {
    return cronParser.parseExpression(expression, options);
  }
  
  // Try v4 legacy API: CronExpressionParser.parse (if available)
  if (hasCronExpressionParser(cronParser)) {
    return (cronParser as { CronExpressionParser: { parse: (expression: string, options?: any) => any } }).CronExpressionParser.parse(expression, options);
  }

  // Try static parse method (if cronParser is the class itself)
  if (hasParseMethod(cronParser)) {
    return (cronParser as { parse: (expression: string, options?: any) => any }).parse(expression, options);
  }
  
  // Fallback: try calling default export as function (some versions)
  if (typeof cronParser === 'function') {
    try {
      return (cronParser as unknown as (expression: string, options?: any) => any)(expression, options);
    } catch (_error) {
      // If function call fails, throw descriptive error
      throw new Error(
        `cron-parser API not recognized. ` +
        `Available methods: ${Object.keys(cronParser).join(', ')}. ` +
        `Please check cron-parser version compatibility.`
      );
    }
  }
  
  // Last resort: throw descriptive error
  throw new Error(
    `Unable to parse cron expression: cron-parser API not recognized. ` +
    `Expected parseExpression method or CronExpressionParser.parse, but found: ${typeof cronParser}. ` +
    `Available keys: ${Object.keys(cronParser || {}).join(', ')}`
  );
}
import { Counter, Histogram } from 'prom-client';
import type { EmailNotificationData } from './EmailNotificationService.js';

export interface DigestEvent {
  userId: string;
  eventType: string;
  severity?: string;
  data: EmailNotificationData;
  timestamp: Date;
}

export class EmailDigestService {
  private static instance: EmailDigestService | null = null;
  private cronJobs: Map<string, any> = new Map();
  private digestQueues: Map<string, DigestEvent[]> = new Map(); // userId -> events
  private lastDigestTimes: Map<string, Date> = new Map(); // userId -> last digest timestamp
  private userSchedules: Map<string, EmailScheduleConfiguration> = new Map(); // userId -> schedule config
  private initialized: boolean = false;

  // Metrics
  private digestSentCounter: Counter<string>;
  private digestFailedCounter: Counter<string>;
  private digestSendDuration: Histogram<string>;
  private eventsQueuedCounter: Counter<string>;

  private constructor() {
    // Initialize Prometheus metrics
    this.digestSentCounter = new Counter({
      name: 'email_digests_sent_total',
      help: 'Total number of email digests sent',
      labelNames: ['frequency'],
      registers: [metricsRegistry],
    });

    this.digestFailedCounter = new Counter({
      name: 'email_digests_failed_total',
      help: 'Total number of failed email digests',
      labelNames: ['error_type'],
      registers: [metricsRegistry],
    });

    this.digestSendDuration = new Histogram({
      name: 'email_digest_send_duration_seconds',
      help: 'Duration of email digest sending in seconds',
      labelNames: ['frequency'],
      registers: [metricsRegistry],
    });

    this.eventsQueuedCounter = new Counter({
      name: 'email_digest_events_queued_total',
      help: 'Total number of events queued for email digests',
      labelNames: ['event_type'],
      registers: [metricsRegistry],
    });
  }

  static getInstance(): EmailDigestService {
    if (!EmailDigestService.instance) {
      EmailDigestService.instance = new EmailDigestService();
    }
    return EmailDigestService.instance;
  }

  /**
   * Initialize the digest service and start scheduled jobs
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await ensureDBConnection();

      // Load all enabled configurations and schedule their digests
      const configs = await EmailConfiguration.findEnabled();

      for (const config of configs) {
        await this.scheduleDigestForConfig(config);
      }

      // Schedule a periodic check for new configurations (every hour)
      await this.scheduleConfigurationCheck();

      this.initialized = true;
      logger.info('Email digest service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize email digest service');
      throw error;
    }
  }

  /**
   * Schedule digest jobs for a configuration
   */
  private async scheduleDigestForConfig(config: EmailConfigurationDocument): Promise<void> {
    const userId = config.userId.toString();

    // Store schedule for later reference
    this.userSchedules.set(userId, config.schedule);

    // Stop existing cron job if any
    if (this.cronJobs.has(userId)) {
      const existingJob = this.cronJobs.get(userId);
      existingJob.stop();
      this.cronJobs.delete(userId);
    }

    // Initialize digest queue for this user
    if (!this.digestQueues.has(userId)) {
      this.digestQueues.set(userId, []);
    }

    // Schedule based on frequency
    const schedule = config.schedule;
    if (schedule.frequency === 'never' || schedule.frequency === 'immediate') {
      return; // No digest needed
    }

    try {
      const cron = await import('node-cron') as typeof import('node-cron');
      const cronExpression = this.getCronExpression(schedule);

      if (!cronExpression) {
        logger.warn({ userId, frequency: schedule.frequency }, 'Could not create cron expression for digest');
        return;
      }

      const job = cron.schedule(
        cronExpression,
        async () => {
          await this.sendDigestForUser(userId);
        },
        {
          scheduled: true,
          timezone: schedule.timezone || 'UTC',
        }
      );

      this.cronJobs.set(userId, job);
      logger.info({ userId, cronExpression, frequency: schedule.frequency }, 'Scheduled email digest');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to schedule email digest');
    }
  }

  /**
   * Convert schedule configuration to cron expression
   */
  private getCronExpression(schedule: { frequency: string; time?: string; dayOfWeek?: number }): string | null {
    const time = schedule.time || '09:00';
    const [hours, minutes] = time.split(':').map(Number);

    switch (schedule.frequency) {
      case 'hourly':
        return `${minutes} * * * *`; // Every hour at :minutes
      case 'daily_digest':
        return `${minutes} ${hours} * * *`; // Daily at HH:MM
      case 'weekly_summary': {
        const day = schedule.dayOfWeek !== undefined ? schedule.dayOfWeek : 1; // Monday default
        return `${minutes} ${hours} * * ${day}`; // Weekly on day at HH:MM
      }
      default:
        return null;
    }
  }

  /**
   * Queue an event for digest
   */
  async queueEventForDigest(userId: string, event: DigestEvent): Promise<void> {
    if (!this.digestQueues.has(userId)) {
      this.digestQueues.set(userId, []);
    }

    const queue = this.digestQueues.get(userId)!;
    queue.push(event);

    // Record metric
    this.eventsQueuedCounter.inc({ event_type: event.eventType });

    logger.debug({ userId, eventType: event.eventType, queueSize: queue.length }, 'Queued event for digest');
  }

  /**
   * Send digest email for a user
   */
  private async sendDigestForUser(userId: string): Promise<void> {
    try {
      await ensureDBConnection();
      const config = await EmailConfiguration.findByUserId(userId);

      if (!config || !config.enabled) {
        logger.debug({ userId }, 'Digest skipped - configuration disabled or not found');
        return;
      }

      const queue = this.digestQueues.get(userId);
      if (!queue || queue.length === 0) {
        logger.debug({ userId }, 'Digest skipped - no events in queue');
        return;
      }

      // Group events by type and filter based on configuration
      const eventsToSend = this.filterAndGroupEvents(queue, config);

      if (eventsToSend.length === 0) {
        logger.debug({ userId }, 'Digest skipped - no events match configuration');
        // Clear queue even if no events to send
        this.digestQueues.set(userId, []);
        return;
      }

      // Format and send digest email
      const { subject, text, html } = this.formatDigestEmail(eventsToSend, config);

      const emailService = getEmailService();
      if (!emailService.isAvailable()) {
        logger.warn({ userId }, 'Email service not available for digest, keeping events in queue');
        // Keep events in queue for retry when email service becomes available
        // The scheduleConfigurationCheck will retry when it runs
        return;
      }

      // Send to all recipients
      const startTime = Date.now();
      const emailPromises = config.recipients.map(recipient =>
        emailService.send({
          to: recipient,
          subject,
          text,
          html,
        }).catch(error => {
          logger.error({ error, recipient, userId }, 'Failed to send digest email');
        })
      );

      await Promise.all(emailPromises);
      const duration = Date.now() - startTime;

      // Update last digest time
      this.lastDigestTimes.set(userId, new Date());

      // Clear queue after sending
      this.digestQueues.set(userId, []);

      // Record metrics
      const frequency = config.schedule.frequency;
      this.digestSentCounter.inc({ frequency });
      this.digestSendDuration.observe({ frequency }, duration);

      logger.info({ userId, eventCount: eventsToSend.length, recipients: config.recipients.length, duration }, 'Digest email sent');
    } catch (error) {
      // Record failure metric
      this.digestFailedCounter.inc({
        error_type: error instanceof Error ? error.constructor.name : 'unknown',
      });
      logger.error({ error, userId }, 'Error sending digest email');
    }
  }

  /**
   * Filter and group events based on configuration
   */
  private filterAndGroupEvents(
    events: DigestEvent[],
    config: EmailConfigurationDocument
  ): DigestEvent[] {
    const maxItems = config.format.maxItems || 50;
    const filtered: DigestEvent[] = [];

    for (const event of events) {
      const eventConfig = config.events.find(e => e.eventType === event.eventType);

      // Check if event type is enabled
      if (!eventConfig || !eventConfig.enabled) {
        continue;
      }

      // Check severity threshold
      if (eventConfig.severity && event.severity) {
        const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        const eventSeverity = severityLevels[eventConfig.severity as keyof typeof severityLevels] || 0;
        const eventSeverityLevel = severityLevels[event.severity as keyof typeof severityLevels] || 0;
        if (eventSeverityLevel < eventSeverity) {
          continue;
        }
      }

      filtered.push(event);

      if (filtered.length >= maxItems) {
        break;
      }
    }

    return filtered;
  }

  /**
   * Format digest email
   */
  private formatDigestEmail(
    events: DigestEvent[],
    config: EmailConfigurationDocument
  ): { subject: string; text: string; html: string } {
    const eventCount = events.length;
    const subject = `[Test Dashboard] Digest: ${eventCount} event${eventCount !== 1 ? 's' : ''}`;

    // Group by event type
    const grouped = events.reduce((acc, event) => {
      if (!acc[event.eventType]) {
        acc[event.eventType] = [];
      }
      acc[event.eventType].push(event);
      return acc;
    }, {} as Record<string, DigestEvent[]>);

    let text = `Test Dashboard Digest\n\n`;
    text += `Summary: ${eventCount} event${eventCount !== 1 ? 's' : ''}\n\n`;

    for (const [eventType, typeEvents] of Object.entries(grouped)) {
      text += `${eventType}: ${typeEvents.length}\n`;
      for (const event of typeEvents.slice(0, 10)) {
        text += `  - ${event.data.testName || eventType}${event.severity ? ` (${event.severity})` : ''}\n`;
      }
      if (typeEvents.length > 10) {
        text += `  ... and ${typeEvents.length - 10} more\n`;
      }
      text += '\n';
    }

    let html = '';
    if (config.format.format === 'html' || config.format.format === 'html_template') {
      html = this.formatDigestHtml(events, grouped, config);
    } else {
      html = text.replace(/\n/g, '<br>');
    }

    return { subject, text, html };
  }

  /**
   * Format HTML digest email
   */
  private formatDigestHtml(
    events: DigestEvent[],
    grouped: Record<string, DigestEvent[]>,
    config: EmailConfigurationDocument
  ): string {
    const eventCount = events.length;

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
          .section { margin: 20px 0; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
          .event-item { background: white; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 3px solid #3b82f6; }
          .event-type { font-weight: bold; color: #6b7280; }
          .severity { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; margin-left: 10px; }
          .severity-critical { background: #fee2e2; color: #dc2626; }
          .severity-high { background: #fef3c7; color: #d97706; }
          .severity-medium { background: #dbeafe; color: #2563eb; }
          .severity-low { background: #f3f4f6; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Test Dashboard Digest</h2>
            <p>${eventCount} event${eventCount !== 1 ? 's' : ''}</p>
          </div>
          <div class="content">
    `;

    for (const [eventType, typeEvents] of Object.entries(grouped)) {
      html += `<div class="section">`;
      html += `<div class="section-title">${eventType} (${typeEvents.length})</div>`;

      for (const event of typeEvents.slice(0, config.format.maxItems || 50)) {
        html += `<div class="event-item">`;
        html += `<div class="event-type">${event.data.testName || eventType}</div>`;
        if (event.severity) {
          html += `<span class="severity severity-${event.severity}">${event.severity.toUpperCase()}</span>`;
        }
        if (config.format.includeDetails && event.data.details) {
          html += `<div style="margin-top: 5px; font-size: 12px; color: #6b7280;">${JSON.stringify(event.data.details)}</div>`;
        }
        html += `</div>`;
      }

      if (typeEvents.length > (config.format.maxItems || 50)) {
        html += `<div style="text-align: center; color: #6b7280; margin-top: 10px;">... and ${typeEvents.length - (config.format.maxItems || 50)} more</div>`;
      }

      html += `</div>`;
    }

    html += `
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Schedule periodic check for new configurations
   */
  private async scheduleConfigurationCheck(): Promise<void> {
    try {
      const cron = await import('node-cron') as typeof import('node-cron');

      // Check every hour for new configurations
      cron.schedule('0 * * * *', async () => {
        try {
          await ensureDBConnection();
          const configs = await EmailConfiguration.findEnabled();

          for (const config of configs) {
            const userId = config.userId.toString();
            if (!this.cronJobs.has(userId)) {
              await this.scheduleDigestForConfig(config);
            }
          }
        } catch (error) {
          logger.error({ error }, 'Error checking for new email configurations');
        }
      }, {
        scheduled: true,
        timezone: 'UTC',
      });

      logger.info('Scheduled configuration check for email digests');
    } catch (error) {
      logger.warn({ error }, 'Failed to schedule configuration check (node-cron may not be installed)');
    }
  }

  /**
   * Update schedule for a specific user (called when configuration changes)
   */
  async updateScheduleForUser(userId: string, config: EmailConfigurationDocument): Promise<void> {
    try {
      await this.scheduleDigestForConfig(config);
      logger.info({ userId }, 'Updated email digest schedule');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update email digest schedule');
    }
  }

  /**
   * Manually trigger digest for a user (for testing/admin use)
   * Public method that can be called from API
   */
  async triggerDigestForUser(userId: string): Promise<void> {
    // Call the private sendDigestForUser method
    await this.sendDigestForUser(userId);
  }

  /**
   * Get queued events for a user
   */
  getQueuedEvents(userId: string): DigestEvent[] {
    return this.digestQueues.get(userId) || [];
  }

  /**
   * Get digest statistics for a user
   */
  getDigestStats(userId: string): {
    queuedEvents: number;
    nextDigestTime?: string;
    lastDigestTime?: string;
  } {
    const queue = this.digestQueues.get(userId) || [];
    const lastDigestTime = this.lastDigestTimes.get(userId);
    const schedule = this.userSchedules.get(userId);
    let nextDigestTime: string | undefined;

    if (schedule && schedule.frequency !== 'never' && schedule.frequency !== 'immediate') {
      try {
        const cronExpression = this.getCronExpression(schedule);
        if (cronExpression) {
          const options = {
            currentDate: new Date(),
            tz: schedule.timezone
          };
          // Use version-agnostic cron parser (works with v4 and v5)
          const interval = parseCronExpression(cronExpression, options);
          nextDigestTime = interval.next().toDate().toISOString();
        }
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to calculate next digest time');
      }
    }

    return {
      queuedEvents: queue.length,
      lastDigestTime: lastDigestTime?.toISOString(),
      nextDigestTime,
    };
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const [userId, job] of this.cronJobs.entries()) {
      job.stop();
      logger.debug({ userId }, 'Stopped email digest job');
    }
    this.cronJobs.clear();
    this.initialized = false;
    logger.info('Email digest service stopped');
  }
}

export function getEmailDigestService(): EmailDigestService {
  return EmailDigestService.getInstance();
}
