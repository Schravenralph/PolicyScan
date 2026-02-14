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
export declare class SubgraphApiService extends BaseApiService {
    getSubgraphs(options?: {
        limit?: number;
        skip?: number;
        status?: string;
    }): Promise<{
        subgraphs: Subgraph[];
        total: number;
    }>;
    getCurrentSubgraph(): Promise<Subgraph>;
    getSubgraph(id: string): Promise<Subgraph>;
    getSubgraphNodes(id: string): Promise<{
        subgraphId: string;
        name: string;
        nodes: Array<{
            url: string;
            exists: boolean;
            title?: string;
            type?: string;
            filePath?: string;
            childCount?: number;
            status: "approved" | "rejected" | "pending";
        }>;
        metadata: SubgraphMetadata;
    }>;
    createSubgraph(data: {
        name: string;
        description?: string;
        workflowId?: string;
        runId?: string;
        queryId?: string;
        includedNodes?: string[];
        rootUrl?: string;
        maxDepth?: number;
    }): Promise<Subgraph>;
    createSubgraphFromGraph(data: {
        name: string;
        description?: string;
        startNode?: string;
        maxDepth?: number;
        maxNodes?: number;
        urlPattern?: string;
        queryId?: string;
    }): Promise<{
        subgraph: Subgraph;
        metadata: {
            totalNodesInGraph: number;
            nodesSelected: number;
            startNode: string;
        };
    }>;
    updateSubgraph(id: string, data: {
        name?: string;
        description?: string;
        status?: string;
    }): Promise<Subgraph>;
    addNodesToSubgraph(id: string, urls: string[]): Promise<Subgraph>;
    removeNodesFromSubgraph(id: string, urls: string[]): Promise<Subgraph>;
    approveEndpoint(subgraphId: string, endpoint: {
        url: string;
        title: string;
        type?: string;
    }): Promise<Subgraph>;
    rejectEndpoint(subgraphId: string, endpoint: {
        url: string;
        title: string;
        reason?: string;
    }): Promise<Subgraph>;
    resetEndpoint(subgraphId: string, url: string): Promise<Subgraph>;
    activateSubgraph(id: string): Promise<Subgraph>;
    archiveSubgraph(id: string): Promise<Subgraph>;
    deleteSubgraph(id: string): Promise<{
        message: string;
    }>;
    getSubgraphsByQuery(queryId: string): Promise<Subgraph[]>;
}
