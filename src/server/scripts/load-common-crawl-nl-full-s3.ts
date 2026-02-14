/**
 * Load Common Crawl .nl Domain into MongoDB using AWS S3 (Direct Download)
 * 
 * ⚠️  EXPERIMENTAL - CDX files may not be available for direct download
 * 
 * This script downloads CDX index files directly from Common Crawl's S3 bucket
 * and processes them to extract .nl domain records. This approach is more efficient
 * than using the CDX API when CDX files are available.
 * 
 * ✅ UPDATED APPROACH:
 *   This script now uses cc-index.paths.gz to get CDX file paths, then streams
 *   and processes CDXJ files directly without needing S3 bucket listing.
 *   This is the recommended approach for bulk .nl domain loading.
 * 
 * Common Crawl S3 Bucket:
 *   - Bucket: s3://commoncrawl/
 *   - Region: us-east-1 (REQUIRED - Common Crawl is in us-east-1, not eu-north-1)
 *   - Access: Public (no AWS credentials needed, but region must be specified)
 * 
 * Prerequisites:
 *   - AWS CLI installed (optional - can use HTTPS instead)
 *   - Sufficient disk space for temporary CDX files
 * 
 * Usage:
 *   pnpm run commoncrawl:load-nl-full-s3                    # Uses latest crawl automatically
 *   pnpm run commoncrawl:load-nl-full-s3 CC-MAIN-2025-47    # Use specific crawl
 *   pnpm run commoncrawl:load-nl-full-s3 -- --force         # Auto-delete existing data
 * 
 * Note: This script uses HTTPS streaming (no AWS CLI needed) and processes
 * CDXJ format files directly without local disk storage.
 * 
 * Size Estimates:
 *   - CDX index files: ~50-200GB (compressed)
 *   - After filtering .nl: ~20-50GB in MongoDB
 * 
 * Production Recommendation:
 *   Use the CDX API loader instead: pnpm run commoncrawl:load-nl-full
 */

import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService, type CDXApiResult, type CDXIndexRecord } from '../services/common-crawl/CommonCrawlIndexService.js';
import axios from 'axios';
import * as zlib from 'zlib';
import * as readline from 'readline';



/**
 * Common Crawl S3 configuration
 */
// const COMMON_CRAWL_BUCKET = 'commoncrawl'; // Unused
const COMMON_CRAWL_HTTPS_BASE = 'https://data.commoncrawl.org';


/**
 * Get CDX file paths for a crawl using cc-index.paths.gz
 * 
 * Common Crawl provides a listing file at:
 * https://data.commoncrawl.org/crawl-data/CC-MAIN-YYYY-WW/cc-index.paths.gz
 * 
 * This file contains all CDX file paths for the crawl, one per line.
 * This is the recommended way to get CDX paths without needing S3 bucket listing.
 */
async function getCdxPathsForCrawl(crawlId: string): Promise<string[]> {
    console.log(`   Fetching CDX file paths from cc-index.paths.gz for ${crawlId}...`);
    
    const pathsUrl = `https://data.commoncrawl.org/crawl-data/${crawlId}/cc-index.paths.gz`;
    
    try {
        const response = await axios.get(pathsUrl, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Beleidsscan-CommonCrawl-Loader/1.0'
            }
        });
        
        const gunzip = zlib.createGunzip();
        const rl = readline.createInterface({
            input: response.data.pipe(gunzip)
        });
        
        const paths: string[] = [];
        
        try {
            for await (const line of rl) {
                const trimmed = line.trim();
                if (trimmed && (trimmed.includes('.cdx') || trimmed.includes('indexes/'))) {
                    paths.push(trimmed);
                }
            }
        } finally {
            rl.close();
        }
        
        if (paths.length === 0) {
            throw new Error(`No CDX paths found in cc-index.paths.gz for ${crawlId}`);
        }
        
        console.log(`   ✓ Found ${paths.length} CDX file paths\n`);
        return paths;
    } catch (error: unknown) {
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
            throw new Error(
                `cc-index.paths.gz not found for ${crawlId}.\n` +
                `This crawl may not have CDX index files available.\n` +
                `Try using the CDX API loader instead: pnpm run commoncrawl:load-nl-full`
            );
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch cc-index.paths.gz for ${crawlId}: ${errorMessage}`);
    }
}



/**
 * Convert CDX path to HTTPS URL
 */
function cdxPathToHttps(cdxPath: string): string {
    // Path format: cc-index/collections/CC-MAIN-YYYY-WW/indexes/cdx-XXXXX.gz
    return `https://data.commoncrawl.org/${cdxPath}`;
}


