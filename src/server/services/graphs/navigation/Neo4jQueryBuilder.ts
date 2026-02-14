/**
 * Neo4j Query Builder for Navigation Graph
 * 
 * Provides reusable Cypher query construction for common NavigationGraph operations.
 * Extracted from NavigationGraph.ts to improve maintainability and testability.
 * 
 * This service handles:
 * - Query string construction
 * - Parameter building
 * - Common query patterns (MATCH, CREATE, SET, MERGE, DELETE)
 */

import { int, Integer } from 'neo4j-driver';
import type { SubgraphFilters } from './GraphTraversalService.js';
import { parseDate } from '../../../utils/dateUtils.js';

/**
 * Query parameters for node operations
 */
export interface NodeQueryParams {
    url: string;
    [key: string]: unknown;
}

/**
 * Query parameters for node creation
 */
export interface CreateNodeParams {
    properties: Record<string, unknown>;
}

/**
 * Query parameters for node update
 */
export interface UpdateNodeParams {
    url: string;
    setClauses: string[];
    updateParams: Record<string, unknown>;
}

/**
 * Query parameters for relationship operations
 */
export interface RelationshipParams {
    url: string;
    children: string[];
    createdAt?: string;
}

/**
 * Service for building Neo4j Cypher queries for NavigationGraph operations
 */
export class Neo4jQueryBuilder {
    /**
     * Build query to get a node by URL with its children
     * 
     * @param url Node URL
     * @returns Query string and parameters
     */
    buildGetNodeQuery(url: string): { query: string; params: NodeQueryParams } {
        return {
            query: `
                MATCH (n:NavigationNode {url: $url})
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `,
            params: { url }
        };
    }

    /**
     * Build query to get multiple nodes by URL with their children
     *
     * @param urls Array of Node URLs
     * @returns Query string and parameters
     */
    buildGetNodesQuery(urls: string[]): { query: string; params: { urls: string[] } } {
        return {
            query: `
                MATCH (n:NavigationNode)
                WHERE n.url IN $urls
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `,
            params: { urls }
        };
    }

    /**
     * Build query to check if a node exists
     * 
     * @param url Node URL
     * @returns Query string and parameters
     */
    buildNodeExistsQuery(url: string): { query: string; params: NodeQueryParams } {
        return {
            query: `
                MATCH (n:NavigationNode {url: $url})
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `,
            params: { url }
        };
    }

    /**
     * Build query to create a new node
     * 
     * @param properties Node properties
     * @returns Query string and parameters
     */
    buildCreateNodeQuery(properties: Record<string, unknown>): { query: string; params: CreateNodeParams } {
        return {
            query: `
                CREATE (n:NavigationNode $properties)
            `,
            params: { properties }
        };
    }

    /**
     * Build query to update an existing node with incremental changes
     * 
     * @param url Node URL
     * @param setClauses SET clauses for changed properties
     * @param updateParams Parameters for the update (includes url and updatedAt)
     * @returns Query string and parameters
     */
    buildUpdateNodeQuery(
        _url: string,
        setClauses: string[],
        updateParams: Record<string, unknown>
    ): { query: string; params: Record<string, unknown> } {
        return {
            query: `
                MATCH (n:NavigationNode {url: $url})
                SET ${setClauses.join(', ')}
            `,
            params: updateParams // Already includes url and all update parameters
        };
    }

    /**
     * Build query to merge child nodes (create if they don't exist)
     * 
     * @param children Array of child URLs
     * @param createdAt Creation timestamp
     * @returns Query string and parameters
     */
    buildMergeChildrenQuery(children: string[], createdAt: string): { query: string; params: RelationshipParams } {
        return {
            query: `
                UNWIND $children AS childUrl
                MERGE (child:NavigationNode {url: childUrl})
                ON CREATE SET 
                    child.createdAt = $createdAt,
                    child.type = COALESCE(child.type, 'page'),
                    child.updatedAt = $createdAt,
                    child.sourceUrl = COALESCE(child.sourceUrl, childUrl)
            `,
            params: {
                url: '', // Not used in this query
                children,
                createdAt
            }
        };
    }

