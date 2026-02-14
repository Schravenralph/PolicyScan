/**
 * Common Crawl Database Service
 * 
 * Loads Common Crawl CDX results into a temporary SQLite database
 * for efficient SQL-based filtering and querying.
 */

import Database from 'better-sqlite3';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CDXResult {
    urlkey: string;
    timestamp: string;
    url: string;
    mime: string;
    status: string;
    digest: string;
    length: string;
    offset: string;
    filename: string;
}

interface QueryOptions {
    crawlId: string; // Required - should come from user selection
    pattern: string;
    limit?: number;
    batchSize?: number;
    filters?: {
        statusCode?: string; // e.g., '200'
        mimeType?: string; // e.g., 'text/html'
        from?: string; // e.g., '20250101'
        to?: string; // e.g., '20251231'
    };
}

export class CommonCrawlDatabase {
    private db: Database.Database | null = null;
    private dbPath: string;
    private isInitialized = false;

    constructor(dbName = 'commoncrawl_temp.db') {
        // Store in temp directory
        const tempDir = os.tmpdir();
        this.dbPath = path.join(tempDir, dbName);
    }

    /**
     * Initialize the database and create tables
     */
    initialize(): void {
        if (this.isInitialized && this.db) {
            return;
        }

        // Remove existing database if it exists
        if (fs.existsSync(this.dbPath)) {
            fs.unlinkSync(this.dbPath);
        }

        this.db = new Database(this.dbPath);
        
        // Create table for CDX results
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cdx_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                urlkey TEXT,
                timestamp TEXT,
                url TEXT,
                mime TEXT,
                status TEXT,
                digest TEXT,
                length INTEGER,
                offset TEXT,
                filename TEXT,
                domain TEXT,
                path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_url ON cdx_results(url);
            CREATE INDEX IF NOT EXISTS idx_domain ON cdx_results(domain);
            CREATE INDEX IF NOT EXISTS idx_path ON cdx_results(path);
            CREATE INDEX IF NOT EXISTS idx_urlkey ON cdx_results(urlkey);
        `);

        this.isInitialized = true;
    }

    /**
     * Load results from Common Crawl CDX API into database
     */
    async loadFromCommonCrawl(options: QueryOptions): Promise<number> {
        if (!this.db) {
            this.initialize();
        }

        const {
            crawlId, // Required - must be provided by caller
            pattern,
            limit = 1000000, // Default to 1M results
            batchSize = 1000, // Process in batches
        } = options;

        if (!crawlId) {
            throw new Error('crawlId is required');
        }

        // Validate crawlId format to prevent SSRF attacks
        // Only allow the standard Common Crawl format: CC-MAIN-YYYY-WW
        const crawlIdPattern = /^CC-MAIN-\d{4}-\d{2}$/;
        if (!crawlIdPattern.test(crawlId)) {
            throw new Error(`Invalid crawlId format: ${crawlId}. Must match CC-MAIN-YYYY-WW pattern`);
        }

        // Additional safety checks to prevent path traversal and protocol injection
        if (crawlId.includes('..') || crawlId.includes('/') || crawlId.includes('\\') || 
            crawlId.includes(':') || crawlId.includes('http') || crawlId.includes('file')) {
            throw new Error(`Invalid crawlId: contains dangerous characters that could lead to SSRF`);
        }

        // Construct URL with validated crawlId - ensure it only points to Common Crawl
        const cdxUrl = `http://index.commoncrawl.org/${crawlId}-index`;
        
        // Final validation: ensure the constructed URL is safe
        try {
            const url = new URL(cdxUrl);
            // Only allow requests to index.commoncrawl.org
            if (url.hostname !== 'index.commoncrawl.org') {
                throw new Error(`Invalid hostname: ${url.hostname}. Only index.commoncrawl.org is allowed`);
            }
            // Only allow HTTP protocol (not HTTPS, file://, etc.)
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

        // Add filters if provided
        if (options.filters) {
            if (options.filters.statusCode) {
                params.append('filter', `statuscode:${options.filters.statusCode}`);
            }
            if (options.filters.mimeType) {
                params.append('filter', `mimetype:${options.filters.mimeType}`);
            }
            if (options.filters.from) {
                params.append('from', options.filters.from);
            }
            if (options.filters.to) {
                params.append('to', options.filters.to);
            }
        }

        console.log(`[Common Crawl DB] Loading from: ${cdxUrl}?${params.toString()}`);
        console.log(`[Common Crawl DB] Pattern: ${pattern}, Limit: ${limit}`);
        if (options.filters) {
            console.log(`[Common Crawl DB] Filters:`, options.filters);
        }

        const insertStmt = this.db!.prepare(`
            INSERT INTO cdx_results (urlkey, timestamp, url, mime, status, digest, length, offset, filename, domain, path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = this.db!.transaction((results: CDXResult[]) => {
            for (const result of results) {
                const url = result.url || '';
                const domain = this.extractDomain(url);
                const urlPath = this.extractPath(url);

                insertStmt.run(
                    result.urlkey || '',
                    result.timestamp || '',
                    url,
                    result.mime || 'unknown',
                    result.status || 'unknown',
                    result.digest || '',
                    parseInt(result.length || '0', 10),
                    result.offset || '',
                    result.filename || '',
                    domain,
                    urlPath
                );
            }
        });

        let totalLoaded = 0;
        const offset = 0;
        let hasMore = true;

        while (hasMore && totalLoaded < limit) {
            const currentLimit = Math.min(batchSize, limit - totalLoaded);
            const paginatedParams = new URLSearchParams({
                url: pattern,
                output: 'json',
                limit: currentLimit.toString(),
            });

            if (offset > 0) {
                // Note: Common Crawl doesn't support offset directly
                // This is a limitation - we'd need to use pagination tokens if available
                console.warn('[Common Crawl DB] Offset not supported, loading all results');
            }

            try {
                const response = await axios.get(`${cdxUrl}?${paginatedParams.toString()}`, {
                    timeout: 60000,
                    headers: { 'User-Agent': 'Beleidsscan/1.0' }
                });

                const lines = response.data.trim().split('\n').filter((line: string) => line.trim());
                
                if (lines.length === 0) {
                    hasMore = false;
                    break;
                }

                const results: CDXResult[] = lines.map((line: string) => {
                    try {
                        return JSON.parse(line) as CDXResult;
                    } catch (_e) {
                        return null;
                    }
                }).filter((r: CDXResult | null): r is CDXResult => r !== null);

                if (results.length === 0) {
                    hasMore = false;
                    break;
                }

                insertMany(results);
                totalLoaded += results.length;

                console.log(`[Common Crawl DB] Loaded ${totalLoaded} results...`);

                // If we got fewer results than requested, we've reached the end
                if (results.length < currentLimit) {
                    hasMore = false;
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[Common Crawl DB] Error loading batch: ${errorMessage}`);
                hasMore = false;
            }
        }

