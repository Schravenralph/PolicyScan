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

import * as dagre from 'dagre';
import type { Node, Edge } from 'reactflow';
import type { MetaGraphResponse, ClusterNode } from '../services/api';
import type { NavigationGraphResponse, NavigationNode } from '../services/api';
import type { LayoutAlgorithm } from '../components/LayoutSelector';
import { logError } from './errorHandler';

/**
 * Truncate summary text for display in tooltips
 * 
 * @param summary - Summary text to truncate
 * @param maxLength - Maximum length (default: 200)
 * @returns Truncated summary with ellipsis if needed
 */
export function truncateSummary(summary: string | undefined, maxLength: number = 200): string {
    if (!summary) return '';
    if (summary.length <= maxLength) return summary;
    return summary.substring(0, maxLength).trim() + '...';
}

/**
 * Create a ReactFlow node from a cluster node
 */
export function createNode(id: string, cluster: ClusterNode, x: number, y: number): Node {
    return {
        id,
        data: {
            label: `${cluster.label}\n(${cluster.nodeCount} nodes)`,
            isCluster: true,
            clusterId: id
        },
        position: { x, y },
        style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: '3px solid #5a67d8',
            borderRadius: '12px',
            padding: '20px',
            fontSize: '14px',
            fontWeight: 'bold',
            width: 200,
            color: 'white',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            textAlign: 'center'
        },
    };
}

/**
 * Render meta graph (clustered view)
 */
export function renderMetaGraph(
    data: MetaGraphResponse,
    layout: LayoutAlgorithm,
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
    setIsLoading: (loading: boolean) => void,
    fitView: (options?: { padding?: number; duration?: number }) => void,
    createNodeFn: (id: string, cluster: ClusterNode, x: number, y: number) => Node
): void {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    
    // Guard against undefined/null data
    if (!data || !data.clusters || typeof data.clusters !== 'object') {
        logError(new Error('Invalid graph data structure'), 'render-meta-graph');
        setIsLoading(false);
        return;
    }
    
    const clusterKeys = Object.keys(data.clusters);
    
    // Handle case where nodes exist but are filtered out by minClusterSize
    // Note: This should be rare now since loadMetaGraph automatically retries with minClusterSize: 1
    if (data.totalNodes > 0 && clusterKeys.length === 0) {
        // Only log in development to avoid console noise in production
        if (import.meta.env.DEV) {
            console.debug(`Graph has ${data.totalNodes} nodes but no clusters (filtered by minClusterSize). This may indicate the graph needs more nodes to form clusters.`);
        }
        // Still render empty graph - the UI will show the stats indicating nodes exist
    }

    // Create edges first
    if (data.edges) {
        data.edges.forEach((edge: { source: string; target: string; weight: number }) => {
            // Only add edges if both source and target exist in current clusters
            if (data.clusters[edge.source] && data.clusters[edge.target]) {
                flowEdges.push({
                    id: `e-${edge.source}-${edge.target}`,
                    source: edge.source,
                    target: edge.target,
                    type: 'default',
                    animated: true,
                    style: {
                        stroke: '#94a3b8',
                        strokeWidth: Math.min(Math.max(1, Math.log(edge.weight)), 5),
                        opacity: 0.6
                    },
                    label: edge.weight > 5 ? `${edge.weight}` : undefined,
                });
            }
        });
    }

    if (layout === 'dagre') {
        // Dagre Layout (Hierarchical)
        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: 'TB',
            nodesep: 100,
            ranksep: 150,
            marginx: 50,
            marginy: 50
        });
        g.setDefaultEdgeLabel(() => ({}));

        clusterKeys.forEach(key => {
            g.setNode(key, { width: 220, height: 100 });
        });

        // Add edges to dagre for better layout
        flowEdges.forEach(edge => {
            g.setEdge(edge.source, edge.target);
        });

        dagre.layout(g);

        clusterKeys.forEach(key => {
            const cluster = data.clusters[key];
            const nodeWithPos = g.node(key);

            flowNodes.push(createNodeFn(key, cluster, nodeWithPos.x, nodeWithPos.y));
        });
    } else if (layout === 'circular') {
        // Improved Circular Layout
        const nodeWidth = 220;
        const circumference = clusterKeys.length * (nodeWidth + 50);
        const radius = Math.max(400, circumference / (2 * Math.PI));
        const centerX = 600;
        const centerY = 400;

        clusterKeys.forEach((key, index) => {
            const cluster = data.clusters[key];
            const angle = (index / clusterKeys.length) * 2 * Math.PI;
            const x = Math.cos(angle) * radius + centerX;
            const y = Math.sin(angle) * radius + centerY;

            flowNodes.push(createNodeFn(key, cluster, x, y));
        });
    } else if (layout === 'force') {
        // Simple Force Simulation (Mock for now, or use d3-force if installed)
        // Fallback to random/grid for now until d3 is added
        const cols = Math.ceil(Math.sqrt(clusterKeys.length));
        const spacingX = 300;
        const spacingY = 200;

        clusterKeys.forEach((key, index) => {
            const cluster = data.clusters[key];
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * spacingX + 100;
            const y = row * spacingY + 100;

            flowNodes.push(createNodeFn(key, cluster, x, y));
        });
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsLoading(false);

    // Auto-fit view
    setTimeout(() => {
        fitView({ padding: 0.2, duration: 500 });
    }, 100);
}

