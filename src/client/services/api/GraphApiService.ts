import { BaseApiService } from './BaseApiService';

export interface ClusterNode {
  id: string;
  label: string;
  nodeCount: number;
  children: string[];
  urlPattern?: string;
}

export interface MetaGraphResponse {
  clusters: { [key: string]: ClusterNode };
  edges: Array<{ source: string; target: string; weight: number }>;
  totalNodes: number;
  totalClusters: number;
  backend?: 'graphdb' | 'neo4j'; // Backend type (GraphDB or Neo4j)
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
  edges: Array<{ source: string; target: string }>;
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
  nodes: { [url: string]: NavigationNode };
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
export class GraphApiService extends BaseApiService {
  /**
   * Get navigation graph with optional visualization mode and filters
   */
  async getGraph(options?: {
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
  }): Promise<NavigationGraphResponse> {
    const params = new URLSearchParams();
    if (options?.mode) {
      params.append('mode', options.mode);
    }
    if (options?.maxNodes !== undefined) {
      params.append('maxNodes', options.maxNodes.toString());
    }
    if (options?.maxDepth !== undefined) {
      params.append('maxDepth', options.maxDepth.toString());
    }
    if (options?.startNode) {
      params.append('startNode', options.startNode);
    }
    
    // Add filter parameters
    if (options?.filters) {
      if (options.filters.documentType) {
        const docTypes = Array.isArray(options.filters.documentType) 
          ? options.filters.documentType 
          : [options.filters.documentType];
        docTypes.forEach(docType => params.append('documentType', docType));
      }
      if (options.filters.publisherAuthority) {
        const pubAuths = Array.isArray(options.filters.publisherAuthority)
          ? options.filters.publisherAuthority
          : [options.filters.publisherAuthority];
        pubAuths.forEach(pubAuth => params.append('publisherAuthority', pubAuth));
      }
      if (options.filters.publishedAfter) {
        params.append('publishedAfter', options.filters.publishedAfter);
      }
      if (options.filters.publishedBefore) {
        params.append('publishedBefore', options.filters.publishedBefore);
      }
      if (options.filters.recentlyPublished) {
        params.append('recentlyPublished', options.filters.recentlyPublished);
      }
      if (options.filters.lastVisitedAfter) {
        params.append('lastVisitedAfter', options.filters.lastVisitedAfter);
      }
      if (options.filters.lastVisitedBefore) {
        params.append('lastVisitedBefore', options.filters.lastVisitedBefore);
      }
      if (options.filters.recentlyVisited) {
        params.append('recentlyVisited', options.filters.recentlyVisited);
      }
    }
    
    return this.request<NavigationGraphResponse>(`/graph?${params.toString()}`);
  }

  /**
   * Get meta graph with clustering information
   */
  async getMetaGraph(options?: {
    pathDepth?: number;
    minClusterSize?: number;
    strategy?: string;
    groupByDomain?: boolean;
  }): Promise<MetaGraphResponse> {
    const params = new URLSearchParams();
    if (options?.pathDepth !== undefined) {
      params.append('pathDepth', options.pathDepth.toString());
    }
    if (options?.minClusterSize !== undefined) {
      params.append('minClusterSize', options.minClusterSize.toString());
    }
    if (options?.strategy) {
      params.append('strategy', options.strategy);
    }
    if (options?.groupByDomain !== undefined) {
      params.append('groupByDomain', options.groupByDomain.toString());
    }
    return this.request<MetaGraphResponse>(`/graph/meta?${params.toString()}`);
  }

  /**
   * Get real-time graph stream data for a run
   */
  async getGraphStream(runId: string): Promise<GraphStreamData> {
    return this.request<GraphStreamData>(`/graph/stream/${runId}`);
  }

  /**
   * Get entity details from knowledge graph
   */
  async getEntity(entityId: string): Promise<GraphEntityResponse> {
    return this.request<GraphEntityResponse>(
      `/knowledge-graph/entity/${encodeURIComponent(entityId)}`
    );
  }

  /**
   * Get knowledge graph meta with clustering
   */
  async getKnowledgeGraphMeta(options?: {
    strategy?: string;
    minClusterSize?: number;
    groupByDomain?: boolean;
  }): Promise<MetaGraphResponse> {
    const params = new URLSearchParams();
    if (options?.strategy) {
      params.append('strategy', options.strategy);
    }
    if (options?.minClusterSize !== undefined) {
      params.append('minClusterSize', options.minClusterSize.toString());
    }
    if (options?.groupByDomain !== undefined) {
      params.append('groupByDomain', options.groupByDomain.toString());
    }
    return this.request<MetaGraphResponse>(
      `/knowledge-graph/meta?${params.toString()}`
    );
  }

  /**
   * Get cluster entities with pagination
   */
  async getClusterEntities(
    clusterId: string,
    options?: {
      strategy?: string;
      minClusterSize?: number;
      groupByDomain?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ entities: GraphEntity[]; entityCount: number }> {
    const params = new URLSearchParams();
    if (options?.strategy) {
      params.append('strategy', options.strategy);
    }
    if (options?.minClusterSize !== undefined) {
      params.append('minClusterSize', options.minClusterSize.toString());
    }
    if (options?.groupByDomain !== undefined) {
      params.append('groupByDomain', options.groupByDomain.toString());
    }
    if (options?.limit !== undefined) {
      params.append('limit', options.limit.toString());
    }
    if (options?.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }
    return this.request<{ entities: GraphEntity[]; entityCount: number }>(
      `/knowledge-graph/cluster/${encodeURIComponent(clusterId)}?${params.toString()}`
    );
  }

  /**
   * Check Neo4j Bloom availability and get connection status
   */
  async getBloomStatus(): Promise<{
    available: boolean;
    url?: string;
    neo4jConnected?: boolean;
    neo4jUri?: string;
    error?: string;
  }> {
    return this.request('/neo4j/bloom/status');
  }

  /**
   * Get navigation graph health status
   */
  async getHealth(): Promise<GraphHealthResponse> {
    return this.request<GraphHealthResponse>('/graph/health');
  }

  /**
   * Execute a GraphRAG query
   */
  async graphRAGQuery(options: GraphRAGQueryOptions): Promise<GraphRAGResponse> {
    return this.request<GraphRAGResponse>('/knowledge-graph/graphrag-query', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }
}
