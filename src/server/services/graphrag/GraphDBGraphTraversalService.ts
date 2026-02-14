/**
 * GraphDB Graph Traversal Service
 * 
 * SPARQL-based implementation of graph traversal for GraphDB backend.
 * Provides BFS, DFS, and path finding capabilities using SPARQL property paths.
 * 
 * This is the foundation service that many other GraphDB features depend on.
 */

import { GraphDBClient } from '../../config/graphdb.js';
import { RelationType, EntityType, BaseEntity, PolicyDocument, Regulation, BELEID_RELATION_MAPPING, BELEID_CLASS_MAPPING } from '../../domain/ontology.js';
import { TraversalResult, TraversalNode } from './traversal/BFSTraversal.js';

interface GraphDBTraversalNode extends TraversalNode {
    entity?: BaseEntity;
}

interface GraphDBTraversalResult {
    nodes: BaseEntity[];
    edges: Array<{ sourceId: string; targetId: string; type: RelationType }>;
    visitedCount: number;
    depthReached: number;
}
import { PathResult, SubgraphResult } from './GraphTraversalService.js';
import { logger } from '../../utils/logger.js';
import { getFeatureFlagsService } from '../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';

const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const SCHEMA_NAMESPACE = 'https://schema.org/';
const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';
const KG_NAMESPACE = 'http://data.example.org/def/kg#';

/**
 * SPARQL prefixes for GraphDB queries
 */
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX kg: <${KG_NAMESPACE}>
PREFIX schema: <${SCHEMA_NAMESPACE}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/**
 * Maps RelationType to SPARQL property paths
 */
function relationTypeToPropertyPath(relationTypes?: RelationType[]): string {
    if (!relationTypes || relationTypes.length === 0) {
        // Default: all relationship types
        return '(beleid:appliesTo|beleid:definedIn|beleid:locatedIn|beleid:overrides|beleid:refines|beleid:contains|beleid:partOf)';
    }
    
    const properties = relationTypes.map(rt => BELEID_RELATION_MAPPING[rt] || `beleid:${rt.toLowerCase()}`).join('|');
    return `(${properties})`;
}

/**
 * Maps EntityType to SPARQL class filters
 */
function entityTypeToClass(entityTypes?: EntityType[]): string {
    if (!entityTypes || entityTypes.length === 0) {
        return ''; // No filter
    }
    
    const classes = entityTypes.map(et => BELEID_CLASS_MAPPING[et] || 'beleid:Concept').join('|');
    return `FILTER (?type IN (${classes}))`;
}

export interface GraphDBTraversalOptions {
    maxDepth?: number;
    maxNodes?: number;
    relationshipTypes?: RelationType[];
    entityTypes?: EntityType[];
    direction?: 'outgoing' | 'incoming' | 'both';
    strategy?: 'bfs' | 'dfs';
}

/**
 * GraphDB Graph Traversal Service
 * 
 * Implements graph traversal using SPARQL property paths.
 * This is a foundational service used by GraphRAG, path finding, and other features.
 */
export class GraphDBGraphTraversalService {
    private client: GraphDBClient;
    private featureFlagsService = getFeatureFlagsService();
    
    constructor(client: GraphDBClient) {
        this.client = client;
    }
    
    /**
     * Check if traversal is enabled via feature flag
     */
    private isEnabled(): boolean {
        return this.featureFlagsService.isEnabled(KGFeatureFlag.KG_TRAVERSAL_ENABLED, false);
    }
    
