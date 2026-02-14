/**
 * Knowledge Graph Admin Routes
 * 
 * Routes for managing the navigation graph in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { ServiceUnavailableError, NotFoundError, BadRequestError } from '../../types/errors.js';
import { asyncHandler, sanitizeInput, auditMiddleware } from './shared/index.js';
import { logger } from '../../utils/logger.js';
import { validate } from '../../middleware/validation.js';
import { z } from 'zod';

/**
 * Register knowledge graph routes
 * 
 * @param router - Express router instance
 */
export function registerKnowledgeGraphRoutes(router: Router): void {
    /**
     * POST /api/admin/graph/seed
     * Seed the navigation graph with initial data
     */
    router.post('/graph/seed',
        sanitizeInput,
        auditMiddleware({
            action: 'system_config_changed',
            targetType: 'system',
            getDetails: () => ({ operation: 'seed_navigation_graph' })
        }),
        asyncHandler(async (_req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot seed navigation graph.');
            }

            try {
                const { seedNavigationGraph } = await import('../../scripts/seed-navigation-graph.js');
                await seedNavigationGraph();
                
                // Get updated statistics
                const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
                const graph = new NavigationGraph(neo4jDriver);
                await graph.initialize();
                const stats = await graph.getStatistics();
                const rootUrl = await graph.getRoot();
                
                res.json({
                    success: true,
                    message: 'Navigation graph seeded successfully',
                    statistics: {
                        totalNodes: stats.totalNodes,
                        totalEdges: stats.totalEdges,
                        rootUrl: rootUrl || null
                    }
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error({ error }, 'Failed to seed navigation graph');
                throw new BadRequestError(`Failed to seed navigation graph: ${errorMsg}`);
            }
        })
    );

    /**
     * POST /api/admin/graph/set-root
     * Set the root URL for the navigation graph
     */
    router.post('/graph/set-root',
        sanitizeInput,
        validate({
            body: z.object({
                url: z.string().url('URL must be a valid URL')
            })
        }),
        auditMiddleware({
            action: 'system_config_changed',
            targetType: 'system',
            getDetails: (req) => ({ operation: 'set_navigation_graph_root', url: req.body.url })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { url } = req.body;
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot set root node.');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            // Verify node exists
            const node = await graph.getNode(url);
            if (!node) {
                throw new NotFoundError('Node', url);
            }

            await graph.setRoot(url);
            logger.info({ rootUrl: url }, 'Root node set via admin endpoint');

            res.json({
                success: true,
                message: 'Root node set successfully',
                rootUrl: url
            });
        })
    );

    /**
     * GET /api/admin/graph/status
     * Get navigation graph status and health information (admin only)
     */
    router.get('/graph/status', asyncHandler(async (_req: Request, res: Response) => {
        const neo4jDriver = getNeo4jDriver();
        
        if (!neo4jDriver) {
            throw new ServiceUnavailableError('Neo4j driver is not available. Cannot get graph status.');
        }

        const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
        const graph = new NavigationGraph(neo4jDriver);
        await graph.initialize();

        const stats = await graph.getStatistics();
        const rootUrl = await graph.getRoot();
        const nodeCount = await graph.getNodeCount();
        const isolatedNodes = await graph.getIsolatedNodes();

        res.json({
            statistics: {
                totalNodes: stats.totalNodes,
                totalEdges: stats.totalEdges,
                maxDepth: stats.maxDepth,
                pageTypes: stats.pageTypes,
                lastUpdated: stats.lastUpdated
            },
            root: {
                url: rootUrl || null,
                isSet: !!rootUrl
            },
            nodeCount: {
                total: nodeCount.total,
                iplo: nodeCount.iplo,
                external: nodeCount.external
            },
            connectivity: {
                isolatedNodes: isolatedNodes.length,
                connectedNodes: stats.totalNodes - isolatedNodes.length,
                connectivityRatio: stats.totalNodes > 0 
                    ? (stats.totalNodes - isolatedNodes.length) / stats.totalNodes 
                    : 0
            }
        });
    }));

    /**
     * GET /api/admin/graph/validate-relationships
     * Validate relationships in the navigation graph
     */
    router.get('/graph/validate-relationships',
        asyncHandler(async (_req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot validate relationships.');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            const validation = await graph.validateRelationships();

            res.json({
                success: true,
                validation: {
                    valid: validation.valid,
                    broken: validation.broken,
                    total: validation.valid + validation.broken,
                    brokenRelationships: validation.brokenRelationships.slice(0, 50), // Limit to first 50
                    hasIssues: validation.broken > 0
                }
            });
        })
    );

    /**
     * POST /api/admin/graph/cleanup-broken-relationships
     * Clean up broken relationships in the navigation graph
     */
    router.post('/graph/cleanup-broken-relationships',
        sanitizeInput,
        auditMiddleware({
            action: 'system_config_changed' as const,
            targetType: 'system',
            getDetails: () => ({ operation: 'cleanup_broken_relationships' })
        }),
        asyncHandler(async (_req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot cleanup relationships.');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            const deleted = await graph.cleanupBrokenRelationships();
            logger.info({ deleted }, 'Broken relationships cleaned up via admin endpoint');

            res.json({
                success: true,
                message: `Cleaned up ${deleted} broken relationship(s)`,
                deleted
            });
        })
    );

    /**
     * GET /api/admin/graph/integrity
     * Validate graph integrity (comprehensive check)
     */
    router.get('/graph/integrity',
        asyncHandler(async (_req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot validate integrity.');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            const integrity = await graph.validateGraphIntegrity();

            res.json({
                success: true,
                integrity: {
                    valid: integrity.valid,
                    issues: integrity.issues,
                    issueCount: integrity.issues.length,
                    recommendations: integrity.issues.map(issue => {
                        if (issue.type === 'broken_relationships') {
                            return 'Run cleanup-broken-relationships to fix broken relationships';
                        }
                        if (issue.type === 'missing_type') {
                            return 'Nodes are missing required type property - may need data migration';
                        }
                        if (issue.type === 'missing_url') {
                            return 'Nodes are missing required url property - critical data integrity issue';
                        }
                        return `Fix ${issue.type} issues`;
                    })
                }
            });
        })
    );

    /**
     * POST /api/admin/graph/repair
     * Repair graph integrity issues (runs cleanup operations)
     */
    router.post('/graph/repair',
        sanitizeInput,
        auditMiddleware({
            action: 'system_config_changed' as const,
            targetType: 'system',
            getDetails: () => ({ operation: 'repair_graph_integrity' })
        }),
        asyncHandler(async (_req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot repair graph.');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            // Run integrity check first
            const integrity = await graph.validateGraphIntegrity();
            
            // Cleanup broken relationships
            const deletedRelationships = await graph.cleanupBrokenRelationships();

            // Re-check integrity after repair
            const integrityAfter = await graph.validateGraphIntegrity();

            logger.info({ 
                deletedRelationships,
                issuesBefore: integrity.issues.length,
                issuesAfter: integrityAfter.issues.length
            }, 'Graph repair completed via admin endpoint');

            res.json({
                success: true,
                message: 'Graph repair completed',
                repair: {
                    deletedRelationships,
                    issuesBefore: integrity.issues.length,
                    issuesAfter: integrityAfter.issues.length,
                    fixed: integrity.issues.length - integrityAfter.issues.length,
                    remainingIssues: integrityAfter.issues
                }
            });
        })
    );

    /**
     * GET /api/admin/graph/verify-persistence/:url
     * Verify that a specific node exists in Neo4j (persistence verification)
     */
    router.get('/graph/verify-persistence/:url',
        asyncHandler(async (req: Request, res: Response) => {
            const neo4jDriver = getNeo4jDriver();
            
            if (!neo4jDriver) {
                throw new ServiceUnavailableError('Neo4j driver is not available. Cannot verify persistence.');
            }

            const url = decodeURIComponent(req.params.url);
            if (!url) {
                throw new BadRequestError('URL parameter is required');
            }

            const { NavigationGraph } = await import('../../services/graphs/navigation/NavigationGraph.js');
            const graph = new NavigationGraph(neo4jDriver);
            await graph.initialize();

            // Check if node exists by trying to get it
            const node = await graph.getNode(url);
            const exists = node !== undefined;

            res.json({
                success: true,
                url,
                exists,
                message: exists 
                    ? 'Node exists in Neo4j (persistence verified)'
                    : 'Node not found in Neo4j (persistence issue)'
            });
        })
    );
}

