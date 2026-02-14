import {
  BaseEntity,
  EntityType,
  Relation,
  RelationType,
  PolicyDocument,
  Regulation,
} from '../domain/ontology.js';
import {
  GraphDBClient,
  connectGraphDB,
} from '../config/graphdb.js';
import { Cache } from './infrastructure/cache.js';
import { LIMITS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { isKnowledgeGraphEntity } from './knowledge-graph/utils/architectureValidation.js';

const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';
const PREFIXES = `
PREFIX kg: <http://data.example.org/def/kg#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
`;

/**
 * Minimal GraphDB-backed knowledge graph service.
 * Implements the subset of operations used by API routes:
 *  - initialize
 *  - addNode / addEdge
 *  - getNode / neighbors / relationships
 *  - getGraphSnapshot / stats / distributions
 * 
 * Optimizations:
 *  - Query caching for read operations
 *  - Optimized SPARQL queries with better patterns
 *  - Query performance tracking
 */
export class GraphDBKnowledgeGraphService {
  private client: GraphDBClient | null;
  private initialized = false;
  private initializationError: Error | null = null;
  private queryCache: Cache<unknown>;
  private queryStats: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();
  private cacheEnabled: boolean;

  constructor(client?: GraphDBClient) {
    this.client = client ?? null;
    // Initialize query cache: 500 queries, 5 minute TTL for read queries
    this.queryCache = new Cache<unknown>(500, 5 * 60 * 1000, 'sparql-queries');
    // Cache can be disabled via environment variable
    this.cacheEnabled = process.env.GRAPHDB_QUERY_CACHE_ENABLED !== 'false';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      if (!this.client) {
        this.client = await connectGraphDB();
      }
      this.initialized = true;
      this.initializationError = null;
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.initialized = false;
      throw error; // Re-throw to allow caller to handle
    }
  }

  private ensureClient(): GraphDBClient {
    if (!this.initialized || this.initializationError) {
      const errorMsg = this.initializationError
        ? `GraphDB client initialization failed: ${this.initializationError.message}. Call initialize() first.`
        : 'GraphDB client not initialized. Call initialize() first.';
      throw new Error(errorMsg);
    }
    if (!this.client) {
      throw new Error('GraphDB client is null after initialization. This should not happen.');
    }
    return this.client;
  }

  private entityUri(id: string): string {
    return `http://data.example.org/id/${encodeURIComponent(id)}`;
  }

  private relationUri(sourceId: string, targetId: string, type: RelationType): string {
    return `http://data.example.org/relation/${encodeURIComponent(sourceId)}-${encodeURIComponent(targetId)}-${type}`;
  }

  private literal(value: string): string {
    return JSON.stringify(value);
  }

  private metadataLiteral(metadata?: Record<string, unknown>): string | null {
    if (!metadata) return null;
    try {
      return JSON.stringify(metadata);
    } catch {
      return null;
    }
  }

  /**
   * Maps entity types to ELI ontology classes
   */
  private getELIClass(entity: BaseEntity): string | null {
    if (entity.type === 'PolicyDocument' || entity.type === 'Regulation') {
      return 'eli:LegalResource';
    }
    return null;
  }

  /**
   * Adds ELI-specific properties for legal entities
   */
  private getELIProperties(entity: BaseEntity): string[] {
    const properties: string[] = [];
    
    // Map PolicyDocument to ELI properties
    if (entity.type === 'PolicyDocument') {
      const policyDoc = entity as PolicyDocument;
      
      // ELI date_document (date of the document)
      if (policyDoc.date) {
        properties.push(`  eli:date_document "${policyDoc.date}"^^xsd:date ;`);
      }
      
      // ELI jurisdiction (jurisdiction where the document applies)
      if (policyDoc.jurisdiction) {
        properties.push(`  eli:jurisdiction ${this.literal(policyDoc.jurisdiction)} ;`);
      }
      
      // ELI document type
      if (policyDoc.documentType) {
        properties.push(`  eli:type_document ${this.literal(policyDoc.documentType)} ;`);
      }
      
      // ELI status
      if (policyDoc.status) {
        properties.push(`  eli:status ${this.literal(policyDoc.status)} ;`);
      }
      
      // ELI URL if available
      if (policyDoc.url) {
        properties.push(`  eli:is_realized_by <${policyDoc.url}> ;`);
      }
    }
    
    // Map Regulation to ELI properties
    if (entity.type === 'Regulation') {
      const regulation = entity as Regulation;
      
      // ELI category
      if (regulation.category) {
        properties.push(`  eli:category ${this.literal(regulation.category)} ;`);
      }
    }
    
    return properties;
  }

  async addNode(node: BaseEntity): Promise<void> {
    // Validate that entity is a knowledge graph entity (not navigation graph)
    if (!isKnowledgeGraphEntity(node)) {
      logger.warn({
        entityId: node.id,
        entityType: node.type,
        service: 'GraphDBKnowledgeGraphService',
        method: 'addNode'
      }, `⚠️  Warning: Entity ${node.id} (type: ${node.type}) is not a knowledge graph entity. ` +
         `GraphDBKnowledgeGraphService should only store knowledge graph entities ` +
         `(PolicyDocument, Regulation, SpatialUnit, LandUse, Requirement). ` +
         `Navigation graph entities belong in Neo4j.`);
      // Continue processing - don't fail, but log warning
    }
    
    const client = this.ensureClient();
    const uri = this.entityUri(node.id);
    const metadataLiteral = this.metadataLiteral(node.metadata);

    const triples: string[] = [
      `<${uri}> kg:id ${this.literal(node.id)} ;`,
      `  kg:type ${this.literal(node.type)} ;`,
      `  rdfs:label ${this.literal(node.name ?? node.id)} ;`,
    ];

    // Add ELI class if applicable
    const eliClass = this.getELIClass(node);
    if (eliClass) {
      triples.push(`  a ${eliClass} ;`);
    }

    // Add ELI properties
    const eliProperties = this.getELIProperties(node);
    triples.push(...eliProperties);

    if (node.description) {
      triples.push(`  dct:description ${this.literal(node.description)} ;`);
    }

    if (metadataLiteral) {
      triples.push(`  kg:metadata ${this.literal(metadataLiteral)} ;`);
    }

    // Remove trailing semicolon and add period
    const lastIndex = triples.length - 1;
    if (triples[lastIndex].endsWith(' ;')) {
      triples[lastIndex] = triples[lastIndex].slice(0, -2) + ' .';
    } else {
      triples[lastIndex] = triples[lastIndex] + ' .';
    }

    const update = `
${PREFIXES}
INSERT DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${triples.join('\n    ')}
  }
}
`;
    await client.update(update);
    
    // Invalidate relevant cache entries
    if (this.cacheEnabled) {
      this.invalidateCacheForEntity(node.id);
      // Also invalidate stats and snapshot caches
      this.queryCache.delete('getStats');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
    }
  }

  /**
   * Add multiple nodes in bulk
   */
  async addNodesBulk(entities: BaseEntity[], branch?: string | null): Promise<{ successful: number; failed: number; errors: string[] }> {
    const client = this.ensureClient();
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches to avoid overwhelming GraphDB
    const batchSize = 100;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const entityUris: string[] = [];
      const insertTriples: string[] = [];
      let batchSuccessfulCount = 0;

      for (const node of batch) {
        try {
          // Validate that entity is a knowledge graph entity (not navigation graph)
          if (!isKnowledgeGraphEntity(node)) {
            logger.warn({
              entityId: node.id,
              entityType: node.type,
              service: 'GraphDBKnowledgeGraphService',
              method: 'addNodesBulk'
            }, `⚠️  Warning: Entity ${node.id} (type: ${node.type}) is not a knowledge graph entity. ` +
               `GraphDBKnowledgeGraphService should only store knowledge graph entities ` +
               `(PolicyDocument, Regulation, SpatialUnit, LandUse, Requirement). ` +
               `Navigation graph entities belong in Neo4j.`);
            // Continue processing - don't fail, but log warning
          }
          
          const uri = this.entityUri(node.id);
          entityUris.push(uri);
          
          // Add branch to metadata if provided (for versioning support)
          let enrichedMetadata = node.metadata || {};
          if (branch !== undefined && branch !== null) {
            enrichedMetadata = { ...enrichedMetadata, branch };
          }
          const metadataLiteral = this.metadataLiteral(enrichedMetadata);
          const eliClass = this.getELIClass(node);
          const eliProperties = this.getELIProperties(node);

          // Build INSERT pattern for the entity (same pattern as addNode)
          const nodeTriples: string[] = [
            `<${uri}> kg:id ${this.literal(node.id)} ;`,
            `  kg:type ${this.literal(node.type)} ;`,
            `  rdfs:label ${this.literal(node.name ?? node.id)} ;`,
          ];

          // Add ELI class if applicable
          if (eliClass) {
            nodeTriples.push(`  a ${eliClass} ;`);
          }

          // Add ELI properties
          nodeTriples.push(...eliProperties);

          if (node.description) {
            nodeTriples.push(`  dct:description ${this.literal(node.description)} ;`);
          }

          if (metadataLiteral) {
            nodeTriples.push(`  kg:metadata ${this.literal(metadataLiteral)} ;`);
          }

          // Remove trailing semicolon and add period
          const lastIndex = nodeTriples.length - 1;
          if (nodeTriples[lastIndex].endsWith(' ;')) {
            nodeTriples[lastIndex] = nodeTriples[lastIndex].slice(0, -2) + ' .';
          } else {
            nodeTriples[lastIndex] = nodeTriples[lastIndex] + ' .';
          }

          insertTriples.push(...nodeTriples);
          batchSuccessfulCount++;
        } catch (error) {
          failed++;
          errors.push(`Failed to process entity ${node.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (entityUris.length > 0 && insertTriples.length > 0) {
        try {
          // Insert the entities in bulk
          const insertQuery = `
${PREFIXES}
INSERT DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${insertTriples.join('\n    ')}
  }
}
`;
          await client.update(insertQuery);
          successful += batchSuccessfulCount;
        } catch (error) {
          failed += batchSuccessfulCount;
          errors.push(`Failed to update batch: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Invalidate cache
    if (this.cacheEnabled) {
      this.queryCache.delete('getStats');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
      for (const node of entities) {
        this.invalidateCacheForEntity(node.id);
      }
    }

    return { successful, failed, errors };
  }

  /**
   * Maps relation types to ELI ontology properties
   */
  private getELIRelationProperty(type: RelationType): string | null {
    const eliMapping: Record<RelationType, string | null> = {
      [RelationType.DEFINED_IN]: 'eli:is_about', // Regulation defined in PolicyDocument
      [RelationType.OVERRIDES]: 'eli:replaces', // One document overrides another
      [RelationType.REFINES]: 'eli:is_amended_by', // One document refines another
      [RelationType.APPLIES_TO]: null, // Not directly mappable to ELI
      [RelationType.CONSTRAINS]: null, // Not directly mappable to ELI
      [RelationType.LOCATED_IN]: null, // Spatial relation, not ELI
      [RelationType.HAS_REQUIREMENT]: 'eli:has_part', // Regulation has requirement
      [RelationType.RELATED_TO]: 'eli:is_about', // General relation
    };
    return eliMapping[type] || null;
  }

  async addEdge(
    sourceId: string,
    targetId: string,
    type: RelationType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const client = this.ensureClient();
    const sourceUri = this.entityUri(sourceId);
    const targetUri = this.entityUri(targetId);
    const relUri = this.relationUri(sourceId, targetId, type);
    const metadataLiteral = this.metadataLiteral(metadata);
    const eliProperty = this.getELIRelationProperty(type);

    const triples: string[] = [
      `<${relUri}> a kg:Relation ;`,
      `  kg:source <${sourceUri}> ;`,
      `  kg:target <${targetUri}> ;`,
      `  kg:relationType ${this.literal(type)} .`,
    ];

    // Add ELI relationship property if applicable (as direct triple between entities)
    if (eliProperty) {
      triples.push(`  <${sourceUri}> ${eliProperty} <${targetUri}> .`);
    }

    if (metadataLiteral) {
      triples.push(`<${relUri}> kg:metadata ${this.literal(metadataLiteral)} .`);
    }

    const update = `
${PREFIXES}
INSERT DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${triples.join('\n    ')}
  }
}
`;
    await client.update(update);
    
    // Invalidate relevant cache entries
    if (this.cacheEnabled) {
      this.invalidateCacheForEntity(sourceId);
      this.invalidateCacheForEntity(targetId);
      // Also invalidate stats and snapshot caches
      this.queryCache.delete('getStats');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
    }
  }

  private rowToEntity(row: Record<string, unknown>): BaseEntity {
    const entity: BaseEntity = {
      id: row.id as string,
      type: row.type as EntityType,
      name: row.name as string,
      description: row.description as string,
      metadata: {},
    };

    if (row.metadata) {
      try {
        const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
        entity.metadata = JSON.parse(metadataStr) as Record<string, unknown>;
      } catch {
        entity.metadata = { rawMetadata: row.metadata };
      }
    }

    return entity;
  }

  async getNode(id: string): Promise<BaseEntity | undefined> {
    // Check cache first
    const cacheKey = `getNode:${id}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching instead of FILTER
    // This allows GraphDB to use indexes more efficiently
    // Also includes ELI properties
    const entityUri = this.entityUri(id);
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> kg:id ?id ;
                   kg:type ?type ;
                   rdfs:label ?name .
    OPTIONAL { <${entityUri}> dct:description ?description }
    OPTIONAL { <${entityUri}> kg:metadata ?metadata }
    OPTIONAL { <${entityUri}> eli:date_document ?dateDocument }
    OPTIONAL { <${entityUri}> eli:jurisdiction ?jurisdiction }
    OPTIONAL { <${entityUri}> eli:type_document ?typeDocument }
    OPTIONAL { <${entityUri}> eli:status ?status }
    OPTIONAL { <${entityUri}> eli:category ?category }
    OPTIONAL { <${entityUri}> eli:is_realized_by ?url }
  }
}
LIMIT 1
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNode', queryTime);
    
    if (!results.length) {
      // Cache negative results with shorter TTL (1 minute)
      if (this.cacheEnabled) {
        await this.queryCache.set(cacheKey, undefined, 60 * 1000);
      }
      return undefined;
    }
    
    const entity = this.rowToEntity(results[0]);
    
    // Add ELI properties to metadata if present
    const row = results[0];
    if (row.dateDocument || row.jurisdiction || row.typeDocument || row.status || row.category || row.url) {
      if (!entity.metadata) {
        entity.metadata = {};
      }
      if (row.dateDocument) entity.metadata.eli_date_document = row.dateDocument;
      if (row.jurisdiction) entity.metadata.eli_jurisdiction = row.jurisdiction;
      if (row.typeDocument) entity.metadata.eli_type_document = row.typeDocument;
      if (row.status) entity.metadata.eli_status = row.status;
      if (row.category) entity.metadata.eli_category = row.category;
      if (row.url) entity.metadata.eli_url = row.url;
      
      // For PolicyDocument, map ELI properties to entity fields
      if (entity.type === 'PolicyDocument') {
        const policyDoc = entity as PolicyDocument;
        if (row.dateDocument) policyDoc.date = row.dateDocument;
        if (row.jurisdiction) policyDoc.jurisdiction = row.jurisdiction;
        if (row.typeDocument) {
          const docType = row.typeDocument as string;
          if (docType === 'Structure' || docType === 'Vision' || docType === 'Ordinance' || docType === 'Note') {
            policyDoc.documentType = docType as PolicyDocument['documentType'];
          }
        }
        if (row.status) {
          const status = row.status as string;
          if (status === 'Draft' || status === 'Active' || status === 'Archived') {
            policyDoc.status = status as PolicyDocument['status'];
          }
        }
        if (row.url) policyDoc.url = row.url;
      }
      
      // For Regulation, map ELI properties to entity fields
      if (entity.type === 'Regulation') {
        const regulation = entity as Regulation;
        if (row.category) {
          const category = row.category as string;
          if (category === 'Zoning' || category === 'Environmental' || category === 'Building' || category === 'Procedural') {
            regulation.category = category as Regulation['category'];
          }
        }
      }
    }
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entity);
    }
    
    return entity;
  }

  async getGraphSnapshot(limit: number = LIMITS.GRAPH_SNAPSHOT_DEFAULT): Promise<{ nodes: BaseEntity[]; edges: Relation[] }> {
    // Check cache first (with limit as part of key)
    const cacheKey = `getGraphSnapshot:${limit}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as { nodes: BaseEntity[]; edges: Relation[] };
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    // Optimized queries: Use more efficient patterns
    const nodeQuery = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s kg:metadata ?metadata }
  }
}
LIMIT ${limit}
`;

    const edgeQuery = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation ;
         kg:source ?s ;
         kg:target ?t ;
         kg:relationType ?relationType .
    ?s kg:id ?sourceId .
    ?t kg:id ?targetId .
    OPTIONAL { ?rel kg:metadata ?metadata }
  }
}
LIMIT ${limit}
`;

    const [nodeResults, edgeResults] = await Promise.all([
      client.query(nodeQuery),
      client.query(edgeQuery),
    ]);
    
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getGraphSnapshot', queryTime);

    const nodes = nodeResults.map((row) => this.rowToEntity(row));
    const edges: Relation[] = edgeResults.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));

    const result = { nodes, edges };
    
    // Cache result with shorter TTL for snapshots (3 minutes)
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, result, 3 * 60 * 1000);
    }
    
    return result;
  }

  async getNeighbors(id: string, relationType?: RelationType): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = `getNeighbors:${id}:${relationType || 'all'}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching and move FILTER to WHERE clause for better performance
    const sourceUri = this.entityUri(id);
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation ;
         kg:source <${sourceUri}> ;
         kg:target ?t ;
         ${relationType ? `kg:relationType ${this.literal(relationType)} ;` : 'kg:relationType ?relType ;'}
         .
    <${sourceUri}> kg:id ${this.literal(id)} .
    ?t kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?t dct:description ?description }
    OPTIONAL { ?t kg:metadata ?metadata }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNeighbors', queryTime);
    
    const entities = results.map((row) => this.rowToEntity(row));
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities);
    }
    
    return entities;
  }

  async getIncomingNeighbors(id: string, relationType?: RelationType): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = `getIncomingNeighbors:${id}:${relationType || 'all'}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching
    const targetUri = this.entityUri(id);
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation ;
         kg:source ?s ;
         kg:target <${targetUri}> ;
         ${relationType ? `kg:relationType ${this.literal(relationType)} ;` : 'kg:relationType ?relType ;'}
         .
    <${targetUri}> kg:id ${this.literal(id)} .
    ?s kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s kg:metadata ?metadata }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getIncomingNeighbors', queryTime);
    
    const entities = results.map((row) => this.rowToEntity(row));
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities);
    }
    
    return entities;
  }

  async searchEntities(keywords: string[]): Promise<BaseEntity[]> {
    const client = this.ensureClient();
    if (!keywords.length) return [];
    
    // Check cache first
    const cacheKey = `searchEntities:${keywords.sort().join(',')}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const startTime = Date.now();
    
    // Optimized query: Use regex with case-insensitive flag for better performance
    // GraphDB can optimize regex better than CONTAINS in some cases
    const lowered = keywords.map((k) => k.toLowerCase());
    const filter = lowered
      .map((kw) => `REGEX(?name, ${this.literal(kw)}, "i")`)
      .join(' || ');

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s kg:metadata ?metadata }
    FILTER(${filter})
  }
}
LIMIT 50
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('searchEntities', queryTime);
    
    const entities = results.map((row) => this.rowToEntity(row));
    
    // Cache result with shorter TTL for search queries (2 minutes)
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities, 2 * 60 * 1000);
    }
    
    return entities;
  }

  async getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    // Check cache first
    const cacheKey = `getRelationshipsForEntity:${entityId}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as Array<{ sourceId: string; targetId: string; type: RelationType }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching instead of FILTER
    const sourceUri = this.entityUri(entityId);
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation ;
         kg:source <${sourceUri}> ;
         kg:target ?t ;
         kg:relationType ?relationType .
    <${sourceUri}> kg:id ?sourceId .
    ?t kg:id ?targetId .
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getRelationshipsForEntity', queryTime);
    
    const relationships = results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, relationships);
    }
    
    return relationships;
  }

  async getIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    // Check cache first
    const cacheKey = `getIncomingRelationships:${entityId}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as Array<{ sourceId: string; targetId: string; type: RelationType }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching instead of FILTER
    const targetUri = this.entityUri(entityId);
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation ;
         kg:source ?s ;
         kg:target <${targetUri}> ;
         kg:relationType ?relationType .
    ?s kg:id ?sourceId .
    <${targetUri}> kg:id ?targetId .
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getIncomingRelationships', queryTime);
    
    const relationships = results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, relationships);
    }
    
    return relationships;
  }

  async getEntityTypeDistribution(): Promise<Record<string, number>> {
    const client = this.ensureClient();
    const query = `
