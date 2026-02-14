/**
 * Load Common Crawl .nl Domain into MongoDB (Latest Crawl Only)
 * 
 * This script loads ALL .nl domains from the LATEST Common Crawl crawl into a local MongoDB instance.
 * It performs a single query to get all results - no batching needed.
 * 
 * By default, it automatically detects and uses the latest crawl.
 * This significantly reduces storage requirements compared to loading all historical crawls.
 * 
 * Usage:
 *   pnpm run commoncrawl:load-nl-full                    # Uses latest crawl automatically
 *   pnpm run commoncrawl:load-nl-full CC-MAIN-2025-47    # Use specific crawl
 *   pnpm run commoncrawl:load-nl-full -- --force         # Auto-delete existing data (non-interactive)
 * 
 * Size Estimates:
 *   - Latest crawl only: 20-50GB (recommended)
 *   - All historical crawls: 200GB-1TB+ (not recommended)
 */

import { connectDB, closeDB } from '../config/database.js';
import type { CDXApiResult } from '../services/common-crawl/CommonCrawlIndexService.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import axios from 'axios';

/**
 * Get the latest Common Crawl crawl ID
 */
async function getLatestCrawlId(): Promise<string> {
    try {
        const response = await axios.get('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Beleidsscan-CommonCrawl-Loader/1.0'
            }
        });
        
        const crawls = response.data as Array<{ id: string; name: string }>;
        if (crawls.length === 0) {
            throw new Error('No crawls found');
        }
        
        // Latest crawl is typically the first one (most recent)
        const latestCrawl = crawls[0];
        return latestCrawl.id;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Could not fetch latest crawl ID: ${message}`);
        console.warn('   Using fallback: CC-MAIN-2025-47');
        return 'CC-MAIN-2025-47'; // Fallback
    }
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 5000; // ms
const MAX_RETRY_DELAY = 60000; // 60 seconds max

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<unknown> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                timeout: 300000, // 5 minute timeout (large dataset)
                headers: {
                    'User-Agent': 'Beleidsscan-CommonCrawl-Loader/1.0'
                }
            });
            return response.data;
        } catch (error: unknown) {
            if (i === retries - 1) throw error;
            // Exponential backoff: 5s, 10s, 20s, 40s, 60s (capped)
            const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, i), MAX_RETRY_DELAY);
            console.warn(`   ⚠️  Request failed (attempt ${i + 1}/${retries}), retrying in ${delay / 1000}s...`);
            await sleep(delay);
        }
    }
}

async function loadNLDomainsFull(crawlId?: string) {
    const startTime = Date.now();
    
    // If no crawl ID provided, use the latest one
    if (!crawlId) {
        console.log('🔍 Detecting latest Common Crawl crawl...');
        crawlId = await getLatestCrawlId();
        console.log(`   ✓ Latest crawl: ${crawlId}\n`);
    }
    
    console.log('🌱 Loading Common Crawl .nl domain into MongoDB...');
    console.log(`   Crawl ID: ${crawlId} (LATEST CRAWL ONLY)`);
    console.log(`   Pattern: *.nl/*`);
    console.log(`   Strategy: Single query (load all results at once)`);
    console.log(`   Database: Local MongoDB (Dockerized)\n`);
    
    // Connect to database
    console.log('📊 Connecting to MongoDB...');
    await connectDB();
    const indexService = new CommonCrawlIndexService();
    
    // Create indexes (optimized for .nl domain queries)
    console.log('📊 Creating optimized indexes...');
    await indexService.createIndexes();
    console.log('   ✓ Indexes created\n');
    
    // Check existing data status (never delete - always preserve)
    let existingMetadata = await indexService.getCrawlMetadata(crawlId);
    const isLoaded = await indexService.isCrawlLoaded(crawlId);
    
    // DRIFT DETECTION: Check if metadata matches actual data
    // Use a known-good average records per page (based on successful loads: ~13k per page)
    if (existingMetadata) {
        const actualStats = await indexService.getStats(crawlId);
        const KNOWN_AVG_RECORDS_PER_PAGE = 13000; // Based on successful page loads
        const estimatedPagesFromRecords = Math.floor(actualStats.total / KNOWN_AVG_RECORDS_PER_PAGE);
        const metadataPages = (existingMetadata.lastPageLoaded || 0) + 1;
        
        // If metadata is more than 50 pages ahead of estimated, it's likely corrupted
        if (metadataPages > estimatedPagesFromRecords + 50) {
            console.warn(`   ⚠️  METADATA DRIFT DETECTED!`);
            console.warn(`      Metadata says: ${metadataPages} pages loaded`);
            console.warn(`      Records suggest: ~${estimatedPagesFromRecords} pages loaded (using ${KNOWN_AVG_RECORDS_PER_PAGE.toLocaleString()} records/page)`);
            console.warn(`      Gap: ${metadataPages - estimatedPagesFromRecords} pages`);
            console.warn(`   ↻ Correcting metadata to match actual data...`);
            
            // Update metadata to reflect actual progress
            await indexService.saveCrawlMetadata({
                crawlId,
                totalPages: existingMetadata.totalPages,
                pageSize: existingMetadata.pageSize,
                blocks: existingMetadata.blocks,
                totalRecords: actualStats.total,
                loadedAt: existingMetadata.loadedAt,
                completed: false,
                lastPageLoaded: Math.max(0, estimatedPagesFromRecords - 1),
            });
            console.warn(`   ✓ Metadata corrected to page ${estimatedPagesFromRecords}\n`);
            // Refresh metadata after correction
            existingMetadata = await indexService.getCrawlMetadata(crawlId);
        }
    }
    
    if (isLoaded && existingMetadata) {
        const stats = await indexService.getStats(crawlId);
        const isComplete = await indexService.isCrawlComplete(crawlId);
        
        if (isComplete) {
            console.log(`✅ Crawl ${crawlId} already fully loaded:`);
            console.log(`   Total records: ${stats.total.toLocaleString()}`);
            console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
            console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}`);
            console.log(`   Pages loaded: ${(existingMetadata.lastPageLoaded || 0) + 1}/${existingMetadata.totalPages}`);
            console.log(`   Loaded at: existingMetadata.loadedAt.toISOString()}\n`);
            console.log('   ✓ Skipping API calls - data already complete\n');
            await closeDB();
            return;
        } else {
            console.log(`📊 Crawl ${crawlId} partially loaded:`);
            console.log(`   Total records: ${stats.total.toLocaleString()}`);
            console.log(`   Pages loaded: ${(existingMetadata.lastPageLoaded || 0) + 1}/${existingMetadata.totalPages || 'unknown'}`);
            console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
            console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}\n`);
            console.log(`   ↻ Will skip already-loaded pages and continue from page ${(existingMetadata.lastPageLoaded || 0) + 1}\n`);
        }
    } else if (isLoaded) {
        // Data exists but no metadata - will check pages individually
        const stats = await indexService.getStats(crawlId);
        console.log(`📊 Crawl ${crawlId} has existing data (${stats.total.toLocaleString()} records) but no metadata.`);
        console.log(`   Will check pages individually to avoid duplicates.\n`);
    }
    
    // Get API metadata first (total pages, page size)
    console.log('📊 Getting API metadata (total pages)...\n');
    const cdxBaseUrl = `https://index.commoncrawl.org/${crawlId}-index`;
    
    let apiMetadata: { pages: number; pageSize: number; blocks: number };
    try {
        const metadataParams = new URLSearchParams({
            url: '*.nl/*',
            output: 'json',
            filter: 'status:200',
            showNumPages: 'true',
        });
        const metadataUrl = `${cdxBaseUrl}?${metadataParams.toString()}`;
        const metadataResponse = await fetchWithRetry(metadataUrl);
        
        if (typeof metadataResponse === 'string') {
            apiMetadata = JSON.parse(metadataResponse) as { pages: number; pageSize: number; blocks: number };
        } else {
            apiMetadata = metadataResponse as { pages: number; pageSize: number; blocks: number };
        }
        
        console.log(`   ✓ API metadata:`);
        console.log(`      Total pages: ${apiMetadata.pages.toLocaleString()}`);
        console.log(`      Page size: ${apiMetadata.pageSize} blocks`);
        console.log(`      Total blocks: ${apiMetadata.blocks.toLocaleString()}\n`);
        
        // Save/update metadata (preserve existing loadedAt if data exists)
        const currentMetadata = await indexService.getCrawlMetadata(crawlId);
        await indexService.saveCrawlMetadata({
            crawlId,
            totalPages: apiMetadata.pages,
            pageSize: apiMetadata.pageSize,
            blocks: apiMetadata.blocks,
            totalRecords: currentMetadata?.totalRecords || 0,
            loadedAt: currentMetadata?.loadedAt || new Date(), // Preserve original load time
            completed: false,
            lastPageLoaded: currentMetadata?.lastPageLoaded ?? -1,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed to get API metadata after ${MAX_RETRIES} retries: ${message}`);
        console.warn(`   ⚠️  Attempting to use cached metadata...`);
        
        // Fallback: Use existing metadata if available
        const cachedMetadata = await indexService.getCrawlMetadata(crawlId);
        if (cachedMetadata && cachedMetadata.totalPages) {
            console.warn(`   ✓ Using cached metadata:`);
            console.warn(`      Total pages: ${cachedMetadata.totalPages.toLocaleString()}`);
            console.warn(`      Page size: ${cachedMetadata.pageSize} blocks`);
            apiMetadata = {
                pages: cachedMetadata.totalPages,
                pageSize: cachedMetadata.pageSize,
                blocks: cachedMetadata.blocks || 0,
            };
            console.warn(`   ⚠️  Note: Using cached metadata. If API is down, script will continue with existing page count.\n`);
        } else {
            console.error(`   ❌ No cached metadata available. Cannot proceed without API or cached metadata.`);
            throw new Error('Cannot fetch API metadata and no cached metadata available');
        }
    }
    
    // Determine starting page (skip already-loaded pages)
    // Drift detection already happened above, so metadata should be correct now
    const currentMetadata = await indexService.getCrawlMetadata(crawlId);
    const startPage = currentMetadata && currentMetadata.lastPageLoaded !== undefined 
        ? currentMetadata.lastPageLoaded + 1 
        : 0;
    
    if (startPage > 0) {
        console.log(`   ↻ Skipping pages 0-${startPage - 1} (already loaded), starting from page ${startPage + 1}/${apiMetadata.pages}\n`);
    }
    
    // CDX API pagination - use the pageSize from API (blocks, not records)
    console.log('📦 Fetching all .nl/* results from Common Crawl (with pagination)...\n');
    
    const PAGE_SIZE = apiMetadata.pageSize; // Use API's pageSize (blocks)
    let page = startPage;
    let totalFetched = 0;
    const fetchStartTime = Date.now();
    
    console.log(`   Fetching pages ${startPage + 1} to ${apiMetadata.pages} from CDX API...`);
    
    while (page < apiMetadata.pages) {
        const params = new URLSearchParams({
            url: '*.nl/*',
            output: 'json',
            filter: 'status:200',
            page: page.toString(),
            pageSize: PAGE_SIZE.toString(),
        });
        
        const cdxUrl = `${cdxBaseUrl}?${params.toString()}`;
        
        try {
            const responseData = await fetchWithRetry(cdxUrl);
            
            // CDX API returns newline-delimited JSON
            let pageResults: CDXApiResult[] = [];
            if (typeof responseData === 'string') {
                const lines = responseData.trim().split('\n').filter((line: string) => line.trim());
                pageResults = lines.map((line: string) => {
                    try {
                        return JSON.parse(line) as CDXApiResult;
                    } catch {
                        return null;
                    }
                }).filter((r): r is CDXApiResult => r !== null);
            } else if (Array.isArray(responseData)) {
                pageResults = responseData;
            } else {
                throw new Error('Unexpected response format from CDX API');
            }
            
            if (pageResults.length === 0) {
                // No more results
                break;
            }
            
            // Convert and insert immediately (don't accumulate in memory)
            const records = pageResults.map((result: CDXApiResult) => 
                indexService.convertCDXToRecord(result, crawlId, 'api')
            );
            
            const inserted = await indexService.insertRecords(records);
            totalFetched += inserted;
            
            // Update metadata with progress
            // Get current total from database stats (more accurate than tracking)
            const currentStats = await indexService.getStats(crawlId);
            await indexService.saveCrawlMetadata({
                crawlId,
                totalPages: apiMetadata.pages,
                pageSize: apiMetadata.pageSize,
                blocks: apiMetadata.blocks,
                totalRecords: currentStats.total,
                loadedAt: existingMetadata?.loadedAt || new Date(),
                completed: page === apiMetadata.pages - 1,
                lastPageLoaded: page,
            });
            
            const fetchTime = ((Date.now() - fetchStartTime) / 1000).toFixed(1);
            const progress = ((page + 1) / apiMetadata.pages * 100).toFixed(1);
            console.log(`   Page ${page + 1}/${apiMetadata.pages} (${progress}%): ${inserted.toLocaleString()} records inserted (total in DB: ${currentStats.total.toLocaleString()} in ${fetchTime}s)`);
            
            page++;
            
            // Small delay between pages to be respectful
            if (page < apiMetadata.pages) {
                await sleep(500);
            }
            
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Check if it's a 400 error (page out of range)
            if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
                console.log(`   ✓ Reached end of available pages at page ${page}`);
                break;
            }
            
            console.error(`   ❌ Failed to fetch page ${page + 1}: ${errorMessage}`);
            // DON'T update lastPageLoaded here - only update on successful loads
            // The metadata should only reflect successfully loaded pages
            
            // If it's the first page after resuming, wait longer and retry once more
            if (page === startPage) {
                console.warn(`   ⚠️  Failed on first page after resume. Waiting 10s and retrying once...`);
                await sleep(10000);
                try {
                    const retryResponse = await fetchWithRetry(cdxUrl);
                    // Process retry response same as normal
                    let retryResults: CDXApiResult[] = [];
                    if (typeof retryResponse === 'string') {
                        const lines = retryResponse.trim().split('\n').filter((line: string) => line.trim());
                        retryResults = lines.map((line: string) => {
                            try {
                                return JSON.parse(line) as CDXApiResult;
                            } catch {
                                return null;
                            }
                        }).filter((r): r is CDXApiResult => r !== null);
                    } else if (Array.isArray(retryResponse)) {
                        retryResults = retryResponse as CDXApiResult[];
                    }
                    
                    if (retryResults.length > 0) {
                        const records = retryResults.map((result: CDXApiResult) => 
                            indexService.convertCDXToRecord(result, crawlId, 'api')
                        );
                        const inserted = await indexService.insertRecords(records);
                        totalFetched += inserted;
                        const currentStats = await indexService.getStats(crawlId);
                        const metadataToUpdate = await indexService.getCrawlMetadata(crawlId);
                        await indexService.saveCrawlMetadata({
                            crawlId,
                            totalPages: apiMetadata.pages,
                            pageSize: apiMetadata.pageSize,
                            blocks: apiMetadata.blocks,
                            totalRecords: currentStats.total,
                            loadedAt: metadataToUpdate?.loadedAt || new Date(),
                            completed: page === apiMetadata.pages - 1,
                            lastPageLoaded: page,
                        });
                        console.log(`   ✓ Retry successful: ${inserted.toLocaleString()} records inserted`);
                        page++;
                        continue; // Continue to next page
                    }
                } catch (retryError: unknown) {
                    const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
                    console.error(`   ❌ Retry also failed: ${errorMessage}`);
                    console.warn(`   ⚠️  Skipping page ${page + 1} and continuing to next page...`);
                    // Don't update metadata - just skip to next page
                    page++;
                    continue; // Skip this page and continue
                }
            } else {
                // Not first page - just skip and continue
                console.warn(`   ⚠️  Skipping page ${page + 1} due to error, continuing...`);
                // Don't update metadata - just skip to next page
                page++;
                continue;
            }
        }
    }
    
    if (totalFetched === 0 && page === startPage) {
        console.log('   ⚠️  No results found for *.nl/* pattern');
        await closeDB();
        return;
    }
    
    const fetchTime = ((Date.now() - fetchStartTime) / 1000).toFixed(1);
    console.log(`\n   ✓ Completed fetching and inserting ${totalFetched.toLocaleString()} records in ${fetchTime}s\n`);
    
    // Final statistics
    const elapsed = (Date.now() - startTime) / 1000;
    const stats = await indexService.getStats(crawlId);
    
    console.log('\n✅ Loading completed!');
    console.log(`   Total records loaded: ${stats.total.toLocaleString()}`);
    console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
    console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}`);
    console.log(`   Time elapsed: ${Math.round(elapsed / 60)} minutes`);
    console.log(`   Average rate: ${Math.round(stats.total / elapsed)} records/second\n`);
    
    await closeDB();
}

// Run if called directly
// Usage: pnpm run commoncrawl:load-nl-full [crawlId] [--force]
// If crawlId is omitted, uses the latest crawl automatically
const args = process.argv.slice(2);
const forceFlag = args.includes('--force') || args.includes('-f');
const nonFlagArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
const crawlId = nonFlagArgs[0] || undefined; // undefined = auto-detect latest

// Set environment variable for force flag so the function can detect it
if (forceFlag) {
    process.env.FORCE_RELOAD = 'true';
}

loadNLDomainsFull(crawlId)
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
