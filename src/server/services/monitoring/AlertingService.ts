import { ErrorLogDocument } from '../../models/ErrorLog.js';
import { getEmailService } from '../infrastructure/EmailService.js';
import { logger } from '../../utils/logger.js';
import { getWebhookService } from '../infrastructure/WebhookService.js';

/**
 * Alerting Service
 * Sends alerts for critical errors via email and Slack webhooks
 */
export class AlertingService {
    private slackWebhookUrl: string | null;
    private emailEnabled: boolean;
    private alertEmailAddresses: string[];

    constructor() {
        this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || null;
        this.emailEnabled = process.env.ALERT_EMAIL_ENABLED === 'true';
        const rawAddresses = process.env.ALERT_EMAIL_ADDRESSES
            ? process.env.ALERT_EMAIL_ADDRESSES.split(',').map((email) => email.trim())
            : [];
        
        // Filter out test email addresses
        this.alertEmailAddresses = rawAddresses.filter(email => !this.isTestEmail(email));

        if (!this.slackWebhookUrl && !this.emailEnabled) {
            logger.warn(
                '[AlertingService] No alerting configured. Set SLACK_WEBHOOK_URL or ALERT_EMAIL_ENABLED=true'
            );
        }
    }

    /**
     * Check if an email address is a test email (should not receive real notifications)
     */
    private isTestEmail(email: string): boolean {
        if (!email) return false;
        // Filter out test email patterns
        const testEmailPatterns = [
            /^user\d+@example\.com$/i,
            /^test.*@example\.com$/i,
            /@example\.com$/i, // Any @example.com address
        ];
        return testEmailPatterns.some(pattern => pattern.test(email));
    }

    /**
     * Send critical error alert
     */
    async sendCriticalErrorAlert(errorLog: ErrorLogDocument): Promise<void> {
        const alertPromises: Promise<void>[] = [];

        // Send Slack alert
        if (this.slackWebhookUrl) {
            alertPromises.push(this.sendSlackAlert(errorLog, 'critical'));
        }

        // Send email alert for critical errors
        if (this.emailEnabled && this.alertEmailAddresses.length > 0) {
            alertPromises.push(this.sendEmailAlert(errorLog, 'critical'));
        }

        // Execute all alerts in parallel
        await Promise.allSettled(alertPromises);
    }

    /**
     * Send alert for resolved error reoccurrence
     */
    async sendResolvedErrorReoccurrenceAlert(errorLog: ErrorLogDocument): Promise<void> {
        const alertPromises: Promise<void>[] = [];

        if (this.slackWebhookUrl) {
            alertPromises.push(this.sendSlackAlert(errorLog, 'reoccurrence'));
        }

        if (this.emailEnabled && this.alertEmailAddresses.length > 0) {
            alertPromises.push(this.sendEmailAlert(errorLog, 'reoccurrence'));
        }

        await Promise.allSettled(alertPromises);
    }

    /**
     * Send Slack webhook alert
     */
    private async sendSlackAlert(
        errorLog: ErrorLogDocument,
        alertType: 'critical' | 'reoccurrence'
    ): Promise<void> {
        if (!this.slackWebhookUrl) {
            return;
        }

        const title =
            alertType === 'critical'
                ? `🚨 Critical Error: ${errorLog.message}`
                : `⚠️ Resolved Error Reoccurred: ${errorLog.message}`;

        const color = alertType === 'critical' ? '#ff0000' : '#ff9900';

        const payload = {
            text: title,
            attachments: [
                {
                    color,
                    fields: [
                        {
                            title: 'Error ID',
                            value: errorLog.error_id,
                            short: true,
                        },
                        {
                            title: 'Severity',
                            value: errorLog.severity.toUpperCase(),
                            short: true,
                        },
                        {
                            title: 'Component',
                            value: errorLog.component,
                            short: true,
                        },
                        {
                            title: 'Occurrences',
                            value: errorLog.occurrence_count.toString(),
                            short: true,
                        },
                        {
                            title: 'First Seen',
                            value: errorLog.first_seen.toISOString(),
                            short: true,
                        },
                        {
                            title: 'Last Seen',
                            value: errorLog.last_seen.toISOString(),
                            short: true,
                        },
                        {
                            title: 'Stack Trace',
                            value:
                                errorLog.stack_trace?.substring(0, 500) + '...' ||
                                'No stack trace',
                            short: false,
                        },
                    ],
                    footer: 'Beleidsscan Error Monitoring',
                    ts: Math.floor(errorLog.timestamp.getTime() / 1000),
                },
            ],
        };

        const webhookService = getWebhookService();
        const result = await webhookService.sendWebhook({
            url: this.slackWebhookUrl,
            payload,
            timeoutMs: 10000, // 10 seconds
            maxRetries: 3,
        });

        if (!result.success) {
            logger.error(
                { 
                    error: result.error, 
                    attemptCount: result.attemptCount,
                    statusCode: result.statusCode 
                },
                '[AlertingService] Failed to send Slack alert after retries'
            );
        }
    }

