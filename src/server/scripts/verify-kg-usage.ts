/**
 * Verification script to ensure we're using a single MongoDB-backed knowledge graph
 * Checks that all services are using the same instance and that data persists
 */

import { fileURLToPath } from 'url';
import { connectDB, getDB, closeDB } from '../config/database.js';
import { getNeo4jDriver } from '../config/neo4j.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { logger } from '../utils/logger.js';

async function verifyKnowledgeGraphUsage() {
    logger.info('🔍 Verifying Knowledge Graph Usage');

    try {
        // 1. Connect to database
        logger.info('1️⃣ Connecting to MongoDB...');
        await connectDB();
        const mongoDb = getDB();
        logger.info({ database: mongoDb.databaseName }, '✅ Connected to database');

        // 2. Check MongoDB collections directly
        logger.info('2️⃣ Checking MongoDB collections...');
        const nodesCollection = mongoDb.collection('knowledge_graph_nodes');
        const edgesCollection = mongoDb.collection('knowledge_graph_edges');
    
        const nodeCount = await nodesCollection.countDocuments({});
        const edgeCount = await edgesCollection.countDocuments({});
        
        logger.info({ nodeCount, edgeCount }, '📊 MongoDB counts');

        // 3. Get KnowledgeGraphService instance
        logger.info('3️⃣ Getting KnowledgeGraphService instance...');
        const driver = getNeo4jDriver();
        const kg1 = getKnowledgeGraphService(driver);
        await kg1.initialize();
        
        const snapshot1 = await kg1.getGraphSnapshot();
        logger.info({
            serviceNodes: snapshot1.nodes.length,
            serviceEdges: snapshot1.edges.length
        }, '📊 Service counts');

        // 4. Verify it's the same instance (singleton)
        logger.info('4️⃣ Verifying singleton pattern...');
        const kg2 = getKnowledgeGraphService(driver);
        const kg3 = getKnowledgeGraphService(); // Without DB param
        
        const isSameInstance1 = kg1 === kg2;
        const isSameInstance2 = kg1 === kg3;
        
        logger.info({
            isSameInstance1,
            isSameInstance2
        }, 'Singleton verification result');
        
        if (!isSameInstance1 || !isSameInstance2) {
            logger.warn('⚠️  WARNING: Multiple instances detected!');
        }

        // 5. Verify data matches MongoDB
        logger.info('5️⃣ Verifying data consistency...');
        const nodesMatch = snapshot1.nodes.length === nodeCount;
        const edgesMatch = snapshot1.edges.length === edgeCount;
        
        logger.info({
            nodesMatch,
            serviceNodes: snapshot1.nodes.length,
            mongoNodes: nodeCount
        }, 'Nodes match check');
        logger.info({
            edgesMatch,
            serviceEdges: snapshot1.edges.length,
            mongoEdges: edgeCount
        }, 'Edges match check');

        // 6. Test adding a node and verify persistence
        logger.info('6️⃣ Testing persistence...');
        const testNode = {
            id: 'test-verification-node',
            type: 'Concept' as const,
            name: 'Verification Test Node',
            description: 'This node is used to verify persistence'
        };
        
        await kg1.addNode(testNode);
        logger.info('✅ Added test node');
        
        // Check MongoDB directly
        const testNodeInDb = await nodesCollection.findOne({ id: testNode.id });
        const nodePersisted = testNodeInDb !== null;
        logger.info({ nodePersisted }, 'Node in MongoDB check');
        
        // Reload service and check
        const kg4 = getKnowledgeGraphService(driver);
        await kg4.initialize();
        const reloadedNode = await kg4.getNode(testNode.id);
        const nodeReloaded = reloadedNode !== null;
        logger.info({ nodeReloaded }, 'Node after reload check');
        
        // Cleanup test node
        await nodesCollection.deleteOne({ id: testNode.id });
        logger.info('🧹 Cleaned up test node');

        // 7. Check entity type distribution
        logger.info('7️⃣ Entity type distribution:');
        const typeCounts: Record<string, number> = {};
        snapshot1.nodes.forEach(node => {
            typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
        });
        
        const sortedTypeCounts = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .reduce((acc, [type, count]) => ({ ...acc, [type]: count }), {});

        logger.info({ typeDistribution: sortedTypeCounts }, 'Entity type distribution');

        // 8. Summary
        logger.info('📋 SUMMARY');
        
        const allChecksPassed = isSameInstance1 && isSameInstance2 && nodesMatch && edgesMatch && nodePersisted && nodeReloaded;
        
        if (allChecksPassed) {
            logger.info('✅ All checks passed! Knowledge graph is properly configured.');
            logger.info({
                checks: ['Using single MongoDB instance', 'Data persists correctly', 'Singleton pattern working']
            }, 'Configuration details');
        } else {
            logger.warn('⚠️  Some checks failed. Review the output above.');
        }
        
        logger.info({ nodeCount, edgeCount }, '📊 Current graph size');
        
        if (nodeCount < 100) {
            logger.info('💡 Tip: Run seed-large-kg.ts to create a comprehensive knowledge graph');
        }
        
    } finally {
        // Ensure database connection is properly closed
        try {
            await closeDB();
        } catch (error) {
            logger.error({ error }, '⚠️  Error closing database connection');
        }
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('verify-kg-usage')) {
    verifyKnowledgeGraphUsage()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            logger.error({ error }, '❌ Verification failed');
            process.exit(1);
        });
}

export { verifyKnowledgeGraphUsage };
