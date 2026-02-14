/**
 * Migration script: Neo4j Knowledge Graph → GraphDB
 * 
 * This script migrates all knowledge graph data from Neo4j to GraphDB.
 * It exports entities and relationships from Neo4j, converts them to RDF triples,
 * and loads them into GraphDB.
 * 
 * Usage:
 *   tsx src/server/scripts/migrate-neo4j-to-graphdb.ts [--dry-run] [--batch-size=N]
 * 
 * Options:
 *   --dry-run: Validate migration without writing to GraphDB
 *   --batch-size=N: Number of entities to process per batch (default: 100)
 */

import { connectNeo4j } from '../config/neo4j.js';
import { connectGraphDB } from '../config/graphdb.js';
import { GraphDBKnowledgeGraphService } from '../services/knowledge-graph/core/GraphDBKnowledgeGraphService.js';
import { KnowledgeGraphService } from '../services/knowledge-graph/core/KnowledgeGraph.js';
import { BaseEntity, PolicyDocument, Regulation, RelationType } from '../domain/ontology.js';

interface MigrationStats {
  nodesRead: number;
  nodesMigrated: number;
  edgesRead: number;
  edgesMigrated: number;
  errors: Array<{ entityId?: string; sourceId?: string; targetId?: string; error: string }>;
  startTime: Date;
  endTime?: Date;
}

interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
}

/**
 * Convert BaseEntity to RDF Turtle format
 */
function _entityToTurtle(entity: BaseEntity, _graphUri: string): string {
  const entityUri = `http://data.example.org/id/${encodeURIComponent(entity.id)}`;
  const triples: string[] = [];
  
  triples.push(`<${entityUri}> <http://data.example.org/def/kg#id> "${entity.id}" ;`);
  triples.push(`  <http://data.example.org/def/kg#type> "${entity.type}" ;`);
  triples.push(`  <http://www.w3.org/2000/01/rdf-schema#label> "${escapeString(entity.name ?? entity.id)}" .`);
  
  if (entity.description) {
    triples.push(`<${entityUri}> <http://purl.org/dc/terms/description> "${escapeString(entity.description)}" .`);
  }
  
  if (entity.metadata) {
    triples.push(`<${entityUri}> <http://data.example.org/def/kg#metadata> "${escapeString(JSON.stringify(entity.metadata))}" .`);
  }
  
  // Add ELI properties for PolicyDocument
  if (entity.type === 'PolicyDocument') {
    const pd = entity as PolicyDocument;
    if (pd.date) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#date_document> "${pd.date}"^^<http://www.w3.org/2001/XMLSchema#date> .`);
    }
    if (pd.jurisdiction) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#jurisdiction> "${escapeString(pd.jurisdiction)}" .`);
    }
    if (pd.documentType) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#type_document> "${escapeString(pd.documentType)}" .`);
    }
    if (pd.status) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#status> "${escapeString(pd.status)}" .`);
    }
    if (pd.url) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#is_realized_by> <${pd.url}> .`);
    }
  }
  
  // Add ELI properties for Regulation
  if (entity.type === 'Regulation') {
    const reg = entity as Regulation;
    if (reg.category) {
      triples.push(`<${entityUri}> <http://data.europa.eu/eli/ontology#category> "${escapeString(reg.category)}" .`);
    }
  }
  
  return triples.join('\n');
}

/**
 * Convert Relation to RDF Turtle format
 */
function _relationToTurtle(
  sourceId: string,
  targetId: string,
  type: RelationType,
  metadata?: Record<string, unknown>,
  _graphUri: string = 'http://data.example.org/graph/knowledge'
): string {
  const sourceUri = `http://data.example.org/id/${encodeURIComponent(sourceId)}`;
  const targetUri = `http://data.example.org/id/${encodeURIComponent(targetId)}`;
  const relUri = `http://data.example.org/relation/${encodeURIComponent(sourceId)}-${encodeURIComponent(targetId)}-${type}`;
  
  const triples: string[] = [];
  
  triples.push(`<${relUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://data.example.org/def/kg#Relation> ;`);
  triples.push(`  <http://data.example.org/def/kg#source> <${sourceUri}> ;`);
  triples.push(`  <http://data.example.org/def/kg#target> <${targetUri}> ;`);
  triples.push(`  <http://data.example.org/def/kg#relationType> "${type}" .`);
  
  if (metadata) {
    triples.push(`<${relUri}> <http://data.example.org/def/kg#metadata> "${escapeString(JSON.stringify(metadata))}" .`);
  }
  
  // Add ELI relationship property if applicable
  const eliMapping: Record<RelationType, string | null> = {
    [RelationType.DEFINED_IN]: 'http://data.europa.eu/eli/ontology#is_about',
    [RelationType.OVERRIDES]: 'http://data.europa.eu/eli/ontology#replaces',
    [RelationType.REFINES]: 'http://data.europa.eu/eli/ontology#is_amended_by',
    [RelationType.APPLIES_TO]: null,
    [RelationType.CONSTRAINS]: null,
    [RelationType.LOCATED_IN]: null,
    [RelationType.HAS_REQUIREMENT]: 'http://data.europa.eu/eli/ontology#has_part',
    [RelationType.RELATED_TO]: 'http://data.europa.eu/eli/ontology#is_about',
  };
  
  const eliProperty = eliMapping[type];
  if (eliProperty) {
    triples.push(`<${sourceUri}> <${eliProperty}> <${targetUri}> .`);
  }
  
  return triples.join('\n');
}

