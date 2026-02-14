/**
 * Scraper Graph Manager
 * 
 * Manages graph versioning, inheritance, and merging for scrapers.
 * Similar to git branches - each scraper can have its own graph "branch"
 * that inherits from parent scrapers and can be merged with conflict resolution.
 */

import { Driver } from 'neo4j-driver';
import { NavigationGraph, NavigationNode, NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GraphVersion {
    scraperName: string;
    parentScraperName?: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
    edgeCount: number;
}

export interface GraphMergeConflict {
    nodeUrl: string;
    conflictType: 'node_property' | 'node_children' | 'node_exists';
    parentValue: unknown;
    childValue: unknown;
    resolution?: 'parent' | 'child' | 'merge' | 'custom';
    customValue?: unknown;
}

export interface GraphMergeResult {
    merged: boolean;
    conflicts: GraphMergeConflict[];
    resolvedConflicts: number;
    addedNodes: number;
    updatedNodes: number;
    skippedNodes: number;
}

/**
 * Manages graph objects for scrapers with versioning and inheritance
 */
export class ScraperGraphManager {
    private graphsDir: string;
    private versionsFile: string;
    private driver: Driver;

    constructor(driver: Driver, graphsDir?: string) {
        this.driver = driver;
        this.graphsDir = graphsDir || path.join(process.cwd(), 'data', 'scraper-graphs');
        this.versionsFile = path.join(this.graphsDir, 'versions.json');
    }

    /**
     * Initialize the graph manager (create directories, load versions)
     */
    async initialize(): Promise<void> {
        await fs.mkdir(this.graphsDir, { recursive: true });
        
        // Create versions file if it doesn't exist
        try {
            await fs.access(this.versionsFile);
        } catch {
            await fs.writeFile(this.versionsFile, JSON.stringify({ versions: [] }, null, 2));
        }
    }

    /**
     * Get the graph file path for a scraper
     */
    private getGraphFilePath(scraperName: string): string {
        const sanitizedName = this.sanitizeScraperName(scraperName);
        return path.join(this.graphsDir, `${sanitizedName}.json`);
    }

    /**
     * Sanitize scraper name for use in file paths
     */
    private sanitizeScraperName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toLowerCase();
    }

    /**
     * Get all graph versions
     */
    async getVersions(): Promise<GraphVersion[]> {
        try {
            const content = await fs.readFile(this.versionsFile, 'utf-8');
            const data = JSON.parse(content);
            return data.versions || [];
        } catch {
            return [];
        }
    }

    /**
     * Get version info for a specific scraper
     */
    async getVersion(scraperName: string): Promise<GraphVersion | null> {
        const versions = await this.getVersions();
        return versions.find(v => v.scraperName === scraperName) || null;
    }

    /**
     * Save version metadata
     */
    private async saveVersion(version: GraphVersion): Promise<void> {
        const versions = await this.getVersions();
        const index = versions.findIndex(v => v.scraperName === version.scraperName);
        
        if (index >= 0) {
            versions[index] = version;
        } else {
            versions.push(version);
        }

        await fs.writeFile(this.versionsFile, JSON.stringify({ versions }, null, 2));
    }

    /**
     * Export graph from Neo4j to JSON file for a scraper
     */
    async exportGraphToFile(scraperName: string, graph: NavigationGraph): Promise<void> {
        await this.initialize();

        const session = this.driver.session();
        try {
            // Get all nodes from Neo4j (filter by scraperName if it exists, otherwise get all)
            const nodesResult = await session.run(`
                MATCH (n:NavigationNode)
                WHERE n.scraperName = $scraperName OR (n.scraperName IS NULL AND $includeUnassigned = true)
                RETURN n, n.url as url
            `, { scraperName, includeUnassigned: true });

            const nodes: { [url: string]: NavigationNode } = {};
            // Access rootUrl through the graph instance
            const rootUrl = (graph as unknown as { rootUrl?: string }).rootUrl || '';

            for (const record of nodesResult.records) {
                const nodeRecord = record.get('n');
                const nodeProps = nodeRecord.properties || nodeRecord;
                const url = record.get('url');
                
                // Get children relationships
                const childrenResult = await session.run(`
                    MATCH (n:NavigationNode {url: $url})-[:LINKS_TO]->(child:NavigationNode)
                    RETURN child.url as childUrl
                `, { url });

                const children = childrenResult.records.map(r => r.get('childUrl'));

                nodes[url] = {
                    url: nodeProps.url || url,
                    type: nodeProps.type || 'page',
                    title: nodeProps.title,
                    filePath: nodeProps.filePath,
                    xpaths: nodeProps.xpaths,
                    children: children,
                    lastVisited: nodeProps.lastVisited,
                    content: nodeProps.content,
                    embedding: nodeProps.embedding || nodeProps.vector,
                    uri: nodeProps.uri,
                    schemaType: nodeProps.schemaType,
                    sourceUrl: nodeProps.sourceUrl || nodeProps.url || url
                };
            }

            const graphData: NavigationGraphData = {
                nodes,
                rootUrl
            };

            const filePath = this.getGraphFilePath(scraperName);
            await fs.writeFile(filePath, JSON.stringify(graphData, null, 2));

            // Update version info
            const version: GraphVersion = {
                scraperName,
                version: new Date().toISOString(),
                createdAt: (await this.getVersion(scraperName))?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                nodeCount: Object.keys(nodes).length,
                edgeCount: Object.values(nodes).reduce((sum, n) => sum + n.children.length, 0)
            };

            await this.saveVersion(version);
        } finally {
            await session.close();
        }
    }

    /**
     * Load graph from JSON file for a scraper
     */
    async loadGraphFromFile(scraperName: string): Promise<NavigationGraphData | null> {
        const filePath = this.getGraphFilePath(scraperName);
        
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as NavigationGraphData;
        } catch {
            return null;
        }
    }

    /**
     * Get parent scraper name from class hierarchy
     */
    getParentScraperName(scraperClass: new () => unknown): string | null {
        // Get the parent class name
        const parentClass = Object.getPrototypeOf(Object.getPrototypeOf(scraperClass));
        
        if (!parentClass || parentClass.name === 'BaseScraper' || parentClass.name === 'Object') {
            return null;
        }

        // Check if parent is a known scraper class
        const parentName = parentClass.name;
        if (parentName.includes('Scraper') && parentName !== 'BaseScraper') {
            return parentName;
        }

        return null;
    }

    /**
     * Inherit graph from parent scraper
     */
    async inheritFromParent(
        childScraperName: string,
        parentScraperName: string
    ): Promise<NavigationGraphData> {
        const parentGraph = await this.loadGraphFromFile(parentScraperName);
        
        if (!parentGraph) {
            throw new Error(`Parent graph not found for scraper: ${parentScraperName}`);
        }

        // Create a copy of the parent graph
        const inheritedGraph: NavigationGraphData = {
            rootUrl: parentGraph.rootUrl,
            nodes: JSON.parse(JSON.stringify(parentGraph.nodes)) // Deep copy
        };

        // Update version info with parent reference
        const version: GraphVersion = {
            scraperName: childScraperName,
            parentScraperName,
            version: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nodeCount: Object.keys(inheritedGraph.nodes).length,
            edgeCount: Object.values(inheritedGraph.nodes).reduce((sum, n) => sum + n.children.length, 0)
        };

        await this.saveVersion(version);

        // Save the inherited graph
        const filePath = this.getGraphFilePath(childScraperName);
        await fs.writeFile(filePath, JSON.stringify(inheritedGraph, null, 2));

        return inheritedGraph;
    }

    /**
     * Merge child graph with parent graph (like git merge)
     */
    async mergeGraphs(
        childScraperName: string,
        parentScraperName: string,
        conflictResolution: 'parent' | 'child' | 'merge' | 'ask' = 'merge'
    ): Promise<GraphMergeResult> {
        const childGraph = await this.loadGraphFromFile(childScraperName);
        const parentGraph = await this.loadGraphFromFile(parentScraperName);

        if (!childGraph) {
            throw new Error(`Child graph not found: ${childScraperName}`);
        }
        if (!parentGraph) {
            throw new Error(`Parent graph not found: ${parentScraperName}`);
        }

        const conflicts: GraphMergeConflict[] = [];
        const mergedNodes: { [url: string]: NavigationNode } = {};
        let addedNodes = 0;
        let updatedNodes = 0;
        let skippedNodes = 0;

        // Start with parent nodes
        for (const [url, parentNode] of Object.entries(parentGraph.nodes)) {
            mergedNodes[url] = JSON.parse(JSON.stringify(parentNode));
        }

        // Merge child nodes
        for (const [url, childNode] of Object.entries(childGraph.nodes)) {
            const parentNode = mergedNodes[url];

            if (!parentNode) {
                // New node from child - add it
                mergedNodes[url] = JSON.parse(JSON.stringify(childNode));
                addedNodes++;
            } else {
                // Node exists in both - check for conflicts
                const nodeConflicts = this.detectNodeConflicts(url, parentNode, childNode);
                
                if (nodeConflicts.length > 0) {
                    conflicts.push(...nodeConflicts);

                    // Resolve conflicts based on strategy
                    if (conflictResolution === 'parent') {
                        // Keep parent version
                        skippedNodes++;
                        continue;
                    } else if (conflictResolution === 'child') {
                        // Keep child version
                        mergedNodes[url] = JSON.parse(JSON.stringify(childNode));
                        updatedNodes++;
                    } else if (conflictResolution === 'merge') {
                        // Merge properties intelligently
                        mergedNodes[url] = this.mergeNodeProperties(parentNode, childNode);
                        updatedNodes++;
                    }
                } else {
                    // No conflicts - merge properties
                    mergedNodes[url] = this.mergeNodeProperties(parentNode, childNode);
                    updatedNodes++;
                }
            }
        }

        // Save merged graph
        const mergedGraph: NavigationGraphData = {
            rootUrl: childGraph.rootUrl || parentGraph.rootUrl,
            nodes: mergedNodes
        };

        const filePath = this.getGraphFilePath(childScraperName);
        await fs.writeFile(filePath, JSON.stringify(mergedGraph, null, 2));

        // Update version
        const version = await this.getVersion(childScraperName);
        if (version) {
            version.updatedAt = new Date().toISOString();
            version.nodeCount = Object.keys(mergedNodes).length;
            version.edgeCount = Object.values(mergedNodes).reduce((sum, n) => sum + n.children.length, 0);
            await this.saveVersion(version);
        }

        return {
            merged: conflicts.length === 0 || conflictResolution !== 'ask',
            conflicts,
            resolvedConflicts: conflicts.filter(c => c.resolution).length,
            addedNodes,
            updatedNodes,
            skippedNodes
        };
    }

    /**
     * Detect conflicts between parent and child nodes
     */
    private detectNodeConflicts(
        url: string,
        parentNode: NavigationNode,
        childNode: NavigationNode
    ): GraphMergeConflict[] {
        const conflicts: GraphMergeConflict[] = [];

        // Check for property conflicts
        const propertiesToCheck: (keyof NavigationNode)[] = [
            'title', 'type', 'filePath', 'uri', 'schemaType', 'sourceUrl'
        ];

        for (const prop of propertiesToCheck) {
            if (parentNode[prop] !== undefined && childNode[prop] !== undefined) {
                if (JSON.stringify(parentNode[prop]) !== JSON.stringify(childNode[prop])) {
                    conflicts.push({
                        nodeUrl: url,
                        conflictType: 'node_property',
                        parentValue: parentNode[prop],
                        childValue: childNode[prop]
                    });
                }
            }
        }

        // Check for children conflicts (different child sets)
        const parentChildren = new Set(parentNode.children || []);
        const childChildren = new Set(childNode.children || []);
        
        if (parentChildren.size !== childChildren.size ||
            ![...parentChildren].every(c => childChildren.has(c))) {
            conflicts.push({
                nodeUrl: url,
                conflictType: 'node_children',
                parentValue: Array.from(parentChildren),
                childValue: Array.from(childChildren)
            });
        }

        return conflicts;
    }

    /**
     * Merge node properties intelligently
     */
    private mergeNodeProperties(
        parentNode: NavigationNode,
        childNode: NavigationNode
    ): NavigationNode {
        const merged: NavigationNode = {
            ...parentNode,
            ...childNode,
            // Merge children (union of both sets)
            children: Array.from(new Set([
                ...(parentNode.children || []),
                ...(childNode.children || [])
            ]))
        };

        // Prefer child values for certain properties if they exist
        if (childNode.title) merged.title = childNode.title;
        if (childNode.filePath) merged.filePath = childNode.filePath;
        if (childNode.content) merged.content = childNode.content;
        const embedding = childNode.embedding || (childNode as any).vector || parentNode.embedding || (parentNode as any).vector;
        if (embedding) merged.embedding = embedding;
        if (childNode.lastVisited) {
            // Use the more recent timestamp
            const parentTime = parentNode.lastVisited ? new Date(parentNode.lastVisited).getTime() : 0;
            const childTime = new Date(childNode.lastVisited).getTime();
            merged.lastVisited = childTime > parentTime ? childNode.lastVisited : parentNode.lastVisited;
        }

        return merged;
    }

    /**
     * Resolve a specific conflict
     */
    async resolveConflict(
        scraperName: string,
        conflict: GraphMergeConflict,
        resolution: 'parent' | 'child' | 'merge' | 'custom',
        customValue?: unknown
    ): Promise<void> {
        conflict.resolution = resolution;
        if (customValue !== undefined) {
            conflict.customValue = customValue;
        }

        // Reload graph and apply resolution
        const graph = await this.loadGraphFromFile(scraperName);
        if (!graph) {
            throw new Error(`Graph not found: ${scraperName}`);
        }

        const node = graph.nodes[conflict.nodeUrl];
        if (!node) {
            return;
        }

        if (resolution === 'parent') {
            // Revert to parent value (would need parent graph loaded)
            // This is a simplified version - full implementation would track parent values
        } else if (resolution === 'child') {
            // Keep child value (already in graph)
        } else if (resolution === 'merge') {
            // Merge was already done
        } else if (resolution === 'custom' && customValue !== undefined) {
            // Apply custom value
            if (conflict.conflictType === 'node_property') {
                const parentValue = conflict.parentValue as Record<string, unknown> | null;
                const childValue = conflict.childValue as Record<string, unknown> | null;
                const propName = (parentValue && Object.keys(parentValue)[0]) || (childValue && Object.keys(childValue)[0]);
                if (propName) {
                    (node as unknown as Record<string, unknown>)[propName] = customValue;
                }
            } else if (conflict.conflictType === 'node_children') {
                if (Array.isArray(customValue)) {
                    node.children = customValue as string[];
                }
            }
        }

        // Save updated graph
        const filePath = this.getGraphFilePath(scraperName);
        await fs.writeFile(filePath, JSON.stringify(graph, null, 2));
    }

    /**
     * Import graph from Neo4j and tag nodes with scraper name
     */
    async importGraphFromNeo4j(
        scraperName: string,
        graph: NavigationGraph
    ): Promise<void> {
        const session = this.driver.session();
        try {
            // Tag all nodes in Neo4j with scraper name (only unassigned nodes)
            await session.run(`
                MATCH (n:NavigationNode)
                WHERE n.scraperName IS NULL
                SET n.scraperName = $scraperName
            `, { scraperName });

            // Export to file
            await this.exportGraphToFile(scraperName, graph);
        } finally {
            await session.close();
        }
    }

    /**
     * Load graph from file and import to Neo4j
     */
    async importGraphToNeo4j(
        scraperName: string,
        graph: NavigationGraph
    ): Promise<void> {
        const graphData = await this.loadGraphFromFile(scraperName);
        if (!graphData) {
            throw new Error(`Graph file not found for scraper: ${scraperName}`);
        }

        // Set root URL if available
        if (graphData.rootUrl) {
            await graph.setRoot(graphData.rootUrl);
        }

        // Import nodes to Neo4j
        for (const [url, node] of Object.entries(graphData.nodes)) {
            // Add scraperName as metadata (NavigationNode doesn't have scraperName property)
            // We'll store it separately in Neo4j
            await graph.addNode(node);
            
            // Tag the node with scraper name in Neo4j
            const session = (graph as unknown as { driver?: Driver }).driver?.session();
            if (!session) {
                throw new Error('Graph driver not available');
            }
            try {
                await session.run(`
                    MATCH (n:NavigationNode {url: $url})
                    SET n.scraperName = $scraperName
                `, { url, scraperName });
            } finally {
                await session.close();
            }
        }
    }
}