        console.log(`[Common Crawl DB] Total loaded: ${totalLoaded} results`);
        return totalLoaded;
    }

    /**
     * Validate and sanitize SQL query parameters
     * @param params - Array of parameters to validate
     * @returns Object with isValid flag and sanitized params or error message
     */
    private validateAndSanitizeParams(params: unknown): {
        isValid: boolean;
        sanitizedParams?: (string | number | boolean | null)[];
        error?: string;
    } {
        // Ensure params is an array
        if (!Array.isArray(params)) {
            return {
                isValid: false,
                error: 'Parameters must be an array',
            };
        }

        // Limit parameter array size to prevent DoS attacks
        const MAX_PARAMS = 100;
        if (params.length > MAX_PARAMS) {
            return {
                isValid: false,
                error: `Too many parameters. Maximum ${MAX_PARAMS} parameters allowed, received ${params.length}`,
            };
        }

        // Validate and sanitize each parameter
        const sanitizedParams: (string | number | boolean | null)[] = [];
        const MAX_STRING_LENGTH = 10000; // Maximum length for string parameters
        const MAX_NUMBER = Number.MAX_SAFE_INTEGER;
        const MIN_NUMBER = Number.MIN_SAFE_INTEGER;

        for (let i = 0; i < params.length; i++) {
            const param = params[i];

            // Allow only primitive types: string, number, boolean, null
            const paramType = typeof param;
            if (param !== null && paramType !== 'string' && paramType !== 'number' && paramType !== 'boolean') {
                return {
                    isValid: false,
                    error: `Invalid parameter type at index ${i}. Expected string, number, boolean, or null, got ${paramType}`,
                };
            }

            // Validate and sanitize based on type
            if (paramType === 'string') {
                // Remove control characters (except newline, tab, carriage return)
                // eslint-disable-next-line no-control-regex
                let sanitized = param.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                
                // Limit string length
                if (sanitized.length > MAX_STRING_LENGTH) {
                    sanitized = sanitized.substring(0, MAX_STRING_LENGTH);
                }
                
                sanitizedParams.push(sanitized);
            } else if (paramType === 'number') {
                // Validate number is within safe integer range
                if (!Number.isFinite(param) || param > MAX_NUMBER || param < MIN_NUMBER) {
                    return {
                        isValid: false,
                        error: `Invalid number parameter at index ${i}. Number must be finite and within safe integer range.`,
                    };
                }
                sanitizedParams.push(param);
            } else {
                // For boolean and null, use as-is (they're safe)
                sanitizedParams.push(param);
            }
        }

        return {
            isValid: true,
            sanitizedParams,
        };
    }

    /**
     * Query the database using SQL
     * Parameters are validated and sanitized before execution
     */
    query(sql: string, params: (string | number | boolean | null)[] = []): CDXResult[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Validate and sanitize parameters
        const validation = this.validateAndSanitizeParams(params);
        if (!validation.isValid) {
            throw new Error(`Parameter validation failed: ${validation.error}`);
        }

        const stmt = this.db.prepare(sql);
        return stmt.all(...validation.sanitizedParams!) as CDXResult[];
    }

    /**
     * Find domains containing a substring
     */
    findDomainsContaining(substring: string, limit = 100): Array<{ domain: string; count: number }> {
        const sql = `
            SELECT domain, COUNT(*) as count
            FROM cdx_results
            WHERE domain LIKE ?
            GROUP BY domain
            ORDER BY count DESC
            LIMIT ?
        `;
        return this.query(sql, [`%${substring}%`, limit]) as unknown as Array<{ domain: string; count: number }>;
    }

    /**
     * Find URLs containing a substring
     */
    findUrlsContaining(substring: string, domainPattern?: string, limit = 100): CDXResult[] {
        let sql = `
            SELECT urlkey, timestamp, url, mime, status, digest, length, offset, filename
            FROM cdx_results
            WHERE url LIKE ?
        `;
        const params: (string | number)[] = [`%${substring}%`];

        if (domainPattern) {
            sql += ` AND domain LIKE ?`;
            params.push(domainPattern.replace(/\*/g, '%'));
        }

        sql += ` LIMIT ?`;
        params.push(limit);

        return this.query(sql, params);
    }

    /**
     * Get statistics about loaded data
     */
    getStats(): {
        total: number;
        uniqueDomains: number;
        uniqueUrls: number;
    } {
        const total = (this.query('SELECT COUNT(*) as count FROM cdx_results')[0] as unknown as { count: number }).count;
        const uniqueDomains = (this.query('SELECT COUNT(DISTINCT domain) as count FROM cdx_results')[0] as unknown as { count: number }).count;
        const uniqueUrls = (this.query('SELECT COUNT(DISTINCT url) as count FROM cdx_results')[0] as unknown as { count: number }).count;

        return {
            total,
            uniqueDomains,
            uniqueUrls,
        };
    }

    /**
     * Clear all data from the database
     */
    clearData(): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        this.db.exec('DELETE FROM cdx_results');
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const match = url.match(new RegExp('https?://(?:www\\.)?([^/]+)'));
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
     * Close database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }

    /**
     * Clean up database file
     */
    cleanup(): void {
        this.close();
        if (fs.existsSync(this.dbPath)) {
            fs.unlinkSync(this.dbPath);
        }
    }
}

