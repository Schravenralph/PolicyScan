/**
 * Common Crawl Database Routes
 * 
 * API endpoints for loading Common Crawl data into a database
 * and querying it with SQL.
 */

import express, { Request } from 'express';
import { CommonCrawlDatabase } from '../services/common-crawl/commonCrawlDatabase.js';
import { CommonCrawlSmartLoader } from '../services/common-crawl/commonCrawlSmartLoader.js';
import { validate } from '../middleware/validation.js';
import { commonCrawlSchemas } from '../validation/commonCrawlSchemas.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, RateLimitError } from '../types/errors.js';

const router = express.Router();

/**
 * Session metadata for tracking session lifecycle
 */
interface SessionMetadata {
    db: CommonCrawlDatabase;
    createdAt: number;
    lastAccessedAt: number;
    ipAddress: string;
}

// Store database instances per session/user with metadata
const databases = new Map<string, SessionMetadata>();

// Configuration constants
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour of inactivity
const MAX_SESSIONS_PER_IP = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract IP address from request
 */
function getIpAddress(req: Request): string {
    return (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (req.headers['x-real-ip'] as string) ||
        req.socket.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

/**
 * Update last accessed time for a session
 */
function updateSessionAccess(sessionId: string): void {
    const metadata = databases.get(sessionId);
    if (metadata) {
        metadata.lastAccessedAt = Date.now();
    }
}

/**
 * Get number of active sessions for an IP address
 */
function getSessionCountForIp(ipAddress: string): number {
    let count = 0;
    for (const metadata of databases.values()) {
        if (metadata.ipAddress === ipAddress) {
            count++;
        }
    }
    return count;
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, metadata] of databases.entries()) {
        const timeSinceLastAccess = now - metadata.lastAccessedAt;
        if (timeSinceLastAccess > SESSION_TTL_MS) {
            expiredSessions.push(sessionId);
        }
    }

    for (const sessionId of expiredSessions) {
        const metadata = databases.get(sessionId);
        if (metadata) {
            try {
                metadata.db.cleanup();
                logger.info({ sessionId, ipAddress: metadata.ipAddress }, '[Common Crawl DB] Cleaned up expired session');
            } catch (error) {
                logger.error({ error, sessionId }, '[Common Crawl DB] Error cleaning up expired session');
            }
            databases.delete(sessionId);
        }
    }

    if (expiredSessions.length > 0) {
        logger.info({ count: expiredSessions.length }, '[Common Crawl DB] Cleaned up expired sessions');
    }
}

// Start periodic cleanup job
const cleanupInterval = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);

// Cleanup on process exit
process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
    // Cleanup all sessions on shutdown
    for (const [sessionId, metadata] of databases.entries()) {
        try {
            metadata.db.cleanup();
        } catch (error) {
            logger.error({ error, sessionId }, '[Common Crawl DB] Error cleaning up session on shutdown');
        }
    }
    databases.clear();
});

process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
    // Cleanup all sessions on shutdown
    for (const [sessionId, metadata] of databases.entries()) {
        try {
            metadata.db.cleanup();
        } catch (error) {
            logger.error({ error, sessionId }, '[Common Crawl DB] Error cleaning up session on shutdown');
        }
    }
    databases.clear();
});

/**
 * POST /api/commoncrawl/db/load
 * Load Common Crawl data into a temporary database
 */
router.post('/load', validate(commonCrawlSchemas.load), asyncHandler(async (req, res) => {
    const { 
        pattern, 
        crawlId, // Required - should come from frontend dropdown
        limit = 100000, // Default: 100k (reasonable for most use cases)
        sessionId,
        filters 
    } = req.body;

    if (!pattern) {
        throw new BadRequestError('Pattern is required', {
            field: 'pattern',
        });
    }

    if (!crawlId) {
        throw new BadRequestError('crawlId is required. Please select a crawl from the dropdown.', {
            field: 'crawlId',
        });
    }

        // Warn if limit is very large
        if (limit > 1000000) {
            logger.warn({ limit }, `[Common Crawl DB] Large limit requested: ${limit}. This may take a long time and use significant storage.`);
        }

        // Get client IP address
        const ipAddress = getIpAddress(req);
        
        // Use sessionId or generate one (sessionId is already validated if provided)
        const dbSessionId = sessionId || `session_${Date.now()}`;
        
        // Check if session already exists
        let metadata = databases.get(dbSessionId);
        
        if (!metadata) {
        // Check session limit per IP
        const sessionCount = getSessionCountForIp(ipAddress);
        if (sessionCount >= MAX_SESSIONS_PER_IP) {
            throw new RateLimitError(
                `Maximum ${MAX_SESSIONS_PER_IP} concurrent sessions allowed per IP address. Please close existing sessions before creating new ones.`,
                {
                    ipAddress,
                    currentSessions: sessionCount,
                    maxSessions: MAX_SESSIONS_PER_IP,
                }
            );
        }
            
            // Create new database instance
            const db = new CommonCrawlDatabase(`commoncrawl_${dbSessionId}.db`);
            db.initialize();
            
            // Store with metadata
            const now = Date.now();
            metadata = {
                db,
                createdAt: now,
                lastAccessedAt: now,
                ipAddress,
            };
            databases.set(dbSessionId, metadata);
        } else {
            // Update last access time
            updateSessionAccess(dbSessionId);
        }
        
        const db = metadata.db;

        // Load data from Common Crawl
        const loaded = await db.loadFromCommonCrawl({
            pattern,
            crawlId,
            limit,
            filters, // Pass filters to reduce dataset size
        });

        const stats = db.getStats();

    res.json({
        success: true,
        sessionId: dbSessionId,
        loaded,
        stats,
    });
}));

