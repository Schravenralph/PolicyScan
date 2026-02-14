import {
  BaseEntity,
  EntityType,
  Relation,
  RelationType,
  PolicyDocument,
  Regulation,
  SpatialUnit,
  LandUse,
  Requirement,
  BELEID_RELATION_MAPPING,
  BELEID_CLASS_MAPPING,
} from '../../../domain/ontology.js';
import {
  GraphDBClient,
  connectGraphDB,
} from '../../../config/graphdb.js';
import { Cache } from '../../infrastructure/cache.js';
import { LIMITS } from '../../../config/constants.js';
import { KnowledgeGraphServiceInterface, NeighborCounts } from '../../knowledge-graph/core/KnowledgeGraphInterface.js';
import { logger } from '../../../utils/logger.js';
import { escapeRegex } from '../../../utils/regexUtils.js';
import { isKnowledgeGraphEntity } from '../../knowledge-graph/utils/architectureValidation.js';
import { GraphDBInferenceEngine } from '../../knowledge-graph/inference/GraphDBInferenceEngine.js';
import type { InferenceOptions, InferenceResult } from '../../knowledge-graph/inference/GraphDBInferenceEngine.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { BELEID_NAMESPACE, KG_NAMESPACE, PREFIXES } from '../../knowledge-graph/sparql/constants.js';
import { entityUri, relationUri, literal } from '../../knowledge-graph/sparql/utils.js';

const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';

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
export class GraphDBKnowledgeGraphService implements KnowledgeGraphServiceInterface {
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


  private metadataLiteral(metadata?: Record<string, unknown>): string | null {
    if (!metadata) return null;
    try {
      return JSON.stringify(metadata);
    } catch {
      return null;
    }
  }

  /**
   * Helper to add a property triple if the value is defined
   */
  private addProperty(
    properties: string[],
    predicate: string,
    value: unknown,
    transform?: (val: any) => string
  ): void {
    if (value !== undefined && value !== null) {
      const formattedValue = transform ? transform(value) : literal(String(value));
      properties.push(`  ${predicate} ${formattedValue} ;`);
    }
  }

  /**
   * Maps entity types to Beleidsscan ontology classes
   */
  private getBeleidClass(entity: BaseEntity): string {
    return BELEID_CLASS_MAPPING[entity.type] || 'beleid:Concept';
  }

  /**
   * Maps entity types to ELI ontology classes (for compatibility)
   */
  private getELIClass(entity: BaseEntity): string | null {
    if (entity.type === 'PolicyDocument' || entity.type === 'Regulation') {
      return 'eli:LegalResource';
    }
    return null;
  }

  /**
   * Adds Beleidsscan-specific properties for entities
   */
  private getBeleidProperties(entity: BaseEntity): string[] {
    const properties: string[] = [];
    
    // Map PolicyDocument to beleid: properties
    if (entity.type === 'PolicyDocument') {
      const policyDoc = entity as PolicyDocument;
      this.addProperty(properties, 'beleid:documentType', policyDoc.documentType);
      this.addProperty(properties, 'beleid:jurisdiction', policyDoc.jurisdiction);
      this.addProperty(properties, 'beleid:status', policyDoc.status);
      this.addProperty(properties, 'schema:url', policyDoc.url, (url) => `<${url}>`);
      this.addProperty(properties, 'schema:datePublished', policyDoc.date, (date) => `"${date}"^^xsd:date`);
      this.addProperty(properties, 'beleid:hierarchyLevel', policyDoc.hierarchy?.level);
    }
    
    // Map Regulation to beleid: properties
    if (entity.type === 'Regulation') {
      const regulation = entity as Regulation;
      this.addProperty(properties, 'beleid:category', regulation.category);
    }
    
    // Map SpatialUnit to beleid: properties
    if (entity.type === 'SpatialUnit') {
      const spatialUnit = entity as SpatialUnit;
      this.addProperty(properties, 'beleid:spatialType', spatialUnit.spatialType);
      this.addProperty(properties, 'beleid:geometry', spatialUnit.geometry, (geo) => literal(JSON.stringify(geo)));
    }
    
    // Map LandUse to beleid: properties
    if (entity.type === 'LandUse') {
      const landUse = entity as LandUse;
      this.addProperty(properties, 'beleid:landUseCategory', landUse.category);
    }
    
    // Map Requirement to beleid: properties
    if (entity.type === 'Requirement') {
      const requirement = entity as Requirement;
      this.addProperty(properties, 'beleid:metric', requirement.metric);
      this.addProperty(properties, 'beleid:operator', requirement.operator);
      this.addProperty(properties, 'beleid:value', requirement.value, (v) => literal(String(v)));
      this.addProperty(properties, 'beleid:unit', requirement.unit);
    }
    
    return properties;
  }

