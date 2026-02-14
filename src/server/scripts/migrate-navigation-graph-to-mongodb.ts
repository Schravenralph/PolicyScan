/**
 * Migration script: JSON File → MongoDB
 * 
 * This script migrates NavigationGraph data from JSON file to MongoDB.
 * 
 * Usage:
 *   tsx src/server/scripts/migrate-navigation-graph-to-mongodb.ts [json-file-path]
 * 
 * Example:
 *   tsx src/server/scripts/migrate-navigation-graph-to-mongodb.ts scraper_graph.json
 */

import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { connectDB, closeDB } from '../config/database.js';
import { NavigationNodeModel } from '../models/NavigationNode.js';
import { NavigationGraphMetadataModel } from '../models/NavigationGraphMetadata.js';
import type { NavigationGraphData, NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';


const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

async function migrateNavigationGraph(jsonFilePath?: string): Promise<void> {
    try {
        console.log(`${colors.blue}🚀 Starting NavigationGraph migration to MongoDB...${colors.reset}\n`);

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

        // Connect to MongoDB
        console.log(`${colors.cyan}2️⃣ Connecting to MongoDB...${colors.reset}`);
        await connectDB();
        console.log(`   ✓ Connected\n`);

        // Ensure indexes exist
        console.log(`${colors.cyan}3️⃣ Creating indexes...${colors.reset}`);
        await NavigationNodeModel.ensureIndexes();
        console.log(`   ✓ Indexes created\n`);

        // Check if data already exists
        const existingCount = await NavigationNodeModel.count();
        if (existingCount > 0) {
            console.log(`${colors.yellow}⚠️  Found ${existingCount} existing nodes in MongoDB.${colors.reset}`);
            console.log(`${colors.yellow}   This migration will add/update nodes (upsert).${colors.reset}\n`);
        }

        // Migrate nodes
        console.log(`${colors.cyan}4️⃣ Migrating nodes to MongoDB...${colors.reset}`);
        const nodes = Object.values(graphData.nodes) as NavigationNode[];
        let migratedCount = 0;
        let errorCount = 0;

        // Process in batches for better performance
        const batchSize = 100;
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);
            
            for (const node of batch) {
                try {
                    await NavigationNodeModel.upsert(node);
                    migratedCount++;
                    
                    if (migratedCount % 100 === 0) {
                        process.stdout.write(`   Migrated ${migratedCount}/${nodeCount} nodes...\r`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`\n   ${colors.red}✗ Error migrating node ${node.url}:${colors.reset}`, error);
                }
            }
        }

        console.log(`\n   ${colors.green}✓ Migrated ${migratedCount} nodes${colors.reset}`);
        if (errorCount > 0) {
            console.log(`   ${colors.yellow}⚠️  ${errorCount} errors occurred${colors.reset}`);
        }

        // Migrate metadata
        console.log(`\n${colors.cyan}5️⃣ Migrating metadata...${colors.reset}`);
        await NavigationGraphMetadataModel.setRootUrl(graphData.rootUrl);
        
        // Calculate statistics
        const totalEdges = nodes.reduce((sum: number, node: NavigationNode) => sum + (node.children?.length || 0), 0);
        await NavigationGraphMetadataModel.updateStatistics({
            totalNodes: nodeCount,
            totalEdges: totalEdges
        });
        console.log(`   ${colors.green}✓ Metadata migrated${colors.reset}`);

        // Verify migration
        console.log(`\n${colors.cyan}6️⃣ Verifying migration...${colors.reset}`);
        const finalCount = await NavigationNodeModel.count();
        const rootUrl = await NavigationGraphMetadataModel.getRootUrl();
        
        console.log(`   ✓ Total nodes in MongoDB: ${finalCount}`);
        console.log(`   ✓ Root URL: ${rootUrl || '(not set)'}`);

        if (finalCount === nodeCount) {
            console.log(`\n${colors.green}✅ Migration completed successfully!${colors.reset}`);
        } else {
            console.log(`\n${colors.yellow}⚠️  Migration completed, but node count mismatch.${colors.reset}`);
            console.log(`   Expected: ${nodeCount}, Found: ${finalCount}`);
        }

        console.log(`\n${colors.blue}💡 To use MongoDB storage, set NAVIGATION_GRAPH_USE_MONGODB=true${colors.reset}`);
        console.log(`${colors.blue}   or pass useMongoDB: true to NavigationGraph constructor${colors.reset}\n`);

    } catch (error) {
        console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error);
        throw error;
    } finally {
        await closeDB();
    }
}

// Run migration if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const jsonFilePath = process.argv[2];
    migrateNavigationGraph(jsonFilePath)
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { migrateNavigationGraph };

