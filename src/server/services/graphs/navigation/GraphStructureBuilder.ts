/**
 * Graph Structure Builder Service
 * 
 * Analyzes isolated nodes and builds a meaningful graph structure by grouping
 * related nodes and creating hierarchical relationships.
 * 
 * Supports multiple strategies:
 * - Hierarchical: Groups nodes by type and source, creates group nodes
 * - Clustered: Uses clustering algorithm to group similar nodes
 * - Semantic: Groups nodes based on semantic similarity
 * 
 * @module GraphStructureBuilder
 */

import { logger } from '../../../utils/logger.js';
import { NavigationGraph, NavigationNode } from './NavigationGraph.js';
import { RelationshipBuilderService } from './RelationshipBuilderService.js';

/**
 * Structure building strategy
 */
export type StructureStrategy = 'hierarchical' | 'clustered' | 'semantic';

/**
 * Options for structure building
 */
export interface StructureBuildOptions {
    /** Strategy to use for building structure (default: 'hierarchical') */
    strategy?: StructureStrategy;
    /** Maximum depth for hierarchical structure (default: 3) */
    maxDepth?: number;
    /** Minimum number of nodes per group (default: 2) */
    minGroupSize?: number;
    /** Whether to set root node if missing (default: true) */
    setRootIfMissing?: boolean;
}

/**
 * Result of structure building operation
 */
export interface StructureBuildResult {
    /** Number of nodes processed */
    nodesProcessed: number;
    /** Number of relationships created */
    relationshipsCreated: number;
    /** Number of group/cluster nodes created */
    groupsCreated: number;
    /** Whether root node was set */
    rootNodeSet: boolean;
    /** URLs of group nodes created */
    groupNodeUrls: string[];
}

/**
 * Service to build graph structure from isolated nodes
 */
export class GraphStructureBuilder {
    constructor(
        private navigationGraph: NavigationGraph,
        private relationshipBuilder: RelationshipBuilderService
    ) {
        if (!navigationGraph) {
            throw new Error('GraphStructureBuilder requires a NavigationGraph instance');
        }
        if (!relationshipBuilder) {
            throw new Error('GraphStructureBuilder requires a RelationshipBuilderService instance');
        }
    }

    /**
     * Build graph structure from isolated nodes
     */
    async buildStructure(options: StructureBuildOptions = {}): Promise<StructureBuildResult> {
        const {
            strategy = 'hierarchical',
            maxDepth = 3,
            minGroupSize = 2,
            setRootIfMissing = true
        } = options;

        logger.info({ strategy, maxDepth, minGroupSize }, 'Starting graph structure building');

        try {
            // Get isolated nodes
            const isolatedNodeUrls = await this.navigationGraph.getIsolatedNodes();
            
            if (isolatedNodeUrls.length === 0) {
                logger.info('No isolated nodes found, nothing to build');
                return {
                    nodesProcessed: 0,
                    relationshipsCreated: 0,
                    groupsCreated: 0,
                    rootNodeSet: false,
                    groupNodeUrls: []
                };
            }

            logger.info({ count: isolatedNodeUrls.length }, 'Found isolated nodes');

            // Get node details
            const isolatedNodes: NavigationNode[] = [];
            for (const url of isolatedNodeUrls) {
                try {
                    const node = await this.navigationGraph.getNode(url);
                    if (node) {
                        isolatedNodes.push(node);
                    }
                } catch (error) {
                    logger.warn({ url, error }, 'Failed to get node details');
                }
            }

            if (isolatedNodes.length === 0) {
                logger.warn('No valid isolated nodes found');
                return {
                    nodesProcessed: 0,
                    relationshipsCreated: 0,
                    groupsCreated: 0,
                    rootNodeSet: false,
                    groupNodeUrls: []
                };
            }

            // Build structure based on strategy
            let result: StructureBuildResult;
            switch (strategy) {
                case 'hierarchical':
                    result = await this.buildHierarchicalStructure(isolatedNodes, maxDepth, minGroupSize);
                    break;
                case 'clustered':
                    result = await this.buildClusteredStructure(isolatedNodes, minGroupSize);
                    break;
                case 'semantic':
                    result = await this.buildSemanticStructure(isolatedNodes, minGroupSize);
                    break;
                default:
                    throw new Error(`Unknown strategy: ${strategy}`);
            }

            // Set root node if missing
            if (setRootIfMissing) {
                const rootSet = await this.ensureRootNode(result.groupNodeUrls);
                result.rootNodeSet = rootSet;
            } else {
                result.rootNodeSet = false;
            }

            logger.info(
                {
                    nodesProcessed: result.nodesProcessed,
                    relationshipsCreated: result.relationshipsCreated,
                    groupsCreated: result.groupsCreated,
                    rootNodeSet: result.rootNodeSet
                },
                'Graph structure building completed'
            );

            return result;
        } catch (error) {
            logger.error({ error, strategy }, 'Failed to build graph structure');
            throw error;
        }
    }

