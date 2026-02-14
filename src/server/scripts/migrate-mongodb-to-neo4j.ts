/**
 * Migration script: MongoDB Knowledge Graph → Neo4j (Historical)
 * 
 * This script migrates all knowledge graph data from MongoDB to Neo4j.
 * 
 * Note: This is a historical migration script. The Knowledge Graph now uses
 * GraphDB as the knowledge graph backend. This script is for historical migration only.
 * 
 * Usage:
 *   tsx src/server/scripts/migrate-mongodb-to-neo4j.ts
 */

import { connectDB } from '../config/database.js';
import { connectNeo4j } from '../config/neo4j.js';
import { KnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { BaseEntity, Relation } from '../domain/ontology.js';

async function migrate() {
    console.log('🚀 Starting MongoDB → Neo4j migration...\n');

    // Connect to both databases
    console.log('1️⃣ Connecting to MongoDB...');
    const mongoDb = await connectDB();
    const nodesCollection = mongoDb.collection<BaseEntity>('knowledge_graph_nodes');
    const edgesCollection = mongoDb.collection<Relation>('knowledge_graph_edges');

    console.log('2️⃣ Connecting to Neo4j...');
    const neo4jDriver = await connectNeo4j();

    // Get Neo4j service
    const neo4jService = new KnowledgeGraphService(neo4jDriver);
    await neo4jService.initialize();

    // Get MongoDB data
    console.log('3️⃣ Reading data from MongoDB...');
    const mongoNodes = await nodesCollection.find({}).toArray();
    const mongoEdges = await edgesCollection.find({}).toArray();

    console.log(`   Found ${mongoNodes.length} nodes and ${mongoEdges.length} edges\n`);

    if (mongoNodes.length === 0) {
        console.log('⚠️  No nodes found in MongoDB. Nothing to migrate.');
        return;
    }

    // Migrate nodes
    console.log('4️⃣ Migrating nodes to Neo4j...');
    let nodeCount = 0;
    for (const node of mongoNodes) {
        try {
            await neo4jService.addNode(node);
            nodeCount++;
            if (nodeCount % 100 === 0) {
                process.stdout.write(`   Migrated ${nodeCount}/${mongoNodes.length} nodes...\r`);
            }
        } catch (error) {
            console.error(`\n   ❌ Error migrating node ${node.id}:`, error);
        }
    }
    console.log(`\n   ✅ Migrated ${nodeCount}/${mongoNodes.length} nodes`);

    // Migrate edges
    console.log('\n5️⃣ Migrating edges to Neo4j...');
    let edgeCount = 0;
    for (const edge of mongoEdges) {
        try {
            await neo4jService.addEdge(edge.sourceId, edge.targetId, edge.type, edge.metadata);
            edgeCount++;
            if (edgeCount % 100 === 0) {
                process.stdout.write(`   Migrated ${edgeCount}/${mongoEdges.length} edges...\r`);
            }
        } catch (error) {
            console.error(`\n   ❌ Error migrating edge ${edge.sourceId} -> ${edge.targetId}:`, error);
        }
    }
    console.log(`\n   ✅ Migrated ${edgeCount}/${mongoEdges.length} edges`);

    // Verify migration
    console.log('\n6️⃣ Verifying migration...');
    const stats = await neo4jService.getStats();
    console.log(`   Neo4j stats: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);

    if (stats.nodeCount === mongoNodes.length && stats.edgeCount === mongoEdges.length) {
        console.log('   ✅ Migration successful! All data migrated.');
    } else {
        console.warn(`   ⚠️  Migration incomplete. Expected ${mongoNodes.length} nodes, ${mongoEdges.length} edges`);
    }

    console.log('\n✅ Migration complete!');
}

// Run migration
migrate()
    .then(() => {
        console.log('\n🎉 Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    });

