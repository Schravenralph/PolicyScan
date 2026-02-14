/**
 * Test Scheduled Export Service
 * 
 * Manages scheduled exports of test data with configurable schedules.
 */

import { logger } from '../../utils/logger.js';
import { getTestExportService } from './TestExportService.js';
import { getTestPDFExportService } from './TestPDFExportService.js';
import { getTestSummaryService } from './TestSummaryService.js';
import type { TestSummaryDocument } from './TestSummaryService.js';

export interface ScheduledExportConfig {
  id: string;
  name: string;
  schedule: string; // Cron expression
  format: 'csv' | 'json' | 'xlsx' | 'pdf';
  filters?: {
    testType?: string;
    branch?: string;
    timeRangeDays?: number;
  };
  recipients?: string[]; // Email addresses
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledExportResult {
  configId: string;
  success: boolean;
  filename?: string;
  buffer?: Buffer;
  error?: string;
  runAt: Date;
}

export class TestScheduledExportService {
  private static instance: TestScheduledExportService | null = null;
  private scheduledExports: Map<string, ScheduledExportConfig> = new Map();
  private cronJobs: Map<string, any> = new Map();

  private constructor() {
    // Load scheduled exports from storage (would be from database in production)
    this.loadScheduledExports();
  }

  static getInstance(): TestScheduledExportService {
    if (!TestScheduledExportService.instance) {
      TestScheduledExportService.instance = new TestScheduledExportService();
    }
    return TestScheduledExportService.instance;
  }

