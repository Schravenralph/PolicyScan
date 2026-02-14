import { getDB } from '../config/database.js';
import { Collection, type Filter, type UpdateFilter } from 'mongodb';
import { logger } from '../utils/logger.js';
import type { NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';

const COLLECTION_NAME = 'navigation_nodes';

export interface NavigationNodeDocument extends NavigationNode {
    _id?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class NavigationNodeModel {
    private static collection: Collection<NavigationNodeDocument> | null = null;

    private static getCollection(): Collection<NavigationNodeDocument> {
        if (!this.collection) {
            const db = getDB();
            this.collection = db.collection<NavigationNodeDocument>(COLLECTION_NAME);
        }
        return this.collection;
    }

    /**
     * Ensure indexes exist for optimal query performance
     */
    static async ensureIndexes(): Promise<void> {
        const collection = this.getCollection();
        
        // Unique index on URL (primary key)
        await collection.createIndex({ url: 1 }, { unique: true });
        
        // Index on type for filtering
        await collection.createIndex({ type: 1 });
        
        // Index on children array for reverse lookups (finding parents)
        await collection.createIndex({ children: 1 });
        
        // Index on filePath for content queries
        await collection.createIndex({ filePath: 1 });
        
        // Index on rootUrl metadata (stored separately)
        // Note: rootUrl is stored in a separate metadata document
    }

    /**
     * Create or update a navigation node
     */
    static async upsert(node: NavigationNode): Promise<NavigationNodeDocument> {
        const collection = this.getCollection();
        const now = new Date();
        
        const filter: Filter<NavigationNodeDocument> = { url: node.url };
        const updateFilter: UpdateFilter<NavigationNodeDocument> = {
            $set: {
                ...node,
                updatedAt: now
            },
            $setOnInsert: {
                createdAt: now
            }
        };

        const result = await collection.findOneAndUpdate(
            filter,
            updateFilter,
            {
                upsert: true,
                returnDocument: 'after'
            }
        );

        if (!result) {
            logger.error({ url: node.url }, 'Failed to upsert navigation node');
            throw new Error(`Failed to upsert navigation node: ${node.url}`);
        }

        return result;
    }

    /**
     * Find a node by URL
     */
    static async findByUrl(url: string): Promise<NavigationNodeDocument | null> {
        const collection = this.getCollection();
        return await collection.findOne({ url });
    }

    /**
     * Find multiple nodes by URLs
     */
    static async findByUrls(urls: string[]): Promise<NavigationNodeDocument[]> {
        const collection = this.getCollection();
        
        // Limit array size to prevent memory exhaustion
        const MAX_NAVIGATION_NODE_URLS = parseInt(process.env.MAX_NAVIGATION_NODE_URLS || '1000', 10);
        const limitedUrls = urls.slice(0, MAX_NAVIGATION_NODE_URLS);
        
        if (urls.length > MAX_NAVIGATION_NODE_URLS) {
            console.warn(
                `[NavigationNode] URLs list truncated from ${urls.length} to ${MAX_NAVIGATION_NODE_URLS} to prevent memory exhaustion`
            );
        }
        
        return await collection
            .find({ url: { $in: limitedUrls } })
            .limit(MAX_NAVIGATION_NODE_URLS)
            .toArray();
    }

    /**
     * Find all nodes
     */
    static async findAll(): Promise<NavigationNodeDocument[]> {
        const collection = this.getCollection();
        
        // Limit to prevent memory exhaustion when loading all navigation nodes
        // Default limit: 5000 nodes, configurable via environment variable
        const MAX_NAVIGATION_NODES = parseInt(process.env.MAX_NAVIGATION_NODES || '5000', 10);
        
        const nodes = await collection
            .find({})
            .limit(MAX_NAVIGATION_NODES)
            .toArray();
        
        if (nodes.length === MAX_NAVIGATION_NODES) {
            console.warn(
                `[NavigationNode] findAll() query may have been truncated at ${MAX_NAVIGATION_NODES} entries. ` +
                `Consider using more specific queries or increasing MAX_NAVIGATION_NODES.`
            );
        }
        
        return nodes;
    }

    /**
     * Find nodes by type
     */
    static async findByType(type: 'page' | 'section' | 'document'): Promise<NavigationNodeDocument[]> {
        const collection = this.getCollection();
        
        // Limit to prevent memory exhaustion when loading nodes by type
        // Default limit: 5000 nodes, configurable via environment variable
        const MAX_NAVIGATION_NODES = parseInt(process.env.MAX_NAVIGATION_NODES || '5000', 10);
        
        const nodes = await collection
            .find({ type })
            .limit(MAX_NAVIGATION_NODES)
            .toArray();
        
        if (nodes.length === MAX_NAVIGATION_NODES) {
            console.warn(
                `[NavigationNode] findByType() query may have been truncated at ${MAX_NAVIGATION_NODES} entries. ` +
                `Consider using more specific queries or increasing MAX_NAVIGATION_NODES.`
            );
        }
        
        return nodes;
    }

    /**
     * Find nodes that have a specific URL in their children array (reverse lookup for parents)
     */
    static async findParents(childUrl: string): Promise<NavigationNodeDocument[]> {
        const collection = this.getCollection();
        
        // Limit to prevent memory exhaustion (typically should be small, but protect against edge cases)
        // Default limit: 1000 parent nodes, configurable via environment variable
        const MAX_NAVIGATION_PARENTS = parseInt(process.env.MAX_NAVIGATION_PARENTS || '1000', 10);
        
        const parents = await collection
            .find({ children: childUrl })
            .limit(MAX_NAVIGATION_PARENTS)
            .toArray();
        
        if (parents.length === MAX_NAVIGATION_PARENTS) {
            console.warn(
                `[NavigationNode] findParents() query may have been truncated at ${MAX_NAVIGATION_PARENTS} entries. ` +
                `Consider increasing MAX_NAVIGATION_PARENTS.`
            );
        }
        
        return parents;
    }

    /**
     * Find nodes with filePath (nodes linked to markdown files)
     */
    static async findWithFilePaths(): Promise<NavigationNodeDocument[]> {
        const collection = this.getCollection();
        
        // Limit to prevent memory exhaustion when loading nodes with file paths
        // Default limit: 5000 nodes, configurable via environment variable
        const MAX_NAVIGATION_NODES = parseInt(process.env.MAX_NAVIGATION_NODES || '5000', 10);
        
        const nodes = await collection
            .find({ filePath: { $exists: true } })
            .limit(MAX_NAVIGATION_NODES)
            .toArray();
        
        if (nodes.length === MAX_NAVIGATION_NODES) {
            console.warn(
                `[NavigationNode] findWithFilePaths() query may have been truncated at ${MAX_NAVIGATION_NODES} entries. ` +
                `Consider using more specific queries or increasing MAX_NAVIGATION_NODES.`
            );
        }
        
        return nodes;
    }

    /**
     * Count total nodes
     */
    static async count(): Promise<number> {
        const collection = this.getCollection();
        return await collection.countDocuments({});
    }

    /**
     * Delete a node by URL
     */
    static async deleteByUrl(url: string): Promise<boolean> {
        const collection = this.getCollection();
        const result = await collection.deleteOne({ url });
        return result.deletedCount > 0;
    }

    /**
     * Delete all nodes (use with caution!)
     */
    static async deleteAll(): Promise<number> {
        const collection = this.getCollection();
        const result = await collection.deleteMany({});
        return result.deletedCount;
    }

    /**
     * Bulk insert nodes (for migration)
     */
    static async insertMany(nodes: NavigationNode[]): Promise<number> {
        const collection = this.getCollection();
        const now = new Date();
        
        const documents: NavigationNodeDocument[] = nodes.map(node => ({
            ...node,
            createdAt: now,
            updatedAt: now
        }));

        // Use ordered: false to continue on errors
        const result = await collection.insertMany(documents, { ordered: false });
        return result.insertedCount;
    }
}
