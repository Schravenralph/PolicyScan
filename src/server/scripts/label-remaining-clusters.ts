#!/usr/bin/env tsx
/**
 * Script to generate labels for remaining unlabeled clusters
 * Uses gpt-4o-mini with rate limiting
 */

import dotenv from 'dotenv';
import path from 'path';
import { connectNeo4j } from '../config/neo4j.js';
import { KnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { SemanticLabelingService } from '../services/semantic/SemanticLabelingService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function labelRemainingClusters() {
    const forceRelabel = process.argv.includes('--force') || process.argv.includes('-f');
    
    console.log('🏷️  Labeling Remaining Clusters\n');
    console.log('Using: gpt-4o-mini');
    if (forceRelabel) {
        console.log('⚠️  FORCE MODE: Will re-label all clusters');
    }
    console.log('=' .repeat(60));

    try {
        // Connect to Neo4j
        console.log('\n📊 Connecting to Neo4j...');
        const driver = await connectNeo4j();
        console.log('✅ Connected to Neo4j\n');

        // Initialize services
        const knowledgeGraph = new KnowledgeGraphService(driver);
        await knowledgeGraph.initialize();
        
         
        const labelingService = new SemanticLabelingService();

        // Get current usage
        const usage = labelingService.getUsageStats();
        console.log(`📊 Current Usage:`);
        console.log(`   Tokens: ${usage.tokensUsed.toLocaleString()}`);
        console.log(`   Cost: €${usage.costEUR.toFixed(4)}`);
        console.log(`   Remaining: €${usage.budgetRemainingEUR.toFixed(2)}\n`);

        // Find clusters without labels
        console.log('🔍 Finding unlabeled clusters...');
        const session = driver.session();
        
        try {
            // Get all communities from GDS
            const communitiesResult = await session.run(`
                MATCH (e:Entity)
                WHERE e.communityId IS NOT NULL
                WITH DISTINCT e.communityId AS communityId, count(e) AS size
                WHERE size >= 3
                RETURN communityId, size
                ORDER BY size DESC
            `);

            const communities = communitiesResult.records.map(r => ({
                communityId: r.get('communityId').toNumber(),
                size: r.get('size').toNumber()
            }));

            console.log(`   Found ${communities.length} communities\n`);

            // Check which ones don't have labels (or force re-label all)
            const unlabeledClusters: Array<{ clusterId: string; communityId: number; size: number }> = [];
            
            for (const comm of communities) {
                const clusterId = `gds-louvain-${comm.communityId}`;
                const existingLabel = forceRelabel ? null : await knowledgeGraph.getClusterLabel(clusterId);
                
                if (!existingLabel) {
                    unlabeledClusters.push({
                        clusterId,
                        communityId: comm.communityId,
                        size: comm.size
                    });
                }
            }

            console.log(`📋 Unlabeled clusters: ${unlabeledClusters.length}`);
            console.log(`✅ Labeled clusters: ${communities.length - unlabeledClusters.length}\n`);

            if (unlabeledClusters.length === 0) {
                console.log('✅ All clusters already have labels!');
                await driver.close();
                return;
            }

            // Process unlabeled clusters in batches
            const BATCH_SIZE = 10; // Increased batch size
            const MAX_CONCURRENT_BATCHES = 5; // Process 5 batches in parallel
            const DELAY_BETWEEN_BATCHES = 1000; // 1 second between batch groups
            const DELAY_BETWEEN_ITEMS = 200; // Reduced delay between items
            
            const batches: typeof unlabeledClusters[] = [];
            for (let i = 0; i < unlabeledClusters.length; i += BATCH_SIZE) {
                batches.push(unlabeledClusters.slice(i, i + BATCH_SIZE));
            }

            console.log(`🚀 Processing ${unlabeledClusters.length} clusters in ${batches.length} batches of ${BATCH_SIZE}`);
            console.log(`   Concurrent batches: ${MAX_CONCURRENT_BATCHES}`);
            console.log(`   Delay: ${DELAY_BETWEEN_BATCHES}ms between batch groups, ${DELAY_BETWEEN_ITEMS}ms between items\n`);

            let processed = 0;
            const failed: Array<{ clusterId: string; error: string }> = [];

            // Process batches in parallel groups
            for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
                const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
                const batchGroupNum = Math.floor(i / MAX_CONCURRENT_BATCHES) + 1;
                const totalGroups = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES);
                
                console.log(`\n📦 Batch Group ${batchGroupNum}/${totalGroups} (${concurrentBatches.length} batches, ~${concurrentBatches.length * BATCH_SIZE} clusters)`);

                // Process batches in parallel (each batch gets its own session)
                await Promise.all(concurrentBatches.map(async (batch, batchIdx) => {
                    const globalBatchNum = i + batchIdx + 1;
                    const batchSession = driver.session(); // Each batch gets its own session
                    
                    try {
                        for (let j = 0; j < batch.length; j++) {
                            const cluster = batch[j];
                            
                            try {
                                // Get entities in this community
                                const entitiesResult = await batchSession.run(`
                                    MATCH (e:Entity)
                                    WHERE e.communityId = $communityId
                                    RETURN e.id AS id
                                    LIMIT 100
                                `, { communityId: cluster.communityId });

                                const entityIds = entitiesResult.records.map(r => r.get('id'));
                                const entities = [];

                                // Fetch entities
                                for (const entityId of entityIds) {
                                    const entity = await knowledgeGraph.getNode(entityId);
                                    if (entity) {
                                        entities.push(entity);
                                    }
                                }

                                if (entities.length === 0) {
                                    console.warn(`   [Batch ${globalBatchNum}] ⚠️  No entities found for cluster ${cluster.clusterId}`);
                                    continue;
                                }

                                // Generate label
                                console.log(`   [Batch ${globalBatchNum}] ${j + 1}/${batch.length}. Generating label for ${cluster.clusterId} (${entities.length} entities)...`);
                                
                                const label = await labelingService.generateSemanticLabel(
                                    entities,
                                    {
                                        language: 'nl',
                                        domain: 'policy',
                                        useLLM: true
                                    }
                                );

                                // Store in Neo4j
                                await knowledgeGraph.storeClusterLabel(cluster.clusterId, label, {
                                    algorithm: 'louvain',
                                    communityId: cluster.communityId,
                                    nodeCount: cluster.size
                                });

                                // Link entities
                                if (entityIds.length > 0) {
                                    await knowledgeGraph.linkEntitiesToCluster(cluster.clusterId, entityIds);
                                }

                                console.log(`      [Batch ${globalBatchNum}] ✅ "${label}"`);
                                processed++;

                                // Small delay between items
                                if (j < batch.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITEMS));
                                }
                            } catch (error: unknown) {
                                const errorMsg = error instanceof Error ? error.message : String(error);
                                console.error(`      [Batch ${globalBatchNum}] ❌ Failed: ${errorMsg}`);
                                failed.push({ clusterId: cluster.clusterId, error: errorMsg });
                                
                                // Still add delay even on failure
                                if (j < batch.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITEMS));
                                }
                            }
                        }
                    } finally {
                        await batchSession.close(); // Close session when batch is done
                    }
                }));

                // Delay between batch groups
                if (i + MAX_CONCURRENT_BATCHES < batches.length) {
                    console.log(`\n   ⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch group...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }

                // Show progress
                const progress = ((Math.min(i + MAX_CONCURRENT_BATCHES, batches.length) / batches.length) * 100).toFixed(1);
                console.log(`\n   📊 Progress: ${Math.min(i + MAX_CONCURRENT_BATCHES, batches.length)}/${batches.length} batches (${progress}%)`);
            }

            // Final summary
            console.log('\n' + '='.repeat(60));
            console.log('✅ Labeling Complete!\n');
            console.log(`   Processed: ${processed}/${unlabeledClusters.length}`);
            console.log(`   Failed: ${failed.length}`);
            
            if (failed.length > 0) {
                console.log('\n   Failed clusters:');
                failed.forEach(f => {
                    console.log(`      - ${f.clusterId}: ${f.error}`);
                });
            }

            // Final usage
            const finalUsage = labelingService.getUsageStats();
            console.log('\n📊 Final Usage:');
            console.log(`   Tokens: ${finalUsage.tokensUsed.toLocaleString()}`);
            console.log(`   Cost: €${finalUsage.costEUR.toFixed(4)}`);
            console.log(`   Remaining: €${finalUsage.budgetRemainingEUR.toFixed(2)}`);
            console.log(`   Used this run: ${finalUsage.tokensUsed - usage.tokensUsed} tokens, €${(finalUsage.costEUR - usage.costEUR).toFixed(4)}`);

            await session.close();
            await driver.close();
        } catch (error) {
            await session.close();
            throw error;
        }
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

labelRemainingClusters().catch(console.error);