/**
 * Extract host/domain from URL
 */
function extractHostFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Check if host is a .nl domain
 */
function isNlDomain(host: string): boolean {
    if (!host) return false;
    const lower = host.toLowerCase();
    return lower.endsWith('.nl') || lower === 'nl';
}

/**
 * Parse CDXJ file (streaming) and filter for .nl domains
 * 
 * CDXJ format: urlkey timestamp json_record
 * Where json_record is a JSON object with url, mime, status, etc.
 */
async function processCdxFile(httpsUrl: string, crawlId: string, indexService: CommonCrawlIndexService): Promise<number> {
    let lineCount = 0;
    let nlCount = 0;
    const batch: Omit<CDXIndexRecord, '_id' | 'createdAt'>[] = [];
    const BATCH_SIZE = 1000;
    
    try {
        const response = await axios.get(httpsUrl, {
            responseType: 'stream',
            timeout: 300000, // 5 minute timeout for large files
            headers: {
                'User-Agent': 'Beleidsscan-CommonCrawl-Loader/1.0'
            }
        });
        
        const gunzip = zlib.createGunzip();
        const rl = readline.createInterface({
            input: response.data.pipe(gunzip)
        });
        
        try {
            for await (const line of rl) {
                if (!line || line.trim().startsWith('{"error"')) continue;
                
                lineCount++;
                
                try {
                    // CDXJ format: urlkey timestamp json_record
                    // Split on first two spaces to separate urlkey, timestamp, and JSON
                    const firstSpace = line.indexOf(' ');
                    const secondSpace = line.indexOf(' ', firstSpace + 1);
                    
                    if (firstSpace === -1 || secondSpace === -1) continue;
                    
                    const urlkey = line.substring(0, firstSpace);
                    const timestamp = line.substring(firstSpace + 1, secondSpace);
                    const jsonStr = line.substring(secondSpace + 1);
                    
                    let record: Record<string, unknown> | null = null;
                    try {
                        record = JSON.parse(jsonStr) as Record<string, unknown>;
                    } catch {
                        // Skip invalid JSON lines
                        continue;
                    }
                    
                    if (!record) continue;
                    
                    // Extract URL and host
                    const url = (record.url || record.original || '') as string;
                    const host = (record.host || extractHostFromUrl(url)) as string;
                    
                    // Filter for .nl domains
                    if (isNlDomain(host)) {
                        // Convert to CDX record format expected by convertCDXToRecord
                        const cdxRecord: CDXApiResult = {
                            urlkey,
                            timestamp,
                            url,
                            mime: (record.mime || record['mime-type'] || 'unknown') as string,
                            status: (record.status || record['status-code'] || 'unknown') as string,
                            digest: (record.digest || '') as string,
                            length: (record.length || record['content-length'] || '0') as string | number,
                            offset: (record.offset || record['warc-record-offset'] || '') as string,
                            filename: (record.filename || record['warc-filename'] || '') as string,
                        };
                        
                        batch.push(indexService.convertCDXToRecord(cdxRecord, crawlId, 's3'));
                        nlCount++;
                        
                        // Insert in batches
                        if (batch.length >= BATCH_SIZE) {
                            await indexService.insertRecords(batch);
                            batch.length = 0; // Clear array
                        }
                    }
                } catch (_error: unknown) {
                    // Skip lines that can't be parsed
                    continue;
                }
                
                if (lineCount % 100000 === 0) {
                    console.log(`      Processed ${lineCount.toLocaleString()} lines, found ${nlCount.toLocaleString()} .nl records`);
                }
            }
        } finally {
            rl.close();
        }
        
        // Insert remaining records
        if (batch.length > 0) {
            await indexService.insertRecords(batch);
        }
        
        return nlCount;
    } catch (error: unknown) {
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
            console.warn(`      ⚠️  File not found: ${httpsUrl}`);
            return 0;
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to process CDX file ${httpsUrl}: ${errorMsg}`);
    }
}

/**
 * Get available crawls (latest first)
 */
async function getAvailableCrawls(): Promise<string[]> {
    try {
        const response = await axios.get('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Beleidsscan-CommonCrawl-Loader/1.0'
            }
        });
        
        const crawls = response.data as Array<{ id: string; name: string }>;
        return crawls.map(c => c.id);
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Could not fetch crawl list: ${errorMsg}`);
        // Return fallback crawls (newest first)
        return ['CC-MAIN-2025-47', 'CC-MAIN-2025-43'];
    }
}

