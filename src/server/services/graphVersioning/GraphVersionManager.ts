/**
 * Graph Version Manager
 * 
 * Manages versioning of scraper graph objects similar to Git branches.
 * Handles storing graph snapshots, tracking parent-child relationships,
 * and managing versions.
 */

import fs from 'fs/promises';
import path from 'path';
import type { NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { fireAndForget } from '../../utils/initializationState.js';
import { logger } from '../../utils/logger.js';

export interface GraphVersion {
    version: string;
    scraperName: string;
    parentScraper?: string;
    parentVersion?: string;
    timestamp: string;
    nodeCount: number;
    metadata?: Record<string, unknown>;
}

export interface GraphSnapshot {
    version: string;
    data: NavigationGraphData;
    metadata: GraphVersion;
}

export interface VersionInfo {
    version: string;
    scraperName: string;
    parentScraper?: string;
    parentVersion?: string;
    timestamp: string;
    nodeCount: number;
}

/**
 * Manages graph versions for scrapers
 */
export class GraphVersionManager {
    private readonly graphsDir: string;
    private readonly versionsDir: string;

    constructor(graphsDir: string = 'data/scraper_graphs', versionsDir: string = 'data/scraper_graph_versions') {
        this.graphsDir = path.resolve(process.cwd(), graphsDir);
        this.versionsDir = path.resolve(process.cwd(), versionsDir);
    }

    /**
     * Initialize directories
     */
    async initialize(): Promise<void> {
        await fs.mkdir(this.graphsDir, { recursive: true });
        await fs.mkdir(this.versionsDir, { recursive: true });
    }

    /**
     * Get graph file path for a scraper
     */
    private getGraphFilePath(scraperName: string): string {
        const sanitized = this.sanitizeScraperName(scraperName);
        return path.join(this.graphsDir, `${sanitized}.json`);
    }

    /**
     * Get version directory for a scraper
     */
    private getVersionDir(scraperName: string): string {
        const sanitized = this.sanitizeScraperName(scraperName);
        return path.join(this.versionsDir, sanitized);
    }

    /**
     * Get version file path
     */
    private getVersionFilePath(scraperName: string, version: string): string {
        const versionDir = this.getVersionDir(scraperName);
        return path.join(versionDir, `${version}.json`);
    }

    /**
     * Get metadata file path for versions list
     */
    private getVersionsMetadataPath(scraperName: string): string {
        const versionDir = this.getVersionDir(scraperName);
        return path.join(versionDir, 'versions.json');
    }

    /**
     * Sanitize scraper name for file system
     */
    private sanitizeScraperName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .toLowerCase();
    }

    /**
     * Generate version string (semantic version or timestamp-based)
     */
    generateVersion(baseVersion?: string, type: 'patch' | 'minor' | 'major' = 'patch'): string {
        if (!baseVersion) {
            // First version
            return '1.0.0';
        }

        const parts = baseVersion.split('.').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) {
            // Invalid version, use timestamp
            return `v${Date.now()}`;
        }

        const [major, minor, patch] = parts;
        switch (type) {
            case 'major':
                return `${major + 1}.0.0`;
            case 'minor':
                return `${major}.${minor + 1}.0`;
            case 'patch':
            default:
                return `${major}.${minor}.${patch + 1}`;
        }
    }

    /**
     * Save a graph snapshot with version
     */
    async saveSnapshot(
        scraperName: string,
        graphData: NavigationGraphData,
        version?: string,
        parentScraper?: string,
        parentVersion?: string,
        metadata?: Record<string, unknown>
    ): Promise<string> {
        await this.initialize();

        const versions = await this.listVersions(scraperName);
        const latestVersion = versions.length > 0 ? versions[versions.length - 1].version : undefined;
        const newVersion = version || this.generateVersion(latestVersion, 'patch');

        const snapshot: GraphSnapshot = {
            version: newVersion,
            data: graphData,
            metadata: {
                version: newVersion,
                scraperName,
                parentScraper,
                parentVersion,
                timestamp: new Date().toISOString(),
                nodeCount: Object.keys(graphData.nodes).length,
                metadata
            }
        };

        // Save version snapshot
        const versionDir = this.getVersionDir(scraperName);
        await fs.mkdir(versionDir, { recursive: true });
        await fs.writeFile(
            this.getVersionFilePath(scraperName, newVersion),
            JSON.stringify(snapshot, null, 2),
            'utf-8'
        );

        // Update versions metadata
        const versionInfo: VersionInfo = {
            version: newVersion,
            scraperName,
            parentScraper,
            parentVersion,
            timestamp: snapshot.metadata.timestamp,
            nodeCount: snapshot.metadata.nodeCount
        };
        versions.push(versionInfo);
        await fs.writeFile(
            this.getVersionsMetadataPath(scraperName),
            JSON.stringify(versions, null, 2),
            'utf-8'
        );

        // Update current graph file
        await fs.writeFile(
            this.getGraphFilePath(scraperName),
            JSON.stringify(graphData, null, 2),
            'utf-8'
        );

        return newVersion;
    }

    /**
     * Load a specific version of a graph
     */
    async loadSnapshot(scraperName: string, version?: string): Promise<GraphSnapshot | null> {
        await this.initialize();

        if (!version) {
            // Load latest version
            const versions = await this.listVersions(scraperName);
            if (versions.length === 0) {
                return null;
            }
            version = versions[versions.length - 1].version;
        }

        try {
            const filePath = this.getVersionFilePath(scraperName, version);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as GraphSnapshot;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Load current graph for a scraper
     */
    async loadCurrentGraph(scraperName: string): Promise<NavigationGraphData | null> {
        await this.initialize();

        try {
            const filePath = this.getGraphFilePath(scraperName);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as NavigationGraphData;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * List all versions for a scraper
     */
    async listVersions(scraperName: string): Promise<VersionInfo[]> {
        await this.initialize();

        try {
            const metadataPath = this.getVersionsMetadataPath(scraperName);
            const content = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(content) as VersionInfo[];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get parent graph snapshot
     */
    async getParentSnapshot(scraperName: string): Promise<GraphSnapshot | null> {
        const versions = await this.listVersions(scraperName);
        if (versions.length === 0) {
            return null;
        }

        const latest = versions[versions.length - 1];
        if (!latest.parentScraper || !latest.parentVersion) {
            return null;
        }

        return this.loadSnapshot(latest.parentScraper, latest.parentVersion);
    }

    /**
     * Check if a scraper has a parent
     */
    async hasParent(scraperName: string): Promise<boolean> {
        const versions = await this.listVersions(scraperName);
        if (versions.length === 0) {
            return false;
        }
        const latest = versions[versions.length - 1];
        return !!latest.parentScraper;
    }

    /**
     * Delete a version (use with caution)
     */
    async deleteVersion(scraperName: string, version: string): Promise<void> {
        await this.initialize();

        const filePath = this.getVersionFilePath(scraperName, version);
        fireAndForget(
            fs.unlink(filePath),
            {
                service: 'GraphVersionManager',
                operation: 'deleteVersion',
                logger
            }
        );

        // Update versions metadata
        const versions = await this.listVersions(scraperName);
        const filtered = versions.filter(v => v.version !== version);
        await fs.writeFile(
            this.getVersionsMetadataPath(scraperName),
            JSON.stringify(filtered, null, 2),
            'utf-8'
        );
    }
}

