import { connectDB } from '../config/database.js';
import { connectNeo4j, getNeo4jDriver } from '../config/neo4j.js';
import { VectorService } from '../services/query/VectorService.js';
import { getKnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { hybridSearchService } from '../services/query/HybridSearch.js';
import {
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    RelationType
} from '../domain/ontology.js';

/**
 * Comprehensive seeder for search functionality
 * Populates both the vector database and knowledge graph with sample policy documents
 */
async function seedSearchData() {
    console.log('🌱 Starting Search Data Seeder...\n');

    // Connect to databases
    const _db = await connectDB();
    await connectNeo4j();
    const driver = getNeo4jDriver();
    const knowledgeGraphService = getKnowledgeGraphService(driver);
    await knowledgeGraphService.initialize();

    // Initialize services
    const vectorService = new VectorService();
    await vectorService.init();
    await hybridSearchService.init();

    // ===== 1. POLICY DOCUMENTS =====
    console.log('📄 Creating Policy Documents...');

    const omgevingsvisie: PolicyDocument = {
        id: 'doc-omgevingsvisie-2024',
        type: 'PolicyDocument',
        name: 'Omgevingsvisie Gemeente Amsterdam 2024',
        documentType: 'Vision',
        jurisdiction: 'Gemeente Amsterdam',
        date: '2024-01-15',
        status: 'Active',
        description: 'Strategische visie voor de fysieke leefomgeving van Amsterdam tot 2040'
    };

    const bestemmingsplan: PolicyDocument = {
        id: 'doc-bestemmingsplan-centrum',
        type: 'PolicyDocument',
        name: 'Bestemmingsplan Centrum 2023',
        documentType: 'Structure',
        jurisdiction: 'Gemeente Amsterdam',
        date: '2023-06-01',
        status: 'Active',
        description: 'Juridisch bindend bestemmingsplan voor het centrumgebied'
    };

    const milieuverordening: PolicyDocument = {
        id: 'doc-milieuverordening',
        type: 'PolicyDocument',
        name: 'Provinciale Milieuverordening Noord-Holland',
        documentType: 'Ordinance',
        jurisdiction: 'Provincie Noord-Holland',
        date: '2023-01-01',
        status: 'Active',
        description: 'Provinciale regels voor milieubescherming en bodemkwaliteit'
    };

    knowledgeGraphService.addNode(omgevingsvisie);
    knowledgeGraphService.addNode(bestemmingsplan);
    knowledgeGraphService.addNode(milieuverordening);

    // ===== 2. REGULATIONS =====
    console.log('📋 Creating Regulations...');

    const bouwhoogteReg: Regulation = {
        id: 'reg-bouwhoogte-wonen',
        type: 'Regulation',
        name: 'Bouwhoogte Woongebouwen Centrum',
        category: 'Building',
        description: 'Maximale bouwhoogte voor woongebouwen in het centrum is 25 meter (circa 8 verdiepingen). Uitzonderingen mogelijk bij stedenbouwkundige meerwaarde.'
    };

    const geluidReg: Regulation = {
        id: 'reg-geluid-centrum',
        type: 'Regulation',
        name: 'Geluidnormen Centrum',
        category: 'Environmental',
        description: 'Maximale geluidbelasting op de gevel van woningen is 50 dB(A) overdag en 40 dB(A) s nachts. Voor horeca gelden strengere normen.'
    };

    const bodemReg: Regulation = {
        id: 'reg-bodem-verontreiniging',
        type: 'Regulation',
        name: 'Bodemkwaliteit en Grondverontreiniging',
        category: 'Environmental',
        description: 'Bij nieuwe ontwikkelingen moet bodemonderzoek worden uitgevoerd. Verontreinigde grond moet worden gesaneerd volgens de Wet bodembescherming. Achtergrondwaarden en interventiewaarden zijn vastgelegd in de Regeling bodemkwaliteit.'
    };

    const parkeernormReg: Regulation = {
        id: 'reg-parkeren-wonen',
        type: 'Regulation',
        name: 'Parkeernormen Woongebouwen',
        category: 'Zoning',
        description: 'In het centrum geldt een parkeernorm van 0,5 parkeerplaats per woning. Voor sociale huur kan dit worden verlaagd tot 0,3.'
    };

    const groennormReg: Regulation = {
        id: 'reg-groen-openbare-ruimte',
        type: 'Regulation',
        name: 'Groennormen Openbare Ruimte',
        category: 'Environmental',
        description: 'Minimaal 30% van de openbare ruimte moet groen zijn. Bij nieuwbouw moet minimaal 20% van het perceel onverhard blijven voor waterinfiltratie.'
    };

    knowledgeGraphService.addNode(bouwhoogteReg);
    knowledgeGraphService.addNode(geluidReg);
    knowledgeGraphService.addNode(bodemReg);
    knowledgeGraphService.addNode(parkeernormReg);
    knowledgeGraphService.addNode(groennormReg);

    // ===== 3. SPATIAL UNITS =====
    console.log('📍 Creating Spatial Units...');

    const centrumGebied: SpatialUnit = {
        id: 'spatial-centrum',
        type: 'SpatialUnit',
        name: 'Centrumgebied Amsterdam',
        spatialType: 'Neighborhood',
        description: 'Historisch centrum binnen de grachtengordel'
    };

    const kerkstraatPerceel: SpatialUnit = {
        id: 'spatial-kerkstraat-1',
        type: 'SpatialUnit',
        name: 'Kerkstraat 1',
        spatialType: 'Parcel',
        description: 'Perceel in het centrum, geschikt voor gemengde ontwikkeling'
    };

    knowledgeGraphService.addNode(centrumGebied);
    knowledgeGraphService.addNode(kerkstraatPerceel);

    // ===== 4. LAND USES =====
    console.log('🏘️ Creating Land Uses...');

    const wonenUse: LandUse = {
        id: 'use-wonen',
        type: 'LandUse',
        name: 'Wonen',
        category: 'Wonen',
        description: 'Woonbestemming voor permanente bewoning'
    };

    const gemengdUse: LandUse = {
        id: 'use-gemengd',
        type: 'LandUse',
        name: 'Gemengd Centrum',
        category: 'Gemengd',
        description: 'Combinatie van wonen, werken en voorzieningen'
    };

    knowledgeGraphService.addNode(wonenUse);
    knowledgeGraphService.addNode(gemengdUse);

    // ===== 5. RELATIONSHIPS =====
    console.log('🔗 Creating Relationships...');

    // Regulations defined in documents
    knowledgeGraphService.addEdge(bouwhoogteReg.id, bestemmingsplan.id, RelationType.DEFINED_IN);
    knowledgeGraphService.addEdge(geluidReg.id, bestemmingsplan.id, RelationType.DEFINED_IN);
    knowledgeGraphService.addEdge(bodemReg.id, milieuverordening.id, RelationType.DEFINED_IN);
    knowledgeGraphService.addEdge(parkeernormReg.id, bestemmingsplan.id, RelationType.DEFINED_IN);
    knowledgeGraphService.addEdge(groennormReg.id, omgevingsvisie.id, RelationType.DEFINED_IN);

    // Regulations apply to land uses
    knowledgeGraphService.addEdge(bouwhoogteReg.id, wonenUse.id, RelationType.APPLIES_TO);
    knowledgeGraphService.addEdge(geluidReg.id, wonenUse.id, RelationType.APPLIES_TO);
    knowledgeGraphService.addEdge(parkeernormReg.id, wonenUse.id, RelationType.APPLIES_TO);
    knowledgeGraphService.addEdge(groennormReg.id, gemengdUse.id, RelationType.APPLIES_TO);

    // Regulations apply to spatial units
    knowledgeGraphService.addEdge(geluidReg.id, centrumGebied.id, RelationType.APPLIES_TO);
    knowledgeGraphService.addEdge(bodemReg.id, kerkstraatPerceel.id, RelationType.APPLIES_TO);

    // Spatial hierarchy
    knowledgeGraphService.addEdge(kerkstraatPerceel.id, centrumGebied.id, RelationType.LOCATED_IN);

    // ===== 6. VECTOR DATABASE =====
    console.log('🔍 Populating Vector Database...');

    // Add policy documents to vector database
    await vectorService.addDocument(
        omgevingsvisie.id,
        `${omgevingsvisie.name}. ${omgevingsvisie.description}. Dit document bevat de strategische visie voor Amsterdam, inclusief regels over duurzaamheid, groen, mobiliteit en woningbouw.`,
        {
            title: omgevingsvisie.name,
            type: 'PolicyDocument',
            jurisdiction: omgevingsvisie.jurisdiction,
            date: omgevingsvisie.date,
            sourceUrl: 'https://www.amsterdam.nl/omgevingsvisie',
            url: 'https://www.amsterdam.nl/omgevingsvisie'
        }
    );

    await vectorService.addDocument(
        bestemmingsplan.id,
        `${bestemmingsplan.name}. ${bestemmingsplan.description}. Bevat regels over bouwhoogte, geluid, parkeren en functiemenging in het centrum.`,
        {
            title: bestemmingsplan.name,
            type: 'PolicyDocument',
            jurisdiction: bestemmingsplan.jurisdiction,
            date: bestemmingsplan.date,
            sourceUrl: 'https://www.amsterdam.nl/bestemmingsplan-centrum',
            url: 'https://www.amsterdam.nl/bestemmingsplan-centrum'
        }
    );

    await vectorService.addDocument(
        milieuverordening.id,
        `${milieuverordening.name}. ${milieuverordening.description}. Regelt bodemkwaliteit, grondverontreiniging, luchtkwaliteit en geluid op provinciaal niveau.`,
        {
            title: milieuverordening.name,
            type: 'PolicyDocument',
            jurisdiction: milieuverordening.jurisdiction,
            date: milieuverordening.date,
            sourceUrl: 'https://www.noord-holland.nl/milieuverordening',
            url: 'https://www.noord-holland.nl/milieuverordening'
        }
    );

    // Add regulations to vector database
    await vectorService.addDocument(
        bouwhoogteReg.id,
        `${bouwhoogteReg.name}. ${bouwhoogteReg.description}`,
        {
            title: bouwhoogteReg.name,
            type: 'Regulation',
            category: bouwhoogteReg.category,
            sourceUrl: 'https://www.amsterdam.nl/bestemmingsplan-centrum#bouwhoogte'
        }
    );

    await vectorService.addDocument(
        geluidReg.id,
        `${geluidReg.name}. ${geluidReg.description}`,
        {
            title: geluidReg.name,
            type: 'Regulation',
            category: geluidReg.category,
            sourceUrl: 'https://www.amsterdam.nl/bestemmingsplan-centrum#geluid'
        }
    );

    await vectorService.addDocument(
        bodemReg.id,
        `${bodemReg.name}. ${bodemReg.description}`,
        {
            title: bodemReg.name,
            type: 'Regulation',
            category: bodemReg.category,
            sourceUrl: 'https://www.noord-holland.nl/milieuverordening#bodem'
        }
    );

    await vectorService.addDocument(
        parkeernormReg.id,
        `${parkeernormReg.name}. ${parkeernormReg.description}`,
        {
            title: parkeernormReg.name,
            type: 'Regulation',
            category: parkeernormReg.category,
            sourceUrl: 'https://www.amsterdam.nl/bestemmingsplan-centrum#parkeren'
        }
    );

    await vectorService.addDocument(
        groennormReg.id,
        `${groennormReg.name}. ${groennormReg.description}`,
        {
            title: groennormReg.name,
            type: 'Regulation',
            category: groennormReg.category,
            sourceUrl: 'https://www.amsterdam.nl/omgevingsvisie#groen'
        }
    );

    // Save vector database
    await vectorService.save();

    // ===== 7. VERIFICATION =====
    console.log('\n✅ Verification...');
    const snapshot = await knowledgeGraphService.getGraphSnapshot();
    console.log(`   Knowledge Graph: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges`);

    // Test search
    console.log('\n🔍 Testing Search...');
    const testResults = await hybridSearchService.search('bodem', 3);
    console.log(`   Search for "bodem": ${testResults.documents.length} documents, ${testResults.relatedEntities.length} entities`);

    if (testResults.documents.length > 0) {
        console.log(`   Top result: "${testResults.documents[0].metadata.title}" (score: ${testResults.documents[0].rankScore?.toFixed(2)})`);
    }

    console.log('\n✨ Seeding Complete!\n');
    console.log('You can now search for:');
    console.log('  - "bodem" (soil/ground contamination)');
    console.log('  - "geluid" (noise regulations)');
    console.log('  - "bouwhoogte" (building height)');
    console.log('  - "parkeren" (parking norms)');
    console.log('  - "groen" (green space requirements)');
    console.log('  - "wonen centrum" (residential in city center)');
}

// Run seeder
seedSearchData()
    .then(() => {
        console.log('✅ Seeder completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Seeder failed:', error);
        process.exit(1);
    });