/**
 * Render navigation graph (connected/all/clustered modes)
 */
export function renderNavigationGraph(
    data: NavigationGraphResponse,
    layout: LayoutAlgorithm,
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
    setIsLoading: (loading: boolean) => void,
    fitView: (options?: { padding?: number; duration?: number }) => void,
    maxNodes?: number
): void {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    
    const nodeMap = new Map<string, NavigationNode>();
    let nodeUrls = Object.keys(data.nodes);
    
    // Filter to top N nodes by lastVisited if maxNodes is specified
    if (maxNodes !== undefined && maxNodes > 0 && nodeUrls.length > maxNodes) {
        // Sort nodes by lastVisited (most recent first), then take top N
        const nodesWithTimestamps = nodeUrls.map(url => ({
            url,
            node: data.nodes[url],
            lastVisited: data.nodes[url].lastVisited ? new Date(data.nodes[url].lastVisited).getTime() : 0
        }));
        
        nodesWithTimestamps.sort((a, b) => b.lastVisited - a.lastVisited);
        nodeUrls = nodesWithTimestamps.slice(0, maxNodes).map(item => item.url);
    }
    
    // Create nodes
    nodeUrls.forEach((url, index) => {
        const node = data.nodes[url];
        nodeMap.set(url, node);
        
        // Calculate position based on layout
        let x = 0;
        let y = 0;
        
        if (layout === 'dagre') {
            // Will be positioned by dagre
            x = 0;
            y = 0;
        } else if (layout === 'circular') {
            const radius = Math.max(300, nodeUrls.length * 20);
            const angle = (index / nodeUrls.length) * 2 * Math.PI;
            x = Math.cos(angle) * radius + 400;
            y = Math.sin(angle) * radius + 300;
        } else {
            // Grid layout for 'all' mode, force for others
            const cols = Math.ceil(Math.sqrt(nodeUrls.length));
            const row = Math.floor(index / cols);
            const col = index % cols;
            x = col * 250 + 100;
            y = row * 150 + 100;
        }
        
        flowNodes.push({
            id: url,
            data: {
                label: node.title || url.split('/').pop() || url,
                url: url,
                type: node.type,
                summary: node.summary,
                title: node.title,
            },
            position: { x, y },
            style: {
                background: node.type === 'document' ? '#f59e0b' : node.type === 'section' ? '#8b5cf6' : '#3b82f6',
                color: 'white',
                border: '2px solid #1e40af',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                width: 180,
                cursor: 'pointer',
            },
        });
    });
    
    // Create edges - only include edges between filtered nodes
    const filteredNodeUrls = new Set(nodeUrls);
    nodeUrls.forEach(url => {
        const node = data.nodes[url];
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach((childUrl: string) => {
                // Only add edge if both source and target are in filtered nodes
                if (filteredNodeUrls.has(childUrl)) {
                    flowEdges.push({
                        id: `e-${url}-${childUrl}`,
                        source: url,
                        target: childUrl,
                        type: 'default',
                        animated: true,
                        style: {
                            stroke: '#94a3b8',
                            strokeWidth: 2,
                        },
                    });
                }
            });
        }
    });
    
    // Apply dagre layout if selected
    if (layout === 'dagre' && flowNodes.length > 0) {
        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: 'TB',
            nodesep: 100,
            ranksep: 150,
            marginx: 50,
            marginy: 50
        });
        g.setDefaultEdgeLabel(() => ({}));
        
        flowNodes.forEach(node => {
            g.setNode(node.id, { width: 180, height: 60 });
        });
        
        flowEdges.forEach(edge => {
            g.setEdge(edge.source, edge.target);
        });
        
        dagre.layout(g);
        
        flowNodes.forEach(node => {
            const nodeWithPos = g.node(node.id);
            if (nodeWithPos) {
                node.position = { x: nodeWithPos.x, y: nodeWithPos.y };
            }
        });
    }
    
    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsLoading(false);
    
    // Auto-fit view
    setTimeout(() => {
        fitView({ padding: 0.2, duration: 500 });
    }, 100);
}
