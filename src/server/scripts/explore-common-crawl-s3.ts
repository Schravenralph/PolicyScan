/**
 * Explore Common Crawl S3 Bucket Structure
 * 
 * This script helps you find the exact location of CDX index files in Common Crawl's S3 bucket.
 * It explores the bucket structure and identifies where index files are stored.
 * 
 * Common Crawl S3 Bucket:
 *   - Bucket: s3://commoncrawl/
 *   - Region: us-east-1 (REQUIRED - Common Crawl is in us-east-1, not eu-north-1)
 *   - Access: Public (no AWS credentials needed, but region must be specified)
 * 
 * Usage:
 *   pnpm run commoncrawl:explore-s3                    # Explore latest crawl
 *   pnpm run commoncrawl:explore-s3 CC-MAIN-2025-47    # Explore specific crawl
 *   pnpm run commoncrawl:explore-s3 -- --all            # Show all crawls
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

/**
 * Common Crawl S3 configuration
 */
const COMMON_CRAWL_BUCKET = 'commoncrawl';
const COMMON_CRAWL_REGION = 'us-east-1'; // REQUIRED: Common Crawl is in us-east-1

/**
 * Get the latest Common Crawl crawl ID
 */
async function getLatestCrawlId(): Promise<string> {
    try {
        const response = await axios.get('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Beleidsscan-CommonCrawl-Explorer/1.0'
            }
        });
        
        const crawls = response.data as Array<{ id: string; name: string }>;
        if (crawls.length === 0) {
            throw new Error('No crawls found');
        }
        
        return crawls[0].id;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Could not fetch latest crawl ID: ${message}`);
        return 'CC-MAIN-2025-47';
    }
}

/**
 * Check if AWS CLI is available
 */
async function checkAWSCLI(): Promise<boolean> {
    try {
        await execAsync('aws --version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate S3 path to prevent command injection
 */
function validateS3Path(path: string): boolean {
    // Only allow s3://commoncrawl/ paths
    if (!path.startsWith('s3://commoncrawl/')) {
        return false;
    }
    // Prevent command injection: no shell metacharacters
    if (/[;&|`$(){}[\]<>]/.test(path)) {
        return false;
    }
    // Prevent path traversal
    if (path.includes('..')) {
        return false;
    }
    return true;
}

/**
 * Validate crawl ID format to prevent command injection
 */