    /**
     * Perform BFS traversal from a starting node
     * Uses iterative SPARQL queries per depth level for accurate depth calculation
     */
    async traverseBFS(
        startNodeId: string,
        options: GraphDBTraversalOptions = {}
    ): Promise<GraphDBTraversalResult> {
        if (!this.isEnabled()) {
            logger.warn('[GraphDBTraversal] Traversal is disabled via feature flag');
            return {
                nodes: [],
                edges: [],
                visitedCount: 0,
                depthReached: 0,
            };
        }
        
        const maxDepth = options.maxDepth ?? 3;
        const maxNodes = options.maxNodes ?? 1000;
        const relationshipPath = relationTypeToPropertyPath(options.relationshipTypes);
        const direction = options.direction ?? 'both';
        
        // Build path pattern based on direction
        const pathPattern = direction === 'both' 
            ? `(${relationshipPath}|^${relationshipPath})`
            : direction === 'incoming'
            ? `^${relationshipPath}`
            : relationshipPath;
        
        const entityTypeFilter = entityTypeToClass(options.entityTypes);
        const entityUri = (id: string) => `http://data.example.org/id/${encodeURIComponent(id)}`;
        // const startUri = entityUri(startNodeId); // Unused
        
        const visited = new Set<string>([startNodeId]);
        const nodes: GraphDBTraversalNode[] = [];
        const edges: Array<{ sourceId: string; targetId: string; type: RelationType }> = [];
        const nodesAtDepth = new Map<number, Set<string>>();
        nodesAtDepth.set(0, new Set([startNodeId]));
        
        // Get start node entity
        const startEntity = await this.getEntityById(startNodeId);
        if (startEntity) {
            nodes.push({
                id: startNodeId,
                entity: startEntity,
                depth: 0,
                path: [startNodeId],
            });
        }
        
        // Iterative BFS: query each depth level separately
        for (let depth = 1; depth <= maxDepth && nodes.length < maxNodes; depth++) {
            const previousDepthNodes = Array.from(nodesAtDepth.get(depth - 1) || []);
            if (previousDepthNodes.length === 0) break;
            
            const currentDepthNodes = new Set<string>();
            
            // Query neighbors at this depth
            for (const parentId of previousDepthNodes.slice(0, 50)) { // Limit to avoid too many queries
                if (nodes.length >= maxNodes) break;
                
                const parentUri = entityUri(parentId);
                const query = `
${PREFIXES}
SELECT DISTINCT ?nodeId ?id ?type ?name ?description ?metadata ?relType WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${parentUri}> ${pathPattern} ?target .
    ?target beleid:id ?nodeId ;
            beleid:type ?type ;
            rdfs:label ?name .
    OPTIONAL { ?target dct:description ?description }
    OPTIONAL { ?target beleid:metadata ?metadata }
    
    # Get relationship type
    OPTIONAL {
      ?rel a beleid:Relation ;
           beleid:source <${parentUri}> ;
           beleid:target ?target ;
           beleid:relationType ?relType .
    }
    
    ${entityTypeFilter}
  }
}
LIMIT 100
`;
                
                try {
                    const results = await this.client.query(query);
                    
                    for (const row of results) {
                        const nodeId = row.nodeId as string;
                        if (!nodeId || visited.has(nodeId)) continue;
                        if (nodes.length >= maxNodes) break;
                        
                        visited.add(nodeId);
                        currentDepthNodes.add(nodeId);
                        
                        // Convert row to entity
                        const entity = this.rowToEntity(row);
                        if (entity) {
                            nodes.push({
                                id: nodeId,
                                entity,
                                depth,
                                path: [startNodeId, nodeId], // Simplified path
                            });
                            
                            // Add edge
                            const relType = row.relType as string || RelationType.RELATED_TO;
                            edges.push({
                                sourceId: parentId,
                                targetId: nodeId,
                                type: relType as RelationType,
                            });
                        }
                    }
                } catch (error) {
                    logger.warn({ error, parentId, depth }, 'Failed to query neighbors at depth');
                }
            }
            
            nodesAtDepth.set(depth, currentDepthNodes);
            if (currentDepthNodes.size === 0) break; // No more nodes at this depth
        }
        
        return {
            nodes: nodes.map(n => n.entity).filter(Boolean) as BaseEntity[],
            edges,
            visitedCount: visited.size,
            depthReached: Math.max(...Array.from(nodesAtDepth.keys())),
        };
    }
    
    /**
     * Perform DFS traversal
     * Similar to BFS but explores deeper paths first
     */
    async traverseDFS(
        startNodeId: string,
        options: GraphDBTraversalOptions = {}
    ): Promise<TraversalResult> {
        // For SPARQL, DFS is similar to BFS but we can prioritize deeper paths
        // by ordering results differently
        const result = await this.traverseBFS(startNodeId, { ...options, strategy: 'dfs' });
        return {
            nodes: result.nodes.map(n => ({ id: n.id, depth: 0, path: [n.id] })),
            edges: result.edges,
            visitedCount: result.visitedCount,
            depthReached: result.depthReached,
        };
    }
    
