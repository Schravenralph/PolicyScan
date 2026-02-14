/**
 * Check the current status of the knowledge graph in GraphDB
 * Verifies that we're using the persistent GraphDB database instance
 */

import { fileURLToPath } from 'url';
import { connectGraphDB, getGraphDBClient } from '../config/graphdb.js';
import { GraphDBKnowledgeGraphService } from '../services/graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { PolicyDocument } from '../domain/ontology.js';

async function checkKnowledgeGraphStatus() {
    console.log('🔍 Checking Knowledge Graph Status\n');
    console.log('='.repeat(60));

    try {
        // Connect to GraphDB
        await connectGraphDB();
        const graphdbClient = getGraphDBClient();
        console.log(`✅ Connected to GraphDB\n`);

        // Get GraphDBKnowledgeGraphService instance
        const kg = new GraphDBKnowledgeGraphService(graphdbClient);
        await kg.initialize();
        
        // Get stats from GraphDB
        const stats = await kg.getStats();
        
        console.log('📊 Knowledge Graph (GraphDB):');
        console.log(`   Nodes: ${stats.nodeCount}`);
        console.log(`   Edges: ${stats.edgeCount}\n`);

        if (stats.nodeCount === 0) {
            console.log('⚠️  Knowledge graph is EMPTY in GraphDB');
            console.log('   This means:');
            console.log('   - No entities have been persisted yet');
            console.log('   - Run migration: pnpm run kg:migrate (if you have MongoDB data)');
            console.log('   - Or entities will be added as workflows run\n');
            return;
        }

        // Get snapshot for detailed info
        const snapshot = await kg.getGraphSnapshot(1000, null); // Limit to 1000 for performance
        console.log('📊 KnowledgeGraphService:');
        console.log(`   Nodes (sample): ${snapshot.nodes.length} (showing first 1000)`);
        console.log(`   Edges (sample): ${snapshot.edges.length} (showing first 1000)\n`);

        // Show entity type distribution from stats
        console.log('📋 Entity Type Distribution:');
        Object.entries(stats.typeDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                console.log(`   ${type.padEnd(15)} ${count}`);
            });

        // Sample some entities
        console.log('\n📄 Sample Entities (first 5):');
        const sampleNodes = snapshot.nodes.slice(0, 5);
        sampleNodes.forEach((node, i) => {
            console.log(`   ${i + 1}. [${node.type}] ${node.name}`);
            if (node.metadata?.domain) {
                console.log(`      Domain: ${node.metadata.domain}`);
            }
            if (node.type === 'PolicyDocument') {
                const pd = node as PolicyDocument;
                if (pd.jurisdiction) {
                    console.log(`      Jurisdiction: ${pd.jurisdiction}`);
                }
            }
        });

        console.log('\n' + '='.repeat(60));
        console.log('✅ Status Check Complete');
        console.log('='.repeat(60));
        console.log(`\n💡 The knowledge graph is using GraphDB persistence`);
        console.log(`   All entities are stored in GraphDB database`);
        console.log(`   Connection: ${process.env.GRAPHDB_URL || 'http://localhost:7200'}`);
        console.log(`\n   To add more entities, run workflows or use the scraper orchestrator`);
        console.log(`   The graph will grow automatically as documents are processed`);
        console.log(`\n   To migrate MongoDB data: pnpm run kg:migrate\n`);

    } catch (error) {
        console.error('\n❌ Error checking knowledge graph status:', error);
        process.exit(1);
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('check-kg-status')) {
    checkKnowledgeGraphStatus()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { checkKnowledgeGraphStatus };