    /**
     * Send email alert
     */
    private async sendEmailAlert(
        errorLog: ErrorLogDocument,
        alertType: 'critical' | 'reoccurrence'
    ): Promise<void> {
        const emailService = getEmailService();

        const title =
            alertType === 'critical'
                ? `🚨 Critical Error: ${errorLog.message}`
                : `⚠️ Resolved Error Reoccurred: ${errorLog.message}`;

        const subject = `[Beleidsscan] ${title}`;

        const html = `
            <h2>${title}</h2>
            <ul>
                <li><strong>Error ID:</strong> ${errorLog.error_id}</li>
                <li><strong>Severity:</strong> ${errorLog.severity.toUpperCase()}</li>
                <li><strong>Component:</strong> ${errorLog.component}</li>
                <li><strong>Occurrences:</strong> ${errorLog.occurrence_count}</li>
                <li><strong>First Seen:</strong> ${errorLog.first_seen.toISOString()}</li>
                <li><strong>Last Seen:</strong> ${errorLog.last_seen.toISOString()}</li>
            </ul>
            <h3>Stack Trace</h3>
            <pre style="background-color: #f5f5f5; padding: 10px; overflow-x: auto;">${errorLog.stack_trace || 'No stack trace'}</pre>
        `;

        const text = `
${title}

Error ID: ${errorLog.error_id}
Severity: ${errorLog.severity.toUpperCase()}
Component: ${errorLog.component}
Occurrences: ${errorLog.occurrence_count}
First Seen: ${errorLog.first_seen.toISOString()}
Last Seen: ${errorLog.last_seen.toISOString()}

Stack Trace:
${errorLog.stack_trace || 'No stack trace'}
        `.trim();

        const sendPromises = this.alertEmailAddresses.map(async (to) => {
            try {
                await emailService.send({
                    to,
                    subject,
                    text,
                    html,
                });
            } catch (error) {
                logger.error({ error, to }, '[AlertingService] Failed to send email');
            }
        });

        await Promise.all(sendPromises);
    }

    /**
     * Send generic alert (for cost monitoring, resource thresholds, etc.)
     */
    async sendGenericAlert(options: {
        title: string;
        message: string;
        severity: 'warning' | 'critical';
        details?: Record<string, unknown>;
    }): Promise<void> {
        const alertPromises: Promise<void>[] = [];

        // Send Slack alert
        if (this.slackWebhookUrl) {
            alertPromises.push(this.sendGenericSlackAlert(options));
        }

        // Send email alert
        if (this.emailEnabled && this.alertEmailAddresses.length > 0) {
            alertPromises.push(this.sendGenericEmailAlert(options));
        }

        await Promise.allSettled(alertPromises);
    }

    /**
     * Send generic Slack alert
     */
    private async sendGenericSlackAlert(options: {
        title: string;
        message: string;
        severity: 'warning' | 'critical';
        details?: Record<string, unknown>;
    }): Promise<void> {
        if (!this.slackWebhookUrl) {
            return;
        }

        const color = options.severity === 'critical' ? '#ff0000' : '#ff9900';
        const emoji = options.severity === 'critical' ? '🚨' : '⚠️';

        const fields = Object.entries(options.details || {}).map(([key, value]) => ({
            title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
            value: String(value),
            short: true,
        }));

        const payload = {
            text: `${emoji} ${options.title}`,
            attachments: [
                {
                    color,
                    fields: [
                        {
                            title: 'Message',
                            value: options.message,
                            short: false,
                        },
                        ...fields,
                    ],
                    footer: 'Beleidsscan Monitoring',
                    ts: Math.floor(Date.now() / 1000),
                },
            ],
        };

        const webhookService = getWebhookService();
        const result = await webhookService.sendWebhook({
            url: this.slackWebhookUrl,
            payload,
            timeoutMs: 10000,
            maxRetries: 3,
        });

        if (!result.success) {
            logger.error(
                {
                    error: result.error,
                    attemptCount: result.attemptCount,
                    statusCode: result.statusCode,
                },
                '[AlertingService] Failed to send generic Slack alert'
            );
        }
    }

    /**
     * Send generic email alert
     */
    private async sendGenericEmailAlert(options: {
        title: string;
        message: string;
        severity: 'warning' | 'critical';
        details?: Record<string, unknown>;
    }): Promise<void> {
        const emailService = getEmailService();
        const emoji = options.severity === 'critical' ? '🚨' : '⚠️';
        const subject = `[Beleidsscan] ${emoji} ${options.title}`;

        const detailsHtml = options.details
            ? Object.entries(options.details)
                  .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
                  .join('')
            : '';

        const html = `
            <h2>${emoji} ${options.title}</h2>
            <p>${options.message}</p>
            ${detailsHtml ? `<ul>${detailsHtml}</ul>` : ''}
            <p><small>Timestamp: ${new Date().toISOString()}</small></p>
        `;

        const detailsText = options.details
            ? Object.entries(options.details)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')
            : '';

        const text = `
${emoji} ${options.title}

${options.message}

${detailsText}

Timestamp: ${new Date().toISOString()}
        `.trim();

        const sendPromises = this.alertEmailAddresses.map(async (to) => {
            try {
                await emailService.send({
                    to,
                    subject,
                    text,
                    html,
                });
            } catch (error) {
                logger.error({ error, to }, '[AlertingService] Failed to send generic email alert');
            }
        });

        await Promise.all(sendPromises);
    }
}