${PREFIXES}
SELECT ?type (COUNT(*) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s kg:type ?type .
  }
}
GROUP BY ?type
`;
    const results = await client.query(query);
    const distribution: Record<string, number> = {};
    results.forEach((row) => {
      distribution[row.type] = parseInt(row.count, 10);
    });
    return distribution;
  }

  async getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
    // Check cache first (stats change less frequently)
    const cacheKey = 'getStats';
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as { nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> };
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized queries: Use COUNT DISTINCT for accuracy
    const nodeQuery = `
${PREFIXES}
SELECT (COUNT(DISTINCT ?s) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s kg:id ?id .
  }
}
`;
    const edgeQuery = `
${PREFIXES}
SELECT (COUNT(DISTINCT ?rel) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a kg:Relation .
  }
}
`;

    const [nodeResults, edgeResults, typeDistribution] = await Promise.all([
      client.query(nodeQuery),
      client.query(edgeQuery),
      this.getEntityTypeDistribution(),
    ]);
    
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getStats', queryTime);

    const nodeCount = nodeResults[0]?.count ? parseInt(nodeResults[0].count, 10) : 0;
    const edgeCount = edgeResults[0]?.count ? parseInt(edgeResults[0].count, 10) : 0;

    const result = { nodeCount, edgeCount, typeDistribution };
    
    // Cache stats with longer TTL (10 minutes) since they change less frequently
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, result, 10 * 60 * 1000);
    }
    
    return result;
  }

  async clear(): Promise<void> {
    const client = this.ensureClient();
    const update = `
