/**
 * Seed Scraper Graph with Inheritance
 * 
 * Example script showing how to seed scrapers with graph inheritance.
 * This demonstrates the git-like branching system for scraper graphs.
 * 
 * Usage:
 *   tsx src/server/scripts/seed-scraper-graph.ts <scraper-id> [options]
 * 
 * Options:
 *   --pull              Pull from parent scraper only (don't add new nodes)
 *   --merge-strategy    Conflict resolution: parent|child|merge (default: merge)
 *   --no-version        Don't save a version snapshot
 * 
 * Examples:
 *   tsx src/server/scripts/seed-scraper-graph.ts HorstAanDeMaasScraper
 *   tsx src/server/scripts/seed-scraper-graph.ts HorstAanDeMaasBetaalbareHuisvestingScraper
 *   tsx src/server/scripts/seed-scraper-graph.ts HorstAanDeMaasBetaalbareHuisvestingScraper --pull
 *   tsx src/server/scripts/seed-scraper-graph.ts HorstAanDeMaasBetaalbareHuisvestingScraper --merge-strategy=parent
 */

import { fileURLToPath } from 'url';
import { connectNeo4j } from '../config/neo4j.js';
import { UnifiedGraphSeeder } from '../services/scraperGraph/UnifiedGraphSeeder.js';
import { ScraperMetadata } from '../services/scraperGraph/ScraperGraphVersioning.js';
import { SCRAPER_REGISTRY } from '../services/scrapers/ScraperMetadataRegistry.js';
import { detectParentScraper } from '../services/scrapers/ScraperHierarchyDetector.js';

