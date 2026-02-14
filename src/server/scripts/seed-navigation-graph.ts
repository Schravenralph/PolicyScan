#!/usr/bin/env tsx
/**
 * Seed Navigation Graph
 * 
 * Populates the navigation graph with initial data if it's empty.
 * Creates a root node and optionally seeds from existing data sources.
 * 
 * Usage:
 *   pnpm run seed:nav-graph
 *   tsx src/server/scripts/seed-navigation-graph.ts
 */

import { fileURLToPath } from 'url';
import { getNeo4jDriver } from '../config/neo4j.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { logger } from '../utils/logger.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function seedNavigationGraph(): Promise<void> {
  console.log(`${colors.blue}🚀 Starting Navigation Graph Seeding${colors.reset}\n`);

  const driver = getNeo4jDriver();
  if (!driver) {
    console.error(`${colors.red}❌ Neo4j driver not available. Cannot seed navigation graph.${colors.reset}`);
    console.log(`${colors.yellow}💡 Make sure Neo4j is running and configured.${colors.reset}`);
    process.exit(1);
  }

  try {
    const graph = new NavigationGraph(driver);
    await graph.initialize();
    console.log(`${colors.green}✅ Navigation graph initialized${colors.reset}`);

    // Check if graph already has nodes
    const stats = await graph.getStatistics();
    console.log(`${colors.cyan}📊 Current graph status:${colors.reset}`);
    console.log(`   - Total nodes: ${stats.totalNodes}`);
    console.log(`   - Total edges: ${stats.totalEdges}`);
    console.log(`   - Max depth: ${stats.maxDepth}\n`);

    if (stats.totalNodes > 0) {
      console.log(`${colors.yellow}⚠️  Navigation graph already has ${stats.totalNodes} nodes.${colors.reset}`);
      console.log(`${colors.blue}💡 Skipping seed. Use --force to re-seed anyway.${colors.reset}`);
      
      // Check if root is set
      const rootUrl = await graph.getRoot();
      if (!rootUrl) {
        console.log(`${colors.yellow}⚠️  No root node set. Setting root to first available node...${colors.reset}`);
        const allNodes = await graph.getAllNodes();
        if (allNodes.length > 0) {
          await graph.setRoot(allNodes[0].url);
          console.log(`${colors.green}✅ Root node set to: ${allNodes[0].url}${colors.reset}`);
        }
      } else {
        console.log(`${colors.green}✅ Root node already set: ${rootUrl}${colors.reset}`);
      }
      
      return;
    }

    console.log(`${colors.blue}📝 Graph is empty. Seeding with initial data...${colors.reset}\n`);

    // Add root node (IPLO homepage)
    const rootUrl = 'https://iplo.nl/';
    console.log(`${colors.blue}➕ Adding root node: ${rootUrl}${colors.reset}`);
    
    try {
      const rootResult = await graph.addNode({
        url: rootUrl,
        type: 'page',
        title: 'IPLO - Informatiepunt Leefomgeving',
        children: [],
        lastVisited: new Date().toISOString(),
        sourceUrl: rootUrl,
      });

      console.log(`${colors.green}✅ Root node ${rootResult === 'added' ? 'added' : rootResult === 'updated' ? 'updated' : 'unchanged'}${colors.reset}`);
    } catch (error) {
      // Node might already exist due to race condition or constraint violation
      // Check if node exists - if so, treat as success
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('already exists') || errorMsg.includes('ConstraintValidationFailed')) {
        console.log(`${colors.yellow}⚠️  Root node already exists (this is OK)${colors.reset}`);
        // Verify node exists
        try {
          const existingNode = await graph.getNode(rootUrl);
          if (existingNode) {
            console.log(`${colors.green}✅ Root node verified${colors.reset}`);
          }
        } catch (nodeError) {
          console.log(`${colors.yellow}⚠️  Could not verify root node existence (continuing anyway)${colors.reset}`);
        }
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }

    // Set as root
    await graph.setRoot(rootUrl);
    console.log(`${colors.green}✅ Root node set${colors.reset}\n`);

    // Optional: Try to seed from knowledge base if available
    try {
      const { connectDB, getDB, closeDB } = await import('../config/database.js');
      await connectDB();
      const db = getDB();
      const knowledgeBaseCollection = db.collection('knowledgebasefiles');
      const docCount = await knowledgeBaseCollection.countDocuments({});
      
      if (docCount > 0) {
        console.log(`${colors.blue}📚 Found ${docCount} documents in knowledge base.${colors.reset}`);
        console.log(`${colors.blue}💡 Consider running workflows to populate graph from knowledge base.${colors.reset}`);
        
        // Optionally add a few sample documents as nodes
        // For now, just log the suggestion
      }
      
      await closeDB();
    } catch (error) {
      // MongoDB not available or no knowledge base - that's okay
      console.log(`${colors.yellow}💡 Knowledge base not available. Graph seeded with root node only.${colors.reset}`);
    }

    // Get final statistics
    const finalStats = await graph.getStatistics();
    console.log(`\n${colors.cyan}📊 Final graph status:${colors.reset}`);
    console.log(`   - Total nodes: ${finalStats.totalNodes}`);
    console.log(`   - Total edges: ${finalStats.totalEdges}`);
    console.log(`   - Max depth: ${finalStats.maxDepth}`);
    console.log(`   - Root URL: ${await graph.getRoot()}\n`);

    console.log(`${colors.green}✅ Navigation graph seeded successfully!${colors.reset}`);
    console.log(`${colors.blue}💡 Run workflows with graph-building actions to add more nodes.${colors.reset}\n`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`${colors.red}❌ Failed to seed navigation graph:${colors.reset}`);
    console.error(`${colors.red}   ${errorMsg}${colors.reset}`);
    logger.error({ error }, 'Failed to seed navigation graph');
    process.exit(1);
  } finally {
    await driver.close();
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedNavigationGraph()
    .then(() => {
      console.log(`${colors.green}✨ Done!${colors.reset}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`${colors.red}❌ Unhandled error:${colors.reset}`, error);
      process.exit(1);
    });
}

export { seedNavigationGraph };