${PREFIXES}
CLEAR GRAPH <${KG_GRAPH_URI}>
`;
    await client.update(update);
    
    // Clear query cache when graph is cleared
    if (this.cacheEnabled) {
      this.queryCache.clear();
    }
  }

  /**
   * Track query performance for benchmarking
   */
  private trackQueryPerformance(queryName: string, queryTime: number): void {
    const stats = this.queryStats.get(queryName) || { count: 0, totalTime: 0, avgTime: 0 };
    stats.count++;
    stats.totalTime += queryTime;
    stats.avgTime = stats.totalTime / stats.count;
    this.queryStats.set(queryName, stats);
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(): Map<string, { count: number; totalTime: number; avgTime: number }> {
    return new Map(this.queryStats);
  }

  /**
   * Reset query performance statistics
   */
  resetQueryStats(): void {
    this.queryStats.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate?: number } {
    return this.queryCache.getStats();
  }

  /**
   * Clear query cache
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  /**
   * Invalidate cache entries for a specific entity
   */
  private invalidateCacheForEntity(entityId: string): void {
    if (!this.cacheEnabled) return;
    
    // Delete specific cache entries for this entity
    this.queryCache.delete(`getNode:${entityId}`);
    this.queryCache.delete(`getNeighbors:${entityId}:all`);
    this.queryCache.delete(`getIncomingNeighbors:${entityId}:all`);
    this.queryCache.delete(`getRelationshipsForEntity:${entityId}`);
    this.queryCache.delete(`getIncomingRelationships:${entityId}`);
    
    // Note: We can't easily invalidate all relationType-specific caches without iterating
    // In production, consider using a more sophisticated cache with pattern invalidation
  }

  /**
   * Invalidate cache entries matching a pattern (e.g., when entities are updated)
   */
  invalidateCache(pattern?: string): void {
    if (!this.cacheEnabled) return;
    
    if (pattern) {
      // Clear entries matching pattern
      // Note: Cache doesn't support pattern matching directly, so we clear all
      // In production, consider using a more sophisticated cache with pattern invalidation
      this.queryCache.clear();
    } else {
      this.queryCache.clear();
    }
  }

  // ===== ELI Query Support Methods =====

  /**
   * Query legal resources by ELI jurisdiction
   * @param jurisdiction The jurisdiction to filter by
   * @returns Array of legal resources (PolicyDocument or Regulation) in the specified jurisdiction
   */
  async queryByELIJurisdiction(jurisdiction: string): Promise<BaseEntity[]> {
    const cacheKey = `queryByELIJurisdiction:${jurisdiction}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s a eli:LegalResource ;
       kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name ;
       eli:jurisdiction ${this.literal(jurisdiction)} .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s kg:metadata ?metadata }
    OPTIONAL { ?s eli:date_document ?dateDocument }
    OPTIONAL { ?s eli:type_document ?typeDocument }
    OPTIONAL { ?s eli:status ?status }
    OPTIONAL { ?s eli:category ?category }
    OPTIONAL { ?s eli:is_realized_by ?url }
  }
}
LIMIT 100
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('queryByELIJurisdiction', queryTime);

    const entities = results.map((row) => {
      const entity = this.rowToEntity(row);
      // Map ELI properties
      if (row.dateDocument || row.jurisdiction || row.typeDocument || row.status || row.category || row.url) {
        if (!entity.metadata) entity.metadata = {};
        if (row.dateDocument) entity.metadata.eli_date_document = row.dateDocument;
        if (row.jurisdiction) entity.metadata.eli_jurisdiction = row.jurisdiction;
        if (row.typeDocument) entity.metadata.eli_type_document = row.typeDocument;
        if (row.status) entity.metadata.eli_status = row.status;
        if (row.category) entity.metadata.eli_category = row.category;
        if (row.url) entity.metadata.eli_url = row.url;
      }
      return entity;
    });

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities, 5 * 60 * 1000);
    }

    return entities;
  }

  /**
   * Query legal resources by ELI date range
   * @param startDate Start date (ISO format)
   * @param endDate End date (ISO format, optional)
   * @returns Array of legal resources within the date range
   */
  async queryByELIDateRange(startDate: string, endDate?: string): Promise<BaseEntity[]> {
    const cacheKey = `queryByELIDateRange:${startDate}:${endDate || 'none'}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    const dateFilter = endDate
      ? `FILTER(?dateDocument >= "${startDate}"^^xsd:date && ?dateDocument <= "${endDate}"^^xsd:date)`
      : `FILTER(?dateDocument >= "${startDate}"^^xsd:date)`;

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s a eli:LegalResource ;
       kg:id ?id ;
       kg:type ?type ;
       rdfs:label ?name ;
       eli:date_document ?dateDocument .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s kg:metadata ?metadata }
    OPTIONAL { ?s eli:jurisdiction ?jurisdiction }
    OPTIONAL { ?s eli:type_document ?typeDocument }
    OPTIONAL { ?s eli:status ?status }
    OPTIONAL { ?s eli:category ?category }
    OPTIONAL { ?s eli:is_realized_by ?url }
    ${dateFilter}
  }
}
ORDER BY ?dateDocument
LIMIT 100
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('queryByELIDateRange', queryTime);

    const entities = results.map((row) => {
      const entity = this.rowToEntity(row);
      // Map ELI properties
      if (row.dateDocument || row.jurisdiction || row.typeDocument || row.status || row.category || row.url) {
        if (!entity.metadata) entity.metadata = {};
        if (row.dateDocument) entity.metadata.eli_date_document = row.dateDocument;
        if (row.jurisdiction) entity.metadata.eli_jurisdiction = row.jurisdiction;
        if (row.typeDocument) entity.metadata.eli_type_document = row.typeDocument;
        if (row.status) entity.metadata.eli_status = row.status;
        if (row.category) entity.metadata.eli_category = row.category;
        if (row.url) entity.metadata.eli_url = row.url;
      }
      return entity;
    });

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities, 5 * 60 * 1000);
    }

    return entities;
  }

  /**
   * Query legal resources by ELI relationship (e.g., documents that replace or amend others)
   * @param relationshipType ELI relationship type (e.g., 'eli:replaces', 'eli:is_amended_by')
   * @param entityId The entity ID to find relationships for
   * @returns Array of related legal resources
   */
  async queryByELIRelationship(relationshipType: string, entityId: string): Promise<BaseEntity[]> {
    const cacheKey = `queryByELIRelationship:${relationshipType}:${entityId}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    const entityUri = this.entityUri(entityId);

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> ${relationshipType} ?related .
    ?related a eli:LegalResource ;
             kg:id ?id ;
             kg:type ?type ;
             rdfs:label ?name .
    OPTIONAL { ?related dct:description ?description }
    OPTIONAL { ?related kg:metadata ?metadata }
    OPTIONAL { ?related eli:date_document ?dateDocument }
    OPTIONAL { ?related eli:jurisdiction ?jurisdiction }
    OPTIONAL { ?related eli:type_document ?typeDocument }
    OPTIONAL { ?related eli:status ?status }
    OPTIONAL { ?related eli:category ?category }
    OPTIONAL { ?related eli:is_realized_by ?url }
  }
}
LIMIT 100
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('queryByELIRelationship', queryTime);

    const entities = results.map((row) => {
      const entity = this.rowToEntity(row);
      // Map ELI properties
      if (row.dateDocument || row.jurisdiction || row.typeDocument || row.status || row.category || row.url) {
        if (!entity.metadata) entity.metadata = {};
        if (row.dateDocument) entity.metadata.eli_date_document = row.dateDocument;
        if (row.jurisdiction) entity.metadata.eli_jurisdiction = row.jurisdiction;
        if (row.typeDocument) entity.metadata.eli_type_document = row.typeDocument;
        if (row.status) entity.metadata.eli_status = row.status;
        if (row.category) entity.metadata.eli_category = row.category;
        if (row.url) entity.metadata.eli_url = row.url;
      }
      return entity;
    });

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities, 5 * 60 * 1000);
    }

    return entities;
  }
}