async function main() {
    const scraperId = process.argv[2];
    const args = process.argv.slice(3);

    // Parse command-line arguments
    const pullOnly = args.includes('--pull');
    const noVersion = args.includes('--no-version');
    const mergeStrategyArg = args.find(arg => arg.startsWith('--merge-strategy='));
    const mergeStrategy = mergeStrategyArg 
        ? mergeStrategyArg.split('=')[1] as 'parent' | 'child' | 'merge'
        : 'merge';

    if (!scraperId) {
        console.error('Usage: tsx src/server/scripts/seed-scraper-graph.ts <scraper-id> [options]');
        console.error('\nOptions:');
        console.error('  --pull              Pull from parent only (don\'t add new nodes)');
        console.error('  --merge-strategy    Conflict resolution: parent|child|merge (default: merge)');
        console.error('  --no-version        Don\'t save a version snapshot');
        console.error('\nAvailable scrapers:');
        Object.keys(SCRAPER_REGISTRY).forEach(id => {
            const entry = SCRAPER_REGISTRY[id];
            const parent = entry.metadata.parentScraperId 
                ? ` (inherits from ${entry.metadata.parentScraperId})`
                : ' (base scraper)';
            console.error(`  - ${id}${parent}`);
        });
        process.exit(1);
    }

    const entry = SCRAPER_REGISTRY[scraperId];
    if (!entry) {
        console.error(`❌ Scraper ${scraperId} not found in registry`);
        process.exit(1);
    }

    console.log(`🌱 ${pullOnly ? 'Pulling' : 'Seeding'} scraper: ${scraperId}`);
    console.log(`   Name: ${entry.metadata.scraperName}`);
    if (entry.metadata.parentScraperId) {
        console.log(`   Parent: ${entry.metadata.parentScraperId}`);
    }
    console.log(`   Version: ${entry.metadata.version}`);
    console.log(`   Merge strategy: ${mergeStrategy}`);
    console.log('');

    // Connect to Neo4j
    const driver = await connectNeo4j();
    const seeder = new UnifiedGraphSeeder(driver);

    try {
        await seeder.initialize();

        if (pullOnly) {
            // Pull-only mode
            if (!entry.metadata.parentScraperId) {
                console.error('❌ Cannot pull: scraper has no parent');
                process.exit(1);
            }

            console.log('📥 Pulling from parent...');
            const pullResult = await seeder.pullFromParent(scraperId, {
                conflictResolution: mergeStrategy,
                mergeStrategy: 'deep',
                preserveChildNodes: true,
                saveVersion: !noVersion
            });

            console.log('\n✅ Pull complete!');
            console.log(`   Nodes pulled: ${pullResult.nodesPulled}`);
            console.log(`   Nodes updated: ${pullResult.nodesUpdated}`);
            console.log(`   Conflicts: ${pullResult.conflicts.length}`);

            if (pullResult.conflicts.length > 0) {
                console.log('\n⚠️  Conflicts detected:');
                pullResult.conflicts.forEach(conflict => {
                    console.log(`   - ${conflict.nodeUrl}: ${conflict.conflictType}`);
                    if (!conflict.needsResolution) {
                        console.log(`     ✅ Auto-resolved`);
                    } else {
                        console.log(`     ⚠️  Needs manual resolution`);
                    }
                });
            }
        } else {
            // Full seed mode
            // Create scraper instance
            const scraper = entry.factory();

            // Auto-detect parent scraper from class hierarchy if not explicitly set
            let parentScraperId = entry.metadata.parentScraperId;
            if (!parentScraperId) {
                const detectedParent = detectParentScraper(scraper);
                if (detectedParent) {
                    parentScraperId = detectedParent;
                    console.log(`   Detected parent from class hierarchy: ${parentScraperId}`);
                }
            }

            // Prepare metadata with timestamps
            const metadata: ScraperMetadata = {
                ...entry.metadata,
                parentScraperId: parentScraperId || entry.metadata.parentScraperId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Seed the scraper
            console.log('📥 Pulling from parent, merging, and discovering nodes...');
            const result = await seeder.seedScraper(scraper, metadata, {
                conflictResolution: mergeStrategy,
                mergeStrategy: 'deep',
                preserveChildNodes: true,
                saveVersion: !noVersion,
                addScraperSpecificNodes: true // Automatically discovers nodes from scraper.scrape()
            });

            // Display results
            console.log('\n✅ Seeding complete!');
            console.log(`   Version: ${result.version}`);
            console.log(`   Total nodes: ${result.totalNodes}`);
            console.log(`   Nodes from parent: ${result.nodesFromParent}`);
            console.log(`   Nodes merged: ${result.nodesMerged}`);
            console.log(`   Scraper-specific nodes: ${result.nodesFromChild}`);
            console.log(`   Conflicts: ${result.conflicts.length}`);
            
            // Show scraper-specific nodes info
            if (metadata.parentScraperId) {
                try {
                    const scraperSpecificNodes = await seeder.versioningService.getScraperSpecificNodes(metadata.scraperId);
                    console.log(`   Scraper-specific (won't transfer upstream): ${scraperSpecificNodes.length}`);
                } catch {
                    // Ignore errors here
                }
            }

            if (result.conflicts.length > 0) {
                console.log('\n⚠️  Conflicts detected:');
                result.conflicts.forEach(conflict => {
                    console.log(`   - ${conflict.nodeUrl}: ${conflict.conflictType}`);
                    if (conflict.resolution) {
                        console.log(`     Resolution: ${conflict.resolution}`);
                    }
                });
            }

            if (result.errors.length > 0) {
                console.log('\n❌ Errors:');
                result.errors.forEach(error => {
                    console.log(`   - ${error}`);
                });
            }
        }

        // Show status
        console.log('\n📊 Current status:');
        const status = await seeder.getGraphStatus(scraperId);
        console.log(`   Registered: ${status.registered}`);
        console.log(`   Version: ${status.version}`);
        console.log(`   Total nodes: ${status.totalNodes}`);
        console.log(`   Own nodes: ${status.ownNodes}`);
        console.log(`   Inherited nodes: ${status.inheritedNodes}`);
        console.log(`   File versions: ${status.fileVersions}`);
        if (status.hasParent) {
            console.log(`   Parent: ${status.parentId}`);
            // Show scraper-specific nodes count
            try {
                const scraperSpecificNodes = await seeder.versioningService.getScraperSpecificNodes(scraperId);
                console.log(`   Scraper-specific nodes: ${scraperSpecificNodes.length}`);
            } catch {
                // Ignore errors
            }
        }

    } catch (error) {
        console.error('❌ Operation failed:', error);
        if (error instanceof Error) {
            console.error(`   ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`);
            }
        }
        process.exit(1);
    } finally {
        await driver.close();
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}
