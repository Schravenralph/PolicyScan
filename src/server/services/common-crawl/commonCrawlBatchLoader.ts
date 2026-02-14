/**
 * Common Crawl Batch Loader
 * 
 * Loads Common Crawl data in batches, filtering for matching results.
 * Designed for large-scale loading (e.g., 50K × 2000 batches = 100M results).
 */

import { CommonCrawlDatabase } from './commonCrawlDatabase.js';
import axios from 'axios';
import { generateBatchDateRanges, type DateRange } from './commonCrawlDateRangePagination.js';
import * as fs from 'fs';
import * as path from 'path';

interface CDXApiResult {
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

interface BatchLoadOptions {
    crawlId: string; // Required - should come from user selection
    pattern: string;
    batchSize?: number;
    totalBatches?: number;
    queryFilter?: (result: CDXApiResult) => boolean;
    filters?: {
        statusCode?: string;
        mimeType?: string;
        from?: string;
        to?: string;
    };
    delayBetweenBatches?: number; // ms
    checkpointInterval?: number; // Save progress every N batches
    onProgress?: (progress: BatchProgress) => void;
}

interface BatchProgress {
    batchNumber: number;
    totalBatches: number;
    totalProcessed: number;
    totalMatched: number;
    totalInserted: number;
    currentBatchSize: number;
    estimatedTimeRemaining: number; // seconds
    elapsedTime: number; // seconds
}

interface Checkpoint {
    batchNumber: number;
    totalProcessed: number;
    totalMatched: number;
    timestamp: number;
}

export class CommonCrawlBatchLoader {
    private db: CommonCrawlDatabase;
    private startTime: number = 0;
    private checkpointData: Checkpoint | null = null;
    private dateRanges: DateRange[] | null = null;
    private _crawlId?: string;

    constructor(db: CommonCrawlDatabase) {
        this.db = db;
    }

    /**
     * Load batches sequentially with filtering
     */
    async loadBatches(options: BatchLoadOptions): Promise<{
        totalBatches: number;
        totalProcessed: number;
        totalMatched: number;
        totalInserted: number;
        elapsedTime: number;
    }> {
        const {
            crawlId, // Required - must be provided by caller
            pattern,
            batchSize = 50000,
            totalBatches = 2000,
            queryFilter = () => true, // Default: keep all
            filters,
            delayBetweenBatches = 100, // 100ms default delay
            checkpointInterval = 100, // Checkpoint every 100 batches
            onProgress,
        } = options;

        if (!crawlId) {
            throw new Error('crawlId is required for batch loading');
        }

        this.startTime = Date.now();
        this._crawlId = crawlId;
        let totalProcessed = 0;
        let totalMatched = 0;
        let totalInserted = 0;
        let batchNumber = 0;

        console.log(`[Batch Loader] Starting batch loading`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Crawl ID: ${crawlId}`);
        console.log(`  Batch size: ${batchSize}`);
        console.log(`  Total batches: ${totalBatches}`);
        console.log(`  Estimated time: ~20-24 hours`);

        // Generate date ranges for pagination
        console.log(`[Batch Loader] Generating date ranges for pagination...`);
        try {
            this.dateRanges = await generateBatchDateRanges(crawlId, totalBatches);
            console.log(`[Batch Loader] Generated ${this.dateRanges.length} date ranges`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Batch Loader] Could not generate date ranges: ${errorMessage}`);
            console.warn(`[Batch Loader] Will proceed without date ranges (batches may overlap)`);
            this.dateRanges = null;
        }

        // Load checkpoint if exists
        this.checkpointData = await this.loadCheckpoint();
        if (this.checkpointData) {
            batchNumber = this.checkpointData.batchNumber;
            totalProcessed = this.checkpointData.totalProcessed;
            totalMatched = this.checkpointData.totalMatched;
            console.log(`[Batch Loader] Resuming from batch ${batchNumber}`);
        }

        // Note: Common Crawl doesn't support offset pagination
        // We'll need to use different strategies:
        // 1. Date ranges
        // 2. Different patterns
        // 3. Accept overlaps and deduplicate
        
