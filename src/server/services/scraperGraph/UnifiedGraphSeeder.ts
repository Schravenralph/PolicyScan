/**
 * Unified Graph Seeder
 * 
 * A unified service that integrates Neo4j graph storage with file-based versioning
 * to provide git-like branching, merging, and inheritance for scraper graphs.
 * 
 * Features:
 * - Pull graph objects from parent scrapers (git-like pull)
 * - Merge parent changes into child scrapers
 * - Version graph objects (semantic versioning)
 * - Add scraper-specific nodes that don't transfer upstream
 * - Resolve conflicts automatically or manually
 */

import { Driver } from 'neo4j-driver';
import { NavigationGraph, NavigationNode, NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { ScraperGraphVersioning, ScraperMetadata, MergeOptions } from './ScraperGraphVersioning.js';
import { GraphVersionManager } from '../graphVersioning/GraphVersionManager.js';
import { GraphMerger, ConflictResolutionStrategy } from '../graphVersioning/GraphMerger.js';
import { GraphValidator, ValidationResult } from '../graphVersioning/GraphValidator.js';
import { GraphDiff, GraphDiffResult } from '../graphVersioning/GraphDiff.js';
import { ConflictReporter } from '../graphVersioning/ConflictReporter.js';
import { BaseScraper } from '../scrapers/baseScraper.js';
import { DocumentType } from '../infrastructure/types.js';

export interface SeedOptions extends Omit<MergeOptions, 'conflictResolution'> {
    /**
     * Conflict resolution strategy
     * - 'parent': Always use parent values
     * - 'child': Always use child values
     * - 'merge': Intelligently merge both
     * - 'ask': Return conflicts for manual resolution
     */
    conflictResolution?: ConflictResolutionStrategy | 'parent' | 'child' | 'merge' | 'ask';
    
    /**
     * Whether to save a version snapshot after seeding
     */
    saveVersion?: boolean;
    
    /**
     * Version tag for this seed operation
     */
    versionTag?: string;
    
    /**
     * Whether to add scraper-specific nodes discovered during scraping
     */
    addScraperSpecificNodes?: boolean;
    
    /**
     * Whether to preserve child-specific nodes (nodes not in parent)
     */
    preserveChildNodes?: boolean;
    
    /**
     * Nodes discovered during scraping that should be added as scraper-specific
     */
    discoveredNodes?: NavigationNode[];
}

export interface SeedResult {
    scraperId: string;
    version: string;
    nodesFromParent: number;
    nodesFromChild: number;
    nodesMerged: number;
    nodesAdded: number;
    conflicts: Array<{
        nodeUrl: string;
        conflictType: string;
        resolution?: string;
    }>;
    totalNodes: number;
    errors: string[];
}

export interface PullResult {
    scraperId: string;
    parentScraperId: string;
    version: string;
    nodesPulled: number;
    nodesUpdated: number;
    conflicts: Array<{
        nodeUrl: string;
        conflictType: string;
        needsResolution: boolean;
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
        suggestedActions?: string[];
    }>;
}

// Batch operation types
export interface BatchProgress {
    total: number;
    completed: number;
    current: string;
    status: 'processing' | 'completed' | 'error';
    error?: string;
}

export interface BatchResult {
    total: number;
    successful: number;
    failed: number;
    results: Array<{ scraperId: string; result: SeedResult; error?: string }>;
    summary: {
        totalNodes: number;
        totalConflicts: number;
        averageNodesPerScraper: number;
    };
}

export interface BatchPullResult {
    total: number;
    successful: number;
    failed: number;
    results: Array<{ scraperId: string; result: PullResult; error?: string }>;
    summary: {
        totalNodesPulled: number;
        totalConflicts: number;
        averageNodesPerScraper: number;
    };
}

export interface BatchValidationResult {
    total: number;
    valid: number;
    invalid: number;
    results: Array<{ scraperId: string; validation: ValidationResult; error?: string }>;
    summary: {
        totalIssues: number;
        averageIssuesPerScraper: number;
    };
}

/**
 * Unified service for seeding scrapers with graph inheritance and versioning
 */
export class UnifiedGraphSeeder {
    private driver: Driver;
    private versioning: ScraperGraphVersioning;
    private graph: NavigationGraph;
    private versionManager: GraphVersionManager;
    private validator: GraphValidator;
    private graphDiff: GraphDiff;
    private conflictReporter: ConflictReporter;

    constructor(driver: Driver) {
        this.driver = driver;
        this.versioning = new ScraperGraphVersioning(driver);
        this.graph = new NavigationGraph(driver);
        this.versionManager = new GraphVersionManager();
        this.validator = new GraphValidator(driver, this.versioning, this.versionManager);
        this.graphDiff = new GraphDiff(this.versionManager, driver, this.versioning);
        this.conflictReporter = new ConflictReporter();
    }

    /**
     * Initialize the seeder (create indexes, directories, etc.)
     */
    async initialize(): Promise<void> {
        await this.versioning.initialize();
        await this.graph.initialize();
        await this.versionManager.initialize();

        // Re-initialize services with proper dependencies if needed (though constructor already does it)
        const { GraphValidator } = await import('../graphVersioning/GraphValidator.js');
        const { GraphDiffService } = await import('../graphVersioning/GraphDiff.js');

        this.validator = new GraphValidator(this.driver, this.versioning, this.versionManager);
        this.graphDiff = new GraphDiffService(this.versionManager, this.driver, this.versioning);
    }

    /**
     * Register a scraper with metadata
     */
    async registerScraper(metadata: ScraperMetadata): Promise<void> {
        await this.versioning.registerScraper(metadata);
    }

    /**
     * Get scraper metadata
     */
    async getScraperMetadata(scraperId: string): Promise<ScraperMetadata | null> {
        return this.versioning.getScraperMetadata(scraperId);
    }

    /**
     * Pull graph objects from parent scraper (like git pull)
     * 
     * This merges the parent's graph into the child's graph,
     * handling conflicts based on the provided strategy.
     */
    async pullFromParent(
        childScraperId: string,
        options: SeedOptions = {}
    ): Promise<PullResult> {
        const errors: string[] = [];
        
        // Get child metadata
        const childMetadata = await this.versioning.getScraperMetadata(childScraperId);
        if (!childMetadata) {
            throw new Error(`Scraper ${childScraperId} is not registered. Please register it first.`);
        }

        if (!childMetadata.parentScraperId) {
            throw new Error(`Scraper ${childScraperId} has no parent scraper defined.`);
        }

        // Use Neo4j-based pull for actual graph nodes
        const mergeResult = await this.versioning.pullFromParent(childScraperId, {
            conflictResolution: this.mapConflictResolution(options.conflictResolution),
            mergeStrategy: options.mergeStrategy || 'deep',
            preserveChildNodes: options.preserveChildNodes !== false,
            versionTag: options.versionTag
        });

        // Also sync to file-based versioning for backup/versioning
        // This is critical to keep Neo4j and file system in sync
        try {
            await this.syncNeo4jToFileVersioning(childScraperId);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to sync to file versioning: ${errorMsg}`);
            // Log warning but don't fail the operation
            console.warn(`⚠️  Warning: Failed to sync Neo4j to file versioning for ${childScraperId}: ${errorMsg}`);
        }

        return {
            scraperId: childScraperId,
            parentScraperId: childMetadata.parentScraperId,
            version: childMetadata.version,
            nodesPulled: mergeResult.added,
            nodesUpdated: mergeResult.updated,
            conflicts: mergeResult.conflicts.map(c => ({
                nodeUrl: c.nodeUrl,
                conflictType: c.conflictType,
                needsResolution: !c.resolution,
                propertyDetails: c.propertyDetails,
                childrenDetails: c.childrenDetails,
                suggestedActions: c.suggestedActions
            }))
        };
    }

    /**
     * Seed a scraper: pull from parent, merge, and add scraper-specific nodes
     * 
     * This is the main method to use when seeding a scraper.
     * It handles the complete workflow:
     * 1. Register scraper (if needed)
     * 2. Pull graph from parent
     * 3. Add scraper-specific nodes
     * 4. Save version snapshot
     */
    async seedScraper(
        scraper: BaseScraper,
        metadata: ScraperMetadata,
        options: SeedOptions = {}
    ): Promise<SeedResult> {
        const errors: string[] = [];
        let version = metadata.version;

        try {
            // 1. Register scraper if needed
            const existing = await this.versioning.getScraperMetadata(metadata.scraperId);
            if (!existing) {
                await this.versioning.registerScraper(metadata);
            } else {
                // Update metadata
                await this.versioning.registerScraper({
                    ...existing,
                    ...metadata,
                    updatedAt: new Date().toISOString()
                });
            }

            // 2. Pull from parent if parent exists
            let nodesFromParent = 0;
            let nodesUpdated = 0;
            let conflicts: Array<{ nodeUrl: string; conflictType: string; resolution?: string }> = [];

            if (metadata.parentScraperId) {
                try {
                    const pullResult = await this.pullFromParent(metadata.scraperId, options);
                    nodesFromParent = pullResult.nodesPulled;
                    nodesUpdated = pullResult.nodesUpdated;
                    conflicts = pullResult.conflicts.map(c => ({
                        nodeUrl: c.nodeUrl,
                        conflictType: c.conflictType,
                        resolution: c.needsResolution ? undefined : 'auto-resolved'
                    }));
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to pull from parent: ${errorMsg}`);
                }
            }

            // 3. Add scraper-specific nodes (nodes discovered by this scraper)
            let nodesAdded = 0;
            if (options.addScraperSpecificNodes !== false) {
                try {
                    // Discover nodes by running the scraper (if not already provided)
                    let discoveredNodes: NavigationNode[] = options.discoveredNodes || [];
                    
                    if (discoveredNodes.length === 0) {
                        // Automatically discover nodes by running the scraper's scrape method
                        console.log(`🔍 Discovering nodes from scraper: ${metadata.scraperId}`);
                        discoveredNodes = await this.discoverNodesFromScraper(
                            scraper,
                            '', // query
                            String(metadata.metadata?.onderwerp || ''),
                            String(metadata.metadata?.thema || '')
                        );
                        console.log(`📊 Discovered ${discoveredNodes.length} nodes from scraper`);
                    }
                    
                    // Add discovered nodes as scraper-specific (if not in parent)
                    if (discoveredNodes.length > 0) {
                        const discoveredCount = await this.discoverAndAddScraperSpecificNodes(
                            metadata.scraperId,
                            discoveredNodes
                        );
                        nodesAdded = discoveredCount;
                    } else {
                        // Count existing scraper-specific nodes if no new nodes were discovered
                        const scraperSpecificNodes = await this.versioning.getScraperSpecificNodes(metadata.scraperId);
                        nodesAdded = scraperSpecificNodes.length;
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to discover/add scraper-specific nodes: ${errorMsg}`);
                    console.warn(`⚠️  Error discovering nodes: ${errorMsg}`);
                }
            }

            // 4. Get total node count (including inherited)
            const allNodes = await this.versioning.getScraperNodes(metadata.scraperId, true);
            const totalNodes = allNodes.length;

            // 5. Save version snapshot if requested (and sync to file system)
            if (options.saveVersion !== false) {
                try {
                    // Sync Neo4j to file-based versioning
                    await this.syncNeo4jToFileVersioning(metadata.scraperId);
                    
                    // Get the version that was just saved
                    const versions = await this.versionManager.listVersions(metadata.scraperId);
                    if (versions.length > 0) {
                        version = versions[versions.length - 1].version;
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to save version snapshot: ${errorMsg}`);
                    console.warn(`⚠️  Warning: Failed to save version snapshot for ${metadata.scraperId}: ${errorMsg}`);
                }
            }

            return {
                scraperId: metadata.scraperId,
                version: version,
                nodesFromParent,
                nodesFromChild: nodesAdded,
                nodesMerged: nodesUpdated,
                nodesAdded,
                conflicts,
                totalNodes,
                errors
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`Seeding failed: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Add a node discovered by a scraper
     * This should be called when a scraper discovers a new node during exploration
     * @param node - The navigation node to add
     * @param scraperId - ID of the scraper that discovered it
     * @param version - Optional version tag
     * @param scraperSpecific - If true, marks as scraper-specific (won't transfer upstream)
     */
    async addScraperNode(
        node: NavigationNode,
        scraperId: string,
        version?: string,
        scraperSpecific: boolean = true
    ): Promise<void> {
        // Add to Neo4j graph
        await this.graph.addNode(node);
        
        // Assign to scraper (mark as scraper-specific by default for nodes discovered by child scrapers)
        await this.versioning.assignNodeToScraper(node.url, scraperId, version, scraperSpecific);
    }

    /**
     * Discover and add scraper-specific nodes from a scraper's exploration
     * This method extracts nodes from the navigation graph that were discovered by the scraper
     * but are not in the parent scraper's graph, and marks them as scraper-specific
     */
    async discoverAndAddScraperSpecificNodes(
        scraperId: string,
        discoveredNodes: NavigationNode[]
    ): Promise<number> {
        const metadata = await this.versioning.getScraperMetadata(scraperId);
        if (!metadata) {
            throw new Error(`Scraper ${scraperId} is not registered`);
        }

        let addedCount = 0;

        // If scraper has a parent, check which nodes are not in parent
        if (metadata.parentScraperId) {
            const parentNodes = await this.versioning.getScraperNodes(metadata.parentScraperId, false);
            const parentUrls = new Set(parentNodes.map(n => n.url));

            for (const node of discoveredNodes) {
                // If node is not in parent, it's scraper-specific
                if (!parentUrls.has(node.url)) {
                    await this.addScraperNode(node, scraperId, undefined, true);
                    addedCount++;
                } else {
                    // Node exists in parent - add it but don't mark as scraper-specific
                    await this.addScraperNode(node, scraperId, undefined, false);
                }
            }
        } else {
            // No parent - all nodes are scraper-specific (base scraper)
            for (const node of discoveredNodes) {
                await this.addScraperNode(node, scraperId, undefined, true);
                addedCount++;
            }
        }

        return addedCount;
    }

    /**
     * Merge specific nodes from parent into child
     * Useful for selective merging
     */
    async mergeNodes(
        childScraperId: string,
        nodeUrls: string[]
    ): Promise<{
        merged: number;
        conflicts: number;
    }> {
        const childMetadata = await this.versioning.getScraperMetadata(childScraperId);
        if (!childMetadata || !childMetadata.parentScraperId) {
            throw new Error(`Scraper ${childScraperId} has no parent`);
        }

        const parentNodes = await this.versioning.getScraperNodes(childMetadata.parentScraperId, false);
        const childNodes = await this.versioning.getScraperNodes(childScraperId, false);

        const parentNodeMap = new Map(parentNodes.map(n => [n.url, n]));
        const childNodeMap = new Map(childNodes.map(n => [n.url, n]));

        let merged = 0;
        let conflicts = 0;

        for (const url of nodeUrls) {
            const parentNode = parentNodeMap.get(url);
            const childNode = childNodeMap.get(url);

            if (!parentNode) continue;

            if (!childNode) {
                // New node - add it
                await this.versioning.assignNodeToScraper(url, childScraperId);
                merged++;
            } else {
                // Node exists - check for conflicts
                if (this.nodesHaveConflicts(parentNode, childNode)) {
                    conflicts++;
                }
                // Assign node (conflict resolution would be more complex and handled elsewhere)
                await this.versioning.assignNodeToScraper(url, childScraperId);
                merged++;
            }
        }

        return { merged, conflicts };
    }

    /**
     * Check if two nodes have conflicts (different structural properties)
     */
    private nodesHaveConflicts(node1: NavigationNode, node2: NavigationNode): boolean {
        // Check for structural conflicts (ignore timestamps and content)
        if (node1.type !== node2.type) return true;
        if (node1.title !== node2.title) return true;
        if (node1.filePath !== node2.filePath) return true;
        if (node1.schemaType !== node2.schemaType) return true;
        if (node1.uri !== node2.uri) return true;

        // Check children arrays (order-independent)
        const children1 = new Set(node1.children || []);
        const children2 = new Set(node2.children || []);
        if (children1.size !== children2.size) return true;
        for (const child of children1) {
            if (!children2.has(child)) return true;
        }

        // Check xpaths
        const xpaths1 = JSON.stringify(node1.xpaths || {});
        const xpaths2 = JSON.stringify(node2.xpaths || {});
        if (xpaths1 !== xpaths2) return true;

        return false;
    }

    /**
     * Get graph status for a scraper
     */
    async getGraphStatus(scraperId: string): Promise<{
        registered: boolean;
        hasParent: boolean;
        parentId?: string;
        version: string;
        totalNodes: number;
        ownNodes: number;
        inheritedNodes: number;
        fileVersions: number;
    }> {
        const metadata = await this.versioning.getScraperMetadata(scraperId);
        
        if (!metadata) {
            return {
                registered: false,
                hasParent: false,
                version: '0.0.0',
                totalNodes: 0,
                ownNodes: 0,
                inheritedNodes: 0,
                fileVersions: 0
            };
        }

        const allNodes = await this.versioning.getScraperNodes(scraperId, true);
        const ownNodes = await this.versioning.getScraperNodes(scraperId, false);
        const fileVersions = await this.versionManager.listVersions(scraperId);

        return {
            registered: true,
            hasParent: !!metadata.parentScraperId,
            parentId: metadata.parentScraperId,
            version: metadata.version,
            totalNodes: allNodes.length,
            ownNodes: ownNodes.length,
            inheritedNodes: allNodes.length - ownNodes.length,
            fileVersions: fileVersions.length
        };
    }

    /**
     * Export graph from Neo4j to NavigationGraphData format
     */
    private async exportGraphFromNeo4j(scraperId: string): Promise<NavigationGraphData | null> {
        const nodes = await this.versioning.getScraperNodes(scraperId, true);
        
        if (nodes.length === 0) {
            return null;
        }

        const nodesMap: { [url: string]: NavigationNode } = {};
        let rootUrl = '';
        
        for (const node of nodes) {
            nodesMap[node.url] = node;
            // Use the first node's sourceUrl as rootUrl, or derive from URL
            if (!rootUrl && node.sourceUrl) {
                try {
                    const url = new URL(node.sourceUrl);
                    rootUrl = `${url.protocol}//${url.hostname}`;
                } catch {
                    // Invalid URL, skip
                }
            }
        }

        return {
            nodes: nodesMap,
            rootUrl: rootUrl || '' // Extract from first node's URL if available
        };
    }

    /**
     * Sync Neo4j graph to file-based versioning
     * 
     * This ensures that the file-based version history stays in sync with Neo4j.
     * Should be called after any operation that modifies the Neo4j graph.
     * 
     * @throws Error if sync fails (caller should handle gracefully)
     */
    private async syncNeo4jToFileVersioning(scraperId: string): Promise<void> {
        const graphData = await this.exportGraphFromNeo4j(scraperId);
        if (!graphData) {
            // No graph data to sync - this is OK for new scrapers
            return;
        }

        const metadata = await this.versioning.getScraperMetadata(scraperId);
        if (!metadata) {
            throw new Error(`Cannot sync: scraper ${scraperId} is not registered`);
        }

        // Get parent version if available
        let parentVersion: string | undefined;
        if (metadata.parentScraperId) {
            const parentVersions = await this.versionManager.listVersions(metadata.parentScraperId);
            if (parentVersions.length > 0) {
                parentVersion = parentVersions[parentVersions.length - 1].version;
            }
        }

        await this.versionManager.saveSnapshot(
            scraperId,
            graphData,
            undefined, // Auto-generate version
            metadata.parentScraperId,
            parentVersion,
            {
                syncedFromNeo4j: true,
                timestamp: new Date().toISOString(),
                nodeCount: Object.keys(graphData.nodes).length
            }
        );
    }
    
    /**
     * Verify that Neo4j and file-based versioning are in sync
     * 
     * @returns true if in sync, false otherwise
     */
    async verifySync(scraperId: string): Promise<{
        inSync: boolean;
        neo4jNodeCount: number;
        fileNodeCount: number;
        differences?: string[];
    }> {
        const neo4jNodes = await this.versioning.getScraperNodes(scraperId, true);
        const neo4jNodeCount = neo4jNodes.length;
        
        const fileGraph = await this.versionManager.loadCurrentGraph(scraperId);
        const fileNodeCount = fileGraph ? Object.keys(fileGraph.nodes).length : 0;
        
        const inSync = neo4jNodeCount === fileNodeCount;
        const differences: string[] = [];
        
        if (!inSync) {
            differences.push(`Node count mismatch: Neo4j has ${neo4jNodeCount}, file has ${fileNodeCount}`);
            
            // Check for specific node differences
            const neo4jUrls = new Set(neo4jNodes.map(n => n.url));
            const fileUrls = new Set(fileGraph ? Object.keys(fileGraph.nodes) : []);
            
            const missingInFile = [...neo4jUrls].filter(url => !fileUrls.has(url));
            const missingInNeo4j = [...fileUrls].filter(url => !neo4jUrls.has(url));
            
            if (missingInFile.length > 0) {
                differences.push(`${missingInFile.length} nodes in Neo4j but not in file`);
            }
            if (missingInNeo4j.length > 0) {
                differences.push(`${missingInNeo4j.length} nodes in file but not in Neo4j`);
            }
        }
        
        return {
            inSync,
            neo4jNodeCount,
            fileNodeCount,
            differences: differences.length > 0 ? differences : undefined
        };
    }

    /**
     * Map conflict resolution strategy from string to MergeOptions format
     * 
     * Standardizes conflict resolution strategy names across different services.
     * Supports both old names ('parent-wins', 'child-wins') and new names ('parent', 'child').
     */
    private mapConflictResolution(
        strategy?: ConflictResolutionStrategy | 'parent' | 'child' | 'merge' | 'ask'
    ): 'parent' | 'child' | 'merge' | 'prompt' {
        if (!strategy) return 'merge';
        
        // Normalize strategy names
        const normalized = typeof strategy === 'string' 
            ? strategy.toLowerCase().trim()
            : 'merge';
        
        // Map to internal format
        if (normalized === 'parent' || normalized === 'parent-wins') {
            return 'parent';
        }
        if (normalized === 'child' || normalized === 'child-wins') {
            return 'child';
        }
        if (normalized === 'merge') {
            return 'merge';
        }
        if (normalized === 'ask' || normalized === 'prompt') {
            return 'prompt';
        }
        
        // For function-based strategies, default to merge
        return 'merge';
    }

    /**
     * List all versions for a scraper (from file-based versioning)
     */
    async listVersions(scraperId: string) {
        return this.versionManager.listVersions(scraperId);
    }

    /**
     * Load a specific version of a graph
     */
    async loadVersion(scraperId: string, version?: string) {
        return this.versionManager.loadSnapshot(scraperId, version);
    }

    /**
     * Get nodes for a scraper (public method for integration classes)
     * 
     * @param scraperId - The scraper ID
     * @param includeInherited - Whether to include nodes inherited from parent
     * @returns Array of navigation nodes
     */
    async getScraperNodes(scraperId: string, includeInherited: boolean = true): Promise<NavigationNode[]> {
        return this.versioning.getScraperNodes(scraperId, includeInherited);
    }

    /**
     * Get access to the versioning service (for advanced operations)
     */
    get versioningService(): ScraperGraphVersioning {
        return this.versioning;
    }

    /**
     * Get access to the validator service
     */
    get validatorService(): GraphValidator {
        return this.validator;
    }

    /**
     * Get access to the conflict reporter service
     */
    get conflictReporterService(): ConflictReporter {
        return this.conflictReporter;
    }

    /**
     * Get access to the graph diff service
     */
    get diffService(): GraphDiff {
        return this.graphDiff;
    }

    /**
     * Validate a scraper's graph
     */
    async validateScraper(scraperId: string) {
        return this.validator.validateScraperGraph(scraperId);
    }

    /**
     * Generate enhanced conflict report
     */
    async generateConflictReport(conflicts: Array<import('./ScraperGraphVersioning.js').GraphConflict>) {
        return this.conflictReporter.generateReport(conflicts);
    }

    /**
     * Compare two versions of a scraper's graph
     */
    async compareVersions(scraperId: string, fromVersion?: string, toVersion?: string) {
        return this.graphDiff.compareVersions(scraperId, fromVersion, toVersion);
    }

    /**
     * Validate a scraper's graph object
     */
    async validateGraph(graphData: NavigationGraphData, scraperId?: string): Promise<ValidationResult> {
        return this.validator.validateGraph(graphData, scraperId);
    }

    /**
     * Compare current graph with a specific version
     */
    async diffGraph(scraperId: string, version?: string): Promise<GraphDiffResult> {
        const nodes = await this.versioning.getScraperNodes(scraperId, true);
        const currentGraph = {
            nodes: Object.fromEntries(nodes.map(n => [n.url, n])),
            rootUrl: nodes[0]?.sourceUrl || ''
        };

        const versionSnapshot = await this.versionManager.loadSnapshot(scraperId, version);
        if (!versionSnapshot) {
            throw new Error(`Version ${version || 'latest'} not found for ${scraperId}`);
        }

        // compareWithVersion expects scraperId and version string, but we want to compare with graph data
        // GraphDiffService.compareWithVersion calls compareVersions(scraperId, version, undefined)
        // We need comparison between NavigationGraphData objects.
        // UnifiedGraphSeeder implementation at line 1259 called this.diffService.compareWithVersion(currentGraph, versionSnapshot)
        // But GraphDiff.ts compareWithVersion takes (scraperId: string, version: string).
        // It seems the original code was calling a non-existent signature or I misread GraphDiff.ts.
        // GraphDiff.ts: compareWithVersion(scraperId: string, version: string): Promise<GraphDiffResult>

        // I should use compareCurrentWithVersion if I want to compare DB vs File.

        return this.graphDiff.compareCurrentWithVersion(scraperId, version || 'latest');
    }

    /**
     * Compare two versions of a scraper's graph
     */
    async diffVersions(
        scraperId: string,
        fromVersion?: string,
        toVersion?: string
    ): Promise<GraphDiffResult | null> {
        try {
            return await this.graphDiff.compareVersions(scraperId, fromVersion, toVersion);
        } catch (error) {
            console.error(`Error comparing versions: ${error}`);
            return null;
        }
    }

    /**
     * Discover nodes by running the scraper's scrape method
     * Converts ScrapedDocument[] to NavigationNode[]
     */
    private async discoverNodesFromScraper(
        scraper: BaseScraper,
        query: string,
        onderwerp: string,
        thema: string
    ): Promise<NavigationNode[]> {
        try {
            // Run the scraper to discover documents
            const documents = await scraper.scrape(query, onderwerp, thema);
            
            // Convert ScrapedDocument[] to NavigationNode[]
            return documents.map(doc => ({
                url: doc.url,
                type: this.mapDocumentTypeToNodeType(doc.type_document),
                title: doc.titel,
                sourceUrl: doc.url,
                children: [],
                content: doc.samenvatting,
                schemaType: this.inferSchemaType(doc.type_document)
            }));
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️  Failed to discover nodes from scraper: ${errorMsg}`);
            return [];
        }
    }

    /**
     * Map DocumentType to NavigationNode type
     */
    private mapDocumentTypeToNodeType(docType: DocumentType): 'page' | 'section' | 'document' {
        // Webpagina maps to 'page'
        if (docType === 'Webpagina') return 'page';
        
        // All other document types map to 'document'
        return 'document';
    }

    /**
     * Infer schema.org type from document type
     */
    private inferSchemaType(docType: DocumentType): string | undefined {
        if (docType === 'Webpagina') return 'WebPage';
        if (docType === 'PDF') return 'DigitalDocument';
        return 'DigitalDocument'; // Default
    }

    /**
     * Batch operations for multiple scrapers
     */
    async batchSeedScrapers(
        scrapers: Array<{ scraper: BaseScraper; metadata: ScraperMetadata }>,
        options: SeedOptions = {},
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchResult> {
        const results: Array<{ scraperId: string; result: SeedResult; error?: string }> = [];
        const total = scrapers.length;
        let completed = 0;

        for (const { scraper, metadata } of scrapers) {
            try {
                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: metadata.scraperId,
                        status: 'processing'
                    });
                }

                const result = await this.seedScraper(scraper, metadata, options);
                results.push({ scraperId: metadata.scraperId, result });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: metadata.scraperId,
                        status: 'completed'
                    });
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({
                    scraperId: metadata.scraperId,
                    result: {
                        scraperId: metadata.scraperId,
                        version: metadata.version,
                        nodesFromParent: 0,
                        nodesFromChild: 0,
                        nodesMerged: 0,
                        nodesAdded: 0,
                        conflicts: [],
                        totalNodes: 0,
                        errors: [errorMsg]
                    },
                    error: errorMsg
                });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: metadata.scraperId,
                        status: 'error',
                        error: errorMsg
                    });
                }
            }
        }

        const successful = results.filter(r => !r.error).length;
        const failed = results.filter(r => r.error).length;
        const totalNodes = results.reduce((sum, r) => sum + r.result.totalNodes, 0);
        const totalConflicts = results.reduce((sum, r) => sum + r.result.conflicts.length, 0);

        return {
            total,
            successful,
            failed,
            results,
            summary: {
                totalNodes,
                totalConflicts,
                averageNodesPerScraper: successful > 0 ? Math.round(totalNodes / successful) : 0
            }
        };
    }

    /**
     * Batch pull from parent for multiple scrapers
     */
    async batchPullFromParent(
        scraperIds: string[],
        options: SeedOptions = {},
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchPullResult> {
        const results: Array<{ scraperId: string; result: PullResult; error?: string }> = [];
        const total = scraperIds.length;
        let completed = 0;

        for (const scraperId of scraperIds) {
            try {
                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'processing'
                    });
                }

                const result = await this.pullFromParent(scraperId, options);
                results.push({ scraperId, result });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'completed'
                    });
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({
                    scraperId,
                    result: {
                        scraperId,
                        parentScraperId: '',
                        version: '0.0.0',
                        nodesPulled: 0,
                        nodesUpdated: 0,
                        conflicts: []
                    },
                    error: errorMsg
                });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'error',
                        error: errorMsg
                    });
                }
            }
        }

        const successful = results.filter(r => !r.error).length;
        const failed = results.filter(r => r.error).length;
        const totalNodesPulled = results.reduce((sum, r) => sum + r.result.nodesPulled, 0);
        const totalConflicts = results.reduce((sum, r) => sum + r.result.conflicts.length, 0);

        return {
            total,
            successful,
            failed,
            results,
            summary: {
                totalNodesPulled,
                totalConflicts,
                averageNodesPerScraper: successful > 0 ? Math.round(totalNodesPulled / successful) : 0
            }
        };
    }

    /**
     * Batch validate multiple scrapers
     */
    async batchValidate(
        scraperIds: string[],
        onProgress?: (progress: BatchProgress) => void
    ): Promise<BatchValidationResult> {
        const { GraphValidator } = await import('../graphVersioning/GraphValidator.js');
        const validator = new GraphValidator(this.driver, this.versioning, this.versionManager);
        
        const results: Array<{ scraperId: string; validation: ValidationResult; error?: string }> = [];
        const total = scraperIds.length;
        let completed = 0;

        for (const scraperId of scraperIds) {
            try {
                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'processing'
                    });
                }

                const validation = await validator.validateScraperGraph(scraperId);
                results.push({ scraperId, validation });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'completed'
                    });
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({
                    scraperId,
                    validation: {
                        isValid: false,
                        issues: [{
                            severity: 'error',
                            type: 'validation_error',
                            message: errorMsg
                        }],
                        summary: {
                            totalNodes: 0,
                            totalEdges: 0,
                            errors: 1,
                            warnings: 0,
                            info: 0
                        }
                    },
                    error: errorMsg
                });
                completed++;

                if (onProgress) {
                    onProgress({
                        total,
                        completed,
                        current: scraperId,
                        status: 'error',
                        error: errorMsg
                    });
                }
            }
        }

        const valid = results.filter(r => r.validation.isValid && !r.error).length;
        const invalid = results.filter(r => !r.validation.isValid || r.error).length;
        const totalIssues = results.reduce((sum, r) => sum + r.validation.issues.length, 0);

        return {
            total,
            valid,
            invalid,
            results,
            summary: {
                totalIssues,
                averageIssuesPerScraper: total > 0 ? Math.round(totalIssues / total) : 0
            }
        };
    }
}
