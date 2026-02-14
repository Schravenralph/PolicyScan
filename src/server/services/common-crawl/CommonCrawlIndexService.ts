/**
 * Common Crawl Index Service (MongoDB)
 * 
 * Stores and queries Common Crawl CDX index data in MongoDB.
 * Designed for fast local queries on .nl domains.
 */

import { Db, Collection, ObjectId, Filter } from 'mongodb';
import { getDB } from '../../config/database.js';

export interface CDXIndexRecord {
    _id?: ObjectId;
    urlkey: string;
    timestamp: string;
    url: string;
    mime: string;
    status: string;
    digest: string;
    length: number;
    offset: string;
    filename: string;
    domain: string;
    path: string;
    crawlId: string;
    source?: 'api' | 's3' | 'athena' | 'cdx-file';  // Track which loading method was used
    createdAt: Date;
}

export interface CrawlMetadata {
    _id?: ObjectId;
    crawlId: string;
    totalPages: number;
    pageSize: number;
    blocks: number;
    totalRecords: number;
    loadedAt: Date;
    completed: boolean;
    lastPageLoaded?: number;
}

export interface QueryOptions {
    crawlId?: string;
    urlPattern?: string;
    domainPattern?: string;
    pathPattern?: string;
    statusCode?: string;
    mimeType?: string;
    limit?: number;
    skip?: number;
}

export interface CDXApiResult {
    urlkey?: string;
    timestamp?: string;
    url?: string;
    mime?: string;
    status?: string;
    digest?: string;
    length?: string | number;
    offset?: string;
    filename?: string;
}

export class CommonCrawlIndexService {
    private collection: Collection<CDXIndexRecord>;
    private metadataCollection: Collection<CrawlMetadata>;

    /**
     * Get database instance (lazy initialization)
     */
    private get db(): Db {
        return getDB();
    }

    constructor() {
        this.collection = this.db.collection<CDXIndexRecord>('commoncrawl_index');
        this.metadataCollection = this.db.collection<CrawlMetadata>('commoncrawl_metadata');
    }

    /**
     * Create indexes for fast queries
     */
    async createIndexes(): Promise<void> {
        await this.collection.createIndex({ url: 1 });
        await this.collection.createIndex({ domain: 1 });
        await this.collection.createIndex({ path: 1 });
        await this.collection.createIndex({ crawlId: 1 });
        await this.collection.createIndex({ timestamp: 1 });
        await this.collection.createIndex({ status: 1 });
        await this.collection.createIndex({ mime: 1 });
        // Note: Text indexes disabled due to apiStrict: true in MongoDB Atlas
        // We use regex queries instead for text search
        console.log('[Common Crawl Index] Indexes created');
    }

