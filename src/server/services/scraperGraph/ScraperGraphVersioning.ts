/**
 * Scraper Graph Versioning Service
 * 
 * Manages graph inheritance, versioning, and merging for scraper hierarchies.
 * Similar to git branches - child scrapers can pull from parent scrapers,
 * merge graph objects, and resolve conflicts.
 */

import { Driver } from 'neo4j-driver';
import { NavigationNode } from '../graphs/navigation/NavigationGraph.js';
import { fireAndForget } from '../../utils/initializationState.js';
import { logger } from '../../utils/logger.js';

export interface ScraperMetadata {
    scraperId: string; // e.g., "HorstAanDeMaasBetaalbareHuisvestingScraper"
    scraperName: string; // Human-readable name
    parentScraperId?: string; // Parent scraper ID (for inheritance)
    version: string; // Semantic version (e.g., "1.0.0")
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
}

export interface GraphMergeResult {
    merged: number; // Number of nodes merged
    added: number; // Number of new nodes added
    updated: number; // Number of nodes updated
    conflicts: GraphConflict[]; // Conflicts that need resolution
    skipped: number; // Number of nodes skipped
}

export interface GraphConflict {
    nodeUrl: string;
    conflictType: 'property' | 'children' | 'both';
    parentValue: NavigationNode;
    childValue: NavigationNode;
    property?: string; // For property conflicts (deprecated - use propertyDetails)
    propertyDetails?: Array<{
        property: string;
        parentValue: unknown;
        childValue: unknown;
        severity: 'critical' | 'moderate' | 'minor';
    }>;
    childrenDetails?: {
        parentChildren: string[];
        childChildren: string[];
        added: string[];
        removed: string[];
    };
    resolution?: 'parent' | 'child' | 'merge' | 'custom';
    resolvedValue?: NavigationNode;
    suggestedActions?: string[];
}

export interface MergeOptions {
    conflictResolution?: 'parent' | 'child' | 'merge' | 'prompt';
    mergeStrategy?: 'shallow' | 'deep'; // Shallow: only direct nodes, Deep: include children
    preserveChildNodes?: boolean; // Keep child-specific nodes even if not in parent
    versionTag?: string; // Tag for this merge operation
}

/**
 * Service for managing scraper graph inheritance and versioning
 */
export class ScraperGraphVersioning {
    private driver: Driver;

    constructor(driver: Driver) {
        this.driver = driver;
    }

    /**
     * Initialize the versioning system (creates indexes and constraints)
     */
    async initialize(): Promise<void> {
        const session = this.driver.session();
        try {
            // Create scraper metadata node constraint
            // Errors are expected if constraint already exists, but we log unexpected errors
            fireAndForget(
                session.run(`
                    CREATE CONSTRAINT scraper_metadata_id_unique IF NOT EXISTS
                    FOR (s:ScraperMetadata) REQUIRE s.scraperId IS UNIQUE
                `),
                {
                    service: 'ScraperGraphVersioning',
                    operation: 'createConstraint',
                    logger
                }
            );

            // Create index on parent scraper ID for fast lookups
            // Errors are expected if index already exists, but we log unexpected errors
            fireAndForget(
                session.run(`
                    CREATE INDEX scraper_parent_id_idx IF NOT EXISTS
                    FOR (s:ScraperMetadata) ON (s.parentScraperId)
                `),
                {
                    service: 'ScraperGraphVersioning',
                    operation: 'createIndex',
                    logger
                }
            );

            // Add scraper ownership property to navigation nodes
            // This is done via a relationship, not a property, for better querying
            console.log('✅ ScraperGraphVersioning initialized');
        } finally {
            await session.close();
        }
    }

