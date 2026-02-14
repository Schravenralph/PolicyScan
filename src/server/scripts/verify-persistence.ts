#!/usr/bin/env tsx
/**
 * Verify that cluster labels persist in Neo4j
 */

import dotenv from 'dotenv';
import path from 'path';
import { connectNeo4j } from '../config/neo4j.js';
import { KnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyPersistence() {
    try {
        console.log('🔍 Verifying Neo4j Persistence...\n');
        
        const driver = await connectNeo4j();
        const knowledgeGraph = new KnowledgeGraphService(driver);
        await knowledgeGraph.initialize();
        
        const session = driver.session();
        
        // Check Cluster nodes
        const clusterResult = await session.run(`
            MATCH (c:Cluster)
            WHERE c.label IS NOT NULL
            RETURN count(c) AS count, 
                   collect(DISTINCT c.algorithm)[0..5] AS algorithms,
                   min(c.labelUpdatedAt) AS oldest,
                   max(c.labelUpdatedAt) AS newest
        `);
        
        const r = clusterResult.records[0];
        const clusterCount = r.get('count').toNumber();
        
        console.log('✅ Cluster Labels in Neo4j:');
        console.log(`   Total labeled clusters: ${clusterCount}`);
        console.log(`   Algorithms: ${r.get('algorithms').join(', ')}`);
        console.log(`   Oldest: ${r.get('oldest')}`);
        console.log(`   Newest: ${r.get('newest')}`);
        
        // Check entity-cluster relationships
        const relResult = await session.run(`
            MATCH (e:Entity)-[:BELONGS_TO_CLUSTER]->(c:Cluster)
            RETURN count(DISTINCT c) AS clustersWithEntities,
                   count(e) AS totalLinks
        `);
        
        const rel = relResult.records[0];
        console.log(`\n✅ Entity-Cluster Relationships:`);
        console.log(`   Clusters with linked entities: ${rel.get('clustersWithEntities')}`);
        console.log(`   Total entity-cluster links: ${rel.get('totalLinks')}`);
        
        // Test retrieval
        if (clusterCount > 0) {
            const testResult = await session.run(`
                MATCH (c:Cluster)
                WHERE c.label IS NOT NULL
                RETURN c.id AS id, c.label AS label
                LIMIT 1
            `);
            
            if (testResult.records.length > 0) {
                const testId = testResult.records[0].get('id');
                const testLabel = testResult.records[0].get('label');
                
                // Test via KnowledgeGraphService
                const retrievedLabel = await knowledgeGraph.getClusterLabel(testId);
                
                console.log(`\n✅ Retrieval Test:`);
                console.log(`   Cluster ID: ${testId}`);
                console.log(`   Direct query: "${testLabel}"`);
                console.log(`   Via service: "${retrievedLabel}"`);
                
                if (retrievedLabel === testLabel) {
                    console.log(`   ✅ Persistence verified!`);
                } else {
                    console.log(`   ⚠️  Mismatch detected!`);
                }
            }
        }
        
        await session.close();
        await driver.close();
        
        console.log(`\n✅ Persistence verification complete!\n`);
        return clusterCount > 0;
    } catch (error) {
        console.error('❌ Error:', error);
        return false;
    }
}

verifyPersistence().then(success => {
    process.exit(success ? 0 : 1);
});

