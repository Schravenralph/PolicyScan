import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Default pagination limits
 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10000;
const DEFAULT_SKIP = 0;

/**
 * Pagination parameters from request
 */
export interface PaginationParams {
  limit: number;
  skip: number;
  page?: number;
}

/**
 * Middleware to parse and validate pagination parameters
 * Adds pagination object to req.pagination
 */
export function paginationMiddleware(
  defaultLimit: number = DEFAULT_LIMIT,
  maxLimit: number = MAX_LIMIT
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse limit from query or body
      const limitParam = req.query.limit || req.body?.limit;
      let limit = defaultLimit;
      
      if (limitParam !== undefined) {
        const parsedLimit = parseInt(String(limitParam), 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, maxLimit);
        } else {
          logger.warn({ limitParam }, 'Invalid limit parameter, using default');
        }
      }
      
      // Parse skip from query or body
      const skipParam = req.query.skip || req.body?.skip;
      let skip = DEFAULT_SKIP;
      
      if (skipParam !== undefined) {
        const parsedSkip = parseInt(String(skipParam), 10);
        if (!isNaN(parsedSkip) && parsedSkip >= 0) {
          skip = parsedSkip;
        } else {
          logger.warn({ skipParam }, 'Invalid skip parameter, using default');
        }
      }
      
      // Parse page (alternative to skip)
      const pageParam = req.query.page || req.body?.page;
      if (pageParam !== undefined && skipParam === undefined) {
        const parsedPage = parseInt(String(pageParam), 10);
        if (!isNaN(parsedPage) && parsedPage > 0) {
          skip = (parsedPage - 1) * limit;
        } else {
          logger.warn({ pageParam }, 'Invalid page parameter, using default');
        }
      }
      
      // Add pagination to request object
      (req as Request & { pagination: PaginationParams }).pagination = {
        limit,
        skip,
        ...(pageParam !== undefined && { page: parseInt(String(pageParam), 10) }),
      };
      
      next();
    } catch (error) {
      logger.error({ error }, 'Error parsing pagination parameters');
      next(error);
    }
  };
}

/**
 * Helper to get pagination parameters from request
 */
export function getPagination(req: Request): PaginationParams {
  return (req as Request & { pagination?: PaginationParams }).pagination || {
    limit: DEFAULT_LIMIT,
    skip: DEFAULT_SKIP,
  };
}

/**
 * Helper to format paginated response
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
) {
  return {
    data,
    pagination: {
      limit: pagination.limit,
      skip: pagination.skip,
      total,
      hasMore: pagination.skip + data.length < total,
      ...(pagination.page !== undefined && { page: pagination.page }),
    },
  };
}