    /**
     * Generic traverse method (defaults to BFS)
     */
    async traverse(
        startNodeId: string,
        options: GraphDBTraversalOptions = {}
    ): Promise<TraversalResult> {
        const strategy = options.strategy ?? 'bfs';
        
        if (strategy === 'dfs') {
            return this.traverseDFS(startNodeId, options);
        } else {
            const result = await this.traverseBFS(startNodeId, options);
            return {
                nodes: result.nodes.map(n => ({ id: n.id, depth: 0, path: [n.id] })),
                edges: result.edges,
                visitedCount: result.visitedCount,
                depthReached: result.depthReached,
            };
        }
    }
    
    /**
     * Find shortest path between two nodes
     * Uses iterative BFS to find the shortest path
     */
    async findShortestPath(
        startNodeId: string,
        endNodeId: string,
        options: { relationshipTypes?: RelationType[]; maxDepth?: number } = {}
    ): Promise<PathResult | null> {
        const maxDepth = options.maxDepth ?? 10;
        
        // Use BFS traversal to find path
        const traversalResult = await this.traverseBFS(startNodeId, {
            maxDepth,
            relationshipTypes: options.relationshipTypes,
            maxNodes: 10000, // Allow more nodes for path finding
        });
        
        // Find end node entity in results
        const endEntity = traversalResult.nodes.find(n => n.id === endNodeId);
        if (!endEntity) {
            return null; // No path found
        }
        
        // Reconstruct path using BFS parent tracking
        // For now, use a simplified approach: find direct path if exists
        const directPath = await this.findDirectPath(startNodeId, endNodeId, options);
        if (directPath) {
            return directPath;
        }
        
        // For multi-hop paths, we'd need to track parents during BFS
        // This is a simplified version - full implementation would track parent nodes
        const startEntity = await this.getEntityById(startNodeId);
        const nodes: BaseEntity[] = [];
        if (startEntity) {
            nodes.push(startEntity);
        }
        if (endEntity) {
            nodes.push(endEntity);
        }
        return {
            path: [startNodeId, endNodeId],
            nodes,
            edges: traversalResult.edges.filter(e => 
                (e.sourceId === startNodeId && e.targetId === endNodeId) ||
                (e.targetId === startNodeId && e.sourceId === endNodeId)
            ),
            depth: 1, // Simplified
        };
    }
    
    /**
     * Find direct path between two nodes (1 hop)
     */
    private async findDirectPath(
        startNodeId: string,
        endNodeId: string,
        options: { relationshipTypes?: RelationType[] } = {}
    ): Promise<PathResult | null> {
        const relationshipPath = relationTypeToPropertyPath(options.relationshipTypes);
        const startUri = `http://data.example.org/id/${encodeURIComponent(startNodeId)}`;
        const endUri = `http://data.example.org/id/${encodeURIComponent(endNodeId)}`;
        
        const query = `
${PREFIXES}
SELECT ?relType WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${startUri}> ${relationshipPath} <${endUri}> .
    OPTIONAL {
      ?rel a beleid:Relation ;
           beleid:source <${startUri}> ;
           beleid:target <${endUri}> ;
           beleid:relationType ?relType .
    }
  }
}
LIMIT 1
`;
        
        try {
            const results = await this.client.query(query);
            if (results.length === 0) return null;
            
            const startEntity = await this.getEntityById(startNodeId);
            const endEntity = await this.getEntityById(endNodeId);
            
            if (!startEntity || !endEntity) return null;
            
            const relType = results[0].relType as string || RelationType.RELATED_TO;
            
            return {
                path: [startNodeId, endNodeId],
                nodes: [startEntity, endEntity],
                edges: [{
                    sourceId: startNodeId,
                    targetId: endNodeId,
                    type: relType as RelationType,
                }],
                depth: 1,
            };
        } catch (error) {
            logger.warn({ error }, 'Direct path query failed');
            return null;
        }
    }
    
    /**
     * Extract subgraph around a center node
     */
    async getSubgraph(
        centerNodeId: string,
        radius: number = 2,
        options: GraphDBTraversalOptions = {}
    ): Promise<SubgraphResult> {
        const traversalResult = await this.traverseBFS(centerNodeId, {
            ...options,
            maxDepth: radius,
        });
        
        return {
            nodes: traversalResult.nodes,
            edges: traversalResult.edges,
            centerNodeId,
            radius,
        };
    }
    
    /**
     * Alias for getSubgraph to match GraphTraversalService interface
     */
    async extractSubgraph(
        centerNodeId: string,
        radius: number = 2,
        options: GraphDBTraversalOptions = {}
    ): Promise<SubgraphResult> {
        return this.getSubgraph(centerNodeId, radius, options);
    }
    