    /**
     * Build query to update node relationships (delete old, create new)
     * 
     * @param url Parent node URL
     * @param children Array of child URLs
     * @returns Query string and parameters
     */
    buildUpdateRelationshipsQuery(url: string, children: string[]): { query: string; params: RelationshipParams } {
        if (children.length === 0) {
            // No children - just delete old relationships
            return {
                query: `
                    MATCH (parent:NavigationNode {url: $url})
                    OPTIONAL MATCH (parent)-[r:LINKS_TO]->()
                    DELETE r
                `,
                params: { url, children: [] }
            };
        }

        // Delete old relationships and create new ones
        return {
            query: `
                MATCH (parent:NavigationNode {url: $url})
                OPTIONAL MATCH (parent)-[r:LINKS_TO]->()
                DELETE r
                WITH parent
                UNWIND $children AS childUrl
                MATCH (child:NavigationNode {url: childUrl})
                MERGE (parent)-[:LINKS_TO]->(child)
            `,
            params: { url, children }
        };
    }

    /**
     * Build query to get all nodes with their children
     * 
     * @returns Query string
     */
    buildGetAllNodesQuery(): string {
        return `
            MATCH (n:NavigationNode)
            OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
            RETURN n, collect(child.url) as children
        `;
    }

    /**
     * Build query to get nodes by type
     * 
     * @param type Node type ('page' | 'section' | 'document')
     * @returns Query string and parameters
     */
    buildGetNodesByTypeQuery(type: 'page' | 'section' | 'document'): { query: string; params: { type: string } } {
        return {
            query: `
                MATCH (n:NavigationNode {type: $type})
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `,
            params: { type }
        };
    }

    /**
     * Build query to get node count
     * 
     * @returns Query string
     */
    buildGetNodeCountQuery(): string {
        return `
            MATCH (n:NavigationNode)
            RETURN count(n) as total
        `;
    }

    /**
     * Build query to get external node count (non-iplo.nl)
     * 
     * @returns Query string
     */
    buildGetExternalNodeCountQuery(): string {
        return `
            MATCH (n:NavigationNode)
            WHERE NOT n.url STARTS WITH 'https://iplo.nl'
            RETURN count(n) as external
        `;
    }

    /**
     * Build query to get isolated nodes (nodes with no relationships)
     * 
     * @returns Query string
     */
    buildGetIsolatedNodesQuery(): string {
        return `
            MATCH (n:NavigationNode)
            WHERE NOT (n)-[:LINKS_TO]->() AND NOT ()-[:LINKS_TO]->(n)
            RETURN n.url as url
        `;
    }

    /**
     * Build query to get root URL from metadata
     * 
     * @returns Query string
     */
    buildGetRootQuery(): string {
        return `
            MATCH (m:NavigationGraphMetadata)
            RETURN m.rootUrl as rootUrl
            LIMIT 1
        `;
    }

    /**
     * Build query to set root URL in metadata
     * 
     * @param rootUrl Root URL to set
     * @returns Query string and parameters
     */
    buildSetRootQuery(rootUrl: string): { query: string; params: { rootUrl: string } } {
        return {
            query: `
                MERGE (m:NavigationGraphMetadata)
                SET m.rootUrl = $rootUrl, m.updatedAt = datetime()
            `,
            params: {
                rootUrl
            }
        };
    }

    /**
     * Build query for vector similarity search
     * 
     * @param k Number of nearest neighbors to query
     * @param queryVector Query embedding vector
     * @param limit Maximum results to return
     * @returns Query string and parameters
     */
    buildVectorSearchQuery(
        k: number,
        queryVector: number[],
        limit: number
    ): { query: string; params: { k: number; queryVector: number[]; limit: Integer } } {
        // Ensure limit is a Neo4j Integer (required for LIMIT clause)
        const limitInt = int(Math.max(1, Math.floor(Number(limit) || 20)));
        return {
            query: `
                CALL db.index.vector.queryNodes('navigation_node_embedding_idx', $k, $queryVector)
                YIELD node, score
                OPTIONAL MATCH (node)-[:LINKS_TO]->(child:NavigationNode)
                WITH node, score, collect(child.url) as children
                RETURN node, score, children
                ORDER BY score DESC
                LIMIT $limit
            `,
            params: { k, queryVector, limit: limitInt }
        };
    }

