/**
 * Seed Scraper Graphs
 * 
 * Seeds graph objects for scrapers with inheritance and merging support.
 * Similar to git branches - each scraper can inherit from its parent and merge changes.
 */

import { fileURLToPath } from 'url';
import { getNeo4jDriver } from '../config/neo4j.js';
import type { Driver } from 'neo4j-driver';
import { ScraperGraphManager, GraphMergeResult } from '../services/scraperGraph/ScraperGraphManager.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { LocalEmbeddingProvider } from '../services/query/VectorService.js';
import type { BaseScraper } from '../services/scrapers/baseScraper.js';
import { HorstAanDeMaasScraper } from '../services/scrapers/HorstAanDeMaasScraper.js';
import { HorstAanDeMaasBetaalbareHuisvestingScraper } from '../services/scrapers/HorstAanDeMaasBetaalbareHuisvestingScraper.js';
import { HorstAanDeMaasArbeidsmigrantenScraper } from '../services/scrapers/HorstAanDeMaasArbeidsmigrantenScraper.js';
import { HorstAanDeMaasEnergietransitieScraper } from '../services/scrapers/HorstAanDeMaasEnergietransitieScraper.js';
import { HorstAanDeMaasKlimaatadaptatieScraper } from '../services/scrapers/HorstAanDeMaasKlimaatadaptatieScraper.js';
import { HorstAanDeMaasKlimaatVeerkrachtScraper } from '../services/scrapers/HorstAanDeMaasKlimaatVeerkrachtScraper.js';
import { HorstAanDeMaasDuurzameMobiliteitScraper } from '../services/scrapers/HorstAanDeMaasDuurzameMobiliteitScraper.js';
import { HorstAanDeMaasGroeneInfrastructuurScraper } from '../services/scrapers/HorstAanDeMaasGroeneInfrastructuurScraper.js';
import { HorstAanDeMaasParticipatievePlanningScraper } from '../services/scrapers/HorstAanDeMaasParticipatievePlanningScraper.js';
import { HorstAanDeMaasStedelijkeVernieuwingScraper } from '../services/scrapers/HorstAanDeMaasStedelijkeVernieuwingScraper.js';
import { HorstAanDeMaasSlimmeStedenScraper } from '../services/scrapers/HorstAanDeMaasSlimmeStedenScraper.js';

interface ScraperConfig {
    name: string;
    instance: BaseScraper;
    parentName?: string;
}

const SCRAPERS: ScraperConfig[] = [
    {
        name: 'HorstAanDeMaasScraper',
        instance: new HorstAanDeMaasScraper()
    },
    {
        name: 'HorstAanDeMaasBetaalbareHuisvestingScraper',
        instance: new HorstAanDeMaasBetaalbareHuisvestingScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasArbeidsmigrantenScraper',
        instance: new HorstAanDeMaasArbeidsmigrantenScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasEnergietransitieScraper',
        instance: new HorstAanDeMaasEnergietransitieScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasKlimaatadaptatieScraper',
        instance: new HorstAanDeMaasKlimaatadaptatieScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasKlimaatVeerkrachtScraper',
        instance: new HorstAanDeMaasKlimaatVeerkrachtScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasDuurzameMobiliteitScraper',
        instance: new HorstAanDeMaasDuurzameMobiliteitScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasGroeneInfrastructuurScraper',
        instance: new HorstAanDeMaasGroeneInfrastructuurScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasParticipatievePlanningScraper',
        instance: new HorstAanDeMaasParticipatievePlanningScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasStedelijkeVernieuwingScraper',
        instance: new HorstAanDeMaasStedelijkeVernieuwingScraper(),
        parentName: 'HorstAanDeMaasScraper'
    },
    {
        name: 'HorstAanDeMaasSlimmeStedenScraper',
        instance: new HorstAanDeMaasSlimmeStedenScraper(),
        parentName: 'HorstAanDeMaasScraper'
    }
];

/**
 * Seed a scraper's graph, inheriting from parent if available
 */
