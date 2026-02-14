/**
 * Graph Rendering Utilities
 *
 * Helper functions for rendering different graph visualization modes:
 * - Meta graph (clustered)
 * - Connected graph
 * - All nodes (flat)
 * - Clustered graph
 * - Navigation graph
 */
import type { Node, Edge } from 'reactflow';
import type { MetaGraphResponse, ClusterNode } from '../services/api';
import type { NavigationGraphResponse } from '../services/api';
import type { LayoutAlgorithm } from '../components/LayoutSelector';
/**
 * Truncate summary text for display in tooltips
 *
 * @param summary - Summary text to truncate
 * @param maxLength - Maximum length (default: 200)
 * @returns Truncated summary with ellipsis if needed
 */
export declare function truncateSummary(summary: string | undefined, maxLength?: number): string;
/**
 * Create a ReactFlow node from a cluster node
 */
export declare function createNode(id: string, cluster: ClusterNode, x: number, y: number): Node;
/**
 * Render meta graph (clustered view)
 */
export declare function renderMetaGraph(data: MetaGraphResponse, layout: LayoutAlgorithm, setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setIsLoading: (loading: boolean) => void, fitView: (options?: {
    padding?: number;
    duration?: number;
}) => void, createNodeFn: (id: string, cluster: ClusterNode, x: number, y: number) => Node): void;
/**
 * Render navigation graph (connected/all/clustered modes)
 */
export declare function renderNavigationGraph(data: NavigationGraphResponse, layout: LayoutAlgorithm, setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setIsLoading: (loading: boolean) => void, fitView: (options?: {
    padding?: number;
    duration?: number;
}) => void, maxNodes?: number): void;
