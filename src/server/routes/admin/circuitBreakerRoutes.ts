/**
 * Circuit Breaker Admin Routes
 * 
 * Routes for circuit breaker management and monitoring in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getCircuitBreakerManager } from '../../config/httpClient.js';
import { asyncHandler } from './shared/middleware.js';
import { BadRequestError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Register circuit breaker routes
 * 
 * @param router - Express router instance
 */
export function registerCircuitBreakerRoutes(router: Router): void {
    /**
     * GET /api/admin/circuit-breakers
     * Get all circuit breaker statistics
     * 
     * Returns statistics for all circuit breakers, including:
     * - Current state (closed/open/half-open)
     * - Failure and success counts
     * - Total requests
     * - Last failure/success timestamps
     */
    router.get('/circuit-breakers', asyncHandler(async (_req: Request, res: Response) => {
        const circuitBreakerManager = getCircuitBreakerManager();
        const allStats = circuitBreakerManager.getAllStats();
        
        // Convert Map to array of objects for JSON response
        const breakers: Array<{
            serviceId: string;
            state: string;
            failures: number;
            successes: number;
            totalRequests: number;
            totalFailures: number;
            lastFailureTime?: string;
            lastSuccessTime?: string;
        }> = [];
        
        for (const [serviceId, stats] of allStats.entries()) {
            breakers.push({
                serviceId,
                state: stats.state,
                failures: stats.failures,
                successes: stats.successes,
                totalRequests: stats.totalRequests,
                totalFailures: stats.totalFailures,
                lastFailureTime: stats.lastFailureTime?.toISOString(),
                lastSuccessTime: stats.lastSuccessTime?.toISOString(),
            });
        }
        
        // Sort by service ID for consistent ordering
        breakers.sort((a, b) => a.serviceId.localeCompare(b.serviceId));
        
        res.json({
            breakers,
            totalBreakers: breakers.length,
            openBreakers: breakers.filter(b => b.state === 'open').length,
            halfOpenBreakers: breakers.filter(b => b.state === 'half-open').length,
            closedBreakers: breakers.filter(b => b.state === 'closed').length,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * GET /api/admin/circuit-breakers/:serviceId
     * Get circuit breaker statistics for a specific service
     */
    router.get('/circuit-breakers/:serviceId', asyncHandler(async (req: Request, res: Response) => {
        const { serviceId } = req.params;
        
        if (!serviceId || typeof serviceId !== 'string') {
            throw new BadRequestError('Service ID is required');
        }
        
        const circuitBreakerManager = getCircuitBreakerManager();
        const breaker = circuitBreakerManager.getBreaker(serviceId);
        const stats = breaker.getStats();
        
        res.json({
            serviceId,
            state: stats.state,
            failures: stats.failures,
            successes: stats.successes,
            totalRequests: stats.totalRequests,
            totalFailures: stats.totalFailures,
            lastFailureTime: stats.lastFailureTime?.toISOString(),
            lastSuccessTime: stats.lastSuccessTime?.toISOString(),
            isOpen: breaker.isOpen(),
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * POST /api/admin/circuit-breakers/:serviceId/reset
     * Reset a specific circuit breaker
     * 
     * This will reset the circuit breaker to closed state and clear all failure/success counts.
     * Use with caution - only reset if you're certain the underlying service is healthy.
     */
    router.post('/circuit-breakers/:serviceId/reset', asyncHandler(async (req: Request, res: Response) => {
        const { serviceId } = req.params;
        
        if (!serviceId || typeof serviceId !== 'string') {
            throw new BadRequestError('Service ID is required');
        }
        
        const circuitBreakerManager = getCircuitBreakerManager();
        const breaker = circuitBreakerManager.getBreaker(serviceId);
        const statsBefore = breaker.getStats();
        
        // Reset the circuit breaker
        circuitBreakerManager.reset(serviceId);
        
        const statsAfter = breaker.getStats();
        
        logger.info(
            { serviceId, stateBefore: statsBefore.state, stateAfter: statsAfter.state },
            'Circuit breaker manually reset by admin'
        );
        
        res.json({
            serviceId,
            message: 'Circuit breaker reset successfully',
            stateBefore: statsBefore.state,
            stateAfter: statsAfter.state,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * POST /api/admin/circuit-breakers/reset-all
     * Reset all circuit breakers
     * 
     * This will reset all circuit breakers to closed state and clear all failure/success counts.
     * Use with extreme caution - only reset if you're certain all underlying services are healthy.
     */
    router.post('/circuit-breakers/reset-all', asyncHandler(async (_req: Request, res: Response) => {
        const circuitBreakerManager = getCircuitBreakerManager();
        const allStatsBefore = circuitBreakerManager.getAllStats();
        
        // Get count of open breakers before reset
        const openBreakersBefore = Array.from(allStatsBefore.values()).filter(
            stats => stats.state === 'open'
        ).length;
        
        // Reset all circuit breakers
        circuitBreakerManager.resetAll();
        
        const allStatsAfter = circuitBreakerManager.getAllStats();
        const openBreakersAfter = Array.from(allStatsAfter.values()).filter(
            stats => stats.state === 'open'
        ).length;
        
        logger.info(
            { 
                totalBreakers: allStatsBefore.size,
                openBreakersBefore,
                openBreakersAfter 
            },
            'All circuit breakers manually reset by admin'
        );
        
        res.json({
            message: 'All circuit breakers reset successfully',
            totalBreakers: allStatsBefore.size,
            openBreakersBefore,
            openBreakersAfter,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * GET /api/admin/circuit-breakers/stats
     * Get circuit breaker statistics for all services
     */
    router.get('/circuit-breakers/stats', asyncHandler(async (_req: Request, res: Response) => {
        const circuitBreakerManager = getCircuitBreakerManager();
        const allStats = circuitBreakerManager.getAllStats();
        
        // Convert Map to object for JSON response
        const stats: Record<string, unknown> = {};
        for (const [serviceId, breakerStats] of allStats.entries()) {
            stats[serviceId] = {
                ...breakerStats,
                lastFailureTime: breakerStats.lastFailureTime?.toISOString(),
                lastSuccessTime: breakerStats.lastSuccessTime?.toISOString(),
            };
        }
        
        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * POST /api/admin/circuit-breakers/reset/:serviceId
     * Reset circuit breaker for a specific service
     * 
     * Note: This is an alternative endpoint to POST /circuit-breakers/:serviceId/reset
     * Both endpoints perform the same operation.
     */
    router.post('/circuit-breakers/reset/:serviceId', asyncHandler(async (req: Request, res: Response) => {
        const { serviceId } = req.params;
        const circuitBreakerManager = getCircuitBreakerManager();
        circuitBreakerManager.reset(serviceId);
        
        res.json({
            success: true,
            message: `Circuit breaker reset for service: ${serviceId}`,
            timestamp: new Date().toISOString(),
        });
    }));
}