    /**
     * Build hierarchical structure by grouping nodes by type and source
     */
    private async buildHierarchicalStructure(
        nodes: NavigationNode[],
        maxDepth: number,
        minGroupSize: number
    ): Promise<StructureBuildResult> {
        logger.debug({ nodeCount: nodes.length, maxDepth, minGroupSize }, 'Building hierarchical structure');

        // Group nodes by type and sourceUrl
        const groups = new Map<string, NavigationNode[]>();
        
        for (const node of nodes) {
            const groupKey = this.getGroupKey(node);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(node);
        }

        // Filter groups by minimum size
        const validGroups = Array.from(groups.entries()).filter(
            ([, groupNodes]) => groupNodes.length >= minGroupSize
        );

        logger.debug({ groupCount: validGroups.length }, 'Created node groups');

        let relationshipsCreated = 0;
        const groupNodeUrls: string[] = [];

        // Create group nodes and link nodes to them
        for (const [groupKey, groupNodes] of validGroups) {
            try {
                const groupNodeUrl = `group:${groupKey}`;
                const groupNode: NavigationNode = {
                    url: groupNodeUrl,
                    type: 'section',
                    title: this.getGroupTitle(groupKey),
                    children: groupNodes.map(n => n.url),
                    sourceUrl: groupNodes[0]?.sourceUrl
                };

                // Add group node (this will create LINKS_TO relationships to all children)
                await this.navigationGraph.addNode(groupNode);
                groupNodeUrls.push(groupNodeUrl);

                // Count relationships: one relationship per child node
                relationshipsCreated += groupNodes.length;

                logger.debug({ groupKey, nodeCount: groupNodes.length }, 'Created group node');
            } catch (error) {
                logger.warn({ groupKey, error }, 'Failed to create group node');
            }
        }

        // Create main root node if we have groups
        if (groupNodeUrls.length > 0) {
            try {
                const rootNodeUrl = 'root:main';
                const rootNode: NavigationNode = {
                    url: rootNodeUrl,
                    type: 'section',
                    title: 'Main Root',
                    children: groupNodeUrls
                };

                await this.navigationGraph.addNode(rootNode);
                groupNodeUrls.push(rootNodeUrl);
                
                // Count relationships from root to group nodes
                relationshipsCreated += groupNodeUrls.length - 1; // -1 to exclude root itself

                logger.debug({ rootNodeUrl, groupCount: groupNodeUrls.length - 1 }, 'Created main root node');
            } catch (error) {
                logger.warn({ error }, 'Failed to create main root node');
            }
        }

        return {
            nodesProcessed: nodes.length,
            relationshipsCreated,
            groupsCreated: validGroups.length + (groupNodeUrls.length > 0 ? 1 : 0),
            rootNodeSet: false, // Will be set by ensureRootNode
            groupNodeUrls
        };
    }

    /**
     * Build clustered structure using simple clustering
     */
    private async buildClusteredStructure(
        nodes: NavigationNode[],
        minGroupSize: number
    ): Promise<StructureBuildResult> {
        logger.debug({ nodeCount: nodes.length, minGroupSize }, 'Building clustered structure');

        // Simple clustering: group by type first, then by sourceUrl
        const clusters = new Map<string, NavigationNode[]>();
        
        for (const node of nodes) {
            const clusterKey = `${node.type}:${node.sourceUrl || 'unknown'}`;
            if (!clusters.has(clusterKey)) {
                clusters.set(clusterKey, []);
            }
            clusters.get(clusterKey)!.push(node);
        }

        // Filter clusters by minimum size
        const validClusters = Array.from(clusters.entries()).filter(
            ([, clusterNodes]) => clusterNodes.length >= minGroupSize
        );

        logger.debug({ clusterCount: validClusters.length }, 'Created clusters');

        let relationshipsCreated = 0;
        const groupNodeUrls: string[] = [];

        // Create cluster nodes
        for (const [clusterKey, clusterNodes] of validClusters) {
            try {
                const clusterNodeUrl = `cluster:${clusterKey}`;
                const clusterNode: NavigationNode = {
                    url: clusterNodeUrl,
                    type: 'section',
                    title: `Cluster: ${clusterKey}`,
                    children: clusterNodes.map(n => n.url),
                    sourceUrl: clusterNodes[0]?.sourceUrl
                };

                await this.navigationGraph.addNode(clusterNode);
                groupNodeUrls.push(clusterNodeUrl);
                relationshipsCreated += clusterNodes.length;

                logger.debug({ clusterKey, nodeCount: clusterNodes.length }, 'Created cluster node');
            } catch (error) {
                logger.warn({ clusterKey, error }, 'Failed to create cluster node');
            }
        }

        return {
            nodesProcessed: nodes.length,
            relationshipsCreated,
            groupsCreated: validClusters.length,
            rootNodeSet: false,
            groupNodeUrls
        };
    }