function validateCrawlIdFormat(crawlId: string): boolean {
    // Validate format: CC-MAIN-YYYY-WW (e.g., CC-MAIN-2024-46)
    const crawlIdPattern = /^CC-MAIN-\d{4}-\d{2}$/;
    if (!crawlIdPattern.test(crawlId)) {
        return false;
    }
    // Prevent command injection: no shell metacharacters
    if (/[;&|`$(){}[\]<>]/.test(crawlId)) {
        return false;
    }
    return true;
}

/**
 * List S3 path contents
 */
async function listS3Path(path: string, recursive: boolean = false): Promise<string[]> {
    try {
        // Validate path to prevent command injection
        if (!validateS3Path(path)) {
            throw new Error(`Invalid S3 path: ${path}`);
        }
        
        // CRITICAL: Common Crawl bucket is in us-east-1, must specify region
        // Use execFile with proper argument array to prevent command injection
        // Note: execAsync uses exec which is vulnerable, but we validate the path first
        // For better security, consider using AWS SDK instead of shell commands
        const command = recursive 
            ? `aws s3 ls "${path}" --no-sign-request --region ${COMMON_CRAWL_REGION} --recursive`
            : `aws s3 ls "${path}" --no-sign-request --region ${COMMON_CRAWL_REGION}`;
        
        const { stdout } = await execAsync(command);
        return stdout.split('\n').filter(line => line.trim());
    } catch (_error: unknown) {
        return [];
    }
}

/**
 * Explore Common Crawl bucket structure
 */
async function exploreBucket(crawlId?: string, showAll: boolean = false) {
    console.log('🔍 Exploring Common Crawl S3 Bucket Structure\n');
    
    // Check AWS CLI
    const hasAWSCLI = await checkAWSCLI();
    if (!hasAWSCLI) {
        throw new Error('AWS CLI is not installed or not in PATH. Please install it first.');
    }
    console.log('✓ AWS CLI found\n');
    
    // Get crawl ID
    if (!crawlId && !showAll) {
        console.log('🔍 Detecting latest Common Crawl crawl...');
        crawlId = await getLatestCrawlId();
        console.log(`   Latest crawl: ${crawlId}\n`);
    }
    
    // Explore root bucket
    console.log('📦 Exploring s3://commoncrawl/ root...\n');
    const rootContents = await listS3Path('s3://commoncrawl/');
    
    console.log('Root directories:');
    rootContents.forEach(line => {
        if (line.includes('PRE')) {
            const dir = line.split(/\s+/).pop();
            console.log(`   📁 ${dir}`);
        }
    });
    console.log('');
    
    // Explore cc-index directory
    console.log('📦 Exploring s3://commoncrawl/cc-index/...\n');
    const ccIndexContents = await listS3Path('s3://commoncrawl/cc-index/');
    
    if (ccIndexContents.length > 0) {
        console.log('cc-index/ contents:');
        ccIndexContents.forEach(line => {
            if (line.includes('PRE')) {
                const dir = line.split(/\s+/).pop();
                console.log(`   📁 ${dir}`);
            } else if (line.trim()) {
                console.log(`   📄 ${line}`);
            }
        });
        console.log('');
        
        // Explore collections if it exists
        const hasCollections = ccIndexContents.some(line => line.includes('collections'));
        if (hasCollections) {
            console.log('📦 Exploring s3://commoncrawl/cc-index/collections/...\n');
            const collectionsContents = await listS3Path('s3://commoncrawl/cc-index/collections/');
            
            console.log('Available collections:');
            collectionsContents.forEach(line => {
                if (line.includes('PRE')) {
                    const dir = line.split(/\s+/).pop();
                    console.log(`   📁 ${dir}`);
                }
            });
            console.log('');
            
            // If we have a crawl ID, explore its collection
            if (crawlId) {
                const collectionPath = `s3://commoncrawl/cc-index/collections/${crawlId}/`;
                console.log(`📦 Exploring ${collectionPath}...\n`);
                const crawlContents = await listS3Path(collectionPath);
                
                if (crawlContents.length > 0) {
                    console.log(`Contents of ${crawlId}:`);
                    crawlContents.forEach(line => {
                        if (line.includes('PRE')) {
                            const dir = line.split(/\s+/).pop();
                            console.log(`   📁 ${dir}`);
                        } else if (line.trim()) {
                            const parts = line.trim().split(/\s+/);
                            const size = parts[2];
                            const file = parts[parts.length - 1];
                            console.log(`   📄 ${file} (${size})`);
                        }
                    });
                    console.log('');
                    
                    // Check for indexes directory
                    const hasIndexes = crawlContents.some(line => line.includes('indexes'));
                    if (hasIndexes) {
                        const indexesPath = `${collectionPath}indexes/`;
                        console.log(`📦 Exploring ${indexesPath}...\n`);
                        const indexesContents = await listS3Path(indexesPath);
                        
                        if (indexesContents.length > 0) {
                            console.log('CDX Index files found:');
                            let cdxCount = 0;
                            indexesContents.forEach(line => {
                                if (line.trim() && !line.includes('PRE')) {
                                    const parts = line.trim().split(/\s+/);
                                    const size = parts[2];
                                    const file = parts[parts.length - 1];
                                    if (file.includes('.cdx') || file.includes('index')) {
                                        console.log(`   📄 ${file} (${size})`);
                                        cdxCount++;
                                    }
                                }
                            });
                            console.log(`\n   ✓ Found ${cdxCount} potential CDX/index files\n`);
                        }
                    }
                } else {
                    console.log(`   ⚠️  No contents found at ${collectionPath}\n`);
                }
            }
        }
    } else {
        console.log('   ⚠️  cc-index/ directory not found or empty\n');
    }
    
    // Explore crawl-data directory
    console.log('📦 Exploring s3://commoncrawl/crawl-data/...\n');
    const crawlDataContents = await listS3Path('s3://commoncrawl/crawl-data/');
    
    if (crawlDataContents.length > 0) {
        if (showAll) {
            console.log('Available crawls:');
            crawlDataContents.forEach(line => {
                if (line.includes('PRE')) {
                    const dir = line.split(/\s+/).pop();
                    console.log(`   📁 ${dir}`);
                }
            });
            console.log('');
        }
        
        // If we have a crawl ID, explore it
        if (crawlId) {
            const crawlDataPath = `s3://commoncrawl/crawl-data/${crawlId}/`;
            console.log(`📦 Exploring ${crawlDataPath}...\n`);
            const crawlDataCrawlContents = await listS3Path(crawlDataPath);
            
            if (crawlDataCrawlContents.length > 0) {
                console.log(`Top-level directories in ${crawlId}:`);
                crawlDataCrawlContents.forEach(line => {
                    if (line.includes('PRE')) {
                        const dir = line.split(/\s+/).pop();
                        console.log(`   📁 ${dir}`);
                    }
                });
                console.log('');
                
                // Search for index files recursively (limited to first 50 results)
                console.log('🔍 Searching for index/CDX files (first 50 results)...\n');
                try {
                    // Validate crawlId to prevent command injection
                    if (!validateCrawlIdFormat(crawlId)) {
                        throw new Error(`Invalid crawl ID format: ${crawlId}`);
                    }
                    
                    // CRITICAL: Common Crawl bucket is in us-east-1
                    // crawlId is now validated, safe to use in command
                    // Note: For better security, consider using AWS SDK instead of shell commands
                    const { stdout } = await execAsync(
                        `aws s3 ls "s3://${COMMON_CRAWL_BUCKET}/crawl-data/${crawlId}/" --no-sign-request --region ${COMMON_CRAWL_REGION} --recursive | grep -iE "(cdx|index)" | head -50`
                    );
                    
                    const indexFiles = stdout.split('\n').filter(line => line.trim());
                    if (indexFiles.length > 0) {
                        console.log('Found potential index files:');
                        indexFiles.forEach(line => {
                            const parts = line.trim().split(/\s+/);
                            const size = parts[2];
                            const date = parts[0] + ' ' + parts[1];
                            const path = parts.slice(3).join(' ');
                            console.log(`   📄 ${path} (${size}, ${date})`);
                        });
                        console.log('');
                    } else {
                        console.log('   ⚠️  No index/CDX files found in crawl-data\n');
                    }
                } catch (_error: unknown) {
                    console.log('   ⚠️  Could not search for index files\n');
                }
            }
        }
    }
    
    // Summary and recommendations
    console.log('📋 Summary:\n');
    console.log('Common Crawl S3 bucket structure:');
    console.log(`   s3://${COMMON_CRAWL_BUCKET}/ (region: ${COMMON_CRAWL_REGION})`);
    console.log('   ├── cc-index/          (CDX index files - if available)');
    console.log('   │   └── collections/');
    console.log('   │       └── CC-MAIN-YYYY-WW/');
    console.log('   │           └── indexes/');
    console.log('   └── crawl-data/        (WARC files and metadata)');
    console.log('       └── CC-MAIN-YYYY-WW/');
    console.log('           └── segments/');
    console.log('');
    console.log('💡 Recommendations:');
    console.log('   1. Check s3://commoncrawl/cc-index/collections/ for CDX index files');
    console.log('   2. If not found, CDX files may need to be generated from WARC files');
    console.log('   3. Consider using the CDX API with proper pagination');
    console.log('   4. Or download WARC files and extract index data');
    console.log('   5. Use HTTPS for downloads: https://data.commoncrawl.org/... (no AWS CLI needed)');
    console.log('');
    console.log('⚠️  Important: Common Crawl bucket is in us-east-1 region');
    console.log('   Always use --region us-east-1 with AWS CLI commands');
    console.log('   Or use HTTPS: https://data.commoncrawl.org/... (no region needed)');
    console.log('');
}

// Run if called directly
const args = process.argv.slice(2);
const showAll = args.includes('--all');
const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
const crawlId = nonFlagArgs[0] || undefined;

exploreBucket(crawlId, showAll)
    .then(() => {
        console.log('✅ Exploration completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Exploration failed:', error);
        process.exit(1);
    });

