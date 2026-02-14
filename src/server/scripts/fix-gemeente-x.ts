#!/usr/bin/env tsx

/**
 * Script to fix "Gemeente X" placeholder in existing knowledge graph nodes
 * Updates all nodes with jurisdiction "Gemeente X" to "Gemeente Amsterdam"
 */

import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';

async function fixGemeenteX() {
    console.log('🔧 Fixing "Gemeente X" placeholder...\n');

    try {
        // Connect to Neo4j
        console.log('📊 Connecting to Neo4j...');
        await connectNeo4j();
        const driver = getNeo4jDriver();
        const session = driver.session();

        try {
            // Find nodes with "Gemeente X" jurisdiction
            const findResult = await session.run(
                `MATCH (e:Entity)
                 WHERE e.jurisdiction = 'Gemeente X'
                 RETURN count(e) AS count`
            );
            const count = findResult.records[0].get('count').toNumber();
            
            if (count === 0) {
                console.log('✅ No nodes found with "Gemeente X" jurisdiction');
                return;
            }

            console.log(`📊 Found ${count} nodes with "Gemeente X" jurisdiction`);

            // Update to "Gemeente Amsterdam"
            const updateResult = await session.run(
                `MATCH (e:Entity)
                 WHERE e.jurisdiction = 'Gemeente X'
                 SET e.jurisdiction = 'Gemeente Amsterdam'
                 RETURN count(e) AS updated`
            );
            const updated = updateResult.records[0].get('updated').toNumber();

            console.log(`✅ Updated ${updated} nodes to "Gemeente Amsterdam"`);

            // Also check for "Unknown" and try to infer from other properties
            const unknownResult = await session.run(
                `MATCH (e:Entity)
                 WHERE e.jurisdiction = 'Unknown' AND e.url IS NOT NULL
                 RETURN count(e) AS count`
            );
            const unknownCount = unknownResult.records[0].get('count').toNumber();
            
            if (unknownCount > 0) {
                console.log(`\n📊 Found ${unknownCount} nodes with "Unknown" jurisdiction`);
                console.log('   (These may need manual review or better extraction logic)');
            }

        } finally {
            await session.close();
        }

    } catch (error) {
        console.error('❌ Error fixing Gemeente X:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

fixGemeenteX().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

