import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { JobScheduler } from '../services/infrastructure/JobScheduler.js';
import { getQueueService } from '../services/infrastructure/QueueService.js';
import type {
  ScanJobData,
  EmbeddingJobData,
  ProcessingJobData,
  ExportJobData,
  JobSchedule,
  JobType,
} from '../types/job-data.js';
import { logger } from '../utils/logger.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = Router();

// Get JobScheduler instance (lazy initialization)
let jobSchedulerInstance: JobScheduler | null = null;

function getJobScheduler(): JobScheduler {
  if (!jobSchedulerInstance) {
    const queueService = getQueueService();
    jobSchedulerInstance = new JobScheduler(queueService);
    // Initialize scheduler (starts background checker)
    jobSchedulerInstance.initialize().catch((error) => {
      logger.error({ error }, 'Failed to initialize JobScheduler');
    });
  }
  return jobSchedulerInstance;
}

/**
 * POST /api/admin/scheduler/jobs
 * Create a new scheduled job
 */
router.post('/jobs', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { jobType, jobData, schedule } = req.body;

    // Validate required fields
    if (!jobType || !jobData || !schedule) {
      return res.status(400).json({ error: 'Missing required fields: jobType, jobData, schedule' });
    }

    // Validate jobType
    const validJobTypes: JobType[] = ['scan', 'embedding', 'processing', 'export'];
    if (!validJobTypes.includes(jobType)) {
      return res.status(400).json({ error: `Invalid jobType. Must be one of: ${validJobTypes.join(', ')}` });
    }

    // Validate schedule
    if (!schedule.delay && !schedule.cron) {
      return res.status(400).json({ error: 'Schedule must include either delay or cron expression' });
    }

    if (schedule.delay && schedule.cron) {
      return res.status(400).json({ error: 'Schedule cannot include both delay and cron expression' });
    }

    // Validate delay is a positive number
    if (schedule.delay !== undefined && (typeof schedule.delay !== 'number' || schedule.delay < 0)) {
      return res.status(400).json({ error: 'delay must be a non-negative number (milliseconds)' });
    }

    const scheduler = getJobScheduler();
    const jobId = await scheduler.createScheduledJob(jobType, jobData, schedule);

    res.status(201).json({
      id: jobId,
      message: 'Scheduled job created successfully',
    });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to create scheduled job');
  }
});

/**
 * GET /api/admin/scheduler/jobs
 * List all scheduled jobs (optionally filtered by enabled status)
 */
router.get('/jobs', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const enabled = req.query.enabled === undefined ? undefined : req.query.enabled === 'true';

    const scheduler = getJobScheduler();
    const jobs = await scheduler.listScheduledJobs(enabled);

    res.json({ jobs });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to list scheduled jobs');
  }
});

/**
 * GET /api/admin/scheduler/jobs/:id
 * Get a specific scheduled job by ID
 */
router.get('/jobs/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const scheduler = getJobScheduler();
    const job = await scheduler.getScheduledJob(id);

    if (!job) {
      return res.status(404).json({ error: 'Scheduled job not found' });
    }

    res.json({ job });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to fetch scheduled job');
  }
});

/**
 * PUT /api/admin/scheduler/jobs/:id
 * Update a scheduled job
 */
router.put('/jobs/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { schedule, enabled, jobData } = req.body;

    // Validate that at least one field is being updated
    if (!schedule && enabled === undefined && !jobData) {
      return res.status(400).json({ error: 'At least one field (schedule, enabled, jobData) must be provided' });
    }

    // Validate schedule if provided
    if (schedule) {
      if (!schedule.delay && !schedule.cron) {
        return res.status(400).json({ error: 'Schedule must include either delay or cron expression' });
      }

      if (schedule.delay && schedule.cron) {
        return res.status(400).json({ error: 'Schedule cannot include both delay and cron expression' });
      }

      if (schedule.delay !== undefined && (typeof schedule.delay !== 'number' || schedule.delay < 0)) {
        return res.status(400).json({ error: 'delay must be a non-negative number (milliseconds)' });
      }
    }

    const scheduler = getJobScheduler();
    const updates: Partial<{ schedule: JobSchedule; enabled: boolean; jobData: ScanJobData | EmbeddingJobData | ProcessingJobData | ExportJobData }> = {};

    if (schedule) {
      updates.schedule = schedule;
    }
    if (enabled !== undefined) {
      updates.enabled = enabled;
    }
    if (jobData) {
      updates.jobData = jobData as ScanJobData | EmbeddingJobData | ProcessingJobData | ExportJobData;
    }

    await scheduler.updateScheduledJob(id, updates);

    res.json({ message: 'Scheduled job updated successfully' });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to update scheduled job');
  }
});

/**
 * DELETE /api/admin/scheduler/jobs/:id
 * Delete a scheduled job
 */
router.delete('/jobs/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const scheduler = getJobScheduler();
    await scheduler.deleteScheduledJob(id);

    res.json({ message: 'Scheduled job deleted successfully' });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to delete scheduled job');
  }
});

/**
 * POST /api/admin/scheduler/jobs/:id/enable
 * Enable a scheduled job
 */
router.post('/jobs/:id/enable', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const scheduler = getJobScheduler();
    await scheduler.setScheduledJobEnabled(id, true);

    res.json({ message: 'Scheduled job enabled successfully' });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to enable scheduled job');
  }
});

/**
 * POST /api/admin/scheduler/jobs/:id/disable
 * Disable a scheduled job
 */
router.post('/jobs/:id/disable', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const scheduler = getJobScheduler();
    await scheduler.setScheduledJobEnabled(id, false);

    res.json({ message: 'Scheduled job disabled successfully' });
  } catch (error) {
    handleRouteError(error, req, res, {}, 'Failed to disable scheduled job');
  }
});

export default router;










