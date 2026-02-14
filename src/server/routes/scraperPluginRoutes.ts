import { Router, Request, Response } from 'express';
import { scraperRegistry } from '../services/scrapers/ScraperRegistry.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError } from '../types/errors.js';

/**
 * Scraper Plugin Routes
 *
 * Handles routes for scraper plugin management and discovery.
 *
 * @returns Express router with scraper plugin routes
 */
export function createScraperPluginRouter(): Router {
    const router = Router();

    // ============================================
    // Scraper Plugin Endpoints
    // ============================================

    /**
     * GET /api/scrapers/plugins
     * Get all registered scraper plugins
     */
    router.get('/plugins', asyncHandler(async (_req: Request, res: Response) => {
        const plugins = scraperRegistry.getAll();

        // Return plugin metadata (without factory functions)
        const pluginMetadata = plugins.map(entry => ({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            domains: entry.metadata.domains || [],
            urlPatterns: entry.metadata.urlPatterns || [],
            version: entry.metadata.version,
            registeredAt: entry.registeredAt,
            usageCount: entry.usageCount,
            enabled: entry.enabled !== false, // Default to true
        }));

        res.json(pluginMetadata);
    }));

    /**
     * GET /api/scrapers/plugins/statistics
     * Get statistics about registered scraper plugins
     *
     * NOTE: This route must be defined BEFORE /plugins/:id to avoid route conflicts
     */
    router.get('/plugins/statistics', asyncHandler(async (_req: Request, res: Response) => {
        const stats = scraperRegistry.getStatistics();
        const plugins = scraperRegistry.getAll();
        const enabledCount = plugins.filter(p => p.enabled !== false).length;
        const disabledCount = plugins.filter(p => p.enabled === false).length;

        res.json({
            ...stats,
            enabledCount,
            disabledCount,
        });
    }));

    /**
     * GET /api/scrapers/plugins/:id
     * Get a specific scraper plugin by ID
     */
    router.get('/plugins/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const entry = scraperRegistry.get(id);

        if (!entry) {
            throw new NotFoundError('Scraper plugin', id);
        }

        res.json({
            id: entry.metadata.id,
            name: entry.metadata.name,
            description: entry.metadata.description,
            domains: entry.metadata.domains || [],
            urlPatterns: entry.metadata.urlPatterns || [],
            version: entry.metadata.version,
            registeredAt: entry.registeredAt,
            usageCount: entry.usageCount,
            enabled: entry.enabled !== false, // Default to true
        });
    }));

    /**
     * POST /api/scrapers/plugins/:id/enable
     * Enable a scraper plugin
     */
    router.post('/plugins/:id/enable', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const success = scraperRegistry.enable(id);

        if (!success) {
            throw new NotFoundError('Scraper plugin', id);
        }

        res.json({ message: `Scraper plugin "${id}" enabled successfully` });
    }));

    /**
     * POST /api/scrapers/plugins/:id/disable
     * Disable a scraper plugin
     */
    router.post('/plugins/:id/disable', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const success = scraperRegistry.disable(id);

        if (!success) {
            throw new NotFoundError('Scraper plugin', id);
        }

        res.json({ message: `Scraper plugin "${id}" disabled successfully` });
    }));

    return router;
}
