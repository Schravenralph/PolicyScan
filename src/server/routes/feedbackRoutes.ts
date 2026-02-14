/**
 * Feedback Routes
 * 
 * API endpoints for collecting and retrieving user feedback
 */

import { Router } from 'express';
import { FeedbackCollectionService, UserInteraction, DocumentFeedback, QAFeedback } from '../services/feedback/FeedbackCollectionService.js';
import { LearningService } from '../services/learning/LearningService.js';
import { FeedbackAnalysisService } from '../services/feedback/FeedbackAnalysisService.js';
import { authorize } from '../middleware/authMiddleware.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError, ConflictError } from '../types/errors.js';

export function createFeedbackRouter(
  feedbackService: FeedbackCollectionService,
  learningService: LearningService,
  analysisService: FeedbackAnalysisService
): Router {
  const router = Router();

  /**
   * POST /api/feedback/interaction
   * Record a user interaction (click, view, accept, reject, search)
   */
  router.post('/interaction', sanitizeInput, asyncHandler(async (req, res) => {
    const interaction: UserInteraction = {
      type: req.body.type,
      documentId: req.body.documentId,
      queryId: req.body.queryId,
      query: req.body.query,
      position: req.body.position,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      userId: req.user?.userId || req.body.userId,
      sessionId: req.body.sessionId,
      metadata: req.body.metadata
    };

    // Validate interaction type
    if (!['click', 'view', 'accept', 'reject', 'search'].includes(interaction.type)) {
      throw new BadRequestError('Invalid interaction type', {
        validTypes: ['click', 'view', 'accept', 'reject', 'search']
      });
    }

    const feedbackId = await feedbackService.recordInteraction(interaction);

    if (!feedbackId) {
      throw new ServiceUnavailableError('Feedback collection is disabled');
    }

    res.status(201).json({
      success: true,
      feedbackId,
      message: 'Interaction recorded successfully'
    });
  }));

  /**
   * POST /api/feedback/document
   * Record document feedback (rating, helpful, relevant)
   */
  router.post('/document', sanitizeInput, asyncHandler(async (req, res) => {
    const feedback: DocumentFeedback = {
      documentId: req.body.documentId,
      queryId: req.body.queryId,
      query: req.body.query,
      rating: req.body.rating,
      helpful: req.body.helpful,
      relevant: req.body.relevant,
      comment: req.body.comment,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      userId: req.user?.userId || req.body.userId,
      metadata: req.body.metadata
    };

    // Validate required fields
    if (!feedback.documentId) {
      throw new BadRequestError('documentId is required');
    }

    if (feedback.rating !== undefined && (feedback.rating < 1 || feedback.rating > 5)) {
      throw new BadRequestError('Rating must be between 1 and 5', {
        received: feedback.rating,
        validRange: { min: 1, max: 5 }
      });
    }

    const feedbackId = await feedbackService.recordDocumentFeedback(feedback);

    if (!feedbackId) {
      throw new ServiceUnavailableError('Feedback collection is disabled');
    }

    res.status(201).json({
      success: true,
      feedbackId,
      message: 'Document feedback recorded successfully'
    });
  }));

  /**
   * POST /api/feedback/qa
   * Record QA feedback (answer quality, helpful, accurate)
   */
  router.post('/qa', sanitizeInput, asyncHandler(async (req, res) => {
    const feedback: QAFeedback = {
      query: req.body.query,
      answer: req.body.answer,
      helpful: req.body.helpful,
      accurate: req.body.accurate,
      sources: req.body.sources,
      comment: req.body.comment,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      userId: req.user?.userId || req.body.userId,
      metadata: req.body.metadata
    };

    // Validate required fields
    if (!feedback.query) {
      throw new BadRequestError('query is required');
    }

    const feedbackId = await feedbackService.recordQAFeedback(feedback);

    if (!feedbackId) {
      throw new ServiceUnavailableError('Feedback collection is disabled');
    }

    res.status(201).json({
      success: true,
      feedbackId,
      message: 'QA feedback recorded successfully'
    });
  }));

  /**
   * GET /api/feedback/document/:documentId/stats
   * Get feedback statistics for a document
   */
  router.get('/document/:documentId/stats', asyncHandler(async (req, res) => {
    const { documentId } = req.params;
    const stats = await feedbackService.getDocumentFeedbackStats(documentId);
    res.json(stats);
  }));

  /**
   * GET /api/feedback/quality
   * Get overall quality metrics (admin only)
   */
  router.get('/quality', authorize(['admin']), asyncHandler(async (req, res) => {
    const minInteractions = parseInt(req.query.minInteractions as string || '5', 10);
    const minDocuments = parseInt(req.query.minDocuments as string || '3', 10);

    const metrics = await analysisService.getQualityMetrics(minInteractions, minDocuments);
    res.json(metrics);
  }));

  /**
   * POST /api/feedback/learn
   * Trigger a manual learning cycle (admin only)
   */
  router.post('/learn', authorize(['admin']), asyncHandler(async (_req, res) => {
    try {
      const result = await learningService.runLearningCycle();
      res.json({
        success: true,
        result,
        message: 'Learning cycle completed'
      });
    } catch (error) {
      // Return 409 Conflict if learning cycle is already running
      if (error instanceof Error && error.message.includes('already running')) {
        const status = learningService.getCycleStatus();
        throw new ConflictError('Learning cycle is already running', {
          message: error.message,
          currentCycle: status.currentCycle
        });
      }
      throw error;
    }
  }));

  /**
   * GET /api/feedback/learn/status
   * Get current learning cycle status (admin only)
   */
  router.get('/learn/status', authorize(['admin']), asyncHandler(async (_req, res) => {
    const status = learningService.getCycleStatus();
    
    // Check if service is enabled
    if (!learningService.isEnabled()) {
      return res.json({
        status: 'disabled',
        message: 'Learning service is disabled',
        enabled: false
      });
    }

    res.json({
      ...status,
      enabled: true
    });
  }));

  /**
   * POST /api/feedback/learn/recover
   * Recover stuck learning cycles (admin only)
   */
  router.post('/learn/recover', authorize(['admin']), asyncHandler(async (req, res) => {
    const timeoutMinutes = parseInt(req.body.timeoutMinutes as string || '10', 10);
    const recovered = learningService.recoverStuckCycles(timeoutMinutes);
    
    res.json({
      success: true,
      recovered,
      message: recovered > 0 
        ? `Recovered ${recovered} stuck learning cycle(s)`
        : 'No stuck cycles found'
    });
  }));

  /**
   * GET /api/feedback/learn/history
   * Get learning cycle execution history (admin only)
   */
  router.get('/learn/history', authorize(['admin']), asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);
    
    const history = await learningService.getCycleHistory(limit, offset);
    res.json(history);
  }));

  /**
   * POST /api/feedback/learn/cancel
   * Cancel a running learning cycle (admin only)
   */
  router.post('/learn/cancel', authorize(['admin']), asyncHandler(async (req, res) => {
    const { operationId } = req.body;
    const cancelled = learningService.cancelCycle(operationId);
    
    if (!cancelled) {
      throw new BadRequestError('No running learning cycle found to cancel', {
        operationId,
        message: 'Either no cycle is running or the specified operation ID was not found'
      });
    }

    res.json({
      success: true,
      message: 'Learning cycle cancelled successfully',
      operationId: operationId || 'current'
    });
  }));

  return router;
}
