/**
 * Automate Common Crawl Processing
 * 
 * This script automatically detects new Common Crawl crawls and processes them.
 * It can be run as a scheduled job (cron) or manually.
 * 
 * Usage:
 *   pnpm run commoncrawl:automate                    # Check for new crawls and process
 *   pnpm run commoncrawl:automate -- --dry-run       # Check only, don't process
 *   pnpm run commoncrawl:automate -- --force         # Process even if already processed
 * 
 * Strategy:
 *   1. Check for latest crawl from Common Crawl API
 *   2. Check if crawl has been processed (check database)
 *   3. If new crawl found, download and process CDX files
 *   4. Log results and send alerts if configured
 */

import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import { CDXFileDownloadService } from '../services/common-crawl/CDXFileDownloadService.js';
import { CDXFileProcessor } from '../services/common-crawl/CDXFileProcessor.js';
import { CDXProcessingMonitor } from '../services/common-crawl/CDXProcessingMonitor.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import { getDB } from '../config/database.js';

interface ScriptOptions {
  dryRun?: boolean;
  force?: boolean;
  maxFiles?: number;
  concurrency?: number;
  outputDir?: string;
  batchSize?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--max-files' && i + 1 < args.length) {
      options.maxFiles = parseInt(args[++i], 10);
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      options.concurrency = parseInt(args[++i], 10);
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      options.outputDir = args[++i];
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      options.batchSize = parseInt(args[++i], 10);
    }
  }

  return options;
}

/**
 * Check if a crawl has been processed
 */
async function isCrawlProcessed(crawlId: string): Promise<boolean> {
  const db = getDB();
  
  // Check if any records exist for this crawl
  const count = await db.collection('commoncrawl_index').countDocuments({
    crawlId,
  }, { limit: 1 });

  return count > 0;
}

/**
 * Get the last processed crawl ID from database
 */
async function getLastProcessedCrawlId(): Promise<string | null> {
  const db = getDB();
  
  // Find the most recent crawl with records
  const latest = await db.collection('commoncrawl_index')
    .findOne(
      {},
      {
        sort: { createdAt: -1 },
        projection: { crawlId: 1 },
      }
    );

  return latest?.crawlId || null;
}

/**
 * Filter for .nl domains
 */