  /**
   * Adds ELI-specific properties for legal entities (for compatibility)
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
        properties.push(`  eli:jurisdiction ${literal(policyDoc.jurisdiction)} ;`);
      }
      
      // ELI document type
      if (policyDoc.documentType) {
        properties.push(`  eli:type_document ${literal(policyDoc.documentType)} ;`);
      }
      
      // ELI status
      if (policyDoc.status) {
        properties.push(`  eli:status ${literal(policyDoc.status)} ;`);
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
        properties.push(`  eli:category ${literal(regulation.category)} ;`);
      }
    }
    
    return properties;
  }

  async addNode(node: BaseEntity, ...args: unknown[]): Promise<void> {
    // Support optional branch parameter for versioning (not in interface for backward compatibility)
    const branch = args[0] as string | null | undefined;
    
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
    const uri = entityUri(node.id);
    
    // Add branch to metadata if provided (for versioning support)
    let enrichedMetadata = node.metadata || {};
    if (branch !== undefined && branch !== null) {
      enrichedMetadata = { ...enrichedMetadata, branch };
    }
    const metadataLiteral = this.metadataLiteral(enrichedMetadata);

    const triples: string[] = [
      `<${uri}> a ${this.getBeleidClass(node)} ;`,
      `  beleid:id ${literal(node.id)} ;`,
      `  beleid:type ${literal(node.type)} ;`,
      `  rdfs:label ${literal(node.name ?? node.id)} ;`,
    ];

    // Add ELI class if applicable (for compatibility)
    const eliClass = this.getELIClass(node);
    if (eliClass) {
      triples.push(`  a ${eliClass} ;`);
    }

    // Add Beleidsscan-specific properties
    const beleidProperties = this.getBeleidProperties(node);
    triples.push(...beleidProperties);

    // Add ELI properties (for compatibility)
    const eliProperties = this.getELIProperties(node);
    triples.push(...eliProperties);

    if (node.description) {
      triples.push(`  dct:description ${literal(node.description)} ;`);
    }

    if (node.uri) {
      triples.push(`  schema:identifier <${node.uri}> ;`);
    }

    if (metadataLiteral) {
      // metadataLiteral is already a JSON string, use it directly (don't double-stringify)
      triples.push(`  beleid:metadata "${metadataLiteral.replace(/"/g, '\\"')}" ;`);
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
      // Also invalidate stats, snapshot, and distribution caches
      this.queryCache.delete('getStats');
      this.queryCache.delete('getDomainDistribution');
      this.queryCache.delete('getJurisdictionDistribution');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
    }
  }

  /**
   * Maps relation types to Beleidsscan ontology properties
   */
  private getBeleidRelationProperty(type: RelationType): string {
    return BELEID_RELATION_MAPPING[type] || 'beleid:relatedTo';
  }

  /**
   * Maps relation types to ELI ontology properties (for compatibility)
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
    ...args: unknown[]
  ): Promise<void> {
    // Support optional branch parameter for versioning (not in interface for backward compatibility)
    const branch = args[0] as string | null | undefined;
    const client = this.ensureClient();
    const sourceUri = entityUri(sourceId);
    const targetUri = entityUri(targetId);
    const relUri = relationUri(sourceId, targetId, type);
    
    // Add branch to metadata if provided (for versioning support)
    let enrichedMetadata = metadata || {};
    if (branch !== undefined && branch !== null) {
      enrichedMetadata = { ...enrichedMetadata, branch };
    }
    const metadataLiteral = this.metadataLiteral(enrichedMetadata);
    const beleidProperty = this.getBeleidRelationProperty(type);
    const eliProperty = this.getELIRelationProperty(type);

    const triples: string[] = [
      // Direct relationship using beleid: property (primary)
      `<${sourceUri}> ${beleidProperty} <${targetUri}> .`,
    ];

    // Add reified relationship for metadata tracking
    if (metadataLiteral) {
      triples.push(
        `<${relUri}> a beleid:Relation ;`,
        `  beleid:source <${sourceUri}> ;`,
        `  beleid:target <${targetUri}> ;`,
        `  beleid:relationType ${literal(type)} ;`,
        `  beleid:metadata "${metadataLiteral.replace(/"/g, '\\"')}" .`,
      );
    }

    // Add ELI relationship property if applicable (for compatibility)
    if (eliProperty) {
      triples.push(`<${sourceUri}> ${eliProperty} <${targetUri}> .`);
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
      // Also invalidate stats, snapshot, and distribution caches
      this.queryCache.delete('getStats');
      this.queryCache.delete('getDomainDistribution');
      this.queryCache.delete('getJurisdictionDistribution');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
    }
  }

  /**
   * Delete an edge (relationship) between two entities
   */
  async deleteEdge(
    sourceId: string,
    targetId: string,
    type: RelationType
  ): Promise<void> {
    const client = this.ensureClient();
    const sourceUri = entityUri(sourceId);
    const targetUri = entityUri(targetId);
    const relUri = relationUri(sourceId, targetId, type);
    const beleidProperty = this.getBeleidRelationProperty(type);
    const eliProperty = this.getELIRelationProperty(type);

    // Build DELETE query to remove:
    // 1. Direct property triple (e.g., beleid:relatedTo)
    // 2. Reified relationship triple (beleid:Relation)
    // 3. ELI property triple if applicable
    const deletePatterns: string[] = [
      `<${sourceUri}> ${beleidProperty} <${targetUri}> .`,
      `<${relUri}> ?p ?o .`, // Delete all properties of the reified relation
    ];

    if (eliProperty) {
      deletePatterns.push(`<${sourceUri}> ${eliProperty} <${targetUri}> .`);
    }

    const update = `
${PREFIXES}
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    ${deletePatterns.join('\n    ')}
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ${deletePatterns.join('\n    ')}
  }
}
`;
    await client.update(update);
    
    // Invalidate relevant cache entries
    if (this.cacheEnabled) {
      this.invalidateCacheForEntity(sourceId);
      this.invalidateCacheForEntity(targetId);
      // Also invalidate stats, snapshot, and distribution caches
      this.queryCache.delete('getStats');
      this.queryCache.delete('getDomainDistribution');
      this.queryCache.delete('getJurisdictionDistribution');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
    }
  }

  /**
   * Delete multiple edges in bulk
   */
  async deleteEdgesBulk(
    edges: Array<{ sourceId: string; targetId: string; type: RelationType }>
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    const client = this.ensureClient();
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    if (edges.length === 0) return { successful, failed, errors };

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);

      const directDeletePatterns: string[] = [];
      const reifiedRelUris: string[] = [];
      const currentBatchEdges: typeof batch = [];

