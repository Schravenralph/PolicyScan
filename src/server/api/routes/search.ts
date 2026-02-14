/**
 * Search API Routes
 * 
 * Unified search API endpoints for keyword + semantic + geo search.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/11-unified-search.md
 */

import { Router, type Request, type Response } from 'express';
import { SearchService } from '../../search/SearchService.js';
import { logger } from '../../utils/logger.js';
import { testPostgresConnection, isPostgresConnected } from '../../config/postgres.js';
import type { Geometry } from 'geojson';
import type { DocumentFamily } from '../../contracts/types.js';

const router = Router();

/**
 * Search request body
 */
interface SearchRequestBody {
  query: string;
  filters?: {
    documentFamily?: string[];
    documentType?: string[];
    publisherAuthority?: string;
    dateRange?: {
      from?: string; // ISO date string
      to?: string; // ISO date string
    };
    validFrom?: string; // ISO date string - Filter by validity start date
    validTo?: string; // ISO date string - Filter by validity end date
    areaId?: string; // Filter by specific area ID
    areaIds?: string[]; // Filter by multiple area IDs
    geo?: Geometry;
  };
  topK?: number;
  includeCitations?: boolean;
  modelId?: string;
  decomposeQuery?: boolean; // Enable query decomposition for complex queries
}

/**
 * POST /api/search
 * 
 * Unified search endpoint
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const body: SearchRequestBody = req.body;

    // Validate request
    if (!body.query || typeof body.query !== 'string') {
      return res.status(400).json({
        error: 'query is required and must be a string',
      });
    }

    // Parse filters
    const filters: {
      documentFamily?: DocumentFamily[];
      documentType?: string[];
      publisherAuthority?: string;
      dateRange?: { from?: Date; to?: Date };
      validFrom?: Date;
      validTo?: Date;
      areaId?: string;
      areaIds?: string[];
      geo?: Geometry;
    } = {};

    if (body.filters) {
      if (body.filters.documentFamily) {
        filters.documentFamily = body.filters.documentFamily as DocumentFamily[];
      }
      if (body.filters.documentType) {
        filters.documentType = body.filters.documentType;
      }
      if (body.filters.publisherAuthority) {
        filters.publisherAuthority = body.filters.publisherAuthority;
      }
      if (body.filters.dateRange) {
        filters.dateRange = {};
        if (body.filters.dateRange.from) {
          filters.dateRange.from = new Date(body.filters.dateRange.from);
        }
        if (body.filters.dateRange.to) {
          filters.dateRange.to = new Date(body.filters.dateRange.to);
        }
      }
      if (body.filters.validFrom) {
        filters.validFrom = new Date(body.filters.validFrom);
      }
      if (body.filters.validTo) {
        filters.validTo = new Date(body.filters.validTo);
      }
      if (body.filters.areaId) {
        filters.areaId = body.filters.areaId;
      }
      if (body.filters.areaIds) {
        filters.areaIds = body.filters.areaIds;
      }
      if (body.filters.geo) {
        filters.geo = body.filters.geo;
      }
    }

    // Create search service
    const searchService = new SearchService({
      defaultModelId: body.modelId,
    });

    // Execute search
    const response = await searchService.search({
      query: body.query,
      filters,
      topK: body.topK,
      includeCitations: body.includeCitations,
      modelId: body.modelId,
      decomposeQuery: body.decomposeQuery,
    });

    // Return response
    res.json(response);
  } catch (error) {
    logger.error({ error, body: { ...req.body, query: '[REDACTED]' } }, 'Search API error');
    
    // Provide more specific error messages for PostgreSQL issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 500;
    let errorResponse: { error: string; message: string; hint?: string } = {
      error: 'Search failed',
      message: errorMessage,
    };
    
    // Check for PostgreSQL connection errors
    if (errorMessage.includes('PostgreSQL authentication failed') || 
        errorMessage.includes('PostgreSQL connection refused') ||
        errorMessage.includes('PostgreSQL database does not exist')) {
      statusCode = 503; // Service Unavailable
      const isAuthError = errorMessage.includes('authentication failed');
      
      errorResponse = {
        error: 'PostgreSQL connection error',
        message: errorMessage,
        hint: isAuthError 
          ? `PostgreSQL password authentication failed. Please check your credentials.`
          : `PostgreSQL is required for unified search. Please ensure the database is running.`,
      };
    }
    
    res.status(statusCode).json(errorResponse);
  }
});

/**
 * GET /api/search/health
 * 
 * Health check endpoint
 */
router.get('/search/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'search' });
});

/**
 * GET /api/search/postgres-health
 * 
 * PostgreSQL connection health check endpoint
 */
router.get('/search/postgres-health', async (_req: Request, res: Response) => {
  try {
    const isConnected = isPostgresConnected();
    const connectionTest = await testPostgresConnection();
    
    const health = {
      status: connectionTest ? 'connected' : 'disconnected',
      postgres: {
        connected: connectionTest,
        poolConnected: isConnected,
      },
    };
    
    res.status(connectionTest ? 200 : 503).json(health);
  } catch (error) {
    logger.error({ error }, 'PostgreSQL health check failed');
    res.status(503).json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      postgres: {
        connected: false,
      },
    });
  }
});

export default router;

