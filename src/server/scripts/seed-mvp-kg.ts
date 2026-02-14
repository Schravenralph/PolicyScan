import { fileURLToPath } from 'url';
import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import {
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    RelationType
} from '../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../models/FeatureFlag.js';
import { ensureDBConnection } from '../config/database.js';

export async function seedAndVerify() {
    console.log('Starting Knowledge Graph Verification...');
    
    // Ensure database connection is established before using FeatureFlag
    await ensureDBConnection();
    
    // Ensure KG feature flags are enabled for seeding
    // This is critical - if flags are disabled, addNode() will silently skip adding nodes
    try {
        await FeatureFlag.upsert({
            name: KGFeatureFlag.KG_ENABLED,
            enabled: true,
            description: 'Master flag: Enable/disable all KG features',
            category: 'Knowledge Graph Core'
        });
        await FeatureFlag.upsert({
            name: KGFeatureFlag.KG_EXTRACTION_ENABLED,
            enabled: true,
            description: 'Enable KG extraction (required for seeding)',
            category: 'Knowledge Graph Core'
        });
        console.log('✅ Knowledge Graph feature flags enabled');
    } catch (error) {
        console.warn('⚠️  Could not enable feature flags (may already be enabled):', error);
        // Continue anyway - flags might already be enabled or defaults might be sufficient
    }
    
    // Connect to Neo4j first
    await connectNeo4j();
    const driver = getNeo4jDriver();
    const knowledgeGraphService = getKnowledgeGraphService(driver);
    await knowledgeGraphService.initialize();

    // 1. Create Entities
    // Note: Using realistic jurisdiction instead of placeholder "Gemeente X"
    const visionDoc: PolicyDocument = {
        id: 'doc-001',
        type: 'PolicyDocument',
        name: 'Omgevingsvisie Amsterdam',
        documentType: 'Vision',
        jurisdiction: 'Gemeente Amsterdam', // Real jurisdiction instead of placeholder
        date: '2024-01-01',
        status: 'Active',
        metadata: {
            domain: 'ruimtelijke ordening', // Set domain for semantic clustering
            domainSource: 'seed data'
        }
    };

    const zoningReg: Regulation = {
        id: 'reg-001',
        type: 'Regulation',
        name: 'Wonen Centrum',
        category: 'Zoning',
        description: 'Regels voor wonen in het centrumgebied.'
    };

    const noiseReg: Regulation = {
        id: 'reg-002',
        type: 'Regulation',
        name: 'Geluidnorm Centrum',
        category: 'Environmental',
        description: 'Max 50dB op de gevel.'
    };

    const parcel: SpatialUnit = {
        id: 'parcel-123',
        type: 'SpatialUnit',
        name: 'Kerkstraat 1',
        spatialType: 'Parcel'
    };

    const residentialUse: LandUse = {
        id: 'use-res',
        type: 'LandUse',
        name: 'Wonen',
        category: 'Wonen'
    };

    // 2. Add Nodes
    console.log('Adding nodes...');
    await knowledgeGraphService.addNode(visionDoc);
    await knowledgeGraphService.addNode(zoningReg);
    await knowledgeGraphService.addNode(noiseReg);
    await knowledgeGraphService.addNode(parcel);
    await knowledgeGraphService.addNode(residentialUse);

    // 3. Add Edges
    console.log('Adding edges...');
    // Regulations defined in the Vision Document
    await knowledgeGraphService.addEdge(zoningReg.id, visionDoc.id, RelationType.DEFINED_IN);
    await knowledgeGraphService.addEdge(noiseReg.id, visionDoc.id, RelationType.DEFINED_IN);

    // Regulations apply to Residential Use
    await knowledgeGraphService.addEdge(zoningReg.id, residentialUse.id, RelationType.APPLIES_TO);

    // Noise regulation applies to the Parcel
    await knowledgeGraphService.addEdge(noiseReg.id, parcel.id, RelationType.APPLIES_TO);

    // 4. Verify Structure
    console.log('Verifying structure...');

    const snapshot = await knowledgeGraphService.getGraphSnapshot();
    console.log(`Total Nodes: ${snapshot.nodes.length}`);
    console.log(`Total Edges: ${snapshot.edges.length}`);

    // Test Query: Get regulations for the Parcel
    const parcelRegulations = await knowledgeGraphService.getApplicableRegulations(parcel.id);
    console.log('Regulations for Parcel (Kerkstraat 1):', parcelRegulations.map(r => r.name));

    // Test Query: Get regulations for Residential Use
    const useRegulations = await knowledgeGraphService.getApplicableRegulations(residentialUse.id);
    console.log('Regulations for Residential Use:', useRegulations.map(r => r.name));

    // Test Query: Get all regulations defined in the Vision Document
    const docRegulations = await knowledgeGraphService.getIncomingNeighbors(visionDoc.id, RelationType.DEFINED_IN);
    console.log('Regulations in Omgevingsvisie:', docRegulations.map(n => n.name));

    console.log('Verification Complete.');
}

// Only run if called directly (not imported)
// Check if this file is being executed directly vs imported
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url) || 
                     process.argv[1]?.includes('seed-mvp-kg');
if (isMainModule) {
    seedAndVerify().catch(console.error);
}