      for (const edge of batch) {
        try {
          const { sourceId, targetId, type } = edge;
          const sourceUri = entityUri(sourceId);
          const targetUri = entityUri(targetId);
          const relUri = relationUri(sourceId, targetId, type);
          const beleidProperty = this.getBeleidRelationProperty(type);
          const eliProperty = this.getELIRelationProperty(type);

          // Direct triples
          directDeletePatterns.push(`<${sourceUri}> ${beleidProperty} <${targetUri}> .`);
          if (eliProperty) {
            directDeletePatterns.push(`<${sourceUri}> ${eliProperty} <${targetUri}> .`);
          }

          // Reified relation URI for separate deletion
          reifiedRelUris.push(relUri);
          currentBatchEdges.push(edge);
        } catch (error) {
          failed++;
          errors.push(`Failed to process edge deletion ${edge.sourceId}->${edge.targetId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (currentBatchEdges.length > 0) {
        // Track success of each part independently to avoid "all failed" reporting if one part succeeds
        let directSuccess = true;
        let reifiedSuccess = true;

        // 1. Delete direct triples using DELETE DATA (faster)
        if (directDeletePatterns.length > 0) {
          try {
            const updateDirect = `
${PREFIXES}
DELETE DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${directDeletePatterns.join('\n    ')}
  }
}
`;
            await client.update(updateDirect);
          } catch (error) {
            directSuccess = false;
            errors.push(`Failed to delete direct triples in batch: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // 2. Delete reified relations using DELETE WHERE with VALUES
        if (reifiedRelUris.length > 0) {
          try {
            const relUriValues = reifiedRelUris.map(uri => `<${uri}>`).join(' ');
            const updateReified = `
${PREFIXES}
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel ?p ?o .
  }
}
WHERE {
  VALUES ?rel { ${relUriValues} }
  GRAPH <${KG_GRAPH_URI}> {
    ?rel ?p ?o .
  }
}
`;
            await client.update(updateReified);
          } catch (error) {
            reifiedSuccess = false;
            errors.push(`Failed to delete reified relations in batch: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // If at least direct deletion succeeded, we count it as successful for functional purposes (link is gone)
        // Reified metadata lingering is a minor issue compared to "relationship still exists" or "data loss on re-add"
        if (directSuccess) {
          successful += currentBatchEdges.length;
          if (!reifiedSuccess) {
             logger.warn({ count: currentBatchEdges.length }, 'Direct relationship deletion succeeded but reified metadata deletion failed');
          }
        } else {
          failed += currentBatchEdges.length;
          // Errors already pushed
        }
      }
    }

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache();
    }

    return { successful, failed, errors };
  }

  private mapELIProperties(entity: BaseEntity, row: Record<string, unknown>): void {
    // Add ELI properties to metadata if present
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
        if (row.dateDocument) policyDoc.date = String(row.dateDocument);
        if (row.jurisdiction) policyDoc.jurisdiction = String(row.jurisdiction);
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
        if (row.url) policyDoc.url = String(row.url);
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
    const uri = entityUri(id);
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${uri}> beleid:id ?id ;
                   beleid:type ?type ;
                   rdfs:label ?name .
    OPTIONAL { <${uri}> dct:description ?description }
    OPTIONAL { <${uri}> beleid:metadata ?metadata }
    OPTIONAL { <${uri}> eli:date_document ?dateDocument }
    OPTIONAL { <${uri}> eli:jurisdiction ?jurisdiction }
    OPTIONAL { <${uri}> eli:type_document ?typeDocument }
    OPTIONAL { <${uri}> eli:status ?status }
    OPTIONAL { <${uri}> eli:category ?category }
    OPTIONAL { <${uri}> eli:is_realized_by ?url }
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
    this.mapELIProperties(entity, results[0]);
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entity);
    }

    return entity;
  }

  async getNodes(ids: string[]): Promise<(BaseEntity | undefined)[]> {
    if (ids.length === 0) return [];

    const resultsMap = new Map<string, BaseEntity>();
    const missingIds: string[] = [];

    // Check cache first
    if (this.cacheEnabled) {
      const cacheKeys = ids.map(id => `getNode:${id}`);
      const cachedValues = await this.queryCache.mget(cacheKeys);

      cachedValues.forEach((cached, index) => {
        const id = ids[index];
        if (cached !== undefined && cached !== null) {
          resultsMap.set(id, cached as BaseEntity);
        } else {
          // If we can't distinguish miss from cached undefined, we assume miss for safety
          // Or we trust that undefined means negative cache.
          // However, getNode logic suggests undefined is treated as miss or handled specifically.
          // To be safe and consistent with getNode, we query if we don't get a BaseEntity.
          missingIds.push(id);
        }
      });
    } else {
      missingIds.push(...ids);
    }

    if (missingIds.length > 0) {
      const client = this.ensureClient();
      const startTime = Date.now();
      
      const valuesBody = missingIds.map(id => literal(id)).join(' ');

      const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  VALUES ?id { ${valuesBody} }
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
    OPTIONAL { ?s eli:date_document ?dateDocument }
    OPTIONAL { ?s eli:jurisdiction ?jurisdiction }
    OPTIONAL { ?s eli:type_document ?typeDocument }
    OPTIONAL { ?s eli:status ?status }
    OPTIONAL { ?s eli:category ?category }
    OPTIONAL { ?s eli:is_realized_by ?url }
  }
}
`;
      const results = await client.query(query);
      const queryTime = Date.now() - startTime;
      this.trackQueryPerformance('getNodes', queryTime);

      for (const row of results) {
        const entity = this.rowToEntity(row);
        this.mapELIProperties(entity, row);

        resultsMap.set(entity.id, entity);

        // Cache result
        if (this.cacheEnabled) {
          await this.queryCache.set(`getNode:${entity.id}`, entity);
        }
      }
      
      // Cache negative results for missing IDs
      if (this.cacheEnabled) {
        for (const id of missingIds) {
          if (!resultsMap.has(id)) {
             await this.queryCache.set(`getNode:${id}`, undefined, 60 * 1000);
          }
        }
      }
    }
    
    return ids.map(id => resultsMap.get(id));
  }

  async getGraphSnapshot(limit: number = LIMITS.GRAPH_SNAPSHOT_DEFAULT, branch: string | null): Promise<{ nodes: BaseEntity[]; edges: Relation[] }> {
    // Check cache first (with limit and branch as part of key)
    const cacheKey = `getGraphSnapshot:${limit}:${branch || 'all'}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as { nodes: BaseEntity[]; edges: Relation[] };
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    // Build branch filters using utility functions
    const { buildEntityBranchFilter, buildRelationshipBranchFilter } = await import('./branchFiltering.js');
    const branchFilter = buildEntityBranchFilter(branch);
    const relBranchFilter = buildRelationshipBranchFilter(branch);

    // Optimized queries with branch filtering
    const nodeQuery = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
  }
  ${branchFilter}
}
LIMIT ${limit}
`;

    const edgeQuery = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
    OPTIONAL { ?rel beleid:metadata ?relMetadata }
  }
  ${relBranchFilter}
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
    const edges: Relation[] = edgeResults.map((row) => {
      let metadata: Record<string, unknown> | undefined = undefined;
      if (row.metadata) {
        try {
          const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
          metadata = JSON.parse(metadataStr) as Record<string, unknown>;
        } catch (error) {
          // Handle malformed JSON metadata gracefully
          logger.warn({ error, metadata: row.metadata }, 'Failed to parse edge metadata JSON, using fallback');
          metadata = { rawMetadata: row.metadata };
        }
      }
      return {
        sourceId: row.sourceId,
        targetId: row.targetId,
        type: row.relationType as RelationType,
        metadata,
      };
    });

    const result = { nodes, edges };
    
    // Cache result with shorter TTL for snapshots (3 minutes)
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, result, 3 * 60 * 1000);
    }
    
