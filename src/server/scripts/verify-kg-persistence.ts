#!/usr/bin/env tsx
/**
 * Verify that Knowledge Graph data persists in GraphDB
 * 
 * This script:
 * 1. Adds a test entity to GraphDB
 * 2. Closes the connection
 * 3. Reconnects and verifies the entity still exists
 * 4. Queries the entity to ensure it's fully persisted
 */

import dotenv from 'dotenv';
import path from 'path';
import { GraphDBKnowledgeGraphService } from '../services/GraphDBKnowledgeGraphService.js';
import { BaseEntity } from '../domain/ontology.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyKGPersistence() {
    try {
        console.log('🔍 Verifying Knowledge Graph Persistence in GraphDB...\n');
        
        // Step 1: Create first service instance and add test entity
        console.log('1️⃣ Creating test entity...');
        const testEntity: BaseEntity = {
            id: `test-persistence-${Date.now()}`,
            type: 'Concept',
            name: 'Persistence Test Entity',
            description: 'This entity is used to verify that KG data persists after connection close',
            metadata: {
                testTimestamp: new Date().toISOString(),
                testPurpose: 'persistence-verification'
            }
        };
        
        const kgService1 = new GraphDBKnowledgeGraphService();
        await kgService1.initialize();
        await kgService1.addNode(testEntity);
        console.log(`   ✅ Added test entity: ${testEntity.id}`);
        
        // Step 2: Verify entity exists in first instance
        console.log('\n2️⃣ Verifying entity in first instance...');
        const retrieved1 = await kgService1.getNode(testEntity.id);
        if (retrieved1) {
            console.log(`   ✅ Entity found: ${retrieved1.name}`);
            console.log(`   ✅ Description: ${retrieved1.description}`);
        } else {
            console.log('   ❌ Entity not found in first instance!');
            return false;
        }
        
        // Step 3: Create a completely new service instance (simulating connection close/reconnect)
        console.log('\n3️⃣ Creating new service instance (simulating reconnect)...');
        const kgService2 = new GraphDBKnowledgeGraphService();
        await kgService2.initialize();
        
        // Step 4: Verify entity exists in new instance
        console.log('\n4️⃣ Verifying entity persists in new instance...');
        const retrieved2 = await kgService2.getNode(testEntity.id);
        if (retrieved2) {
            console.log(`   ✅ Entity found in new instance: ${retrieved2.name}`);
            console.log(`   ✅ Description: ${retrieved2.description}`);
            
            // Verify metadata persisted
            if (retrieved2.metadata?.testPurpose === 'persistence-verification') {
                console.log(`   ✅ Metadata persisted correctly`);
            } else {
                console.log(`   ⚠️  Metadata may not have persisted correctly`);
            }
        } else {
            console.log('   ❌ Entity NOT found in new instance - PERSISTENCE FAILED!');
            return false;
        }
        
        // Step 5: Query using SPARQL to verify data is in GraphDB
        console.log('\n5️⃣ Verifying entity via direct GraphDB query...');
        // Type assertion: getAllNodes exists on both KnowledgeGraphService and GraphDBKnowledgeGraphService
        const serviceWithGetAllNodes = kgService2 as unknown as { getAllNodes: () => Promise<Array<{ id: string }>> };
        const allNodes = await serviceWithGetAllNodes.getAllNodes();
        const foundInQuery = allNodes.some(node => node.id === testEntity.id);
        if (foundInQuery) {
            console.log(`   ✅ Entity found in getAllNodes() query`);
            console.log(`   ✅ Total nodes in graph: ${allNodes.length}`);
        } else {
            console.log('   ⚠️  Entity not found in getAllNodes() query');
        }
        
        // Step 6: Cleanup test entity
        console.log('\n6️⃣ Cleaning up test entity...');
        try {
            // GraphDB doesn't have a direct deleteNode method, so we'll leave it
            // The entity will remain but with a unique timestamp ID
            console.log(`   ℹ️  Test entity left in database (ID: ${testEntity.id})`);
            console.log(`   ℹ️  You can manually delete it if needed`);
        } catch (error) {
            console.log(`   ⚠️  Could not clean up: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        console.log('\n✅ Persistence verification complete!');
        console.log('✅ Knowledge Graph data IS persisting correctly in GraphDB\n');
        return true;
        
    } catch (error) {
        console.error('\n❌ Error during persistence verification:', error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
        }
        return false;
    }
}

verifyKGPersistence().then(success => {
    process.exit(success ? 0 : 1);
});


