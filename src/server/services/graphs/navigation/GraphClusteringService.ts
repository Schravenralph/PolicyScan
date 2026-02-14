import { NavigationGraph, NavigationNode } from './NavigationGraph.js';
import { logger } from '../../../utils/logger.js';

export interface ClusterNode {
    id: string;
    label: string;
    type: 'cluster';
    level: number;
    nodeCount: number;
    urlPattern: string; // e.g., "iplo.nl/thema/bodem/"
    children: string[]; // URLs of nodes in this cluster
    representativeNode?: string; // Sample node for preview
}

export interface MetaEdge {
    source: string;
    target: string;
    weight: number;
}

export interface MetaGraph {
    clusters: { [id: string]: ClusterNode };
    edges: MetaEdge[];
    totalNodes: number;
    totalClusters: number;
    nodesInClusters: number;
}

export type LayoutAlgorithm = 'grid' | 'force' | 'circular' | 'hierarchical';

export interface NodePosition {
    x: number;
    y: number;
}

export interface VisualizedNode extends ClusterNode {
    position: NodePosition;
}

export interface VisualizationData {
    nodes: VisualizedNode[];
    edges: MetaEdge[];
    totalNodes: number;
    totalClusters: number;
    layout: LayoutAlgorithm;
    bounds: {
        width: number;
        height: number;
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
}

export interface ExportOptions {
    includePositions?: boolean;
    includeMetadata?: boolean;
}

export class GraphClusteringService {
    private graph: NavigationGraph;
    private metaGraphCache: Map<string, MetaGraph> = new Map(); // Cache for meta-graphs

    constructor(graph: NavigationGraph) {
        this.graph = graph;
    }

    /**
     * Invalidate the meta-graph cache
     * Call this when the underlying graph has been modified
     */
    invalidateCache(): void {
        this.metaGraphCache.clear();
        logger.info('[GraphClustering] Cache invalidated');
    }

    /**
     * Create meta-graph by clustering nodes based on URL paths
     * Groups nodes by their URL path segments (e.g., /thema/bodem/, /thema/water/)
     */
    async createMetaGraph(options: {
        pathDepth?: number; // How many URL segments to use for clustering (default: 3)
        minClusterSize?: number; // Minimum nodes per cluster (default: 10)
    } = {}): Promise<MetaGraph> {
        const { pathDepth = 3, minClusterSize = 10 } = options;

        // Check cache first
        const cacheKey = `${pathDepth}-${minClusterSize}`;
        if (this.metaGraphCache.has(cacheKey)) {
            logger.debug({ cacheKey }, 'Returning cached meta-graph');
            return this.metaGraphCache.get(cacheKey)!;
        }

        logger.info({ cacheKey }, 'Computing meta-graph...');
        const startTime = Date.now();

        const allNodes = await this.graph.getAllNodes();
        
        // Ensure allNodes is an array
        if (!Array.isArray(allNodes)) {
            throw new Error(`getAllNodes() must return an array, got ${typeof allNodes}`);
        }
        
        const clusterMap = new Map<string, NavigationNode[]>();

        // Group nodes by URL path prefix
        for (const node of allNodes) {
            const clusterKey = this.extractUrlPrefix(node.url, pathDepth);
            if (!clusterMap.has(clusterKey)) {
                clusterMap.set(clusterKey, []);
            }
            clusterMap.get(clusterKey)!.push(node);
        }

        // Convert to ClusterNode objects and build URL->ClusterID map
        const clusters: { [id: string]: ClusterNode } = {};
        const urlToClusterId = new Map<string, string>();
        let clusterIndex = 0;

        for (const [urlPattern, nodes] of clusterMap.entries()) {
            // Skip small clusters
            if (nodes.length < minClusterSize) {
                continue;
            }

            const clusterId = `cluster_${clusterIndex++}`;
            const label = this.generateClusterLabel(urlPattern, nodes);

            clusters[clusterId] = {
                id: clusterId,
                label,
                type: 'cluster',
                level: pathDepth,
                nodeCount: nodes.length,
                urlPattern,
                children: nodes.map(n => n.url),
                representativeNode: nodes[0]?.url
            };

            // Map all URLs in this cluster to the cluster ID
            nodes.forEach(n => urlToClusterId.set(n.url, clusterId));
        }

        // Calculate edges between clusters
        // Only process nodes that belong to clusters (more efficient than iterating all nodes)
        const edgeMap = new Map<string, number>(); // "sourceId->targetId" => weight
        
        // Create a fast lookup map from URL to node
        const nodeMap = new Map<string, NavigationNode>();
        for (const node of allNodes) {
            nodeMap.set(node.url, node);
        }

        // Only iterate through nodes that belong to clusters
        for (const [url, clusterId] of urlToClusterId.entries()) {
            const node = nodeMap.get(url);
            // Fix: Check that children is an array to prevent runtime errors with corrupted data
            if (!node || !Array.isArray(node.children)) continue;

            for (const childUrl of node.children) {
                const targetClusterId = urlToClusterId.get(childUrl);

                // Only create edges between different clusters
                if (targetClusterId && clusterId !== targetClusterId) {
                    const edgeKey = `${clusterId}->${targetClusterId}`;
                    edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
                }
            }
        }

        // Convert edge map to array
        const edges: MetaEdge[] = [];
        for (const [key, weight] of edgeMap.entries()) {
            // Fix: Validate edge key format to prevent incorrect splits
            const parts = key.split('->');
            if (parts.length !== 2) {
                logger.warn({ edgeKey: key }, 'Invalid edge key format, skipping');
                continue;
            }
            const [source, target] = parts;
            edges.push({ source, target, weight });
        }

        // Calculate nodes in clusters (excluding filtered small clusters)
        const nodesInClusters = Object.values(clusters).reduce((sum, c) => sum + c.nodeCount, 0);
        
        const metaGraph: MetaGraph = {
            clusters,
            edges,
            // totalNodes includes all nodes (for backward compatibility)
            // nodesInClusters is the sum of cluster.nodeCount values (excludes filtered nodes)
            totalNodes: allNodes.length,
            totalClusters: Object.keys(clusters).length,
            nodesInClusters
        };

        // Cache the result
        this.metaGraphCache.set(cacheKey, metaGraph);

        const elapsed = Date.now() - startTime;
        logger.info({ elapsed, clusters: Object.keys(clusters).length, edges: edges.length }, 'Computed meta-graph');

        return metaGraph;
    }

