import { BaseApiService } from './BaseApiService';
export interface ClusterNode {
    id: string;
    label: string;
    nodeCount: number;
    children: string[];
    urlPattern?: string;
}
export interface MetaGraphResponse {
    clusters: {
        [key: string]: ClusterNode;
    };
    edges: Array<{
        source: string;
        target: string;
        weight: number;
    }>;
    totalNodes: number;
    totalClusters: number;
    backend?: 'graphdb' | 'neo4j';
}
export interface GraphStreamData {
    runId: string;
    timestamp: string;
    nodes: Array<{
        id: string;
        url: string;
        title: string;
        type: 'page' | 'section' | 'document';
        children: string[];
        lastVisited?: string;
        hasChildren?: boolean;
        childCount?: number;
        score?: number;
        depth?: number;
    }>;
    childNodes?: Array<{
        id: string;
        url: string;
        title: string;
        type: 'page' | 'section' | 'document';
        children: string[];
    }>;
    edges: Array<{
        source: string;
        target: string;
    }>;
    stats: {
        totalNodes: number;
        totalEdges: number;
        displayedNode?: string;
        childCount?: number;
        navigatedCount?: number;
    };
    message?: string;
}
export interface GraphEntity {
    id: string;
    name: string;
    type: string;
    properties?: Record<string, unknown>;
}
export interface GraphEntityResponse {
    entity: GraphEntity;
    relationships: Array<{
        type: string;
        direction: 'incoming' | 'outgoing';
        target: GraphEntity;
    }>;
}
export interface NavigationNode {
    url: string;
    type: 'page' | 'section' | 'document';
    title?: string;
    filePath?: string;
    children: string[];
    lastVisited?: string;
    [key: string]: unknown;
}
export interface NavigationGraphResponse {
    nodes: {
        [url: string]: NavigationNode;
    };
    rootUrl: string;
    mode?: 'connected' | 'all' | 'clustered';
    metadata: {
        totalNodesInGraph: number;
        nodesReturned: number;
        totalEdgesInGraph?: number;
        edgesReturned?: number;
        depthLimit?: number;
        startNode?: string;
        visualizationMode?: 'connected' | 'all' | 'clustered';
        totalClusters?: number;
    };
}
export interface GraphHealthResponse {
    status: 'healthy' | 'warning' | 'critical';
    totalNodes: number;
    totalEdges: number;
    connectivity: {
        hasRoot: boolean;
        isolatedNodes: number;
        connectedNodes: number;
        connectivityRatio: number;
    };
    recommendations: string[];
}
export interface GraphRAGQueryOptions {
    query: string;
    strategy?: 'fact-first' | 'context-first' | 'hybrid';
    maxResults?: number;
    maxHops?: number;
    kgWeight?: number;
    vectorWeight?: number;
    enableExplainability?: boolean;
}
export interface GraphRAGResponse {
    success: boolean;
    facts?: Array<{
        entity: GraphEntity;
        score: number;
        path?: string[];
    }>;
    chunks?: Array<{
        text: string;
        score: number;
        source: string;
    }>;
    explanation?: string;
    metrics?: {
        retrievalTime: number;
        rankingTime: number;
        totalTime: number;
    };
}
/**
 * Graph API service for knowledge graph and navigation graph operations
 */
export declare class GraphApiService extends BaseApiService {
    /**
     * Get navigation graph with optional visualization mode and filters
     */
    getGraph(options?: {
        mode?: 'connected' | 'all' | 'clustered';
        maxNodes?: number;
        maxDepth?: number;
        startNode?: string;
        filters?: {
            documentType?: string | string[];
            publishedAfter?: string;
            publishedBefore?: string;
            publisherAuthority?: string | string[];
            recentlyPublished?: string;
            recentlyVisited?: string;
            lastVisitedAfter?: string;
            lastVisitedBefore?: string;
        };
    }): Promise<NavigationGraphResponse>;
    /**
     * Get meta graph with clustering information
     */
    getMetaGraph(options?: {
        pathDepth?: number;
        minClusterSize?: number;
        strategy?: string;
        groupByDomain?: boolean;
    }): Promise<MetaGraphResponse>;
    /**
     * Get real-time graph stream data for a run
     */
    getGraphStream(runId: string): Promise<GraphStreamData>;
    /**
     * Get entity details from knowledge graph
     */
    getEntity(entityId: string): Promise<GraphEntityResponse>;
    /**
     * Get knowledge graph meta with clustering
     */
    getKnowledgeGraphMeta(options?: {
        strategy?: string;
        minClusterSize?: number;
        groupByDomain?: boolean;
    }): Promise<MetaGraphResponse>;
    /**
     * Get cluster entities with pagination
     */
    getClusterEntities(clusterId: string, options?: {
        strategy?: string;
        minClusterSize?: number;
        groupByDomain?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<{
        entities: GraphEntity[];
        entityCount: number;
    }>;
    /**
     * Check Neo4j Bloom availability and get connection status
     */
    getBloomStatus(): Promise<{
        available: boolean;
        url?: string;
        neo4jConnected?: boolean;
        neo4jUri?: string;
        error?: string;
    }>;
    /**
     * Get navigation graph health status
     */
    getHealth(): Promise<GraphHealthResponse>;
    /**
     * Execute a GraphRAG query
     */
    graphRAGQuery(options: GraphRAGQueryOptions): Promise<GraphRAGResponse>;
}
