/**
 * Validate Complete CDX File Migration (Phase 3)
 * 
 * This script validates the complete dataset after full CDX file migration.
 * It checks data completeness, quality, and generates a comprehensive validation report.
 * 
 * Usage:
 *   pnpm run commoncrawl:validate-migration                    # Validate latest crawl
 *   pnpm run commoncrawl:validate-migration -- --crawl CC-MAIN-2025-47
 *   pnpm run commoncrawl:validate-migration -- --output report.json
 * 
 * What it does:
 *   1. Connects to MongoDB and queries CDX index collection
 *   2. Validates data completeness (record counts, coverage)
 *   3. Validates data quality (required fields, data types)
 *   4. Generates validation report
 *   5. Checks for duplicates and inconsistencies
 */

import { connectDB, closeDB, getDB } from '../config/database.js';
import { CommonCrawlIndexService, type CDXIndexRecord } from '../services/common-crawl/CommonCrawlIndexService.js';
import { CDXFileDownloadService } from '../services/common-crawl/CDXFileDownloadService.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs/promises';

interface ValidationOptions {
  crawlId?: string;
  outputFile?: string;
}

interface ValidationReport {
  crawlId: string;
  timestamp: Date;
  summary: {
    totalRecords: number;
    uniqueDomains: number;
    uniqueUrls: number;
    recordsBySource: Record<string, number>;
    recordsByStatus: Record<string, number>;
    recordsByMime: Record<string, number>;
  };
  completeness: {
    recordsWithAllFields: number;
    recordsWithMissingFields: number;
    missingFieldsBreakdown: Record<string, number>;
  };
  quality: {
    duplicateUrls: number;
    invalidTimestamps: number;
    invalidStatusCodes: number;
    recordsWithIssues: number;
  };
  coverage: {
    totalFilesExpected?: number;
    totalFilesProcessed?: number;
    coveragePercentage?: number;
  };
  validation: {
    passed: boolean;
    issues: string[];
    warnings: string[];
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(): ValidationOptions {
  const args = process.argv.slice(2);
  const options: ValidationOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--crawl' && i + 1 < args.length) {
      options.crawlId = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputFile = args[++i];
    }
  }

  return options;
}

/**
 * Get crawl statistics from MongoDB
 */