/**
 * GET /api/commoncrawl/db/stats
 * Get statistics about loaded data
 */
router.get('/stats/:sessionId', validate(commonCrawlSchemas.stats), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const metadata = databases.get(sessionId);
    if (!metadata) {
        throw new NotFoundError('Database session', sessionId);
    }
    
    // Update last access time
    updateSessionAccess(sessionId);
    const db = metadata.db;

    const stats = db.getStats();

    res.json({
        success: true,
        stats,
    });
}));

/**
 * POST /api/commoncrawl/db/find-domains
 * Find domains containing a substring
 */
router.post('/find-domains', validate(commonCrawlSchemas.findDomains), asyncHandler(async (req, res) => {
    const { sessionId, substring, limit = 100 } = req.body;

    const metadata = databases.get(sessionId);
    if (!metadata) {
        throw new NotFoundError('Database session', sessionId);
    }
    
    // Update last access time
    updateSessionAccess(sessionId);
    const db = metadata.db;

    const domains = db.findDomainsContaining(substring, limit);

    res.json({
        success: true,
        domains,
        count: domains.length,
    });
}));

/**
 * POST /api/commoncrawl/db/find-urls
 * Find URLs containing a substring
 */
router.post('/find-urls', validate(commonCrawlSchemas.findUrls), asyncHandler(async (req, res) => {
    const { sessionId, substring, domainPattern, limit = 100 } = req.body;

    const metadata = databases.get(sessionId);
    if (!metadata) {
        throw new NotFoundError('Database session', sessionId);
    }
    
    // Update last access time
    updateSessionAccess(sessionId);
    const db = metadata.db;

    const urls = db.findUrlsContaining(substring, domainPattern, limit);

    res.json({
        success: true,
        urls,
        count: urls.length,
    });
}));

/**
 * POST /api/commoncrawl/db/smart/discover
 * Smart domain discovery - loads sample, finds domains containing substring
 */
router.post('/smart/discover', asyncHandler(async (req, res) => {
    const {
        pattern,
        substring,
        crawlId = 'CC-MAIN-2025-47',
        discoverySample = 50000,
        filters,
    } = req.body;

    if (!pattern || !substring) {
        throw new BadRequestError('Pattern and substring are required', {
            received: { pattern, substring },
        });
    }

        const sessionId = `discovery_${Date.now()}`;
        const db = new CommonCrawlDatabase(`commoncrawl_${sessionId}.db`);
        db.initialize();

        // Register session for cleanup
        databases.set(sessionId, {
            db,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            ipAddress: getIpAddress(req),
        });

        const loader = new CommonCrawlSmartLoader(db);

        const result = await loader.discoverDomains(pattern, substring, {
            crawlId,
            discoverySample,
            filters,
        });

    res.json({
        success: true,
        sessionId,
        ...result,
    });
}));

/**
 * POST /api/commoncrawl/db/smart/hybrid
 * Hybrid approach: discover domains → load complete data
 */
router.post('/smart/hybrid', asyncHandler(async (req, res) => {
    const {
        pattern,
        substring,
        crawlId, // Required - should come from frontend dropdown
        discoverySample = 50000,
        filters,
    } = req.body;

    if (!pattern || !substring) {
        throw new BadRequestError('Pattern and substring are required', {
            received: { pattern, substring },
        });
    }

    if (!crawlId) {
        throw new BadRequestError('crawlId is required. Please select a crawl from the dropdown.', {
            field: 'crawlId',
        });
    }

        const sessionId = `hybrid_${Date.now()}`;
        const db = new CommonCrawlDatabase(`commoncrawl_${sessionId}.db`);
        db.initialize();

        // Register session for cleanup
        databases.set(sessionId, {
            db,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            ipAddress: getIpAddress(req),
        });

        const loader = new CommonCrawlSmartLoader(db);

        const result = await loader.hybridLoad(pattern, substring, {
            crawlId,
            discoverySample,
            filters,
        });

    res.json({
        success: true,
        discoverySessionId: sessionId,
        completeSessionId: sessionId,
        ...result,
    });
}));

/**
 * POST /api/commoncrawl/db/estimate
 * Estimate dataset size before loading
 */
router.post('/estimate', asyncHandler(async (req, res) => {
    const { pattern, limit = 100000, filters } = req.body;

    if (!pattern) {
        throw new BadRequestError('Pattern is required', {
            field: 'pattern',
        });
    }

        const db = new CommonCrawlDatabase(`estimate_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);

        let estimate;
        try {
            const loader = new CommonCrawlSmartLoader(db);
            estimate = loader.estimateSize(pattern, limit, filters);
        } finally {
            db.cleanup();
        }

    res.json({
        success: true,
        estimate,
        recommendations: {
            ...(estimate.estimatedDatabaseSizeMB > 1000 && {
                warning: 'Large dataset detected. Consider using filters or reducing limit.',
            }),
            ...(estimate.estimatedLoadTimeMinutes > 60 && {
                warning: 'Long load time expected. Consider using discovery mode first.',
            }),
        },
    });
}));

/**
 * DELETE /api/commoncrawl/db/:sessionId
 * Clean up database session
 */
router.delete('/:sessionId', validate(commonCrawlSchemas.deleteSession), asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const metadata = databases.get(sessionId);
    if (metadata) {
        metadata.db.cleanup();
        databases.delete(sessionId);
    }

    res.json({
        success: true,
        message: 'Database session cleaned up',
    });
}));

export default router;
