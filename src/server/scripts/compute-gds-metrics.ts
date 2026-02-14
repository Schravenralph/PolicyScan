#!/usr/bin/env tsx

/**
 * Script to compute GDS metrics (PageRank, Betweenness, Degree, Eigenvector)
 * and write them to node properties for visualization.
 * 
 * Usage:
 *   pnpm run kg:compute-metrics
 *   pnpm run kg:compute-metrics -- --all  # Include eigenvector (slower)
 */

import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { KnowledgeGraphGDSClusteringService } from '../services/knowledge-graph/clustering/KnowledgeGraphGDSClusteringService.js';

async function computeGDSMetrics() {
    console.log('🔢 Computing GDS Metrics\n');

    try {
        // Connect to Neo4j
        console.log('📊 Connecting to Neo4j...');
        await connectNeo4j();
        const driver = getNeo4jDriver();
        const kgService = getKnowledgeGraphService(driver);
        await kgService.initialize();

        // Initialize GDS service
        const gdsService = new KnowledgeGraphGDSClusteringService(driver, kgService);

        // Check if GDS is available
        const isAvailable = await gdsService.isGDSAvailable();
        if (!isAvailable) {
            console.error('❌ GDS plugin not available');
            console.error('   Please install Neo4j Graph Data Science plugin');
            process.exit(1);
        }

        console.log('✅ GDS plugin available\n');

        // Parse command line arguments
        const includeEigenvector = process.argv.includes('--all') || process.argv.includes('--eigenvector');

        console.log('Computing metrics:');
        console.log(`  ✓ PageRank`);
        console.log(`  ✓ Betweenness Centrality`);
        console.log(`  ✓ Degree Centrality`);
        if (includeEigenvector) {
            console.log(`  ✓ Eigenvector Centrality (slower)`);
        }
        console.log('');

        // Compute all metrics
        const results = await gdsService.computeAllMetrics({
            includePageRank: true,
            includeBetweenness: true,
            includeDegree: true,
            includeEigenvector: includeEigenvector
        });

        console.log('\n✅ Metrics computed successfully!\n');
        console.log('Results:');
        
        if (results.pagerank) {
            console.log(`  PageRank: ${results.pagerank.nodePropertiesWritten} nodes, ${results.pagerank.executionTime}ms`);
            console.log(`    Iterations: ${results.pagerank.ranIterations}, Converged: ${results.pagerank.didConverge}`);
        }
        
        if (results.betweenness) {
            console.log(`  Betweenness: ${results.betweenness.nodePropertiesWritten} nodes, ${results.betweenness.executionTime}ms`);
        }
        
        if (results.degree) {
            console.log(`  Degree: ${results.degree.nodePropertiesWritten} nodes, ${results.degree.executionTime}ms`);
        }
        
        if (results.eigenvector) {
            console.log(`  Eigenvector: ${results.eigenvector.nodePropertiesWritten} nodes, ${results.eigenvector.executionTime}ms`);
            console.log(`    Iterations: ${results.eigenvector.ranIterations}, Converged: ${results.eigenvector.didConverge}`);
        }

        console.log(`\n  Total execution time: ${results.totalExecutionTime}ms`);
        console.log('\n✅ All metrics written to node properties');
        console.log('   Properties available:');
        console.log('     - n.communityId (from community detection)');
        console.log('     - n.pagerank');
        console.log('     - n.betweenness');
        console.log('     - n.degree');
        if (includeEigenvector) {
            console.log('     - n.eigenvector');
        }
        console.log('\n   These properties are now available in node metadata for visualization.');

    } catch (error) {
        console.error('❌ Error computing GDS metrics:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

computeGDSMetrics().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

