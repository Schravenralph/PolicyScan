/**
 * Load Common Crawl .nl Domain from CDX Files
 * 
 * This script downloads CDX files directly from Common Crawl and processes them
 * to load .nl domain data into MongoDB. This approach is 5-10x faster than
 * using the CDX API and eliminates rate limiting issues.
 * 
 * Usage:
 *   pnpm run commoncrawl:load-nl-from-cdx                    # Uses latest crawl, downloads 10 files (pilot)
 *   pnpm run commoncrawl:load-nl-from-cdx -- --all-files     # Downloads ALL files for full migration
 *   pnpm run commoncrawl:load-nl-from-cdx -- --crawl CC-MAIN-2025-47
 *   pnpm run commoncrawl:load-nl-from-cdx -- --max-files 50
 *   pnpm run commoncrawl:load-nl-from-cdx -- --concurrency 5
 *   pnpm run commoncrawl:load-nl-from-cdx -- --output-dir ./custom-dir
 *   pnpm run commoncrawl:load-nl-from-cdx -- --process-only  # Skip download, process existing files
 * 
 * Strategy:
 *   1. Download CDX files directly via HTTPS (parallel downloads)
 *   2. Process files with stream parsing (memory-efficient)
 *   3. Filter for .nl domains
 *   4. Batch insert into MongoDB
 */

import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import { CDXFileDownloadService, type DownloadResult } from '../services/common-crawl/CDXFileDownloadService.js';
import { CDXFileProcessor } from '../services/common-crawl/CDXFileProcessor.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

interface ScriptOptions {
  crawlId?: string;
  maxFiles?: number;
  allFiles?: boolean; // Download all files (full migration)
  concurrency?: number;
  outputDir?: string;
  processOnly?: boolean;
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
    
