/**
 * Large-scale Knowledge Graph Seeder
 * Creates a comprehensive knowledge graph with thousands of entities
 * to test clustering, query performance, and ensure we're using the persistent MongoDB instance
 */

import { fileURLToPath } from 'url';
import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import {
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement,
    RelationType,
    EntityType
} from '../domain/ontology.js';

const DOMAINS = ['bodem', 'water', 'lucht', 'geluid', 'natuur', 'ruimte', 'verkeer', 'energie'];
const JURISDICTIONS = [
    'Gemeente Amsterdam',
    'Gemeente Rotterdam',
    'Gemeente Den Haag',
    'Gemeente Utrecht',
    'Gemeente Eindhoven',
    'Provincie Noord-Holland',
    'Provincie Zuid-Holland',
    'Rijksoverheid'
];
const DOCUMENT_TYPES: Array<'Vision' | 'Structure' | 'Ordinance' | 'Note'> = ['Vision', 'Structure', 'Ordinance', 'Note'];
const REGULATION_CATEGORIES: Array<'Zoning' | 'Environmental' | 'Building' | 'Procedural'> = ['Zoning', 'Environmental', 'Building', 'Procedural'];
const SPATIAL_TYPES: Array<'Parcel' | 'Building' | 'Street' | 'Neighborhood' | 'ZoningArea'> = ['Parcel', 'Building', 'Street', 'Neighborhood', 'ZoningArea'];
const LAND_USE_CATEGORIES = ['Wonen', 'Bedrijvigheid', 'Groen', 'Verkeer', 'Gemengd'];

/**
 * Generate a large knowledge graph
 */
