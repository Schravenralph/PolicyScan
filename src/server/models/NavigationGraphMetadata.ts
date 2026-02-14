import { getDB } from '../config/database.js';
import { Collection } from 'mongodb';

const COLLECTION_NAME = 'navigation_graph_metadata';
const METADATA_ID = 'singleton'; // Single document ID for metadata

export interface NavigationGraphMetadataDocument {
    _id: string;
    rootUrl: string;
    lastUpdated: Date;
    totalNodes?: number;
    totalEdges?: number;
}

export class NavigationGraphMetadataModel {
    private static collection: Collection<NavigationGraphMetadataDocument> | null = null;

    private static getCollection(): Collection<NavigationGraphMetadataDocument> {
        if (!this.collection) {
            const db = getDB();
            this.collection = db.collection<NavigationGraphMetadataDocument>(COLLECTION_NAME);
        }
        return this.collection;
    }

    /**
     * Get or create metadata document
     */
    static async getMetadata(): Promise<NavigationGraphMetadataDocument> {
        const collection = this.getCollection();
        let metadata = await collection.findOne({ _id: METADATA_ID });

        if (!metadata) {
            // Create default metadata
            metadata = {
                _id: METADATA_ID,
                rootUrl: '',
                lastUpdated: new Date(),
                totalNodes: 0,
                totalEdges: 0
            };
            await collection.insertOne(metadata);
        }

        return metadata;
    }

    /**
     * Update root URL
     */
    static async setRootUrl(rootUrl: string): Promise<void> {
        const collection = this.getCollection();
        await collection.updateOne(
            { _id: METADATA_ID },
            {
                $set: {
                    rootUrl,
                    lastUpdated: new Date()
                },
                $setOnInsert: {
                    _id: METADATA_ID,
                    totalNodes: 0,
                    totalEdges: 0
                }
            },
            { upsert: true }
        );
    }

    /**
     * Update metadata statistics
     */
    static async updateStatistics(stats: {
        totalNodes?: number;
        totalEdges?: number;
    }): Promise<void> {
        const collection = this.getCollection();
        await collection.updateOne(
            { _id: METADATA_ID },
            {
                $set: {
                    ...stats,
                    lastUpdated: new Date()
                },
                $setOnInsert: {
                    _id: METADATA_ID,
                    rootUrl: ''
                }
            },
            { upsert: true }
        );
    }

    /**
     * Get root URL
     */
    static async getRootUrl(): Promise<string> {
        const metadata = await this.getMetadata();
        return metadata.rootUrl;
    }
}

