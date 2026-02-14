/**
 * Knowledge Base Service
 * 
 * Provides access to scraped government policy documents stored as markdown files.
 * Integrates with NavigationGraph (Neo4j-backed) to enable contextual retrieval and relationship discovery.
 * 
 * Migration to Neo4j (WI-279): Migrated from JSON file storage to Neo4j database storage.
 */

import fs from 'fs/promises';
import path from 'path';
import { NavigationGraph, type NavigationNode } from '../graphs/navigation/NavigationGraph.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import type { Driver } from 'neo4j-driver';


export interface DocumentMetadata {
    url: string;
    title?: string;
    lastScraped?: string;
    imbor_keywords?: string[];
    parent_topic?: string;
    [key: string]: unknown;
}

export interface KnowledgeDocument {
    url: string;
    title: string;
    content: string;
    metadata: DocumentMetadata;
    filePath: string;
    relatedUrls: string[];
}

interface SearchResult {
    document: KnowledgeDocument;
    relevanceScore: number;
}

export class KnowledgeBase {
    private knowledgeBaseRoot: string;
    private navigationGraph: NavigationGraph | null = null;
    private cache: Map<string, KnowledgeDocument>;
    private cacheMaxSize: number = 100;
    private neo4jDriver: Driver | undefined;

    constructor(
        knowledgeBaseRoot?: string,
        neo4jDriver?: Driver
    ) {
        // Use environment variable or provided path, fallback to default
        const basePathFromEnv = process.env.KNOWLEDGE_BASE_PATH;
        const defaultPath = basePathFromEnv
            ? path.resolve(process.cwd(), basePathFromEnv)
            : path.resolve(process.cwd(), '../Beleidsscan-knowledge-base');

        this.knowledgeBaseRoot = knowledgeBaseRoot || defaultPath;
        this.neo4jDriver = neo4jDriver;
        this.cache = new Map();
    }

    /**
     * Get or create the navigation graph (lazy initialization)
     */
    private getNavigationGraph(): NavigationGraph {
        if (!this.navigationGraph) {
            // Get driver lazily - either use provided one or get from config
            const driver = this.neo4jDriver || getNeo4jDriver();
            this.navigationGraph = new NavigationGraph(driver);
        }
        return this.navigationGraph;
    }

    /**
     * Initialize the knowledge base by loading the navigation graph
     */
    async initialize(): Promise<void> {
        try {
            const navGraph = this.getNavigationGraph();
            await navGraph.initialize();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn('Failed to initialize NavigationGraph:', errorMsg);
            throw error;
        }
    }

    /**
     * Parse frontmatter from markdown content
     */
    private parseFrontmatter(content: string): { metadata: DocumentMetadata; body: string } {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

        if (!frontmatterMatch) {
            return {
                metadata: { url: '' },
                body: content
            };
        }

        const frontmatterText = frontmatterMatch[1];
        const body = frontmatterMatch[2];
        const metadata: DocumentMetadata = { url: '' };

        // Parse key-value pairs from frontmatter
        const lines = frontmatterText.split('\n');
        for (const line of lines) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const key = match[1];
                let value: string = match[2].trim();

                // Remove quotes
                value = value.replace(/^["']|["']$/g, '');

                // Parse arrays (e.g., [water, kwaliteit])
                if (value.startsWith('[') && value.endsWith(']')) {
                    const arrayValue = value.slice(1, -1).split(',').map(v => v.trim());
                    metadata[key] = arrayValue;
                } else {
                    metadata[key] = value;
                }
            }
        }

        return { metadata, body };
    }

    /**
     * Load a document from the file system
     */
    private async loadDocumentFromFile(filePath: string): Promise<KnowledgeDocument | null> {
        try {
            const absolutePath = path.join(this.knowledgeBaseRoot, filePath);
            const content = await fs.readFile(absolutePath, 'utf-8');
            const { metadata, body } = this.parseFrontmatter(content);

            if (!metadata.url) {
                console.warn(`No URL in frontmatter for ${filePath}`);
                return null;
            }

            // Get related URLs from navigation graph
            const node = await this.getNavigationGraph().getNode(metadata.url);
            const relatedUrls = node?.children || [];

            const document: KnowledgeDocument = {
                url: metadata.url,
                title: (metadata.title as string) || path.basename(filePath, '.md'),
                content: body,
                metadata,
                filePath,
                relatedUrls
            };

            return document;
        } catch {
            console.error(`Error loading document ${filePath}`);
            return null;
        }
    }