    return result;
  }

  async getNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = `getNeighbors:${id}:${relationType || 'all'}:${maxHops || 1}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching and move FILTER to WHERE clause for better performance
    const sourceUri = entityUri(id);
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source <${sourceUri}> ;
         beleid:target ?t ;
         ${relationType ? `beleid:relationType ${literal(relationType)} ;` : 'beleid:relationType ?relType ;'}
         .
    <${sourceUri}> beleid:id ${literal(id)} .
    ?t beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?t dct:description ?description }
    OPTIONAL { ?t beleid:metadata ?metadata }
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

  async getNeighborsBatch(ids: string[], relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]> {
    if (ids.length === 0) return [];

    // Check cache first
    const cacheKey = `getNeighborsBatch:${ids.sort().join(',')}:${relationType || 'all'}:${maxHops || 1}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    // Optimized query: Use VALUES clause to match multiple source URIs
    const sourceUris = ids.map(id => entityUri(id));
    const valuesBody = sourceUris.map(uri => `<${uri}>`).join(' ');

    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?type ?name ?description ?metadata
WHERE {
  VALUES ?sourceUri { ${valuesBody} }
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?sourceUri ;
         beleid:target ?t ;
         ${relationType ? `beleid:relationType ${literal(relationType)} ;` : 'beleid:relationType ?relType ;'}
         .
    ?t beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?t dct:description ?description }
    OPTIONAL { ?t beleid:metadata ?metadata }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNeighborsBatch', queryTime);

    const entities = results.map((row) => this.rowToEntity(row));

    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities);
    }

    return entities;
  }

  async getIncomingNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = `getIncomingNeighbors:${id}:${relationType || 'all'}:${maxHops || 1}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching
    const targetUri = entityUri(id);
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target <${targetUri}> ;
         ${relationType ? `beleid:relationType ${literal(relationType)} ;` : 'beleid:relationType ?relType ;'}
         .
    <${targetUri}> beleid:id ${literal(id)} .
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
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

  async getNeighborCounts(id: string): Promise<NeighborCounts> {
    const cacheKey = `getNeighborCounts:${id}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null) {
        return cached as NeighborCounts;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    const uri = entityUri(id);

    const query = `
${PREFIXES}
SELECT ?type ?direction (COUNT(?r) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    {
       ?r a beleid:Relation ;
          beleid:source <${uri}> ;
          beleid:relationType ?type .
       BIND("outgoing" AS ?direction)
    }
    UNION
    {
       ?r a beleid:Relation ;
          beleid:target <${uri}> ;
          beleid:relationType ?type .
       BIND("incoming" AS ?direction)
    }
  }
}
GROUP BY ?type ?direction
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNeighborCounts', queryTime);

    const counts: NeighborCounts = {
      outgoing: { total: 0, byType: {} },
      incoming: { total: 0, byType: {} }
    };

    for (const row of results) {
      const type = row.type as string; // e.g. "DEFINED_IN" or fully qualified URI?
      // Usually GraphDB returns fully qualified URI if it's a resource, or literal string if literal.
      // beleid:relationType is likely a literal string based on addEdge: `kg:relationType ${literal(type)}`.

      const direction = row.direction as 'outgoing' | 'incoming';
      const count = parseInt(row.count, 10);

      if (direction === 'outgoing') {
        counts.outgoing.total += count;
        counts.outgoing.byType[type] = count;
      } else if (direction === 'incoming') {
        counts.incoming.total += count;
        counts.incoming.byType[type] = count;
      }
    }

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, counts);
    }

    return counts;
  }

  async searchEntities(keywords: string[]): Promise<BaseEntity[]> {
    const client = this.ensureClient();
    if (!keywords.length) return [];
    
    // Check cache first
    // Create a copy before sorting to avoid mutating the input array
    const sortedKeywords = [...keywords].sort();
    const cacheKey = `searchEntities:${sortedKeywords.join(',')}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as BaseEntity[];
      }
    }

    const startTime = Date.now();
    
    // Optimized query: Use regex with case-insensitive flag for better performance
    // GraphDB can optimize regex better than CONTAINS in some cases
    const lowered = keywords.map((k) => k.toLowerCase());
    const filter = lowered
      .map((kw) => `REGEX(?name, ${literal(escapeRegex(kw))}, "i")`)
      .join(' || ');

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
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
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as Array<{ sourceId: string; targetId: string; type: RelationType }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching instead of FILTER
    const sourceUri = entityUri(entityId);
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source <${sourceUri}> ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    <${sourceUri}> beleid:id ?sourceId .
    ?t beleid:id ?targetId .
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
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as Array<{ sourceId: string; targetId: string; type: RelationType }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // Optimized query: Use direct URI matching instead of FILTER
    const targetUri = entityUri(entityId);
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target <${targetUri}> ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    <${targetUri}> beleid:id ?targetId .
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

  async getNodesByType(type: EntityType): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = `getNodesByType:${type}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    FILTER(?type = ${literal(type)})
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNodesByType', queryTime);
    
    const entities = results.map((row) => this.rowToEntity(row));
    
    // Cache result
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities);
    }
    
    return entities;
  }

  async getAllNodes(): Promise<BaseEntity[]> {
    // Check cache first
    const cacheKey = 'getAllNodes';
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getAllNodes', queryTime);
    
    const entities = results.map((row) => this.rowToEntity(row));
    
    // Cache result with shorter TTL (5 minutes) since this can be large
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities, 5 * 60 * 1000);
    }
    
    return entities;
  }

  async getEntityTypeDistribution(): Promise<Record<string, number>> {
    const client = this.ensureClient();
    const query = `