  /**
   * Create a new scheduled export
   */
  async createScheduledExport(config: Omit<ScheduledExportConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>): Promise<ScheduledExportConfig> {
    const id = `export-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date();

    const fullConfig: ScheduledExportConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
      enabled: config.enabled !== false,
    };

    // Calculate next run time
    fullConfig.nextRun = this.calculateNextRun(fullConfig.schedule);

    this.scheduledExports.set(id, fullConfig);
    await this.saveScheduledExports();

    // Schedule the export
    if (fullConfig.enabled) {
      await this.scheduleExport(fullConfig);
    }

    logger.info({ id, name: fullConfig.name }, 'Created scheduled export');
    return fullConfig;
  }

  /**
   * Update a scheduled export
   */
  async updateScheduledExport(id: string, updates: Partial<ScheduledExportConfig>): Promise<ScheduledExportConfig> {
    const existing = this.scheduledExports.get(id);
    if (!existing) {
      throw new Error(`Scheduled export ${id} not found`);
    }

    // Remove old cron job
    if (this.cronJobs.has(id)) {
      const cronJob = this.cronJobs.get(id);
      cronJob.stop();
      this.cronJobs.delete(id);
    }

    const updated: ScheduledExportConfig = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    // Recalculate next run if schedule changed
    if (updates.schedule) {
      updated.nextRun = this.calculateNextRun(updated.schedule);
    }

    this.scheduledExports.set(id, updated);
    await this.saveScheduledExports();

    // Reschedule if enabled
    if (updated.enabled) {
      await this.scheduleExport(updated);
    }

    logger.info({ id, name: updated.name }, 'Updated scheduled export');
    return updated;
  }

  /**
   * Delete a scheduled export
   */
  async deleteScheduledExport(id: string): Promise<void> {
    const existing = this.scheduledExports.get(id);
    if (!existing) {
      throw new Error(`Scheduled export ${id} not found`);
    }

    // Remove cron job
    if (this.cronJobs.has(id)) {
      const cronJob = this.cronJobs.get(id);
      cronJob.stop();
      this.cronJobs.delete(id);
    }

    this.scheduledExports.delete(id);
    await this.saveScheduledExports();

    logger.info({ id, name: existing.name }, 'Deleted scheduled export');
  }

  /**
   * Get all scheduled exports
   */
  async getScheduledExports(): Promise<ScheduledExportConfig[]> {
    return Array.from(this.scheduledExports.values());
  }

  /**
   * Get a specific scheduled export
   */
  async getScheduledExport(id: string): Promise<ScheduledExportConfig | null> {
    return this.scheduledExports.get(id) || null;
  }

  /**
   * Execute a scheduled export
   */
  async executeScheduledExport(configId: string): Promise<ScheduledExportResult> {
    const config = this.scheduledExports.get(configId);
    if (!config) {
      throw new Error(`Scheduled export ${configId} not found`);
    }

    const runAt = new Date();

    try {
      logger.info({ configId, name: config.name }, 'Executing scheduled export');

      // Get test summaries based on filters
      const summaryService = getTestSummaryService();
      const endDate = new Date();
      const startDate = config.filters?.timeRangeDays
        ? new Date(endDate.getTime() - config.filters.timeRangeDays * 24 * 60 * 60 * 1000)
        : undefined;

      const { summaries } = await summaryService.getAllSummaries(
        {
          testType: config.filters?.testType as any,
          branch: config.filters?.branch,
          startDate,
          endDate,
        },
        {
          limit: 10000,
          sortBy: 'executionTimestamp',
          sortOrder: 'desc',
        }
      );

      // Generate export
      let result: { buffer: Buffer; filename: string; mimeType: string };

      if (config.format === 'pdf') {
        const pdfService = getTestPDFExportService();
        result = await pdfService.generatePDFReport(summaries, {
          format: 'pdf',
          testType: config.filters?.testType,
          branch: config.filters?.branch,
          startDate,
          endDate,
        });
      } else {
        const exportService = getTestExportService();
        result = await exportService.generateExcelExport(summaries, {
          format: config.format === 'xlsx' ? 'xlsx' : 'json',
          testType: config.filters?.testType,
          branch: config.filters?.branch,
          startDate,
          endDate,
        });
      }

      // Update last run time
      config.lastRun = runAt;
      config.nextRun = this.calculateNextRun(config.schedule);
      this.scheduledExports.set(configId, config);
      await this.saveScheduledExports();

      // Send to recipients if configured
      if (config.recipients && config.recipients.length > 0) {
        await this.sendExportToRecipients(config, result);
      }

      logger.info({ configId, name: config.name, filename: result.filename }, 'Scheduled export completed');

      return {
        configId,
        success: true,
        filename: result.filename,
        buffer: result.buffer,
        runAt,
      };
    } catch (error) {
      logger.error({ error, configId, name: config.name }, 'Scheduled export failed');

      return {
        configId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        runAt,
      };
    }
  }

  /**
   * Schedule an export using cron
   */
  private async scheduleExport(config: ScheduledExportConfig): Promise<void> {
    try {
      const cron = await import('node-cron') as typeof import('node-cron');
      
      const job = cron.schedule(config.schedule, async () => {
        try {
          await this.executeScheduledExport(config.id);
        } catch (error) {
          logger.error({ error, configId: config.id }, 'Error executing scheduled export');
        }
      }, {
        scheduled: true,
        timezone: 'UTC',
      });

      this.cronJobs.set(config.id, job);
      logger.info({ id: config.id, schedule: config.schedule }, 'Scheduled export job created');
    } catch (error) {
      logger.error({ error, id: config.id, schedule: config.schedule }, 'Failed to schedule export');
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRun(cronExpression: string): Date {
    // Simple calculation - in production, use a proper cron parser
    // For now, return a date 24 hours from now as placeholder
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 24);
    return nextRun;
  }

  /**
   * Send export to recipients via email
   */
  private async sendExportToRecipients(
    config: ScheduledExportConfig,
    exportResult: { buffer: Buffer; filename: string; mimeType: string }
  ): Promise<void> {
    try {
      const { getEmailService } = await import('../infrastructure/EmailService.js');
      const emailService = getEmailService();

      if (!emailService.isAvailable()) {
        logger.warn('Email service not available, cannot send scheduled export');
        return;
      }

      for (const recipient of config.recipients || []) {
        await emailService.send({
          to: recipient,
          subject: `Scheduled Test Export: ${config.name}`,
          text: `Please find attached the scheduled test export: ${config.name}`,
          html: `
            <h2>Scheduled Test Export</h2>
            <p>Please find attached the scheduled test export: <strong>${config.name}</strong></p>
            <p>Format: ${config.format.toUpperCase()}</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
          `,
        });

        // In production, would attach the file
        logger.info({ recipient, configId: config.id }, 'Sent scheduled export email');
      }
    } catch (error) {
      logger.error({ error, configId: config.id }, 'Failed to send scheduled export to recipients');
    }
  }

  /**
   * Load scheduled exports from storage
   */
  private async loadScheduledExports(): Promise<void> {
    // In production, load from database
    // For now, just initialize empty
    logger.debug('Loading scheduled exports');
  }

  /**
   * Save scheduled exports to storage
   */
  private async saveScheduledExports(): Promise<void> {
    // In production, save to database
    // For now, just log
    logger.debug({ count: this.scheduledExports.size }, 'Saving scheduled exports');
  }
}

export function getTestScheduledExportService(): TestScheduledExportService {
  return TestScheduledExportService.getInstance();
}