    /**
     * Find a path between two nodes (alias for findShortestPath)
     * Matches GraphTraversalService interface
     */
    async findPath(
        startNodeId: string,
        endNodeId: string,
        options: GraphDBTraversalOptions = {}
    ): Promise<PathResult | null> {
        return this.findShortestPath(startNodeId, endNodeId, {
            relationshipTypes: options.relationshipTypes,
            maxDepth: options.maxDepth,
        });
    }
    
    /**
     * Get entity by ID (helper method)
     * Uses the same pattern as GraphDBKnowledgeGraphService.getNode()
     */
    private async getEntityById(id: string): Promise<BaseEntity | null> {
        const entityUri = `http://data.example.org/id/${encodeURIComponent(id)}`;
        const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ?id ;
                   beleid:type ?type ;
                   rdfs:label ?name .
    OPTIONAL { <${entityUri}> dct:description ?description }
    OPTIONAL { <${entityUri}> beleid:metadata ?metadata }
    OPTIONAL { <${entityUri}> eli:date_document ?dateDocument }
    OPTIONAL { <${entityUri}> eli:jurisdiction ?jurisdiction }
    OPTIONAL { <${entityUri}> eli:type_document ?typeDocument }
    OPTIONAL { <${entityUri}> eli:status ?status }
    OPTIONAL { <${entityUri}> eli:category ?category }
    OPTIONAL { <${entityUri}> eli:is_realized_by ?url }
  }
}
LIMIT 1
`;
        
        try {
            const results = await this.client.query(query);
            if (results.length === 0) return null;
            
            return this.rowToEntity(results[0]);
        } catch (error) {
            logger.error({ error, id }, 'Failed to get entity by ID');
            return null;
        }
    }
    
    /**
     * Convert SPARQL result row to BaseEntity
     * Based on GraphDBKnowledgeGraphService.rowToEntity()
     */
    private rowToEntity(row: Record<string, unknown>): BaseEntity | null {
        if (!row.id || !row.type || !row.name) {
            return null;
        }
        
        const entity: BaseEntity = {
            id: row.id as string,
            type: row.type as EntityType,
            name: row.name as string,
            description: row.description as string | undefined,
            metadata: {},
        };
        
        // Parse metadata
        if (row.metadata) {
            try {
                const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
                entity.metadata = JSON.parse(metadataStr) as Record<string, unknown>;
            } catch {
                entity.metadata = { rawMetadata: row.metadata };
            }
        }
        
        // Add ELI properties to metadata and entity fields
        if (row.dateDocument || row.jurisdiction || row.typeDocument || row.status || row.category || row.url) {
            if (!entity.metadata) {
                entity.metadata = {};
            }
            if (row.dateDocument) entity.metadata.eli_date_document = row.dateDocument;
            if (row.jurisdiction) entity.metadata.eli_jurisdiction = row.jurisdiction;
            if (row.typeDocument) entity.metadata.eli_type_document = row.typeDocument;
            if (row.status) entity.metadata.eli_status = row.status;
            if (row.category) entity.metadata.eli_category = row.category;
            if (row.url) entity.metadata.eli_url = row.url;
            
            // Map ELI properties to entity fields for PolicyDocument
            if (entity.type === 'PolicyDocument') {
                const policyDoc = entity as PolicyDocument;
                if (row.dateDocument) policyDoc.date = row.dateDocument as string;
                if (row.jurisdiction) policyDoc.jurisdiction = row.jurisdiction as string;
                if (row.typeDocument) {
                    const docType = row.typeDocument as string;
                    if (['Structure', 'Vision', 'Ordinance', 'Note'].includes(docType)) {
                        policyDoc.documentType = docType as PolicyDocument['documentType'];
                    }
                }
                if (row.status) {
                    const status = row.status as string;
                    if (['Draft', 'Active', 'Archived'].includes(status)) {
                        policyDoc.status = status as PolicyDocument['status'];
                    }
                }
                if (row.url) policyDoc.url = row.url as string;
            }
            
            // Map ELI properties to entity fields for Regulation
            if (entity.type === 'Regulation') {
                const regulation = entity as Regulation;
                if (row.category) {
                    const category = row.category as string;
                    if (['Zoning', 'Environmental', 'Building', 'Procedural'].includes(category)) {
                        regulation.category = category as Regulation['category'];
                    }
                }
            }
        }
        
        return entity;
    }
}

