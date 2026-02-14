/**
 * Graph CLI Tool
 * 
 * Command-line tool for managing scraper graph versioning, inheritance, and merging.
 * Provides git-like commands for graph management.
 * 
 * Usage:
 *   tsx src/server/scripts/graph-cli.ts <command> <scraper-id> [options]
 * 
 * Commands:
 *   status <scraper-id>                    Show graph status
 *   pull <scraper-id>                      Pull graph from parent
 *   merge <scraper-id> [--strategy=...]    Merge parent graph into child
 *   versions <scraper-id>                  List all versions
 *   show <scraper-id> [version]            Show graph at a specific version
 *   seed <scraper-id>                      Seed a scraper (pull + merge + add nodes)
 */

import { fileURLToPath } from 'url';
import { connectNeo4j } from '../config/neo4j.js';
import { UnifiedGraphSeeder } from '../services/scraperGraph/UnifiedGraphSeeder.js';
import { SCRAPER_REGISTRY } from '../services/scrapers/ScraperMetadataRegistry.js';
import { detectParentScraper, getScraperInheritanceChain } from '../services/scrapers/ScraperHierarchyDetector.js';
import { ValidationIssue } from '../services/graphVersioning/GraphValidator.js';

async function statusCommand(seeder: UnifiedGraphSeeder, scraperId: string) {
    const status = await seeder.getGraphStatus(scraperId);
    
    console.log(`\n📊 Graph Status: ${scraperId}`);
    console.log('─'.repeat(50));
    console.log(`Registered:     ${status.registered ? '✅' : '❌'}`);
    console.log(`Version:        ${status.version}`);
    console.log(`Has Parent:     ${status.hasParent ? '✅' : '❌'}`);
    if (status.hasParent) {
        console.log(`Parent:         ${status.parentId}`);
    }
    console.log(`Total Nodes:    ${status.totalNodes}`);
    console.log(`Own Nodes:      ${status.ownNodes}`);
    console.log(`Inherited:      ${status.inheritedNodes}`);
    console.log(`File Versions:  ${status.fileVersions}`);
    console.log('');
}

function formatValue(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') {
        if (value.length > 40) {
            return `"${value.substring(0, 37)}..."`;
        }
        return `"${value}"`;
    }
    if (typeof value === 'object') {
        const str = JSON.stringify(value);
        if (str.length > 40) {
            return `${str.substring(0, 37)}...`;
        }
        return str;
    }
    return String(value);
}

async function pullCommand(
    seeder: UnifiedGraphSeeder,
    scraperId: string,
    args: string[]
) {
    const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] 
        || 'merge';
    
    console.log(`\n📥 Pulling from parent for ${scraperId}...`);
    console.log(`Strategy: ${strategy}`);
    
    const result = await seeder.pullFromParent(scraperId, {
        conflictResolution: strategy as 'parent' | 'child' | 'merge',
        saveVersion: true
    });
    
    console.log('\n✅ Pull complete!');
    console.log(`   Nodes pulled: ${result.nodesPulled}`);
    console.log(`   Nodes updated: ${result.nodesUpdated}`);
    console.log(`   Conflicts: ${result.conflicts.length}`);
    
    if (result.conflicts.length > 0) {
        console.log('\n⚠️  Conflicts:');
        result.conflicts.forEach((c, idx) => {
            console.log(`   ${idx + 1}. ${c.nodeUrl}`);
            console.log(`      Type: ${c.conflictType}`);
            
            // Show detailed property conflicts
            if (c.propertyDetails && c.propertyDetails.length > 0) {
                console.log(`      Property Conflicts:`);
                c.propertyDetails.forEach(pd => {
                    const oldVal = formatValue(pd.parentValue);
                    const newVal = formatValue(pd.childValue);
                    console.log(`        - ${pd.property} [${pd.severity}]: ${oldVal} → ${newVal}`);
                });
            }
            
            // Show children changes
            if (c.childrenDetails) {
                const cd = c.childrenDetails;
                if (cd.added.length > 0) {
                    console.log(`      Children Added: ${cd.added.slice(0, 3).join(', ')}${cd.added.length > 3 ? '...' : ''}`);
                }
                if (cd.removed.length > 0) {
                    console.log(`      Children Removed: ${cd.removed.slice(0, 3).join(', ')}${cd.removed.length > 3 ? '...' : ''}`);
                }
            }
            
            // Show suggested actions
            if (c.suggestedActions && c.suggestedActions.length > 0) {
                console.log(`      💡 Suggestions:`);
                c.suggestedActions.slice(0, 2).forEach(action => {
                    console.log(`        - ${action}`);
                });
            }
        });
    }
}

