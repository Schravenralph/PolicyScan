/**
 * Smart Common Crawl Loader
 * 
 * Implements intelligent loading strategies to avoid loading millions of URLs
 * while still finding relevant domains and pages.
 */

import { CommonCrawlDatabase } from './commonCrawlDatabase.js';

interface SmartLoadOptions {
    crawlId?: string; // Required by some strategies (e.g. discovery) - should come from user selection
    targetDomains?: string[]; // Specific domains to load completely
    discoverySample?: number; // Sample size for domain discovery
    filters?: {
        statusCode?: string;
        mimeType?: string;
        from?: string;
        to?: string;
    };
}

export class CommonCrawlSmartLoader {
    private _db: CommonCrawlDatabase;

    constructor(db: CommonCrawlDatabase) {
        this._db = db;
    }

    /**
     * Strategy 1: Domain Discovery Mode
     * 
     * Load a sample to discover domains, then query those domains specifically
     */
    async discoverDomains(
        pattern: string,
        substring: string,
        options: SmartLoadOptions = {}
    ): Promise<{
        discoveredDomains: Array<{ domain: string; urlCount: number }>;
    }> {
        const {
            crawlId, // Required - must be provided
            discoverySample = 50000, // Default: 50k sample
            filters = {
                statusCode: '200',
                mimeType: 'text/html',
            },
        } = options;

        if (!crawlId) {
            throw new Error('crawlId is required for domain discovery');
        }

        console.log(`[Smart Loader] Domain Discovery Mode`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Substring: ${substring}`);
        console.log(`  Sample size: ${discoverySample}`);

        // Step 1: Load sample using injected DB
        await this._db.loadFromCommonCrawl({
            pattern,
            crawlId,
            limit: discoverySample,
            filters,
        });

        // Step 2: Find domains containing substring
        const domains = this._db.findDomainsContaining(substring, 1000);

        console.log(`[Smart Loader] Discovered ${domains.length} domains containing "${substring}"`);

        return {
            discoveredDomains: domains.map(d => ({
                domain: d.domain,
                urlCount: d.count,
            })),
        };
    }

    /**
     * Strategy 2: Load Complete Data for Specific Domains
     * 
     * After discovering domains, load ALL pages for those domains
     */
    async loadCompleteDomains(
        domains: string[],
        options: SmartLoadOptions = {}
    ): Promise<{
        loaded: number;
    }> {
        const {
            crawlId = 'CC-MAIN-2025-47',
            filters = {
                statusCode: '200',
            },
        } = options;

        console.log(`[Smart Loader] Loading complete data for ${domains.length} domains`);

        let totalLoaded = 0;

        // Load each domain separately using injected DB
        for (const domain of domains) {
            console.log(`[Smart Loader] Loading ${domain}...`);
            const loaded = await this._db.loadFromCommonCrawl({
                pattern: `${domain}/*`,
                crawlId,
                limit: 1000000, // Load all pages for this domain
                filters,
            });
            totalLoaded += loaded;
            console.log(`[Smart Loader] Loaded ${loaded} URLs from ${domain}`);
        }

        return {
            loaded: totalLoaded,
        };
    }

    /**
     * Strategy 3: Hybrid Approach
     * 
     * Discover domains → Load complete data for discovered domains
     */
    async hybridLoad(
        pattern: string,
        substring: string,
        options: SmartLoadOptions = {}
    ): Promise<{
        discoveredDomains: Array<{ domain: string; urlCount: number }>;
        totalLoaded: number;
    }> {
        // Step 1: Discover domains
        const discovery = await this.discoverDomains(pattern, substring, options);

        // Clear the discovery data to ensure clean load of complete data
        this._db.clearData();

        // Step 2: Load complete data for discovered domains
        const domainNames = discovery.discoveredDomains.map(d => d.domain);
        const complete = await this.loadCompleteDomains(domainNames, options);

        return {
            discoveredDomains: discovery.discoveredDomains,
            totalLoaded: complete.loaded,
        };
    }

    /**
     * Estimate dataset size before loading
     */
    estimateSize(_pattern: string, limit: number, filters?: SmartLoadOptions['filters']): {
        estimatedUrls: number;
        estimatedDatabaseSizeMB: number;
        estimatedLoadTimeMinutes: number;
    } {
        // Rough estimates based on pattern
        let baseUrls = limit;

        // Apply filter reductions (rough estimates)
        if (filters?.statusCode === '200') {
            baseUrls *= 0.7; // ~70% of URLs are 200
        }
        if (filters?.mimeType === 'text/html') {
            baseUrls *= 0.6; // ~60% of URLs are HTML
        }

        // Estimate database size (rough: ~1-5KB per URL record)
        const avgRecordSizeKB = 2;
        const estimatedDatabaseSizeMB = (baseUrls * avgRecordSizeKB) / 1024;

        // Estimate load time (rough: ~100-500 URLs/second)
        const urlsPerSecond = 200;
        const estimatedLoadTimeMinutes = baseUrls / urlsPerSecond / 60;

        return {
            estimatedUrls: Math.round(baseUrls),
            estimatedDatabaseSizeMB: Math.round(estimatedDatabaseSizeMB),
            estimatedLoadTimeMinutes: Math.round(estimatedLoadTimeMinutes * 10) / 10,
        };
    }
}
