/**
 * Diagnostic script to check if nodes are being added to Neo4j during scraping
 * This helps identify why the navigation graph might be empty after scraping
 */

import { fileURLToPath } from 'url';
import { connectNeo4j, closeNeo4j } from '../config/neo4j.js';
import { NavigationGraph } from '../services/graphs/navigation/NavigationGraph.js';
import { Driver } from 'neo4j-driver';

async function diagnoseScrapingNodeAddition() {
    console.log('🔍 Diagnosing Node Addition During Scraping\n');
    console.log('='.repeat(60));

    let driver: Driver | null = null;
    try {
        // Connect to Neo4j
        driver = await connectNeo4j();
        console.log('✅ Connected to Neo4j\n');

        // Initialize NavigationGraph
        const graph = new NavigationGraph(driver);
        
        console.log('1️⃣ Testing NavigationGraph Initialization:');
        try {
            await graph.initialize();
            console.log('   ✅ NavigationGraph initialized successfully\n');
        } catch (error) {
            console.error('   ❌ Failed to initialize NavigationGraph:', error);
            if (error instanceof Error) {
                console.error(`   Error message: ${error.message}`);
                if (error.stack) {
                    console.error(`   Stack trace: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
                }
            }
            throw error;
        }

        // Test adding a node
        console.log('2️⃣ Testing Node Addition:');
        const testNode = {
            url: 'https://iplo.nl/test-diagnostic-node',
            type: 'page' as const,
            title: 'Test Diagnostic Node',
            children: [],
            lastVisited: new Date().toISOString()
        };

        try {
            console.log(`   Attempting to add test node: ${testNode.url}`);
            const result = await graph.addNode(testNode);
            console.log(`   ✅ Node added successfully. Result: ${result}\n`);
        } catch (error) {
            console.error('   ❌ Failed to add node:', error);
            if (error instanceof Error) {
                console.error(`   Error message: ${error.message}`);
                if (error.stack) {
                    console.error(`   Stack trace: ${error.stack.split('\n').slice(0, 10).join('\n')}`);
                }
            }
            throw error;
        }

        // Verify node was added
        console.log('3️⃣ Verifying Node in Neo4j:');
        const session = driver.session();
        try {
            const verifyResult = await session.run(`
                MATCH (n:NavigationNode {url: $url})
                RETURN n.url as url, n.title as title, n.type as type
            `, { url: testNode.url });

            if (verifyResult.records.length > 0) {
                const record = verifyResult.records[0];
                console.log('   ✅ Node found in Neo4j:');
                console.log(`      URL: ${record.get('url')}`);
                console.log(`      Title: ${record.get('title')}`);
                console.log(`      Type: ${record.get('type')}\n`);
            } else {
                console.error('   ❌ Node NOT found in Neo4j after addNode() call!');
                console.error('   This indicates a persistence issue.\n');
            }
        } finally {
            await session.close();
        }

        // Check node count
        console.log('4️⃣ Checking Current Node Count:');
        try {
            const nodeCount = await graph.getNodeCount();
            console.log(`   Total nodes: ${nodeCount.total}`);
            console.log(`   IPLO nodes: ${nodeCount.iplo}`);
            console.log(`   External nodes: ${nodeCount.external}\n`);
        } catch (error) {
            console.error('   ❌ Failed to get node count:', error);
        }

        // Test error handling
        console.log('5️⃣ Testing Error Handling:');
        try {
            // Try to add a node with invalid data
            await graph.addNode({
                url: '', // Invalid: empty URL
                type: 'page',
                title: 'Invalid Node',
                children: []
            });
            console.error('   ⚠️  Should have thrown an error for invalid node!');
        } catch (error) {
            console.log('   ✅ Error handling works correctly (invalid node rejected)');
            if (error instanceof Error) {
                console.log(`      Error: ${error.message}\n`);
            }
        }

        // Clean up test node
        console.log('6️⃣ Cleaning Up Test Node:');
        const cleanupSession = driver.session();
        try {
            await cleanupSession.run(`
                MATCH (n:NavigationNode {url: $url})
                DETACH DELETE n
            `, { url: testNode.url });
            console.log('   ✅ Test node removed\n');
        } catch (error) {
            console.error('   ⚠️  Failed to remove test node:', error);
        } finally {
            await cleanupSession.close();
        }

        // Check for common issues
        console.log('7️⃣ Checking for Common Issues:');
        const checkSession = driver.session();
        try {
            // Check if indexes exist
            const indexResult = await checkSession.run(`
                SHOW INDEXES
                YIELD name, type, state
                WHERE name STARTS WITH 'navigation_node_'
                RETURN name, type, state
            `);

            const indexes = indexResult.records.map(r => ({
                name: r.get('name'),
                type: r.get('type'),
                state: r.get('state')
            }));

            if (indexes.length === 0) {
                console.log('   ⚠️  No navigation graph indexes found');
                console.log('   This might cause performance issues but shouldn\'t prevent node addition\n');
            } else {
                console.log(`   ✅ Found ${indexes.length} indexes:`);
                indexes.forEach(idx => {
                    console.log(`      - ${idx.name} (${idx.type}, ${idx.state})`);
                });
                console.log('');
            }

            // Check constraints
            const constraintResult = await checkSession.run(`
                SHOW CONSTRAINTS
                YIELD name, type
                WHERE name STARTS WITH 'navigation_node_'
                RETURN name, type
            `);

            const constraints = constraintResult.records.map(r => ({
                name: r.get('name'),
                type: r.get('type')
            }));

            if (constraints.length === 0) {
                console.log('   ⚠️  No navigation graph constraints found');
                console.log('   This might cause duplicate nodes\n');
            } else {
                console.log(`   ✅ Found ${constraints.length} constraints:`);
                constraints.forEach(c => {
                    console.log(`      - ${c.name} (${c.type})`);
                });
                console.log('');
            }
        } finally {
            await checkSession.close();
        }

        console.log('='.repeat(60));
        console.log('✅ Diagnosis Complete\n');
        console.log('💡 If nodes are not being added during scraping:');
        console.log('   1. Check workflow logs for errors');
        console.log('   2. Verify Neo4j is running and accessible');
        console.log('   3. Check that graph.addNode() is being called');
        console.log('   4. Look for error messages in scraper logs');
        console.log('   5. Ensure the graph instance is properly initialized\n');

    } catch (error) {
        console.error('\n❌ Diagnosis failed:', error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n').slice(0, 10).join('\n')}`);
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
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('diagnose-scraping-node-addition')) {
    diagnoseScrapingNodeAddition()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { diagnoseScrapingNodeAddition };


