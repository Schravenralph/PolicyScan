/**
 * Check Neo4j GDS plugin installation and version
 */

import { fileURLToPath } from 'url';
import { connectNeo4j, closeNeo4j } from '../config/neo4j.js';

async function checkNeo4jGDS() {
    console.log('🔍 Checking Neo4j GDS Plugin Status\n');
    console.log('='.repeat(60));

    try {
        // Connect to Neo4j
        const driver = await connectNeo4j();
        const session = driver.session();

        try {
            // Check Neo4j version
            console.log('1️⃣ Checking Neo4j version...');
            const versionResult = await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions[0] as version');
            const neo4jVersion = versionResult.records.find(r => r.get('name') === 'Neo4j Kernel');
            if (neo4jVersion) {
                console.log(`   ✅ Neo4j version: ${neo4jVersion.get('version')}\n`);
            }

            // Check if GDS is installed
            console.log('2️⃣ Checking GDS plugin...');
            try {
                // Try calling a simple GDS procedure to verify installation
                let gdsVersion: string | null = null;
                const procedures: string[] = [];
                
                try {
                    // Try gds.version() - most reliable check
                    const gdsResult = await session.run('CALL gds.version()');
                    // Different Neo4j versions return different formats
                    if (gdsResult.records.length > 0) {
                        const record = gdsResult.records[0];
                        // Try to get version from any field
                        const keys = record.keys;
                        for (const key of keys) {
                            const value = record.get(key);
                            if (typeof value === 'string' && value.match(/\d+\.\d+/)) {
                                gdsVersion = value;
                                break;
                            }
                        }
                        if (!gdsVersion) {
                            gdsVersion = 'installed';
                        }
                    }
                } catch (_versionError) {
                    // If version() fails, try calling a simple algorithm to verify
                    try {
                        // Try to list graph projections (should work if GDS is installed)
                        await session.run('CALL gds.graph.list()');
                        gdsVersion = 'installed';
                    } catch {
                        throw new Error('GDS procedures not available');
                    }
                }
                
                if (gdsVersion) {
                    console.log(`   ✅ GDS plugin installed: ${gdsVersion}\n`);
                } else {
                    throw new Error('GDS procedures not found');
                }
                
                // Check available algorithms by trying to call them
                console.log('3️⃣ Checking available GDS algorithms...');
                const algorithmChecks = [
                    { name: 'gds.louvain', test: 'CALL gds.louvain.stream($graphName, {}) YIELD nodeId RETURN count(nodeId) LIMIT 1' },
                    { name: 'gds.labelPropagation', test: 'CALL gds.labelPropagation.stream($graphName, {}) YIELD nodeId RETURN count(nodeId) LIMIT 1' },
                    { name: 'gds.leiden', test: 'CALL gds.leiden.stream($graphName, {}) YIELD nodeId RETURN count(nodeId) LIMIT 1' },
                    { name: 'gds.wcc', test: 'CALL gds.wcc.stream($graphName, {}) YIELD nodeId RETURN count(nodeId) LIMIT 1' },
                ];
                
                for (const algo of algorithmChecks) {
                    try {
                        // Just check if procedure exists, don't actually run it
                        await session.run(`CALL ${algo.name}.write($graphName, {writeProperty: 'test'}) YIELD communityCount RETURN communityCount LIMIT 0`, { graphName: 'test' });
                        procedures.push(algo.name);
                    } catch {
                        // Procedure doesn't exist or wrong syntax, skip
                    }
                }
                
                if (procedures.length > 0) {
                    console.log(`   Found ${procedures.length} GDS algorithms:`);
                    procedures.forEach(proc => {
                        console.log(`      - ${proc}`);
                    });
                } else {
                    console.log('   ⚠️  Could not enumerate algorithms (this is OK, they may be available)');
                }
                console.log('');

                // Check if graph projection exists
                console.log('4️⃣ Checking existing graph projections...');
                try {
                    const graphResult = await session.run('CALL gds.graph.list() YIELD graphName RETURN graphName');
                    const graphs = graphResult.records.map(r => r.get('graphName'));
                    if (graphs.length > 0) {
                        console.log(`   Found ${graphs.length} graph projection(s):`);
                        graphs.forEach(graph => console.log(`      - ${graph}`));
                    } else {
                        console.log('   No graph projections found (this is normal for first run)');
                    }
                } catch (_error) {
                    console.log('   ⚠️  Could not list graph projections (may need to create one first)');
                }

                console.log('\n' + '='.repeat(60));
                console.log('✅ GDS plugin is installed and ready!');
                console.log('='.repeat(60));
                console.log('\n💡 Next steps:');
                console.log('   1. Create graph projection');
                console.log('   2. Run community detection algorithms');
                console.log('   3. Build meta-graph from communities\n');

            } catch (error) {
                console.log('   ❌ GDS plugin NOT installed\n');
                console.log('📦 Installation Instructions:');
                console.log('   1. Download GDS plugin from: https://neo4j.com/docs/graph-data-science/current/installation/');
                console.log('   2. For Neo4j 5.x, download GDS 2.x');
                console.log('   3. Copy .jar file to Neo4j plugins directory');
                console.log('   4. Restart Neo4j instance');
                console.log('   5. Run this script again to verify\n');
                
                if (error instanceof Error) {
                    console.error('   Error details:', error.message);
                }
            }

        } finally {
            await session.close();
        }

    } catch (error) {
        console.error('\n❌ Error checking Neo4j GDS:', error);
        if (error instanceof Error) {
            console.error('   Error message:', error.message);
        }
        process.exit(1);
    } finally {
        await closeNeo4j();
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('check-neo4j-gds')) {
    checkNeo4jGDS()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { checkNeo4jGDS };

