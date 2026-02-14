import { Driver } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import { NavigationGraphIndexManager } from './index-management/NavigationGraphIndexManager.js';
import {
    navigationGraphNodesTotal,
    navigationGraphNodesAdded,
    navigationGraphPersistenceDuration,
    navigationGraphPersistenceErrors,
    navigationGraphNeo4jOperations,
    navigationGraphNeo4jOperationDuration,
} from '../../../utils/metrics.js';
import type {
    NavigationNode,
    NavigationGraphData,
    GraphStatistics,
    NodeChangeMetadata,
    BatchUpdateResult,
} from '../../../types/navigationGraph.js';
import { generateNavigationNodeUri } from '../../../utils/navigationGraphUtils.js';
import { recordToNavigationNode } from '../../../utils/navigationGraphSerialization.js';
import { ChangeDetectionService } from './ChangeDetectionService.js';
import { Neo4jQueryBuilder } from './Neo4jQueryBuilder.js';
import { GraphTraversalService } from './GraphTraversalService.js';
import { SemanticSearchService } from './SemanticSearchService.js';
import { EmbeddingManagementService } from './EmbeddingManagementService.js';
import { StatisticsService } from './StatisticsService.js';

// Re-export types for backward compatibility
export type {
    NavigationNode,
    NavigationGraphData,
    GraphStatistics,
    NodeChangeMetadata,
    BatchUpdateResult,
};

/**
 * Navigation Graph stored in Neo4j
 * 
 * **Architecture**: Scraping-specific, structure-first graph for web-scraped content only.
 * API-discovered documents (Rechtspraak, DSO, Wetgeving) belong in Knowledge Graph, not Navigation Graph.
 * 
 * Node Label: NavigationNode
 * Relationship Type: LINKS_TO (for children, with optional edge properties)
 * 
 * Node Properties:
 * - url: string (unique identifier)
 * - canonicalUrl: string (canonical URL, may differ from url if redirected)
 * - type: 'page' | 'section' | 'document'
 * - title: string
 * - filePath: string (optional, KB pointer)
 * - lastVisited: string (ISO timestamp, deprecated, use lastFetched)
 * - lastFetched: string (ISO timestamp of last fetch/retrieval)
 * - contentType: 'html' | 'pdf' | 'xml' | 'json' | 'other'
 * - siteId: string (site identifier, e.g., 'iplo')
 * - domain: string (domain name, e.g., 'iplo.nl')
 * - httpStatus: integer (HTTP status code from last fetch)
 * - hash: string (content hash/checksum, SHA-256, for deduplication)
 * - schemaType: string (WebPage, DigitalDocument)
 * - uri: string (schema.org URI)
 * - sourceUrl: string
 * - entityId: string (link to Knowledge Graph entity for cross-linking)
 * - embedding: number[] (384-dimensional vector for semantic search, stored in Neo4j vector index)
 * - Additional metadata: thema, onderwerp, summary, documentType, publishedAt, publisherAuthority
 * 
 * Edge Properties (LINKS_TO relationships):
 * - edgeType: 'nav' | 'menu' | 'body' | 'footer' | 'breadcrumb' | 'sitemap' | 'related' | 'download'
 * - anchorText: string (anchor text from HTML link)
 * - rel: string (HTML rel attribute, e.g., 'nofollow', 'external')
 * - firstSeen: string (ISO timestamp when link was first seen)
 * - lastSeen: string (ISO timestamp when link was last seen)
 * - sourceSection: string (CSS selector or DOM region, e.g., '#main-nav', '.footer-links')
 * 
 * Indexes:
 * - navigation_node_url_unique: Unique constraint on url
 * - navigation_node_type_idx: Index on type
 * - navigation_node_uri_idx: Index on uri
 * - navigation_node_embedding_idx: Vector index on embedding (384 dims, cosine similarity)
 * - navigation_node_filepath_idx: Index on filePath
 * - navigation_node_schematype_idx: Index on schemaType
 * - navigation_node_sourceurl_idx: Index on sourceUrl
 * - navigation_node_lastvisited_idx: Index on lastVisited
 * - navigation_node_updatedat_idx: Index on updatedAt
 * - navigation_node_createdat_idx: Index on createdAt
 * 
 * Index Maintenance:
 * - getIndexStatistics(): Get statistics and health information for all indexes
 * - verifyIndexes(): Verify that all expected indexes exist and are online
 * - benchmarkQueryPerformance(): Benchmark query performance to assess index effectiveness
 */
export class NavigationGraph {
    private driver: Driver;
    private initialized: boolean = false;
    private rootUrl: string = '';
    private inMemoryCache: { [url: string]: NavigationNode } = {};
    private clusteringServiceInvalidators: Set<() => void> = new Set();
    private indexManager: NavigationGraphIndexManager;
    private changeDetectionService: ChangeDetectionService;
    private queryBuilder: Neo4jQueryBuilder;
    private traversalService: GraphTraversalService;
    private semanticSearchService: SemanticSearchService;
    private embeddingManagementService: EmbeddingManagementService;
    // private statisticsService: StatisticsService; // Unused

    // Cache for expensive depth calculation
    private cachedMaxDepth: number = 0;
    private lastDepthCalculation: number = 0;
    private isCalculatingDepth: boolean = false;

    constructor(driver: Driver) {
        if (!driver) {
            throw new Error('NavigationGraph requires a Neo4j driver instance. Neo4j connection is mandatory.');
        }
        this.driver = driver;
        this.indexManager = new NavigationGraphIndexManager(driver);
        this.changeDetectionService = new ChangeDetectionService();
        this.queryBuilder = new Neo4jQueryBuilder();
        this.traversalService = new GraphTraversalService(driver, this.queryBuilder);
        this.semanticSearchService = new SemanticSearchService(driver, this.queryBuilder);
        this.embeddingManagementService = new EmbeddingManagementService(driver, this.queryBuilder, this.semanticSearchService);
    }

