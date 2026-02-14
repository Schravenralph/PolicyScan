/**
 * Cache Management Admin Routes
 * 
 * Routes for managing cache operations in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sanitizeInput } from './shared/middleware.js';
import { auditMiddleware } from '../../middleware/auditMiddleware.js';
import { BadRequestError } from '../../types/errors.js';
import { queryCache } from '../../services/query/QueryCache.js';
import { htmlCache, metadataCache } from '../../services/infrastructure/cache.js';

/**
 * Register cache management routes
 * 
 * @param router - Express router instance
 */
export function registerCacheRoutes(router: Router): void {
    /**
     * GET /api/admin/cache/metrics
     * Get query cache metrics and statistics
     */
    router.get('/cache/metrics', asyncHandler(async (_req: Request, res: Response) => {
        const queryMetrics = queryCache.getMetrics();
        const queryStats = await queryCache.getStats();
        const htmlStats = await htmlCache.getStats();
        const metadataStats = await metadataCache.getStats();
        
        res.json({
            queryCache: {
                enabled: queryStats.enabled,
                metrics: {
                    hits: queryMetrics.hits,
                    misses: queryMetrics.misses,
                    hitRate: queryMetrics.hitRate,
                },
                cache: {
                    size: queryStats.size,
                    maxSize: queryStats.maxSize,
                },
            },
            htmlCache: htmlStats,
            metadataCache: metadataStats,
            timestamp: new Date().toISOString()
        });
    }));

    /**
     * POST /api/admin/cache/invalidate
     * Invalidate query cache (all entries or by pattern)
     */
    router.post('/cache/invalidate',
        auditMiddleware({
            action: 'system_config_changed',
            targetType: 'system',
            getDetails: (req) => ({ 
                operation: 'invalidate_cache',
                pattern: req.body.pattern || 'all'
            })
        }),
        sanitizeInput,
        asyncHandler(async (req: Request, res: Response) => {
            const { pattern } = req.body;
            const invalidated = await queryCache.invalidate(pattern);
            res.json({
                success: true,
                invalidated,
                message: pattern
                    ? `Invalidated ${invalidated} cache entries matching pattern: ${pattern}`
                    : `Invalidated all ${invalidated} cache entries`
            });
        })
    );

    /**
     * GET /api/admin/cache/analytics
     * Get cache analytics for htmlCache and metadataCache
     * Query parameters:
     *   - cacheName: 'html' | 'metadata' | 'all' (default: 'all')
     *   - startTime: Unix timestamp in milliseconds (optional)
     *   - endTime: Unix timestamp in milliseconds (optional)
     *   - limit: Maximum number of data points (optional)
     *   - interval: 'minute' | 'hour' | 'day' (optional, for aggregation)
     */
    router.get('/cache/analytics', asyncHandler(async (req: Request, res: Response) => {
        const { cacheName = 'all', startTime, endTime, limit, interval } = req.query;
        
        // Parse query parameters
        const query: {
            startTime?: number;
            endTime?: number;
            limit?: number;
            interval?: 'minute' | 'hour' | 'day';
        } = {};
        
        if (startTime) {
            query.startTime = parseInt(startTime as string, 10);
            if (isNaN(query.startTime)) {
                throw new BadRequestError('Invalid startTime parameter');
            }
        }
        
        if (endTime) {
            query.endTime = parseInt(endTime as string, 10);
            if (isNaN(query.endTime)) {
                throw new BadRequestError('Invalid endTime parameter');
            }
        }
        
        if (limit) {
            query.limit = parseInt(limit as string, 10);
            if (isNaN(query.limit) || query.limit < 1) {
                throw new BadRequestError('Invalid limit parameter');
            }
        }
        
        if (interval) {
            if (['minute', 'hour', 'day'].includes(interval as string)) {
                query.interval = interval as 'minute' | 'hour' | 'day';
            } else {
                throw new BadRequestError('Invalid interval parameter. Must be: minute, hour, or day');
            }
        }

        // Get analytics for requested cache(s)
        const results: Record<string, unknown> = {};
        
        if (cacheName === 'all' || cacheName === 'html') {
            results.html = htmlCache.getStats();
        }
        
        if (cacheName === 'all' || cacheName === 'metadata') {
            results.metadata = metadataCache.getStats();
        }
        
        res.json({
            success: true,
            cacheName,
            ...results,
            timestamp: new Date().toISOString()
        });
    }));

    /**
     * GET /api/admin/cache/analytics/stats
     * Get cache statistics summary
     */
    router.get('/cache/analytics/stats', asyncHandler(async (_req: Request, res: Response) => {
        res.json({
            success: true,
            html: htmlCache.getStats(),
            metadata: metadataCache.getStats(),
            timestamp: new Date().toISOString(),
        });
    }));
}