async function versionsCommand(seeder: UnifiedGraphSeeder, scraperId: string) {
    const versions = await seeder.listVersions(scraperId);
    
    console.log(`\n📋 Versions for ${scraperId}:`);
    console.log('─'.repeat(50));
    
    if (versions.length === 0) {
        console.log('   No versions found');
        return;
    }
    
    versions.forEach((v: { version: string; timestamp: string; nodeCount: number; parentScraper?: string; parentVersion?: string }, index: number) => {
        const marker = index === versions.length - 1 ? '→' : ' ';
        console.log(`${marker} v${v.version}  ${v.timestamp}  (${v.nodeCount} nodes)`);
        if (v.parentScraper) {
            console.log(`    Parent: ${v.parentScraper}@${v.parentVersion || 'latest'}`);
        }
    });
    console.log('');
}

async function showCommand(
    seeder: UnifiedGraphSeeder,
    scraperId: string,
    version?: string
) {
    const snapshot = await seeder.loadVersion(scraperId, version);
    
    if (!snapshot) {
        console.error(`❌ Version not found: ${scraperId}${version ? `@${version}` : ''}`);
        return;
    }
    
    console.log(`\n📄 Graph: ${scraperId}@${snapshot.version}`);
    console.log('─'.repeat(50));
    console.log(`Version:      ${snapshot.version}`);
    console.log(`Timestamp:    ${snapshot.metadata.timestamp}`);
    console.log(`Node Count:   ${snapshot.metadata.nodeCount}`);
    if (snapshot.metadata.parentScraper) {
        console.log(`Parent:       ${snapshot.metadata.parentScraper}@${snapshot.metadata.parentVersion || 'latest'}`);
    }
    console.log(`Nodes:`);
    
    const nodeUrls = Object.keys(snapshot.data.nodes);
    if (nodeUrls.length > 10) {
        nodeUrls.slice(0, 10).forEach(url => {
            const node = snapshot.data.nodes[url];
            console.log(`  - ${url} (${node.type})`);
        });
        console.log(`  ... and ${nodeUrls.length - 10} more`);
    } else {
        nodeUrls.forEach(url => {
            const node = snapshot.data.nodes[url];
            console.log(`  - ${url} (${node.type})`);
        });
    }
    console.log('');
}

async function seedCommand(
    seeder: UnifiedGraphSeeder,
    scraperId: string,
    args: string[]
) {
    const entry = SCRAPER_REGISTRY[scraperId];
    if (!entry) {
        console.error(`❌ Scraper ${scraperId} not found in registry`);
        process.exit(1);
    }
    
    const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] 
        || 'merge';
    const noVersion = args.includes('--no-version');
    
    console.log(`\n🌱 Seeding ${scraperId}...`);
    
    const scraper = entry.factory();
    const metadata = {
        ...entry.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    const result = await seeder.seedScraper(scraper, metadata, {
        conflictResolution: strategy as 'parent' | 'child' | 'merge',
        saveVersion: !noVersion,
        addScraperSpecificNodes: true
    });
    
    console.log('\n✅ Seeding complete!');
    console.log(`   Version: ${result.version}`);
    console.log(`   Total nodes: ${result.totalNodes}`);
    console.log(`   From parent: ${result.nodesFromParent}`);
    console.log(`   Merged: ${result.nodesMerged}`);
    console.log(`   Own nodes: ${result.nodesFromChild}`);
    console.log(`   Conflicts: ${result.conflicts.length}`);
}

