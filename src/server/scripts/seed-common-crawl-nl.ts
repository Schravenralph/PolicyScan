/**
 * Seed Common Crawl .nl Domain Index
 * 
 * Loads all .nl domains from a Common Crawl crawl into MongoDB.
 * Uses date range pagination to handle large datasets.
 */

import { fileURLToPath } from 'url';
import { connectDB, closeDB } from '../config/database.js';
import { CommonCrawlIndexService } from '../services/common-crawl/CommonCrawlIndexService.js';
import type { CDXApiResult } from '../services/common-crawl/CommonCrawlIndexService.js';
import axios from 'axios';
import { generateBatchDateRanges, type DateRange } from '../services/common-crawl/commonCrawlDateRangePagination.js';

const DEFAULT_CRAWL_ID = 'CC-MAIN-2025-47';
const BATCH_SIZE = 50000; // Results per batch
const DELAY_BETWEEN_BATCHES = 200; // ms

async function seedNLDomains(crawlId: string = DEFAULT_CRAWL_ID) {
    const startTime = Date.now();
    
    console.log('🌱 Starting Common Crawl .nl domain seeding...');
    console.log(`   Crawl ID: ${crawlId}`);
    console.log(`   Pattern: *.nl/*`);
    console.log(`   Batch size: ${BATCH_SIZE}`);
    
    // Connect to database
    await connectDB();
    const indexService = new CommonCrawlIndexService();
    
    // Create indexes
    console.log('📊 Creating indexes...');
    await indexService.createIndexes();
    
    // Check if crawl is already loaded
    const isLoaded = await indexService.isCrawlLoaded(crawlId);
    if (isLoaded) {
        const stats = await indexService.getStats(crawlId);
        console.log(`⚠️  Crawl ${crawlId} already loaded:`);
        console.log(`   Total records: ${stats.total.toLocaleString()}`);
        console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
        console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}`);
        
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
            rl.question('Delete existing data and reload? (y/N): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== 'y') {
            console.log('❌ Seeding cancelled');
            await closeDB();
            return;
        }
        
        console.log('🗑️  Deleting existing data...');
        const deleted = await indexService.deleteCrawl(crawlId);
        console.log(`   Deleted ${deleted.toLocaleString()} records`);
    }
    
    // Generate date ranges for pagination
    console.log('📅 Generating date ranges for pagination...');
    let dateRanges: DateRange[];
    try {
        dateRanges = await generateBatchDateRanges(crawlId, 100); // Start with 100 batches
        console.log(`   Generated ${dateRanges.length} date ranges`);
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`   Could not generate date ranges: ${errorMsg}`);
        console.warn('   Will use single query (may miss some results)');
        dateRanges = [];
    }
    
    const cdxUrl = `https://index.commoncrawl.org/${crawlId}-index`;
    let totalLoaded = 0;
    let batchNumber = 0;
    
    // If we have date ranges, use them for pagination
    if (dateRanges.length > 0) {
        console.log(`\n📦 Loading ${dateRanges.length} batches by date range...`);
        
        for (const dateRange of dateRanges) {
            batchNumber++;
            
            try {
                const params = new URLSearchParams({
                    url: '*.nl/*',
                    output: 'json',
                    limit: BATCH_SIZE.toString(),
                    from: dateRange.from,
                    to: dateRange.to,
                    filter: 'statuscode:200', // Only successful pages
                });
                
                console.log(`\n[Batch ${batchNumber}/${dateRanges.length}] ${dateRange.from} to ${dateRange.to}`);
                
                const response = await axios.get(`${cdxUrl}?${params.toString()}`, {
                    timeout: 60000,
                    headers: { 'User-Agent': 'Beleidsscan/1.0' }
                });
                
                // Parse NDJSON response
                const lines = response.data.trim().split('\n').filter((line: string) => line.trim());
                
                if (lines.length === 0) {
                    console.log('   No results in this date range');
                    continue;
                }
                
                const results = lines
                    .map((line: string) => {
                        try {
                            return JSON.parse(line);
                        } catch {
                            return null;
                        }
                    })
                    .filter((r: unknown): r is Record<string, unknown> => r !== null);
                
                // Convert to index records
                const records = results.map((result: Record<string, unknown>) => 
                    indexService.convertCDXToRecord(result as CDXApiResult, crawlId)
                );
                
                // Insert into database
                const inserted = await indexService.insertRecords(records);
                totalLoaded += inserted;
                
                const elapsed = (Date.now() - startTime) / 1000;
                const avgTimePerBatch = elapsed / batchNumber;
                const remainingBatches = dateRanges.length - batchNumber;
                const estimatedTimeRemaining = avgTimePerBatch * remainingBatches;
                
                console.log(`   ✅ Loaded ${inserted.toLocaleString()} records`);
                console.log(`   📊 Total: ${totalLoaded.toLocaleString()} records`);
                console.log(`   ⏱️  Elapsed: ${formatTime(elapsed)}`);
                console.log(`   ⏳ ETA: ${formatTime(estimatedTimeRemaining)}`);
                
                // Rate limiting
                if (DELAY_BETWEEN_BATCHES > 0) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
                
            } catch (error: unknown) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`   ❌ Error in batch ${batchNumber}:`, errorMsg);
                // Continue with next batch
            }
        }
    } else {
        // Fallback: single query (limited results)
        console.log('\n📦 Loading single batch (no date ranges)...');
        
        const params = new URLSearchParams({
            url: '*.nl/*',
            output: 'json',
            limit: BATCH_SIZE.toString(),
            filter: 'statuscode:200',
        });
        
        try {
            const response = await axios.get(`${cdxUrl}?${params.toString()}`, {
                timeout: 60000,
                headers: { 'User-Agent': 'Beleidsscan/1.0' }
            });
            
            const lines = response.data.trim().split('\n').filter((line: string) => line.trim());
            const results = lines
                .map((line: string) => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter((r: unknown): r is Record<string, unknown> => r !== null);
            
            const records = results.map((result: Record<string, unknown>) => 
                indexService.convertCDXToRecord(result as CDXApiResult, crawlId)
            );
            
            const inserted = await indexService.insertRecords(records);
            totalLoaded = inserted;
            
            console.log(`   ✅ Loaded ${inserted.toLocaleString()} records`);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`   ❌ Error:`, errorMsg);
        }
    }
    
    // Final statistics
    const stats = await indexService.getStats(crawlId);
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log('\n✅ Seeding complete!');
    console.log(`   Total records: ${stats.total.toLocaleString()}`);
    console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
    console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}`);
    console.log(`   Time elapsed: ${formatTime(elapsed)}`);
    
    await closeDB();
}

function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Run if called directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url) || 
                     process.argv[1]?.includes('seed-common-crawl-nl');

if (isMainModule) {
    const crawlId = process.argv[2] || DEFAULT_CRAWL_ID;
    seedNLDomains(crawlId)
        .then(() => {
            console.log('\n✅ Done!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Error:', error);
            console.error(error.stack);
            process.exit(1);
        });
}

export { seedNLDomains };