async function seedScraperGraph(
    manager: ScraperGraphManager,
    config: ScraperConfig,
    driver: Driver
): Promise<void> {
    console.log(`\n🌱 Seeding graph for ${config.name}...`);

    const _embeddingProvider = new LocalEmbeddingProvider();
    const graph = new NavigationGraph(driver);
    await graph.initialize();

    // Check if parent exists and inherit from it
    if (config.parentName) {
        const parentVersion = await manager.getVersion(config.parentName);
        
        if (parentVersion) {
            console.log(`  📥 Inheriting from parent: ${config.parentName}`);
            
            try {
                await manager.inheritFromParent(config.name, config.parentName);
                console.log(`  ✅ Inherited graph from ${config.parentName}`);
            } catch (error) {
                console.warn(`  ⚠️  Could not inherit from parent: ${error}`);
                console.log(`  📝 Creating new graph for ${config.name}`);
            }
        } else {
            console.log(`  ⚠️  Parent ${config.parentName} not found, creating new graph`);
        }
    }

    // If scraper has been used, export its current graph from Neo4j
    try {
        await manager.exportGraphToFile(config.name, graph);
        const version = await manager.getVersion(config.name);
        
        if (version) {
            console.log(`  📊 Graph stats: ${version.nodeCount} nodes, ${version.edgeCount} edges`);
        }
    } catch (error) {
        console.warn(`  ⚠️  Could not export graph: ${error}`);
    }
}

/**
 * Merge child scraper graphs with parent (like git merge)
 */
async function mergeScraperGraphs(
    manager: ScraperGraphManager,
    childName: string,
    parentName: string,
    conflictResolution: 'parent' | 'child' | 'merge' = 'merge'
): Promise<GraphMergeResult> {
    console.log(`\n🔄 Merging ${childName} with parent ${parentName}...`);

    try {
        const result = await manager.mergeGraphs(childName, parentName, conflictResolution);
        
        if (result.conflicts.length > 0) {
            console.log(`  ⚠️  Found ${result.conflicts.length} conflicts:`);
            result.conflicts.forEach((conflict, index) => {
                console.log(`    ${index + 1}. ${conflict.nodeUrl} - ${conflict.conflictType}`);
            });
            
            if (conflictResolution === 'merge') {
                console.log(`  ✅ Auto-resolved ${result.resolvedConflicts} conflicts using merge strategy`);
            }
        } else {
            console.log(`  ✅ Merge successful - no conflicts`);
        }
        
        console.log(`  📊 Added: ${result.addedNodes}, Updated: ${result.updatedNodes}, Skipped: ${result.skippedNodes}`);
        
        return result;
    } catch (error) {
        console.error(`  ❌ Merge failed: ${error}`);
        throw error;
    }
}

/**
 * Main seeding function
 */
async function seedAllScraperGraphs() {
    console.log('🚀 Starting Scraper Graph Seeding...\n');

    const driver = getNeo4jDriver();
    if (!driver) {
        throw new Error('Neo4j driver not available. Cannot seed scraper graphs.');
    }

    const manager = new ScraperGraphManager(driver);
    await manager.initialize();

    // First, seed parent scrapers (those without parents)
    const parentScrapers = SCRAPERS.filter(s => !s.parentName);
    const childScrapers = SCRAPERS.filter(s => s.parentName);

    console.log(`📋 Found ${parentScrapers.length} parent scrapers and ${childScrapers.length} child scrapers\n`);

    // Seed parent scrapers first
    for (const config of parentScrapers) {
        await seedScraperGraph(manager, config, driver);
    }

    // Seed child scrapers (inherit from parents)
    for (const config of childScrapers) {
        await seedScraperGraph(manager, config, driver);
    }

    // Optionally merge child graphs with updated parent graphs
    console.log('\n🔄 Merging child graphs with parent graphs...');
    for (const config of childScrapers) {
        if (config.parentName) {
            try {
                await mergeScraperGraphs(manager, config.name, config.parentName, 'merge');
            } catch (error) {
                console.warn(`  ⚠️  Merge skipped for ${config.name}: ${error}`);
            }
        }
    }

    // Display summary
    console.log('\n📊 Summary:');
    const versions = await manager.getVersions();
    for (const version of versions) {
        console.log(`  ${version.scraperName}:`);
        console.log(`    Version: ${version.version}`);
        if (version.parentScraperName) {
            console.log(`    Parent: ${version.parentScraperName}`);
        }
        console.log(`    Nodes: ${version.nodeCount}, Edges: ${version.edgeCount}`);
    }

    await driver.close();
    console.log('\n✅ Scraper graph seeding complete!');
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('seed-scraper-graphs')) {
    seedAllScraperGraphs()
        .then(() => {
            console.log('✅ Done');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

export { seedAllScraperGraphs, seedScraperGraph, mergeScraperGraphs };