    /**
     * Insert CDX records into the database (with duplicate handling)
     * Uses upsert to avoid inserting duplicates
     */
    async insertRecords(records: Omit<CDXIndexRecord, '_id' | 'createdAt'>[]): Promise<number> {
        if (records.length === 0) return 0;

        // Use bulkWrite with upsert to handle duplicates gracefully
        const operations = records.map(record => ({
            updateOne: {
                filter: { 
                    url: record.url,
                    timestamp: record.timestamp,
                    crawlId: record.crawlId
                },
                update: {
                    $set: {
                        ...record,
                        createdAt: new Date()
                    }
                },
                upsert: true
            }
        }));

        try {
            const result = await this.collection.bulkWrite(operations, { ordered: false });
            // Return count of new records inserted (upserted) + updated existing ones
            return result.upsertedCount + result.modifiedCount;
        } catch (error: unknown) {
            // If bulk write fails, try individual upserts (slower but more resilient)
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Common Crawl Index] Bulk write had errors, falling back to individual upserts: ${errorMessage}`);
            let inserted = 0;
            for (const record of records) {
                try {
                    await this.collection.updateOne(
                        { 
                            url: record.url,
                            timestamp: record.timestamp,
                            crawlId: record.crawlId
                        },
                        {
                            $set: {
                                ...record,
                                createdAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                    inserted++;
                } catch (_err) {
                    // Skip individual failures
                }
            }
            return inserted;
        }
    }

    /**
     * Query the index with pattern matching
     */
    async query(options: QueryOptions): Promise<CDXIndexRecord[]> {
        const query: Filter<CDXIndexRecord> = {};

        // Filter by crawl ID
        if (options.crawlId) {
            query.crawlId = options.crawlId;
        }

        // Filter by domain pattern (e.g., *.nl -> .nl)
        if (options.domainPattern) {
            const domainRegex = options.domainPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.domain = { $regex: `^${domainRegex}$`, $options: 'i' };
        }

        // Filter by URL pattern (supports wildcards)
        if (options.urlPattern) {
            const urlRegex = options.urlPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.url = { $regex: urlRegex, $options: 'i' };
        }

        // Filter by path pattern
        if (options.pathPattern) {
            const pathRegex = options.pathPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.path = { $regex: pathRegex, $options: 'i' };
        }

        // Filter by status code
        if (options.statusCode) {
            query.status = options.statusCode;
        }

        // Filter by MIME type
        if (options.mimeType) {
            query.mime = options.mimeType;
        }

        const cursor = this.collection.find(query);

        if (options.skip) {
            cursor.skip(options.skip);
        }

        if (options.limit) {
            cursor.limit(options.limit);
        }

        return await cursor.toArray();
    }

    /**
     * Count records matching query
     */
    async count(options: QueryOptions): Promise<number> {
        const query: Filter<CDXIndexRecord> = {};

        if (options.crawlId) {
            query.crawlId = options.crawlId;
        }

        if (options.domainPattern) {
            const domainRegex = options.domainPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.domain = { $regex: `^${domainRegex}$`, $options: 'i' };
        }

        if (options.urlPattern) {
            const urlRegex = options.urlPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.url = { $regex: urlRegex, $options: 'i' };
        }

        if (options.pathPattern) {
            const pathRegex = options.pathPattern
                .replace(/\*/g, '.*')
                .replace(/\./g, '\\.');
            query.path = { $regex: pathRegex, $options: 'i' };
        }

        if (options.statusCode) {
            query.status = options.statusCode;
        }

        if (options.mimeType) {
            query.mime = options.mimeType;
        }

        return await this.collection.countDocuments(query);
    }

    /**
     * Get statistics about the index
     * Uses distinct() for memory efficiency with large datasets
     */
    async getStats(crawlId?: string): Promise<{
        total: number;
        uniqueDomains: number;
        uniqueUrls: number;
        crawlIds: string[];
    }> {
        const query: Filter<CDXIndexRecord> = {};
        if (crawlId) {
            query.crawlId = crawlId;
        }

        // Get total count (fast, doesn't use memory)
        const total = await this.collection.countDocuments(query);

        // Use distinct() which is more memory-efficient than $addToSet
        // distinct() can use indexes and doesn't accumulate all values in memory
        let uniqueDomains = 0;
        let uniqueUrls = 0;
        const crawlIds: string[] = [];

        try {
            // distinct() is more memory-efficient for large datasets
            const domains = await this.collection.distinct('domain', query);
            uniqueDomains = domains.length;
            
            const urls = await this.collection.distinct('url', query);
            uniqueUrls = urls.length;
            
            const crawlIdList = await this.collection.distinct('crawlId', query);
            crawlIds.push(...crawlIdList);
        } catch (error: unknown) {
            // If distinct also fails, return approximate values
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Common Crawl Index] Stats calculation had issues, using approximate counts: ${errorMessage}`);
            // Return total as approximate for unique counts
            uniqueDomains = Math.floor(total * 0.1); // Rough estimate: ~10% unique domains
            uniqueUrls = Math.floor(total * 0.95); // Rough estimate: ~95% unique URLs
        }

        return {
            total,
            uniqueDomains,
            uniqueUrls,
            crawlIds
        };
    }

    /**
     * Check if crawl is already loaded
     */
    async isCrawlLoaded(crawlId: string): Promise<boolean> {
        const count = await this.collection.countDocuments({ crawlId });
        return count > 0;
    }

    /**
     * Get list of all loaded crawl IDs
     */
    async getLoadedCrawlIds(): Promise<string[]> {
        try {
            const crawlIds = await this.collection.distinct('crawlId');
            return crawlIds;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Common Crawl Index] Failed to get loaded crawl IDs: ${errorMessage}`);
            return [];
        }
    }

    /**
     * Get crawl metadata
     */
    async getCrawlMetadata(crawlId: string): Promise<CrawlMetadata | null> {
        return await this.metadataCollection.findOne({ crawlId });
    }

    /**
     * Save crawl metadata
     */
    async saveCrawlMetadata(metadata: Omit<CrawlMetadata, '_id'>): Promise<void> {
        await this.metadataCollection.updateOne(
            { crawlId: metadata.crawlId },
            { $set: metadata },
            { upsert: true }
        );
    }

    /**
     * Check if crawl is completely loaded
     */
    async isCrawlComplete(crawlId: string): Promise<boolean> {
        const metadata = await this.getCrawlMetadata(crawlId);
        if (!metadata) {
            return false;
        }
        return metadata.completed && metadata.lastPageLoaded === metadata.totalPages - 1;
    }

    /**
     * Delete records for a specific crawl
     */
    async deleteCrawl(crawlId: string): Promise<number> {
        const result = await this.collection.deleteMany({ crawlId });
        return result.deletedCount;
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const match = url.match(/https?:\/\/(?:www\.)?([^/]+)/);
            return match ? match[1] : '';
        } catch {
            return '';
        }
    }

    /**
     * Extract path from URL
     */
    private extractPath(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            return '';
        }
    }

    /**
     * Convert CDX API result to index record
     */
    convertCDXToRecord(cdxResult: CDXApiResult, crawlId: string, source: 'api' | 's3' | 'athena' | 'cdx-file' = 'api'): Omit<CDXIndexRecord, '_id' | 'createdAt'> {
        const url = cdxResult.url || '';
        const lengthValue = Number(cdxResult.length ?? 0);
        return {
            urlkey: cdxResult.urlkey || '',
            timestamp: cdxResult.timestamp || '',
            url,
            mime: cdxResult.mime || 'unknown',
            status: cdxResult.status || 'unknown',
            digest: cdxResult.digest || '',
            length: Number.isFinite(lengthValue) ? lengthValue : 0,
            offset: cdxResult.offset || '',
            filename: cdxResult.filename || '',
            domain: this.extractDomain(url),
            path: this.extractPath(url),
            crawlId,
            source
        };
    }
}
