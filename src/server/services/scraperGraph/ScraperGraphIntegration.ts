/**
 * Scraper Graph Integration Helper
 * 
 * Provides a convenient interface for scrapers to integrate with the graph
 * versioning and inheritance system. Makes it easy to:
 * - Add scraper-specific nodes discovered during exploration
 * - Ensure nodes are properly tagged and won't transfer upstream
 * - Seed scrapers with inheritance from parent
 * - Track which nodes are "own" vs "inherited"
 */

import { Driver } from 'neo4j-driver';
import { NavigationNode } from '../graphs/navigation/NavigationGraph.js';
import { UnifiedGraphSeeder } from './UnifiedGraphSeeder.js';
import { ScraperMetadata } from './ScraperGraphVersioning.js';
import { BaseScraper } from '../scrapers/baseScraper.js';

export interface ScraperGraphIntegrationOptions {
    /**
     * Whether to automatically pull from parent when adding nodes
     */
    autoPullFromParent?: boolean;
    
    /**
     * Conflict resolution strategy for pulls
     */
    conflictResolution?: 'parent' | 'child' | 'merge';
    
    /**
     * Whether to save version snapshots automatically
     */
    autoVersion?: boolean;
}

/**
 * Helper class for scrapers to integrate with graph versioning
 */
export class ScraperGraphIntegration {
    private seeder: UnifiedGraphSeeder;
    private scraperId: string;
    private options: Required<ScraperGraphIntegrationOptions>;

    constructor(
        driver: Driver,
        scraperId: string,
        options: ScraperGraphIntegrationOptions = {}
    ) {
        this.seeder = new UnifiedGraphSeeder(driver);
        this.scraperId = scraperId;
        this.options = {
            autoPullFromParent: options.autoPullFromParent ?? false,
            conflictResolution: options.conflictResolution ?? 'merge',
            autoVersion: options.autoVersion ?? false
        };
    }

    /**
     * Initialize the integration (must be called before use)
     */
    async initialize(): Promise<void> {
        await this.seeder.initialize();
    }

    /**
     * Seed a scraper with inheritance from parent
     * This is the main entry point for setting up a scraper's graph
     * Automatically runs the scraper to discover nodes during seeding
     */
    async seedScraper(
        scraper: BaseScraper,
        metadata: ScraperMetadata,
        options: {
            conflictResolution?: 'parent' | 'child' | 'merge';
            saveVersion?: boolean;
            runScraper?: boolean; // Whether to run scraper to discover nodes (default: true)
        } = {}
    ) {
        return this.seeder.seedScraper(scraper, metadata, {
            conflictResolution: options.conflictResolution || this.options.conflictResolution,
            saveVersion: options.saveVersion ?? this.options.autoVersion,
            addScraperSpecificNodes: true,
            preserveChildNodes: true
        });
    }

    /**
     * Add a node discovered by this scraper during exploration
     * This node will be tagged as scraper-specific and won't transfer upstream
     */
    async addDiscoveredNode(
        node: NavigationNode,
        version?: string
    ): Promise<void> {
        // Add the node to the graph and tag it as owned by this scraper
        await this.seeder.addScraperNode(node, this.scraperId, version);
    }

    /**
     * Add multiple nodes discovered during exploration
     */
    async addDiscoveredNodes(
        nodes: NavigationNode[],
        version?: string
    ): Promise<{
        added: number;
        errors: string[];
    }> {
        const errors: string[] = [];
        let added = 0;

        for (const node of nodes) {
            try {
                await this.addDiscoveredNode(node, version);
                added++;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to add node ${node.url}: ${errorMsg}`);
            }
        }

        return { added, errors };
    }

    /**
     * Pull latest graph from parent scraper (like git pull)
     */
    async pullFromParent(options: {
        conflictResolution?: 'parent' | 'child' | 'merge';
        saveVersion?: boolean;
    } = {}) {
        return this.seeder.pullFromParent(this.scraperId, {
            conflictResolution: options.conflictResolution || this.options.conflictResolution,
            saveVersion: options.saveVersion ?? this.options.autoVersion,
            preserveChildNodes: true
        });
    }

    /**
     * Get all nodes for this scraper (including inherited from parent)
     */
    async getAllNodes(includeInherited: boolean = true): Promise<NavigationNode[]> {
        const status = await this.seeder.getGraphStatus(this.scraperId);
        if (!status.registered) {
            return [];
        }

        // Use the public method instead of accessing internal versioning service
        return this.seeder.getScraperNodes(this.scraperId, includeInherited);
    }

    /**
     * Get only nodes discovered by this scraper (not inherited)
     */
    async getOwnNodes(): Promise<NavigationNode[]> {
        return this.getAllNodes(false);
    }

    /**
     * Get only inherited nodes from parent
     */
    async getInheritedNodes(): Promise<NavigationNode[]> {
        const allNodes = await this.getAllNodes(true);
        const ownNodes = await this.getOwnNodes();
        const ownUrls = new Set(ownNodes.map(n => n.url));
        
        return allNodes.filter(n => !ownUrls.has(n.url));
    }

    /**
     * Get graph status for this scraper
     */
    async getStatus() {
        return this.seeder.getGraphStatus(this.scraperId);
    }

    /**
     * Check if a node is owned by this scraper (not inherited)
     */
    async isOwnNode(nodeUrl: string): Promise<boolean> {
        const ownNodes = await this.getOwnNodes();
        return ownNodes.some(n => n.url === nodeUrl);
    }

    /**
     * Check if a node is inherited from parent
     */
    async isInheritedNode(nodeUrl: string): Promise<boolean> {
        const inheritedNodes = await this.getInheritedNodes();
        return inheritedNodes.some(n => n.url === nodeUrl);
    }

    /**
     * List all versions of this scraper's graph
     */
    async listVersions() {
        return this.seeder.listVersions(this.scraperId);
    }

    /**
     * Load a specific version of the graph
     */
    async loadVersion(version?: string) {
        return this.seeder.loadVersion(this.scraperId, version);
    }

    /**
     * Get metadata for this scraper
     */
    async getMetadata(): Promise<ScraperMetadata | null> {
        return this.seeder.getScraperMetadata(this.scraperId);
    }

    /**
     * Update scraper metadata
     */
    async updateMetadata(metadata: Partial<ScraperMetadata>): Promise<void> {
        const current = await this.getMetadata();
        if (!current) {
            throw new Error(`Scraper ${this.scraperId} is not registered`);
        }

        const updated: ScraperMetadata = {
            ...current,
            ...metadata,
            updatedAt: new Date().toISOString()
        };

        await this.seeder.registerScraper(updated);
    }
}

