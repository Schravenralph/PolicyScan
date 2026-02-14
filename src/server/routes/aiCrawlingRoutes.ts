import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';
import {
  AICrawlingConfig,
  AICrawlingConfigCreateInput,
  AICrawlingConfigUpdateInput,
  type ConfigScope,
} from '../models/AICrawlingConfig.js';
import { AICrawlingTraceService } from '../services/ai-crawling/AICrawlingTraceService.js';
import { AICrawlingTrace, type AICrawlingStrategy } from '../models/AICrawlingTrace.js';

/**
 * Validate if a string is a valid AI crawling strategy
 */
function isValidStrategy(strategy: string): strategy is AICrawlingStrategy {
  return ['site_search', 'ai_navigation', 'traditional_crawl', 'hybrid'].includes(strategy);
}

/**
 * Validate and parse date string
 */
function parseDate(dateString: string): Date | null {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Validate limit/skip parameters
 */
function validatePagination(limit: number, skip: number): { valid: boolean; error?: string } {
  if (limit < 1 || limit > 1000) {
    return { valid: false, error: 'Limit must be between 1 and 1000' };
  }
  if (skip < 0) {
    return { valid: false, error: 'Skip must be >= 0' };
  }
  return { valid: true };
}

export function createAICrawlingRoutes(authService: AuthService): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate(authService));

  /**
   * GET /api/ai-crawling/config
   * Get merged configuration for a site (or global if no siteUrl provided)
   */
  router.get('/config', asyncHandler(async (req: Request, res: Response) => {
    const siteUrl = req.query.siteUrl as string | undefined;
    const queryConfig = req.query.config ? JSON.parse(req.query.config as string) : undefined;

    const config = await AICrawlingConfig.getMergedConfig(siteUrl, queryConfig);

    res.json(config);
  }));

  /**
   * GET /api/ai-crawling/configs
   * List all configurations (admin only)
   */
  router.get('/configs', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const scope = req.query.scope as ConfigScope | undefined;
    const siteUrl = req.query.siteUrl as string | undefined;
    const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : undefined;

    const configs = await AICrawlingConfig.findAll({
      scope,
      siteUrl,
      enabled,
      limit,
      skip
    });

    res.json(configs);
  }));

  /**
   * GET /api/ai-crawling/configs/:id
   * Get a specific configuration by ID
   */
  router.get('/configs/:id', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const config = await AICrawlingConfig.findById(id);

    if (!config) {
      throw new NotFoundError('Configuration', id);
    }

    res.json(config);
  }));

  /**
   * POST /api/ai-crawling/configs
   * Create a new configuration (admin only)
   */
  router.post('/configs', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const configData: AICrawlingConfigCreateInput = {
      scope: req.body.scope || 'global',
      siteUrl: req.body.siteUrl,
      aggressiveness: req.body.aggressiveness || 'medium',
      strategy: req.body.strategy || 'auto',
      maxDepth: req.body.maxDepth,
      maxLinks: req.body.maxLinks,
      llmModel: req.body.llmModel,
      cacheEnabled: req.body.cacheEnabled ?? true,
      cacheTTL: req.body.cacheTTL,
      timeout: req.body.timeout,
      fallbackBehavior: req.body.fallbackBehavior || 'traditional',
      enabled: req.body.enabled ?? true,
      createdBy: req.user?.email || 'system'
    };

    // Validate required fields
    if (!configData.aggressiveness || !['low', 'medium', 'high'].includes(configData.aggressiveness)) {
      throw new BadRequestError('Invalid aggressiveness level. Must be low, medium, or high', {
        received: configData.aggressiveness
      });
    }

    if (!configData.strategy || !['site_search', 'ai_navigation', 'traditional', 'auto'].includes(configData.strategy)) {
      throw new BadRequestError('Invalid strategy. Must be site_search, ai_navigation, traditional, or auto', {
        received: configData.strategy
      });
    }

    if (configData.scope === 'site' && !configData.siteUrl) {
      throw new BadRequestError('siteUrl is required for site scope configuration', {
        scope: configData.scope
      });
    }

    const config = await AICrawlingConfig.create(configData);

    res.status(201).json(config);
  }));

  /**
   * PUT /api/ai-crawling/configs/:id
   * Update a configuration (admin only)
   */
  router.put('/configs/:id', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData: AICrawlingConfigUpdateInput = req.body;

    // Validate if provided
    if (updateData.aggressiveness && !['low', 'medium', 'high'].includes(updateData.aggressiveness)) {
      throw new BadRequestError('Invalid aggressiveness level. Must be low, medium, or high', {
        received: updateData.aggressiveness
      });
    }

    if (updateData.strategy && !['site_search', 'ai_navigation', 'traditional', 'auto'].includes(updateData.strategy)) {
      throw new BadRequestError('Invalid strategy. Must be site_search, ai_navigation, traditional, or auto', {
        received: updateData.strategy
      });
    }

    const config = await AICrawlingConfig.update(id, updateData);

    if (!config) {
      throw new NotFoundError('Configuration', id);
    }

    res.json(config);
  }));

  /**
   * DELETE /api/ai-crawling/configs/:id
   * Delete a configuration (admin only)
   */
  router.delete('/configs/:id', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const deleted = await AICrawlingConfig.delete(id);

    if (!deleted) {
      throw new NotFoundError('Configuration', id);
    }

    res.status(204).send();
  }));

  /**
   * GET /api/ai-crawling/configs/site/:siteUrl
   * Get configuration for a specific site
   */
  router.get('/configs/site/:siteUrl', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
    const { siteUrl } = req.params;
    const decodedSiteUrl = decodeURIComponent(siteUrl);
    const config = await AICrawlingConfig.findBySiteUrl(decodedSiteUrl);

    if (!config) {
      throw new NotFoundError('Site configuration', decodedSiteUrl);
    }

    res.json(config);
  }));

  /**
   * GET /api/ai-crawling/global
   * Get global configuration
   */
  router.get('/global', asyncHandler(async (_req: Request, res: Response) => {
    const config = await AICrawlingConfig.getGlobalConfig();

    if (!config) {
      // Return defaults if no global config exists
      return res.json({
        scope: 'global',
        aggressiveness: 'medium',
        strategy: 'auto',
        maxDepth: 4,
        maxLinks: 15,
        cacheEnabled: true,
        cacheTTL: 604800,
        timeout: 30000,
        fallbackBehavior: 'traditional',
        enabled: true
      });
    }

    res.json(config);
  }));

  /**
   * GET /api/ai-crawling/traces
   * List AI crawling traces
   */
  router.get('/traces', authorize(['admin', 'developer']), asyncHandler(async (req: Request, res: Response) => {
    const baseUrl = req.query.baseUrl as string | undefined;
    const query = req.query.query as string | undefined;
    const strategyParam = req.query.strategy as string | undefined;
    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;
    const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const skipParam = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;

    // Validate pagination
    const paginationValidation = validatePagination(limitParam, skipParam);
    if (!paginationValidation.valid) {
      throw new BadRequestError(paginationValidation.error || 'Invalid pagination parameters');
    }

    // Validate strategy if provided
    let strategy: AICrawlingStrategy | undefined;
    if (strategyParam) {
      if (!isValidStrategy(strategyParam)) {
        throw new BadRequestError(`Invalid strategy. Strategy must be one of: site_search, ai_navigation, traditional_crawl, hybrid`);
      }
      strategy = strategyParam;
    }

    // Validate and parse dates
    let startDate: Date | undefined;
    if (startDateParam) {
      const parsedDate = parseDate(startDateParam);
      if (!parsedDate) {
        throw new BadRequestError('Invalid startDate format. Use ISO 8601 format.');
      }
      startDate = parsedDate;
    }

    let endDate: Date | undefined;
    if (endDateParam) {
      const parsedDate = parseDate(endDateParam);
      if (!parsedDate) {
        throw new BadRequestError('Invalid endDate format. Use ISO 8601 format.');
      }
      endDate = parsedDate;
    }

    const result = await AICrawlingTrace.find({
      baseUrl,
      query,
      strategy,
      startDate,
      endDate,
      limit: limitParam,
      skip: skipParam,
    });

    res.json({
      traces: result.traces,
      total: result.total,
      limit: limitParam,
      skip: skipParam,
    });
  }));

  /**
   * GET /api/ai-crawling/traces/:sessionId
   * Get a specific trace by session ID
   */
  router.get('/traces/:sessionId', authorize(['admin', 'developer']), asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const trace = await AICrawlingTraceService.getTrace(sessionId);

    if (!trace) {
      throw new NotFoundError('Trace', sessionId);
    }

    // Generate human-readable explanation with trace data
    const explanation = AICrawlingTraceService.generateExplanation({
      sessionId: trace.sessionId,
      baseUrl: trace.baseUrl,
      query: trace.query,
      strategy: trace.strategy,
      decisions: trace.decisions,
      documentsFound: trace.documentsFound,
      performanceMetrics: trace.performanceMetrics,
    });

    res.json({
      trace,
      explanation,
      // Also provide structured data for programmatic access
      summary: {
        strategy: trace.strategy,
        documentsFound: trace.documentsFound.length,
        decisionsMade: trace.decisions.length,
        duration: trace.performanceMetrics?.totalDuration,
        llmCalls: trace.performanceMetrics?.llmCalls,
      },
    });
  }));

  /**
   * GET /api/ai-crawling/traces/document/:documentUrl
   * Get traces for a specific document URL
   */
  router.get('/traces/document/:documentUrl', authorize(['admin', 'developer']), asyncHandler(async (req: Request, res: Response) => {
    const documentUrl = decodeURIComponent(req.params.documentUrl);
    const traces = await AICrawlingTraceService.getTracesForDocument(documentUrl);

    res.json({ traces });
  }));

  /**
   * GET /api/ai-crawling/traces/document/:documentUrl/explanation
   * Get explanation for why a document was found
   * Note: This endpoint does not require admin/developer auth as it's for user-facing explanations
   */
  router.get('/traces/document/:documentUrl/explanation', asyncHandler(async (req: Request, res: Response) => {
    const documentUrl = decodeURIComponent(req.params.documentUrl);
    const explanation = await AICrawlingTraceService.getDocumentExplanation(documentUrl);

    if (!explanation) {
      throw new NotFoundError('Document explanation', documentUrl, {
        message: 'This document was not found via AI-guided crawling, or trace data is not available.'
      });
    }

    res.json(explanation);
  }));

  /**
   * GET /api/ai-crawling/traces/statistics
   * Get trace statistics
   */
  router.get('/traces/statistics', authorize(['admin', 'developer']), asyncHandler(async (req: Request, res: Response) => {
    const baseUrl = req.query.baseUrl as string | undefined;
    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;

    // Validate and parse dates
    let startDate: Date | undefined;
    if (startDateParam) {
      const parsedDate = parseDate(startDateParam);
      if (!parsedDate) {
        throw new BadRequestError('Invalid startDate format. Use ISO 8601 format.', {
          received: startDateParam
        });
      }
      startDate = parsedDate;
    }

    let endDate: Date | undefined;
    if (endDateParam) {
      const parsedDate = parseDate(endDateParam);
      if (!parsedDate) {
        throw new BadRequestError('Invalid endDate format. Use ISO 8601 format.', {
          received: endDateParam
        });
      }
      endDate = parsedDate;
    }

    const stats = await AICrawlingTrace.getStatistics({
      baseUrl,
      startDate,
      endDate,
    });

    res.json(stats);
  }));

  /**
   * POST /api/ai-crawling/traces/export
   * Export traces as JSON
   */
  router.post('/traces/export', authorize(['admin', 'developer']), asyncHandler(async (req: Request, res: Response) => {
    const filters = req.body.filters || {};
    
    // Validate strategy if provided
    let strategy: AICrawlingStrategy | undefined;
    if (filters.strategy) {
      if (!isValidStrategy(filters.strategy)) {
        throw new BadRequestError('Invalid strategy', {
          details: `Strategy must be one of: site_search, ai_navigation, traditional_crawl, hybrid`,
          received: filters.strategy
        });
      }
      strategy = filters.strategy;
    }

    // Validate and parse dates
    let startDate: Date | undefined;
    if (filters.startDate) {
      const parsedDate = parseDate(filters.startDate);
      if (!parsedDate) {
        throw new BadRequestError('Invalid startDate format. Use ISO 8601 format.', {
          received: filters.startDate
        });
      }
      startDate = parsedDate;
    }

    let endDate: Date | undefined;
    if (filters.endDate) {
      const parsedDate = parseDate(filters.endDate);
      if (!parsedDate) {
        throw new BadRequestError('Invalid endDate format. Use ISO 8601 format.', {
          received: filters.endDate
        });
      }
      endDate = parsedDate;
    }

    const result = await AICrawlingTrace.find({
      baseUrl: filters.baseUrl,
      query: filters.query,
      strategy,
      startDate,
      endDate,
      limit: 1000, // Export more traces
      skip: 0,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ai-crawling-traces-${Date.now()}.json"`);
    
    // Return traces array with metadata for better context
    res.json({
      exportedAt: new Date().toISOString(),
      total: result.total,
      exported: result.traces.length,
      filters: filters,
      traces: result.traces
    });
  }));

  return router;
}

