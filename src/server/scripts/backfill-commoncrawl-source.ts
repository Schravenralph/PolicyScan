/**
 * Backfill source='api' for existing Common Crawl records
 * 
 * This script adds the source field to existing records that were loaded
 * before the source field was implemented. All existing records are assumed
 * to have come from the CDX API loader.
 * 
 * Usage:
 *   pnpm run commoncrawl:backfill-source
 *   pnpm run commoncrawl:backfill-source -- --dry-run    # Preview changes without updating
 */

import { connectDB, closeDB } from '../config/database.js';
import { getDB } from '../config/database.js';
import { type ObjectId } from 'mongodb';

interface CDXIndexRecord {
    _id?: ObjectId;
    source?: 'api' | 's3';
    crawlId?: string;
}

async function backfillSource() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run') || args.includes('--dryrun');
    
    console.log('🔄 Backfilling source field for existing Common Crawl records...\n');
    
    if (isDryRun) {
        console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    }
    
    await connectDB();
    const db = getDB();
    const collection = db.collection<CDXIndexRecord>('commoncrawl_index');
    
    // Count records without source field
    console.log('📊 Analyzing existing records...');
    const totalRecords = await collection.countDocuments({});
    const recordsWithoutSource = await collection.countDocuments({
        $or: [
            { source: { $exists: false } },
            { source: undefined }
        ]
    });
    const recordsWithSource = await collection.countDocuments({
        source: { $exists: true }
    });
    
    console.log(`   Total records: ${totalRecords.toLocaleString()}`);
    console.log(`   Records with source field: ${recordsWithSource.toLocaleString()}`);
    console.log(`   Records without source field: ${recordsWithoutSource.toLocaleString()}\n`);
    
    if (recordsWithoutSource === 0) {
        console.log('✅ All records already have a source field. Nothing to backfill.');
        await closeDB();
        return;
    }
    
    // Get breakdown by source for records that have it
    if (recordsWithSource > 0) {
        const apiCount = await collection.countDocuments({ source: 'api' });
        const s3Count = await collection.countDocuments({ source: 's3' });
        console.log('   Current source breakdown:');
        console.log(`      source='api': ${apiCount.toLocaleString()}`);
        console.log(`      source='s3': ${s3Count.toLocaleString()}\n`);
    }
    
    // Get breakdown by crawlId for records without source
    console.log('📋 Records without source field, by crawlId:');
    const crawlBreakdown = await collection.aggregate([
        {
            $match: {
                $or: [
                    { source: { $exists: false } },
                    { source: undefined }
                ]
            }
        },
        {
            $group: {
                _id: '$crawlId',
                count: { $sum: 1 }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]).toArray();
    
    for (const item of crawlBreakdown) {
        console.log(`   ${item._id || '(no crawlId)'}: ${item.count.toLocaleString()} records`);
    }
    console.log('');
    
    if (isDryRun) {
        console.log('💡 Would update all records without source field to source="api"');
        console.log('   Run without --dry-run to apply changes\n');
        await closeDB();
        return;
    }
    
    // Update all records without source field to source='api'
    console.log('🔄 Updating records without source field to source="api"...');
    const result = await collection.updateMany(
        {
            $or: [
                { source: { $exists: false } },
                { source: undefined }
            ]
        },
        {
            $set: {
                source: 'api'
            }
        }
    );
    
    console.log(`   ✓ Updated ${result.modifiedCount.toLocaleString()} records\n`);
    
    // Verify the update
    console.log('✅ Verifying update...');
    const remainingWithoutSource = await collection.countDocuments({
        $or: [
            { source: { $exists: false } },
            { source: undefined }
        ]
    });
    const finalApiCount = await collection.countDocuments({ source: 'api' });
    const finalS3Count = await collection.countDocuments({ source: 's3' });
    
    console.log(`   Records with source='api': ${finalApiCount.toLocaleString()}`);
    console.log(`   Records with source='s3': ${finalS3Count.toLocaleString()}`);
    console.log(`   Records without source: ${remainingWithoutSource.toLocaleString()}\n`);
    
    if (remainingWithoutSource === 0) {
        console.log('✅ Backfill completed successfully! All records now have a source field.');
    } else {
        console.warn(`⚠️  Warning: ${remainingWithoutSource.toLocaleString()} records still missing source field`);
    }
    
    await closeDB();
}

backfillSource()
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });

