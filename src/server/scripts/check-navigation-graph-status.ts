/**
 * Check the current status of the navigation graph in Neo4j
 * Verifies that nodes are being added and the graph is accessible
 */

import { fileURLToPath } from 'url';
import { connectNeo4j, closeNeo4j } from '../config/neo4j.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { GraphClusteringService } from '../services/graphs/navigation/GraphClusteringService.js';

async function checkNavigationGraphStatus() {
    console.log('🔍 Checking Navigation Graph Status\n');
    console.log('='.repeat(60));

    let driver;
    try {
        // Connect to Neo4j
        driver = await connectNeo4j();
        console.log(`✅ Connected to Neo4j\n`);

        // Initialize NavigationGraph
        const navGraph = new NavigationGraph(driver);
        await navGraph.initialize();
        console.log('✅ NavigationGraph initialized\n');

        // Check direct Neo4j query first
        console.log('1️⃣ Checking Neo4j Database Directly:');
        const session = driver.session();
        try {
            // Count nodes
            const nodeCountResult = await session.run(`
                MATCH (n:NavigationNode)
                RETURN count(n) as count
            `);
            const nodeCount = nodeCountResult.records[0]?.get('count')?.toNumber() || 0;
            console.log(`   NavigationNode count: ${nodeCount.toLocaleString()}`);

            // Count relationships
            const edgeCountResult = await session.run(`
                MATCH ()-[r:LINKS_TO]->()
                RETURN count(r) as count
            `);
            const edgeCount = edgeCountResult.records[0]?.get('count')?.toNumber() || 0;
            console.log(`   LINKS_TO relationships: ${edgeCount.toLocaleString()}\n`);

            if (nodeCount === 0) {
                console.log('⚠️  Navigation graph is EMPTY in Neo4j');
                console.log('   This means:');
                console.log('   - No NavigationNode nodes exist in the database');
                console.log('   - Workflows may not be adding nodes to the graph');
                console.log('   - Or workflows haven\'t been run yet\n');
                
                // Check if there are any nodes at all
                const anyNodeResult = await session.run(`
                    MATCH (n)
                    RETURN labels(n) as labels, count(n) as count
                    ORDER BY count DESC
                    LIMIT 10
                `);
                
                if (anyNodeResult.records.length > 0) {
                    console.log('📊 Other node types in database:');
                    anyNodeResult.records.forEach(record => {
                        const labels = record.get('labels');
                        const count = record.get('count').toNumber();
                        console.log(`   ${labels.join(':')}: ${count.toLocaleString()}`);
                    });
                    console.log('');
                }

                // Check for metadata node
                const metadataResult = await session.run(`
                    MATCH (m:NavigationGraphMetadata)
                    RETURN m
                    LIMIT 1
                `);
                
                if (metadataResult.records.length > 0) {
                    const metadata = metadataResult.records[0].get('m').properties;
                    console.log('📋 NavigationGraphMetadata found:');
                    console.log(`   Root URL: ${metadata.rootUrl || 'not set'}`);
                    console.log('');
                } else {
                    console.log('⚠️  No NavigationGraphMetadata node found');
                    console.log('   This suggests the graph was never initialized\n');
                }

                console.log('💡 To populate the graph:');
                console.log('   1. Run a workflow that explores websites (e.g., "Beleidsscan Navigation Graph")');
                console.log('   2. Or run the IPLO exploration workflow');
                console.log('   3. Check workflow logs to ensure nodes are being added\n');
                
                await session.close();
                await closeNeo4j();
                return;
            }

            // Get node type distribution
            const typeDistributionResult = await session.run(`
                MATCH (n:NavigationNode)
                RETURN n.type as type, count(n) as count
                ORDER BY count DESC
            `);
            
            console.log('📋 Node Type Distribution:');
            typeDistributionResult.records.forEach(record => {
                const type = record.get('type') || 'unknown';
                const count = record.get('count').toNumber();
                console.log(`   ${type.padEnd(15)} ${count.toLocaleString()}`);
            });
            console.log('');

            // Get sample nodes
            const sampleResult = await session.run(`
                MATCH (n:NavigationNode)
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                RETURN n.url as url, n.type as type, n.title as title, 
                       size([(n)-[:LINKS_TO]->(child:NavigationNode) | child]) as childCount
                ORDER BY n.createdAt DESC
                LIMIT 10
            `);

            console.log('📄 Sample Nodes (most recent 10):');
            sampleResult.records.forEach((record, i) => {
                const url = record.get('url');
                const type = record.get('type') || 'unknown';
                const title = record.get('title') || 'No title';
                const childCount = record.get('childCount').toNumber();
                console.log(`   ${i + 1}. [${type}] ${title}`);
                console.log(`      URL: ${url}`);
                console.log(`      Children: ${childCount}`);
            });
            console.log('');

        } finally {
            await session.close();
        }

        // Test NavigationGraph service methods
        console.log('2️⃣ Testing NavigationGraph Service Methods:');
        try {
            const nodeCount = await navGraph.getNodeCount();
            console.log(`   ✅ getNodeCount(): ${nodeCount.toLocaleString()}`);

            const allNodes = await navGraph.getAllNodes();
            console.log(`   ✅ getAllNodes(): ${allNodes.length.toLocaleString()} nodes returned`);
            
            if (allNodes.length > 0) {
                console.log(`   ✅ Sample node URL: ${allNodes[0].url}`);
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Error testing NavigationGraph methods:`, error);
            console.log('');
        }

        // Test clustering service
        console.log('3️⃣ Testing GraphClusteringService:');
        try {
            const clusteringService = new GraphClusteringService(navGraph);
            
            // Try with default parameters
            const metaGraph = await clusteringService.createMetaGraph({
                pathDepth: 2,
                minClusterSize: 20
            });
            
            console.log(`   ✅ createMetaGraph() succeeded`);
            console.log(`   Total nodes: ${metaGraph.totalNodes.toLocaleString()}`);
            console.log(`   Total clusters: ${metaGraph.totalClusters}`);
            console.log(`   Edges: ${metaGraph.edges.length}`);
            
            if (metaGraph.totalClusters === 0 && metaGraph.totalNodes > 0) {
                console.log(`   ⚠️  No clusters found (nodes may be filtered by minClusterSize: 20)`);
                console.log(`   💡 Try with lower minClusterSize to see clusters`);
            }
            
            if (Object.keys(metaGraph.clusters).length > 0) {
                console.log(`\n   Sample clusters:`);
                Object.entries(metaGraph.clusters)
                    .slice(0, 5)
                    .forEach(([id, cluster]) => {
                        console.log(`      ${id}: ${cluster.label} (${cluster.nodeCount} nodes)`);
                    });
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Error testing clustering service:`, error);
            console.log('');
        }

        // Check graph connectivity
        console.log('4️⃣ Checking Graph Connectivity:');
        const session2 = driver.session();
        try {
            const connectivityResult = await session2.run(`
                MATCH (n:NavigationNode)
                WITH n
                OPTIONAL MATCH (n)-[:LINKS_TO]->(child:NavigationNode)
                WITH n, count(child) as outDegree
                OPTIONAL MATCH (parent:NavigationNode)-[:LINKS_TO]->(n)
                WITH n, outDegree, count(parent) as inDegree
                RETURN 
                    count(n) as totalNodes,
                    avg(outDegree) as avgOutDegree,
                    avg(inDegree) as avgInDegree,
                    max(outDegree) as maxOutDegree,
                    max(inDegree) as maxInDegree,
                    count(CASE WHEN outDegree = 0 AND inDegree = 0 THEN 1 END) as isolatedNodes
            `);

            if (connectivityResult.records.length > 0) {
                const stats = connectivityResult.records[0];
                const totalNodes = stats.get('totalNodes')?.toNumber?.() || stats.get('totalNodes') || 0;
                const avgOutDegree = stats.get('avgOutDegree')?.toNumber?.() || stats.get('avgOutDegree') || 0;
                const avgInDegree = stats.get('avgInDegree')?.toNumber?.() || stats.get('avgInDegree') || 0;
                const maxOutDegree = stats.get('maxOutDegree')?.toNumber?.() || stats.get('maxOutDegree') || 0;
                const maxInDegree = stats.get('maxInDegree')?.toNumber?.() || stats.get('maxInDegree') || 0;
                const isolatedNodes = stats.get('isolatedNodes')?.toNumber?.() || stats.get('isolatedNodes') || 0;

                console.log(`   Total nodes: ${totalNodes.toLocaleString()}`);
                console.log(`   Average out-degree: ${avgOutDegree.toFixed(2)}`);
                console.log(`   Average in-degree: ${avgInDegree.toFixed(2)}`);
                console.log(`   Max out-degree: ${maxOutDegree}`);
                console.log(`   Max in-degree: ${maxInDegree}`);
                console.log(`   Isolated nodes: ${isolatedNodes}`);
                
                if (isolatedNodes > 0 && isolatedNodes === totalNodes) {
                    console.log(`   ⚠️  All nodes are isolated (no relationships)`);
                }
            }
            console.log('');
        } catch (error) {
            console.error(`   ❌ Error checking connectivity:`, error);
            console.log('');
        } finally {
            await session2.close();
        }

        console.log('='.repeat(60));
        console.log('✅ Status Check Complete');
        console.log('='.repeat(60));
        console.log(`\n💡 The navigation graph is using Neo4j persistence`);
        console.log(`   All nodes are stored in Neo4j database`);
        console.log(`   Connection: ${process.env.NEO4J_URI || 'bolt://localhost:7687'}`);
        console.log(`\n   To add more nodes, run workflows that explore websites`);
        console.log(`   The graph will grow automatically as workflows discover pages\n`);

    } catch (error) {
        console.error('\n❌ Error checking navigation graph status:', error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
            }
        }
        process.exit(1);
    } finally {
        if (driver) {
            await closeNeo4j();
        }
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('check-navigation-graph-status')) {
    checkNavigationGraphStatus()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { checkNavigationGraphStatus };

