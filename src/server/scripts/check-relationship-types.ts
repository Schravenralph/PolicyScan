/**
 * Check what relationship types exist in the Neo4j graph
 */

import { fileURLToPath } from 'url';
import { connectNeo4j, closeNeo4j } from '../config/neo4j.js';

async function checkRelationshipTypes() {
    console.log('🔍 Checking Relationship Types in Neo4j Graph\n');
    console.log('='.repeat(60));

    try {
        const driver = await connectNeo4j();
        const session = driver.session();

        try {
            // Get all relationship types
            const result = await session.run(`
                CALL db.relationshipTypes() YIELD relationshipType
                RETURN relationshipType
                ORDER BY relationshipType
            `);

            console.log('📊 Relationship Types Found:');
            const types = result.records.map(r => r.get('relationshipType'));
            
            if (types.length === 0) {
                console.log('   ⚠️  No relationship types found in the graph');
                console.log('   This might mean the graph is empty or relationships use a different format\n');
            } else {
                types.forEach((type, i) => {
                    console.log(`   ${i + 1}. ${type}`);
                });
                console.log('');

                // Count relationships by type
                console.log('📊 Relationship Counts:');
                for (const type of types) {
                    const countResult = await session.run(`
                        MATCH ()-[r:${type}]->()
                        RETURN count(r) as count
                    `);
                    const count = countResult.records[0]?.get('count').toNumber();
                    console.log(`   ${type.padEnd(20)} ${count}`);
                }
            }

            // Check if we have any relationships at all
            const totalRelResult = await session.run(`
                MATCH ()-[r]->()
                RETURN count(r) as total, collect(DISTINCT type(r)) as types
            `);
            const total = totalRelResult.records[0]?.get('total').toNumber();
            const allTypes = totalRelResult.records[0]?.get('types') as string[];

            console.log('\n📊 Summary:');
            console.log(`   Total relationships: ${total}`);
            console.log(`   Unique types: ${allTypes.length}`);
            if (allTypes.length > 0) {
                console.log(`   Types: ${allTypes.join(', ')}`);
            }

        } finally {
            await session.close();
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error('   Error message:', error.message);
        }
        process.exit(1);
    } finally {
        await closeNeo4j();
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('check-relationship-types')) {
    checkRelationshipTypes()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { checkRelationshipTypes };

