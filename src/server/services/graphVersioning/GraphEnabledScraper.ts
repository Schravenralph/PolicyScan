/**
 * Graph-Enabled Scraper Mixin
 * 
 * Provides graph versioning and inheritance capabilities to scrapers
 */

import type { NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { GraphVersionManager } from './GraphVersionManager.js';
import { GraphMerger, ConflictResolutionStrategy } from './GraphMerger.js';

export interface GraphEnabledScraper {
    /**
     * Get the scraper name (used for versioning)
     */
    getScraperName(): string;

    /**
     * Get parent scraper name (if any)
     */
    getParentScraperName?(): string | undefined;

    /**
     * Save current graph state
     */
    saveGraph(graphData: NavigationGraphData, metadata?: Record<string, unknown>): Promise<string>;

    /**
     * Load current graph state
     */
    loadGraph(): Promise<NavigationGraphData | null>;

    /**
     * Merge graph from parent scraper
     */
    mergeFromParent(
        parentVersion?: string,
        resolutionStrategy?: ConflictResolutionStrategy
    ): Promise<NavigationGraphData>;

    /**
     * Seed graph: inherit from parent, merge, and save
     */
    seedGraph(
        additionalNodes?: NavigationGraphData,
        resolutionStrategy?: ConflictResolutionStrategy
    ): Promise<NavigationGraphData>;
}

/**
 * Mixin class that adds graph versioning capabilities
 */
export class GraphEnabledMixin {
    protected versionManager: GraphVersionManager;
    protected merger: GraphMerger;
    protected scraperName: string;
    protected parentScraperName?: string;

    constructor(scraperName: string, parentScraperName?: string) {
        this.scraperName = scraperName;
        this.parentScraperName = parentScraperName;
        this.versionManager = new GraphVersionManager();
        this.merger = new GraphMerger(this.versionManager);
    }

    /**
     * Get the scraper name
     */
    getScraperName(): string {
        return this.scraperName;
    }

    /**
     * Get parent scraper name
     */
    getParentScraperName(): string | undefined {
        return this.parentScraperName;
    }

    /**
     * Save current graph state
     */
    async saveGraph(graphData: NavigationGraphData, metadata?: Record<string, unknown>): Promise<string> {
        // Get parent version info if exists
        const parentVersion = this.parentScraperName 
            ? await this.getLatestParentVersion()
            : undefined;

        const version = await this.versionManager.saveSnapshot(
            this.scraperName,
            graphData,
            undefined, // Auto-generate version
            this.parentScraperName,
            parentVersion,
            metadata
        );

        console.log(`💾 Saved graph for ${this.scraperName} as version ${version}`);
        return version;
    }

    /**
     * Load current graph state
     */
    async loadGraph(): Promise<NavigationGraphData | null> {
        return this.versionManager.loadCurrentGraph(this.scraperName);
    }

    /**
     * Load a specific version
     */
    async loadGraphVersion(version: string): Promise<NavigationGraphData | null> {
        const snapshot = await this.versionManager.loadSnapshot(this.scraperName, version);
        return snapshot?.data || null;
    }

    /**
     * Merge graph from parent scraper
     */
    async mergeFromParent(
        parentVersion?: string,
        resolutionStrategy: ConflictResolutionStrategy = 'merge'
    ): Promise<NavigationGraphData> {
        if (!this.parentScraperName) {
            throw new Error(`Scraper ${this.scraperName} has no parent scraper defined`);
        }

        console.log(`🔄 Merging graph from parent ${this.parentScraperName}...`);
        const result = await this.merger.mergeFromParent(
            this.scraperName,
            this.parentScraperName,
            parentVersion,
            resolutionStrategy
        );

        if (result.conflicts.length > 0) {
            console.log(`⚠️  Found ${result.conflicts.length} conflicts during merge`);
            result.conflicts.forEach(conflict => {
                console.log(`  - ${conflict.nodeUrl}: ${conflict.conflictType}`);
            });
        }

        console.log(`✅ Merge complete: ${result.stats.nodesFromParent} from parent, ${result.stats.nodesFromChild} from child, ${result.stats.nodesMerged} merged`);

        return result.mergedGraph;
    }

    /**
     * Seed graph: inherit from parent, merge, and save
     */
    async seedGraph(
        additionalNodes?: NavigationGraphData,
        resolutionStrategy: ConflictResolutionStrategy = 'merge'
    ): Promise<NavigationGraphData> {
        console.log(`🌱 Seeding graph for ${this.scraperName}...`);

        let mergedGraph: NavigationGraphData;

        // Start with parent graph if available
        if (this.parentScraperName) {
            mergedGraph = await this.mergeFromParent(undefined, resolutionStrategy);
        } else {
            // No parent - start fresh
            mergedGraph = { nodes: {}, rootUrl: '' };
        }

        // Add child-specific nodes
        if (additionalNodes) {
            const childNodes = additionalNodes.nodes || {};
            for (const [url, node] of Object.entries(childNodes)) {
                if (!mergedGraph.nodes[url]) {
                    // New node - add it
                    mergedGraph.nodes[url] = { ...node };
                } else {
                    // Conflict - use child value (child-specific overrides parent)
                    mergedGraph.nodes[url] = { ...node };
                }
            }

            // Reconcile children arrays
            this.reconcileChildren(mergedGraph);
        }

        // Save the seeded graph
        await this.saveGraph(mergedGraph, {
            seeded: true,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Graph seeded: ${Object.keys(mergedGraph.nodes).length} total nodes`);
        return mergedGraph;
    }

    /**
     * Get latest parent version
     */
    private async getLatestParentVersion(): Promise<string | undefined> {
        if (!this.parentScraperName) {
            return undefined;
        }

        const versions = await this.versionManager.listVersions(this.parentScraperName);
        return versions.length > 0 ? versions[versions.length - 1].version : undefined;
    }

    /**
     * Reconcile children arrays to ensure all referenced nodes exist
     */
    private reconcileChildren(graph: NavigationGraphData): void {
        const validUrls = new Set(Object.keys(graph.nodes));

        for (const url of Object.keys(graph.nodes)) {
            const node = graph.nodes[url];
            if (node.children && node.children.length > 0) {
                node.children = node.children.filter(childUrl => validUrls.has(childUrl));
            }
        }
    }

    /**
     * List all versions for this scraper
     */
    async listVersions() {
        return this.versionManager.listVersions(this.scraperName);
    }
}

