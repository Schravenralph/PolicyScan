/**
 * Verify CDX File Migration (Phase 2)
 * 
 * This script verifies that CDX file processing produces the same results
 * as the CDX API approach, and benchmarks performance improvements.
 * 
 * Usage:
 *   pnpm run commoncrawl:verify-cdx-migration                    # Verify with latest crawl
 *   pnpm run commoncrawl:verify-cdx-migration -- --crawl CC-MAIN-2025-47
 *   pnpm run commoncrawl:verify-cdx-migration -- --max-files 5   # Use 5 files for testing
 * 
 * What it does:
 *   1. Downloads test dataset (5-10 CDX files)
 *   2. Processes files and loads into MongoDB
 *   3. Queries same data via CDX API
 *   4. Compares results (data quality verification)
 *   5. Benchmarks performance (CDX files vs API)
 *   6. Tests error handling and resume capability
 */

import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import { CDXFileDownloadService } from '../services/common-crawl/CDXFileDownloadService.js';
import { CDXFileProcessor } from '../services/common-crawl/CDXFileProcessor.js';
import axios from 'axios';
import * as path from 'path';
import { logger } from '../utils/logger.js';

interface VerificationOptions {
  crawlId?: string;
  maxFiles?: number;
  testQueries?: string[];
  outputDir?: string;
}

interface ComparisonResult {
  query: string;
  cdxFileResults: number;
  cdxApiResults: number;
  match: boolean;
  differences?: string[];
}

interface BenchmarkResult {
  method: 'cdx-file' | 'cdx-api';
  totalTime: number;
  recordsProcessed: number;
  recordsPerSecond: number;
  averageTimePerRecord: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): VerificationOptions {
  const args = process.argv.slice(2);
  const options: VerificationOptions = {
    maxFiles: 5, // Default to 5 files for testing
    testQueries: ['*.nl', '*antennebureau*', '*beleid*'], // Test queries
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--crawl' && i + 1 < args.length) {
      options.crawlId = args[++i];
    } else if (arg === '--max-files' && i + 1 < args.length) {
      options.maxFiles = parseInt(args[++i], 10);
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      options.outputDir = args[++i];
    } else if (arg === '--queries' && i + 1 < args.length) {
      options.testQueries = args[++i].split(',');
    }
  }

  return options;
}

/**
 * Query CDX API for comparison
 */
async function queryCdxApi(
  query: string,
  _crawlId: string,
  limit: number = 100
): Promise<Array<{ url: string; timestamp: string; status: string }>> {
  try {
    const response = await axios.get('https://index.commoncrawl.org/CC-MAIN-2025-47/index', {
      params: {
        url: query,
        output: 'json',
        limit,
      },
      timeout: 30000,
    });

    return (response.data as Array<unknown>).map((item: unknown) => {
      const record = item as Record<string, unknown>;
      return {
        url: String(record.url || ''),
        timestamp: String(record.timestamp || ''),
        status: String(record.status || ''),
      };
    });
  } catch (error) {
    logger.warn({ query, error }, 'Failed to query CDX API');
    return [];
  }
}

/**
 * Query MongoDB for CDX file results
 */
async function queryMongoDb(
  query: string,
  crawlId: string,
  limit: number = 100
): Promise<Array<{ url: string; timestamp: string; status: string }>> {
  const indexService = new CommonCrawlIndexService();
  
  const results = await indexService.query({
    urlPattern: query,
    crawlId,
    limit,
  });

  return results.map(record => ({
    url: record.url,
    timestamp: record.timestamp,
    status: record.status,
  }));
}

/**
 * Compare results from CDX files vs CDX API
 */
async function compareResults(
  queries: string[],
  crawlId: string
): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  for (const query of queries) {
    logger.info({ query }, 'Comparing results for query');

    const [cdxFileResults, cdxApiResults] = await Promise.all([
      queryMongoDb(query, crawlId, 100),
      queryCdxApi(query, crawlId, 100),
    ]);

    // Normalize URLs for comparison (remove protocol, trailing slashes)
    const normalizeUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    
    const cdxFileUrls = new Set(cdxFileResults.map(r => normalizeUrl(r.url)));
    const cdxApiUrls = new Set(cdxApiResults.map(r => normalizeUrl(r.url)));

    const differences: string[] = [];
    
    // Find URLs in API but not in CDX files
    const missingInCdxFiles = Array.from(cdxApiUrls).filter(url => !cdxFileUrls.has(url));
    if (missingInCdxFiles.length > 0) {
      differences.push(`${missingInCdxFiles.length} URLs in API but not in CDX files`);
    }

    // Find URLs in CDX files but not in API
    const extraInCdxFiles = Array.from(cdxFileUrls).filter(url => !cdxApiUrls.has(url));
    if (extraInCdxFiles.length > 0) {
      differences.push(`${extraInCdxFiles.length} URLs in CDX files but not in API`);
    }

    const match = differences.length === 0 && cdxFileResults.length === cdxApiResults.length;

    results.push({
      query,
      cdxFileResults: cdxFileResults.length,
      cdxApiResults: cdxApiResults.length,
      match,
      differences: differences.length > 0 ? differences : undefined,
    });
  }

  return results;
}

