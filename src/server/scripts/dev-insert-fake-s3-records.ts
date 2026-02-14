/**
 * DEV-ONLY: Insert fake S3 records for UI/testing
 * 
 * ⚠️  DEVELOPMENT ONLY - Do not use in production
 * 
 * This script inserts a small number of fake records with source='s3' to test
 * the UI and verify that S3-sourced records display correctly. These are
 * synthetic records based on real .nl domains but marked as coming from S3.
 * 
 * Usage:
 *   pnpm run commoncrawl:dev-fake-s3
 *   pnpm run commoncrawl:dev-fake-s3 -- --count 50    # Insert 50 records (default: 20)
 *   pnpm run commoncrawl:dev-fake-s3 -- --crawl CC-MAIN-2025-47
 */

import { connectDB, closeDB, getDB } from '../config/database.js';
import { CommonCrawlIndexService, type CDXIndexRecord } from '../services/common-crawl/CommonCrawlIndexService.js';
import { type Filter } from 'mongodb';

// Sample .nl domains for fake records
const SAMPLE_DOMAINS = [
    'amsterdam.nl',
    'rotterdam.nl',
    'denhaag.nl',
    'utrecht.nl',
    'eindhoven.nl',
    'groningen.nl',
    'tilburg.nl',
    'almere.nl',
    'breda.nl',
    'nijmegen.nl',
    'enschede.nl',
    'haarlem.nl',
    'arnhem.nl',
    'zaanstad.nl',
    'amersfoort.nl',
    'apeldoorn.nl',
    's-hertogenbosch.nl',
    'hoofddorp.nl',
    'maastricht.nl',
    'leiden.nl'
];

const SAMPLE_PATHS = [
    '/beleid',
    '/antennebeleid',
    '/omgevingswet',
    '/ruimtelijke-ordening',
    '/wonen',
    '/mobiliteit',
    '/duurzaamheid',
    '/klimaat',
    '/energie',
    '/geluid'
];

type FakeRecord = {
    urlkey: string;
    timestamp: string;
    url: string;
    mime: string;
    status: string;
    digest: string;
    length: number;
    offset: string;
    filename: string;
    domain: string;
    path: string;
    crawlId: string;
    source: 's3';
};

function generateFakeRecord(domain: string, path: string, index: number, crawlId: string): FakeRecord {
    const url = `https://${domain}${path}`;
    const urlkey = `nl,${domain.replace(/\./g, ',')})${path}`;
    const timestamp = `2025010${String(index % 10).padStart(1, '0')}00000`;
    
    return {
        urlkey,
        timestamp,
        url,
        mime: 'text/html',
        status: '200',
        digest: `fake-digest-${index}-${Date.now()}`,
        length: 1000 + (index * 100),
        offset: String(index * 1000),
        filename: `fake-${crawlId}-segment-${String(Math.floor(index / 1000)).padStart(5, '0')}.warc.gz`,
        domain,
        path,
        crawlId,
        source: 's3' as const
    };
}

async function insertFakeS3Records() {
    const args = process.argv.slice(2);
    const countArg = args.find(arg => arg.startsWith('--count='));
    const count = countArg ? parseInt(countArg.split('=')[1]) : 20;
    
    const crawlArg = args.find(arg => arg.startsWith('--crawl='));
    const crawlId = crawlArg ? crawlArg.split('=')[1] : 'CC-MAIN-DEV-S3';
    
    console.log('🧪 DEV-ONLY: Inserting fake S3 records for UI/testing...\n');
    console.log(`   Records to insert: ${count}`);
    console.log(`   Crawl ID: ${crawlId}`);
    console.log(`   Source: s3 (fake)\n`);
    
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ ERROR: This script is for development only!');
        console.error('   Do not run in production environment.');
        process.exit(1);
    }
    
    await connectDB();
    const indexService = new CommonCrawlIndexService();
    
    // Generate fake records
    console.log('📝 Generating fake records...');
    const records: FakeRecord[] = [];
    
    for (let i = 0; i < count; i++) {
        const domain = SAMPLE_DOMAINS[i % SAMPLE_DOMAINS.length];
        const path = SAMPLE_PATHS[i % SAMPLE_PATHS.length];
        const record = generateFakeRecord(domain, path, i, crawlId);
        records.push(record);
    }
    
    console.log(`   ✓ Generated ${records.length} fake records\n`);
    
    // Insert records
    console.log('💾 Inserting records into MongoDB...');
    const inserted = await indexService.insertRecords(records);
    console.log(`   ✓ Inserted ${inserted} records\n`);
    
    // Verify insertion
    console.log('🔍 Verifying records...');
    const insertedRecords = await indexService.query({
        crawlId,
        limit: 10
    });
    
    console.log(`   ✓ Found ${insertedRecords.length} records in database\n`);
    
    // Show sample records
    console.log('📋 Sample records:');
    for (const record of insertedRecords.slice(0, 5)) {
        console.log(`   - ${record.url} (source: ${record.source})`);
    }
    console.log('');
    
    // Get stats
    const stats = await indexService.getStats(crawlId);
    console.log('📊 Statistics:');
    console.log(`   Total records: ${stats.total.toLocaleString()}`);
    console.log(`   Unique domains: ${stats.uniqueDomains.toLocaleString()}`);
    console.log(`   Unique URLs: ${stats.uniqueUrls.toLocaleString()}\n`);
    
    // Verify all have source='s3'
    const db = getDB();
    const collection = db.collection<CDXIndexRecord>('commoncrawl_index');
    const s3Filter: Filter<CDXIndexRecord> = { crawlId, source: 's3' };
    const s3Count = await collection.countDocuments(s3Filter);
    if (s3Count === stats.total) {
        console.log('✅ All records have source="s3" ✓\n');
    } else {
        console.warn(`⚠️  Warning: Expected ${stats.total} records with source='s3', found ${s3Count}\n`);
    }
    
    console.log('💡 These are fake records for testing only.');
    console.log('   To remove them, run:');
    console.log(`   pnpm run commoncrawl:delete-crawl ${crawlId}\n`);
    
    await closeDB();
    console.log('✅ Script completed successfully');
}

insertFakeS3Records()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });

