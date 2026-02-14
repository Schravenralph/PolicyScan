/**
 * Statistics Service for Navigation Graph
 * 
 * Provides statistics calculation and query performance benchmarking for NavigationGraph.
 * Extracted from NavigationGraph.ts to improve maintainability and testability.
 * 
 * This service handles:
 * - Graph statistics calculation (nodes, edges, depth, types)
 * - Query performance benchmarking
 * - Metrics aggregation
 */

import type { Driver, Session } from 'neo4j-driver';
import type { GraphStatistics } from '../../../types/navigationGraph.js';
import { logger } from '../../../utils/logger.js';
import { Neo4jQueryBuilder } from './Neo4jQueryBuilder.js';

/**
 * Query performance benchmark results
 */
export interface BenchmarkResults {
    getNodeByUrl: { avgMs: number; minMs: number; maxMs: number };
    getNodesByType: { avgMs: number; minMs: number; maxMs: number };
    semanticSearch: { avgMs: number; minMs: number; maxMs: number };
    getSubgraph: { avgMs: number; minMs: number; maxMs: number };
    getAllNodes: { avgMs: number; minMs: number; maxMs: number };
}

/**
 * Service for statistics and benchmarking operations
 */
export class StatisticsService {
    constructor(
        private driver: Driver,
        private queryBuilder: Neo4jQueryBuilder
    ) {}

    /**
     * Calculate statistics for a times array
     */
    private calculateStats(times: number[]): { avgMs: number; minMs: number; maxMs: number } {
        if (times.length === 0) return { avgMs: 0, minMs: 0, maxMs: 0 };
        const sum = times.reduce((a, b) => a + b, 0);
        return {
            avgMs: sum / times.length,
            minMs: Math.min(...times),
            maxMs: Math.max(...times)
        };
    }

    /**
     * Get statistics about the graph
     * 
     * @param session Neo4j session
     * @param getMaxDepth Function to get cached max depth
     * @param contextInfo Context information for logging
     * @returns Graph statistics
     */
    async getStatistics(
        session: Session,
        getMaxDepth: () => number,
        contextInfo: Record<string, unknown>
    ): Promise<GraphStatistics> {
        const startTime = Date.now();

        try {
            // Get node count by type
            const typeResult = await session.run(`
                MATCH (n:NavigationNode)
                RETURN n.type as type, count(n) as count
            `);

            const pageTypes: { [type: string]: number } = {};
            for (const record of typeResult.records) {
                const count = record.get('count');
                if (count) {
                    pageTypes[record.get('type')] = count.toNumber();
                }
            }

            // Get total nodes
            const nodeCountQuery = this.queryBuilder.buildGetNodeCountQuery();
            const nodeResult = await session.run(nodeCountQuery);
            const totalNodes = nodeResult.records[0]?.get('total')?.toNumber() ?? 0;

            // Get total edges
            const edgeCountQuery = this.queryBuilder.buildGetEdgeCountQuery();
            const edgeResult = await session.run(edgeCountQuery);
            const totalEdges = edgeResult.records[0]?.get('total')?.toNumber() ?? 0;

            // Get max depth (from cache)
            const maxDepth = getMaxDepth();

            // Get last updated timestamp
            const updateResult = await session.run(`
                MATCH (n:NavigationNode)
                RETURN max(n.updatedAt) as lastUpdated
            `);
            const lastUpdated = updateResult.records[0]?.get('lastUpdated') || new Date().toISOString();

            const duration = (Date.now() - startTime) / 1000;
            const stats: GraphStatistics = {
                totalNodes,
                totalEdges,
                maxDepth,
                pageTypes,
                lastUpdated
            };

            logger.info({
                ...contextInfo,
                ...stats,
                duration,
            }, 'Navigation graph statistics retrieved');

            return stats;
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
            logger.error({ ...contextInfo, error, errorType, duration }, 'Failed to get navigation graph statistics');
            throw error;
        }
    }

    /**
     * Benchmark query performance for common operations
     * 
     * @param session Neo4j session
     * @param getNode Function to get a node by URL
     * @param getNodesByType Function to get nodes by type
     * @param findSemanticallySimilar Function to perform semantic search
     * @param getSubgraph Function to get a subgraph
     * @param getAllNodes Function to get all nodes
     * @param getRoot Function to get root URL
     * @param iterations Number of iterations per benchmark
     * @returns Benchmark results
     */
    async benchmarkQueryPerformance(
        session: Session,
        getNode: (url: string) => Promise<any>,
        _getNodesByType: (type: string) => Promise<any[]>,
        findSemanticallySimilar: (query: string, limit: number) => Promise<any[]>,
        getSubgraph: (options: { startNode?: string; maxDepth?: number; maxNodes?: number }) => Promise<any>,
        getAllNodes: () => Promise<any[]>,
        getRoot: () => Promise<string>,
        iterations: number = 10
    ): Promise<BenchmarkResults> {
        try {
            // Get a sample URL for testing
            const sampleQuery = this.queryBuilder.buildGetSampleNodeQuery();
            const sampleResult = await session.run(sampleQuery);
            const sampleUrl = sampleResult.records[0]?.get('url');
            if (!sampleUrl) {
                throw new Error('No nodes found for benchmarking');
            }

            // Benchmark getNodeByUrl
            const getNodeTimes: number[] = [];
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                await getNode(sampleUrl);
                getNodeTimes.push(performance.now() - start);
            }

            // Benchmark getNodesByType
            const getNodesByTypeTimes: number[] = [];
            const countByTypeQuery = this.queryBuilder.buildCountNodesByTypeQuery('page');
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                await session.run(countByTypeQuery.query, countByTypeQuery.params);
                getNodesByTypeTimes.push(performance.now() - start);
            }

            // Benchmark semanticSearch (if embedding provider available)
            const semanticSearchTimes: number[] = [];
            try {
                for (let i = 0; i < Math.min(iterations, 5); i++) {
                    const start = performance.now();
                    await findSemanticallySimilar('test query', 10);
                    semanticSearchTimes.push(performance.now() - start);
                }
            } catch (error) {
                // Semantic search might not be available
                logger.warn({ error }, 'Semantic search benchmarking skipped');
            }

            // Benchmark getSubgraph
            const getSubgraphTimes: number[] = [];
            const rootUrl = await getRoot();
            if (rootUrl) {
                for (let i = 0; i < iterations; i++) {
                    const start = performance.now();
                    await getSubgraph({ startNode: rootUrl, maxDepth: 2, maxNodes: 100 });
                    getSubgraphTimes.push(performance.now() - start);
                }
            }

            // Benchmark getAllNodes
            const getAllNodesTimes: number[] = [];
            for (let i = 0; i < Math.min(iterations, 3); i++) {
                const start = performance.now();
                await getAllNodes();
                getAllNodesTimes.push(performance.now() - start);
            }

            return {
                getNodeByUrl: this.calculateStats(getNodeTimes),
                getNodesByType: this.calculateStats(getNodesByTypeTimes),
                semanticSearch: this.calculateStats(semanticSearchTimes),
                getSubgraph: this.calculateStats(getSubgraphTimes),
                getAllNodes: this.calculateStats(getAllNodesTimes)
            };
        } catch (error) {
            logger.error({ error }, 'Query performance benchmarking failed');
            throw error;
        }
    }
}