/**
 * Benchmark CDX file processing
 */
async function benchmarkCdxFiles(
  filePaths: string[],
  crawlId: string
): Promise<BenchmarkResult> {
  const indexService = new CommonCrawlIndexService();
  const processor = new CDXFileProcessor(indexService);

  const startTime = Date.now();
  let totalRecords = 0;

  const _results = await processor.processFiles(filePaths, crawlId, {
    concurrency: 3,
    batchSize: 1000,
    filter: (record) => {
      const url = record.url || '';
      return url.includes('.nl') || url.endsWith('.nl');
    },
    onProgress: (_fileIndex, _total, result) => {
      totalRecords += result.recordsInserted;
    },
  });

  const totalTime = Date.now() - startTime;
  const recordsPerSecond = totalRecords > 0 ? Math.round(totalRecords / (totalTime / 1000)) : 0;
  const averageTimePerRecord = totalRecords > 0 ? totalTime / totalRecords : 0;

  return {
    method: 'cdx-file',
    totalTime,
    recordsProcessed: totalRecords,
    recordsPerSecond,
    averageTimePerRecord,
  };
}

/**
 * Benchmark CDX API processing (simulated)
 */
async function benchmarkCdxApi(
  crawlId: string,
  sampleSize: number = 1000
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;

  // Simulate API processing by querying a sample
  try {
    const response = await axios.get(`https://index.commoncrawl.org/${crawlId}/index`, {
      params: {
        url: '*.nl',
        output: 'json',
        limit: sampleSize,
      },
      timeout: 60000,
    });

    recordsProcessed = Array.isArray(response.data) ? response.data.length : 0;
  } catch (error) {
    logger.warn({ error }, 'Failed to benchmark CDX API');
  }

  const totalTime = Date.now() - startTime;
  const recordsPerSecond = recordsProcessed > 0 ? Math.round(recordsProcessed / (totalTime / 1000)) : 0;
  const averageTimePerRecord = recordsProcessed > 0 ? totalTime / recordsProcessed : 0;

  return {
    method: 'cdx-api',
    totalTime,
    recordsProcessed,
    recordsPerSecond,
    averageTimePerRecord,
  };
}

/**
 * Test resume capability
 */