function isNLDomain(record: { url?: string; urlkey?: string }): boolean {
  const url = record.url || record.urlkey || '';
  return url.includes('.nl/') || url.endsWith('.nl');
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('🤖 Common Crawl Automation Script\n');
  
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Connect to database
  console.log('📊 Connecting to MongoDB...');
  await connectDB();
  const indexService = new CommonCrawlIndexService();
  await indexService.createIndexes();
  console.log('   ✓ Connected to MongoDB\n');

  // Initialize services
  const downloadService = new CDXFileDownloadService();
  const processor = new CDXFileProcessor(indexService);
  const monitor = new CDXProcessingMonitor();

  // Get latest crawl
  console.log('🔍 Checking for new Common Crawl crawls...');
  const latestCrawlId = await downloadService.getLatestCrawlId();
  console.log(`   Latest crawl: ${latestCrawlId}`);

  const lastProcessedCrawlId = await getLastProcessedCrawlId();
  if (lastProcessedCrawlId) {
    console.log(`   Last processed crawl: ${lastProcessedCrawlId}`);
  } else {
    console.log(`   No previously processed crawls found`);
  }

  // Check if latest crawl has been processed
  const isProcessed = await isCrawlProcessed(latestCrawlId);
  
  if (isProcessed && !options.force) {
    console.log(`\n✅ Crawl ${latestCrawlId} has already been processed.`);
    console.log('   Use --force to reprocess.\n');
    await closeDB();
    process.exit(0);
  }

  if (isProcessed && options.force) {
    console.log(`\n⚠️  Crawl ${latestCrawlId} has been processed, but --force is set. Reprocessing...\n`);
  } else if (!isProcessed) {
    console.log(`\n🆕 New crawl detected: ${latestCrawlId}\n`);
  }

  if (options.dryRun) {
    console.log('🔍 DRY RUN: Would process crawl:', latestCrawlId);
    console.log('   Use without --dry-run to actually process.\n');
    await closeDB();
    process.exit(0);
  }

  // Start monitoring
  const operationId = `cdx-${latestCrawlId}-${Date.now()}`;
  monitor.startMonitoring(operationId, latestCrawlId);

  const crawlId = latestCrawlId;
  const outputDir = options.outputDir || path.join(process.cwd(), 'commoncrawl', crawlId, 'cdx-indexes');

  try {
    // Step 1: Download CDX files
    console.log('⬇️  Downloading CDX files...');
    console.log(`   Max files: ${options.maxFiles || 'all (full migration)'}`);
    console.log(`   Concurrency: ${options.concurrency || 5}`);
    console.log(`   Output directory: ${outputDir}\n`);

    const downloadResult = await downloadService.downloadFiles({
      crawlId,
      maxFiles: options.maxFiles, // undefined = all files
      concurrency: options.concurrency || 5,
      outputDir,
      resume: true,
      validateGzip: true,
      onProgress: (progress) => {
        const percent = progress.totalFiles > 0
          ? Math.round((progress.downloaded / progress.totalFiles) * 100)
          : 0;
        const downloadedMB = (progress.downloadedSize / 1024 / 1024).toFixed(2);
        const speedMBs = progress.downloadSpeed ? progress.downloadSpeed.toFixed(2) : '0.00';
        const eta = progress.estimatedTimeRemaining 
          ? `${Math.round(progress.estimatedTimeRemaining / 60)}m ${Math.round(progress.estimatedTimeRemaining % 60)}s`
          : 'calculating...';
        process.stdout.write(
          `\r   Progress: ${progress.downloaded}/${progress.totalFiles} files (${percent}%) | ` +
          `Downloaded: ${downloadedMB} MB | ` +
          `Speed: ${speedMBs} MB/s | ` +
          `ETA: ${eta} | ` +
          `In progress: ${progress.inProgress} | ` +
          `Failed: ${progress.failed}`
        );
      },
    });

    console.log('\n');
    console.log('   ✓ Download completed:');
    console.log(`     - Downloaded: ${downloadResult.downloaded} files`);
    console.log(`     - Skipped: ${downloadResult.skipped} files (already exist)`);
    console.log(`     - Failed: ${downloadResult.failed} files`);
    console.log(`     - Total size: ${(downloadResult.totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Record download results
    monitor.recordDownloadResults(operationId, downloadResult);

    const downloadedFiles = downloadResult.files
      .filter(f => f.status === 'downloaded' || f.status === 'skipped')
      .map(f => f.filePath);

    if (downloadedFiles.length === 0) {
      throw new Error('No files downloaded');
    }

    // Step 2: Process files
    console.log('🔄 Processing CDX files...');
    console.log(`   Files to process: ${downloadedFiles.length}`);
    console.log(`   Filter: .nl domains only`);
    console.log(`   Batch size: ${options.batchSize || 1000}\n`);

    const processResults = await processor.processFiles(
      downloadedFiles,
      crawlId,
      {
        concurrency: options.concurrency || 3,
        batchSize: options.batchSize || 1000,
        filter: isNLDomain,
        onProgress: (fileIndex, total, result) => {
          const percent = Math.round(((fileIndex + 1) / total) * 100);
          const speed = result.processingSpeed ? `${Math.round(result.processingSpeed).toLocaleString()} rec/s` : 'N/A';
          console.log(
            `   [${fileIndex + 1}/${total}] ${path.basename(result.filePath)}: ` +
            `${result.recordsInserted} inserted, ${result.recordsFiltered} filtered, ` +
            `${result.errors} errors | Speed: ${speed} (${percent}%)`
          );
        },
      }
    );

    console.log('\n   ✓ Processing completed\n');

    // Record processing results
    monitor.recordProcessingResults(operationId, processResults);

    // Complete monitoring
    monitor.completeMonitoring(operationId, true);

    // Summary
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    const totalInserted = processResults.reduce((sum, r) => sum + r.recordsInserted, 0);

    console.log('📊 Summary:');
    console.log(`   Crawl ID: ${crawlId}`);
    console.log(`   Files processed: ${processResults.length}`);
    console.log(`   Records inserted: ${totalInserted.toLocaleString()}`);
    console.log(`   Duration: ${minutes}m ${seconds}s`);
    console.log(`   Average: ${totalInserted > 0 ? Math.round(totalInserted / (duration / 1000)) : 0} records/second\n`);

    // Check for failures
    const failed = processResults.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      console.log('⚠️  Some files failed to process:');
      failed.forEach(f => {
        console.log(`   - ${path.basename(f.filePath)}: ${f.error || 'Unknown error'}`);
      });
      console.log('');
    }

    console.log('✅ Automation completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    monitor.completeMonitoring(operationId, false, errorMessage);
    logger.error({ error, crawlId, operationId }, 'CDX automation failed');
    throw error;
  } finally {
    await closeDB();
  }
}

// Run the script
main().catch((error) => {
  logger.error({ error }, 'Automation script execution failed');
  console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});