    if (arg === '--crawl' && i + 1 < args.length) {
      options.crawlId = args[++i];
    } else if (arg === '--max-files' && i + 1 < args.length) {
      options.maxFiles = parseInt(args[++i], 10);
    } else if (arg === '--all-files') {
      options.allFiles = true;
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      options.concurrency = parseInt(args[++i], 10);
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      options.outputDir = args[++i];
    } else if (arg === '--process-only') {
      options.processOnly = true;
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      options.batchSize = parseInt(args[++i], 10);
    }
  }

  return options;
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

  console.log('🌱 Loading Common Crawl .nl domain from CDX files...\n');

  // Connect to database
  console.log('📊 Connecting to MongoDB...');
  await connectDB();
  const indexService = new CommonCrawlIndexService();
  await indexService.createIndexes();
  console.log('   ✓ Connected to MongoDB\n');

  // Initialize services
  const downloadService = new CDXFileDownloadService();
  const processor = new CDXFileProcessor(indexService);

  // Get crawl ID
  let crawlId = options.crawlId;
  if (!crawlId) {
    console.log('🔍 Detecting latest Common Crawl crawl...');
    crawlId = await downloadService.getLatestCrawlId();
    console.log(`   ✓ Latest crawl: ${crawlId}\n`);
  } else {
    console.log(`📋 Using crawl: ${crawlId}\n`);
  }

  const outputDir = options.outputDir || path.join(process.cwd(), 'commoncrawl', crawlId, 'cdx-indexes');

  // Step 1: Download CDX files (unless process-only)
  let downloadedFiles: string[] = [];
  let downloadResult: DownloadResult | null = null;
  if (!options.processOnly) {
    console.log('⬇️  Downloading CDX files...');
    if (options.allFiles) {
      console.log('   Mode: FULL MIGRATION (all files)');
    } else {
      console.log(`   Max files: ${options.maxFiles || 10}`);
    }
    console.log(`   Concurrency: ${options.concurrency || 5}`);
    console.log(`   Output directory: ${outputDir}\n`);

    downloadResult = await downloadService.downloadFiles({
      crawlId,
      maxFiles: options.allFiles ? undefined : (options.maxFiles || 10), // undefined = all files
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

    downloadedFiles = downloadResult.files
      .filter(f => f.status === 'downloaded' || f.status === 'skipped')
      .map(f => f.filePath);
  } else {
    console.log('📂 Reading existing CDX files...');
    const files = await fs.readdir(outputDir);
    downloadedFiles = files
      .filter(f => f.endsWith('.gz'))
      .map(f => path.join(outputDir, f));
    console.log(`   ✓ Found ${downloadedFiles.length} files\n`);
  }

  if (downloadedFiles.length === 0) {
    console.log('⚠️  No files to process. Exiting.');
    await closeDB();
    process.exit(0);
  }

  // Step 2: Process files
  console.log('🔄 Processing CDX files...');
  console.log(`   Files to process: ${downloadedFiles.length}`);
  console.log(`   Filter: .nl domains only`);
  console.log(`   Batch size: ${options.batchSize || 1000}\n`);

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalFiltered = 0;
  let totalErrors = 0;

  const processResults = await processor.processFiles(
    downloadedFiles,
    crawlId,
    {
      concurrency: options.concurrency || 3,
      batchSize: options.batchSize || 1000,
      filter: isNLDomain,
      onProgress: (fileIndex, total, result) => {
        totalProcessed += result.recordsProcessed;
        totalInserted += result.recordsInserted;
        totalFiltered += result.recordsFiltered;
        totalErrors += result.errors;

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

  console.log('\n   ✓ Processing completed:\n');

  // Summary with performance metrics
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  // Calculate performance metrics
  const avgProcessingSpeed = processResults.length > 0
    ? processResults
        .filter(r => r.processingSpeed && r.processingSpeed > 0)
        .reduce((sum, r) => sum + (r.processingSpeed || 0), 0) / processResults.filter(r => r.processingSpeed && r.processingSpeed > 0).length
    : 0;
  const maxProcessingSpeed = processResults.length > 0
    ? Math.max(...processResults.map(r => r.processingSpeed || 0))
    : 0;
  const minProcessingSpeed = processResults.length > 0
    ? Math.min(...processResults.filter(r => r.processingSpeed && r.processingSpeed > 0).map(r => r.processingSpeed || 0))
    : 0;

  // Calculate download performance metrics
  let avgDownloadSpeed = 0;
  let maxDownloadSpeed = 0;
  if (downloadResult) {
    const downloadMetrics = downloadResult.files
      .filter(f => f.downloadSpeed && f.downloadSpeed > 0)
      .map(f => f.downloadSpeed || 0);
    avgDownloadSpeed = downloadMetrics.length > 0
      ? downloadMetrics.reduce((sum, speed) => sum + speed, 0) / downloadMetrics.length
      : 0;
    maxDownloadSpeed = downloadMetrics.length > 0 ? Math.max(...downloadMetrics) : 0;
  }

  // Get resource usage
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  // Calculate disk usage for output directory
  let diskUsage = 0;
  try {
    const files = await fs.readdir(outputDir);
    for (const file of files) {
      try {
        const filePath = path.join(outputDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          diskUsage += stats.size;
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Can't calculate disk usage
  }

  console.log('📊 Summary:');
  console.log(`   Files processed: ${processResults.length}`);
  console.log(`   Records processed: ${totalProcessed.toLocaleString()}`);
  console.log(`   Records inserted: ${totalInserted.toLocaleString()}`);
  console.log(`   Records filtered (non-.nl): ${totalFiltered.toLocaleString()}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Duration: ${minutes}m ${seconds}s`);
  console.log(`   Average: ${totalInserted > 0 ? Math.round(totalInserted / (duration / 1000)) : 0} records/second\n`);

  console.log('⚡ Performance Metrics:');
  if (downloadResult && downloadResult.downloaded > 0) {
    console.log(`   Download Speed:`);
    console.log(`     - Average: ${avgDownloadSpeed.toFixed(2)} MB/s`);
    console.log(`     - Maximum: ${maxDownloadSpeed.toFixed(2)} MB/s`);
  }
  if (processResults.length > 0) {
    console.log(`   Processing Speed:`);
    console.log(`     - Average: ${Math.round(avgProcessingSpeed).toLocaleString()} records/second`);
    console.log(`     - Maximum: ${Math.round(maxProcessingSpeed).toLocaleString()} records/second`);
    if (minProcessingSpeed > 0) {
      console.log(`     - Minimum: ${Math.round(minProcessingSpeed).toLocaleString()} records/second`);
    }
  }
  console.log('');

  console.log('💾 Resource Usage:');
  console.log(`   Memory:`);
  console.log(`     - Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`     - Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`     - RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`     - System Total: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`     - System Used: ${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`     - System Free: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
  if (diskUsage > 0) {
    console.log(`   Disk:`);
    console.log(`     - Output Directory: ${(diskUsage / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('');

  // Check for failures
  const failed = processResults.filter(r => r.status === 'failed');
  if (failed.length > 0) {
    console.log('⚠️  Some files failed to process:');
    failed.forEach(f => {
      console.log(`   - ${path.basename(f.filePath)}: ${f.error || 'Unknown error'}`);
    });
    console.log('');
  }

  // Close database connection
  await closeDB();
  console.log('✅ Done!');
}

// Run the script
main().catch((error) => {
  logger.error({ error }, 'Script execution failed');
  console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
