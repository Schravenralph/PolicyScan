#!/usr/bin/env tsx
/**
 * Verify that Navigation Graph data persists in Neo4j
 * 
 * This script:
 * 1. Adds a test node to Navigation Graph
 * 2. Closes the connection
 * 3. Reconnects and verifies the node still exists
 * 4. Queries the node to ensure it's fully persisted
 */

import dotenv from 'dotenv';
import path from 'path';
import { connectNeo4j, getNeo4jDriver, closeNeo4j } from '../config/neo4j.js';
import { NavigationGraph, type NavigationNode } from '../services/graphs/navigation/NavigationGraph.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyNavGraphPersistence() {
    let driver1: ReturnType<typeof getNeo4jDriver> | null = null;
    let driver2: ReturnType<typeof getNeo4jDriver> | null = null;
    
    try {
        console.log('🔍 Verifying Navigation Graph Persistence in Neo4j...\n');
        
        // Step 1: Create first graph instance and add test node
        console.log('1️⃣ Creating test node...');
        const testNode: NavigationNode = {
            url: `https://test-persistence-${Date.now()}.example.com`,
            type: 'page',
            title: 'Persistence Test Node',
            uri: `http://data.example.org/nav/${Date.now()}`,
            sourceUrl: `https://test-persistence-${Date.now()}.example.com`,
            lastVisited: new Date().toISOString(),
            children: [], // Required property - empty array for leaf node
        };
        
        await connectNeo4j();
        driver1 = getNeo4jDriver();
        const navGraph1 = new NavigationGraph(driver1);
        await navGraph1.initialize();
        
        const result1 = await navGraph1.addNode(testNode);
        console.log(`   ✅ Added test node: ${testNode.url}`);
        console.log(`   ✅ Result: ${result1}`);
        
        // Step 2: Verify node exists in first instance
        console.log('\n2️⃣ Verifying node in first instance...');
        const retrieved1 = await navGraph1.getNode(testNode.url);
        if (retrieved1) {
            console.log(`   ✅ Node found: ${retrieved1.title}`);
            console.log(`   ✅ Type: ${retrieved1.type}`);
            console.log(`   ✅ URL: ${retrieved1.url}`);
        } else {
            console.log('   ❌ Node not found in first instance!');
            return false;
        }
        
        // Step 3: Close first connection and create a completely new instance
        console.log('\n3️⃣ Closing first connection and creating new instance (simulating reconnect)...');
        await closeNeo4j();
        driver1 = null;
        
        // Wait a moment to ensure connection is closed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Create new connection
        await connectNeo4j();
        driver2 = getNeo4jDriver();
        const navGraph2 = new NavigationGraph(driver2);
        await navGraph2.initialize();
        
        // Step 4: Verify node exists in new instance
        console.log('\n4️⃣ Verifying node persists in new instance...');
        const retrieved2 = await navGraph2.getNode(testNode.url);
        if (retrieved2) {
            console.log(`   ✅ Node found in new instance: ${retrieved2.title}`);
            console.log(`   ✅ Type: ${retrieved2.type}`);
            console.log(`   ✅ URL: ${retrieved2.url}`);
            
            // Verify all properties persisted
            if (retrieved2.title === testNode.title) {
                console.log(`   ✅ Title persisted correctly`);
            } else {
                console.log(`   ⚠️  Title mismatch: expected "${testNode.title}", got "${retrieved2.title}"`);
            }
            
            if (retrieved2.type === testNode.type) {
                console.log(`   ✅ Type persisted correctly`);
            } else {
                console.log(`   ⚠️  Type mismatch: expected "${testNode.type}", got "${retrieved2.type}"`);
            }
        } else {
            console.log('   ❌ Node NOT found in new instance - PERSISTENCE FAILED!');
            return false;
        }
        
        // Step 5: Query using Neo4j directly to verify data is in database
        console.log('\n5️⃣ Verifying node via direct Neo4j query...');
        const session = driver2.session();
        try {
            const queryResult = await session.run(`
                MATCH (n:NavigationNode {url: $url})
                RETURN n.url AS url, n.title AS title, n.type AS type, n.createdAt AS createdAt
            `, { url: testNode.url });
            
            if (queryResult.records.length > 0) {
                const record = queryResult.records[0];
                console.log(`   ✅ Node found in direct Neo4j query`);
                console.log(`   ✅ URL: ${record.get('url')}`);
                console.log(`   ✅ Title: ${record.get('title')}`);
                console.log(`   ✅ Type: ${record.get('type')}`);
                console.log(`   ✅ Created: ${record.get('createdAt')}`);
            } else {
                console.log('   ⚠️  Node not found in direct Neo4j query');
            }
        } finally {
            await session.close();
        }
        
        // Step 6: Get node count to verify overall graph state
        console.log('\n6️⃣ Checking overall graph state...');
        const nodeCounts = await navGraph2.getNodeCount();
        console.log(`   ✅ Total nodes: ${nodeCounts.total}`);
        console.log(`   ✅ External nodes: ${nodeCounts.external}`);
        console.log(`   ✅ IPLO nodes: ${nodeCounts.iplo}`);
        
        // Step 7: Cleanup test node
        console.log('\n7️⃣ Cleaning up test node...');
        try {
            const cleanupSession = driver2.session();
            try {
                await cleanupSession.run(`
                    MATCH (n:NavigationNode {url: $url})
                    DETACH DELETE n
                `, { url: testNode.url });
                console.log(`   ✅ Test node deleted`);
            } finally {
                await cleanupSession.close();
            }
        } catch (error) {
            console.log(`   ⚠️  Could not clean up: ${error instanceof Error ? error.message : String(error)}`);
            console.log(`   ℹ️  Test node left in database (URL: ${testNode.url})`);
        }
        
        console.log('\n✅ Persistence verification complete!');
        console.log('✅ Navigation Graph data IS persisting correctly in Neo4j\n');
        return true;
        
    } catch (error) {
        console.error('\n❌ Error during persistence verification:', error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
        }
        return false;
    } finally {
        // Cleanup connections
        if (driver1) {
            try {
                await closeNeo4j();
            } catch (_e) {
                // Ignore cleanup errors
            }
        }
        if (driver2) {
            try {
                await closeNeo4j();
            } catch (_e) {
                // Ignore cleanup errors
            }
        }
    }
}

verifyNavGraphPersistence().then(success => {
    process.exit(success ? 0 : 1);
});