async function validateCommand(seeder: UnifiedGraphSeeder, scraperId: string) {
    console.log(`\n🔍 Validating graph for ${scraperId}...`);
    
    const validation = await seeder.validateScraper(scraperId);
    
    console.log('\n✅ Validation complete!');
    console.log(`   Valid: ${validation.isValid ? '✅' : '❌'}`);
    console.log(`   Total nodes: ${validation.summary.totalNodes}`);
    console.log(`   Total edges: ${validation.summary.totalEdges}`);
    console.log(`   Errors: ${validation.summary.errors}`);
    console.log(`   Warnings: ${validation.summary.warnings}`);
    console.log(`   Info: ${validation.summary.info}`);
    
    if (validation.issues.length > 0) {
        console.log('\n⚠️  Issues:');
        validation.issues.forEach((issue: ValidationIssue, index: number) => {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`   ${index + 1}. ${icon} [${issue.severity.toUpperCase()}] ${issue.type}`);
            console.log(`      ${issue.message}`);
            if (issue.nodeUrl) {
                console.log(`      Node: ${issue.nodeUrl}`);
            }
            if (issue.suggestedFix) {
                console.log(`      💡 Fix: ${issue.suggestedFix}`);
            }
        });
    }
    console.log('');
}

async function hierarchyCommand(scraperId?: string) {
    console.log('\n🌳 Scraper Inheritance Hierarchy');
    console.log('─'.repeat(50));
    
    if (scraperId) {
        // Show hierarchy for specific scraper
        const entry = SCRAPER_REGISTRY[scraperId];
        if (!entry) {
            console.error(`❌ Scraper ${scraperId} not found in registry`);
            return;
        }
        
        const scraper = entry.factory();
        const chain = getScraperInheritanceChain(scraper);
        
        console.log(`\nInheritance chain for ${scraperId}:`);
        for (let i = 0; i < chain.length; i++) {
            const indent = '  '.repeat(i);
            const marker = i === 0 ? '→' : '├─';
            console.log(`${indent}${marker} ${chain[i]}`);
        }
    } else {
        // Show all scrapers and their parents
        console.log('\nAll scrapers:');
        for (const [id, entry] of Object.entries(SCRAPER_REGISTRY)) {
            const scraper = entry.factory();
            const parent = detectParentScraper(scraper);
            const parentInfo = parent ? ` (inherits from ${parent})` : ' (base scraper)';
            console.log(`  - ${id}${parentInfo}`);
        }
    }
    console.log('');
}

async function diffCommand(
    seeder: UnifiedGraphSeeder,
    scraperId: string,
    args: string[]
) {
    const fromVersion = args.find(arg => arg.startsWith('--from='))?.split('=')[1];
    const toVersion = args.find(arg => arg.startsWith('--to='))?.split('=')[1];
    
    console.log(`\n📊 Comparing versions for ${scraperId}...`);
    if (fromVersion) console.log(`  From: ${fromVersion}`);
    if (toVersion) console.log(`  To: ${toVersion}`);
    
    const diff = await seeder.compareVersions(scraperId, fromVersion, toVersion);
    
    if (!diff) {
        console.error(`❌ Could not load versions for comparison`);
        return;
    }
    
    // Generate diff report using GraphDiff service
    const { GraphVersionManager } = await import('../services/graphVersioning/GraphVersionManager.js');
    const versionManager = new GraphVersionManager();
    const { GraphDiff } = await import('../services/graphVersioning/GraphDiff.js');
    const diffService = new GraphDiff(versionManager);
    console.log(diffService.generateReport(diff));
}

async function batchPullCommand(
    _seeder: UnifiedGraphSeeder,
    scraperIds: string[],
    args: string[]
) {
    const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] || 'merge';
    
    console.log(`\n📥 Batch pulling from parent for ${scraperIds.length} scrapers...`);
    console.log(`Strategy: ${strategy}`);
    
    const { BatchOperations } = await import('../services/graphVersioning/BatchOperations.js');
    const { getNeo4jDriver } = await import('../config/neo4j.js');
    const driver = getNeo4jDriver();
    const batchOps = new BatchOperations(driver);
    await batchOps.initialize();
    
    const results = await batchOps.batchPull(scraperIds, {
        conflictResolution: strategy as 'parent' | 'child' | 'merge',
        saveVersion: true
    });
    
    console.log('\n✅ Batch pull complete!');
    console.log('');
    console.log(results.summary);
    
    // Show detailed results
    for (const [scraperId, result] of results.results.entries()) {
        if (result.success) {
            console.log(`  ✅ ${scraperId}: ${result.nodesPulled || 0} nodes pulled, ${result.nodesUpdated || 0} updated, ${result.conflicts || 0} conflicts`);
        } else {
            console.log(`  ❌ ${scraperId}: ${result.error}`);
        }
    }
}

