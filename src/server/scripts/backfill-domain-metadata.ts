#!/usr/bin/env tsx

/**
 * Backfill script to add domain metadata to existing knowledge graph nodes
 * that don't have domain classification yet.
 * 
 * This script:
 * 1. Loads nodes from Neo4j that don't have domain metadata
 * 2. Uses DomainClassificationService to classify them based on their content
 * 3. Updates nodes with domain, domainConfidence, and domainKeywords
 */

import { int } from 'neo4j-driver';
import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { DomainClassificationService } from '../services/extraction/DomainClassificationService.js';
// BaseEntity not used in this script

async function backfillDomainMetadata() {
    console.log('🔄 Starting domain metadata backfill...\n');

    try {
        // Connect to Neo4j
        console.log('📊 Connecting to Neo4j...');
        await connectNeo4j();
        const driver = getNeo4jDriver();
        const kgService = getKnowledgeGraphService(driver);
        await kgService.initialize();

        // Initialize domain classifier
        const domainClassifier = new DomainClassificationService();

        // Get all nodes that don't have domain metadata
        const session = driver.session();
        let processedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const batchSize = 100;

        try {
            // First, count nodes without domain metadata
            const countResult = await session.run(
                `
                MATCH (e:Entity)
                WHERE e.metadata IS NULL 
                   OR NOT (e.metadata CONTAINS '"domain"')
                RETURN count(e) AS total
                `
            );
            const totalNodes = countResult.records[0].get('total').toNumber();
            console.log(`📊 Found ${totalNodes} nodes without domain metadata\n`);

            if (totalNodes === 0) {
                console.log('✅ All nodes already have domain metadata!');
                return;
            }

            // Process nodes in batches
            let offset = 0;
            while (offset < totalNodes) {
                const result = await session.run(
                    `
                    MATCH (e:Entity)
                    WHERE e.metadata IS NULL 
                       OR NOT (e.metadata CONTAINS '"domain"')
                    RETURN e.id AS id, e.name AS name, e.description AS description, 
                           e.metadata AS metadata, e.type AS type, e.url AS url
                    ORDER BY e.id
                    SKIP $offset
                    LIMIT $limit
                    `,
                    { offset: int(offset), limit: int(batchSize) }
                );

                if (result.records.length === 0) break;

                for (const record of result.records) {
                    processedCount++;
                    const nodeId = record.get('id');
                    const name = record.get('name') || '';
                    const description = record.get('description') || '';
                    const existingMetadata = record.get('metadata');
                    const url = record.get('url') || '';

                    // Parse existing metadata if it exists
                    let metadata: Record<string, unknown> = {};
                    if (existingMetadata) {
                        try {
                            metadata = JSON.parse(existingMetadata);
                        } catch (_e) {
                            console.warn(`⚠️  Could not parse metadata for node ${nodeId}, using empty metadata`);
                        }
                    }

                    // Skip if domain already exists
                    if (metadata.domain) {
                        skippedCount++;
                        continue;
                    }

                    // Classify domain based on available text
                    const textToClassify = `${name} ${description}`.trim();
                    if (!textToClassify) {
                        skippedCount++;
                        continue;
                    }

                    const classification = domainClassifier.classify(textToClassify, url);

                    // Only update if we got a valid domain (not 'unknown')
                    if (classification.domain !== 'unknown') {
                        // Update metadata with domain information
                        metadata.domain = classification.domain;
                        metadata.domainConfidence = classification.confidence;
                        metadata.domainKeywords = classification.keywords;
                        metadata.domainSource = 'backfill script';

                        // Update node in Neo4j
                        await session.run(
                            `
                            MATCH (e:Entity {id: $id})
                            SET e.metadata = $metadata
                            RETURN e.id AS id
                            `,
                            {
                                id: nodeId,
                                metadata: JSON.stringify(metadata)
                            }
                        );

                        updatedCount++;

                        if (updatedCount % 10 === 0) {
                            console.log(`  ✓ Processed ${processedCount}/${totalNodes}, updated ${updatedCount}, skipped ${skippedCount}`);
                        }
                    } else {
                        skippedCount++;
                    }
                }

                offset += batchSize;
            }

            console.log(`\n✅ Backfill complete!`);
            console.log(`   Total processed: ${processedCount}`);
            console.log(`   Updated with domain: ${updatedCount}`);
            console.log(`   Skipped (no domain found or already has domain): ${skippedCount}`);

            // Show domain distribution
            const domainStats = await session.run(
                `
                MATCH (e:Entity)
                WHERE e.metadata IS NOT NULL AND e.metadata CONTAINS '"domain"'
                WITH e, e.metadata AS metadataStr
                WITH e,
                     CASE 
                       WHEN metadataStr CONTAINS '"ruimtelijke ordening"' THEN 'ruimtelijke ordening'
                       WHEN metadataStr CONTAINS '"milieu"' THEN 'milieu'
                       WHEN metadataStr CONTAINS '"water"' THEN 'water'
                       WHEN metadataStr CONTAINS '"natuur"' THEN 'natuur'
                       WHEN metadataStr CONTAINS '"verkeer"' THEN 'verkeer'
                       WHEN metadataStr CONTAINS '"wonen"' THEN 'wonen'
                       WHEN metadataStr CONTAINS '"economie"' THEN 'economie'
                       WHEN metadataStr CONTAINS '"cultuur"' THEN 'cultuur'
                       WHEN metadataStr CONTAINS '"onderwijs"' THEN 'onderwijs'
                       WHEN metadataStr CONTAINS '"gezondheid"' THEN 'gezondheid'
                       WHEN metadataStr CONTAINS '"energie"' THEN 'energie'
                       WHEN metadataStr CONTAINS '"klimaat"' THEN 'klimaat'
                       WHEN metadataStr CONTAINS '"bodem"' THEN 'bodem'
                       WHEN metadataStr CONTAINS '"geluid"' THEN 'geluid'
                       WHEN metadataStr CONTAINS '"lucht"' THEN 'lucht'
                       WHEN metadataStr CONTAINS '"afval"' THEN 'afval'
                       ELSE 'unknown'
                     END AS domain
                WHERE domain IS NOT NULL AND domain <> 'unknown'
                WITH domain, count(e) AS count
                RETURN domain, count
                ORDER BY count DESC
                `
            );

            console.log(`\n📊 Domain distribution:`);
            for (const record of domainStats.records) {
                const domain = record.get('domain');
                const count = record.get('count').toNumber();
                console.log(`   ${domain}: ${count}`);
            }

        } finally {
            await session.close();
        }

    } catch (error) {
        console.error('❌ Error during backfill:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run the backfill
backfillDomainMetadata().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