    /**
     * Build query to get nodes without embeddings (for backfill)
     * 
     * @param batchSize Maximum number of nodes to return
     * @returns Query string and parameters
     */
    buildGetNodesWithoutEmbeddingsQuery(batchSize: number): { query: string; params: { batchSize: Integer } } {
        // Ensure batchSize is a Neo4j Integer (required for LIMIT clause)
        const batchSizeInt = int(Math.max(1, Math.floor(Number(batchSize) || 100)));
        return {
            query: `
                MATCH (n:NavigationNode)
                WHERE n.embedding IS NULL
                RETURN n.url as url, n.title as title
                LIMIT $batchSize
            `,
            params: { batchSize: batchSizeInt }
        };
    }

    /**
     * Build query to count nodes without embeddings
     * 
     * @returns Query string
     */
    buildCountNodesWithoutEmbeddingsQuery(): string {
        return `
            MATCH (n:NavigationNode)
            WHERE n.embedding IS NULL
            RETURN count(n) as total
        `;
    }

    /**
     * Build query to update node embedding
     * 
     * @param url Node URL
     * @param embedding Embedding vector
     * @returns Query string and parameters
     */
    buildUpdateEmbeddingQuery(url: string, embedding: number[]): { query: string; params: { url: string; embedding: number[] } } {
        return {
            query: `
                MATCH (n:NavigationNode {url: $url})
                SET n.embedding = $embedding, n.updatedAt = datetime()
            `,
            params: {
                url,
                embedding
            }
        };
    }

    /**
     * Build query for BFS traversal (get subgraph)
     * 
     * @param startNode Starting node URL
     * @param maxDepth Maximum traversal depth
     * @param maxNodes Maximum nodes to return
     * @returns Query string and parameters
     */
    buildBfsTraversalQuery(
        startNode: string,
        maxDepth: number,
        maxNodes: number,
        filters?: SubgraphFilters
    ): { query: string; params: Record<string, unknown> } {
        // Ensure bfsMaxNodes is a Neo4j Integer (required for LIMIT clause)
        const bfsMaxNodes = int(Math.max(1, Math.floor(Number(maxNodes) || 500) - 1)); // Subtract 1 for start node
        
        // Sanitize maxDepth to 1-50 range to prevent performance issues
        const sanitizedMaxDepth = Math.max(1, Math.min(Math.floor(Number(maxDepth) || 10), 50));
        
        // Build filter conditions
        const filterConditions = this.buildFilterConditions(filters);
        const filterConditionsStr = filterConditions.whereClause ? filterConditions.whereClause.replace('WHERE ', '') : '';
        const combinedWhere = filterConditionsStr 
            ? `WHERE length(path) <= $maxDepth AND ${filterConditionsStr}`
            : `WHERE length(path) <= $maxDepth`;
        
        return {
            query: `
                MATCH path = (start:NavigationNode {url: $startNode})-[*1..50]->(n:NavigationNode)
                ${combinedWhere}
                WITH n, min(length(path)) as depth
                ORDER BY depth
                LIMIT $bfsMaxNodes
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                WITH n, collect(child.url) as children, depth
                RETURN n, children, depth
                ORDER BY depth
            `,
            params: {
                startNode,
                maxDepth: sanitizedMaxDepth,
                bfsMaxNodes,
                ...filterConditions.params
            }
        };
    }

    /**
     * Build query to get total edge count
     * 
     * @returns Query string
     */
    buildGetEdgeCountQuery(): string {
        return `
            MATCH ()-[r:LINKS_TO]->()
            RETURN count(r) as total
        `;
    }

    /**
     * Build query to get node count by type
     * 
     * @returns Query string
     */
    buildGetNodeCountByTypeQuery(): string {
        return `
            MATCH (n:NavigationNode)
            RETURN n.type as type, count(n) as count
        `;
    }

    /**
     * Build query to get a sample node URL (for benchmarking)
     * 
     * @returns Query string
     */
    buildGetSampleNodeQuery(): string {
        return `
            MATCH (n:NavigationNode)
            RETURN n.url as url
            LIMIT 1
        `;
    }

    /**
     * Build query to count nodes without embeddings (for backfill)
     * 
     * @returns Query string and parameters
     */
    buildBackfillEmbeddingsCountQuery(): { query: string; params: Record<string, never> } {
        return {
            query: `
                MATCH (n:NavigationNode)
                WHERE n.embedding IS NULL
                RETURN count(n) as total
            `,
            params: {}
        };
    }