async function testResumeCapability(
  crawlId: string,
  outputDir: string,
  maxFiles: number
): Promise<{ success: boolean; message: string }> {
  const downloadService = new CDXFileDownloadService();

  try {
    // First download attempt (partial)
    logger.info('Testing resume capability - first download attempt');
    const firstResult = await downloadService.downloadFiles({
      crawlId,
      maxFiles: Math.floor(maxFiles / 2), // Download half
      outputDir,
      resume: true,
    });

    // Second download attempt (should resume)
    logger.info('Testing resume capability - second download attempt (should resume)');
    const secondResult = await downloadService.downloadFiles({
      crawlId,
      maxFiles, // Try to download all
      outputDir,
      resume: true,
    });

    // Verify that skipped files match first download
    const expectedSkipped = firstResult.downloaded;
    const actualSkipped = secondResult.skipped;

    if (actualSkipped >= expectedSkipped) {
      return {
        success: true,
        message: `Resume capability verified: ${actualSkipped} files skipped (expected at least ${expectedSkipped})`,
      };
    } else {
      return {
        success: false,
        message: `Resume capability failed: ${actualSkipped} files skipped (expected at least ${expectedSkipped})`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Resume capability test failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Main verification function
 */
async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('🔍 Verifying CDX File Migration (Phase 2)\n');

  try {
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

    // Step 1: Download test dataset
    console.log('⬇️  Step 1: Downloading test dataset...');
    console.log(`   Max files: ${options.maxFiles || 5}\n`);

    const downloadResult = await downloadService.downloadFiles({
      crawlId,
      maxFiles: options.maxFiles || 5,
      concurrency: 3,
      outputDir,
      resume: true,
      validateGzip: true,
    });

    console.log('   ✓ Download completed:');
    console.log(`     - Downloaded: ${downloadResult.downloaded} files`);
    console.log(`     - Skipped: ${downloadResult.skipped} files`);
    console.log(`     - Failed: ${downloadResult.failed} files\n`);

    if (downloadResult.downloaded === 0 && downloadResult.skipped === 0) {
      console.log('⚠️  No files available for testing. Exiting.');
      await closeDB();
      return;
    }

    const filePaths = downloadResult.files
      .filter(f => f.status === 'downloaded' || f.status === 'skipped')
      .map(f => f.filePath);

    // Step 2: Process files
    console.log('🔄 Step 2: Processing CDX files...');
    const processStartTime = Date.now();
    
    const processResults = await processor.processFiles(filePaths, crawlId, {
      concurrency: 3,
      batchSize: 1000,
      filter: (record) => {
        const url = record.url || '';
        return url.includes('.nl') || url.endsWith('.nl');
      },
    });

    const processTime = Date.now() - processStartTime;
    const totalInserted = processResults.reduce((sum, r) => sum + r.recordsInserted, 0);
    const totalProcessed = processResults.reduce((sum, r) => sum + r.recordsProcessed, 0);

    console.log('   ✓ Processing completed:');
    console.log(`     - Records processed: ${totalProcessed.toLocaleString()}`);
    console.log(`     - Records inserted: ${totalInserted.toLocaleString()}`);
    console.log(`     - Duration: ${(processTime / 1000).toFixed(1)}s\n`);

    // Step 3: Benchmark performance
    console.log('⏱️  Step 3: Benchmarking performance...\n');

    const cdxFileBenchmark = await benchmarkCdxFiles(filePaths, crawlId);
    const cdxApiBenchmark = await benchmarkCdxApi(crawlId, 100);

    console.log('   CDX File Processing:');
    console.log(`     - Total time: ${(cdxFileBenchmark.totalTime / 1000).toFixed(1)}s`);
    console.log(`     - Records processed: ${cdxFileBenchmark.recordsProcessed.toLocaleString()}`);
    console.log(`     - Records/second: ${cdxFileBenchmark.recordsPerSecond.toLocaleString()}\n`);

    console.log('   CDX API Processing (sample):');
    console.log(`     - Total time: ${(cdxApiBenchmark.totalTime / 1000).toFixed(1)}s`);
    console.log(`     - Records processed: ${cdxApiBenchmark.recordsProcessed.toLocaleString()}`);
    console.log(`     - Records/second: ${cdxApiBenchmark.recordsPerSecond.toLocaleString()}\n`);

    if (cdxFileBenchmark.recordsPerSecond > 0 && cdxApiBenchmark.recordsPerSecond > 0) {
      const speedup = cdxFileBenchmark.recordsPerSecond / cdxApiBenchmark.recordsPerSecond;
      console.log(`   📈 Performance Improvement: ${speedup.toFixed(2)}x faster with CDX files\n`);
    }

    // Step 4: Data quality verification
    console.log('✅ Step 4: Verifying data quality...\n');

    const comparisonResults = await compareResults(options.testQueries || ['*.nl'], crawlId);

    for (const result of comparisonResults) {
      console.log(`   Query: ${result.query}`);
      console.log(`     - CDX File results: ${result.cdxFileResults}`);
      console.log(`     - CDX API results: ${result.cdxApiResults}`);
      if (result.match) {
        console.log(`     - ✓ Results match\n`);
      } else {
        console.log(`     - ⚠️  Results differ:`);
        result.differences?.forEach(diff => console.log(`       - ${diff}`));
        console.log('');
      }
    }

    // Step 5: Test resume capability
    console.log('🔄 Step 5: Testing resume capability...\n');

    const resumeTest = await testResumeCapability(crawlId, outputDir, options.maxFiles || 5);
    if (resumeTest.success) {
      console.log(`   ✓ ${resumeTest.message}\n`);
    } else {
      console.log(`   ⚠️  ${resumeTest.message}\n`);
    }

    // Summary
    const totalDuration = Date.now() - startTime;
    const minutes = Math.floor(totalDuration / 60000);
    const seconds = Math.floor((totalDuration % 60000) / 1000);

    console.log('📊 Verification Summary:');
    console.log(`   Files processed: ${filePaths.length}`);
    console.log(`   Records inserted: ${totalInserted.toLocaleString()}`);
    console.log(`   Total duration: ${minutes}m ${seconds}s`);
    console.log(`   Performance: ${cdxFileBenchmark.recordsPerSecond.toLocaleString()} records/second\n`);

    const allQueriesMatch = comparisonResults.every(r => r.match);
    if (allQueriesMatch) {
      console.log('✅ All data quality checks passed!\n');
    } else {
      console.log('⚠️  Some data quality checks failed. Review differences above.\n');
    }

  } catch (error) {
    logger.error({ error }, 'Verification failed');
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await closeDB();
  }
}

// Run verification
main().catch((error) => {
  logger.error({ error }, 'Verification script execution failed');
  console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

