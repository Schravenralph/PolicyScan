/**
 * Load Common Crawl .nl Domain from Athena Results
 * 
 * This script downloads Parquet files from your S3 bucket (created by Athena queries)
 * and loads them into MongoDB with source='athena'.
 * 
 * Prerequisites:
 *   - Athena query has been run and results are in S3
 *   - AWS credentials configured (AWS CLI or env vars)
 *   - Parquet files in: s3://rm-beleidsscan-athena-results/commoncrawl-nl/
 * 
 * Usage:
 *   pnpm run commoncrawl:load-nl-athena                    # Load from default S3 path
 *   pnpm run commoncrawl:load-nl-athena s3://bucket/path  # Custom S3 path
 */

import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

/**
 * List Parquet files in S3 bucket
 */
async function listParquetFiles(s3Path: string): Promise<string[]> {
    try {
        const { stdout } = await execAsync(`aws s3 ls "${s3Path}" --recursive`);
        const files = stdout
            .split('\n')
            .filter(line => line.trim() && line.includes('.parquet'))
            .map(line => {
                const parts = line.trim().split(/\s+/);
                const filePath = parts.slice(3).join(' ');
                return `s3://${s3Path.replace(/^s3:\/\//, '').split('/')[0]}/${filePath}`;
            });
        return files;
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list S3 files: ${errorMsg}`);
    }
}

/**
 * Download Parquet file from S3
 */
async function downloadParquetFile(s3Path: string, localPath: string): Promise<void> {
    try {
        await execAsync(`aws s3 cp "${s3Path}" "${localPath}"`);
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to download ${s3Path}: ${errorMsg}`);
    }
}

/**
 * Parse Parquet file and convert to MongoDB records
 */
export async function parseParquetFile(filePath: string, crawlId: string, indexService: CommonCrawlIndexService): Promise<number> {
    try {
        const parquet = require('parquetjs');
        const reader = await parquet.ParquetReader.openFile(filePath);
        const cursor = reader.getCursor();

        let count = 0;
        let batch: any[] = [];
        const BATCH_SIZE = 1000;

        let record = await cursor.next();
        while (record) {
            // Convert to CDXApiResult format
            const cdxRecord = {
                urlkey: record.url_surtkey || '',
                timestamp: record.timestamp || '',
                url: record.url || '',
                mime: record.mime || 'unknown',
                status: record.status || 'unknown',
                digest: record.digest || '',
                length: Number(record.length || 0),
                offset: record.offset || '',
                filename: record.filename || '',
            };

            // Convert to DB record
            batch.push(indexService.convertCDXToRecord(cdxRecord, crawlId, 'athena'));

            if (batch.length >= BATCH_SIZE) {
                await indexService.insertRecords(batch);
                count += batch.length;
                batch = [];
            }

            record = await cursor.next();
        }

        // Insert remaining
        if (batch.length > 0) {
            await indexService.insertRecords(batch);
            count += batch.length;
        }

        await reader.close();
        return count;
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse parquet file ${filePath}: ${errorMsg}`);
    }
}

async function loadNLDomainsFromAthena(s3Path?: string) {
    const defaultS3Path = 's3://rm-beleidsscan-athena-results/commoncrawl-nl/';
    const targetS3Path = s3Path || defaultS3Path;
    
    console.log('🌱 Loading Common Crawl .nl domain from Athena results...');
    console.log(`   S3 Path: ${targetS3Path}`);
    console.log(`   Source: AWS Athena`);
    console.log(`   Database: Local MongoDB (Dockerized)\n`);
    
    // Check AWS CLI
    try {
        await execAsync('aws --version');
    } catch {
        throw new Error('AWS CLI is not installed or not in PATH. Please install it first.');
    }
    console.log('✓ AWS CLI found\n');
    
    // Connect to database
    console.log('📊 Connecting to MongoDB...');
    await connectDB();
    const indexService = new CommonCrawlIndexService();
    
    // Create indexes
    console.log('📊 Creating optimized indexes...');
    await indexService.createIndexes();
    console.log('   ✓ Indexes created\n');
    
    // List Parquet files
    console.log('📦 Listing Parquet files in S3...');
    const parquetFiles = await listParquetFiles(targetS3Path);
    
    if (parquetFiles.length === 0) {
        throw new Error(`No Parquet files found at ${targetS3Path}\n` +
            `Make sure you've run the Athena query and results are in S3.`);
    }
    
    console.log(`   ✓ Found ${parquetFiles.length} Parquet files\n`);
    
    // Create temporary directory
    const tempDir = path.join(process.cwd(), 'temp', 'athena-parquet');
    await fs.mkdir(tempDir, { recursive: true });
    
    let totalLoaded = 0;
    
    try {
        // Process each Parquet file
        for (let i = 0; i < parquetFiles.length; i++) {
            const s3File = parquetFiles[i];
            const fileName = path.basename(s3File);
            const localPath = path.join(tempDir, fileName);
            
            console.log(`\n📥 [${i + 1}/${parquetFiles.length}] Processing ${fileName}...`);
            const processStart = Date.now();
            
            // Download file
            console.log(`   Downloading from S3...`);
            await downloadParquetFile(s3File, localPath);
            
            const downloadTime = ((Date.now() - processStart) / 1000).toFixed(1);
            const fileSize = (await fs.stat(localPath)).size / (1024 * 1024); // MB
            console.log(`   ✓ Downloaded ${fileSize.toFixed(1)} MB in ${downloadTime}s`);
            
            // Parse and insert
            console.log(`   📊 Parsing Parquet and inserting into MongoDB...`);
            const parseStart = Date.now();
            
            // Extract crawl ID from path or use default
            const crawlId = extractCrawlIdFromPath(s3File) || 'CC-MAIN-UNKNOWN';
            const records = await parseParquetFile(localPath, crawlId, indexService);
            totalLoaded += records;
            
            const parseTime = ((Date.now() - parseStart) / 1000).toFixed(1);
            console.log(`   ✓ Inserted ${records.toLocaleString()} records (processed in ${parseTime}s)`);
            
            // Delete file to save space
            await fs.unlink(localPath);
            console.log(`   🗑️  Deleted temporary file`);
        }
    } finally {
        // Clean up temp directory
        try {
            await fs.rmdir(tempDir);
        } catch {
            // Ignore cleanup errors
        }
    }
    
    // Final statistics
    const stats = await indexService.getStats();
    
    console.log('\n✅ Loading completed!');
    console.log(`   Total records loaded: ${totalLoaded.toLocaleString()}`);
    console.log(`   Total in database: ${stats.total.toLocaleString()}`);
    console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
    console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}\n`);
    
    await closeDB();
}

/**
 * Extract crawl ID from S3 path
 * Athena results are partitioned by crawl, so path might be:
 * s3://bucket/commoncrawl-nl/crawl=CC-MAIN-2025-47/part-00000.parquet
 */
function extractCrawlIdFromPath(s3Path: string): string | null {
    const match = s3Path.match(/crawl=([^/]+)/);
    return match ? match[1] : null;
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const s3Path = args[0] || undefined;

    loadNLDomainsFromAthena(s3Path)
        .then(() => {
            console.log('✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