    /**
     * Build query to get nodes ordered by updatedAt (for fallback subgraph)
     * 
     * @param maxNodes Maximum number of nodes to return
     * @returns Query string and parameters
     */
    buildGetNodesOrderedByUpdatedQuery(maxNodes: number, filters?: SubgraphFilters): { query: string; params: Record<string, unknown> } {
        // Ensure maxNodes is a Neo4j Integer (required for LIMIT clause)
        const maxNodesInt = int(Math.max(1, Math.floor(Number(maxNodes) || 500)));
        
        // Build filter conditions
        const filterConditions = this.buildFilterConditions(filters);
        
        return {
            query: `
                MATCH (n:NavigationNode)
                ${filterConditions.whereClause}
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                WITH n, collect(child.url) as children
                RETURN n, children
                ORDER BY n.updatedAt DESC
                LIMIT $maxNodes
            `,
            params: { 
                maxNodes: maxNodesInt,
                ...filterConditions.params
            }
        };
    }

    /**
     * Build query to count nodes by type (for benchmarking)
     * 
     * @param type Node type
     * @returns Query string and parameters
     */
    buildCountNodesByTypeQuery(type: string): { query: string; params: { type: string } } {
        return {
            query: `
                MATCH (n:NavigationNode {type: $type})
                RETURN count(n) as count
            `,
            params: { type }
        };
    }

    /**
     * Build query to clear all navigation nodes
     * 
     * @returns Query string
     */
    buildClearNodesQuery(): string {
        return `
            MATCH (n:NavigationNode)
            DETACH DELETE n
        `;
    }

    /**
     * Build query to clear metadata
     * 
     * @returns Query string
     */
    buildClearMetadataQuery(): string {
        return `
            MATCH (m:NavigationGraphMetadata)
            DELETE m
        `;
    }

    /**
     * Build query to update root URL in metadata (alternative version)
     * 
     * @param url Root URL
     * @returns Query string and parameters
     */
    buildSetRootUrlQuery(url: string): { query: string; params: { url: string } } {
        return {
            query: `
                MERGE (m:NavigationGraphMetadata)
                SET m.rootUrl = $url, m.updatedAt = datetime()
            `,
            params: {
                url
            }
        };
    }

    /**
     * Build query to batch update embeddings
     * 
     * @param updates Array of {url, embedding} objects
     * @returns Query string and parameters
     */
    buildBatchUpdateEmbeddingsQuery(updates: Array<{ url: string; embedding: number[] }>): {
        query: string;
        params: { updates: Array<{ url: string; embedding: number[] }> };
    } {
        return {
            query: `
                UNWIND $updates AS update
                MATCH (n:NavigationNode {url: update.url})
                SET n.embedding = update.embedding
                SET n.updatedAt = datetime()
            `,
            params: {
                updates: updates.map(u => ({ url: u.url, embedding: u.embedding }))
            }
        };
    }

    /**
     * Build query to get change metadata for a node
     * 
     * @param url Node URL
     * @returns Query string and parameters
     */
    buildGetChangeMetadataQuery(url: string): { query: string; params: { url: string } } {
        return {
            query: `
                MATCH (n:NavigationNode {url: $url})
                RETURN n.lastChangeFields as changedFields,
                       n.lastChangeType as changeType,
                       n.lastChangeTimestamp as timestamp,
                       n.lastChangePreviousValues as previousValues,
                       n.createdAt as createdAt
            `,
            params: { url }
        };
    }

    /**
     * Build query to get nodes excluding a specific URL (for fallback subgraph)
     * 
     * @param excludeUrl URL to exclude
     * @param maxNodes Maximum number of nodes to return
     * @returns Query string and parameters
     */
    buildGetNodesExcludingUrlQuery(excludeUrl: string, maxNodes: number): {
        query: string;
        params: { startNode: string; maxNodes: Integer };
    } {
        // Ensure maxNodes is a Neo4j Integer (required for LIMIT clause)
        const maxNodesInt = int(Math.max(1, Math.floor(Number(maxNodes) || 500)));
        return {
            query: `
                MATCH (n:NavigationNode)
                WHERE n.url <> $startNode
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                WITH n, collect(child.url) as children
                RETURN n, children
                ORDER BY n.updatedAt DESC
                LIMIT $maxNodes
            `,
            params: { startNode: excludeUrl, maxNodes: maxNodesInt }
        };
    }

