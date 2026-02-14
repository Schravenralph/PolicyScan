/**
 * Example: Using ScraperGraphIntegration
 * 
 * This example demonstrates how to use the ScraperGraphIntegration helper
 * to manage graph inheritance, versioning, and scraper-specific nodes.
 * 
 * Usage:
 *   tsx src/server/scripts/example-scraper-graph-integration.ts
 */

import { fileURLToPath } from 'url';
import { connectNeo4j } from '../config/neo4j.js';
import { ScraperGraphIntegration } from '../services/scraperGraph/ScraperGraphIntegration.js';
import { NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';
import { ScraperMetadata } from '../services/scraperGraph/ScraperGraphVersioning.js';
import { HorstAanDeMaasBetaalbareHuisvestingScraper } from '../services/scrapers/index.js';

async function main() {
    console.log('🚀 Scraper Graph Integration Example\n');

    // Connect to Neo4j
    const driver = await connectNeo4j();
    
    try {
        // Create integration helper
        const scraperId = 'HorstAanDeMaasBetaalbareHuisvestingScraper';
        const integration = new ScraperGraphIntegration(driver, scraperId, {
            autoPullFromParent: true,
            conflictResolution: 'merge',
            autoVersion: true
        });

        await integration.initialize();
        console.log('✅ Integration initialized\n');

        // Check if scraper is registered
        const metadata = await integration.getMetadata();
        if (!metadata) {
            console.log('📝 Scraper not registered, seeding...\n');
            
            // Seed the scraper
            const scraper = new HorstAanDeMaasBetaalbareHuisvestingScraper();
            const newMetadata: ScraperMetadata = {
                scraperId,
                scraperName: 'Horst aan de Maas Betaalbare Huisvesting Scraper',
                parentScraperId: 'HorstAanDeMaasScraper',
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                    topic: 'betaalbare huisvesting',
                    keywords: ['betaalbare', 'huisvesting', 'woningbouw']
                }
            };

            const seedResult = await integration.seedScraper(scraper, newMetadata, {
                conflictResolution: 'merge',
                saveVersion: true
            });

            console.log('✅ Seeding complete!');
            console.log(`   Version: ${seedResult.version}`);
            console.log(`   Total nodes: ${seedResult.totalNodes}`);
            console.log(`   From parent: ${seedResult.nodesFromParent}`);
            console.log(`   Own nodes: ${seedResult.nodesFromChild}`);
            console.log(`   Conflicts: ${seedResult.conflicts.length}\n`);
        } else {
            console.log('✅ Scraper already registered\n');
        }

        // Get status
        const status = await integration.getStatus();
        console.log('📊 Current Status:');
        console.log(`   Registered: ${status.registered}`);
        console.log(`   Version: ${status.version}`);
        console.log(`   Total nodes: ${status.totalNodes}`);
        console.log(`   Own nodes: ${status.ownNodes}`);
        console.log(`   Inherited nodes: ${status.inheritedNodes}`);
        console.log(`   File versions: ${status.fileVersions}\n`);

        // Example: Add a discovered node
        console.log('🔍 Adding discovered node...');
        const discoveredNode: NavigationNode = {
            url: 'https://horstaandemaas.nl/betaalbare-huisvesting/nieuwe-pagina',
            type: 'page',
            title: 'Nieuwe Betaalbare Huisvesting Pagina',
            children: [],
            lastVisited: new Date().toISOString()
        };

        await integration.addDiscoveredNode(discoveredNode);
        console.log('✅ Node added as scraper-specific\n');

        // Get node breakdown
        const allNodes = await integration.getAllNodes(true);
        const ownNodes = await integration.getOwnNodes();
        const inheritedNodes = await integration.getInheritedNodes();

        console.log('📊 Node Breakdown:');
        console.log(`   Total nodes: ${allNodes.length}`);
        console.log(`   Own nodes: ${ownNodes.length}`);
        console.log(`   Inherited nodes: ${inheritedNodes.length}\n`);

        // Example: Pull from parent
        console.log('📥 Pulling from parent...');
        const pullResult = await integration.pullFromParent({
            conflictResolution: 'merge',
            saveVersion: true
        });

        console.log('✅ Pull complete!');
        console.log(`   Nodes pulled: ${pullResult.nodesPulled}`);
        console.log(`   Nodes updated: ${pullResult.nodesUpdated}`);
        console.log(`   Conflicts: ${pullResult.conflicts.length}\n`);

        // List versions
        const versions = await integration.listVersions();
        console.log('📋 Versions:');
        versions.forEach((v: { version: string; timestamp: string; nodeCount: number }, index: number) => {
            const marker = index === versions.length - 1 ? '→' : ' ';
            console.log(`${marker} v${v.version}  ${v.timestamp}  (${v.nodeCount} nodes)`);
        });
        console.log('');

    } catch (error) {
        console.error('❌ Error:', error);
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