    /**
     * Register a scraper with its metadata
     */
    async registerScraper(metadata: ScraperMetadata): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(`
                MERGE (s:ScraperMetadata {scraperId: $scraperId})
                SET s.scraperName = $scraperName,
                    s.parentScraperId = $parentScraperId,
                    s.version = $version,
                    s.createdAt = COALESCE(s.createdAt, $createdAt),
                    s.updatedAt = $updatedAt,
                    s.metadata = $metadata
            `, {
                scraperId: metadata.scraperId,
                scraperName: metadata.scraperName,
                parentScraperId: metadata.parentScraperId || null,
                version: metadata.version,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                metadata: metadata.metadata ? JSON.stringify(metadata.metadata) : null
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Get scraper metadata
     */
    async getScraperMetadata(scraperId: string): Promise<ScraperMetadata | null> {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})
                RETURN s
            `, { scraperId });

            if (result.records.length === 0) {
                return null;
            }

            const props = result.records[0].get('s').properties;
            return {
                scraperId: props.scraperId,
                scraperName: props.scraperName,
                parentScraperId: props.parentScraperId,
                version: props.version,
                createdAt: props.createdAt,
                updatedAt: props.updatedAt,
                metadata: props.metadata ? JSON.parse(props.metadata) : undefined
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get all child scrapers of a parent
     */
    async getChildScrapers(parentScraperId: string): Promise<ScraperMetadata[]> {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (s:ScraperMetadata {parentScraperId: $parentScraperId})
                RETURN s
                ORDER BY s.createdAt
            `, { parentScraperId });

