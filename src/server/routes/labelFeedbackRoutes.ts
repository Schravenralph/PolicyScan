/**
 * Label Feedback Routes
 * 
 * API endpoints for collecting and retrieving feedback on semantic labels
 */

import { Router, Request } from 'express';
import { activeLearningService } from '../services/semantic/ActiveLearningService.js';
import { LabelFeedback } from '../models/LabelFeedback.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';

export function createLabelFeedbackRouter() {
  const router = Router();

  /**
   * POST /api/labels/feedback
   * Submit feedback on a semantic label
   */
  router.post('/feedback', asyncHandler(async (req: Request, res) => {
    const { clusterId, label, rating, accurate, relevant, suggestedLabel, comment, context } = req.body;

    // Validation
    if (!clusterId || !label) {
      throw new BadRequestError('clusterId and label are required', {
        received: { clusterId: !!clusterId, label: !!label }
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new BadRequestError('rating must be between 1 and 5', {
        received: rating
      });
    }

    if (typeof accurate !== 'boolean' || typeof relevant !== 'boolean') {
      throw new BadRequestError('accurate and relevant must be boolean values', {
        received: { accurate: typeof accurate, relevant: typeof relevant }
      });
    }

    // Get user ID from request (if authenticated)
    const userId = req.user?.userId || req.body.userId;

    // Record feedback
    const feedbackId = await activeLearningService.recordFeedback(
      clusterId,
      {
        rating,
        accurate,
        relevant,
        suggestedLabel,
        comment,
      },
      context || {
        clusterId,
        entities: [],
        label,
        labelingMethod: 'heuristic',
        entityCount: 0,
        entityTypes: [],
      },
      userId
    );

    res.status(201).json({
      success: true,
      feedbackId,
      message: 'Feedback recorded successfully',
    });
  }));

  /**
   * GET /api/labels/feedback/:clusterId
   * Get feedback for a specific cluster
   */
  router.get('/feedback/:clusterId', asyncHandler(async (req, res) => {
    const { clusterId } = req.params;
    const feedback = await LabelFeedback.findByClusterId(clusterId);

    if (!feedback) {
      throw new NotFoundError('Feedback', clusterId, {
        message: 'Feedback not found for this cluster'
      });
    }

    res.json(feedback);
  }));

  /**
   * GET /api/labels/feedback
   * Get all feedback entries with optional filtering
   */
  router.get('/feedback', asyncHandler(async (req, res) => {
    const {
      limit = 100,
      skip = 0,
      minRating,
      hasUncertainty,
      minUncertaintyScore,
    } = req.query;

    const filter: {
      minRating?: number;
      hasUncertainty?: boolean;
      minUncertaintyScore?: number;
    } = {};

    if (minRating) {
      filter.minRating = parseInt(minRating as string, 10);
    }
    if (hasUncertainty === 'true') {
      filter.hasUncertainty = true;
    }
    if (minUncertaintyScore) {
      filter.minUncertaintyScore = parseFloat(minUncertaintyScore as string);
    }

    const feedback = await LabelFeedback.findAll({
      limit: parseInt(limit as string, 10),
      skip: parseInt(skip as string, 10),
      filter,
    });

    res.json(feedback);
  }));

  /**
   * GET /api/labels/review-queue
   * Get labels that need review (high uncertainty or low ratings)
   */
  router.get('/review-queue', asyncHandler(async (req, res) => {
    const { limit = 50, minUncertaintyScore = 0.5, maxRating = 3 } = req.query;

    const queue = await activeLearningService.getReviewQueue({
      limit: parseInt(limit as string, 10),
      minUncertaintyScore: parseFloat(minUncertaintyScore as string),
      maxRating: parseInt(maxRating as string, 10),
    });

    res.json(queue);
  }));

  /**
   * GET /api/labels/statistics
   * Get feedback statistics
   */
  router.get('/statistics', asyncHandler(async (_req, res) => {
    const stats = await activeLearningService.getStatistics();
    res.json(stats);
  }));

  /**
   * GET /api/labels/insights
   * Get learning insights from collected feedback
   */
  router.get('/insights', asyncHandler(async (_req, res) => {
    const insights = await activeLearningService.getLearningInsights();
    res.json(insights);
  }));

  return router;
}

