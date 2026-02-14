import express, { Request, Response, Router } from 'express';
import { getProgressService } from '../services/progress/ProgressService.js';
import type { ProgressQueryFilters, JobProgressStatus } from '../types/progress.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { NotFoundError } from '../types/errors.js';

/**
 * Create progress routes
 */
export function createProgressRouter(authService: AuthService): Router {
  const router = express.Router();
  const progressService = getProgressService();
  const requireAuth = authenticate(authService);

  /**
   * GET /api/progress/:jobId
   * Get progress for a specific job
   */
  router.get(
    '/:jobId',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { jobId } = req.params;

      const progress = await progressService.getJobProgress(jobId);

      if (!progress) {
        throw new NotFoundError('Progress', jobId);
      }

      res.json(progress);
    })
  );

  /**
   * GET /api/progress
   * Query progress with filters
   */
  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const filters: ProgressQueryFilters = {};

      // Parse query parameters
      if (req.query.jobId) {
        filters.jobId = req.query.jobId as string;
      }

      if (req.query.jobType) {
        const jobType = req.query.jobType as string;
        if (['scan', 'embedding', 'processing', 'export'].includes(jobType)) {
          filters.jobType = jobType as 'scan' | 'embedding' | 'processing' | 'export';
        }
      }

      if (req.query.queryId) {
        filters.queryId = req.query.queryId as string;
      }

      if (req.query.status) {
        const status = req.query.status as string;
        if (Array.isArray(status)) {
          filters.status = status as JobProgressStatus[];
        } else {
          filters.status = status as JobProgressStatus;
        }
      }

      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }

      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }

      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit as string, 10);
      }

      if (req.query.skip) {
        filters.skip = parseInt(req.query.skip as string, 10);
      }

      const progress = await progressService.queryProgress(filters);

      res.json({
        count: progress.length,
        results: progress,
      });
    })
  );

  /**
   * GET /api/progress/query/:queryId
   * Get progress for all jobs related to a query
   */
  router.get(
    '/query/:queryId',
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { queryId } = req.params;

      const progress = await progressService.getProgressForQuery(queryId);

      res.json({
        queryId,
        count: progress.length,
        results: progress,
      });
    })
  );

  return router;
}