/**
 * Escape string for Turtle format
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Migrate entities from Neo4j to GraphDB
 */
async function migrateEntities(
  neo4jService: KnowledgeGraphService,
  graphdbService: GraphDBKnowledgeGraphService,
  options: MigrationOptions,
  stats: MigrationStats
): Promise<void> {
  console.log('4️⃣ Migrating entities to GraphDB...');
  
  // Get all entities from Neo4j
  const snapshot = await neo4jService.getGraphSnapshot(1000000); // Large limit to get all
  const entities = snapshot.nodes;
  
  stats.nodesRead = entities.length;
  console.log(`   Found ${entities.length} entities to migrate\n`);
  
  if (entities.length === 0) {
    console.log('   ⚠️  No entities found in Neo4j. Nothing to migrate.');
    return;
  }
  
  // Process in batches
  for (let i = 0; i < entities.length; i += options.batchSize) {
    const batch = entities.slice(i, i + options.batchSize);
    const batchNum = Math.floor(i / options.batchSize) + 1;
    const totalBatches = Math.ceil(entities.length / options.batchSize);
    
    console.log(`   Processing batch ${batchNum}/${totalBatches} (${batch.length} entities)...`);
    
    for (const entity of batch) {
      try {
        if (!options.dryRun) {
          await graphdbService.addNode(entity);
        }
        stats.nodesMigrated++;
        
        if (stats.nodesMigrated % 100 === 0) {
          process.stdout.write(`   Migrated ${stats.nodesMigrated}/${entities.length} entities...\r`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push({
          entityId: entity.id,
          error: `Failed to migrate entity: ${errorMsg}`
        });
        console.error(`\n   ❌ Error migrating entity ${entity.id}:`, errorMsg);
      }
    }
    
    console.log(`\n   ✅ Batch ${batchNum} complete (${stats.nodesMigrated}/${entities.length} entities migrated)`);
  }
  
  console.log(`\n   ✅ Migrated ${stats.nodesMigrated}/${entities.length} entities`);
}

/**
 * Migrate relationships from Neo4j to GraphDB
 */
async function migrateRelationships(
  neo4jService: KnowledgeGraphService,
  graphdbService: GraphDBKnowledgeGraphService,
  options: MigrationOptions,
  stats: MigrationStats
): Promise<void> {
  console.log('\n5️⃣ Migrating relationships to GraphDB...');
  
  // Get all relationships from Neo4j
  const snapshot = await neo4jService.getGraphSnapshot(1000000); // Large limit to get all
  const relationships = snapshot.edges;
  
  stats.edgesRead = relationships.length;
  console.log(`   Found ${relationships.length} relationships to migrate\n`);
  
  if (relationships.length === 0) {
    console.log('   ⚠️  No relationships found in Neo4j. Nothing to migrate.');
    return;
  }
  
  // Process in batches
  for (let i = 0; i < relationships.length; i += options.batchSize) {
    const batch = relationships.slice(i, i + options.batchSize);
    const batchNum = Math.floor(i / options.batchSize) + 1;
    const totalBatches = Math.ceil(relationships.length / options.batchSize);
    
    console.log(`   Processing batch ${batchNum}/${totalBatches} (${batch.length} relationships)...`);
    
    for (const rel of batch) {
      try {
        if (!options.dryRun) {
          await graphdbService.addEdge(rel.sourceId, rel.targetId, rel.type, rel.metadata);
        }
        stats.edgesMigrated++;
        
        if (stats.edgesMigrated % 100 === 0) {
          process.stdout.write(`   Migrated ${stats.edgesMigrated}/${relationships.length} relationships...\r`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          error: `Failed to migrate relationship: ${errorMsg}`
        });
        console.error(`\n   ❌ Error migrating relationship ${rel.sourceId} -> ${rel.targetId}:`, errorMsg);
      }
    }
    
    console.log(`\n   ✅ Batch ${batchNum} complete (${stats.edgesMigrated}/${relationships.length} relationships migrated)`);
  }
  
  console.log(`\n   ✅ Migrated ${stats.edgesMigrated}/${relationships.length} relationships`);
}

/**
 * Main migration function
 */
async function migrate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) || 100 : 100;
  
  const options: MigrationOptions = {
    dryRun,
    batchSize
  };
  
  const stats: MigrationStats = {
    nodesRead: 0,
    nodesMigrated: 0,
    edgesRead: 0,
    edgesMigrated: 0,
    errors: [],
    startTime: new Date()
  };
  
  console.log('🚀 Starting Neo4j → GraphDB migration...\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE: No data will be written to GraphDB\n');
  }
  
  console.log(`   Options: batch-size=${batchSize}, dry-run=${dryRun}\n`);
  
  try {
    // Connect to Neo4j
    console.log('1️⃣ Connecting to Neo4j...');
    const neo4jDriver = await connectNeo4j();
    const neo4jService = new KnowledgeGraphService(neo4jDriver);
    await neo4jService.initialize();
    console.log('   ✅ Connected to Neo4j\n');
    
    // Get Neo4j stats
    console.log('2️⃣ Reading Neo4j statistics...');
    const neo4jStats = await neo4jService.getStats();
    console.log(`   Neo4j: ${neo4jStats.nodeCount} nodes, ${neo4jStats.edgeCount} edges\n`);
    
    if (neo4jStats.nodeCount === 0) {
      console.log('⚠️  No data found in Neo4j. Nothing to migrate.');
      return;
    }
    
    // Connect to GraphDB
    console.log('3️⃣ Connecting to GraphDB...');
    const graphdbClient = await connectGraphDB();
    const graphdbService = new GraphDBKnowledgeGraphService(graphdbClient);
    await graphdbService.initialize();
    console.log('   ✅ Connected to GraphDB\n');
    
    // Check if GraphDB already has data
    const graphdbStats = await graphdbService.getStats();
    if (graphdbStats.nodeCount > 0 || graphdbStats.edgeCount > 0) {
      console.log(`⚠️  GraphDB already contains data: ${graphdbStats.nodeCount} nodes, ${graphdbStats.edgeCount} edges`);
      console.log('   Consider clearing GraphDB first if you want a fresh migration.\n');
    }
    
    // Migrate entities
    await migrateEntities(neo4jService, graphdbService, options, stats);
    
    // Migrate relationships
    await migrateRelationships(neo4jService, graphdbService, options, stats);
    
    // Verify migration
    stats.endTime = new Date();
    const duration = stats.endTime.getTime() - stats.startTime.getTime();
    const durationSeconds = Math.floor(duration / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);
    
    console.log('\n6️⃣ Verifying migration...');
    if (!dryRun) {
      const finalStats = await graphdbService.getStats();
      console.log(`   GraphDB stats: ${finalStats.nodeCount} nodes, ${finalStats.edgeCount} edges`);
      
      if (stats.nodesMigrated === neo4jStats.nodeCount && stats.edgesMigrated === neo4jStats.edgeCount) {
        console.log('   ✅ Migration successful! All data migrated.');
      } else {
        console.warn(`   ⚠️  Migration incomplete. Expected ${neo4jStats.nodeCount} nodes, ${neo4jStats.edgeCount} edges`);
        console.warn(`   Migrated: ${stats.nodesMigrated} nodes, ${stats.edgesMigrated} edges`);
      }
    } else {
      console.log('   ⚠️  Dry run mode: Skipping verification');
    }
    
    // Print summary
    console.log('\n📊 Migration Summary:');
    console.log(`   Duration: ${durationMinutes}m ${durationSeconds % 60}s`);
    console.log(`   Nodes read: ${stats.nodesRead}`);
    console.log(`   Nodes migrated: ${stats.nodesMigrated}`);
    console.log(`   Edges read: ${stats.edgesRead}`);
    console.log(`   Edges migrated: ${stats.edgesMigrated}`);
    console.log(`   Errors: ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      stats.errors.slice(0, 10).forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error.entityId || `${error.sourceId} -> ${error.targetId}`}: ${error.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more errors`);
      }
    }
    
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