${PREFIXES}
SELECT ?type (COUNT(*) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:type ?type .
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

  async getJurisdictionDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>> {
    const client = this.ensureClient();
    // Use GROUP_CONCAT to aggregate IDs.
    // We filter for PolicyDocuments (or any entity with jurisdiction)
    const query = `
${PREFIXES}
SELECT ?jurisdiction (COUNT(?s) AS ?count) (GROUP_CONCAT(?id; separator=",") AS ?ids)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:type "PolicyDocument" .
    ?s beleid:jurisdiction ?jurisdiction .
    ?s beleid:id ?id .
  }
}
GROUP BY ?jurisdiction
`;
    const results = await client.query(query);
    const distribution: Record<string, { count: number; entityIds: string[] }> = {};

    for (const row of results) {
      const jurisdiction = row.jurisdiction;
      const idsStr = row.ids || "";
      const entityIds = idsStr ? idsStr.split(',') : [];

      // Verify entityIds actually exist (filter out deleted duplicates)
      if (entityIds.length > 0) {
        const verifiedNodes = await this.getNodes(entityIds);
        const verifiedEntityIds = entityIds.filter((_id, index) => verifiedNodes[index] !== undefined);
        
        if (verifiedEntityIds.length > 0) {
          distribution[jurisdiction] = {
            count: verifiedEntityIds.length, // Use verified count
            entityIds: verifiedEntityIds // Use verified entityIds
          };
        }
      }
    }

    return distribution;
  }

  /**
   * Get domain distribution from metadata
   * Groups entities by domain extracted from JSON metadata
   * Returns count and entity IDs for each domain
   * OPTIMIZED: Uses query cache to avoid repeated SPARQL queries
   */
  async getDomainDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>> {
    // Check cache first (domain distribution changes less frequently)
    const cacheKey = 'getDomainDistribution';
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && typeof cached === 'object') {
        return cached as Record<string, { count: number; entityIds: string[] }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    
    // List of known domains to query
    const domains = [
      'ruimtelijke ordening',
      'milieu',
      'water',
      'natuur',
      'verkeer',
      'wonen',
      'economie',
      'cultuur',
      'onderwijs',
      'gezondheid',
      'energie',
      'klimaat',
      'bodem',
      'geluid',
      'lucht',
      'afval'
    ];

    const distribution: Record<string, { count: number; entityIds: string[] }> = {};

    // Query each domain separately
    // Note: SPARQL doesn't have native JSON parsing, so we use string matching
    for (const domain of domains) {
      try {
        // Escape quotes in domain name for SPARQL string literal
        const escapedDomain = domain.replace(/"/g, '\\"');
        const domainPattern1 = `"domain":"${escapedDomain}"`;
        const domainPattern2 = `"domain": "${escapedDomain}"`;
        const domainPattern3 = `"domain":"${domain}"`;
        const domainPattern4 = `"domain": "${domain}"`;
        
        const query = `
${PREFIXES}
SELECT ?id
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:metadata ?metadata .
    FILTER(CONTAINS(?metadata, "${domainPattern1}")
        || CONTAINS(?metadata, "${domainPattern2}")
        || CONTAINS(?metadata, "${domainPattern3}")
        || CONTAINS(?metadata, "${domainPattern4}"))
  }
}
`;
        const results = await client.query(query);
        const entityIds = results.map((row: Record<string, unknown>) => row.id as string);
        
        // Verify entityIds actually exist (filter out deleted duplicates)
        if (entityIds.length > 0) {
          const verifiedNodes = await this.getNodes(entityIds);
          const verifiedEntityIds = entityIds.filter((_id, index) => verifiedNodes[index] !== undefined);
          
          if (verifiedEntityIds.length > 0) {
            distribution[domain] = {
              count: verifiedEntityIds.length, // Use verified count
              entityIds: verifiedEntityIds // Use verified entityIds
            };
          }
        }
      } catch (error) {
        logger.warn({ error, domain }, 'Error querying domain distribution, skipping domain');
        // Continue with other domains
      }
    }

    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getDomainDistribution', queryTime);

    // Cache result with shorter TTL (5 minutes) since domain distribution can change when entities are added
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, distribution, 5 * 60 * 1000);
    }

    return distribution;
  }

  async getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
    // Check cache first (stats change less frequently)
    const cacheKey = 'getStats';
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined && cached !== null && typeof cached === 'object' && 'nodeCount' in cached) {
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
    ?s beleid:id ?id .
  }
}
`;
    const edgeQuery = `