    /**
     * Build semantic structure using semantic similarity
     */
    private async buildSemanticStructure(
        nodes: NavigationNode[],
        minGroupSize: number
    ): Promise<StructureBuildResult> {
        logger.debug({ nodeCount: nodes.length, minGroupSize }, 'Building semantic structure');

        // For semantic structure, we'll use a simplified approach:
        // Group nodes by thema and onderwerp if available
        // Otherwise, fall back to type-based grouping
        const semanticGroups = new Map<string, NavigationNode[]>();
        
        for (const node of nodes) {
            let groupKey: string;
            if (node.thema && node.onderwerp) {
                groupKey = `semantic:${node.thema}:${node.onderwerp}`;
            } else if (node.thema) {
                groupKey = `semantic:${node.thema}`;
            } else if (node.onderwerp) {
                groupKey = `semantic:${node.onderwerp}`;
            } else {
                // Fall back to type
                groupKey = `semantic:${node.type}`;
            }

            if (!semanticGroups.has(groupKey)) {
                semanticGroups.set(groupKey, []);
            }
            semanticGroups.get(groupKey)!.push(node);
        }

        // Filter groups by minimum size
        const validGroups = Array.from(semanticGroups.entries()).filter(
            ([, groupNodes]) => groupNodes.length >= minGroupSize
        );

        logger.debug({ groupCount: validGroups.length }, 'Created semantic groups');

        let relationshipsCreated = 0;
        const groupNodeUrls: string[] = [];

        // Create semantic group nodes
        for (const [groupKey, groupNodes] of validGroups) {
            try {
                const groupNodeUrl = `semantic:${groupKey}`;
                const groupNode: NavigationNode = {
                    url: groupNodeUrl,
                    type: 'section',
                    title: `Semantic Group: ${groupKey.replace(/^semantic:/, '')}`,
                    children: groupNodes.map(n => n.url),
                    sourceUrl: groupNodes[0]?.sourceUrl,
                    thema: groupNodes[0]?.thema,
                    onderwerp: groupNodes[0]?.onderwerp
                };

                await this.navigationGraph.addNode(groupNode);
                groupNodeUrls.push(groupNodeUrl);
                relationshipsCreated += groupNodes.length;

                logger.debug({ groupKey, nodeCount: groupNodes.length }, 'Created semantic group node');
            } catch (error) {
                logger.warn({ groupKey, error }, 'Failed to create semantic group node');
            }
        }

        return {
            nodesProcessed: nodes.length,
            relationshipsCreated,
            groupsCreated: validGroups.length,
            rootNodeSet: false,
            groupNodeUrls
        };
    }

    /**
     * Ensure root node exists, set it if missing
     */
    private async ensureRootNode(groupNodeUrls: string[]): Promise<boolean> {
        try {
            const currentRoot = await this.navigationGraph.getRoot();
            
            if (currentRoot) {
                logger.debug({ rootUrl: currentRoot }, 'Root node already exists');
                return false;
            }

            // Find or create a root node
            let rootUrl: string | null = null;

            // If we have a main root from hierarchical structure, use it
            if (groupNodeUrls.includes('root:main')) {
                rootUrl = 'root:main';
            } else if (groupNodeUrls.length > 0) {
                // Use first group node as root
                rootUrl = groupNodeUrls[0];
            } else {
                // Create a default root
                rootUrl = 'root:default';
                const rootNode: NavigationNode = {
                    url: rootUrl,
                    type: 'section',
                    title: 'Default Root',
                    children: []
                };
                await this.navigationGraph.addNode(rootNode);
            }

            if (rootUrl) {
                await this.navigationGraph.setRoot(rootUrl);
                logger.info({ rootUrl }, 'Set root node');
                return true;
            }

            return false;
        } catch (error) {
            logger.warn({ error }, 'Failed to ensure root node');
            return false;
        }
    }

    /**
     * Get group key for a node (type:sourceUrl)
     */
    private getGroupKey(node: NavigationNode): string {
        const type = node.type || 'page';
        const source = node.sourceUrl || 'unknown';
        return `${type}:${source}`;
    }

    /**
     * Get group title from group key
     */
    private getGroupTitle(groupKey: string): string {
        const [type, source] = groupKey.split(':');
        return `${type.charAt(0).toUpperCase() + type.slice(1)} Group: ${source}`;
    }
}

