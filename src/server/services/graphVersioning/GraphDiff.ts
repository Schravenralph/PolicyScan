/**
 * Graph Diff Service
 * 
 * Compares two versions of a graph and shows:
 * - Added nodes
 * - Removed nodes
 * - Modified nodes (with property changes)
 * - Relationship changes
 * - Human-readable diff report
 * 
 * Supports both file-based versions and Neo4j current state.
 */

import { Driver } from 'neo4j-driver';
import type { NavigationNode, NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { GraphVersionManager } from './GraphVersionManager.js';
import { ScraperGraphVersioning } from '../scraperGraph/ScraperGraphVersioning.js';

export interface NodeDiff {
    nodeUrl: string;
    changeType: 'added' | 'removed' | 'modified';
    oldNode?: NavigationNode;
    newNode?: NavigationNode;
    propertyChanges?: Array<{
        property: string;
        oldValue: unknown;
        newValue: unknown;
    }>;
    childrenChanges?: {
        added: string[];
        removed: string[];
    };
}

export interface RelationshipDiff {
    parentUrl: string;
    childUrl: string;
    changeType: 'added' | 'removed';
}

export interface GraphDiffResult {
    fromVersion: string;
    toVersion: string;
    scraperId: string;
    nodeDiffs: NodeDiff[];
    relationshipDiffs: RelationshipDiff[];
    summary: {
        nodesAdded: number;
        nodesRemoved: number;
        nodesModified: number;
        relationshipsAdded: number;
        relationshipsRemoved: number;
        totalChanges: number;
    };
    filters?: {
        byChangeType?: Array<'added' | 'removed' | 'modified'>;
        byNodeType?: Array<'page' | 'section' | 'document'>;
        minSeverity?: 'low' | 'medium' | 'high';
    };
}

/**
 * Service for computing differences between graph versions
 * Supports both file-based versions and Neo4j current state
 */
export class GraphDiff {
    private versionManager: GraphVersionManager;
    private driver?: Driver;
    private versioning?: ScraperGraphVersioning;

    constructor(versionManager: GraphVersionManager, driver?: Driver, versioning?: ScraperGraphVersioning) {
        this.versionManager = versionManager;
        this.driver = driver;
        this.versioning = versioning;
    }

    /**
     * Compare two versions of a scraper's graph
     * Supports comparing file-based versions or current Neo4j state
     */
    async compareVersions(
        scraperId: string,
        fromVersion?: string,
        toVersion?: string
    ): Promise<GraphDiffResult> {
        // Load from version (file-based or Neo4j)
        const fromGraph = await this.loadGraphForComparison(scraperId, fromVersion);
        const fromVersionStr = fromVersion || 'none';

        // Load to version (file-based or Neo4j)
        // If toVersion is undefined, use current Neo4j state
        const toGraph = await this.loadGraphForComparison(scraperId, toVersion, true);
        const toVersionStr = toVersion || 'current (Neo4j)';

        if (!fromGraph && !toGraph) {
            throw new Error(`No graph data found for scraper ${scraperId}`);
        }

        // Provide default empty graphs if one is null
        const fromGraphData: NavigationGraphData = fromGraph || { nodes: {}, rootUrl: '' };
        const toGraphData: NavigationGraphData = toGraph || { nodes: {}, rootUrl: '' };

        // Compute node diffs
        const nodeDiffs = this.computeNodeDiffs(fromGraphData, toGraphData);

        // Compute relationship diffs
        const relationshipDiffs = this.computeRelationshipDiffs(fromGraphData, toGraphData);

        // Generate summary
        const summary = {
            nodesAdded: nodeDiffs.filter(d => d.changeType === 'added').length,
            nodesRemoved: nodeDiffs.filter(d => d.changeType === 'removed').length,
            nodesModified: nodeDiffs.filter(d => d.changeType === 'modified').length,
            relationshipsAdded: relationshipDiffs.filter(d => d.changeType === 'added').length,
            relationshipsRemoved: relationshipDiffs.filter(d => d.changeType === 'removed').length,
            totalChanges: nodeDiffs.length + relationshipDiffs.length
        };

        return {
            fromVersion: fromVersionStr,
            toVersion: toVersionStr,
            scraperId,
            nodeDiffs,
            relationshipDiffs,
            summary
        };
    }

    /**
     * Compare current graph with a specific version
     */
    async compareWithVersion(
        scraperId: string,
        version: string
    ): Promise<GraphDiffResult> {
        return this.compareVersions(scraperId, version, undefined);
    }

    /**
     * Compare two specific versions
     */
    async compareTwoVersions(
        scraperId: string,
        version1: string,
        version2: string
    ): Promise<GraphDiffResult> {
        return this.compareVersions(scraperId, version1, version2);
    }

    /**
     * Compute node differences
     */
    private computeNodeDiffs(
        fromGraph: NavigationGraphData,
        toGraph: NavigationGraphData
    ): NodeDiff[] {
        const diffs: NodeDiff[] = [];
        const fromNodes = fromGraph.nodes || {};
        const toNodes = toGraph.nodes || {};

        const allUrls = new Set([
            ...Object.keys(fromNodes),
            ...Object.keys(toNodes)
        ]);

        for (const url of allUrls) {
            const fromNode = fromNodes[url];
            const toNode = toNodes[url];

            if (!fromNode && toNode) {
                // Node added
                diffs.push({
                    nodeUrl: url,
                    changeType: 'added',
                    newNode: toNode
                });
            } else if (fromNode && !toNode) {
                // Node removed
                diffs.push({
                    nodeUrl: url,
                    changeType: 'removed',
                    oldNode: fromNode
                });
            } else if (fromNode && toNode) {
                // Node might be modified
                const propertyChanges = this.computePropertyChanges(fromNode, toNode);
                const childrenChanges = this.computeChildrenChanges(fromNode, toNode);

                if (propertyChanges.length > 0 || childrenChanges) {
                    diffs.push({
                        nodeUrl: url,
                        changeType: 'modified',
                        oldNode: fromNode,
                        newNode: toNode,
                        propertyChanges,
                        childrenChanges
                    });
                }
            }
        }

        return diffs;
    }

    /**
     * Compute property changes between two nodes
     */
    private computePropertyChanges(
        fromNode: NavigationNode,
        toNode: NavigationNode
    ): Array<{ property: string; oldValue: unknown; newValue: unknown }> {
        const changes: Array<{ property: string; oldValue: unknown; newValue: unknown }> = [];
        const allKeys = new Set([
            ...Object.keys(fromNode),
            ...Object.keys(toNode)
        ]);

        for (const key of allKeys) {
            // Skip children - handled separately
            if (key === 'children') continue;

            const fromVal = (fromNode as unknown as Record<string, unknown>)[key];
            const toVal = (toNode as unknown as Record<string, unknown>)[key];

            if (fromVal !== toVal) {
                changes.push({
                    property: key,
                    oldValue: fromVal,
                    newValue: toVal
                });
            }
        }

        return changes;
    }

    /**
     * Compute children array changes
     */
    private computeChildrenChanges(
        fromNode: NavigationNode,
        toNode: NavigationNode
    ): { added: string[]; removed: string[] } | undefined {
        const fromChildren = new Set(fromNode.children || []);
        const toChildren = new Set(toNode.children || []);

        const added = [...toChildren].filter(c => !fromChildren.has(c));
        const removed = [...fromChildren].filter(c => !toChildren.has(c));

        if (added.length === 0 && removed.length === 0) {
            return undefined;
        }

        return { added, removed };
    }

    /**
     * Compute relationship differences
     */
    private computeRelationshipDiffs(
        fromGraph: NavigationGraphData,
        toGraph: NavigationGraphData
    ): RelationshipDiff[] {
        const diffs: RelationshipDiff[] = [];

        // Build relationship sets
        const fromRelationships = new Set<string>();
        const toRelationships = new Set<string>();

        // Extract relationships from fromGraph
        for (const node of Object.values(fromGraph.nodes || {})) {
            if (node.children) {
                for (const childUrl of node.children) {
                    fromRelationships.add(`${node.url}->${childUrl}`);
                }
            }
        }

        // Extract relationships from toGraph
        for (const node of Object.values(toGraph.nodes || {})) {
            if (node.children) {
                for (const childUrl of node.children) {
                    toRelationships.add(`${node.url}->${childUrl}`);
                }
            }
        }

        // Find added relationships
        for (const rel of toRelationships) {
            if (!fromRelationships.has(rel)) {
                const [parentUrl, childUrl] = rel.split('->');
                diffs.push({
                    parentUrl,
                    childUrl,
                    changeType: 'added'
                });
            }
        }

        // Find removed relationships
        for (const rel of fromRelationships) {
            if (!toRelationships.has(rel)) {
                const [parentUrl, childUrl] = rel.split('->');
                diffs.push({
                    parentUrl,
                    childUrl,
                    changeType: 'removed'
                });
            }
        }

        return diffs;
    }

    /**
     * Generate a human-readable diff report
     */
    generateReport(diff: GraphDiffResult): string {
        const lines: string[] = [];

        lines.push('='.repeat(80));
        lines.push(`Graph Diff Report: ${diff.scraperId}`);
        lines.push(`From: ${diff.fromVersion} → To: ${diff.toVersion}`);
        lines.push('='.repeat(80));
        lines.push('');

        // Summary
        lines.push('Summary:');
        lines.push(`  Nodes added: ${diff.summary.nodesAdded}`);
        lines.push(`  Nodes removed: ${diff.summary.nodesRemoved}`);
        lines.push(`  Nodes modified: ${diff.summary.nodesModified}`);
        lines.push(`  Relationships added: ${diff.summary.relationshipsAdded}`);
        lines.push(`  Relationships removed: ${diff.summary.relationshipsRemoved}`);
        lines.push(`  Total changes: ${diff.summary.totalChanges}`);
        lines.push('');

        // Node changes
        if (diff.nodeDiffs.length > 0) {
            lines.push('Node Changes:');
            lines.push('');

            const added = diff.nodeDiffs.filter(d => d.changeType === 'added');
            if (added.length > 0) {
                lines.push('  Added Nodes:');
                for (const nodeDiff of added) {
                    lines.push(`    + ${nodeDiff.nodeUrl}`);
                    if (nodeDiff.newNode?.title) {
                        lines.push(`      Title: ${nodeDiff.newNode.title}`);
                    }
                }
                lines.push('');
            }

            const removed = diff.nodeDiffs.filter(d => d.changeType === 'removed');
            if (removed.length > 0) {
                lines.push('  Removed Nodes:');
                for (const nodeDiff of removed) {
                    lines.push(`    - ${nodeDiff.nodeUrl}`);
                    if (nodeDiff.oldNode?.title) {
                        lines.push(`      Title: ${nodeDiff.oldNode.title}`);
                    }
                }
                lines.push('');
            }

            const modified = diff.nodeDiffs.filter(d => d.changeType === 'modified');
            if (modified.length > 0) {
                lines.push('  Modified Nodes:');
                for (const nodeDiff of modified) {
                    lines.push(`    ~ ${nodeDiff.nodeUrl}`);
                    
                    if (nodeDiff.propertyChanges && nodeDiff.propertyChanges.length > 0) {
                        lines.push('      Properties:');
                        for (const change of nodeDiff.propertyChanges) {
                            lines.push(`        ${change.property}:`);
                            lines.push(`          - ${this.formatValue(change.oldValue)}`);
                            lines.push(`          + ${this.formatValue(change.newValue)}`);
                        }
                    }

                    if (nodeDiff.childrenChanges) {
                        lines.push('      Children:');
                        if (nodeDiff.childrenChanges.added.length > 0) {
                            lines.push(`        + ${nodeDiff.childrenChanges.added.join(', ')}`);
                        }
                        if (nodeDiff.childrenChanges.removed.length > 0) {
                            lines.push(`        - ${nodeDiff.childrenChanges.removed.join(', ')}`);
                        }
                    }
                }
                lines.push('');
            }
        }

        // Relationship changes
        if (diff.relationshipDiffs.length > 0) {
            lines.push('Relationship Changes:');
            lines.push('');

            const added = diff.relationshipDiffs.filter(d => d.changeType === 'added');
            if (added.length > 0) {
                lines.push('  Added Relationships:');
                for (const rel of added) {
                    lines.push(`    + ${rel.parentUrl} → ${rel.childUrl}`);
                }
                lines.push('');
            }

            const removed = diff.relationshipDiffs.filter(d => d.changeType === 'removed');
            if (removed.length > 0) {
                lines.push('  Removed Relationships:');
                for (const rel of removed) {
                    lines.push(`    - ${rel.parentUrl} → ${rel.childUrl}`);
                }
                lines.push('');
            }
        }

        lines.push('='.repeat(80));

        return lines.join('\n');
    }

    /**
     * Format a value for display
     */
    private formatValue(value: unknown): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'string') {
            if (value.length > 100) {
                return `"${value.substring(0, 100)}..."`;
            }
            return `"${value}"`;
        }
        if (Array.isArray(value)) {
            return `[${value.length} items]`;
        }
        if (typeof value === 'object') {
            return `{${Object.keys(value).length} properties}`;
        }
        return String(value);
    }

    /**
     * Generate markdown diff report
     */
    generateMarkdownReport(diff: GraphDiffResult): string {
        const lines: string[] = [];

        lines.push(`# Graph Diff: ${diff.scraperId}`);
        lines.push('');
        lines.push(`**From:** ${diff.fromVersion} → **To:** ${diff.toVersion}`);
        lines.push('');

        // Summary table
        lines.push('## Summary');
        lines.push('');
        lines.push('| Metric | Count |');
        lines.push('|--------|-------|');
        lines.push(`| Nodes Added | ${diff.summary.nodesAdded} |`);
        lines.push(`| Nodes Removed | ${diff.summary.nodesRemoved} |`);
        lines.push(`| Nodes Modified | ${diff.summary.nodesModified} |`);
        lines.push(`| Relationships Added | ${diff.summary.relationshipsAdded} |`);
        lines.push(`| Relationships Removed | ${diff.summary.relationshipsRemoved} |`);
        lines.push(`| Total Changes | ${diff.summary.totalChanges} |`);
        lines.push('');

        // Node changes
        if (diff.nodeDiffs.length > 0) {
            lines.push('## Node Changes');
            lines.push('');

            const added = diff.nodeDiffs.filter(d => d.changeType === 'added');
            if (added.length > 0) {
                lines.push('### Added Nodes');
                lines.push('');
                for (const nodeDiff of added) {
                    lines.push(`- **${nodeDiff.nodeUrl}**`);
                    if (nodeDiff.newNode?.title) {
                        lines.push(`  - Title: ${nodeDiff.newNode.title}`);
                    }
                    if (nodeDiff.newNode?.type) {
                        lines.push(`  - Type: ${nodeDiff.newNode.type}`);
                    }
                }
                lines.push('');
            }

            const removed = diff.nodeDiffs.filter(d => d.changeType === 'removed');
            if (removed.length > 0) {
                lines.push('### Removed Nodes');
                lines.push('');
                for (const nodeDiff of removed) {
                    lines.push(`- **${nodeDiff.nodeUrl}**`);
                    if (nodeDiff.oldNode?.title) {
                        lines.push(`  - Title: ${nodeDiff.oldNode.title}`);
                    }
                }
                lines.push('');
            }

            const modified = diff.nodeDiffs.filter(d => d.changeType === 'modified');
            if (modified.length > 0) {
                lines.push('### Modified Nodes');
                lines.push('');
                for (const nodeDiff of modified) {
                    lines.push(`#### ${nodeDiff.nodeUrl}`);
                    lines.push('');

                    if (nodeDiff.propertyChanges && nodeDiff.propertyChanges.length > 0) {
                        lines.push('**Property Changes:**');
                        lines.push('');
                        for (const change of nodeDiff.propertyChanges) {
                            lines.push(`- \`${change.property}\`:`);
                            lines.push(`  - Old: ${this.formatValue(change.oldValue)}`);
                            lines.push(`  - New: ${this.formatValue(change.newValue)}`);
                        }
                        lines.push('');
                    }

                    if (nodeDiff.childrenChanges) {
                        lines.push('**Children Changes:**');
                        lines.push('');
                        if (nodeDiff.childrenChanges.added.length > 0) {
                            lines.push(`- Added: ${nodeDiff.childrenChanges.added.map(c => `\`${c}\``).join(', ')}`);
                        }
                        if (nodeDiff.childrenChanges.removed.length > 0) {
                            lines.push(`- Removed: ${nodeDiff.childrenChanges.removed.map(c => `\`${c}\``).join(', ')}`);
                        }
                        lines.push('');
                    }
                }
            }
        }

        // Relationship changes
        if (diff.relationshipDiffs.length > 0) {
            lines.push('## Relationship Changes');
            lines.push('');

            const added = diff.relationshipDiffs.filter(d => d.changeType === 'added');
            if (added.length > 0) {
                lines.push('### Added Relationships');
                lines.push('');
                for (const rel of added) {
                    lines.push(`- \`${rel.parentUrl}\` → \`${rel.childUrl}\``);
                }
                lines.push('');
            }

            const removed = diff.relationshipDiffs.filter(d => d.changeType === 'removed');
            if (removed.length > 0) {
                lines.push('### Removed Relationships');
                lines.push('');
                for (const rel of removed) {
                    lines.push(`- \`${rel.parentUrl}\` → \`${rel.childUrl}\``);
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Load graph for comparison - supports both file-based versions and Neo4j current state
     */
    private async loadGraphForComparison(
        scraperId: string,
        version?: string,
        useNeo4jIfUndefined: boolean = false
    ): Promise<NavigationGraphData | null> {
        // If version is undefined and useNeo4jIfUndefined is true, load from Neo4j
        if (version === undefined && useNeo4jIfUndefined && this.driver && this.versioning) {
            try {
                const nodes = await this.versioning.getScraperNodes(scraperId, true);
                return this.nodesToGraphData(nodes);
            } catch (error) {
                console.warn(`Failed to load from Neo4j: ${error}`);
                // Fall back to file-based
            }
        }

        // Load from file-based version
        const snapshot = await this.versionManager.loadSnapshot(scraperId, version);
        return snapshot?.data || null;
    }

    /**
     * Convert NavigationNode array to NavigationGraphData
     */
    private nodesToGraphData(nodes: NavigationNode[]): NavigationGraphData {
        const nodeMap: { [url: string]: NavigationNode } = {};
        let rootUrl = '';

        for (const node of nodes) {
            nodeMap[node.url] = node;
            // Try to find root URL (node with no parent or first node)
            if (!rootUrl && (!node.children || node.children.length === 0)) {
                rootUrl = node.url;
            }
        }

        return {
            nodes: nodeMap,
            rootUrl
        };
    }

    /**
     * Filter diff results by change type, node type, or severity
     */
    filterDiff(
        diff: GraphDiffResult,
        filters: {
            changeTypes?: Array<'added' | 'removed' | 'modified'>;
            nodeTypes?: Array<'page' | 'section' | 'document'>;
            minSeverity?: 'low' | 'medium' | 'high';
        }
    ): GraphDiffResult {
        let filteredNodeDiffs = diff.nodeDiffs;
        const filteredRelationshipDiffs = diff.relationshipDiffs;

        // Filter by change type
        if (filters.changeTypes && filters.changeTypes.length > 0) {
            filteredNodeDiffs = filteredNodeDiffs.filter(d => 
                filters.changeTypes!.includes(d.changeType)
            );
        }

        // Filter by node type
        if (filters.nodeTypes && filters.nodeTypes.length > 0) {
            filteredNodeDiffs = filteredNodeDiffs.filter(d => {
                const node = d.newNode || d.oldNode;
                return node && filters.nodeTypes!.includes(node.type);
            });
        }

        // Filter by severity (based on number of changes)
        if (filters.minSeverity) {
            const severityMap = { low: 1, medium: 3, high: 5 };
            const minChanges = severityMap[filters.minSeverity];
            filteredNodeDiffs = filteredNodeDiffs.filter(d => {
                const changeCount = (d.propertyChanges?.length || 0) + 
                                   (d.childrenChanges ? 
                                    (d.childrenChanges.added.length + d.childrenChanges.removed.length) : 0);
                return changeCount >= minChanges;
            });
        }

        // Recalculate summary
        const summary = {
            nodesAdded: filteredNodeDiffs.filter(d => d.changeType === 'added').length,
            nodesRemoved: filteredNodeDiffs.filter(d => d.changeType === 'removed').length,
            nodesModified: filteredNodeDiffs.filter(d => d.changeType === 'modified').length,
            relationshipsAdded: filteredRelationshipDiffs.filter(d => d.changeType === 'added').length,
            relationshipsRemoved: filteredRelationshipDiffs.filter(d => d.changeType === 'removed').length,
            totalChanges: filteredNodeDiffs.length + filteredRelationshipDiffs.length
        };

        return {
            ...diff,
            nodeDiffs: filteredNodeDiffs,
            relationshipDiffs: filteredRelationshipDiffs,
            summary,
            filters
        };
    }

    /**
     * Compare current Neo4j state with a specific version
     */
    async compareCurrentWithVersion(
        scraperId: string,
        version: string
    ): Promise<GraphDiffResult> {
        if (!this.driver || !this.versioning) {
            throw new Error('Neo4j driver and versioning service required for current state comparison');
        }

        return this.compareVersions(scraperId, version, undefined);
    }

    /**
     * Compare current Neo4j state with another scraper's current state
     */
    async compareScrapers(
        scraperId1: string,
        scraperId2: string
    ): Promise<GraphDiffResult> {
        if (!this.driver || !this.versioning) {
            throw new Error('Neo4j driver and versioning service required for scraper comparison');
        }

        const graph1 = await this.loadGraphForComparison(scraperId1, undefined, true);
        const graph2 = await this.loadGraphForComparison(scraperId2, undefined, true);

        if (!graph1 || !graph2) {
            throw new Error('Failed to load graphs for comparison');
        }

        const nodeDiffs = this.computeNodeDiffs(graph1, graph2);
        const relationshipDiffs = this.computeRelationshipDiffs(graph1, graph2);

        const summary = {
            nodesAdded: nodeDiffs.filter(d => d.changeType === 'added').length,
            nodesRemoved: nodeDiffs.filter(d => d.changeType === 'removed').length,
            nodesModified: nodeDiffs.filter(d => d.changeType === 'modified').length,
            relationshipsAdded: relationshipDiffs.filter(d => d.changeType === 'added').length,
            relationshipsRemoved: relationshipDiffs.filter(d => d.changeType === 'removed').length,
            totalChanges: nodeDiffs.length + relationshipDiffs.length
        };

        return {
            fromVersion: `current (${scraperId1})`,
            toVersion: `current (${scraperId2})`,
            scraperId: `${scraperId1} vs ${scraperId2}`,
            nodeDiffs,
            relationshipDiffs,
            summary
        };
    }
}

/**
 * GraphDiffService - Enhanced wrapper with Neo4j integration
 * This is the recommended class to use for diff operations
 */
export class GraphDiffService extends GraphDiff {
    constructor(versionManager: GraphVersionManager, driver: Driver, versioning: ScraperGraphVersioning) {
        super(versionManager, driver, versioning);
    }
}