async function batchValidateCommand(
    _seeder: UnifiedGraphSeeder,
    scraperIds: string[]
) {
    console.log(`\n🔍 Batch validating ${scraperIds.length} scrapers...`);
    
    const { BatchOperations } = await import('../services/graphVersioning/BatchOperations.js');
    const { getNeo4jDriver } = await import('../config/neo4j.js');
    const driver = getNeo4jDriver();
    const batchOps = new BatchOperations(driver);
    await batchOps.initialize();
    
    const results = await batchOps.batchValidate(scraperIds);
    
    console.log('\n✅ Batch validation complete!');
    console.log('');
    console.log(results.summary);
    
    // Show detailed results
    for (const [scraperId, result] of results.results.entries()) {
        if (!result.isValid) {
            console.log(`\n  ❌ ${scraperId}:`);
            console.log(`     Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings}`);
            result.issues.slice(0, 3).forEach(issue => {
                const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                console.log(`     ${icon} ${issue.type}: ${issue.message}`);
            });
        }
    }
}

async function main() {
    const command = process.argv[2];
    const scraperId = process.argv[3];
    const args = process.argv.slice(4);
    
    if (!command) {
        console.error('Usage: tsx src/server/scripts/graph-cli.ts <command> [scraper-id] [options]');
        console.error('\nCommands:');
        console.error('  hierarchy [scraper-id]                    Show scraper inheritance hierarchy');
        console.error('  status <scraper-id>                       Show graph status');
        console.error('  pull <scraper-id> [--strategy=...]        Pull graph from parent');
        console.error('  versions <scraper-id>                     List all versions');
        console.error('  show <scraper-id> [version]               Show graph at specific version');
        console.error('  seed <scraper-id> [--strategy=...]        Seed scraper (full workflow)');
        console.error('  validate <scraper-id>                     Validate graph consistency');
        console.error('  diff <scraper-id> [--from=...] [--to=...] Compare two versions');
        console.error('  batch-pull <scraper-id1> [id2] [id3] ...  Batch pull from parent');
        console.error('  batch-validate <scraper-id1> [id2] ...    Batch validate graphs');
        console.error('\nOptions:');
        console.error('  --strategy=parent|child|merge            Conflict resolution strategy');
        console.error('  --no-version                             Don\'t save version snapshot');
        console.error('  --from=<version>                         Starting version for diff');
        console.error('  --to=<version>                           Ending version for diff (default: latest)');
        process.exit(1);
    }
    
    // Handle hierarchy command without requiring scraperId or Neo4j
    if (command === 'hierarchy') {
        await hierarchyCommand(scraperId);
        return;
    }
    
    // Handle batch commands
    if (command === 'batch-pull' || command === 'batch-validate') {
        const scraperIds = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
        if (scraperIds.length === 0) {
            console.error(`❌ Command "${command}" requires at least one scraper-id`);
            process.exit(1);
        }
        
        const driver = await connectNeo4j();
        const seeder = new UnifiedGraphSeeder(driver);
        
        try {
            await seeder.initialize();
            
            if (command === 'batch-pull') {
                await batchPullCommand(seeder, scraperIds, args);
            } else if (command === 'batch-validate') {
                await batchValidateCommand(seeder, scraperIds);
            }
        } catch (error) {
            console.error('❌ Error:', error);
            if (error instanceof Error) {
                console.error(`   ${error.message}`);
            }
            process.exit(1);
        } finally {
            await driver.close();
        }
        return;
    }
    
    if (!scraperId) {
        console.error(`❌ Command "${command}" requires a scraper-id`);
        process.exit(1);
    }
    
    const driver = await connectNeo4j();
    const seeder = new UnifiedGraphSeeder(driver);
    
    try {
        await seeder.initialize();
        
        switch (command) {
            case 'status':
                await statusCommand(seeder, scraperId);
                break;
                
            case 'pull':
                await pullCommand(seeder, scraperId, args);
                break;
                
            case 'versions':
                await versionsCommand(seeder, scraperId);
                break;
                
            case 'show':
                await showCommand(seeder, scraperId, args[0]);
                break;
                
            case 'seed':
                await seedCommand(seeder, scraperId, args);
                break;
                
            case 'validate':
                await validateCommand(seeder, scraperId);
                break;
                
            case 'diff':
                await diffCommand(seeder, scraperId, args);
                break;
                
            default:
                console.error(`❌ Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        if (error instanceof Error) {
            console.error(`   ${error.message}`);
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