${PREFIXES}
SELECT (COUNT(DISTINCT ?rel) AS ?count)
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation .
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
    this.queryCache.delete(`getNeighborCounts:${entityId}`);
    
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
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
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
       beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name ;
       eli:jurisdiction ${literal(jurisdiction)} .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
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
      this.mapELIProperties(entity, row);
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
       beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name ;
       eli:date_document ?dateDocument .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
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
      this.mapELIProperties(entity, row);
      this.mapELIProperties(entity, row);
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
      if (cached !== undefined && cached !== null && Array.isArray(cached)) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();
    const uri = entityUri(entityId);

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?dateDocument ?jurisdiction ?typeDocument ?status ?category ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${uri}> ${relationshipType} ?related .
    ?related a eli:LegalResource ;
             beleid:id ?id ;
             beleid:type ?type ;
             rdfs:label ?name .
    OPTIONAL { ?related dct:description ?description }
    OPTIONAL { ?related beleid:metadata ?metadata }
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

  /**
   * Get node by Schema.org URI
   */
  async getNodeByUri(uri: string): Promise<BaseEntity | undefined> {
    const cacheKey = `getNodeByUri:${uri}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined) {
        return cached as BaseEntity | undefined;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
    FILTER(?s = <${uri}> || ?s = ?uri)
    BIND(<${uri}> AS ?uri)
  }
}
LIMIT 1
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getNodeByUri', queryTime);

    if (!results.length) {
      if (this.cacheEnabled) {
        await this.queryCache.set(cacheKey, undefined, 60 * 1000);
      }
      return undefined;
    }

    const entity = this.rowToEntity(results[0]);
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entity);
    }
    return entity;
  }


  /**
   * Get entities by type with optional limit
   */
  async getEntitiesByType(type: EntityType, limit?: number, offset?: number): Promise<BaseEntity[]> {
    const cacheKey = `getEntitiesByType:${type}:${limit || 'none'}:${offset || 0}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined) {
        return cached as BaseEntity[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    const limitClause = limit ? `LIMIT ${limit}` : '';
    const offsetClause = offset ? `OFFSET ${offset}` : '';
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    FILTER(?type = ${literal(type)})
    OPTIONAL { ?s dct:description ?description }
    OPTIONAL { ?s beleid:metadata ?metadata }
  }
}
${limitClause}
${offsetClause}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getEntitiesByType', queryTime);

    const entities = results.map((row) => this.rowToEntity(row));
    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, entities);
    }
    return entities;
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
          
          const uri = entityUri(node.id);
          entityUris.push(uri);
          
          // Add branch to metadata if provided (for versioning support)
          let enrichedMetadata = node.metadata || {};
          if (branch !== undefined && branch !== null) {
            enrichedMetadata = { ...enrichedMetadata, branch };
          }
          const metadataLiteral = this.metadataLiteral(enrichedMetadata);
          const eliClass = this.getELIClass(node);
          const eliProperties = this.getELIProperties(node);

          // Build INSERT pattern for the entity
          const nodeTriples: string[] = [
            `<${uri}> a ${this.getBeleidClass(node)} ;`,
            `  beleid:id ${literal(node.id)} ;`,
            `  beleid:type ${literal(node.type)} ;`,
            `  rdfs:label ${literal(node.name ?? node.id)} ;`,
          ];

          if (eliClass) {
            nodeTriples.push(`  a ${eliClass} ;`);
          }

          // Add Beleidsscan-specific properties
          const beleidProperties = this.getBeleidProperties(node);
          nodeTriples.push(...beleidProperties);

          nodeTriples.push(...eliProperties);

          if (node.description) {
            nodeTriples.push(`  dct:description ${literal(node.description)} ;`);
          }

          if (node.uri) {
            nodeTriples.push(`  schema:identifier <${node.uri}> ;`);
          }

          if (metadataLiteral) {
            // metadataLiteral is already a JSON string, use it directly (don't double-stringify)
            nodeTriples.push(`  beleid:metadata "${metadataLiteral.replace(/"/g, '\\"')}" ;`);
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
          // First, delete all existing entities with these IDs to prevent duplicates
          // This ensures we replace existing entities rather than creating duplicates
          const deleteQuery = `
${PREFIXES}
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity ?p ?o .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    VALUES ?entity { ${entityUris.map(uri => `<${uri}>`).join(' ')} }
    ?entity ?p ?o .
  }
}
`;
          await client.update(deleteQuery);
          
          // Then insert the new/updated entities
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
      this.queryCache.delete('getAllNodes');
      this.queryCache.delete('getDomainDistribution');
      this.queryCache.delete('getJurisdictionDistribution');
      this.queryCache.delete(`getGraphSnapshot:${LIMITS.GRAPH_SNAPSHOT_DEFAULT}`);
      for (const node of entities) {
        this.invalidateCacheForEntity(node.id);
      }
    }

    return { successful, failed, errors };
  }

  /**
   * Add multiple edges in bulk
   */
  async addEdgesBulk(
    edges: Relation[],
    branch?: string | null
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    const client = this.ensureClient();
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches to avoid overwhelming GraphDB
    const batchSize = 100;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);
      const triples: string[] = [];
      let batchSuccessfulCount = 0;

      for (const edge of batch) {
        try {
          const { sourceId, targetId, type, metadata } = edge;
          const sourceUri = entityUri(sourceId);
          const targetUri = entityUri(targetId);
          const relUri = relationUri(sourceId, targetId, type);

          // Add branch to metadata if provided (for versioning support)
          let enrichedMetadata = metadata || {};
          if (branch !== undefined && branch !== null) {
            enrichedMetadata = { ...enrichedMetadata, branch };
          }
          const metadataLiteral = this.metadataLiteral(enrichedMetadata);
          const beleidProperty = this.getBeleidRelationProperty(type);
          const eliProperty = this.getELIRelationProperty(type);

          const edgeTriples: string[] = [
            // Direct relationship using beleid: property (primary)
            `<${sourceUri}> ${beleidProperty} <${targetUri}> .`,
          ];

          // Add reified relationship for metadata tracking
          if (metadataLiteral) {
            edgeTriples.push(
              `<${relUri}> a beleid:Relation ;`,
              `  beleid:source <${sourceUri}> ;`,
              `  beleid:target <${targetUri}> ;`,
              `  beleid:relationType ${literal(type)} ;`,
              `  beleid:metadata "${metadataLiteral.replace(/"/g, '\\"')}" .`,
            );
          }

          // Add ELI relationship property if applicable (for compatibility)
          if (eliProperty) {
            edgeTriples.push(`<${sourceUri}> ${eliProperty} <${targetUri}> .`);
          }

          triples.push(...edgeTriples);
          batchSuccessfulCount++;
        } catch (error) {
          failed++;
          errors.push(`Failed to process edge ${edge.sourceId}->${edge.targetId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (triples.length > 0) {
        try {
          const update = `
${PREFIXES}
INSERT DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${triples.join('\n    ')}
  }
}
`;
          await client.update(update);
          successful += batchSuccessfulCount;
        } catch (error) {
          failed += batchSuccessfulCount;
          errors.push(`Failed to insert batch: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Invalidate cache
    if (this.cacheEnabled) {
      this.invalidateCache(); // Just clear all cache for simplicity as edges affect many nodes
    }

    return { successful, failed, errors };
  }

  /**
   * Get relationships between specific entities
   */
  async getRelationshipsBetweenEntities(entityIds: string[]): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    if (entityIds.length === 0) return [];

    // Create a copy before sorting to avoid mutating the input array
    const sortedIds = [...entityIds].sort();
    const cacheKey = `getRelationshipsBetweenEntities:${sortedIds.join(',')}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined) {
        return cached as Array<{ sourceId: string; targetId: string; type: RelationType }>;
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    // Build filter for entity IDs
    const entityUriFilters = entityIds.map(id => `<${entityUri(id)}>`).join(' ');
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
    FILTER(?s IN (${entityUriFilters}) && ?t IN (${entityUriFilters}))
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getRelationshipsBetweenEntities', queryTime);

    const relationships = results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, relationships);
    }
    return relationships;
  }

  /**
   * Get specific relationships by source/target/type keys
   */
  async getRelationships(
    keys: Array<{ sourceId: string; targetId: string; type: RelationType }>
  ): Promise<Array<Relation>> {
    if (keys.length === 0) return [];

    const client = this.ensureClient();
    const startTime = Date.now();
    const batchSize = 100;
    const allRelationships: Relation[] = [];

    // Process in batches
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      // Build VALUES clause
      // Format: ( <sourceUri1> <targetUri1> "type1" ) ...
      const valuesBody = batch.map(({ sourceId, targetId, type }) => {
        return `(<${entityUri(sourceId)}> <${entityUri(targetId)}> ${literal(type)})`;
      }).join('\n    ');

      const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relType ?metadata
WHERE {
  VALUES (?s ?t ?relType) {
    ${valuesBody}
  }
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
    OPTIONAL { ?rel beleid:metadata ?metadata }
  }
}
`;
      const results = await client.query(query);

      const relationships = results.map((row) => {
        let metadata: Record<string, unknown> | undefined = undefined;
        if (row.metadata) {
          try {
            const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
            metadata = JSON.parse(metadataStr) as Record<string, unknown>;
          } catch {
            metadata = { rawMetadata: row.metadata };
          }
        }
        return {
          sourceId: row.sourceId,
          targetId: row.targetId,
          type: row.relType as RelationType,
          metadata,
        };
      });
      allRelationships.push(...relationships);
    }

    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getRelationships', queryTime);

    return allRelationships;
  }

  /**
   * Get applicable regulations for an entity
   */
  async getApplicableRegulations(entityId: string): Promise<Regulation[]> {
    const cacheKey = `getApplicableRegulations:${entityId}`;
    if (this.cacheEnabled) {
      const cached = await this.queryCache.get(cacheKey);
      if (cached !== undefined) {
        return cached as Regulation[];
      }
    }

    const client = this.ensureClient();
    const startTime = Date.now();

    const uri = entityUri(entityId);
    const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?category
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?reg a beleid:Regulation ;
         beleid:id ?id ;
         beleid:type ?type ;
         rdfs:label ?name .
    OPTIONAL { ?reg dct:description ?description }
    OPTIONAL { ?reg beleid:metadata ?metadata }
    OPTIONAL { ?reg beleid:category ?category }
    {
      ?reg beleid:appliesTo <${uri}> .
    } UNION {
      ?reg beleid:constrains <${uri}> .
    }
  }
}
`;
    const results = await client.query(query);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('getApplicableRegulations', queryTime);

    const regulations = results.map((row) => {
      const entity = this.rowToEntity(row) as Regulation;
      if (row.category) {
        const category = row.category as string;
        if (category === 'Zoning' || category === 'Environmental' || category === 'Building' || category === 'Procedural') {
          entity.category = category as Regulation['category'];
        }
      }
      return entity;
    });

    if (this.cacheEnabled) {
      await this.queryCache.set(cacheKey, regulations);
    }
    return regulations;
  }

  /**
   * Extract document dependencies from text.
   * Uses GraphDBDocumentDependencyTracker for SPARQL-based dependency tracking.
   */
  async extractDocumentDependencies(
    documentId: string,
    documentText: string,
    documentTitle?: string
  ): Promise<{
    dependencies: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>;
    citationsParsed: number;
    dependenciesExtracted: number;
    extractionTime: number;
    success: boolean;
    error?: string;
  }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    return tracker.extractDependencies(documentId, documentText, documentTitle);
  }

  /**
   * Store document dependencies in the knowledge graph.
   */
  async storeDocumentDependencies(
    dependencies: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>
  ): Promise<{ stored: number; errors: number }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const citationParserModule = await import('../../knowledge-graph/legal/CitationParser.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    const typedDependencies: import('../../knowledge-graph/legal/DocumentDependencyTracker.js').DocumentDependency[] = dependencies.map(dep => ({
      sourceDocumentId: dep.sourceDocumentId,
      targetDocumentId: dep.targetDocumentId,
      dependencyType: dep.dependencyType as import('../../knowledge-graph/legal/DocumentDependencyTracker.js').DependencyType,
      confidence: dep.confidence,
      citation: dep.citation as (typeof citationParserModule extends { Citation: infer C } ? C : never) | undefined,
      extractedAt: dep.extractedAt,
    }));
    const result = await tracker.storeDependencies(typedDependencies);
    // GraphDBDocumentDependencyTracker.storeDependencies returns { stored, errors } (not failed)
    return { stored: result.stored, errors: result.errors };
  }

  /**
   * Get document dependencies.
   */
  async getDocumentDependencies(documentId: string): Promise<{
    documentId: string;
    dependencies: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>;
    dependents: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>;
    totalDependencies: number;
    totalDependents: number;
  }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    return tracker.getDependencies(documentId);
  }

  /**
   * Validate dependency integrity.
   */
  async validateDependencyIntegrity(): Promise<{
    isValid: boolean;
    cycles: Array<{ path: string[] }>;
    errors: string[];
  }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    return tracker.validateDependencyIntegrity();
  }

  /**
   * Analyze document impact.
   */
  async analyzeDocumentImpact(
    documentId: string,
    maxDepth: number = 3
  ): Promise<{
    affectedDocuments: string[];
    impactChain: Array<{ documentId: string; depth: number }>;
    totalAffected: number;
  }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    return tracker.analyzeDocumentImpact(documentId, maxDepth);
  }

  /**
   * Generate impact report for a document.
   */
  async generateImpactReport(
    documentId: string,
    maxDepth: number = 3
  ): Promise<{
    documentId: string;
    impactAnalysis: {
      affectedDocuments: string[];
      impactChain: Array<{ documentId: string; depth: number }>;
      totalAffected: number;
    };
    dependencies: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>;
    dependents: Array<{
      sourceDocumentId: string;
      targetDocumentId: string;
      dependencyType: string;
      confidence: number;
      citation?: unknown;
      extractedAt: Date;
    }>;
  }> {
    const { GraphDBDocumentDependencyTracker } = await import('../../knowledge-graph/legal/GraphDBDocumentDependencyTracker.js');
    const tracker = new GraphDBDocumentDependencyTracker(this.ensureClient());
    return tracker.generateImpactReport(documentId, maxDepth);
  }

  /**
   * Execute a raw SPARQL query.
   * Useful for specialized operations like clustering that are not covered by standard methods.
   * @param query The SPARQL query string
   * @returns Array of result rows
   */
  public async executeSparql(query: string): Promise<any[]> {
    const client = this.ensureClient();
    const startTime = Date.now();

    // Add prefixes if not present
    const fullQuery = query.includes('PREFIX') ? query : `${PREFIXES}\n${query}`;

    const results = await client.query(fullQuery);
    const queryTime = Date.now() - startTime;
    this.trackQueryPerformance('executeSparql', queryTime);

    return results;
  }

  /**
   * Get or create the GraphDB inference engine
   */
  private getInferenceEngine(): GraphDBInferenceEngine | null {
    if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, false)) {
      return null;
    }
    const client = this.ensureClient();
    return new GraphDBInferenceEngine(client);
  }

  /**
   * Run inference rules on the knowledge graph
   * Requires KG_REASONING_ENABLED feature flag to be enabled
   * @param options Inference options
   * @returns Inference result with inferred relationships and properties
   */
  async runInference(options: InferenceOptions = {}): Promise<InferenceResult> {
    const inferenceEngine = this.getInferenceEngine();
    if (!inferenceEngine) {
      throw new Error('Inference is disabled. Enable KG_REASONING_ENABLED feature flag.');
    }
    const result = await inferenceEngine.infer(options);
    logger.info({ 
      relationshipsInferred: result.relationshipsInferred,
      propertiesInferred: result.propertiesInferred,
      executionTime: result.executionTime 
    }, '[GraphDBKnowledgeGraphService] Inference completed');
    return result;
  }

  /**
   * Query an entity including inferred relationships
   * Requires KG_REASONING_ENABLED feature flag to be enabled
   * @param entityId Entity ID to query
   * @param includeInferred Whether to include inferred relationships (default: true)
   * @returns Entity with relationships (both explicit and inferred)
   */
  async queryEntityWithInference(
    entityId: string,
    includeInferred: boolean = true
  ): Promise<{
    entity: BaseEntity;
    relationships: Array<{
      target: BaseEntity;
      type: RelationType;
      inferred: boolean;
      confidence?: number;
    }>;
  }> {
    const inferenceEngine = this.getInferenceEngine();
    if (!inferenceEngine) {
      throw new Error('Inference is disabled. Enable KG_REASONING_ENABLED feature flag.');
    }
    const result = await inferenceEngine.queryWithInference(entityId, includeInferred);
    
    // Convert to expected format (with target entities)
    const relationships = await Promise.all(
      result.relationships.map(async (rel) => {
        const targetEntity = await this.getNode(rel.targetId);
        if (!targetEntity) {
          throw new Error(`Target entity ${rel.targetId} not found`);
        }
        return {
          target: targetEntity,
          type: rel.type,
          inferred: rel.inferred,
          confidence: rel.confidence,
        };
      })
    );

    return {
      entity: result.entity,
      relationships,
    };
  }
}