async function getCrawlStatistics(crawlId: string): Promise<{
  totalRecords: number;
  uniqueDomains: Set<string>;
  uniqueUrls: Set<string>;
  recordsBySource: Record<string, number>;
  recordsByStatus: Record<string, number>;
  recordsByMime: Record<string, number>;
}> {
  const db = getDB();
  if (!db) {
    throw new Error('Database not connected');
  }

  const collection = db.collection<CDXIndexRecord>('commoncrawl_index');

  // Get total records for this crawl
  const totalRecords = await collection.countDocuments({ crawlId });

  // Get unique domains
  const uniqueDomains = new Set<string>();
  const domainCursor = collection.find({ crawlId }, { projection: { domain: 1 } });
  for await (const doc of domainCursor) {
    if (doc.domain) {
      uniqueDomains.add(doc.domain);
    }
  }

  // Get unique URLs
  const uniqueUrls = new Set<string>();
  const urlCursor = collection.find({ crawlId }, { projection: { url: 1 } });
  for await (const doc of urlCursor) {
    if (doc.url) {
      uniqueUrls.add(doc.url);
    }
  }

  // Get records by source
  const recordsBySource: Record<string, number> = {};
  const sourceAggregation = await collection.aggregate([
    { $match: { crawlId } },
    { $group: { _id: '$source', count: { $sum: 1 } } },
  ]).toArray();
  for (const item of sourceAggregation) {
    recordsBySource[item._id || 'unknown'] = item.count as number;
  }

  // Get records by status code
  const recordsByStatus: Record<string, number> = {};
  const statusAggregation = await collection.aggregate([
    { $match: { crawlId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();
  for (const item of statusAggregation) {
    recordsByStatus[item._id || 'unknown'] = item.count as number;
  }

  // Get records by MIME type
  const recordsByMime: Record<string, number> = {};
  const mimeAggregation = await collection.aggregate([
    { $match: { crawlId } },
    { $group: { _id: '$mime', count: { $sum: 1 } } },
  ]).toArray();
  for (const item of mimeAggregation) {
    recordsByMime[item._id || 'unknown'] = item.count as number;
  }

  return {
    totalRecords,
    uniqueDomains,
    uniqueUrls,
    recordsBySource,
    recordsByStatus,
    recordsByMime,
  };
}

/**
 * Validate data completeness
 */
async function validateCompleteness(crawlId: string): Promise<{
  recordsWithAllFields: number;
  recordsWithMissingFields: number;
  missingFieldsBreakdown: Record<string, number>;
}> {
  const db = getDB();
  if (!db) {
    throw new Error('Database not connected');
  }

  const collection = db.collection<CDXIndexRecord>('commoncrawl_index');

  // Required fields for CDX records
  const requiredFields = ['urlkey', 'timestamp', 'url', 'mime', 'status', 'digest', 'length', 'offset', 'filename', 'domain', 'path', 'crawlId'];

  // Count records with all required fields
  const recordsWithAllFields = await collection.countDocuments({
    crawlId,
    urlkey: { $exists: true, $ne: null as any },
    timestamp: { $exists: true, $ne: null as any },
    url: { $exists: true, $ne: null as any },
    mime: { $exists: true, $ne: null as any },
    status: { $exists: true, $ne: null as any },
    digest: { $exists: true, $ne: null as any },
    length: { $exists: true, $ne: null as any },
    offset: { $exists: true, $ne: null as any },
    filename: { $exists: true, $ne: null as any },
    domain: { $exists: true, $ne: null as any },
    path: { $exists: true, $ne: null as any },
  });

  const totalRecords = await collection.countDocuments({ crawlId });
  const recordsWithMissingFields = totalRecords - recordsWithAllFields;

  // Get breakdown of missing fields
  const missingFieldsBreakdown: Record<string, number> = {};
  for (const field of requiredFields) {
    const missingCount = await collection.countDocuments({
      crawlId,
      [field]: { $exists: false },
    });
    if (missingCount > 0) {
      missingFieldsBreakdown[field] = missingCount;
    }
  }

  return {
    recordsWithAllFields,
    recordsWithMissingFields,
    missingFieldsBreakdown,
  };
}

/**
 * Validate data quality
 */
async function validateQuality(crawlId: string): Promise<{
  duplicateUrls: number;
  invalidTimestamps: number;
  invalidStatusCodes: number;
  recordsWithIssues: number;
}> {
  const db = getDB();
  if (!db) {
    throw new Error('Database not connected');
  }

  const collection = db.collection<CDXIndexRecord>('commoncrawl_index');

  // Find duplicate URLs (same URL with different timestamps is OK, but same URL+timestamp should be unique)
  const duplicateAggregation = await collection.aggregate([
    { $match: { crawlId } },
    { $group: { _id: { url: '$url', timestamp: '$timestamp' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'duplicates' },
  ]).toArray();
  const duplicateUrls = duplicateAggregation[0]?.duplicates as number || 0;

  // Find invalid timestamps (should be 14 digits)
  const invalidTimestamps = await collection.countDocuments({
    crawlId,
    $or: [
      { timestamp: { $exists: false } },
      { timestamp: { $not: /^\d{14}$/ } },
    ],
  });

  // Find invalid status codes (should be 3-digit numbers)
  const invalidStatusCodes = await collection.countDocuments({
    crawlId,
    $or: [
      { status: { $exists: false } },
      { status: { $not: /^\d{3}$/ } },
    ],
  });

  // Count records with any issues
  const recordsWithIssues = await collection.countDocuments({
    crawlId,
    $or: [
      { timestamp: { $not: /^\d{14}$/ } },
      { status: { $not: /^\d{3}$/ } },
      { url: { $exists: false } },
      { domain: { $exists: false } },
    ],
  });

  return {
    duplicateUrls,
    invalidTimestamps,
    invalidStatusCodes,
    recordsWithIssues,
  };
}

/**
 * Get coverage information
 */
async function getCoverage(crawlId: string): Promise<{
  totalFilesExpected?: number;
  totalFilesProcessed?: number;
  coveragePercentage?: number;
}> {
  try {
    const _downloadService = new CDXFileDownloadService();
    
    // Get expected number of files for this crawl
    // This is an estimate based on Common Crawl's typical structure
    // Actual count may vary
    const outputDir = path.join(process.cwd(), 'commoncrawl', crawlId, 'cdx-indexes');
    
    try {
      const files = await fs.readdir(outputDir);
      const processedFiles = files.filter(f => f.endsWith('.gz')).length;
      
      // Estimate expected files (Common Crawl typically has 200-300 CDX files per crawl)
      // This is a rough estimate - actual count depends on crawl size
      const estimatedFiles = 250; // Conservative estimate
      
      return {
        totalFilesExpected: estimatedFiles,
        totalFilesProcessed: processedFiles,
        coveragePercentage: processedFiles > 0 ? Math.round((processedFiles / estimatedFiles) * 100) : 0,
      };
    } catch {
      // Directory doesn't exist or can't be read
      return {};
    }
  } catch {
    return {};
  }
}

/**
 * Generate validation report
 */
async function generateValidationReport(crawlId: string): Promise<ValidationReport> {
  console.log('📊 Gathering statistics...');
  const statistics = await getCrawlStatistics(crawlId);

  console.log('✅ Validating completeness...');
  const completeness = await validateCompleteness(crawlId);

  console.log('🔍 Validating quality...');
  const quality = await validateQuality(crawlId);

  console.log('📈 Calculating coverage...');
  const coverage = await getCoverage(crawlId);

  // Determine validation status
  const issues: string[] = [];
  const warnings: string[] = [];

  if (statistics.totalRecords === 0) {
    issues.push('No records found for this crawl');
  }

  if (completeness.recordsWithMissingFields > 0) {
    warnings.push(`${completeness.recordsWithMissingFields} records have missing fields`);
  }

  if (quality.duplicateUrls > 0) {
    warnings.push(`${quality.duplicateUrls} duplicate URL+timestamp combinations found`);
  }

  if (quality.invalidTimestamps > 0) {
    issues.push(`${quality.invalidTimestamps} records have invalid timestamps`);
  }

  if (quality.invalidStatusCodes > 0) {
    issues.push(`${quality.invalidStatusCodes} records have invalid status codes`);
  }

  if (coverage.coveragePercentage !== undefined && coverage.coveragePercentage < 50) {
    warnings.push(`Low coverage: ${coverage.coveragePercentage}% of estimated files processed`);
  }

  const passed = issues.length === 0;

  return {
    crawlId,
    timestamp: new Date(),
    summary: {
      totalRecords: statistics.totalRecords,
      uniqueDomains: statistics.uniqueDomains.size,
      uniqueUrls: statistics.uniqueUrls.size,
      recordsBySource: statistics.recordsBySource,
      recordsByStatus: statistics.recordsByStatus,
      recordsByMime: statistics.recordsByMime,
    },
    completeness,
    quality,
    coverage,
    validation: {
      passed,
      issues,
      warnings,
    },
  };
}

/**
 * Print validation report
 */
function printReport(report: ValidationReport): void {
  console.log('\n📋 Validation Report\n');
  console.log(`Crawl ID: ${report.crawlId}`);
  console.log(`Timestamp: ${report.timestamp.toISOString()}\n`);

  console.log('📊 Summary:');
  console.log(`   Total records: ${report.summary.totalRecords.toLocaleString()}`);
  console.log(`   Unique domains: ${report.summary.uniqueDomains.toLocaleString()}`);
  console.log(`   Unique URLs: ${report.summary.uniqueUrls.toLocaleString()}\n`);

  console.log('📦 Records by Source:');
  for (const [source, count] of Object.entries(report.summary.recordsBySource)) {
    console.log(`   ${source}: ${count.toLocaleString()}`);
  }
  console.log('');

  console.log('📊 Records by Status Code:');
  for (const [status, count] of Object.entries(report.summary.recordsByStatus)) {
    console.log(`   ${status}: ${count.toLocaleString()}`);
  }
  console.log('');

  console.log('📄 Top MIME Types:');
  const topMimes = Object.entries(report.summary.recordsByMime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [mime, count] of topMimes) {
    console.log(`   ${mime}: ${count.toLocaleString()}`);
  }
  console.log('');

  console.log('✅ Completeness:');
  console.log(`   Records with all fields: ${report.completeness.recordsWithAllFields.toLocaleString()}`);
  console.log(`   Records with missing fields: ${report.completeness.recordsWithMissingFields.toLocaleString()}`);
  if (Object.keys(report.completeness.missingFieldsBreakdown).length > 0) {
    console.log('   Missing fields breakdown:');
    for (const [field, count] of Object.entries(report.completeness.missingFieldsBreakdown)) {
      console.log(`     ${field}: ${count.toLocaleString()}`);
    }
  }
  console.log('');

  console.log('🔍 Quality:');
  console.log(`   Duplicate URLs: ${report.quality.duplicateUrls.toLocaleString()}`);
  console.log(`   Invalid timestamps: ${report.quality.invalidTimestamps.toLocaleString()}`);
  console.log(`   Invalid status codes: ${report.quality.invalidStatusCodes.toLocaleString()}`);
  console.log(`   Records with issues: ${report.quality.recordsWithIssues.toLocaleString()}`);
  console.log('');

  if (report.coverage.totalFilesProcessed !== undefined) {
    console.log('📈 Coverage:');
    console.log(`   Files processed: ${report.coverage.totalFilesProcessed}`);
    if (report.coverage.totalFilesExpected !== undefined) {
      console.log(`   Files expected: ${report.coverage.totalFilesExpected}`);
      console.log(`   Coverage: ${report.coverage.coveragePercentage}%`);
    }
    console.log('');
  }

  console.log('✅ Validation:');
  if (report.validation.passed) {
    console.log('   ✓ Validation PASSED');
  } else {
    console.log('   ✗ Validation FAILED');
  }

  if (report.validation.issues.length > 0) {
    console.log('   Issues:');
    for (const issue of report.validation.issues) {
      console.log(`     - ${issue}`);
    }
  }

  if (report.validation.warnings.length > 0) {
    console.log('   Warnings:');
    for (const warning of report.validation.warnings) {
      console.log(`     - ${warning}`);
    }
  }
  console.log('');
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('🔍 Validating CDX File Migration (Phase 3)\n');

  try {
    // Connect to database
    console.log('📊 Connecting to MongoDB...');
    await connectDB();
    const indexService = new CommonCrawlIndexService();
    await indexService.createIndexes();
    console.log('   ✓ Connected to MongoDB\n');

    // Get crawl ID
    let crawlId = options.crawlId;
    if (!crawlId) {
      console.log('🔍 Detecting latest Common Crawl crawl...');
      const downloadService = new CDXFileDownloadService();
      crawlId = await downloadService.getLatestCrawlId();
      console.log(`   ✓ Latest crawl: ${crawlId}\n`);
    } else {
      console.log(`📋 Using crawl: ${crawlId}\n`);
    }

    // Generate validation report
    const report = await generateValidationReport(crawlId);

    // Print report
    printReport(report);

    // Save report to file if requested
    if (options.outputFile) {
      const outputPath = path.resolve(options.outputFile);
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      console.log(`📄 Report saved to: ${outputPath}\n`);
    }

    // Close database connection
    await closeDB();

    const duration = Date.now() - startTime;
    const seconds = Math.floor(duration / 1000);
    console.log(`✅ Validation completed in ${seconds}s`);

    // Exit with appropriate code
    process.exit(report.validation.passed ? 0 : 1);
  } catch (error) {
    logger.error({ error }, 'Validation script execution failed');
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    await closeDB();
    process.exit(1);
  }
}

// Run the script
main();
