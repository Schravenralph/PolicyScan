/**
 * Email Service
 * 
 * Provides email sending functionality using nodemailer.
 * Supports SMTP configuration via environment variables.
 * Falls back to logging in development when SMTP is not configured.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../../utils/logger.js';

/**
 * Email options for sending emails
 */
export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

/**
 * Email service interface
 */
export interface IEmailService {
  /**
   * Send an email
   * @param options Email options
   * @throws Error if email sending fails
   */
  send(options: EmailOptions): Promise<void>;

  /**
   * Check if email service is available (SMTP configured)
   */
  isAvailable(): boolean;
}

/**
 * Nodemailer-based email service implementation
 */
export class NodemailerEmailService implements IEmailService {
  private transporter: Transporter | null = null;
  private available: boolean = false;
  private defaultFrom: string;

  constructor() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpFrom = process.env.SMTP_FROM || 'noreply@beleidsscan.nl';

    this.defaultFrom = smtpFrom;

    // Check if SMTP is configured
    if (smtpHost && smtpUser && smtpPassword) {
      try {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPassword,
          },
          connectionTimeout: 10000, // 10 seconds connection timeout
          greetingTimeout: 10000, // 10 seconds greeting timeout
          socketTimeout: 30000, // 30 seconds socket timeout
          // Add pool option to prevent hanging connections
          pool: false,
          // Disable keepalive to prevent connection issues
          requireTLS: smtpPort === 587,
        } as any);

        // Verify connection (but don't fail if verification times out)
        this.transporter.verify().then(() => {
          logger.info({ smtpHost, smtpPort }, 'Email service configured and verified');
          this.available = true;
        }).catch((error) => {
          logger.warn({ error: error.message, smtpHost, smtpPort }, 'Email transporter created but verification failed - will attempt to send anyway');
          this.available = true; // Still mark as available, will fail on actual send if needed
        });

        // Set available immediately (verification is async and non-blocking)
        this.available = true;
        logger.info({ smtpHost, smtpPort }, 'Email service configured');
      } catch (error) {
        logger.error({ error, smtpHost }, 'Failed to create email transporter');
        this.available = false;
      }
    } else {
      logger.warn('Email service not configured - emails will be logged only');
      this.available = false;
    }
  }

  /**
   * Check if email service is available
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Send an email
   */
  async send(options: EmailOptions): Promise<void> {
    if (!this.available || !this.transporter) {
      // In development, log the email instead of sending
      logger.info(
        {
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html ? '[HTML content]' : undefined,
        },
        'Email would be sent (SMTP not configured)'
      );
      return;
    }

    try {
      // Ensure text and html are strings, not undefined
      const textContent = options.text || '';
      const htmlContent = options.html || '';
      
      if (!textContent && !htmlContent) {
        throw new Error('Email must have either text or HTML content');
      }
      
      const mailOptions = {
        from: options.from || this.defaultFrom,
        to: options.to,
        subject: options.subject || 'No Subject',
        text: textContent,
        html: htmlContent,
      };

      logger.info({ 
        to: options.to, 
        subject: options.subject,
        from: mailOptions.from,
        hasHtml: !!htmlContent,
        textLength: textContent.length,
        htmlLength: htmlContent.length
      }, 'Attempting to send email via SMTP');

      // Add explicit timeout wrapper - nodemailer sendMail can hang
      // Create a new transporter for each send to avoid connection issues
      const sendTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASSWORD!,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        pool: false,
        requireTLS: parseInt(process.env.SMTP_PORT || '587', 10) === 587,
      } as any);
      
      try {
        // Use Promise.race to enforce timeout
        const sendPromise = sendTransporter.sendMail(mailOptions);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Email sendMail operation timed out after 20 seconds'));
          }, 20000);
        });
        
        const result = await Promise.race([sendPromise, timeoutPromise]);
        
        // Close the transporter after sending
        sendTransporter.close();
        
        logger.info(
          { 
            messageId: result.messageId, 
            to: options.to, 
            subject: options.subject,
            response: result.response
          },
          'Email sent successfully'
        );
      } catch (error: unknown) {
        // Close the transporter even on error
        sendTransporter.close();
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = error instanceof Error 
        ? { message: errorMessage, name: error.name, stack: error.stack?.substring(0, 500) }
        : { error: String(error) };
      
      logger.error(
        { 
          ...errorDetails, 
          to: options.to, 
          subject: options.subject,
          transporterExists: !!this.transporter,
          available: this.available
        },
        'Failed to send email'
      );
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}

// Singleton instance
let emailServiceInstance: IEmailService | null = null;

/**
 * Get the email service instance (singleton)
 */
export function getEmailService(): IEmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new NodemailerEmailService();
  }
  return emailServiceInstance;
}