            return result.records.map(record => {
                const props = record.get('s').properties;
                return {
                    scraperId: props.scraperId,
                    scraperName: props.scraperName,
                    parentScraperId: props.parentScraperId,
                    version: props.version,
                    createdAt: props.createdAt,
                    updatedAt: props.updatedAt,
                    metadata: props.metadata ? JSON.parse(props.metadata) : undefined
                };
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Mark a navigation node as owned by a scraper
     * @param nodeUrl - URL of the node
     * @param scraperId - ID of the scraper
     * @param version - Optional version tag
     * @param scraperSpecific - If true, marks node as scraper-specific (won't transfer upstream)
     */
    async assignNodeToScraper(
        nodeUrl: string, 
        scraperId: string, 
        version?: string,
        scraperSpecific: boolean = false
    ): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(`
                MATCH (n:NavigationNode {url: $nodeUrl})
                MATCH (s:ScraperMetadata {scraperId: $scraperId})
                MERGE (s)-[r:OWNS]->(n)
                SET r.version = COALESCE($version, s.version),
                    r.assignedAt = $assignedAt,
                    r.scraperSpecific = $scraperSpecific
            `, {
                nodeUrl,
                scraperId,
                version: version || null,
                assignedAt: new Date().toISOString(),
                scraperSpecific: scraperSpecific
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Mark a node as scraper-specific (won't transfer upstream to parent)
     */
    async markNodeAsScraperSpecific(nodeUrl: string, scraperId: string): Promise<void> {
        await this.assignNodeToScraper(nodeUrl, scraperId, undefined, true);
    }

    /**
     * Check if a node is scraper-specific for a given scraper
     */
    async isNodeScraperSpecific(nodeUrl: string, scraperId: string): Promise<boolean> {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})-[r:OWNS]->(n:NavigationNode {url: $nodeUrl})
                RETURN r.scraperSpecific as scraperSpecific
            `, {
                nodeUrl,
                scraperId
            });

            if (result.records.length === 0) {
                return false;
            }

            return result.records[0].get('scraperSpecific') === true;
        } finally {
            await session.close();
        }
    }

    /**
     * Get scraper-specific nodes (nodes that don't transfer upstream)
     */
    async getScraperSpecificNodes(scraperId: string): Promise<NavigationNode[]> {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})-[r:OWNS]->(n:NavigationNode)
                WHERE r.scraperSpecific = true
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n, collect(child.url) as children
            `, { scraperId });

            return this.mapNodesFromResult(result);
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes owned by a scraper (including inherited from parent)
     */
    async getScraperNodes(scraperId: string, includeInherited: boolean = true): Promise<NavigationNode[]> {
        const session = this.driver.session();
        try {
            if (includeInherited) {
                // Get nodes from this scraper and all ancestors
                // First, get the scraper and its parent chain
                const metadata = await this.getScraperMetadata(scraperId);
                if (!metadata) {
                    return [];
                }

                // Build list of scraper IDs to query (this scraper + all ancestors)
                const scraperIds: string[] = [scraperId];
                let currentParent = metadata.parentScraperId;
                const visited = new Set<string>([scraperId]);
                
                // Traverse parent chain (with cycle protection)
                while (currentParent && !visited.has(currentParent)) {
                    visited.add(currentParent);
                    scraperIds.push(currentParent);
                    const parentMeta = await this.getScraperMetadata(currentParent);
                    currentParent = parentMeta?.parentScraperId;
                }

                // Get all nodes from these scrapers
                const result = await session.run(`
                    UNWIND $scraperIds as sid
                    MATCH (scraper:ScraperMetadata {scraperId: sid})-[:OWNS]->(n:NavigationNode)
                    OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                    WITH DISTINCT n, collect(child.url) as children
                    RETURN n, children
                `, { scraperIds });

                return this.mapNodesFromResult(result);
            } else {
                // Only get nodes directly owned by this scraper
                const result = await session.run(`
                    MATCH (s:ScraperMetadata {scraperId: $scraperId})-[:OWNS]->(n:NavigationNode)
                    OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                    RETURN n, collect(child.url) as children
                `, { scraperId });

                return this.mapNodesFromResult(result);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Pull graph from parent scraper and merge into child scraper
     * Similar to git pull - merges parent's graph into child's graph
     */
    async pullFromParent(
        childScraperId: string,
        options: MergeOptions = {}
    ): Promise<GraphMergeResult> {
        const session = this.driver.session();
        try {
            // Get child scraper metadata
            const childMetadata = await this.getScraperMetadata(childScraperId);
            if (!childMetadata) {
                throw new Error(`Scraper ${childScraperId} not found`);
            }

            if (!childMetadata.parentScraperId) {
                throw new Error(`Scraper ${childScraperId} has no parent scraper`);
            }

            // Get parent nodes
            const parentNodes = await this.getScraperNodes(childMetadata.parentScraperId, false);
            
            // Get child nodes
            const childNodes = await this.getScraperNodes(childScraperId, false);

            // Merge nodes
            const mergeResult = await this.mergeNodes(
                parentNodes,
                childNodes,
                childScraperId,
                options
            );

            // Update child scraper version
            await this.updateScraperVersion(childScraperId, options.versionTag);

            return mergeResult;
        } finally {
            await session.close();
        }
    }

    /**
     * Merge parent nodes into child nodes
     */
    private async mergeNodes(
        parentNodes: NavigationNode[],
        childNodes: NavigationNode[],
        childScraperId: string,
        options: MergeOptions
    ): Promise<GraphMergeResult> {
        const session = this.driver.session();
        const result: GraphMergeResult = {
            merged: 0,
            added: 0,
            updated: 0,
            conflicts: [],
            skipped: 0
        };

        const childNodeMap = new Map<string, NavigationNode>();
        childNodes.forEach(node => childNodeMap.set(node.url, node));

        try {
            for (const parentNode of parentNodes) {
                const childNode = childNodeMap.get(parentNode.url);

                if (!childNode) {
                    // New node from parent - add it
                    await this.addNodeFromParent(parentNode, childScraperId);
                    result.added++;
                } else {
                    // Node exists in both - merge or conflict
                    const conflict = this.detectConflict(parentNode, childNode);
                    
                    if (conflict) {
                        result.conflicts.push(conflict);
                        
                        // Resolve conflict based on strategy
                        const resolved = await this.resolveConflict(
                            conflict,
                            parentNode,
                            childNode,
                            options
                        );

                        if (resolved) {
                            await this.updateMergedNode(resolved, childScraperId);
                            result.merged++;
                        } else {
                            result.skipped++;
                        }
                    } else {
                        // No conflict - merge properties
                        const merged = this.mergeNodeProperties(parentNode, childNode);
                        await this.updateMergedNode(merged, childScraperId);
                        result.updated++;
                    }
                }
            }

            // Handle child-specific nodes (not in parent)
            if (options.preserveChildNodes !== false) {
                for (const childNode of childNodes) {
                    if (!parentNodes.find(p => p.url === childNode.url)) {
                        // Keep child-specific node, preserve scraper-specific flag
                        const isScraperSpecific = await this.isNodeScraperSpecific(childNode.url, childScraperId);
                        await this.assignNodeToScraper(childNode.url, childScraperId, undefined, isScraperSpecific);
                        result.merged++;
                    }
                }
            }

            return result;
        } finally {
            await session.close();
        }
    }

    /**
     * Detect conflicts between parent and child nodes
     */
    private detectConflict(
        parentNode: NavigationNode,
        childNode: NavigationNode
    ): GraphConflict | null {
        const propertyDetails: GraphConflict['propertyDetails'] = [];
        const suggestedActions: string[] = [];

        // Check property conflicts with detailed information
        const propertiesToCheck: Array<{
            key: keyof NavigationNode;
            severity: 'critical' | 'moderate' | 'minor';
        }> = [
            { key: 'type', severity: 'critical' },
            { key: 'title', severity: 'moderate' },
            { key: 'filePath', severity: 'minor' },
            { key: 'uri', severity: 'moderate' },
            { key: 'schemaType', severity: 'moderate' },
            { key: 'sourceUrl', severity: 'minor' }
        ];

        for (const { key, severity } of propertiesToCheck) {
            const parentVal = parentNode[key];
            const childVal = childNode[key];
            
            if (this.valuesDiffer(parentVal, childVal)) {
                propertyDetails.push({
                    property: key as string,
                    parentValue: parentVal,
                    childValue: childVal,
                    severity
                });

                // Add suggested actions based on conflict type
                if (key === 'type') {
                    suggestedActions.push(`Type mismatch: parent has "${parentVal}", child has "${childVal}". Choose the correct document type.`);
                } else if (key === 'title') {
                    suggestedActions.push(`Title changed: parent="${parentVal}", child="${childVal}". Consider keeping the more recent or accurate title.`);
                }
            }
        }

        // Check xpaths conflicts
        if (parentNode.xpaths || childNode.xpaths) {
            const parentXpaths = JSON.stringify(parentNode.xpaths || {});
            const childXpaths = JSON.stringify(childNode.xpaths || {});
            if (parentXpaths !== childXpaths) {
                propertyDetails.push({
                    property: 'xpaths',
                    parentValue: parentNode.xpaths,
                    childValue: childNode.xpaths,
                    severity: 'moderate'
                });
                suggestedActions.push(`XPath selectors differ. Merge to combine both sets, or choose the more accurate version.`);
            }
        }

        // Check children conflicts
        const parentChildren = new Set(parentNode.children || []);
        const childChildren = new Set(childNode.children || []);
        const childrenAdded = Array.from(childChildren).filter(c => !parentChildren.has(c));
        const childrenRemoved = Array.from(parentChildren).filter(c => !childChildren.has(c));
        const hasChildrenConflict = childrenAdded.length > 0 || childrenRemoved.length > 0;

        const childrenDetails = hasChildrenConflict ? {
            parentChildren: Array.from(parentChildren),
            childChildren: Array.from(childChildren),
            added: childrenAdded,
            removed: childrenRemoved
        } : undefined;

        if (hasChildrenConflict) {
            if (childrenAdded.length > 0) {
                suggestedActions.push(`Child node links added in child: ${childrenAdded.slice(0, 3).join(', ')}${childrenAdded.length > 3 ? '...' : ''}`);
            }
            if (childrenRemoved.length > 0) {
                suggestedActions.push(`Child node links removed in child: ${childrenRemoved.slice(0, 3).join(', ')}${childrenRemoved.length > 3 ? '...' : ''}`);
            }
            suggestedActions.push(`Use 'merge' strategy to combine all child references, or choose parent/child to keep specific structure.`);
        }

        if (propertyDetails.length === 0 && !hasChildrenConflict) {
            return null;
        }

        const conflictType: 'property' | 'children' | 'both' = 
            propertyDetails.length > 0 && hasChildrenConflict ? 'both' :
            propertyDetails.length > 0 ? 'property' :
            'children';

        return {
            nodeUrl: parentNode.url,
            conflictType,
            parentValue: parentNode,
            childValue: childNode,
            property: propertyDetails[0]?.property, // Keep for backward compatibility
            propertyDetails: propertyDetails.length > 0 ? propertyDetails : undefined,
            childrenDetails,
            suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined
        };
    }

    /**
     * Check if two values differ (handles null/undefined and objects)
     */
    private valuesDiffer(a: unknown, b: unknown): boolean {
        if (a === undefined || a === null) {
            return b !== undefined && b !== null;
        }
        if (b === undefined || b === null) {
            return true;
        }
        if (typeof a === 'object' && typeof b === 'object') {
            return JSON.stringify(a) !== JSON.stringify(b);
        }
        return a !== b;
    }

    /**
     * Resolve a conflict based on merge strategy
     */
    private async resolveConflict(
        conflict: GraphConflict,
        parentNode: NavigationNode,
        childNode: NavigationNode,
        options: MergeOptions
    ): Promise<NavigationNode | null> {
        const strategy = options.conflictResolution || 'merge';

        switch (strategy) {
            case 'parent':
                // Always use parent value
                conflict.resolution = 'parent';
                conflict.resolvedValue = parentNode;
                return parentNode;

            case 'child':
                // Always use child value
                conflict.resolution = 'child';
                conflict.resolvedValue = childNode;
                return childNode;

            case 'merge': {
                // Merge properties intelligently
                conflict.resolution = 'merge';
                const merged = this.mergeNodeProperties(parentNode, childNode, true);
                conflict.resolvedValue = merged;
                return merged;
            }

            case 'prompt':
                // Would need user interaction - for now, skip
                return null;

            default:
                return null;
        }
    }

    /**
     * Merge node properties intelligently
     */
    private mergeNodeProperties(
        parentNode: NavigationNode,
        childNode: NavigationNode,
        preferChild: boolean = false
    ): NavigationNode {
        // Merge children - union of both sets
        const mergedChildren = new Set([
            ...(parentNode.children || []),
            ...(childNode.children || [])
        ]);

        // For properties, prefer child if it exists, otherwise use parent
        return {
            url: parentNode.url, // URL is the key, must match
            type: childNode.type || parentNode.type,
            title: preferChild 
                ? (childNode.title || parentNode.title)
                : (parentNode.title || childNode.title),
            filePath: preferChild
                ? (childNode.filePath || parentNode.filePath)
                : (parentNode.filePath || childNode.filePath),
            children: Array.from(mergedChildren),
            lastVisited: childNode.lastVisited || parentNode.lastVisited,
            xpaths: { ...parentNode.xpaths, ...childNode.xpaths },
            content: childNode.content || parentNode.content,
            embedding: childNode.embedding || (childNode as any).vector || parentNode.embedding || (parentNode as any).vector,
            uri: childNode.uri || parentNode.uri,
            schemaType: childNode.schemaType || parentNode.schemaType,
            sourceUrl: childNode.sourceUrl || parentNode.sourceUrl
        };
    }

    /**
     * Add a node from parent to child scraper
     * Note: Nodes from parent are NOT marked as scraper-specific
     */
    private async addNodeFromParent(
        node: NavigationNode,
        childScraperId: string
    ): Promise<void> {
        const session = this.driver.session();
        try {
            // Ensure node exists in graph
            await session.run(`
                MERGE (n:NavigationNode {url: $url})
                SET n = $properties
            `, {
                url: node.url,
                properties: {
                    url: node.url,
                    type: node.type,
                    title: node.title,
                    filePath: node.filePath,
                    lastVisited: node.lastVisited,
                    schemaType: node.schemaType,
                    uri: node.uri,
                    sourceUrl: node.sourceUrl,
                    updatedAt: new Date().toISOString(),
                    ...(node.xpaths && { xpaths: JSON.stringify(node.xpaths) })
                }
            });

            // Assign to child scraper (NOT scraper-specific, as it came from parent)
            await this.assignNodeToScraper(node.url, childScraperId, undefined, false);

            // Add children relationships
            if (node.children && node.children.length > 0) {
                await session.run(`
                    MATCH (parent:NavigationNode {url: $url})
                    UNWIND $children AS childUrl
                    MERGE (child:NavigationNode {url: childUrl})
                    MERGE (parent)-[:LINKS_TO]->(child)
                `, {
                    url: node.url,
                    children: node.children
                });
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Update a merged node
     */
    private async updateMergedNode(
        node: NavigationNode,
        childScraperId: string
    ): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(`
                MATCH (n:NavigationNode {url: $url})
                SET n.type = $type,
                    n.title = $title,
                    n.filePath = $filePath,
                    n.lastVisited = $lastVisited,
                    n.schemaType = $schemaType,
                    n.uri = $uri,
                    n.sourceUrl = $sourceUrl,
                    n.updatedAt = $updatedAt
                    ${node.xpaths ? ', n.xpaths = $xpaths' : ''}
            `, {
                url: node.url,
                type: node.type,
                title: node.title,
                filePath: node.filePath,
                lastVisited: node.lastVisited,
                schemaType: node.schemaType,
                uri: node.uri,
                sourceUrl: node.sourceUrl,
                updatedAt: new Date().toISOString(),
                ...(node.xpaths && { xpaths: JSON.stringify(node.xpaths) })
            });

            // Update children relationships
            await session.run(`
                MATCH (parent:NavigationNode {url: $url})
                OPTIONAL MATCH (parent)-[r:LINKS_TO]->()
                DELETE r
                WITH parent
                UNWIND $children AS childUrl
                MERGE (child:NavigationNode {url: childUrl})
                MERGE (parent)-[:LINKS_TO]->(child)
            `, {
                url: node.url,
                children: node.children || []
            });

            // Ensure ownership
            await this.assignNodeToScraper(node.url, childScraperId);
        } finally {
            await session.close();
        }
    }

    /**
     * Update scraper version
     */
    private async updateScraperVersion(
        scraperId: string,
        versionTag?: string
    ): Promise<void> {
        const session = this.driver.session();
        try {
            if (versionTag) {
                await session.run(`
                    MATCH (s:ScraperMetadata {scraperId: $scraperId})
                    SET s.version = $version,
                        s.updatedAt = $updatedAt
                `, {
                    scraperId,
                    version: versionTag,
                    updatedAt: new Date().toISOString()
                });
            } else {
                // Auto-increment patch version
                await session.run(`
                    MATCH (s:ScraperMetadata {scraperId: $scraperId})
                    SET s.updatedAt = $updatedAt
                `, {
                    scraperId,
                    updatedAt: new Date().toISOString()
                });
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Helper to map Neo4j result to NavigationNode array
     */
    private mapNodesFromResult(result: { records: Array<{ get: (key: string) => { properties: Record<string, unknown> } | string[] }> }): NavigationNode[] {
        return result.records.map((record) => {
            const nValue = record.get('n');
            const nodeProps = typeof nValue === 'object' && nValue !== null && 'properties' in nValue ? nValue.properties : {};
            const childrenValue = record.get('children');
            const children = Array.isArray(childrenValue) ? childrenValue.filter((c: string | null) => c !== null) : [];

            // Safely parse xpaths if present
            let xpaths: { [key: string]: string } | undefined;
            if (nodeProps.xpaths) {
                try {
                    xpaths = typeof nodeProps.xpaths === 'string' 
                        ? JSON.parse(nodeProps.xpaths) 
                        : nodeProps.xpaths;
                } catch (error) {
                    console.warn(`Failed to parse xpaths for node ${nodeProps.url}:`, error);
                    xpaths = undefined;
                }
            }

            return {
                url: String(nodeProps.url || ''),
                type: String(nodeProps.type || 'page'),
                title: nodeProps.title ? String(nodeProps.title) : undefined,
                filePath: nodeProps.filePath ? String(nodeProps.filePath) : undefined,
                children: children as string[],
                lastVisited: nodeProps.lastVisited ? String(nodeProps.lastVisited) : undefined,
                schemaType: nodeProps.schemaType ? String(nodeProps.schemaType) : undefined,
                uri: nodeProps.uri ? String(nodeProps.uri) : undefined,
                sourceUrl: nodeProps.sourceUrl ? String(nodeProps.sourceUrl) : String(nodeProps.url || ''),
                ...(xpaths && { xpaths })
            } as NavigationNode;
        });
    }

    /**
     * Create inheritance relationship between parent and child scrapers
     */
    async createInheritanceRelationship(
        parentScraperId: string,
        childScraperId: string
    ): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(`
                MATCH (parent:ScraperMetadata {scraperId: $parentScraperId})
                MATCH (child:ScraperMetadata {scraperId: $childScraperId})
                MERGE (child)-[:INHERITS_FROM]->(parent)
            `, {
                parentScraperId,
                childScraperId
            });
        } finally {
            await session.close();
        }
    }
}