async function loadNLDomainsFromS3(crawlId?: string) {
    const startTime = Date.now();
    
    // This script always uses HTTPS (no AWS CLI needed)
    console.log('🌐 Using HTTPS streaming mode (no AWS CLI needed)');
    console.log(`   Base URL: ${COMMON_CRAWL_HTTPS_BASE}`);
    console.log(`   Method: cc-index.paths.gz → stream CDXJ files\n`);
    
    // If no crawl ID provided, check which crawl to use
    let selectedCrawlId = crawlId;
    let indexService: CommonCrawlIndexService | null = null;
    
    if (!selectedCrawlId) {
        console.log('🔍 Detecting Common Crawl crawl to use...');
        
        // Connect to database first to check existing data
        await connectDB();
        indexService = new CommonCrawlIndexService();
        
        const availableCrawls = await getAvailableCrawls();
        const [latestCrawlId, secondLatestCrawlId] = availableCrawls;
        
        if (!latestCrawlId) {
            throw new Error('Could not determine latest crawl ID');
        }
        
        const isLatestLoaded = await indexService.isCrawlLoaded(latestCrawlId);
        
        if (isLatestLoaded && secondLatestCrawlId) {
            console.log(`   ⚠️  Latest crawl ${latestCrawlId} already has data`);
            console.log(`   🔄 Using second latest crawl instead (to avoid conflicts)...`);
            selectedCrawlId = secondLatestCrawlId;
            console.log(`   ✓ Selected crawl: ${selectedCrawlId}\n`);
        } else {
            selectedCrawlId = latestCrawlId;
            console.log(`   ✓ Latest crawl: ${selectedCrawlId}\n`);
        }
    }
    
    crawlId = selectedCrawlId;
    
    console.log('🌱 Loading Common Crawl .nl domain from S3 into MongoDB...');
    console.log(`   Crawl ID: ${crawlId}`);
    console.log(`   Pattern: *.nl/*`);
    console.log(`   Source: AWS S3 (direct download)`);
    console.log(`   Database: Local MongoDB (Dockerized)\n`);
    
    // Connect to database (or reuse connection if already connected)
    if (!indexService) {
        console.log('📊 Connecting to MongoDB...');
        await connectDB();
        indexService = new CommonCrawlIndexService();
    }
    
    // Create indexes
    console.log('📊 Creating optimized indexes...');
    await indexService.createIndexes();
    console.log('   ✓ Indexes created\n');
    
    // Check if crawl is already loaded
    const isLoaded = await indexService.isCrawlLoaded(crawlId);
    const continueMerge = process.env.CONTINUE_MERGE === 'true' || process.argv.includes('--continue') || process.argv.includes('--merge');
    const forceReload = process.env.FORCE_RELOAD === 'true' || process.argv.includes('--force') || process.argv.includes('-f');
    
    if (isLoaded) {
        const stats = await indexService.getStats(crawlId);
        console.log(`📊 Crawl ${crawlId} has existing data:`);
        console.log(`   Total records: ${stats.total.toLocaleString()}`);
        console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
        console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}\n`);
        
        if (continueMerge) {
            console.log('🔄 Continue/Merge mode: Will add new records and update existing ones via upserts');
            console.log('   (Upserts prevent duplicates - safe to continue)\n');
            // Continue loading - upserts will handle duplicates
        } else if (forceReload) {
            console.log('🗑️  Force reload: Deleting existing data...');
            const deleted = await indexService.deleteCrawl(crawlId);
            console.log(`   ✓ Deleted ${deleted.toLocaleString()} records\n`);
        } else {
            const isNonInteractive = !process.stdin.isTTY || process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true';
            
            if (isNonInteractive) {
                console.log('⚠️  Non-interactive mode detected.');
                console.log('   Use --continue to merge with existing data');
                console.log('   Use --force to delete and reload');
                console.log('❌ Loading cancelled');
                await closeDB();
                return;
            } else {
                const readline = await import('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const answer = await new Promise<string>((resolve) => {
                    rl.question('Existing data found. Options:\n  [c]ontinue/merge (add new records, update existing)\n  [f]orce reload (delete and reload)\n  [q]uit\nChoose (c/f/q): ', resolve);
                });
                rl.close();
                
                const choice = answer.toLowerCase().trim();
                if (choice === 'q' || choice === 'quit') {
                    console.log('❌ Loading cancelled');
                    await closeDB();
                    return;
                } else if (choice === 'f' || choice === 'force') {
                    console.log('🗑️  Deleting existing data...');
                    const deleted = await indexService.deleteCrawl(crawlId);
                    console.log(`   ✓ Deleted ${deleted.toLocaleString()} records\n`);
                } else if (choice === 'c' || choice === 'continue') {
                    console.log('🔄 Continue/Merge mode: Will add new records and update existing ones\n');
                } else {
                    console.log('❌ Invalid choice. Loading cancelled');
                    await closeDB();
                    return;
                }
            }
        }
    }
    
    // Get CDX file paths using cc-index.paths.gz
    console.log('📦 Getting CDX index file paths...');
    let cdxPaths: string[] = [];
    let crawlIdToUse = crawlId;
    
    try {
        cdxPaths = await getCdxPathsForCrawl(crawlIdToUse);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAccessDenied = errorMessage.includes('AccessDenied') || errorMessage.includes('Access Denied');
        const isNotFound = errorMessage.includes('not find') || errorMessage.includes('No such');
        
        if (isAccessDenied || isNotFound) {
            console.error(`   ❌ Failed to load latest crawl ${crawlIdToUse} from S3: ${errorMessage}`);
            
            // Try second-latest crawl as fallback
            const availableCrawls = await getAvailableCrawls();
            const [, secondLatestCrawlId] = availableCrawls;
            
            if (secondLatestCrawlId && secondLatestCrawlId !== crawlIdToUse) {
                console.log(`   🔄 Falling back to second-latest crawl: ${secondLatestCrawlId}`);
                crawlIdToUse = secondLatestCrawlId;
                
                try {
                    cdxPaths = await getCdxPathsForCrawl(crawlIdToUse);
                    crawlId = crawlIdToUse; // Update crawlId for the rest of the script
                    console.log(`   ✓ Successfully found CDX paths for ${crawlIdToUse}\n`);
                } catch (fallbackError: unknown) {
                    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                    console.error(`   ❌ Fallback also failed: ${fallbackMessage}`);
                    
                    // Provide helpful error message
                    if (isAccessDenied) {
                        throw new Error(
                            `AccessDenied when accessing S3. This may be due to:\n` +
                            `1. Common Crawl bucket listing is disabled (expected for public buckets)\n` +
                            `2. Wrong region - Common Crawl is in us-east-1, not eu-north-1\n` +
                            `3. IAM permissions issue (if using credentials)\n` +
                            `4. Network/firewall blocking S3 access\n\n` +
                            `Solutions:\n` +
                            `- Use HTTPS instead (no AWS CLI needed): pnpm run commoncrawl:load-nl-full-s3 -- --https\n` +
                            `- Try using the CDX API loader instead: pnpm run commoncrawl:load-nl-full\n` +
                            `- The script automatically uses --region us-east-1, but verify AWS CLI is configured correctly`
                        );
                    }
                    throw new Error(`Could not find CDX files for ${crawlIdToUse} or fallback crawl: ${fallbackMessage}`);
                }
            } else {
                throw new Error(`Could not find CDX files and no fallback crawl available: ${errorMessage}`);
            }
        } else {
            // Re-throw other errors
            throw error;
        }
    }
    
    if (cdxPaths.length === 0) {
        throw new Error(`No CDX index file paths found for crawl ${crawlIdToUse}`);
    }
    
    console.log(`   Found ${cdxPaths.length} CDX files to process\n`);
    
    // Process each CDX file (streaming, no local download needed)
    for (let i = 0; i < cdxPaths.length; i++) {
        const cdxPath = cdxPaths[i];
        const fileName = cdxPath.split('/').pop() || `cdx-${i}.gz`;
        const httpsUrl = cdxPathToHttps(cdxPath);
        
        console.log(`\n📥 [${i + 1}/${cdxPaths.length}] Processing ${fileName}...`);
        const processStart = Date.now();
        
        try {
            const nlRecords = await processCdxFile(httpsUrl, crawlId, indexService);
            
            const processTime = ((Date.now() - processStart) / 1000).toFixed(1);
            console.log(`   ✓ Found ${nlRecords.toLocaleString()} .nl records (processed in ${processTime}s)`);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`   ❌ Error processing ${fileName}: ${errorMsg}`);
            // Continue with next file
            continue;
        }
    }
    
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
const args = process.argv.slice(2);
const forceFlag = args.includes('--force') || args.includes('-f');
const continueFlag = args.includes('--continue') || args.includes('--merge');
const nonFlagArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
const crawlId = nonFlagArgs[0] || undefined;

if (forceFlag) {
    process.env.FORCE_RELOAD = 'true';
}
if (continueFlag) {
    process.env.CONTINUE_MERGE = 'true';
}

loadNLDomainsFromS3(crawlId)
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
