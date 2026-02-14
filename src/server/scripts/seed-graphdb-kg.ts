import { GraphDBKnowledgeGraphService } from '../services/knowledge-graph/core/GraphDBKnowledgeGraphService.js';
import { RelationType } from '../domain/ontology.js';

async function seedGraphDB() {
  const kg = new GraphDBKnowledgeGraphService();
  await kg.initialize();

  // Clear existing sample data
  await kg.clear();

  const doc = {
    id: 'doc-sample-1',
    type: 'PolicyDocument' as const,
    name: 'Sample Omgevingsvisie',
    description: 'Voorbeeld beleidsdocument in GraphDB',
    metadata: { jurisdiction: 'Gemeente Demo' },
  };

  const reg = {
    id: 'reg-sample-1',
    type: 'Regulation' as const,
    name: 'Bouwhoogte Demo',
    description: 'Max 20m',
    metadata: { category: 'Building' },
  };

  const parcel = {
    id: 'spatial-sample-1',
    type: 'SpatialUnit' as const,
    name: 'Kerkstraat 1',
    metadata: { spatialType: 'Parcel' },
  };

  console.log('🌱 Seeding GraphDB knowledge graph...');
  await kg.addNode(doc);
  await kg.addNode(reg);
  await kg.addNode(parcel);
  await kg.addEdge(reg.id, doc.id, RelationType.DEFINED_IN);
  await kg.addEdge(reg.id, parcel.id, RelationType.APPLIES_TO);

  const stats = await kg.getStats();
  console.log(`✅ Seeded GraphDB: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
}

seedGraphDB()
  .then(() => {
    console.log('✅ GraphDB seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ GraphDB seed failed', error);
    process.exit(1);
  });