    /**
     * Build WHERE clause conditions for filters
     * 
     * @param filters Filter options
     * @returns Object with WHERE clause string and parameters
     */
    buildFilterConditions(filters?: SubgraphFilters): {
        whereClause: string;
        params: Record<string, unknown>;
    } {
        if (!filters) {
            return { whereClause: '', params: {} };
        }

        const conditions: string[] = [];
        const params: Record<string, unknown> = {};

        // Document type filter
        if (filters.documentType) {
            if (Array.isArray(filters.documentType)) {
                if (filters.documentType.length > 0) {
                    conditions.push('n.documentType IN $documentType');
                    params.documentType = filters.documentType;
                }
            } else {
                conditions.push('n.documentType = $documentType');
                params.documentType = filters.documentType;
            }
        }

        // Publisher authority filter
        if (filters.publisherAuthority) {
            if (Array.isArray(filters.publisherAuthority)) {
                if (filters.publisherAuthority.length > 0) {
                    conditions.push('n.publisherAuthority IN $publisherAuthority');
                    params.publisherAuthority = filters.publisherAuthority;
                }
            } else {
                conditions.push('n.publisherAuthority = $publisherAuthority');
                params.publisherAuthority = filters.publisherAuthority;
            }
        }

        // Published date filters
        if (filters.publishedAfter) {
            try {
                const date = parseDate(filters.publishedAfter);
                conditions.push('n.publishedAt >= $publishedAfter');
                params.publishedAfter = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid publishedAfter date: ${filters.publishedAfter}`, error);
            }
        }

        if (filters.publishedBefore) {
            try {
                const date = parseDate(filters.publishedBefore);
                conditions.push('n.publishedAt <= $publishedBefore');
                params.publishedBefore = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid publishedBefore date: ${filters.publishedBefore}`, error);
            }
        }

        // Recently published filter
        if (filters.recentlyPublished) {
            try {
                const date = parseDate(filters.recentlyPublished);
                conditions.push('n.publishedAt >= $recentlyPublished');
                params.recentlyPublished = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid recentlyPublished date: ${filters.recentlyPublished}`, error);
            }
        }

        // Last visited date filters
        if (filters.lastVisitedAfter) {
            try {
                const date = parseDate(filters.lastVisitedAfter);
                conditions.push('n.lastVisited >= $lastVisitedAfter');
                params.lastVisitedAfter = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid lastVisitedAfter date: ${filters.lastVisitedAfter}`, error);
            }
        }

        if (filters.lastVisitedBefore) {
            try {
                const date = parseDate(filters.lastVisitedBefore);
                conditions.push('n.lastVisited <= $lastVisitedBefore');
                params.lastVisitedBefore = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid lastVisitedBefore date: ${filters.lastVisitedBefore}`, error);
            }
        }

        // Recently visited filter
        if (filters.recentlyVisited) {
            try {
                const date = parseDate(filters.recentlyVisited);
                conditions.push('n.lastVisited >= $recentlyVisited');
                params.recentlyVisited = date;
            } catch (error) {
                // Log error but don't fail - skip this filter
                console.warn(`Invalid recentlyVisited date: ${filters.recentlyVisited}`, error);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        return { whereClause, params };
    }

    /**
     * Build query to find start nodes for BFS exploration
     *
     * @param query Search query string
     * @param limit Maximum number of results
     * @returns Query string and parameters
     */
    buildFindStartNodesQuery(query: string, limit: number): { query: string; params: { query: string; limit: Integer } } {
        // Ensure limit is a Neo4j Integer (required for LIMIT clause)
        const limitInt = int(Math.max(1, Math.floor(Number(limit) || 1)));

        return {
            query: `
                MATCH (n:NavigationNode)
                WHERE (n)-[:LINKS_TO]->()
                WITH n, count{(n)-[:LINKS_TO]->()} as childCount
                WHERE childCount > 0
                WITH n, childCount,
                     CASE WHEN $query <> '' AND toLower(n.title) CONTAINS toLower($query) THEN 30 ELSE 0 END as titleScore
                WITH n, (childCount + titleScore) as totalScore
                ORDER BY totalScore DESC
                LIMIT $limit
                RETURN n.url as url, totalScore as score
            `,
            params: {
                query: query || '',
                limit: limitInt
            }
        };
    }
}
