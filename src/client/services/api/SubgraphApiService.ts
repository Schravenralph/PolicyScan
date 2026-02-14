import { BaseApiService } from './BaseApiService';

export interface SubgraphMetadata {
  totalNodes: number;
  totalEndpoints: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  rootUrl?: string;
  maxDepth?: number;
}

export interface Subgraph {
  _id?: string;
  id: string;
  name: string;
  description?: string;
  workflowId?: string;
  runId?: string;
  queryId?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived' | 'draft';
  includedNodes: string[];
  excludedNodes: string[];
  approvedEndpoints: Array<{
    url: string;
    title: string;
    type: string;
    approvedAt: string;
    approvedBy?: string;
  }>;
  rejectedEndpoints: Array<{
    url: string;
    title: string;
    reason?: string;
    rejectedAt: string;
    rejectedBy?: string;
  }>;
  metadata?: SubgraphMetadata;
}

/**
 * Subgraph API service
 */
export class SubgraphApiService extends BaseApiService {
  async getSubgraphs(options?: { limit?: number; skip?: number; status?: string }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.skip) params.append('skip', options.skip.toString());
    if (options?.status) params.append('status', options.status);
    const response = await this.request<{ data: Subgraph[]; pagination: { total: number } }>(
      `/subgraphs?${params.toString()}`
    );
    // Transform paginated response to expected format
    return {
      subgraphs: response.data || [],
      total: response.pagination?.total || 0,
    };
  }

  async getCurrentSubgraph() {
    return this.request<Subgraph>('/subgraphs/current');
  }

  async getSubgraph(id: string) {
    return this.request<Subgraph>(`/subgraphs/${id}`);
  }

  async getSubgraphNodes(id: string) {
    return this.request<{
      subgraphId: string;
      name: string;
      nodes: Array<{
        url: string;
        exists: boolean;
        title?: string;
        type?: string;
        filePath?: string;
        childCount?: number;
        status: 'approved' | 'rejected' | 'pending';
      }>;
      metadata: SubgraphMetadata;
    }>(`/subgraphs/${id}/nodes`);
  }

  async createSubgraph(data: {
    name: string;
    description?: string;
    workflowId?: string;
    runId?: string;
    queryId?: string;
    includedNodes?: string[];
    rootUrl?: string;
    maxDepth?: number;
  }) {
    return this.request<Subgraph>('/subgraphs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createSubgraphFromGraph(data: {
    name: string;
    description?: string;
    startNode?: string;
    maxDepth?: number;
    maxNodes?: number;
    urlPattern?: string;
    queryId?: string;
  }) {
    return this.request<{
      subgraph: Subgraph;
      metadata: { totalNodesInGraph: number; nodesSelected: number; startNode: string };
    }>('/subgraphs/from-graph', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubgraph(id: string, data: { name?: string; description?: string; status?: string }) {
    return this.request<Subgraph>(`/subgraphs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async addNodesToSubgraph(id: string, urls: string[]) {
    return this.request<Subgraph>(`/subgraphs/${id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
  }

  async removeNodesFromSubgraph(id: string, urls: string[]) {
    return this.request<Subgraph>(`/subgraphs/${id}/nodes`, {
      method: 'DELETE',
      body: JSON.stringify({ urls }),
    });
  }

  async approveEndpoint(subgraphId: string, endpoint: { url: string; title: string; type?: string }) {
    return this.request<Subgraph>(`/subgraphs/${subgraphId}/endpoints/approve`, {
      method: 'POST',
      body: JSON.stringify(endpoint),
    });
  }

  async rejectEndpoint(subgraphId: string, endpoint: { url: string; title: string; reason?: string }) {
    return this.request<Subgraph>(`/subgraphs/${subgraphId}/endpoints/reject`, {
      method: 'POST',
      body: JSON.stringify(endpoint),
    });
  }

  async resetEndpoint(subgraphId: string, url: string) {
    return this.request<Subgraph>(`/subgraphs/${subgraphId}/endpoints/reset`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async activateSubgraph(id: string) {
    return this.request<Subgraph>(`/subgraphs/${id}/activate`, {
      method: 'POST',
    });
  }

  async archiveSubgraph(id: string) {
    return this.request<Subgraph>(`/subgraphs/${id}/archive`, {
      method: 'POST',
    });
  }

  async deleteSubgraph(id: string) {
    return this.request<{ message: string }>(`/subgraphs/${id}`, {
      method: 'DELETE',
    });
  }

  async getSubgraphsByQuery(queryId: string) {
    return this.request<Subgraph[]>(`/subgraphs/by-query/${queryId}`);
  }
}