async function seedLargeKnowledgeGraph() {
    console.log('🌱 Starting Large Knowledge Graph Seeder...\n');
    console.log('This will create a comprehensive knowledge graph with thousands of entities.\n');

    // Connect to Neo4j
    await connectNeo4j();
    const driver = getNeo4jDriver();
    const kg = getKnowledgeGraphService(driver);
    
    // Initialize (loads existing data)
    await kg.initialize();
    
    const existingSnapshot = await kg.getGraphSnapshot();
    console.log(`📊 Existing graph: ${existingSnapshot.nodes.length} nodes, ${existingSnapshot.edges.length} edges\n`);

    const startTime = Date.now();
    let nodesCreated = 0;
    let edgesCreated = 0;

    // Configuration
    const config = {
        documentsPerJurisdiction: 50,      // 8 jurisdictions * 50 = 400 documents
        regulationsPerDocument: 10,         // 400 * 10 = 4,000 regulations
        spatialUnitsPerJurisdiction: 100,   // 8 * 100 = 800 spatial units
        landUses: 50,                       // 50 land uses
        requirementsPerRegulation: 2        // 4,000 * 2 = 8,000 requirements
    };

    console.log('📄 Creating Policy Documents...');
    const policyDocuments: PolicyDocument[] = [];
    
    for (const jurisdiction of JURISDICTIONS) {
        for (let i = 0; i < config.documentsPerJurisdiction; i++) {
            const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
            const docType = DOCUMENT_TYPES[Math.floor(Math.random() * DOCUMENT_TYPES.length)];
            const year = 2020 + Math.floor(Math.random() * 5);
            
            const doc: PolicyDocument = {
                id: `doc-${jurisdiction.toLowerCase().replace(/\s+/g, '-')}-${domain}-${i}`,
                type: 'PolicyDocument',
                name: `${docType} ${domain.charAt(0).toUpperCase() + domain.slice(1)} ${jurisdiction} ${year}`,
                documentType: docType,
                jurisdiction,
                date: `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-01`,
                status: Math.random() > 0.1 ? 'Active' : 'Draft',
                description: `Beleidsdocument voor ${domain} in ${jurisdiction}`,
                metadata: {
                    domain,
                    thema: domain
                }
            };
            
            await kg.addNode(doc);
            policyDocuments.push(doc);
            nodesCreated++;
            
            if (nodesCreated % 100 === 0) {
                process.stdout.write(`\r  Created ${nodesCreated} nodes...`);
            }
        }
    }
    console.log(`\n✅ Created ${policyDocuments.length} policy documents`);

    console.log('\n📋 Creating Regulations...');
    const regulations: Regulation[] = [];
    
    for (const doc of policyDocuments) {
        const regsPerDoc = Math.floor(Math.random() * (config.regulationsPerDocument - 5)) + 5;
        
        for (let i = 0; i < regsPerDoc; i++) {
            const category = REGULATION_CATEGORIES[Math.floor(Math.random() * REGULATION_CATEGORIES.length)];
            const domain = doc.metadata?.domain || DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
            
            const reg: Regulation = {
                id: `reg-${doc.id}-${i}`,
                type: 'Regulation',
                name: `${category} Regel ${domain} ${i + 1}`,
                category,
                description: `Regel voor ${domain} in ${doc.jurisdiction}`,
                metadata: {
                    domain,
                    sourceDocument: doc.id
                }
            };
            
            await kg.addNode(reg);
            regulations.push(reg);
            nodesCreated++;
            
            // Link regulation to document
            await kg.addEdge(reg.id, doc.id, RelationType.DEFINED_IN);
            edgesCreated++;
            
            if (nodesCreated % 500 === 0) {
                process.stdout.write(`\r  Created ${nodesCreated} nodes, ${edgesCreated} edges...`);
            }
        }
    }
    console.log(`\n✅ Created ${regulations.length} regulations`);

    console.log('\n🏢 Creating Spatial Units...');
    const spatialUnits: SpatialUnit[] = [];
    
    for (const jurisdiction of JURISDICTIONS) {
        for (let i = 0; i < config.spatialUnitsPerJurisdiction; i++) {
            const spatialType = SPATIAL_TYPES[Math.floor(Math.random() * SPATIAL_TYPES.length)];
            const streetNames = ['Kerkstraat', 'Hoofdstraat', 'Marktplein', 'Parkweg', 'Industrieweg', 'Groenlaan'];
            const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];
            
            const spatialUnit: SpatialUnit = {
                id: `spatial-${jurisdiction.toLowerCase().replace(/\s+/g, '-')}-${i}`,
                type: 'SpatialUnit',
                name: `${streetName} ${i + 1}, ${jurisdiction}`,
                spatialType,
                description: `${spatialType} in ${jurisdiction}`,
                metadata: {
                    jurisdiction
                }
            };
            
            await kg.addNode(spatialUnit);
            spatialUnits.push(spatialUnit);
            nodesCreated++;
            
            // Randomly link some regulations to spatial units
            if (Math.random() > 0.7 && regulations.length > 0) {
                const reg = regulations[Math.floor(Math.random() * regulations.length)];
                await kg.addEdge(reg.id, spatialUnit.id, RelationType.APPLIES_TO);
                edgesCreated++;
            }
            
            if (nodesCreated % 500 === 0) {
                process.stdout.write(`\r  Created ${nodesCreated} nodes, ${edgesCreated} edges...`);
            }
        }
    }
    console.log(`\n✅ Created ${spatialUnits.length} spatial units`);

    console.log('\n🌳 Creating Land Uses...');
    const landUses: LandUse[] = [];
    
    for (let i = 0; i < config.landUses; i++) {
        const category = LAND_USE_CATEGORIES[Math.floor(Math.random() * LAND_USE_CATEGORIES.length)];
        
        const landUse: LandUse = {
            id: `landuse-${category.toLowerCase()}-${i}`,
            type: 'LandUse',
            name: `${category} ${i + 1}`,
            category,
            description: `Gebruiksfunctie: ${category}`
        };
        
        await kg.addNode(landUse);
        landUses.push(landUse);
        nodesCreated++;
        
        // Link some regulations to land uses
        if (Math.random() > 0.5 && regulations.length > 0) {
            const reg = regulations[Math.floor(Math.random() * regulations.length)];
            await kg.addEdge(reg.id, landUse.id, RelationType.APPLIES_TO);
            edgesCreated++;
        }
    }
    console.log(`\n✅ Created ${landUses.length} land uses`);

    console.log('\n📏 Creating Requirements...');
    const metrics = ['height', 'noise_level', 'distance', 'area', 'volume', 'density'];
    const operators: Array<'<' | '<=' | '>' | '>=' | '='> = ['<', '<=', '>', '>=', '='];
    
    for (const reg of regulations.slice(0, Math.min(regulations.length, 2000))) { // Limit to avoid too many
        const numRequirements = Math.floor(Math.random() * config.requirementsPerRegulation) + 1;
        
        for (let i = 0; i < numRequirements; i++) {
            const metric = metrics[Math.floor(Math.random() * metrics.length)];
            const operator = operators[Math.floor(Math.random() * operators.length)];
            const value = Math.floor(Math.random() * 100) + 1;
            const unit = metric === 'height' ? 'm' : metric === 'noise_level' ? 'dB' : metric === 'distance' ? 'm' : 'm²';
            
            const requirement: Requirement = {
                id: `req-${reg.id}-${i}`,
                type: 'Requirement',
                name: `${metric} ${operator} ${value}${unit}`,
                metric,
                operator,
                value: value.toString(),
                unit,
                description: `Vereiste: ${metric} ${operator} ${value}${unit}`
            };
            
            await kg.addNode(requirement);
            nodesCreated++;
            
            // Link requirement to regulation
            await kg.addEdge(reg.id, requirement.id, RelationType.HAS_REQUIREMENT);
            edgesCreated++;
        }
    }
    console.log(`\n✅ Created requirements`);

    // Create some hierarchical relationships
    console.log('\n🔗 Creating hierarchical relationships...');
    let hierarchicalEdges = 0;
    
    // Link spatial units to neighborhoods/zones
    const neighborhoods = spatialUnits.filter(s => s.spatialType === 'Neighborhood' || s.spatialType === 'ZoningArea');
    const parcels = spatialUnits.filter(s => s.spatialType === 'Parcel');
    
    for (const parcel of parcels.slice(0, Math.min(parcels.length, 200))) {
        if (neighborhoods.length > 0 && Math.random() > 0.5) {
            const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
            await kg.addEdge(parcel.id, neighborhood.id, RelationType.LOCATED_IN);
            hierarchicalEdges++;
        }
    }
    
    // Link documents (refinement relationships)
    for (let i = 0; i < Math.min(policyDocuments.length, 50); i++) {
        if (i > 0 && Math.random() > 0.7) {
            const prevDoc = policyDocuments[i - 1];
            const currentDoc = policyDocuments[i];
            if (prevDoc.jurisdiction === currentDoc.jurisdiction) {
                await kg.addEdge(currentDoc.id, prevDoc.id, RelationType.REFINES);
                hierarchicalEdges++;
            }
        }
    }
    
    edgesCreated += hierarchicalEdges;
    console.log(`✅ Created ${hierarchicalEdges} hierarchical relationships`);

    // Final statistics
    const finalSnapshot = await kg.getGraphSnapshot();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SEEDING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Nodes created:     ${nodesCreated}`);
    console.log(`Edges created:     ${edgesCreated}`);
    console.log(`Total nodes:       ${finalSnapshot.nodes.length}`);
    console.log(`Total edges:       ${finalSnapshot.edges.length}`);
    console.log(`Duration:          ${duration} seconds`);
    console.log('\nEntity type distribution:');
    
    const typeCounts: Record<EntityType, number> = {
        PolicyDocument: 0,
        Regulation: 0,
        SpatialUnit: 0,
        LandUse: 0,
        Requirement: 0,
        Concept: 0
    };
    
    finalSnapshot.nodes.forEach((node: { type: EntityType }) => {
        const nodeType = node.type as EntityType;
        if (nodeType in typeCounts) {
            typeCounts[nodeType] = (typeCounts[nodeType] || 0) + 1;
        }
    });
    
    Object.entries(typeCounts).forEach(([type, count]) => {
        if (count > 0) {
            console.log(`  ${type.padEnd(15)} ${count}`);
        }
    });
    
    console.log('\n✅ Knowledge graph is now ready for clustering and querying!');
    console.log('   Try: GET /api/knowledge-graph/meta?strategy=hybrid&minClusterSize=10\n');
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1]?.includes('seed-large-kg')) {
    seedLargeKnowledgeGraph()
        .then(() => {
            console.log('\n✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error);
            process.exit(1);
        });
}

export { seedLargeKnowledgeGraph };

