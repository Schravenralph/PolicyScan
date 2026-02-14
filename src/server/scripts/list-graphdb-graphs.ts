/**
 * List all distinct named graphs in GraphDB
 * 
 * Usage:
 *   tsx src/server/scripts/list-graphdb-graphs.ts
 */

import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'cross-fetch';

dotenv.config();

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

async function listGraphs(): Promise<void> {
    try {
        const host = process.env.GRAPHDB_HOST || 'localhost';
        const port = process.env.GRAPHDB_PORT || '7200';
        const repository = process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG';
        const username = process.env.GRAPHDB_USER || 'admin';
        const password = process.env.GRAPHDB_PASSWORD || 'root';
        
        const queryEndpoint = `http://${host}:${port}/repositories/${repository}`;
        const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
        
        console.log(`${colors.blue}🔍 Querying GraphDB...${colors.reset}`);
        console.log(`${colors.cyan}   Endpoint: ${queryEndpoint}${colors.reset}\n`);

        console.log(`${colors.cyan}📊 Querying for distinct named graphs...${colors.reset}\n`);

        // Query 1: List all distinct named graphs
        const query = `
            SELECT DISTINCT ?g
            WHERE {
                GRAPH ?g { ?s ?p ?o }
            }
            LIMIT 100
        `;
        
        const response = await fetch(queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json',
                Authorization: authHeader,
            },
            body: query,
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GraphDB query failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const graphs = (data.results?.bindings || []).map((binding: { g?: { value?: string } }) => binding.g?.value).filter((v: unknown): v is string => typeof v === 'string');

        if (graphs.length === 0) {
            console.log(`${colors.yellow}⚠️  No named graphs found in the repository${colors.reset}`);
            console.log(`${colors.yellow}   (This might mean all data is in the default graph)${colors.reset}\n`);
        } else {
            console.log(`${colors.green}✅ Found ${graphs.length} named graph(s):${colors.reset}\n`);
            
            graphs.forEach((graphUri: string, index: number) => {
                console.log(`${colors.cyan}${index + 1}.${colors.reset} ${graphUri}`);
            });
        }

        // Query 2: Check default graph
        console.log(`\n${colors.cyan}📊 Checking default graph (triples without named graph)...${colors.reset}`);
        const defaultQuery = `
            SELECT (COUNT(*) as ?count)
            WHERE {
                ?s ?p ?o
                MINUS {
                    GRAPH ?g { ?s ?p ?o }
                }
            }
        `;
        
        const defaultResponse = await fetch(queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json',
                Authorization: authHeader,
            },
            body: defaultQuery,
            signal: AbortSignal.timeout(10000)
        });

        if (defaultResponse.ok) {
            const defaultData = await defaultResponse.json();
            const defaultCount = parseInt(defaultData.results?.bindings[0]?.count?.value || '0');
            if (defaultCount > 0) {
                console.log(`${colors.green}✅ Default graph contains ${defaultCount} triple(s)${colors.reset}\n`);
            } else {
                console.log(`${colors.yellow}⚠️  Default graph is empty${colors.reset}\n`);
            }
        }

        // Query 3: Get triple counts per graph
        console.log(`${colors.cyan}📊 Getting triple counts per graph...${colors.reset}\n`);
        const countQuery = `
            SELECT ?g (COUNT(*) as ?count)
            WHERE {
                GRAPH ?g { ?s ?p ?o }
            }
            GROUP BY ?g
            ORDER BY DESC(?count)
            LIMIT 100
        `;
        
        const countResponse = await fetch(queryEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json',
                Authorization: authHeader,
            },
            body: countQuery,
            signal: AbortSignal.timeout(10000)
        });

        if (countResponse.ok) {
            const countData = await countResponse.json();
            const graphCounts = (countData.results?.bindings || []).map((binding: { g?: { value?: string }; count?: { value?: string } }) => ({
                graph: binding.g?.value || '',
                count: parseInt(binding.count?.value || '0')
            }));
            
            if (graphCounts.length > 0) {
                console.log(`${colors.green}Triple counts per graph:${colors.reset}\n`);
                graphCounts.forEach((item: { graph: string; count: number }, index: number) => {
                    console.log(`${colors.cyan}${index + 1}.${colors.reset} ${item.graph}`);
                    console.log(`   ${colors.yellow}Triples: ${item.count}${colors.reset}\n`);
                });
            } else {
                console.log(`${colors.yellow}⚠️  No named graphs found${colors.reset}\n`);
            }
        }

    } catch (error) {
        console.error(`\n${colors.red}❌ Error:${colors.reset}`, error);
        if (error instanceof Error) {
            console.error(`${colors.red}   ${error.message}${colors.reset}`);
            if (error.name === 'AbortError') {
                console.error(`${colors.red}   Query timed out after 10 seconds${colors.reset}`);
            }
        }
        
        // Check if GraphDB is running
        console.log(`\n${colors.yellow}💡 Troubleshooting:${colors.reset}`);
        console.log(`${colors.yellow}   1. Is GraphDB running? Check: http://localhost:7200${colors.reset}`);
        console.log(`${colors.yellow}   2. Is the repository name correct? (Check GRAPHDB_REPOSITORY env var)${colors.reset}`);
        console.log(`${colors.yellow}   3. Are credentials correct? (Check GRAPHDB_USER and GRAPHDB_PASSWORD)${colors.reset}`);
        console.log(`${colors.yellow}   4. Try: pnpm run graphdb:test-simple${colors.reset}`);
        
        process.exit(1);
    }
}

// Run if called directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url) || 
                     process.argv[1]?.includes('list-graphdb-graphs');

if (isMainModule) {
    listGraphs()
        .then(() => {
            console.log(`${colors.green}✅ Done${colors.reset}`);
            process.exit(0);
        })
        .catch((error) => {
            console.error(`${colors.red}❌ Failed:${colors.reset}`, error);
            process.exit(1);
        });
}

export { listGraphs };