        while (batchNumber < totalBatches) {
            try {
                // Load batch from Common Crawl
                const results = await this.loadBatchFromCDX(
                    crawlId,
                    pattern,
                    batchSize,
                    filters,
                    batchNumber
                );

                // Filter results
                const matching = results.filter(queryFilter);
                
                // Insert matching results (with deduplication)
                const inserted = await this.insertWithDeduplication(matching);
                
                totalProcessed += results.length;
                totalMatched += matching.length;
                totalInserted += inserted;
                batchNumber++;

                // Calculate progress
                const elapsed = (Date.now() - this.startTime) / 1000;
                const avgTimePerBatch = elapsed / batchNumber;
                const remainingBatches = totalBatches - batchNumber;
                const estimatedTimeRemaining = avgTimePerBatch * remainingBatches;

                const progress: BatchProgress = {
                    batchNumber,
                    totalBatches,
                    totalProcessed,
                    totalMatched,
                    totalInserted,
                    currentBatchSize: results.length,
                    estimatedTimeRemaining,
                    elapsedTime: elapsed,
                };

                // Progress callback
                if (onProgress) {
                    onProgress(progress);
                }

                // Log progress
                if (batchNumber % 10 === 0 || batchNumber === totalBatches) {
                    console.log(`[Batch Loader] Batch ${batchNumber}/${totalBatches}`);
                    console.log(`  Processed: ${totalProcessed.toLocaleString()}`);
                    console.log(`  Matched: ${totalMatched.toLocaleString()} (${(totalMatched/totalProcessed*100).toFixed(2)}%)`);
                    console.log(`  Inserted: ${totalInserted.toLocaleString()}`);
                    console.log(`  Elapsed: ${this.formatTime(elapsed)}`);
                    console.log(`  ETA: ${this.formatTime(estimatedTimeRemaining)}`);
                }

                // Save checkpoint
                if (checkpointInterval > 0 && batchNumber % checkpointInterval === 0) {
                    await this.saveCheckpoint({
                        batchNumber,
                        totalProcessed,
                        totalMatched,
                        timestamp: Date.now(),
                    });
                }

                // Rate limiting delay
                if (delayBetweenBatches > 0) {
                    await this.sleep(delayBetweenBatches);
                }

            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[Batch Loader] Error in batch ${batchNumber}:`, errorMessage);
                
                // Retry logic (exponential backoff)
                const retryDelay = Math.min(1000 * Math.pow(2, 0), 30000); // Max 30s
                console.log(`[Batch Loader] Retrying in ${retryDelay}ms...`);
                await this.sleep(retryDelay);
                
                // Retry the batch
                continue;
            }
        }

        const totalElapsed = (Date.now() - this.startTime) / 1000;

        return {
            totalBatches: batchNumber,
            totalProcessed,
            totalMatched,
            totalInserted,
            elapsedTime: totalElapsed,
        };
    }

    /**
     * Load a single batch from Common Crawl CDX API
     */
    private async loadBatchFromCDX(
        crawlId: string,
        pattern: string,
        limit: number,
        filters: BatchLoadOptions['filters'],
        batchNumber: number
    ): Promise<Array<{
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string | number;
        offset: string;
        filename: string;
    }>> {
        // Validate crawlId format to prevent SSRF attacks
        const crawlIdPattern = /^CC-MAIN-\d{4}-\d{2}$/;
        if (!crawlIdPattern.test(crawlId)) {
            throw new Error(`Invalid crawlId format: ${crawlId}. Must match CC-MAIN-YYYY-WW pattern`);
        }

        // Additional safety checks to prevent path traversal and protocol injection
        if (crawlId.includes('..') || crawlId.includes('/') || crawlId.includes('\\') || 
            crawlId.includes(':') || crawlId.includes('http') || crawlId.includes('file')) {
            throw new Error(`Invalid crawlId: contains dangerous characters that could lead to SSRF`);
        }

        const cdxUrl = `http://index.commoncrawl.org/${crawlId}-index`;
        
        // Final validation: ensure the constructed URL is safe
        try {
            const url = new URL(cdxUrl);
            if (url.hostname !== 'index.commoncrawl.org') {
                throw new Error(`Invalid hostname: ${url.hostname}. Only index.commoncrawl.org is allowed`);
            }
            if (url.protocol !== 'http:') {
                throw new Error(`Invalid protocol: ${url.protocol}. Only HTTP is allowed`);
            }
        } catch (urlError) {
            throw new Error(`Invalid URL construction: ${urlError instanceof Error ? urlError.message : String(urlError)}`);
        }
        const params = new URLSearchParams({
            url: pattern,
            output: 'json',
            limit: limit.toString(),
        });

        // Add filters
        if (filters) {
            if (filters.statusCode) {
                params.append('filter', `statuscode:${filters.statusCode}`);
            }
            if (filters.mimeType) {
                params.append('filter', `mimetype:${filters.mimeType}`);
            }
            if (filters.from) {
                params.append('from', filters.from);
            }
            if (filters.to) {
                params.append('to', filters.to);
            }
        }

        // Use date range pagination to get different batches
        // Common Crawl doesn't support offset, so we split by date ranges
        if (this.dateRanges && batchNumber < this.dateRanges.length) {
            const dateRange = this.dateRanges[batchNumber];
            params.append('from', dateRange.from);
            params.append('to', dateRange.to);
            console.log(`[Batch Loader] Batch ${batchNumber + 1}: Using date range ${dateRange.from} to ${dateRange.to}`);
        } else {
            console.warn(`[Batch Loader] Batch ${batchNumber + 1}: No date range available, batch may overlap with previous batches`);
        }

        const response = await axios.get(`${cdxUrl}?${params.toString()}`, {
            timeout: 60000,
            headers: { 'User-Agent': 'Beleidsscan-BatchLoader/1.0' }
        });

        const lines = response.data.trim().split('\n').filter((line: string) => line.trim());
        return lines.map((line: string) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter((r: unknown): r is Record<string, unknown> => r !== null);
    }

    /**
     * Insert results with deduplication
     * Optimized to use batch SELECT queries instead of N+1 queries
     */
    private async insertWithDeduplication(results: CDXApiResult[]): Promise<number> {
        // Use batch SELECT to optimize existence check
        // Chunk size limited by CommonCrawlDatabase.validateAndSanitizeParams (100 params)
        const CHUNK_SIZE = 100;
        let inserted = 0;

        for (let i = 0; i < results.length; i += CHUNK_SIZE) {
            const chunk = results.slice(i, i + CHUNK_SIZE);

            // Get URLs to check (filtering out empty ones)
            const urlsToCheck = chunk
                .map(r => r.url)
                .filter((url): url is string => !!url && url.length > 0);

            if (urlsToCheck.length === 0) {
                continue;
            }

            try {
                // Construct batch query
                const placeholders = urlsToCheck.map(() => '?').join(',');
                const sql = `SELECT url FROM cdx_results WHERE url IN (${placeholders})`;

                const existingRows = this.db.query(sql, urlsToCheck);

                // Create Set of existing URLs for fast lookup
                const existingUrls = new Set(existingRows.map((r: any) => r.url));

                // Filter items to insert
                const toInsert = chunk.filter(result => result.url && !existingUrls.has(result.url));

                if (toInsert.length > 0) {
                    // Perform the actual insertion
                    // CommonCrawlDatabase doesn't expose a batch insert method directly via `query`
                    // efficiently for large sets if using raw SQL with many parameters (limit 100).
                    // So we must iterate or extend CommonCrawlDatabase.
                    // Given the constraint, we will insert one by one using the query method
                    // which under the hood uses `db.prepare`.

                    // Note: Ideally CommonCrawlDatabase should expose a transaction-based batch insert.
                    // For now, we perform individual inserts.

                    for (const result of toInsert) {
                        try {
                            const url = result.url || '';
                            // Basic extraction (simplified compared to CommonCrawlDatabase.loadFromCommonCrawl)
                            const domain = this.extractDomain(url);
                            const path = this.extractPath(url);

                            this.db.query(`
                                INSERT INTO cdx_results (urlkey, timestamp, url, mime, status, digest, length, offset, filename, domain, path)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                result.urlkey || '',
                                result.timestamp || '',
                                url,
                                result.mime || 'unknown',
                                result.status || 'unknown',
                                result.digest || '',
                                parseInt(String(result.length || '0'), 10),
                                result.offset || '',
                                result.filename || '',
                                domain,
                                path
                            ]);
                            inserted++;
                        } catch (e) {
                            console.error(`[Batch Loader] Failed to insert record: ${result.url}`, e);
                        }
                    }
                }
            } catch (error) {
                console.error(`[Batch Loader] Error processing chunk starting at ${i}:`, error);
                // Skip on error
            }
        }

        return inserted;
    }

    private extractDomain(url: string): string {
        try {
            const match = url.match(new RegExp('https?://(?:www\\.)?([^/]+)'));
            return match ? match[1] : '';
        } catch {
            return '';
        }
    }

    private extractPath(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            return '';
        }
    }

    /**
     * Save checkpoint
     */
    private async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
        // Save to file or database
        // Implementation depends on storage preference
        try {
            const checkpointPath = path.join(process.cwd(), '.checkpoint.json');
            await fs.promises.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
        } catch (error) {
            console.warn('[Batch Loader] Failed to save checkpoint:', error);
        }
    }

    /**
     * Load checkpoint
     */
    private async loadCheckpoint(): Promise<Checkpoint | null> {
        try {
            const checkpointPath = path.join(process.cwd(), '.checkpoint.json');
            const data = await fs.promises.readFile(checkpointPath, 'utf-8');
            return JSON.parse(data);
        } catch {
            // No checkpoint or error reading
        }
        return null;
    }

    /**
     * Format time in seconds to human-readable string
     */
    private formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Estimate total time for batch loading
     */
    estimateTime(
        totalBatches: number,
        _batchSize: number,
        avgTimePerBatch: number = 30
    ): {
        totalSeconds: number;
        totalHours: number;
        formatted: string;
    } {
        const totalSeconds = totalBatches * avgTimePerBatch;
        const totalHours = totalSeconds / 3600;
        
        return {
            totalSeconds,
            totalHours,
            formatted: this.formatTime(totalSeconds),
        };
    }
}