    /**
     * Extract URL prefix for clustering
     * Example: extractUrlPrefix("https://iplo.nl/thema/bodem/regels/", 3) 
     *          returns "iplo.nl/thema/bodem"
     */
    private extractUrlPrefix(url: string, depth: number): string {
        try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname
                .split('/')
                .filter(segment => segment.length > 0);

            const prefix = pathSegments.slice(0, depth).join('/');
            return `${urlObj.hostname}/${prefix}`;
        } catch (_error) {
            return url; // Fallback to full URL if parsing fails
        }
    }

    /**
     * Generate a human-readable label for a cluster
     * Tries to extract meaningful theme names from URLs and titles
     */
    private generateClusterLabel(urlPattern: string, nodes: NavigationNode[]): string {
        // Extract the last meaningful segment from URL pattern
        const segments = urlPattern.split('/').filter(s => s.length > 0);
        const lastSegment = segments[segments.length - 1] || 'Unknown';

        // Capitalize and clean up the segment
        const cleanLabel = lastSegment
            .replace(/-/g, ' ')
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        // Try to use common title prefix if available
        const titles = nodes
            .map(n => n.title)
            .filter(t => t && t.length > 0) as string[];

        if (titles.length > 0) {
            // Find common prefix in titles
            const commonPrefix = this.findCommonPrefix(titles);
            if (commonPrefix.length > 3) {
                return commonPrefix.trim();
            }
        }

        return cleanLabel;
    }

    /**
     * Find common prefix among strings
     */
    private findCommonPrefix(strings: string[]): string {
        if (strings.length === 0) return '';
        if (strings.length === 1) return strings[0];

        let prefix = strings[0];
        for (let i = 1; i < strings.length; i++) {
            while (strings[i].indexOf(prefix) !== 0) {
                prefix = prefix.substring(0, prefix.length - 1);
                if (prefix === '') return '';
            }
        }

        // Remove trailing non-word characters
        return prefix.replace(/[^\w\s]+$/, '');
    }

