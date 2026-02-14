/**
 * Graph Merger
 * 
 * Merges graph objects from parent scrapers into child scrapers,
 * handling conflicts and preserving child-specific nodes.
 */

import { NavigationNode, NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { GraphVersionManager } from './GraphVersionManager.js';

export interface MergeConflict {
    nodeUrl: string;
    conflictType: 'modified' | 'deleted' | 'added';
    parentValue?: NavigationNode;
    childValue?: NavigationNode;
    resolution?: 'parent' | 'child' | 'merge' | 'ask';
}

export interface MergeResult {
    mergedGraph: NavigationGraphData;
    conflicts: MergeConflict[];
    stats: {
        nodesFromParent: number;
        nodesFromChild: number;
        nodesMerged: number;
        conflictsFound: number;
        conflictsResolved: number;
    };
}

export type ConflictResolutionStrategy = 
    | 'parent-wins'      // Always use parent value
    | 'child-wins'       // Always use child value
    | 'merge'            // Attempt automatic merge
    | 'ask'              // Return conflicts for manual resolution
    | ((conflict: MergeConflict) => 'parent' | 'child' | 'merge');

/**
 * Merges parent graph into child graph
 */
export class GraphMerger {
    private versionManager: GraphVersionManager;

    constructor(versionManager: GraphVersionManager) {
        this.versionManager = versionManager;
    }

    /**
     * Merge parent graph into child graph
     */
    async mergeFromParent(
        childScraperName: string,
        parentScraperName: string,
        parentVersion?: string,
        resolutionStrategy: ConflictResolutionStrategy = 'merge'
    ): Promise<MergeResult> {
        // Load parent snapshot
        const parentSnapshot = await this.versionManager.loadSnapshot(parentScraperName, parentVersion);
        if (!parentSnapshot) {
            throw new Error(`Parent graph not found: ${parentScraperName}${parentVersion ? `@${parentVersion}` : ''}`);
        }

        // Load current child graph
        const childGraph = await this.versionManager.loadCurrentGraph(childScraperName);
        const childData: NavigationGraphData = childGraph || { nodes: {}, rootUrl: parentSnapshot.data.rootUrl || '' };

        return this.mergeGraphs(parentSnapshot.data, childData, resolutionStrategy);
    }

    /**
     * Merge two graph objects
     */
    mergeGraphs(
        parentGraph: NavigationGraphData,
        childGraph: NavigationGraphData,
        resolutionStrategy: ConflictResolutionStrategy = 'merge'
    ): MergeResult {
        const mergedNodes: { [url: string]: NavigationNode } = {};
        const conflicts: MergeConflict[] = [];
        const stats = {
            nodesFromParent: 0,
            nodesFromChild: 0,
            nodesMerged: 0,
            conflictsFound: 0,
            conflictsResolved: 0
        };

        const parentUrls = new Set(Object.keys(parentGraph.nodes));
        const childUrls = new Set(Object.keys(childGraph.nodes));

        // Process nodes that exist only in parent (inherited nodes)
        for (const url of parentUrls) {
            if (!childUrls.has(url)) {
                // Node exists only in parent - inherit it
                mergedNodes[url] = { ...parentGraph.nodes[url] };
                stats.nodesFromParent++;
            }
        }

        // Process nodes that exist only in child (child-specific nodes)
        for (const url of childUrls) {
            if (!parentUrls.has(url)) {
                // Node exists only in child - keep it
                mergedNodes[url] = { ...childGraph.nodes[url] };
                stats.nodesFromChild++;
            }
        }

        // Process nodes that exist in both (potential conflicts)
        for (const url of parentUrls) {
            if (childUrls.has(url)) {
                const parentNode = parentGraph.nodes[url];
                const childNode = childGraph.nodes[url];

                if (this.nodesAreEqual(parentNode, childNode)) {
                    // No conflict - nodes are identical
                    mergedNodes[url] = { ...childNode };
                    stats.nodesMerged++;
                } else {
                    // Conflict detected
                    const conflict: MergeConflict = {
                        nodeUrl: url,
                        conflictType: 'modified',
                        parentValue: parentNode,
                        childValue: childNode
                    };

                    const resolution = this.resolveConflict(conflict, resolutionStrategy);
                    conflict.resolution = resolution as 'parent' | 'child' | 'merge' | 'ask';
                    conflicts.push(conflict);
                    stats.conflictsFound++;

                    if (resolution === 'ask') {
                        // Keep child value as default, but mark for manual resolution
                        mergedNodes[url] = { ...childNode };
                    } else if (resolution === 'parent') {
                        mergedNodes[url] = { ...parentNode };
                        stats.conflictsResolved++;
                    } else if (resolution === 'child') {
                        mergedNodes[url] = { ...childNode };
                        stats.conflictsResolved++;
                    } else if (resolution === 'merge') {
                        // Attempt automatic merge
                        mergedNodes[url] = this.mergeNodes(parentNode, childNode);
                        stats.conflictsResolved++;
                    }
                }
            }
        }

        // Update children arrays to include all valid references
        this.reconcileChildrenArrays(mergedNodes);

        return {
            mergedGraph: { nodes: mergedNodes, rootUrl: parentGraph.rootUrl || childGraph.rootUrl || '' },
            conflicts,
            stats
        };
    }

    /**
     * Check if two nodes are equal (ignoring timestamps and some metadata)
     */
    private nodesAreEqual(node1: NavigationNode, node2: NavigationNode): boolean {
        // Compare structural properties
        if (node1.url !== node2.url) return false;
        if (node1.type !== node2.type) return false;
        if (node1.title !== node2.title) return false;
        if (node1.filePath !== node2.filePath) return false;
        if (node1.schemaType !== node2.schemaType) return false;
        if (node1.uri !== node2.uri) return false;

        // Compare children arrays (order-independent)
        const children1 = new Set(node1.children || []);
        const children2 = new Set(node2.children || []);
        if (children1.size !== children2.size) return false;
        for (const child of children1) {
            if (!children2.has(child)) return false;
        }

        // Compare xpaths
        const xpaths1 = JSON.stringify(node1.xpaths || {});
        const xpaths2 = JSON.stringify(node2.xpaths || {});
        if (xpaths1 !== xpaths2) return false;

        // Note: We ignore lastVisited, content, and vector as they may change over time
        return true;
    }

    /**
     * Resolve a conflict using the provided strategy
     */
    private resolveConflict(
        conflict: MergeConflict,
        strategy: ConflictResolutionStrategy
    ): 'parent' | 'child' | 'merge' | 'ask' {
        if (typeof strategy === 'function') {
            return strategy(conflict);
        }

        switch (strategy) {
            case 'parent-wins':
                return 'parent';
            case 'child-wins':
                return 'child';
            case 'merge':
                return 'merge';
            case 'ask':
            default:
                return 'ask';
        }
    }

    /**
     * Merge two nodes, combining their properties intelligently
     */
    private mergeNodes(parentNode: NavigationNode, childNode: NavigationNode): NavigationNode {
        const merged: NavigationNode = {
            url: childNode.url, // URL must match
            type: childNode.type || parentNode.type,
            title: childNode.title || parentNode.title,
            children: []
        };

        // Merge children (union of both sets)
        const allChildren = new Set([
            ...(parentNode.children || []),
            ...(childNode.children || [])
        ]);
        merged.children = Array.from(allChildren);

        // Prefer child values for these, fall back to parent
        merged.filePath = childNode.filePath || parentNode.filePath;
        merged.schemaType = childNode.schemaType || parentNode.schemaType;
        merged.uri = childNode.uri || parentNode.uri;
        merged.sourceUrl = childNode.sourceUrl || parentNode.sourceUrl;

        // Merge xpaths (child takes precedence, but include parent's unique ones)
        merged.xpaths = {
            ...(parentNode.xpaths || {}),
            ...(childNode.xpaths || {})
        };

        // Use most recent lastVisited
        if (childNode.lastVisited && parentNode.lastVisited) {
            const childDate = new Date(childNode.lastVisited);
            const parentDate = new Date(parentNode.lastVisited);
            merged.lastVisited = childDate > parentDate 
                ? childNode.lastVisited 
                : parentNode.lastVisited;
        } else {
            merged.lastVisited = childNode.lastVisited || parentNode.lastVisited;
        }

        // Prefer child's content/embedding (more recent scraping)
        merged.content = childNode.content || parentNode.content;
        merged.embedding = childNode.embedding || parentNode.embedding;

        return merged;
    }

    /**
     * Reconcile children arrays to ensure all referenced nodes exist
     */
    private reconcileChildrenArrays(nodes: { [url: string]: NavigationNode }): void {
        const validUrls = new Set(Object.keys(nodes));

        for (const url of Object.keys(nodes)) {
            const node = nodes[url];
            if (node.children && node.children.length > 0) {
                // Filter out invalid child references
                node.children = node.children.filter(childUrl => validUrls.has(childUrl));
            }
        }
    }

    /**
     * Apply conflict resolutions to a merge result
     */
    applyResolutions(
        mergeResult: MergeResult,
        resolutions: { [nodeUrl: string]: 'parent' | 'child' | 'merge' }
    ): NavigationGraphData {
        const resolvedGraph = { ...mergeResult.mergedGraph };

        for (const conflict of mergeResult.conflicts) {
            const resolution = resolutions[conflict.nodeUrl];
            if (!resolution || !conflict.parentValue || !conflict.childValue) {
                continue;
            }

            if (resolution === 'parent') {
                resolvedGraph.nodes[conflict.nodeUrl] = { ...conflict.parentValue };
            } else if (resolution === 'child') {
                resolvedGraph.nodes[conflict.nodeUrl] = { ...conflict.childValue };
            } else if (resolution === 'merge') {
                resolvedGraph.nodes[conflict.nodeUrl] = this.mergeNodes(
                    conflict.parentValue,
                    conflict.childValue
                );
            }
        }

        // Reconcile children arrays again after resolutions
        this.reconcileChildrenArrays(resolvedGraph.nodes);

        return resolvedGraph;
    }
}

