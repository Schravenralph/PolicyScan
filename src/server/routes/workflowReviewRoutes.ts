import express from 'express';
import { RunManager } from '../services/workflow/RunManager.js';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';
import { validate } from '../middleware/validation.js';
import { workflowSchemas } from '../validation/workflowSchemas.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthenticationError } from '../types/errors.js';
import { explorationWorkflow, standardScanWorkflow, quickIploScanWorkflow, beleidsscanGraphWorkflow, bfs3HopWorkflow, externalLinksWorkflow, horstAanDeMaasWorkflow, horstLaborMigrationWorkflow } from '../workflows/predefinedWorkflows.js';

/**
 * Creates a router for review-related endpoints
 * Handles semi-automated review workflows (US-009) and advanced review features (WI-187)
 */
export function createReviewRoutes(
    runManager: RunManager,
    workflowEngine: WorkflowEngine
): express.Router {
    const router = express.Router();

    // Lazy load ReviewService to avoid circular dependencies
    let reviewService: import('../services/review/ReviewService.js').ReviewService | null = null;
    const getReviewService = async () => {
        if (!reviewService) {
            const { ReviewService } = await import('../services/review/ReviewService.js');
            reviewService = new ReviewService(runManager, workflowEngine);
        }
        return reviewService;
    };

    // ============================================
    // Analytics Routes - MUST be defined before /reviews/:runId to avoid route conflicts
    // ============================================
    // NOTE: These routes must come before parameterized routes like /reviews/:runId
    // because Express matches routes in order, and /reviews/analytics would match /reviews/:runId

    // GET /api/reviews/analytics/metrics
    router.get('/reviews/analytics/metrics', asyncHandler(async (req, res) => {
        const { getReviewAnalytics } = await import('../services/review/ReviewAnalytics.js');
        const analytics = getReviewAnalytics();
        const timeRangeDays = req.query.days ? parseInt(req.query.days as string, 10) : 30;
        
        const metrics = await analytics.getReviewMetrics(timeRangeDays);
        res.json(metrics);
    }));

    // GET /api/reviews/analytics/candidates
    router.get('/reviews/analytics/candidates', asyncHandler(async (req, res) => {
        const { getReviewAnalytics } = await import('../services/review/ReviewAnalytics.js');
        const analytics = getReviewAnalytics();
        const timeRangeDays = req.query.days ? parseInt(req.query.days as string, 10) : 30;
        
        const candidateAnalytics = await analytics.getCandidateAnalytics(timeRangeDays);
        res.json(candidateAnalytics);
    }));

    // GET /api/reviews/analytics/trends
    router.get('/reviews/analytics/trends', asyncHandler(async (req, res) => {
        const { getReviewAnalytics } = await import('../services/review/ReviewAnalytics.js');
        const analytics = getReviewAnalytics();
        const period = (req.query.period as 'day' | 'week' | 'month') || 'day';
        const timeRangeDays = req.query.days ? parseInt(req.query.days as string, 10) : 30;
        
        const trends = await analytics.getReviewTrends(period, timeRangeDays);
        res.json(trends);
    }));

    // GET /api/reviews/analytics
    // Get comprehensive review analytics
    // NOTE: This route must be defined AFTER the more specific /analytics/* routes
    router.get('/reviews/analytics', asyncHandler(async (req, res) => {
        const { workflowId, startDate, endDate } = req.query;
        const { getReviewAnalyticsService } = await import('../services/review/ReviewAnalyticsService.js');
        const analyticsService = getReviewAnalyticsService();
        
        const start = startDate ? new Date(startDate as string) : undefined;
        const end = endDate ? new Date(endDate as string) : undefined;
        
        const analytics = await analyticsService.getAnalytics(
            workflowId as string | undefined,
            start,
            end
        );
        
        res.json(analytics);
    }));

    // ============================================
    // Review Templates API - MUST be defined before /reviews/:runId to avoid route conflicts
    // ============================================
    // GET /api/reviews/templates
    router.get('/reviews/templates', asyncHandler(async (req, res) => {
        const { userId, workflowId, moduleId, public: includePublic } = req.query;
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        const templateModel = getReviewTemplateModel();

        let templates;
        if (userId) {
            templates = await templateModel.getTemplatesByUser(userId as string, includePublic === 'true');
        } else if (workflowId) {
            templates = await templateModel.getTemplatesByWorkflow(workflowId as string, moduleId as string | undefined);
        } else if (includePublic === 'true') {
            templates = await templateModel.getPublicTemplates();
        } else {
            throw new BadRequestError('Must provide userId, workflowId, or public=true', {
                received: { userId, workflowId, moduleId, public: includePublic },
            });
        }

        res.json(templates);
    }));

    // POST /api/reviews/templates
    router.post('/reviews/templates', asyncHandler(async (req, res) => {
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        const templateModel = getReviewTemplateModel();
        const userId = req.user?.userId;

        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        const template = await templateModel.createTemplate({
            ...req.body,
            createdBy: userId
        });

        res.status(201).json(template);
    }));

    // GET /api/reviews/templates/:templateId
    router.get('/reviews/templates/:templateId', asyncHandler(async (req, res) => {
        const { templateId } = req.params;
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        const templateModel = getReviewTemplateModel();

        const template = await templateModel.getTemplateById(templateId);
        if (!template) {
            throw new NotFoundError('Template', templateId);
        }

        res.json(template);
    }));

    // PUT /api/reviews/templates/:templateId
    router.put('/reviews/templates/:templateId', asyncHandler(async (req, res) => {
        const { templateId } = req.params;
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        const templateModel = getReviewTemplateModel();

        const template = await templateModel.updateTemplate(templateId, req.body);
        if (!template) {
            throw new NotFoundError('Template', templateId);
        }

        res.json(template);
    }));

    // DELETE /api/reviews/templates/:templateId
    router.delete('/reviews/templates/:templateId', asyncHandler(async (req, res) => {
        const { templateId } = req.params;
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        const templateModel = getReviewTemplateModel();

        const deleted = await templateModel.deleteTemplate(templateId);
        if (!deleted) {
            throw new NotFoundError('Template', templateId);
        }

        res.json({ message: '[i18n:apiMessages.templateDeleted]' });
    }));

    // POST /api/reviews/:reviewId/apply-template/:templateId
    // Apply a template to a review
    router.post('/reviews/:reviewId/apply-template/:templateId', asyncHandler(async (req, res) => {
        const { reviewId, templateId } = req.params;
        const { getReviewTemplateModel } = await import('../models/ReviewTemplate.js');
        
        const templateModel = getReviewTemplateModel();
        const reviewService = await getReviewService();

        const template = await templateModel.getTemplateById(templateId);
        if (!template) {
            throw new NotFoundError('Template', templateId);
        }

        const review = await reviewService.getReview(reviewId);
        if (!review) {
            throw new NotFoundError('Review', reviewId);
        }

        // Apply template to candidates
        const decisions = templateModel.applyTemplateToCandidates(
            template,
            review.candidateResults || []
        );

        // Increment template usage
        await templateModel.incrementUsage(templateId);

        // Apply decisions
        const userId = req.user?.userId;
        if (decisions.length > 0) {
            await reviewService.reviewCandidates(reviewId, decisions, userId);
        }

        res.json({
            message: `[i18n:apiMessages.templateApplied]|${decisions.length}`,
            decisions
        });
    }));

    // GET /api/reviews/:runId
    // Get pending review for a run
    // NOTE: This route must be defined AFTER all specific routes (like /reviews/analytics) to avoid conflicts
    router.get('/reviews/:runId', validate(workflowSchemas.getReview), asyncHandler(async (req, res) => {
        const service = await getReviewService();
        const { runId } = req.params;
        const { moduleId, all } = req.query;

        if (all === 'true') {
            // Get all pending reviews for the run
            const reviews = await service.getAllPendingReviews(runId);
            res.json(reviews);
        } else {
            // Get single pending review
            const review = await service.getPendingReview(runId, moduleId as string | undefined);
            
            if (!review) {
                // Provide more helpful error message
                throw new NotFoundError(
                    'Pending review', 
                    runId,
                    {
                        message: `No pending review found for run ${runId}. The review may not have been created (no candidates found), may have been completed, or the workflow may have resumed.`,
                        hint: 'If the workflow is paused but no review exists, it may be because no candidates were found at the review point.'
                    }
                );
            }

            res.json(review);
        }
    }));

    // POST /api/reviews/:reviewId/candidates/:candidateId
    // Accept or reject a candidate
    router.post('/reviews/:reviewId/candidates/:candidateId', validate(workflowSchemas.reviewCandidate), asyncHandler(async (req, res) => {
        const service = await getReviewService();
        const { reviewId, candidateId } = req.params;
        const { status, notes } = req.body;
        const userId = req.user?.userId;

        // Validation is now handled in ReviewService with better error messages
        await service.reviewCandidate(reviewId, candidateId, status, userId, notes);

        res.json({
            message: '[i18n:apiMessages.candidateReviewed]',
            reviewId,
            candidateId,
            status
        });
    }));

    // POST /api/reviews/:reviewId/candidates
    // Accept or reject multiple candidates
    router.post('/reviews/:reviewId/candidates', validate(workflowSchemas.reviewCandidates), asyncHandler(async (req, res) => {
        const { reviewId } = req.params;
        const { decisions } = req.body;
        const userId = req.user?.userId;

        const service = await getReviewService();
        await service.reviewCandidates(reviewId, decisions, userId);

        res.json({
            message: '[i18n:apiMessages.candidatesReviewed]',
            reviewId,
            reviewedCount: decisions.length
        });
    }));

    // POST /api/reviews/:reviewId/complete
    // Complete review and resume workflow
    router.post('/reviews/:reviewId/complete', validate(workflowSchemas.completeReview), asyncHandler(async (req, res) => {
        const { reviewId } = req.params;
        const { workflowId } = req.body;
        const userId = req.user?.userId;

        // Get workflow
        let workflow;
        switch (workflowId) {
            case 'iplo-exploration':
                workflow = explorationWorkflow;
                break;
            case 'standard-scan':
                workflow = standardScanWorkflow;
                break;
            case 'quick-iplo-scan':
                workflow = quickIploScanWorkflow;
                break;
            case 'external-links-exploration':
                workflow = externalLinksWorkflow;
                break;
            case 'beleidsscan-graph':
                workflow = beleidsscanGraphWorkflow;
                break;
            case 'bfs-3-hop':
                workflow = bfs3HopWorkflow;
                break;
            case 'horst-aan-de-maas':
                workflow = horstAanDeMaasWorkflow;
                break;
            case 'horst-labor-migration':
                workflow = horstLaborMigrationWorkflow;
                break;
            default:
                throw new NotFoundError('Workflow', workflowId);
        }

        const service = await getReviewService();
        await service.completeReviewAndResume(reviewId, workflow, userId);

        res.json({
            message: '[i18n:apiMessages.reviewCompletedResumed]',
            reviewId,
            workflowId: workflow.id
        });
    }));

    // GET /api/reviews/statistics/:workflowId
    // Get review statistics for learning
    router.get('/reviews/statistics/:workflowId', asyncHandler(async (req, res) => {
        const { workflowId } = req.params;
        const service = await getReviewService();
        const statistics = await service.getReviewStatistics(workflowId);
        res.json(statistics);
    }));

    // GET /api/reviews/history/:workflowId
    // Get review history for a workflow
    router.get('/reviews/history/:workflowId', asyncHandler(async (req, res) => {
        const { workflowId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;
        const service = await getReviewService();
        const history = await service.getReviewHistory(workflowId, limit);
        res.json(history);
    }));

    // GET /api/reviews/:reviewId/stats
    // Get candidate statistics for a review
    router.get('/reviews/:reviewId/stats', asyncHandler(async (req, res) => {
        const { reviewId } = req.params;
        const service = await getReviewService();
        const stats = await service.getCandidateStats(reviewId);
        res.json(stats);
    }));

    // GET /api/reviews/:reviewId/candidates/:candidateId/decisions
    // Get reviewer decisions for a candidate (collaborative review)
    router.get('/reviews/:reviewId/candidates/:candidateId/decisions', asyncHandler(async (req, res) => {
        const { reviewId, candidateId } = req.params;
        const service = await getReviewService();
        const decisions = await service.getReviewerDecisions(reviewId, candidateId);
        res.json(decisions);
    }));

    // GET /api/reviews/run/:runId/pending
    // Get all pending reviews for a run
    router.get('/reviews/run/:runId/pending', asyncHandler(async (req, res) => {
        const { runId } = req.params;
        const service = await getReviewService();
        const reviews = await service.getPendingReviews(runId);
        res.json(reviews);
    }));

    // DELETE /api/reviews/:reviewId
    // Delete a review
    router.delete('/reviews/:reviewId', asyncHandler(async (req, res) => {
        const { reviewId } = req.params;
        const userId = req.user?.userId;
        const service = await getReviewService();
        const deleted = await service.deleteReview(reviewId, userId);
        if (!deleted) {
            throw new NotFoundError('Review', reviewId);
        }
        res.json({ message: '[i18n:apiMessages.reviewDeleted]' });
    }));

    // DELETE /api/reviews/run/:runId
    // Delete all reviews for a run
    router.delete('/reviews/run/:runId', asyncHandler(async (req, res) => {
        const { runId } = req.params;
        const userId = req.user?.userId;
        const service = await getReviewService();
        const deletedCount = await service.deleteReviewsByRun(runId, userId);
        res.json({ message: `[i18n:apiMessages.reviewsDeleted]|${deletedCount}`, deletedCount });
    }));

    // ============================================
    // Advanced Review Features (WI-187)
    // ============================================

    // GET /api/reviews/compare/:reviewId1/:reviewId2
    // Compare two reviews
    router.get('/reviews/compare/:reviewId1/:reviewId2', asyncHandler(async (req, res) => {
        const { reviewId1, reviewId2 } = req.params;
        const { getReviewAnalyticsService } = await import('../services/review/ReviewAnalyticsService.js');
        const analyticsService = getReviewAnalyticsService();

        const comparison = await analyticsService.compareReviews(reviewId1, reviewId2);
        res.json(comparison);
    }));

    // GET /api/reviews/:reviewId/export
    // Export review data as CSV or JSON
    router.get('/reviews/:reviewId/export', asyncHandler(async (req, res) => {
        const { reviewId } = req.params;
        const { format } = req.query;
        const exportFormat = (format as string) || 'json';

        const service = await getReviewService();
        const review = await service.getReview(reviewId);

        if (!review) {
            throw new NotFoundError('Review', reviewId);
        }

        if (exportFormat === 'csv') {
            // Generate CSV
            const csvRows: string[] = [];
            csvRows.push('Candidate ID,Title,URL,Status,Reviewed At,Reviewed By,Notes');
            
            for (const candidate of review.candidateResults || []) {
                const row = [
                    candidate.id || '',
                    `"${(candidate.title || '').replace(/"/g, '""')}"`,
                    candidate.url || '',
                    candidate.reviewStatus || 'pending',
                    candidate.reviewedAt ? new Date(candidate.reviewedAt).toISOString() : '',
                    candidate.reviewedBy || '',
                    `"${(candidate.reviewNotes || '').replace(/"/g, '""')}"`
                ];
                csvRows.push(row.join(','));
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="review-${reviewId}.csv"`);
            res.send(csvRows.join('\n'));
        } else {
            // Return JSON
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="review-${reviewId}.json"`);
            res.json(review);
        }
    }));


    return router;
}
