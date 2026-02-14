/**
 * Migration script: JSON File → Neo4j
 * 
 * This script migrates NavigationGraph data from JSON file to Neo4j.
 * 
 * Usage:
 *   tsx src/server/scripts/migrate-navigation-graph-to-neo4j.ts [json-file-path]
 * 
 * Example:
 *   tsx src/server/scripts/migrate-navigation-graph-to-neo4j.ts scraper_graph.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { connectNeo4j } from '../config/neo4j.js';
import { NavigationGraph, generateNavigationNodeUri } from '../services/graphs/navigation/NavigationGraph.js';
import type { NavigationGraphData, NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';


const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

async function migrateNavigationGraphToNeo4j(jsonFilePath?: string): Promise<void> {
    try {
        console.log(`${colors.blue}🚀 Starting NavigationGraph migration to Neo4j...${colors.reset}\n`);

        // Determine JSON file path
        const defaultPath = path.resolve(process.cwd(), 'scraper_graph.json');
        const filePath = jsonFilePath 
            ? path.resolve(process.cwd(), jsonFilePath)
            : defaultPath;

        console.log(`${colors.cyan}1️⃣ Reading JSON file: ${filePath}${colors.reset}`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`JSON file not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const graphData: NavigationGraphData = JSON.parse(fileContent);

        const nodeCount = Object.keys(graphData.nodes).length;
        console.log(`   ✓ Found ${nodeCount} nodes`);
        console.log(`   ✓ Root URL: ${graphData.rootUrl || '(not set)'}\n`);

        if (nodeCount === 0) {
            console.log(`${colors.yellow}⚠️  No nodes to migrate. Exiting.${colors.reset}`);
            return;
        }

        // Connect to Neo4j
        console.log(`${colors.cyan}2️⃣ Connecting to Neo4j...${colors.reset}`);
        const driver = await connectNeo4j();
        if (!driver) {
            throw new Error('Failed to connect to Neo4j');
        }
        console.log(`   ✓ Connected\n`);

        // Initialize NavigationGraph
        console.log(`${colors.cyan}3️⃣ Initializing NavigationGraph...${colors.reset}`);
        const graph = new NavigationGraph(driver);
        await graph.initialize();
        console.log(`   ✓ Initialized\n`);

        // Check if data already exists
        const stats = await graph.getStatistics();
        if (stats.totalNodes > 0) {
            console.log(`${colors.yellow}⚠️  Found ${stats.totalNodes} existing nodes in Neo4j.${colors.reset}`);
            console.log(`${colors.yellow}   This migration will add/update nodes (MERGE).${colors.reset}\n`);
        }

        // Migrate nodes (fast path: direct Neo4j insertion without embeddings)
        console.log(`${colors.cyan}4️⃣ Migrating nodes to Neo4j (fast mode, embeddings will be skipped)...${colors.reset}`);
        const nodes = Object.values(graphData.nodes);
        let migratedCount = 0;
        let errorCount = 0;

        // Use driver directly for faster batch insertion (skip embedding generation)
        const session = driver.session();
        const startTime = Date.now();
        const batchSize = 100; // Larger batches for faster insertion
        
        try {
            for (let i = 0; i < nodes.length; i += batchSize) {
                const batch = nodes.slice(i, i + batchSize);
                
                // Batch insert nodes without embeddings
                await session.run(`
                    UNWIND $nodes AS nodeData
                    MERGE (n:NavigationNode {url: nodeData.url})
                    SET n = nodeData.properties
                    SET n.createdAt = coalesce(n.createdAt, $createdAt)
                    SET n.updatedAt = $updatedAt
                `, {
                    nodes: (batch as NavigationNode[]).map((node: NavigationNode) => ({
                        url: node.url,
                        properties: {
                            url: node.url,
                            type: node.type,
                            title: node.title || null,
                            filePath: node.filePath || null,
                            lastVisited: node.lastVisited || null,
                            schemaType: node.schemaType || null,
                            uri: node.uri || generateNavigationNodeUri(node),
                            sourceUrl: node.sourceUrl || node.url,
                            ...(node.xpaths && { xpaths: JSON.stringify(node.xpaths) })
                        }
                    })),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                
                // Create relationships in a separate batch
                const relationships: Array<{parent: string; child: string}> = [];
                for (const node of batch as NavigationNode[]) {
                    if (node.children && node.children.length > 0) {
                        for (const childUrl of node.children) {
                            relationships.push({ parent: node.url, child: childUrl });
                        }
                    }
                }
                
                if (relationships.length > 0) {
                    // Ensure child nodes exist first
                    const childUrls = [...new Set(relationships.map(r => r.child))];
                    await session.run(`
                        UNWIND $childUrls AS childUrl
                        MERGE (child:NavigationNode {url: childUrl})
                        ON CREATE SET child.createdAt = $createdAt
                    `, {
                        childUrls,
                        createdAt: new Date().toISOString()
                    });
                    
                    // Create relationships
                    await session.run(`
                        UNWIND $relationships AS rel
                        MATCH (parent:NavigationNode {url: rel.parent})
                        MATCH (child:NavigationNode {url: rel.child})
                        MERGE (parent)-[:LINKS_TO]->(child)
                    `, { relationships });
                }
                
                migratedCount += batch.length;
                
                // Progress feedback
                const elapsed = Date.now() - startTime;
                if (migratedCount % 500 === 0 || i + batchSize >= nodes.length) {
                    const rate = migratedCount / (elapsed / 1000);
                    const remaining = nodeCount - migratedCount;
                    const eta = remaining / rate;
                    process.stdout.write(`   Migrated ${migratedCount}/${nodeCount} nodes (${rate.toFixed(1)}/s, ~${Math.round(eta)}s remaining)...\r`);
                }
            }
        } catch (error) {
            errorCount++;
            console.error(`\n   ${colors.red}✗ Error during batch migration:${colors.reset}`, error);
        } finally {
            await session.close();
        }
        

        console.log(`\n   ${colors.green}✓ Migrated ${migratedCount} nodes${colors.reset}`);
        if (errorCount > 0) {
            console.log(`   ${colors.yellow}⚠️  ${errorCount} errors occurred${colors.reset}`);
        }

        // Set root URL
        if (graphData.rootUrl) {
            console.log(`\n${colors.cyan}5️⃣ Setting root URL...${colors.reset}`);
            await graph.setRoot(graphData.rootUrl);
            console.log(`   ${colors.green}✓ Root URL set to: ${graphData.rootUrl}${colors.reset}`);
        }

        // Verify migration
        console.log(`\n${colors.cyan}6️⃣ Verifying migration...${colors.reset}`);
        const finalStats = await graph.getStatistics();
        const rootUrl = await graph.getRoot();
        
        console.log(`   ✓ Total nodes in Neo4j: ${finalStats.totalNodes}`);
        console.log(`   ✓ Total edges in Neo4j: ${finalStats.totalEdges}`);
        console.log(`   ✓ Root URL: ${rootUrl || '(not set)'}`);

        if (finalStats.totalNodes >= nodeCount) {
            console.log(`\n${colors.green}✅ Migration completed successfully!${colors.reset}`);
        } else {
            console.log(`\n${colors.yellow}⚠️  Migration completed, but node count mismatch.${colors.reset}`);
            console.log(`   Expected: ${nodeCount}, Found: ${finalStats.totalNodes}`);
        }

        console.log(`\n${colors.blue}💡 Navigation graph is now stored in Neo4j${colors.reset}`);
        console.log(`${colors.blue}   Access it via the /api/graph/meta endpoint${colors.reset}\n`);

    } catch (error) {
        console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error);
        throw error;
    }
}

// Run migration if called directly
// Check if this script is being run directly (not imported)
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('migrate-navigation-graph-to-neo4j.ts') ||
    process.argv[1].includes('migrate-navigation-graph-to-neo4j')
);

if (isMainModule) {
    const jsonFilePath = process.argv[2];
    if (!jsonFilePath) {
        console.error('Usage: tsx migrate-navigation-graph-to-neo4j.ts <json-file-path>');
        process.exit(1);
    }
    migrateNavigationGraphToNeo4j(jsonFilePath)
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { migrateNavigationGraphToNeo4j };

