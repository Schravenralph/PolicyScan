import { ObjectId, type UpdateFilter } from 'mongodb';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError } from '../../types/errors.js';
import type {
  ScanJobData,
  EmbeddingJobData,
  ProcessingJobData,
  ExportJobData,
  JobSchedule,
  JobType,
} from '../../types/job-data.js';
import { QueueService } from './QueueService.js';

/**
 * Scheduled job metadata stored in MongoDB
 */
export interface ScheduledJob {
  _id?: ObjectId;
  id?: string;
  jobType: JobType;
  jobData: ScanJobData | EmbeddingJobData | ProcessingJobData | ExportJobData;
  schedule: JobSchedule;
  enabled: boolean;
  nextRunAt?: Date;
  lastRunAt?: Date;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * JobScheduler manages scheduled and recurring jobs for QueueService
 * 
 * Features:
 * - One-time delayed jobs (using delay in milliseconds)
 * - Recurring jobs with cron expressions
 * - Job schedule management (create, update, delete, enable/disable)
 * - Automatic job creation based on schedules
 */
export class JobScheduler {
  private queueService: QueueService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
  private initialized: boolean = false;

  constructor(queueService: QueueService) {
    this.queueService = queueService;
  }

  /**
   * Initialize the scheduler (starts the background checker)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing JobScheduler...');

    // Run initial check
    await this.checkAndScheduleJobs();

    // Start periodic checking
    this.checkInterval = setInterval(() => {
      this.checkAndScheduleJobs().catch((error) => {
        logger.error({ error }, 'Error in scheduled job checker');
      });
    }, this.CHECK_INTERVAL_MS);

    this.initialized = true;
    logger.info('JobScheduler initialized');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.initialized = false;
      logger.info('JobScheduler stopped');
    }
  }

  /**
   * Create a scheduled job
   */
  async createScheduledJob(
    jobType: JobType,
    jobData: ScanJobData | EmbeddingJobData | ProcessingJobData | ExportJobData,
    schedule: JobSchedule
  ): Promise<string> {
    if (!schedule.delay && !schedule.cron) {
      throw new Error('Schedule must include either delay or cron expression');
    }

    if (schedule.delay && schedule.cron) {
      throw new Error('Schedule cannot include both delay and cron expression');
    }

    // Validate cron expression if provided
    if (schedule.cron && !this.isValidCronExpression(schedule.cron)) {
      throw new Error(`Invalid cron expression: ${schedule.cron}`);
    }

    const db = getDB();
    const now = new Date();

    // Calculate next run time
    const nextRunAt = this.calculateNextRunTime(schedule, now);

    const scheduledJob: ScheduledJob = {
      jobType,
      jobData: { ...jobData, schedule }, // Include schedule in job data
      schedule,
      enabled: true,
      nextRunAt,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<ScheduledJob>('scheduled_jobs').insertOne(scheduledJob);
    const jobId = result.insertedId.toString();

    logger.info({ jobId, jobType, nextRunAt }, 'Created scheduled job');

    // If it's a delayed job with immediate delay, queue it immediately
    if (schedule.delay && schedule.delay <= this.CHECK_INTERVAL_MS) {
      await this.queueScheduledJob(jobId, scheduledJob);
    }

    return jobId;
  }

  /**
   * Get a scheduled job by ID
   */
  async getScheduledJob(jobId: string): Promise<ScheduledJob | null> {
    // Validate ObjectId format before querying
    if (!ObjectId.isValid(jobId)) {
      return null;
    }

    const db = getDB();
    const job = await db
      .collection<ScheduledJob>('scheduled_jobs')
      .findOne({ _id: new ObjectId(jobId) });

    return job;
  }

  /**
   * List all scheduled jobs (optionally filtered by enabled status)
   */
  async listScheduledJobs(enabled?: boolean): Promise<ScheduledJob[]> {
    const db = getDB();
    const query = enabled !== undefined ? { enabled } : {};

    const jobs = await db
      .collection<ScheduledJob>('scheduled_jobs')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return jobs.map((job) => ({
      ...job,
      id: job._id?.toString(),
    }));
  }

  /**
   * Update a scheduled job
   */
  async updateScheduledJob(
    jobId: string,
    updates: Partial<Pick<ScheduledJob, 'schedule' | 'enabled' | 'jobData'>>
  ): Promise<void> {
    // Validate ObjectId format before querying
    if (!ObjectId.isValid(jobId)) {
      throw new NotFoundError('Scheduled job', jobId, { message: 'Scheduled job not found' });
    }

    const db = getDB();
    const now = new Date();

    // If schedule is being updated, recalculate next run time
    let nextRunAt: Date | undefined;
    if (updates.schedule) {
      nextRunAt = this.calculateNextRunTime(updates.schedule, now);
    } else {
      // Get current schedule to recalculate
      const currentJob = await this.getScheduledJob(jobId);
      if (currentJob) {
        nextRunAt = this.calculateNextRunTime(currentJob.schedule, now);
      }
    }

    const updatePayload: Partial<ScheduledJob> = {
      ...updates,
      updatedAt: now,
    };

    if (nextRunAt) {
      updatePayload.nextRunAt = nextRunAt;
    }

    const update: UpdateFilter<ScheduledJob> = {
      $set: updatePayload
    };
    const result = await db
      .collection<ScheduledJob>('scheduled_jobs')
      .updateOne({ _id: new ObjectId(jobId) }, update);

    if (result.matchedCount === 0) {
      throw new NotFoundError('Scheduled job', jobId, { message: 'Scheduled job not found' });
    }

    logger.info({ jobId }, 'Updated scheduled job');
  }

  /**
   * Delete a scheduled job
   */
  async deleteScheduledJob(jobId: string): Promise<void> {
    // Validate ObjectId format before querying
    if (!ObjectId.isValid(jobId)) {
      throw new NotFoundError('Scheduled job', jobId, { message: 'Scheduled job not found' });
    }

    const db = getDB();
    const result = await db
      .collection<ScheduledJob>('scheduled_jobs')
      .deleteOne({ _id: new ObjectId(jobId) });

    if (result.deletedCount === 0) {
      throw new NotFoundError('Scheduled job', jobId, { message: 'Scheduled job not found' });
    }

    logger.info({ jobId }, 'Deleted scheduled job');
  }

  /**
   * Enable or disable a scheduled job
   */
  async setScheduledJobEnabled(jobId: string, enabled: boolean): Promise<void> {
    await this.updateScheduledJob(jobId, { enabled });
  }

  /**
   * Check for jobs that need to be scheduled and queue them
   */
  private async checkAndScheduleJobs(): Promise<void> {
    const db = getDB();
    const now = new Date();

    // Find jobs that are enabled and need to run
    const jobsToRun = await db
      .collection<ScheduledJob>('scheduled_jobs')
      .find({
        enabled: true,
        $or: [
          { nextRunAt: { $lte: now } },
          { nextRunAt: { $exists: false } }, // Jobs without nextRunAt (shouldn't happen, but handle it)
        ],
      })
      .toArray();

    for (const job of jobsToRun) {
      try {
        // Check if job should still run (endDate check)
        if (job.schedule.endDate) {
          const endDate = new Date(job.schedule.endDate);
          if (now > endDate) {
            // Job has expired, disable it
            await this.setScheduledJobEnabled(job._id!.toString(), false);
            logger.info({ jobId: job._id?.toString() }, 'Scheduled job expired, disabled');
            continue;
          }
        }

        // Check repeat count if specified
        if (job.schedule.repeatCount && job.runCount >= job.schedule.repeatCount) {
          // Job has reached max repeats, disable it
          await this.setScheduledJobEnabled(job._id!.toString(), false);
          logger.info({ jobId: job._id?.toString() }, 'Scheduled job reached max repeats, disabled');
          continue;
        }

        // Queue the job
        await this.queueScheduledJob(job._id!.toString(), job);

        // Update next run time for recurring jobs
        if (job.schedule.cron) {
          const nextRunAt = this.calculateNextRunTime(job.schedule, now);
          await db
            .collection<ScheduledJob>('scheduled_jobs')
            .updateOne(
              { _id: job._id },
              {
                $set: {
                  nextRunAt,
                  lastRunAt: now,
                  updatedAt: now,
                },
                $inc: { runCount: 1 },
              }
            );
        } else {
          // One-time delayed job, remove it after queuing
          await this.deleteScheduledJob(job._id!.toString());
        }
      } catch (error) {
        logger.error({ error, jobId: job._id?.toString() }, 'Error processing scheduled job');
      }
    }
  }

  /**
   * Queue a scheduled job using QueueService
   */
  private async queueScheduledJob(jobId: string, scheduledJob: ScheduledJob): Promise<void> {
    const { jobType, jobData, schedule } = scheduledJob;

    // Remove schedule from jobData before queuing (schedule is metadata, not part of job execution)
    // Create a clean copy without the schedule property
    const cleanJobData = { ...jobData };
    delete (cleanJobData as { schedule?: JobSchedule }).schedule;

    // Calculate delay if this is a delayed job
    let delay = 0;
    if (schedule.delay) {
      if (schedule.startDate) {
        const startDate = new Date(schedule.startDate);
        const now = new Date();
        const msUntilStart = startDate.getTime() - now.getTime();
        delay = Math.max(0, msUntilStart + schedule.delay);
      } else {
        delay = schedule.delay;
      }
    }

    try {
      switch (jobType) {
        case 'scan':
          await this.queueService.queueScan(cleanJobData as ScanJobData, delay);
          break;
        case 'embedding':
          await this.queueService.queueEmbedding(cleanJobData as EmbeddingJobData, delay);
          break;
        case 'processing':
          await this.queueService.queueProcessing(cleanJobData as ProcessingJobData, delay);
          break;
        case 'export':
          await this.queueService.queueExport(cleanJobData as ExportJobData, delay);
          break;
        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      logger.info({ jobId, jobType, delay }, 'Queued scheduled job');
    } catch (error) {
      logger.error({ error, jobId, jobType }, 'Failed to queue scheduled job');
      throw error;
    }
  }

  /**
   * Calculate the next run time for a schedule
   */
  private calculateNextRunTime(schedule: JobSchedule, fromDate: Date = new Date()): Date {
    // For delayed jobs, next run is: startDate (or now) + delay
    if (schedule.delay) {
      if (schedule.startDate) {
        const startDate = new Date(schedule.startDate);
        return new Date(startDate.getTime() + schedule.delay);
      }
      return new Date(fromDate.getTime() + schedule.delay);
    }

    // For recurring jobs with cron, calculate next occurrence
    if (schedule.cron) {
      return this.calculateNextCronRun(schedule.cron, fromDate, schedule.startDate);
    }

    // Fallback to now
    return fromDate;
  }

  /**
   * Calculate next run time from cron expression
   * Supports basic cron format: "minute hour day month dayOfWeek"
   * Examples:
   * - "0 9 * * *" - Daily at 9 AM
   * - "0 *\/6 * * *" - Every 6 hours
   * - "30 14 * * 1-5" - Weekdays at 2:30 PM
   */
  private calculateNextCronRun(
    cronExpression: string,
    fromDate: Date = new Date(),
    startDate?: string
  ): Date {
    const start = startDate ? new Date(startDate) : fromDate;
    const now = fromDate;

    // If start date is in the future, use that
    if (start > now) {
      return start;
    }

    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression format: ${cronExpression}. Expected 5 parts.`);
    }

    const [minute, hour, day, month, dayOfWeek] = parts;

    // Parse cron parts (simplified parser - handles common patterns)
    const minuteMatches = this.parseCronPart(minute, 0, 59);
    const hourMatches = this.parseCronPart(hour, 0, 23);
    const dayMatches = this.parseCronPart(day, 1, 31);
    const monthMatches = this.parseCronPart(month, 1, 12);
    const dayOfWeekMatches = this.parseCronPart(dayOfWeek, 0, 6);

    // Find next matching time (simplified algorithm - checks up to 1 year ahead)
    const checkDate = new Date(now);
    checkDate.setSeconds(0, 0); // Reset seconds and milliseconds

    for (let i = 0; i < 365 * 24 * 60; i++) {
      // Increment by 1 minute
      checkDate.setMinutes(checkDate.getMinutes() + 1);

      const checkMinute = checkDate.getMinutes();
      const checkHour = checkDate.getHours();
      const checkDay = checkDate.getDate();
      const checkMonth = checkDate.getMonth() + 1; // JS months are 0-indexed
      const checkDayOfWeek = checkDate.getDay();

      if (
        minuteMatches.includes(checkMinute) &&
        hourMatches.includes(checkHour) &&
        dayMatches.includes(checkDay) &&
        monthMatches.includes(checkMonth) &&
        dayOfWeekMatches.includes(checkDayOfWeek)
      ) {
        return new Date(checkDate);
      }
    }

    // If no match found in a year, return date 1 year from now (shouldn't happen in practice)
    const fallback = new Date(now);
    fallback.setFullYear(fallback.getFullYear() + 1);
    return fallback;
  }

  /**
   * Parse a cron part (minute, hour, day, etc.) into array of matching values
   * Supports: *, number, range (1-5), step (* /5, 1-10/2), list (1,3,5)
   */
  private parseCronPart(part: string, min: number, max: number): number[] {
    // Handle wildcard
    if (part === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    }

    // Handle step (e.g., */5, 1-10/2)
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      const rangeMatches = range === '*' ? Array.from({ length: max - min + 1 }, (_, i) => i + min) : this.parseCronPart(range, min, max);

      let start = min;
      if (range !== '*') {
        // Try to extract start from range
        const firstPart = range.split('-')[0];
        const parsedStart = parseInt(firstPart, 10);
        if (!isNaN(parsedStart)) {
          start = parsedStart;
        }
      }

      return rangeMatches.filter((val) => (val - start) % stepNum === 0);
    }

    // Handle range (e.g., 1-5)
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n, 10));
      return Array.from({ length: end - start + 1 }, (_, i) => i + start);
    }

    // Handle list (e.g., 1,3,5)
    if (part.includes(',')) {
      return part.split(',').map((n) => parseInt(n.trim(), 10));
    }

    // Handle single number
    const num = parseInt(part, 10);
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`Invalid cron part value: ${part} (must be between ${min} and ${max})`);
    }
    return [num];
  }

  /**
   * Validate cron expression format
   */
  private isValidCronExpression(cron: string): boolean {
    try {
      const parts = cron.trim().split(/\s+/);
      if (parts.length !== 5) {
        return false;
      }

      // Basic validation - check that parts are parseable
      this.parseCronPart(parts[0], 0, 59); // minute
      this.parseCronPart(parts[1], 0, 23); // hour
      this.parseCronPart(parts[2], 1, 31); // day
      this.parseCronPart(parts[3], 1, 12); // month
      this.parseCronPart(parts[4], 0, 6); // dayOfWeek

      return true;
    } catch {
      return false;
    }
  }
}

