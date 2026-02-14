import { Router, Request, Response } from 'express';
import { getNeo4jDriver } from '../config/neo4j.js';
import { asyncHandler } from '../utils/errorHandling.js';

const router = Router();

/**
 * Check Neo4j Bloom availability
 * GET /api/neo4j/bloom/status
 */
router.get('/bloom/status', asyncHandler(async (_req: Request, res: Response) => {
    // Get Neo4j connection info
    const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const neo4jHost = neo4jUri.replace('bolt://', '').split(':')[0];

    // Bloom URL construction
    // Bloom typically runs on:
    // - Port 7474 (HTTP) for Neo4j Browser/Bloom
    // - Or separate Bloom service
    const bloomUrl = process.env.NEO4J_BLOOM_URL || `http://${neo4jHost}:7474/browser/`;

    // Try to verify Neo4j connection
    try {
        const driver = getNeo4jDriver();
        await driver.verifyConnectivity();
        // Neo4j is connected, Bloom availability is assumed if URL is configured
        // In production, you might want to check if Bloom service is actually running
        res.json({
            available: !!process.env.NEO4J_BLOOM_URL || !!process.env.NEO4J_URI,
            url: bloomUrl,
            neo4jConnected: true,
            neo4jUri: neo4jUri
        });
    } catch (_error) {
        // Neo4j not connected - return info but not an error
        res.json({
            available: false,
            url: bloomUrl,
            neo4jConnected: false,
            error: 'Neo4j not connected'
        });
    }
}));

export default router;
