import { Router, Request, Response } from 'express';
import { ScanService } from '../services/ScanService.js';
import { WebsiteSuggestionOrchestrator } from '../services/website-suggestion/WebsiteSuggestionOrchestrator.js';
import { mapQueryProgressToDto } from '../utils/mappers.js';
import { validate } from '../middleware/validation.js';
import { scanSchemas } from '../validation/scanSchemas.js';
import { NotFoundError, ServiceUnavailableError, BadRequestError } from '../types/errors.js';
import { isApiKeysMissingError } from '../../shared/typeGuards.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { logger } from '../utils/logger.js';
import type { RunManager } from '../services/workflow/RunManager.js';
import type { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';

import type { Db } from '../config/database.js';

export function createScanRouter(_runManager: RunManager, workflowEngine: WorkflowEngine, db?: Db): Router {
    const router = Router();
    const scanService = new ScanService();
    // Pass implicit DB dependency if available (fixes startup ordering issues)
    const suggestionOrchestrator = new WebsiteSuggestionOrchestrator(db);

    /**
     * GET /api/queries/:id/progress
     * Get progress status for query generation
     */
    router.get('/:id/progress', validate(scanSchemas.getProgress), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        const progress = suggestionOrchestrator.getProgress(queryId);
        if (!progress) {
            // Log progress lookup failure for monitoring
            logger.warn({ queryId, path: req.path, method: req.method }, 'Progress lookup failed - progress not found');
            // Throw error with recovery suggestions in context
            throw new NotFoundError('Progress', queryId, {
                recovery: 'The progress may have expired or been cleaned up. Please start a new scan.',
                suggestion: 'Start a new query to generate fresh progress tracking.',
            });
        }
        const progressDTO = mapQueryProgressToDto(progress);
        res.status(200).json(progressDTO);
    }));

    /**
     * POST /api/queries/:id/suggestions
     * Generate website suggestions for the specified query
     * Uses OpenAI deep research (o4-mini-deep-research) or Google Search API
     */
    router.post('/:id/suggestions', validate(scanSchemas.generateSuggestions), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        try {
            const response = await suggestionOrchestrator.generateSuggestions(queryId);
            res.status(200).json(response);
        } catch (error) {
            // Check if this is an API keys missing error - convert to ServiceUnavailableError
            if (isApiKeysMissingError(error)) {
                throw new ServiceUnavailableError(error instanceof Error ? error.message : 'API keys missing', { queryId });
            }
            // Check if query not found
            if (error instanceof Error && error.message === 'Query not found') {
                throw new NotFoundError('Query', queryId);
            }
            // Re-throw to be handled by error middleware
            throw error;
        }
    }));

    /**
     * POST /api/queries/:id/suggestions/mock
     * Generate mock website suggestions for development/testing
     */
    router.post('/:id/suggestions/mock', validate(scanSchemas.generateMockSuggestions), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        const response = await suggestionOrchestrator.generateMockSuggestions(queryId);
        res.status(200).json(response);
    }));

    /**
     * POST /api/queries/:id/scrape
     * Scrape selected websites for documents using workflow with real-time graph visualization
     */
    router.post('/:id/scrape', validate(scanSchemas.scrape), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        const { websiteIds } = req.body as { websiteIds: string[] };
        // Get userId if available (this route may not have auth middleware)
        const userId = (req as { user?: { userId?: string } }).user?.userId;
        try {
            const result = await scanService.startScrapeWorkflow(queryId, websiteIds, workflowEngine, userId);
            res.status(200).json(result);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === 'Invalid query ID' || error.message.startsWith('Invalid website IDs')) {
                    throw new BadRequestError(error.message);
                }
                if (error.message === 'Query not found' || error.message === 'No websites found with the provided IDs') {
                    throw new NotFoundError(error.message.includes('Query') ? 'Query' : 'Websites', queryId);
                }
            }
            throw error;
        }
    }));

    /**
     * POST /api/queries/:id/scan
     * Queue a full scan job using ScraperOrchestrator (with IPLO, IMBOR, and web scraping)
     * Returns immediately with job ID for polling
     */
    router.post('/:id/scan', validate(scanSchemas.queueScan), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        const result = await scanService.queueScanJob(queryId);
        res.status(202).json(result);
    }));

    /**
     * GET /api/queries/:id/scan/job/:jobId
     * Get the status of a specific scan job
     */
    router.get('/:id/scan/job/:jobId', validate(scanSchemas.getJobStatus), asyncHandler(async (req: Request, res: Response) => {
        const { id: queryId, jobId } = req.params;
        const result = await scanService.getJobStatus(queryId, jobId);
        res.status(200).json(result);
    }));

    /**
     * GET /api/queries/:id/scan/jobs
     * Get all scan jobs for a query
     */
    router.get('/:id/scan/jobs', validate(scanSchemas.getJobsForQuery), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        try {
            const response = await scanService.getJobsForQuery(queryId);
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof Error && error.message === 'Invalid query ID') {
                throw new BadRequestError(error.message);
            }
            throw error;
        }
    }));

    /**
     * DELETE /api/queries/:id/scan/job/:jobId
     * Cancel a scan job
     */
    router.delete('/:id/scan/job/:jobId', validate(scanSchemas.cancelJob), asyncHandler(async (req: Request, res: Response) => {
        const { id: queryId, jobId } = req.params;
        const result = await scanService.cancelJob(queryId, jobId);
        res.status(200).json(result);
    }));

    /**
     * GET /api/queries/:id/scan/status
     * Get the status of a scan (legacy endpoint - counts documents)
     */
    router.get('/:id/scan/status', validate(scanSchemas.getScanStatus), asyncHandler(async (req: Request, res: Response) => {
        const queryId = req.params.id;
        try {
            const response = await scanService.getScanStatus(queryId);
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof Error && error.message === 'Invalid query ID') {
                throw new BadRequestError(error.message);
            }
            throw error;
        }
    }));

    return router;
}

// Note: Default export removed - use createScanRouter() with initialized runManager and workflowEngine
// This prevents calling getDB() before database is initialized