    /**
     * Get all nodes belonging to a specific cluster
     */
    async getClusterNodes(cluster: ClusterNode): Promise<NavigationNode[]> {
        const nodes: NavigationNode[] = [];
        for (const url of cluster.children) {
            const node = await this.graph.getNode(url);
            if (node) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    /**
     * Get subgraph for a specific cluster (nodes + edges within cluster)
     */
    async getClusterSubgraph(cluster: ClusterNode, options: {
        maxNodes?: number;
        maxDepth?: number;
    } = {}): Promise<{
        nodes: { [url: string]: NavigationNode };
        metadata: {
            clusterLabel: string;
            nodesInCluster: number;
            nodesReturned: number;
        };
    }> {
        const { maxNodes = 500 } = options;

        // Optimized: Fetch cluster nodes directly using getNodes()
        // This is more efficient and correct than using BFS traversal which can wander outside the cluster
        const urlsToFetch = cluster.children.slice(0, maxNodes);

        const nodesList = await this.graph.getNodes(urlsToFetch);
        const nodes: { [url: string]: NavigationNode } = {};

        // Populate nodes map
        for (const node of nodesList) {
            nodes[node.url] = node;
        }

        return {
            nodes,
            metadata: {
                clusterLabel: cluster.label,
                nodesInCluster: cluster.nodeCount,
                nodesReturned: nodesList.length
            }
        };
    }

    /**
     * Generate visualization data with node positions using the specified layout algorithm
     */
    generateVisualizationData(
        metaGraph: MetaGraph,
        options: {
            layout?: LayoutAlgorithm;
            width?: number;
            height?: number;
            nodeSpacing?: number;
            iterations?: number; // For force-directed layout
        } = {}
    ): VisualizationData {
        const {
            layout = 'grid',
            width = 2000,
            height = 1500,
            nodeSpacing = 300,
            iterations = 100
        } = options;

        const clusterIds = Object.keys(metaGraph.clusters);
        const positions = this.calculateLayout(clusterIds, metaGraph.edges, layout, {
            width,
            height,
            nodeSpacing,
            iterations
        });

        // Create visualized nodes with positions
        const visualizedNodes: VisualizedNode[] = clusterIds.map(id => ({
            ...metaGraph.clusters[id],
            position: positions.get(id) || { x: 0, y: 0 }
        }));

        // Calculate bounds
        const nodePositions = Array.from(positions.values());
        const xs = nodePositions.map(p => p.x);
        const ys = nodePositions.map(p => p.y);
        const bounds = {
            width: Math.max(...xs) - Math.min(...xs) + nodeSpacing,
            height: Math.max(...ys) - Math.min(...ys) + nodeSpacing,
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys)
        };

        return {
            nodes: visualizedNodes,
            edges: metaGraph.edges,
            totalNodes: metaGraph.totalNodes,
            totalClusters: metaGraph.totalClusters,
            layout,
            bounds
        };
    }

    /**
     * Calculate node positions using the specified layout algorithm
     */
    private calculateLayout(
        nodeIds: string[],
        edges: MetaEdge[],
        algorithm: LayoutAlgorithm,
        options: {
            width: number;
            height: number;
            nodeSpacing: number;
            iterations: number;
        }
    ): Map<string, NodePosition> {
        switch (algorithm) {
            case 'grid':
                return this.gridLayout(nodeIds, options);
            case 'force':
                return this.forceDirectedLayout(nodeIds, edges, options);
            case 'circular':
                return this.circularLayout(nodeIds, options);
            case 'hierarchical':
                return this.hierarchicalLayout(nodeIds, edges, options);
            default:
                return this.gridLayout(nodeIds, options);
        }
    }

    /**
     * Grid layout: Arrange nodes in a grid pattern
     */
    private gridLayout(
        nodeIds: string[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, NodePosition> {
        const { nodeSpacing } = options;
        const positions = new Map<string, NodePosition>();
        const cols = Math.ceil(Math.sqrt(nodeIds.length));
        const startX = 100;
        const startY = 100;

        nodeIds.forEach((id, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            positions.set(id, {
                x: startX + col * nodeSpacing,
                y: startY + row * nodeSpacing
            });
        });

        return positions;
    }

    /**
     * Force-directed layout: Simulate physical forces between nodes
     */
    private forceDirectedLayout(
        nodeIds: string[],
        edges: MetaEdge[],
        options: { width: number; height: number; nodeSpacing: number; iterations: number }
    ): Map<string, NodePosition> {
        const { width, height, iterations } = options;
        const positions = new Map<string, NodePosition>();
        const velocities = new Map<string, { x: number; y: number }>();

        // Initialize positions randomly in center
        nodeIds.forEach(id => {
            positions.set(id, {
                x: width / 2 + (Math.random() - 0.5) * width * 0.3,
                y: height / 2 + (Math.random() - 0.5) * height * 0.3
            });
            velocities.set(id, { x: 0, y: 0 });
        });

        // Force simulation
        const k = Math.sqrt((width * height) / nodeIds.length); // Optimal distance
        const alpha = 1.0;
        const alphaDecay = 0.0228;
        let currentAlpha = alpha;

        for (let i = 0; i < iterations; i++) {
            // Repulsion force (nodes repel each other)
            for (let j = 0; j < nodeIds.length; j++) {
                const nodeA = nodeIds[j];
                const posA = positions.get(nodeA)!;
                const velA = velocities.get(nodeA)!;

                for (let k = j + 1; k < nodeIds.length; k++) {
                    const nodeB = nodeIds[k];
                    const posB = positions.get(nodeB)!;
                    const velB = velocities.get(nodeB)!;

                    const dx = posB.x - posA.x;
                    const dy = posB.y - posA.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    const force = (k * k) / distance;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    velA.x -= fx * currentAlpha;
                    velA.y -= fy * currentAlpha;
                    velB.x += fx * currentAlpha;
                    velB.y += fy * currentAlpha;
                }
            }

            // Attraction force (edges attract connected nodes)
            edges.forEach(edge => {
                const posA = positions.get(edge.source);
                const posB = positions.get(edge.target);
                if (!posA || !posB) return;

                const velA = velocities.get(edge.source)!;
                const velB = velocities.get(edge.target)!;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                const force = (distance * distance) / k;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                velA.x += fx * currentAlpha;
                velA.y += fy * currentAlpha;
                velB.x -= fx * currentAlpha;
                velB.y -= fy * currentAlpha;
            });

            // Update positions and apply damping
            nodeIds.forEach(id => {
                const pos = positions.get(id)!;
                const vel = velocities.get(id)!;

                pos.x += vel.x * currentAlpha;
                pos.y += vel.y * currentAlpha;

                // Damping
                vel.x *= 0.6;
                vel.y *= 0.6;
            });

            currentAlpha *= (1 - alphaDecay);
        }

        return positions;
    }

    /**
     * Circular layout: Arrange nodes in a circle
     */
    private circularLayout(
        nodeIds: string[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, NodePosition> {
        const { width, height } = options;
        const positions = new Map<string, NodePosition>();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        nodeIds.forEach((id, index) => {
            const angle = (index / nodeIds.length) * 2 * Math.PI;
            positions.set(id, {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            });
        });

        return positions;
    }

    /**
     * Hierarchical layout: Arrange nodes in levels based on graph structure
     */
    private hierarchicalLayout(
        nodeIds: string[],
        edges: MetaEdge[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, NodePosition> {
        const { width, height, nodeSpacing } = options;
        const positions = new Map<string, NodePosition>();

        // Build adjacency map
        const inDegree = new Map<string, number>();
        const outEdges = new Map<string, string[]>();

        nodeIds.forEach(id => {
            inDegree.set(id, 0);
            outEdges.set(id, []);
        });

        edges.forEach(edge => {
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            outEdges.get(edge.source)!.push(edge.target);
        });

        // Assign levels using BFS
        const levels = new Map<string, number>();
        const queue: string[] = [];

        // Start with nodes that have no incoming edges
        nodeIds.forEach(id => {
            if (inDegree.get(id) === 0) {
                levels.set(id, 0);
                queue.push(id);
            }
        });

        // BFS to assign levels
        while (queue.length > 0) {
            const current = queue.shift()!;
            const currentLevel = levels.get(current)!;

            outEdges.get(current)!.forEach(target => {
                if (!levels.has(target)) {
                    levels.set(target, currentLevel + 1);
                    queue.push(target);
                }
            });
        }

        // Group nodes by level
        const nodesByLevel = new Map<number, string[]>();
        nodeIds.forEach(id => {
            const level = levels.get(id) || 0;
            if (!nodesByLevel.has(level)) {
                nodesByLevel.set(level, []);
            }
            nodesByLevel.get(level)!.push(id);
        });

        // Position nodes
        const maxLevel = Math.max(...Array.from(nodesByLevel.keys()));
        const verticalSpacing = height / Math.max(maxLevel + 1, 1);

        nodesByLevel.forEach((nodes, level) => {
            const y = 100 + level * verticalSpacing;
            const totalWidth = nodes.length * nodeSpacing;
            const startX = (width - totalWidth) / 2;

            nodes.forEach((id, index) => {
                positions.set(id, {
                    x: startX + index * nodeSpacing,
                    y
                });
            });
        });

        return positions;
    }

    /**
     * Export meta-graph to JSON format
     */
    exportToJSON(metaGraph: MetaGraph, options: ExportOptions = {}): string {
        const { includePositions = false, includeMetadata = true } = options;

        interface ExportData {
            clusters: { [id: string]: ClusterNode };
            edges: MetaEdge[];
            totalNodes: number;
            totalClusters: number;
            nodesInClusters: number;
            visualization?: {
                nodes: Array<{ id: string; label: string; position: NodePosition }>;
                layout: LayoutAlgorithm;
                bounds: { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number };
            };
            metadata?: {
                exportedAt: string;
                version: string;
            };
        }

        const exportData: ExportData = {
            clusters: metaGraph.clusters,
            edges: metaGraph.edges,
            totalNodes: metaGraph.totalNodes,
            totalClusters: metaGraph.totalClusters,
            nodesInClusters: metaGraph.nodesInClusters
        };

        if (includePositions) {
            const visualization = this.generateVisualizationData(metaGraph);
            exportData.visualization = {
                nodes: visualization.nodes.map(n => ({
                    id: n.id,
                    label: n.label,
                    position: n.position
                })),
                layout: visualization.layout,
                bounds: visualization.bounds
            };
        }

        if (includeMetadata) {
            exportData.metadata = {
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };
        }

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Export meta-graph to GraphML format
     */
    exportToGraphML(metaGraph: MetaGraph, options: ExportOptions = {}): string {
        const { includePositions = false } = options;

        let graphml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        graphml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"\n';
        graphml += '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
        graphml += '         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns\n';
        graphml += '         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">\n';

        if (includePositions) {
            graphml += '  <key id="x" for="node" attr.name="x" attr.type="double"/>\n';
            graphml += '  <key id="y" for="node" attr.name="y" attr.type="double"/>\n';
        }

        graphml += '  <key id="label" for="node" attr.name="label" attr.type="string"/>\n';
        graphml += '  <key id="nodeCount" for="node" attr.name="nodeCount" attr.type="int"/>\n';
        graphml += '  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>\n';

        graphml += '  <graph id="meta-graph" edgedefault="directed">\n';

        // Add nodes
        const positions = includePositions
            ? this.generateVisualizationData(metaGraph).nodes.reduce((map, n) => {
                map.set(n.id, n.position);
                return map;
            }, new Map<string, NodePosition>())
            : null;

        Object.values(metaGraph.clusters).forEach(cluster => {
            graphml += `    <node id="${this.escapeXml(cluster.id)}">\n`;
            graphml += `      <data key="label">${this.escapeXml(cluster.label)}</data>\n`;
            graphml += `      <data key="nodeCount">${cluster.nodeCount}</data>\n`;
            if (positions) {
                const pos = positions.get(cluster.id);
                if (pos) {
                    graphml += `      <data key="x">${pos.x}</data>\n`;
                    graphml += `      <data key="y">${pos.y}</data>\n`;
                }
            }
            graphml += '    </node>\n';
        });

        // Add edges
        metaGraph.edges.forEach(edge => {
            graphml += `    <edge id="e-${this.escapeXml(edge.source)}-${this.escapeXml(edge.target)}" source="${this.escapeXml(edge.source)}" target="${this.escapeXml(edge.target)}">\n`;
            graphml += `      <data key="weight">${edge.weight}</data>\n`;
            graphml += '    </edge>\n';
        });

        graphml += '  </graph>\n';
        graphml += '</graphml>';

        return graphml;
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