    /**
     * Initialize the navigation graph (verifies connectivity and creates indexes)
     * Throws error if Neo4j is not available - no fallbacks
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (!this.driver) {
            throw new Error('Neo4j driver is not available. Cannot initialize NavigationGraph.');
        }

        const session = this.driver.session();
        try {
            // Test connectivity - fail hard if not available
            await session.run('RETURN 1 as test');

            // Create indexes and constraints using index manager
            await this.indexManager.createIndexes();

            // Load root URL from metadata node (only if not already set)
            // This prevents overwriting a value set by setRoot()
            if (!this.rootUrl) {
                const rootQuery = this.queryBuilder.buildGetRootQuery();
                const rootResult = await session.run(rootQuery);

                if (rootResult.records.length > 0) {
                    this.rootUrl = rootResult.records[0].get('rootUrl') || '';
                }
            }

            this.initialized = true;
            logger.info('NavigationGraph initialized with Neo4j');
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMsg }, 'CRITICAL: Failed to initialize NavigationGraph');
            throw new Error(`NavigationGraph initialization failed. Neo4j is required: ${errorMsg}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Find best start nodes for BFS traversal based on connectivity and query relevance.
     * Optimized version that runs entirely in Cypher.
     *
     * @param query Search query string
     * @param limit Maximum number of results
     * @returns Array of {url, score}
     */
    async findStartNodes(query: string, limit: number = 1): Promise<Array<{ url: string; score: number }>> {
        await this.initialize();
        const session = this.driver.session();
        try {
            const { query: cypher, params } = this.queryBuilder.buildFindStartNodesQuery(query, limit);
            const result = await session.run(cypher, params);
            return result.records.map(record => ({
                url: record.get('url'),
                score: record.get('score').toNumber()
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * Load graph from Neo4j
     */
    async load(): Promise<void> {
        await this.initialize();
        // Graph is stored in Neo4j, no need to load everything into memory
        // Individual nodes are loaded on-demand via getNode()
        this.inMemoryCache = {};
    }


    /**
     * Add or update a node in Neo4j with incremental updates
     * Only updates changed properties, improving performance
     */
    async addNode(node: NavigationNode, context?: { runId?: string; workflowId?: string }): Promise<'added' | 'updated' | 'unchanged'> {
        await this.initialize();

        const startTime = Date.now();
        const contextInfo = {
            url: node.url,
            type: node.type,
            runId: context?.runId,
            workflowId: context?.workflowId,
        };

        // Auto-generate URI if not provided
        if (!node.uri) {
            node.uri = generateNavigationNodeUri(node);
        }

        // Set sourceUrl to url if not provided
        if (!node.sourceUrl) {
            node.sourceUrl = node.url;
        }

        const session = this.driver.session();
        const tx = session.beginTransaction();
        try {
            logger.debug({ ...contextInfo }, 'Adding node to navigation graph');
            // Get existing node for change detection
            const getNodeQuery = this.queryBuilder.buildGetNodeQuery(node.url);
            const existingResult = await tx.run(getNodeQuery.query, getNodeQuery.params);

            const exists = existingResult.records.length > 0;
            let existingNode: Record<string, unknown> | null = null;

            if (exists) {
                const record = existingResult.records[0];
                const parsedNode = recordToNavigationNode(record);
                if (parsedNode) {
                    existingNode = parsedNode as unknown as Record<string, unknown>;
                }
            }

            // Detect changes
            const changeResult = this.changeDetectionService.detectChanges(existingNode, node);

            // If no changes detected, return early (incremental update optimization)
            if (exists && !changeResult.hasChanges) {
                // Update cache and commit transaction
                this.inMemoryCache[node.url] = node;
                await tx.commit();
                const duration = (Date.now() - startTime) / 1000;
                navigationGraphPersistenceDuration.observe({ operation: 'add_node' }, duration);
                navigationGraphNodesAdded.inc({ change_type: 'unchanged', workflow_id: context?.workflowId || 'unknown' });
                logger.debug({ ...contextInfo, result: 'unchanged', duration }, 'Node unchanged, skipping persistence');
                return 'unchanged';
            }

            // Compute embedding for semantic search (only if title/url changed or new node)
            let embedding: number[] | null = null;
            const needsEmbedding = !exists || changeResult.changedFields.includes('title') || changeResult.changedFields.includes('url');
            if (needsEmbedding) {
                const text = [node.title || '', node.url || ''].join(' ').trim();
                if (text) {
                    try {
                        embedding = await this.semanticSearchService.getEmbedding(text);
                        // Cache embedding in memory for quick access
                        if (embedding) {
                            this.semanticSearchService.cacheEmbedding(node.url, embedding);
                        }
                    } catch (error) {
                        // Handle embedding generation failures gracefully (e.g., race conditions in parallel test execution)
                        // Log warning but continue without embedding - node can still be added without embedding
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.warn({ url: node.url, error: errorMsg }, 'Failed to generate embedding for node, continuing without embedding');
                        embedding = null;
                    }
                }
            } else if (exists) {
                // Reuse existing embedding from cache if available
                const cachedEmbedding = this.semanticSearchService.getCachedEmbedding(node.url);
                if (cachedEmbedding && Array.isArray(cachedEmbedding)) {
                    embedding = cachedEmbedding;
                } else if (existingNode && typeof existingNode === 'object' && 'embedding' in existingNode && Array.isArray(existingNode.embedding)) {
                    embedding = existingNode.embedding as number[];
                }
            }

            // Prepare properties - only include changed properties for incremental update
            const properties: Record<string, unknown> = {
                url: node.url,
                updatedAt: new Date().toISOString()
            };

            // Always set type (required field)
            if (!exists || changeResult.changedFields.includes('type')) {
                properties.type = node.type;
            }

            // Only set changed properties
            if (changeResult.changedFields.includes('title')) {
                properties.title = node.title;
            }
            if (changeResult.changedFields.includes('filePath')) {
                properties.filePath = node.filePath;
            }
            if (changeResult.changedFields.includes('lastVisited')) {
                properties.lastVisited = node.lastVisited;
            }
            if (changeResult.changedFields.includes('schemaType')) {
                properties.schemaType = node.schemaType;
            }
            if (changeResult.changedFields.includes('uri')) {
                properties.uri = node.uri;
            }
            if (changeResult.changedFields.includes('sourceUrl')) {
                properties.sourceUrl = node.sourceUrl;
            }
            if (changeResult.changedFields.includes('thema')) {
                properties.thema = node.thema;
            }
            if (changeResult.changedFields.includes('onderwerp')) {
                properties.onderwerp = node.onderwerp;
            }
            if (changeResult.changedFields.includes('xpaths')) {
                properties.xpaths = node.xpaths ? JSON.stringify(node.xpaths) : null;
            }
            if (changeResult.changedFields.includes('httpStatus')) {
                properties.httpStatus = node.httpStatus ?? null;
            }

            // Store embedding if computed or if it's a new node
            if (embedding && (needsEmbedding || !exists)) {
                properties.embedding = embedding;
            }

            // Store change metadata for tracking
            const timestamp = new Date().toISOString();
            if (changeResult.changedFields.length > 0) {
                properties.lastChangeFields = changeResult.changedFields;
                properties.lastChangeTimestamp = timestamp;
            }

            // Update node with incremental changes
            const writeStartTime = Date.now();
            try {
                if (exists) {
                    // Incremental update: only SET changed properties
                    const setClauses: string[] = ['n.updatedAt = $updatedAt'];
                    const updateParams: Record<string, unknown> = { url: node.url, updatedAt: timestamp };

                    for (const [key, value] of Object.entries(properties)) {
                        if (key !== 'url' && key !== 'updatedAt') {
                            setClauses.push(`n.${key} = $${key}`);
                            updateParams[key] = value;
                        }
                    }

                    const updateQuery = this.queryBuilder.buildUpdateNodeQuery(node.url, setClauses, updateParams);
                    await tx.run(updateQuery.query, updateQuery.params);
                } else {
                    // New node: create with all properties
                    properties.createdAt = new Date().toISOString();
                    const createQuery = this.queryBuilder.buildCreateNodeQuery(properties);
                    await tx.run(createQuery.query, createQuery.params);
                }
                const writeDuration = (Date.now() - writeStartTime) / 1000;
                navigationGraphNeo4jOperationDuration.observe({ operation_type: 'write' }, writeDuration);
                navigationGraphNeo4jOperations.inc({ operation_type: 'write', status: 'success' });
            } catch (error) {
                const writeDuration = (Date.now() - writeStartTime) / 1000;
                navigationGraphNeo4jOperationDuration.observe({ operation_type: 'write' }, writeDuration);
                navigationGraphNeo4jOperations.inc({ operation_type: 'write', status: 'failure' });
                const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
                navigationGraphPersistenceErrors.inc({ operation: 'add_node', error_type: errorType });
                logger.error({ ...contextInfo, error, errorType }, 'Failed to persist node to Neo4j');
                throw error;
            }

            // Update relationships (children) - only if children changed
            if (changeResult.changedFields.includes('children')) {
                const relStartTime = Date.now();
                try {
                    // Optimized: Create all child nodes in one batch query
                    if (node.children && node.children.length > 0) {
                        const mergeChildrenQuery = this.queryBuilder.buildMergeChildrenQuery(
                            node.children,
                            new Date().toISOString()
                        );
                        await tx.run(mergeChildrenQuery.query, mergeChildrenQuery.params);
                    }

                    // Delete old relationships and create new ones
                    const updateRelationsQuery = this.queryBuilder.buildUpdateRelationshipsQuery(
                        node.url,
                        node.children || []
                    );
                    await tx.run(updateRelationsQuery.query, updateRelationsQuery.params);
                    const relDuration = (Date.now() - relStartTime) / 1000;
                    navigationGraphNeo4jOperationDuration.observe({ operation_type: 'write' }, relDuration);
                    navigationGraphNeo4jOperations.inc({ operation_type: 'write', status: 'success' });
                } catch (error) {
                    const relDuration = (Date.now() - relStartTime) / 1000;
                    navigationGraphNeo4jOperationDuration.observe({ operation_type: 'write' }, relDuration);
                    navigationGraphNeo4jOperations.inc({ operation_type: 'write', status: 'failure' });
                    const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
                    navigationGraphPersistenceErrors.inc({ operation: 'add_node', error_type: errorType });
                    logger.error({ ...contextInfo, error, errorType, operation: 'update_relationships' }, 'Failed to update node relationships');
                    throw error;
                }
            }

            // Note: Persistence verification removed - it was using session.run() outside transaction
            // which could cause issues. Verification will happen after commit via separate query if needed.

            // Update in-memory cache
            this.inMemoryCache[node.url] = node;

            // Store change metadata
            const changeMetadata = this.changeDetectionService.createChangeMetadata(changeResult, exists, timestamp);
            if (changeResult.hasChanges || !exists) {
                await this.changeDetectionService.storeChangeMetadata(node.url, changeMetadata, tx);
            }

            // Commit transaction before other operations (cache invalidation, root setting, etc.)
            await tx.commit();
            
            // Invalidate clustering service caches when nodes are added or updated
            if (changeResult.hasChanges || !exists) {
                this.invalidateClusteringCaches();
            }

            const result = exists ? (changeResult.hasChanges ? 'updated' : 'unchanged') : 'added';
            const duration = (Date.now() - startTime) / 1000;
            
            // Auto-set root node if this is the first node and no root exists
            if (result === 'added') {
                const currentRoot = await this.getRoot();
                if (!currentRoot) {
                    // This is the first node added and no root is set - auto-set it
                    await this.setRoot(node.url);
                    logger.info({ rootUrl: node.url }, 'Auto-set root node (first node added)');
                }
            }
            
            // Update metrics
            navigationGraphPersistenceDuration.observe({ operation: 'add_node' }, duration);
            navigationGraphNodesAdded.inc({ change_type: result, workflow_id: context?.workflowId || 'unknown' });
            
            // Log result
            logger.info({
                ...contextInfo,
                result,
                duration,
                changedFields: changeResult.changedFields.length,
                childrenCount: node.children?.length || 0,
            }, `Node ${result} in navigation graph`);

            return result;
        } catch (error) {
            // Rollback transaction if it's still open
            // Neo4j may have already rolled back the transaction on error, so we need to handle that gracefully
            try {
                await tx.rollback();
            } catch (rollbackError) {
                // Transaction may have already been rolled back by Neo4j - that's okay
                logger.debug({ error: rollbackError }, 'Transaction rollback failed (may have been already rolled back)');
            }
            const duration = (Date.now() - startTime) / 1000;
            const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
            navigationGraphPersistenceDuration.observe({ operation: 'add_node' }, duration);
            navigationGraphPersistenceErrors.inc({ operation: 'add_node', error_type: errorType });
            logger.error({ ...contextInfo, error, errorType, duration }, 'Failed to add node to navigation graph');
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Add or update a node with change tracking metadata
     * Returns detailed change information
     */
    async addNodeWithMetadata(node: NavigationNode): Promise<NodeChangeMetadata> {
        await this.initialize();

        // Auto-generate URI if not provided
        if (!node.uri) {
            node.uri = generateNavigationNodeUri(node);
        }

        // Set sourceUrl to url if not provided
        if (!node.sourceUrl) {
            node.sourceUrl = node.url;
        }

        const session = this.driver.session();
        const tx = session.beginTransaction();
        try {
            // Get existing node for change detection
            const existingResult = await tx.run(`
                MATCH (n:NavigationNode {url: $url})
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `, { url: node.url });

            const exists = existingResult.records.length > 0;
            let existingNode: Record<string, unknown> | null = null;

            if (exists) {
                const record = existingResult.records[0];
                const parsedNode = recordToNavigationNode(record);
                if (parsedNode) {
                    existingNode = parsedNode as unknown as Record<string, unknown>;
                }
            }

            // Detect changes
            const changeResult = this.changeDetectionService.detectChanges(existingNode, node);
            const timestamp = new Date().toISOString();

            // If no changes detected, return unchanged metadata (but still commit transaction)
            if (exists && !changeResult.hasChanges) {
                this.inMemoryCache[node.url] = node;
                await tx.commit();
                return this.changeDetectionService.createChangeMetadata(changeResult, exists, timestamp);
            }

            // Compute embedding for semantic search (only if title/url/content changed or new node)
            let embedding: number[] | null = null;
            const needsEmbedding = !exists || 
                changeResult.changedFields.includes('title') || 
                changeResult.changedFields.includes('url') ||
                changeResult.changedFields.includes('content') ||
                changeResult.changedFields.includes('summary');
            if (needsEmbedding) {
                // Use content/summary for better embeddings, fallback to title+url
                const textParts = [
                    node.title || '',
                    node.summary || node.content?.substring(0, 500) || '',
                    node.documentType || ''
                ].filter(Boolean);
                const text = textParts.join(' ').trim() || [node.title || '', node.url || ''].join(' ').trim();
                if (text) {
                    embedding = await this.semanticSearchService.getEmbedding(text);
                    if (embedding) {
                        this.semanticSearchService.cacheEmbedding(node.url, embedding);
                    }
                }
            } else if (exists) {
                // Reuse existing embedding from cache if available
                const cachedEmbedding = this.semanticSearchService.getCachedEmbedding(node.url);
                if (cachedEmbedding && Array.isArray(cachedEmbedding)) {
                    embedding = cachedEmbedding;
                } else if (existingNode && typeof existingNode === 'object' && 'embedding' in existingNode && Array.isArray(existingNode.embedding)) {
                    embedding = existingNode.embedding as number[];
                }
            }

            // Prepare properties - only include changed properties for incremental update
            const properties: Record<string, unknown> = {
                url: node.url,
                updatedAt: timestamp
            };

            // Always set type (required field)
            if (!exists || changeResult.changedFields.includes('type')) {
                properties.type = node.type;
            }

            // Only set changed properties
            for (const field of changeResult.changedFields) {
                if (field === 'title') properties.title = node.title;
                else if (field === 'filePath') properties.filePath = node.filePath;
                else if (field === 'lastVisited') properties.lastVisited = node.lastVisited;
                else if (field === 'schemaType') properties.schemaType = node.schemaType;
                else if (field === 'uri') properties.uri = node.uri;
                else if (field === 'sourceUrl') properties.sourceUrl = node.sourceUrl;
                else if (field === 'xpaths') properties.xpaths = node.xpaths ? JSON.stringify(node.xpaths) : null;
                else if (field === 'httpStatus') properties.httpStatus = node.httpStatus ?? null;
            }

            // Store embedding if computed or if it's a new node
            if (embedding && (needsEmbedding || !exists)) {
                properties.embedding = embedding;
            }

            // Update node with incremental changes
            if (exists) {
                // Incremental update: only SET changed properties
                const setClauses: string[] = ['n.updatedAt = $updatedAt'];
                const updateParams: Record<string, unknown> = { url: node.url, updatedAt: timestamp };

                for (const [key, value] of Object.entries(properties)) {
                    if (key !== 'url' && key !== 'updatedAt') {
                        setClauses.push(`n.${key} = $${key}`);
                        updateParams[key] = value;
                    }
                }

                await tx.run(`
                    MATCH (n:NavigationNode {url: $url})
                    SET ${setClauses.join(', ')}
                `, updateParams);
            } else {
                // New node: create with all properties
                properties.createdAt = timestamp;
                await tx.run(`
                    CREATE (n:NavigationNode $properties)
                `, { properties });
            }

            // Update relationships (children) - only if children changed
            let relationshipsCreated = 0;
            if (changeResult.changedFields.includes('children')) {
                if (node.children && node.children.length > 0) {
                    // Create child nodes with required properties
                    await tx.run(`
                        UNWIND $children AS childUrl
                        MERGE (child:NavigationNode {url: childUrl})
                        ON CREATE SET 
                            child.createdAt = $createdAt,
                            child.type = COALESCE(child.type, 'page'),
                            child.updatedAt = $createdAt,
                            child.sourceUrl = COALESCE(child.sourceUrl, childUrl)
                    `, {
                        children: node.children,
                        createdAt: timestamp
                    });
                }

                // Delete old relationships and create new ones.
                // IMPORTANT: Cypher cannot end with `WITH parent` when there are no children.
                if (node.children && node.children.length > 0) {
                    await tx.run(`
                        MATCH (parent:NavigationNode {url: $url})
                        OPTIONAL MATCH (parent)-[r:LINKS_TO]->()
                        DELETE r
                        WITH parent
                        UNWIND $children AS childUrl
                        MATCH (child:NavigationNode {url: childUrl})
                        MERGE (parent)-[:LINKS_TO]->(child)
                    `, {
                        url: node.url,
                        children: node.children,
                    });
                    relationshipsCreated = node.children.length;
                } else {
                    await tx.run(`
                        MATCH (parent:NavigationNode {url: $url})
                        OPTIONAL MATCH (parent)-[r:LINKS_TO]->()
                        DELETE r
                    `, { url: node.url });
                }
            }

            // Update in-memory cache
            this.inMemoryCache[node.url] = node;

            // Create and store change metadata
            const changeMetadata: NodeChangeMetadata = {
                changedFields: changeResult.changedFields,
                changeType: exists ? 'updated' : 'added',
                previousValues: changeResult.previousValues,
                timestamp,
                relationshipsCreated,
            };
            await this.changeDetectionService.storeChangeMetadata(node.url, changeMetadata, tx);
            
            // Commit transaction before invalidating caches (cache invalidation is not part of transaction)
            await tx.commit();
            
            // Invalidate clustering service caches when nodes are added or updated
            this.invalidateClusteringCaches();

            return changeMetadata;
        } catch (error) {
            // Rollback transaction if it's still open
            // Neo4j may have already rolled back the transaction on error, so we need to handle that gracefully
            try {
                await tx.rollback();
            } catch (rollbackError) {
                // Transaction may have already been rolled back by Neo4j - that's okay
                logger.debug({ error: rollbackError }, 'Transaction rollback failed (may have been already rolled back)');
            }
            throw error;
        } finally {
            await session.close();
        }
    }


    /**
     * Batch add or update multiple nodes with incremental updates
     * More efficient than calling addNode() multiple times
     * 
     * @param nodes Array of nodes to add/update
     * @param batchSize Number of nodes to process per batch (default: 50)
     * @returns Summary of operations with change metadata
     */
    async addNodesBatch(
        nodes: NavigationNode[],
        batchSize: number = 50
    ): Promise<BatchUpdateResult> {
        await this.initialize();

        const result: BatchUpdateResult = {
            total: nodes.length,
            added: 0,
            updated: 0,
            unchanged: 0,
            errors: 0,
            relationshipsCreated: 0,
            changeMetadata: []
        };

        // Process nodes in batches
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);
            
            try {
                const batchResults = await Promise.all(
                    batch.map(node => 
                        this.addNodeWithMetadata(node).catch(error => {
                            logger.error({ url: node.url, error }, 'Error adding node in batch');
                            result.errors++;
                            return null;
                        })
                    )
                );

                // Count results and collect metadata
                for (const metadata of batchResults) {
                    if (!metadata) continue;
                    
                    result.changeMetadata.push(metadata);
                    result.relationshipsCreated += metadata.relationshipsCreated || 0;
                    if (metadata.changeType === 'added') result.added++;
                    else if (metadata.changeType === 'updated') result.updated++;
                    else if (metadata.changeType === 'unchanged') result.unchanged++;
                }
            } catch (error) {
                logger.error({ batchStart: i, batchEnd: i + batch.length, error }, 'Error processing batch');
                result.errors += batch.length;
            }
        }

        return result;
    }

    /**
     * Get change metadata for a node
     * @param url Node URL
     * @returns Change metadata or undefined if not found
     */
    async getChangeMetadata(url: string): Promise<NodeChangeMetadata | undefined> {
        await this.initialize();

        const session = this.driver.session();
        try {
            const changeMetadataQuery = this.queryBuilder.buildGetChangeMetadataQuery(url);
            const result = await session.run(changeMetadataQuery.query, changeMetadataQuery.params);

            if (result.records.length === 0) {
                return undefined;
            }

            const record = result.records[0];
            const changedFields = record.get('changedFields');
            const changeType = record.get('changeType');
            const timestamp = record.get('timestamp');
            const previousValues = record.get('previousValues');
            const createdAt = record.get('createdAt');

            if (!changedFields && !timestamp) {
                return undefined;
            }

            // Determine change type
            // If stored changeType is 'updated', trust it
            // If there are changedFields, it's an update (changedFields are only set when a node is updated, not on initial creation)
            // The initial creation sets all fields but doesn't track them as "changed" - changedFields are only populated on updates
            let inferredChangeType: 'added' | 'updated' | 'unchanged';
            if (changeType === 'updated') {
                inferredChangeType = 'updated';
            } else if (changedFields && Array.isArray(changedFields) && changedFields.length > 0) {
                // ChangedFields exist - this indicates an update occurred
                // (On initial creation, changedFields would be empty or all fields would be marked, but the stored metadata only tracks actual changes)
                inferredChangeType = 'updated';
            } else if (changeType === 'added') {
                inferredChangeType = 'added';
            } else if (timestamp && createdAt && timestamp === createdAt) {
                // Timestamp equals createdAt and no changedFields - it was just added
                inferredChangeType = 'added';
            } else if (changeType === 'unchanged') {
                inferredChangeType = 'unchanged';
            } else {
                // Default to unchanged if we can't determine
                inferredChangeType = 'unchanged';
            }

            return {
                changedFields: changedFields || [],
                changeType: inferredChangeType,
                previousValues: previousValues ? (typeof previousValues === 'string' ? JSON.parse(previousValues) : previousValues) : undefined,
                timestamp: timestamp || createdAt || new Date().toISOString()
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get a node by URL
     */
    async getNode(url: string): Promise<NavigationNode | undefined> {
        await this.initialize();

        // Check in-memory cache first
        if (this.inMemoryCache[url]) {
            return this.inMemoryCache[url];
        }

        const session = this.driver.session();
        try {
            const getNodeQuery = this.queryBuilder.buildGetNodeQuery(url);
            const result = await session.run(getNodeQuery.query, getNodeQuery.params);

            if (result.records.length === 0) {
                return undefined;
            }

            const record = result.records[0];
            const node = recordToNavigationNode(record);
            if (!node) {
                return undefined;
            }

            // Cache in memory
            this.inMemoryCache[url] = node;
            return node;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ url, error: errorMsg }, 'Error getting node from Neo4j');
            throw new Error(`Failed to get node from NavigationGraph: ${errorMsg}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Get multiple nodes by URL
     */
    async getNodes(urls: string[]): Promise<NavigationNode[]> {
        await this.initialize();

        // Check in-memory cache first
        const foundNodes: NavigationNode[] = [];
        const missingUrls: string[] = [];

        for (const url of urls) {
            if (this.inMemoryCache[url]) {
                foundNodes.push(this.inMemoryCache[url]);
            } else {
                missingUrls.push(url);
            }
        }

        if (missingUrls.length === 0) {
            return foundNodes;
        }

        const session = this.driver.session();
        try {
            const getNodesQuery = this.queryBuilder.buildGetNodesQuery(missingUrls);
            const result = await session.run(getNodesQuery.query, getNodesQuery.params);

            for (const record of result.records) {
                const node = recordToNavigationNode(record);
                if (node) {
                    // Cache in memory
                    this.inMemoryCache[node.url] = node;
                    foundNodes.push(node);
                }
            }

            return foundNodes;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ urls: missingUrls, error: errorMsg }, 'Error getting nodes from Neo4j');
            throw new Error(`Failed to get nodes from NavigationGraph: ${errorMsg}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Get node count without fetching all nodes (performance optimization)
     */
    async getNodeCount(): Promise<{ total: number; external: number; iplo: number }> {
        await this.initialize();

        const session = this.driver.session();
        try {
            const totalQuery = this.queryBuilder.buildGetNodeCountQuery();
            const totalResult = await session.run(totalQuery);
            const total = totalResult.records[0]?.get('total')?.toNumber() || 0;

            const externalQuery = this.queryBuilder.buildGetExternalNodeCountQuery();
            const externalResult = await session.run(externalQuery);
            const external = externalResult.records[0]?.get('external')?.toNumber() || 0;

            const iplo = total - external;

            return { total, external, iplo };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMsg }, 'Error getting node count from Neo4j');
            throw new Error(`Failed to get node count from NavigationGraph: ${errorMsg}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes (for statistics/compatibility)
     */
    async getAllNodes(): Promise<NavigationNode[]> {
        await this.initialize();

        const session = this.driver.session();
        try {
            const getAllNodesQuery = this.queryBuilder.buildGetAllNodesQuery();
            const result = await session.run(getAllNodesQuery);

            return result.records
                .map(record => recordToNavigationNode(record))
                .filter((node): node is NavigationNode => node !== null);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMsg }, 'Error getting all nodes from Neo4j');
            throw new Error(`Failed to get all nodes from NavigationGraph: ${errorMsg}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Find semantically similar nodes using Neo4j vector index search.
     */
    async findSemanticallySimilar(query: string, limit: number = 20): Promise<Array<{ node: NavigationNode; score: number }>> {
        await this.initialize();

        const session = this.driver.session();
        try {
            return await this.semanticSearchService.findSemanticallySimilar(
                session,
                query,
                limit,
                () => this.getAllNodes()
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Backfill embeddings for existing nodes that don't have them.
     * Useful for migrating existing graphs to use vector search.
     */
    async backfillEmbeddings(batchSize: number = 50, progressCallback?: (processed: number, total: number) => void): Promise<{ processed: number; updated: number; errors: number }> {
        await this.initialize();

        const session = this.driver.session();
        try {
            return await this.embeddingManagementService.backfillEmbeddings(
                session,
                batchSize,
                progressCallback
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Set the root URL
     */
    async setRoot(url: string): Promise<void> {
        await this.initialize();

        const session = this.driver.session();
        try {
            const setRootUrlQuery = this.queryBuilder.buildSetRootUrlQuery(url);
            await session.run(setRootUrlQuery.query, setRootUrlQuery.params);

            this.rootUrl = url;
        } finally {
            await session.close();
        }
    }

    /**
     * Get the root URL
     */
    async getRoot(): Promise<string> {
        await this.initialize();

        // Check cached value first (set by setRoot())
        if (this.rootUrl) {
            return this.rootUrl;
        }

        // Query database if not cached
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (m:NavigationGraphMetadata)
                RETURN m.rootUrl as rootUrl
                LIMIT 1
            `);

            if (result.records.length > 0) {
                const dbRootUrl = result.records[0].get('rootUrl') || '';
                this.rootUrl = dbRootUrl;
                return this.rootUrl;
            }

            return '';
        } finally {
            await session.close();
        }
    }

    /**
     * Get the root URL (synchronous - from cache)
     */
    getRootSync(): string {
        return this.rootUrl;
    }

    /**
     * Get a subgraph using BFS traversal
     */
    async getSubgraph(options: {
        startNode?: string;
        maxDepth?: number;
        maxNodes?: number;
        runId?: string;
        workflowId?: string;
    } = {}): Promise<{
        nodes: { [url: string]: NavigationNode };
        rootUrl: string;
        metadata: {
            totalNodesInGraph: number;
            nodesReturned: number;
            totalEdgesInGraph: number;
            edgesReturned: number;
            depthLimit: number;
            startNode: string;
        };
    }> {
        await this.initialize();

        const session = this.driver.session();
        try {
            return await this.traversalService.getSubgraph(
                session,
                options,
                (url: string) => this.getNode(url),
                () => this.getRoot()
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Get statistics about the graph
     */
    async getStatistics(context?: { runId?: string; workflowId?: string }): Promise<GraphStatistics> {
        await this.initialize();
        const startTime = Date.now();
        const contextInfo = {
            runId: context?.runId,
            workflowId: context?.workflowId,
        };
        logger.debug(contextInfo, 'Getting navigation graph statistics');

        const session = this.driver.session();
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

            // Update total node count metric
            navigationGraphNodesTotal.set(totalNodes);

            // Get total edges
            const edgeCountQuery = this.queryBuilder.buildGetEdgeCountQuery();
            const edgeResult = await session.run(edgeCountQuery);
            const totalEdges = edgeResult.records[0]?.get('total')?.toNumber() ?? 0;

            // Get max depth (return cached, trigger update if needed)
            if (this.rootUrl && !this.isCalculatingDepth) {
                const now = Date.now();
                // Update if never calculated or older than 1 hour (3600000 ms)
                if (this.lastDepthCalculation === 0 || now - this.lastDepthCalculation > 3600000) {
                    // Fire and forget - runs in background
                    this.calculateMaxDepth().catch(err => {
                        logger.error({ error: err }, 'Error in background depth calculation');
                    });
                }
            }
            const maxDepth = this.cachedMaxDepth;

            // Get last updated timestamp
            const updateResult = await session.run(`
                MATCH (n:NavigationNode)
                RETURN max(n.updatedAt) as lastUpdated
            `);
            const lastUpdated = updateResult.records[0]?.get('lastUpdated') || new Date().toISOString();

            const duration = (Date.now() - startTime) / 1000;
            const stats = {
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
        } finally {
            await session.close();
        }
    }

    /**
     * Get isolated nodes (nodes with no relationships)
     * @returns Array of URLs for nodes that have no incoming or outgoing relationships
     */
    async getIsolatedNodes(): Promise<string[]> {
        await this.initialize();
        const session = this.driver.session();
        try {
            // Find nodes that have no relationships (neither incoming nor outgoing)
            // Check both directions explicitly for accuracy
            const result = await session.run(`
                MATCH (n:NavigationNode)
                WHERE NOT (n)-[:LINKS_TO]->()
                  AND NOT ()-[:LINKS_TO]->(n)
                RETURN n.url as url
            `);

            const isolatedNodes: string[] = [];
            for (const record of result.records) {
                const url = record.get('url');
                if (url) {
                    isolatedNodes.push(url);
                }
            }

            logger.debug({ count: isolatedNodes.length }, 'Retrieved isolated nodes');
            return isolatedNodes;
        } catch (error) {
            logger.error({ error }, 'Failed to get isolated nodes');
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Validate relationships in the graph
     * Returns count of valid and broken relationships
     */
    async validateRelationships(): Promise<{
        valid: number;
        broken: number;
        brokenRelationships: Array<{ from: string; to: string }>;
    }> {
        await this.initialize();
        const session = this.driver.session();
        try {
            // Count valid relationships
            const validResult = await session.run(`
                MATCH (from:NavigationNode)-[r:LINKS_TO]->(to:NavigationNode)
                RETURN count(r) as valid
            `);

            // Find broken relationships (pointing to non-existent nodes)
            const brokenResult = await session.run(`
                MATCH (from:NavigationNode)-[r:LINKS_TO]->(to)
                WHERE NOT to:NavigationNode
                RETURN from.url as from, to.url as to
                LIMIT 100
            `);

            const valid = validResult.records[0]?.get('valid')?.toNumber() || 0;
            const broken = brokenResult.records.length;

            const brokenRelationships = brokenResult.records.map(r => ({
                from: r.get('from') as string,
                to: r.get('to') as string
            }));

            logger.debug({ valid, broken, brokenCount: brokenRelationships.length }, 'Relationship validation completed');
            
            return {
                valid,
                broken,
                brokenRelationships
            };
        } catch (error) {
            logger.error({ error }, 'Failed to validate relationships');
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Clean up broken relationships (relationships pointing to non-existent nodes)
     * @returns Number of relationships deleted
     */
    async cleanupBrokenRelationships(): Promise<number> {
        await this.initialize();
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (from:NavigationNode)-[r:LINKS_TO]->(to)
                WHERE NOT to:NavigationNode
                DELETE r
                RETURN count(r) as deleted
            `);

            const deleted = result.records[0]?.get('deleted')?.toNumber() || 0;
            
            if (deleted > 0) {
                logger.info({ deleted }, 'Cleaned up broken relationships');
                // Invalidate cache since relationships changed
                this.invalidateClusteringCaches();
            } else {
                logger.debug('No broken relationships found');
            }
            
            return deleted;
        } catch (error) {
            logger.error({ error }, 'Failed to cleanup broken relationships');
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Validate that all relationships point to existing NavigationNode nodes
     * This is a more comprehensive check than validateRelationships()
     */
    async validateGraphIntegrity(): Promise<{
        valid: boolean;
        issues: Array<{ type: string; description: string; count?: number }>;
    }> {
        await this.initialize();
        const session = this.driver.session();
        const issues: Array<{ type: string; description: string; count?: number }> = [];

        try {
            // Check for broken relationships
            const brokenRelResult = await session.run(`
                MATCH (from:NavigationNode)-[r:LINKS_TO]->(to)
                WHERE NOT to:NavigationNode
                RETURN count(r) as count
            `);
            const brokenCount = brokenRelResult.records[0]?.get('count')?.toNumber() || 0;
            if (brokenCount > 0) {
                issues.push({
                    type: 'broken_relationships',
                    description: 'Relationships pointing to non-existent nodes',
                    count: brokenCount
                });
            }

            // Check for nodes with missing required properties
            const missingTypeResult = await session.run(`
                MATCH (n:NavigationNode)
                WHERE n.type IS NULL
                RETURN count(n) as count
            `);
            const missingTypeCount = missingTypeResult.records[0]?.get('count')?.toNumber() || 0;
            if (missingTypeCount > 0) {
                issues.push({
                    type: 'missing_type',
                    description: 'Nodes missing required type property',
                    count: missingTypeCount
                });
            }

            // Check for nodes with missing URLs (should never happen due to constraint, but check anyway)
            const missingUrlResult = await session.run(`
                MATCH (n:NavigationNode)
                WHERE n.url IS NULL OR n.url = ''
                RETURN count(n) as count
            `);
            const missingUrlCount = missingUrlResult.records[0]?.get('count')?.toNumber() || 0;
            if (missingUrlCount > 0) {
                issues.push({
                    type: 'missing_url',
                    description: 'Nodes missing required url property',
                    count: missingUrlCount
                });
            }

            const valid = issues.length === 0;
            
            logger.debug({ valid, issueCount: issues.length }, 'Graph integrity validation completed');
            
            return {
                valid,
                issues
            };
        } catch (error) {
            logger.error({ error }, 'Failed to validate graph integrity');
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Save (no-op for Neo4j, data is already persisted)
     * Verifies persistence by checking node count with a fresh session to ensure transaction visibility
     */
    async save(): Promise<{ nodeCount: number }> {
        // Data is already persisted in Neo4j when addNode() is called
        // This method ensures indexes are up to date and returns current state
        // Uses a fresh session to verify transaction visibility (handles Neo4j transaction isolation)
        await this.initialize();
        
        // Use getNodeCount() instead of getAllNodes() for better performance
        // This also ensures we're reading from a fresh session, verifying transaction visibility
        const nodeCounts = await this.getNodeCount();
        return { nodeCount: nodeCounts.total };
    }

    /**
     * Clear all navigation graph data
     */
    async clear(): Promise<void> {
        await this.initialize();

        const session = this.driver.session();
        try {
            const clearNodesQuery = this.queryBuilder.buildClearNodesQuery();
            await session.run(clearNodesQuery);

            const clearMetadataQuery = this.queryBuilder.buildClearMetadataQuery();
            await session.run(clearMetadataQuery);

            this.rootUrl = '';
            this.inMemoryCache = {};
            logger.info('Navigation graph cleared from Neo4j');
        } finally {
            await session.close();
        }
    }

    /**
     * Get raw graph data (for testing/inspection) - from cache only
     * WARNING: This only returns in-memory cache, which may be empty if nodes haven't been loaded.
     * Use getAllDataAsync() to load all nodes from Neo4j.
     */
    getData(): NavigationGraphData {
        return {
            nodes: this.inMemoryCache,
            rootUrl: this.rootUrl
        };
    }

    /**
     * Get all graph data from Neo4j (async version)
     * Loads all nodes from the database and returns them in NavigationGraphData format
     */
    async getAllDataAsync(): Promise<NavigationGraphData> {
        await this.initialize();

        const nodes = await this.getAllNodes();
        
        // Convert array to object format
        const nodesMap: { [url: string]: NavigationNode } = {};
        for (const node of nodes) {
            nodesMap[node.url] = node;
            // Also update cache
            this.inMemoryCache[node.url] = node;
        }

        return {
            nodes: nodesMap,
            rootUrl: this.rootUrl
        };
    }

    /**
     * Get a node by URL (synchronous - from cache only)
     * For compatibility with existing code that expects synchronous access
     */
    getNodeSync(url: string): NavigationNode | undefined {
        return this.inMemoryCache[url];
    }

    /**
     * Get the root node (synchronous - from cache)
     */
    getRootNodeSync(): NavigationNode | undefined {
        if (!this.rootUrl) {
            return undefined;
        }
        return this.inMemoryCache[this.rootUrl];
    }

    /**
     * Get index statistics and status
     */
    async getIndexStatistics(): Promise<{
        indexes: Array<{
            name: string;
            type: string;
            state: string;
            populationPercent: number;
            properties: string[];
        }>;
        constraints: Array<{
            name: string;
            type: string;
            properties: string[];
        }>;
    }> {
        await this.initialize();
        return this.indexManager.getIndexStatistics();
    }

    /**
     * Verify that all expected indexes exist and are online
     */
    async verifyIndexes(): Promise<{
        allPresent: boolean;
        allOnline: boolean;
        missing: string[];
        offline: string[];
        details: Array<{
            name: string;
            state: string;
            populationPercent: number;
        }>;
    }> {
        await this.initialize();
        return this.indexManager.verifyIndexes();
    }

    /**
     * Benchmark query performance for common operations
     */
    async benchmarkQueryPerformance(iterations: number = 10): Promise<{
        getNodeByUrl: { avgMs: number; minMs: number; maxMs: number };
        getNodesByType: { avgMs: number; minMs: number; maxMs: number };
        semanticSearch: { avgMs: number; minMs: number; maxMs: number };
        getSubgraph: { avgMs: number; minMs: number; maxMs: number };
        getAllNodes: { avgMs: number; minMs: number; maxMs: number };
    }> {
        await this.initialize();

        const session = this.driver.session();
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
                await this.getNode(sampleUrl);
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
                await this.semanticSearchService.ensureEmbeddingProvider();
                if (this.semanticSearchService.getEmbeddingProvider()) {
                    for (let i = 0; i < Math.min(iterations, 5); i++) {
                        const start = performance.now();
                        await this.findSemanticallySimilar('test query', 10);
                        semanticSearchTimes.push(performance.now() - start);
                    }
                }
            } catch (error) {
                // Semantic search might not be available
                logger.warn({ error }, 'Semantic search benchmarking skipped');
            }

            // Benchmark getSubgraph
            const getSubgraphTimes: number[] = [];
            const rootUrl = await this.getRoot();
            if (rootUrl) {
                for (let i = 0; i < iterations; i++) {
                    const start = performance.now();
                    await this.getSubgraph({ startNode: rootUrl, maxDepth: 2, maxNodes: 100 });
                    getSubgraphTimes.push(performance.now() - start);
                }
            }

            // Benchmark getAllNodes
            const getAllNodesTimes: number[] = [];
            for (let i = 0; i < Math.min(iterations, 3); i++) {
                const start = performance.now();
                await this.getAllNodes();
                getAllNodesTimes.push(performance.now() - start);
            }

            const calculateStats = (times: number[]) => {
                if (times.length === 0) return { avgMs: 0, minMs: 0, maxMs: 0 };
                const sum = times.reduce((a, b) => a + b, 0);
                return {
                    avgMs: sum / times.length,
                    minMs: Math.min(...times),
                    maxMs: Math.max(...times)
                };
            };

            return {
                getNodeByUrl: calculateStats(getNodeTimes),
                getNodesByType: calculateStats(getNodesByTypeTimes),
                semanticSearch: calculateStats(semanticSearchTimes),
                getSubgraph: calculateStats(getSubgraphTimes),
                getAllNodes: calculateStats(getAllNodesTimes)
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Calculate max depth asynchronously using iterative BFS from application side.
     * This is more efficient than exhaustive shortestPath queries for large graphs.
     */
    private async calculateMaxDepth(): Promise<void> {
        if (this.isCalculatingDepth || !this.rootUrl) return;

        this.isCalculatingDepth = true;
        const session = this.driver.session();
        try {
            const depth = await this.traversalService.calculateMaxDepth(
                session,
                this.rootUrl,
                (url: string) => this.getNode(url)
            );

            this.cachedMaxDepth = depth;
            this.lastDepthCalculation = Date.now();
            logger.debug({ maxDepth: depth }, 'Updated navigation graph max depth cache');
        } catch (error) {
            logger.error({ error }, 'Failed to calculate graph max depth');
        } finally {
            await session.close();
            this.isCalculatingDepth = false;
        }
    }

    /**
     * Register a clustering service invalidator callback
     * This allows clustering services to be notified when the graph changes
     */
    registerClusteringServiceInvalidator(invalidator: () => void): void {
        this.clusteringServiceInvalidators.add(invalidator);
    }

    /**
     * Unregister a clustering service invalidator callback
     */
    unregisterClusteringServiceInvalidator(invalidator: () => void): void {
        this.clusteringServiceInvalidators.delete(invalidator);
    }

    /**
     * Invalidate all registered clustering service caches
     * Called automatically when nodes are added or updated
     */
    private invalidateClusteringCaches(): void {
        for (const invalidator of this.clusteringServiceInvalidators) {
            try {
                invalidator();
            } catch (error) {
                logger.warn({ error }, 'Error invalidating clustering cache');
            }
        }
    }
}

// Re-export utility function for backward compatibility
export { generateNavigationNodeUri } from '../../../utils/navigationGraphUtils.js';