    /**
     * Get content by URL
     */
    async getContentByUrl(url: string): Promise<KnowledgeDocument | null> {
        // Check cache first
        if (this.cache.has(url)) {
            return this.cache.get(url)!;
        }

        // Find the node in the navigation graph
        const node = await this.getNavigationGraph().getNode(url);
        if (!node || !node.filePath) {
            console.warn(`No file path found for URL: ${url}`);
            return null;
        }

        // Load the document
        const document = await this.loadDocumentFromFile(node.filePath);

        if (document) {
            // Add to cache
            this.cache.set(url, document);

            // Evict oldest if cache is full
            if (this.cache.size > this.cacheMaxSize) {
                const firstKey = this.cache.keys().next().value as string;
                this.cache.delete(firstKey);
            }
        }

        return document;
    }

    /**
     * Search documents by keyword
     */
    async searchByKeyword(keyword: string, maxResults: number = 10): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const keywordLower = keyword.toLowerCase();

        const allNodes = await this.getNavigationGraph().getAllNodes();

        for (const node of allNodes) {
            if (!node.filePath) continue;

            // Score based on title match
            let score = 0;
            const titleLower = node.title?.toLowerCase() || '';

            if (titleLower.includes(keywordLower)) {
                score += 10;
            }

            // Also check URL for relevance
            if (node.url.toLowerCase().includes(keywordLower)) {
                score += 5;
            }

            if (score > 0) {
                const document = await this.loadDocumentFromFile(node.filePath);
                if (document) {
                    // Additional scoring from content
                    const contentLower = document.content.toLowerCase();
                    const matches = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
                    score += Math.min(matches, 20); // Cap content matches at 20 points

                    results.push({ document, relevanceScore: score });
                }
            }

            // Stop if we have enough candidates
            if (results.length >= maxResults * 3) {
                break;
            }
        }

        // Sort by relevance and return top results
        return results
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, maxResults);
    }

    /**
     * Get related content via navigation graph
     */
    async getRelatedContent(url: string, maxDepth: number = 1): Promise<KnowledgeDocument[]> {
        const node = await this.getNavigationGraph().getNode(url);
        if (!node) {
            return [];
        }

        const relatedDocs: KnowledgeDocument[] = [];
        const visited = new Set<string>([url]);

        const explore = async (currentUrl: string, depth: number): Promise<void> => {
            if (depth > maxDepth) return;

            const currentNode = await this.getNavigationGraph().getNode(currentUrl);
            if (!currentNode) return;

            for (const childUrl of currentNode.children || []) {
                if (visited.has(childUrl)) continue;
                visited.add(childUrl);

                const doc = await this.getContentByUrl(childUrl);
                if (doc) {
                    relatedDocs.push(doc);
                }

                await explore(childUrl, depth + 1);
            }
        };

        await explore(url, 0);

        return relatedDocs;
    }

    /**
     * Get documents by theme/topic
     */
    async getDocumentsByTheme(theme: string): Promise<KnowledgeDocument[]> {
        const results: KnowledgeDocument[] = [];
        const themeLower = theme.toLowerCase();

        const allNodes = await this.getNavigationGraph().getAllNodes();

        for (const node of allNodes) {
            // Check if URL contains the theme
            if (node.url.toLowerCase().includes(`/thema/${themeLower}/`) && node.filePath) {
                const doc = await this.loadDocumentFromFile(node.filePath);
                if (doc) {
                    results.push(doc);
                }
            }
        }

        return results;
    }

    /**
     * Refresh the navigation graph index
     */
    async refreshIndex(): Promise<void> {
        await this.getNavigationGraph().load();
        this.cache.clear();
    }

    /**
     * Get knowledge base statistics
     */
    async getStatistics(): Promise<{
        totalDocuments: number;
        cacheSize: number;
        graphStats: { totalNodes: number; totalEdges: number };
        storageBackend: 'neo4j';
    }> {
        const navGraph = this.getNavigationGraph();
        // Use getNodeCount() for better performance instead of loading all nodes
        const nodeCounts = await navGraph.getNodeCount();
        // Get statistics which includes edge count
        const stats = await navGraph.getStatistics();
        
        return {
            totalDocuments: nodeCounts.total,
            cacheSize: this.cache.size,
            graphStats: { totalNodes: nodeCounts.total, totalEdges: stats.totalEdges },
            storageBackend: 'neo4j'
        };
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}
