/**
 * GraphDB Inference Engine
 * 
 * SPARQL-based implementation of inference engine for GraphDB backend.
 * Uses SPARQL CONSTRUCT for custom rules and leverages GraphDB's native RDFS/OWL reasoning.
 * 
 * Architecture: Knowledge Graph operations MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { GraphDBClient } from '../../../config/graphdb.js';
import { BaseEntity, EntityType, RelationType, BELEID_RELATION_MAPPING } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

// Re-export interfaces from GraphInferenceEngine for compatibility
export type {
    InferredResult,
    InferredRelationship,
    InferredProperty,
    InferenceOptions,
    InferenceRuleType,
    InferenceResult,
} from './GraphInferenceEngine.js';

const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';

/**
 * SPARQL prefixes for GraphDB queries
 */
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
`;

/**
 * Convert entity ID to GraphDB URI
 */
function entityUri(id: string): string {
    return `http://data.example.org/id/${encodeURIComponent(id)}`;
}

/**
 * Maps RelationType to SPARQL property
 */
function relationTypeToProperty(relationType: RelationType): string {
    return BELEID_RELATION_MAPPING[relationType] || `beleid:${relationType.toLowerCase()}`;
}

/**
 * Service for performing inference on the knowledge graph using GraphDB.
 * Implements rule-based inference using SPARQL CONSTRUCT and leverages
 * GraphDB's native RDFS/OWL reasoning capabilities.
 */
export class GraphDBInferenceEngine {
    private client: GraphDBClient;
    private readonly defaultMaxDepth: number = 3;
    private readonly defaultMinConfidence: number = 0.7;

    constructor(client: GraphDBClient) {
        this.client = client;
    }

    /**
     * Run inference rules on the knowledge graph
     */
    async infer(options: {
        ruleTypes?: Array<'transitive' | 'type-based' | 'temporal' | 'hierarchical' | 'all'>;
        maxDepth?: number;
        minConfidence?: number;
        storeResults?: boolean;
        entityIds?: string[];
    } = {}): Promise<{
        relationshipsInferred: number;
        propertiesInferred: number;
        relationships: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }>;
        properties: Array<{
            entityId: string;
            property: string;
            value: unknown;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }>;
        executionTime: number;
    }> {
        const startTime = Date.now();
        const ruleTypes = options.ruleTypes || ['all'];
        const maxDepth = options.maxDepth || this.defaultMaxDepth;
        const minConfidence = options.minConfidence || this.defaultMinConfidence;
        const storeResults = options.storeResults !== false; // Default to true
        const entityIds = options.entityIds;

        const relationships: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];
        const properties: Array<{
            entityId: string;
            property: string;
            value: unknown;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];

        // Apply inference rules
        if (ruleTypes.includes('all') || ruleTypes.includes('transitive')) {
            const transitiveResults = await this.applyTransitiveRules(maxDepth, minConfidence, entityIds);
            relationships.push(...transitiveResults);
        }

        if (ruleTypes.includes('all') || ruleTypes.includes('type-based')) {
            const typeBasedResults = await this.applyTypeBasedRules(minConfidence, entityIds);
            relationships.push(...typeBasedResults);
        }

        if (ruleTypes.includes('all') || ruleTypes.includes('temporal')) {
            const temporalResults = await this.applyTemporalRules(minConfidence, entityIds);
            relationships.push(...temporalResults);
        }

        if (ruleTypes.includes('all') || ruleTypes.includes('hierarchical')) {
            const hierarchicalResults = await this.applyHierarchicalRules(minConfidence, entityIds);
            relationships.push(...hierarchicalResults);
        }

        // Store inferred relationships if requested
        if (storeResults && relationships.length > 0) {
            await this.storeInferredRelationships(relationships.filter(r => r.inference.confidence >= minConfidence));
        }

        const executionTime = Date.now() - startTime;

        return {
            relationshipsInferred: relationships.length,
            propertiesInferred: properties.length,
            relationships,
            properties,
            executionTime,
        };
    }

    /**
     * Apply transitive inference rules using SPARQL CONSTRUCT
     * Rule: If A -> B and B -> C, then infer A -> C (with decreasing confidence)
     */
    private async applyTransitiveRules(
        maxDepth: number,
        minConfidence: number,
        entityIds?: string[]
    ): Promise<Array<{
        sourceId: string;
        targetId: string;
        type: RelationType;
        inference: {
            inferenceType: string;
            confidence: number;
            sources: string[];
            timestamp: string;
            metadata?: Record<string, unknown>;
        };
    }>> {
        const inferred: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];

        try {
            // Build SPARQL query to find transitive paths
            // Use property paths to find multi-hop relationships
            let entityFilter = '';
            if (entityIds && entityIds.length > 0) {
                const uris = entityIds.map(id => `<${entityUri(id)}>`).join(' ');
                entityFilter = `FILTER (?source IN (${uris}) || ?target IN (${uris}))`;
            }

            // Find paths of length 2 to maxDepth
            for (let depth = 2; depth <= maxDepth; depth++) {
                const pathPattern = Array(depth).fill('beleid:relatedTo').join('/');
                
                const query = `
${PREFIXES}
SELECT DISTINCT ?sourceId ?targetId ?pathLength WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?source ${pathPattern} ?target .
    ?source beleid:id ?sourceId .
    ?target beleid:id ?targetId .
    
    # Exclude direct relationships
    FILTER NOT EXISTS {
      ?source beleid:relatedTo ?target .
    }
    
    ${entityFilter}
    
    # Calculate path length (simplified - actual path tracking would be more complex)
    BIND(${depth} AS ?pathLength)
  }
}
LIMIT 1000
`;

                const results = await this.client.query(query);

                for (const row of results) {
                    const sourceId = row.sourceId as string;
                    const targetId = row.targetId as string;
                    const pathLength = parseInt(row.pathLength as string || String(depth), 10);

                    // Calculate confidence: decreases with path length
                    const baseConfidence = 0.9;
                    const confidence = Math.max(
                        minConfidence,
                        baseConfidence * Math.pow(0.8, pathLength - 1)
                    );

                    // Get source entities for provenance (simplified - would need path reconstruction)
                    const sources = await this.getPathEntities(sourceId, targetId, pathLength);

                    inferred.push({
                        sourceId,
                        targetId,
                        type: RelationType.RELATED_TO, // Default type for transitive
                        inference: {
                            inferenceType: 'transitive',
                            confidence,
                            sources,
                            timestamp: new Date().toISOString(),
                            metadata: {
                                pathLength,
                            },
                        },
                    });
                }
            }
        } catch (error) {
            logger.error({ error }, '[GraphDBInference] Error applying transitive rules');
        }

        return inferred;
    }

    /**
     * Apply type-based inference rules using SPARQL
     * Rule: If PolicyDocument applies to SpatialUnit and Regulation is part of PolicyDocument,
     *       then Regulation applies to SpatialUnit
     * Leverages RDFS reasoning for subclass inference
     */
    private async applyTypeBasedRules(
        _minConfidence: number,
        entityIds?: string[]
    ): Promise<Array<{
        sourceId: string;
        targetId: string;
        type: RelationType;
        inference: {
            inferenceType: string;
            confidence: number;
            sources: string[];
            timestamp: string;
            metadata?: Record<string, unknown>;
        };
    }>> {
        const inferred: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];

        try {
            let entityFilter = '';
            if (entityIds && entityIds.length > 0) {
                const uris = entityIds.map(id => `<${entityUri(id)}>`).join(' ');
                entityFilter = `FILTER (?reg IN (${uris}) || ?spatial IN (${uris}))`;
            }

            const query = `
${PREFIXES}
SELECT DISTINCT ?regId ?spatialId ?docId WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?doc a beleid:PolicyDocument ;
         beleid:id ?docId ;
         beleid:appliesTo ?spatial .
    ?spatial a beleid:SpatialUnit ;
             beleid:id ?spatialId .
    
    ?doc (beleid:contains|beleid:defines|beleid:specifies) ?reg .
    ?reg a beleid:Regulation ;
         beleid:id ?regId .
    
    # Exclude existing direct relationship
    FILTER NOT EXISTS {
      ?reg beleid:appliesTo ?spatial .
    }
    
    ${entityFilter}
  }
}
LIMIT 500
`;

            const results = await this.client.query(query);

            for (const row of results) {
                const sourceId = row.regId as string;
                const targetId = row.spatialId as string;
                const docId = row.docId as string;

                inferred.push({
                    sourceId,
                    targetId,
                    type: RelationType.APPLIES_TO,
                    inference: {
                        inferenceType: 'type-based',
                        confidence: 0.85, // High confidence for type-based rules
                        sources: [docId],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            rule: 'policy-document-regulation-spatial',
                        },
                    },
                });
            }
        } catch (error) {
            logger.error({ error }, '[GraphDBInference] Error applying type-based rules');
        }

        return inferred;
    }

    /**
     * Apply temporal inference rules using SPARQL
     * Rule: If document A supersedes document B, and B relates to entity C,
     *       then A also relates to C (with lower confidence if temporal distance is large)
     */
    private async applyTemporalRules(
        minConfidence: number,
        entityIds?: string[]
    ): Promise<Array<{
        sourceId: string;
        targetId: string;
        type: RelationType;
        inference: {
            inferenceType: string;
            confidence: number;
            sources: string[];
            timestamp: string;
            metadata?: Record<string, unknown>;
        };
    }>> {
        const inferred: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];

        try {
            let entityFilter = '';
            if (entityIds && entityIds.length > 0) {
                const uris = entityIds.map(id => `<${entityUri(id)}>`).join(' ');
                entityFilter = `FILTER (?newDoc IN (${uris}) || ?target IN (${uris}))`;
            }

            const query = `
${PREFIXES}
SELECT DISTINCT ?newDocId ?targetId ?relType ?newDate ?oldDate ?oldDocId WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?newDoc a beleid:PolicyDocument ;
            beleid:id ?newDocId ;
            beleid:overrides ?oldDoc .
    ?oldDoc a beleid:PolicyDocument ;
            beleid:id ?oldDocId ;
            ?relProp ?target .
    ?target beleid:id ?targetId .
    
    # Get relationship type
    BIND(REPLACE(STR(?relProp), STR(beleid:), "") AS ?relTypeStr)
    
    # Get dates if available
    OPTIONAL { ?newDoc eli:date_document ?newDate }
    OPTIONAL { ?oldDoc eli:date_document ?oldDate }
    
    # Exclude existing direct relationship
    FILTER NOT EXISTS {
      ?newDoc ?relProp ?target .
    }
    
    ${entityFilter}
  }
}
LIMIT 500
`;

            const results = await this.client.query(query);

            for (const row of results) {
                const sourceId = row.newDocId as string;
                const targetId = row.targetId as string;
                const relTypeStr = row.relTypeStr as string;
                const newDate = row.newDate as string | undefined;
                const oldDate = row.oldDate as string | undefined;
                const oldDocId = row.oldDocId as string;

                // Map relationship type
                const relType = this.mapStringToRelationType(relTypeStr);

                // Calculate confidence based on temporal distance
                let confidence = 0.8;
                if (newDate && oldDate) {
                    try {
                        const dateDiff = Math.abs(
                            new Date(newDate).getTime() - new Date(oldDate).getTime()
                        );
                        const yearsDiff = dateDiff / (1000 * 60 * 60 * 24 * 365);
                        // Decrease confidence if documents are far apart in time
                        confidence = Math.max(minConfidence, 0.8 - yearsDiff * 0.1);
                    } catch {
                        // If date parsing fails, use default confidence
                    }
                }

                inferred.push({
                    sourceId,
                    targetId,
                    type: relType,
                    inference: {
                        inferenceType: 'temporal',
                        confidence,
                        sources: [oldDocId],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            rule: 'supersedes-inheritance',
                            newDate,
                            oldDate,
                        },
                    },
                });
            }
        } catch (error) {
            logger.error({ error }, '[GraphDBInference] Error applying temporal rules');
        }

        return inferred;
    }

    /**
     * Apply hierarchical inference rules using SPARQL
     * Rule: If parent jurisdiction has a regulation, child jurisdictions inherit it
     */
    private async applyHierarchicalRules(
        _minConfidence: number,
        entityIds?: string[]
    ): Promise<Array<{
        sourceId: string;
        targetId: string;
        type: RelationType;
        inference: {
            inferenceType: string;
            confidence: number;
            sources: string[];
            timestamp: string;
            metadata?: Record<string, unknown>;
        };
    }>> {
        const inferred: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }> = [];

        try {
            let entityFilter = '';
            if (entityIds && entityIds.length > 0) {
                const uris = entityIds.map(id => `<${entityUri(id)}>`).join(' ');
                entityFilter = `FILTER (?child IN (${uris}) || ?target IN (${uris}))`;
            }

            const query = `
${PREFIXES}
SELECT DISTINCT ?childId ?targetId ?relType ?parentId WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?parent a beleid:PolicyDocument ;
            beleid:id ?parentId ;
            ?relProp ?target .
    ?target beleid:id ?targetId .
    
    ?child a beleid:PolicyDocument ;
           beleid:id ?childId ;
           beleid:partOf ?parent .
    
    # Get relationship type
    BIND(REPLACE(STR(?relProp), STR(beleid:), "") AS ?relTypeStr)
    
    # Exclude existing direct relationship
    FILTER NOT EXISTS {
      ?child ?relProp ?target .
    }
    
    ${entityFilter}
  }
}
LIMIT 500
`;

            const results = await this.client.query(query);

            for (const row of results) {
                const sourceId = row.childId as string;
                const targetId = row.targetId as string;
                const relTypeStr = row.relTypeStr as string;
                const parentId = row.parentId as string;

                const relType = this.mapStringToRelationType(relTypeStr);

                inferred.push({
                    sourceId,
                    targetId,
                    type: relType,
                    inference: {
                        inferenceType: 'hierarchical',
                        confidence: 0.75, // Moderate confidence for hierarchical inheritance
                        sources: [parentId],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            rule: 'hierarchical-inheritance',
                        },
                    },
                });
            }
        } catch (error) {
            logger.error({ error }, '[GraphDBInference] Error applying hierarchical rules');
        }

        return inferred;
    }

    /**
     * Store inferred relationships in GraphDB using SPARQL INSERT DATA
     */
    private async storeInferredRelationships(
        relationships: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inference: {
                inferenceType: string;
                confidence: number;
                sources: string[];
                timestamp: string;
                metadata?: Record<string, unknown>;
            };
        }>
    ): Promise<void> {
        if (relationships.length === 0) return;

        try {
            // Batch process relationships
            const batchSize = 100;
            for (let i = 0; i < relationships.length; i += batchSize) {
                const batch = relationships.slice(i, i + batchSize);
                const triples: string[] = [];

                for (const rel of batch) {
                    const sourceUri = entityUri(rel.sourceId);
                    const targetUri = entityUri(rel.targetId);
                    const relProperty = relationTypeToProperty(rel.type);
                    const relUri = `http://data.example.org/inference/${encodeURIComponent(rel.sourceId)}-${encodeURIComponent(rel.targetId)}-${rel.inference.inferenceType}`;
                    const metadataStr = rel.inference.metadata ? JSON.stringify(rel.inference.metadata) : '{}';

                    // Store the relationship
                    triples.push(
                        `<${sourceUri}> ${relProperty} <${targetUri}> .`,
                        `<${relUri}> a beleid:InferredRelation ;`,
                        `  beleid:source <${sourceUri}> ;`,
                        `  beleid:target <${targetUri}> ;`,
                        `  beleid:inferenceType "${rel.inference.inferenceType}" ;`,
                        `  beleid:confidence ${rel.inference.confidence} ;`,
                        `  beleid:inferenceTimestamp "${rel.inference.timestamp}"^^xsd:dateTime ;`,
                        `  beleid:inferenceMetadata "${metadataStr.replace(/"/g, '\\"')}" .`
                    );

                    // Store source entities
                    for (const sourceId of rel.inference.sources) {
                        const sourceEntityUri = entityUri(sourceId);
                        triples.push(`<${relUri}> beleid:inferenceSource <${sourceEntityUri}> .`);
                    }
                }

                const update = `
${PREFIXES}
INSERT DATA {
  GRAPH <${KG_GRAPH_URI}> {
    ${triples.join('\n    ')}
  }
}
`;

                await this.client.update(update);
            }

            logger.debug(`[GraphDBInference] Stored ${relationships.length} inferred relationships`);
        } catch (error) {
            logger.error({ error }, '[GraphDBInference] Error storing inferred relationships');
            throw error;
        }
    }

    /**
     * Get entities along a path for provenance tracking
     * Simplified version - full implementation would reconstruct the actual path
     */
    private async getPathEntities(sourceId: string, targetId: string, _pathLength: number): Promise<string[]> {
        try {
            // For now, return source and target
            // Full implementation would query the actual path
            return [sourceId, targetId];
        } catch (error) {
            logger.warn({ error }, '[GraphDBInference] Error getting path entities');
            return [sourceId, targetId];
        }
    }

    /**
     * Map string to RelationType
     */
    private mapStringToRelationType(relTypeStr: string): RelationType {
        const normalized = relTypeStr.toUpperCase().replace(/-/g, '_');
        const typeMap: Record<string, RelationType> = {
            APPLIES_TO: RelationType.APPLIES_TO,
            DEFINED_IN: RelationType.DEFINED_IN,
            LOCATED_IN: RelationType.LOCATED_IN,
            OVERRIDES: RelationType.OVERRIDES,
            REFINES: RelationType.REFINES,
            CONSTRAINS: RelationType.CONSTRAINS,
            HAS_REQUIREMENT: RelationType.HAS_REQUIREMENT,
            RELATED_TO: RelationType.RELATED_TO,
        };
        return typeMap[normalized] || RelationType.RELATED_TO;
    }

    /**
     * Query an entity including inferred relationships
     */
    async queryWithInference(
        entityId: string,
        includeInferred: boolean = true
    ): Promise<{
        entity: BaseEntity;
        relationships: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inferred: boolean;
            confidence?: number;
        }>;
    }> {
        const entityUri = `http://data.example.org/id/${encodeURIComponent(entityId)}`;

        // Get explicit relationships
        const explicitQuery = `
${PREFIXES}
SELECT ?targetId ?relType WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> ?relProp ?target .
    ?target beleid:id ?targetId .
    FILTER(?relProp != beleid:id && ?relProp != beleid:type && ?relProp != rdfs:label)
    BIND(REPLACE(STR(?relProp), STR(beleid:), "") AS ?relType)
  }
}
`;

        const explicitResults = await this.client.query(explicitQuery);
        const relationships: Array<{
            sourceId: string;
            targetId: string;
            type: RelationType;
            inferred: boolean;
            confidence?: number;
        }> = [];

        for (const row of explicitResults) {
            const targetId = row.targetId as string;
            const relType = this.mapStringToRelationType(row.relType as string);
            relationships.push({
                sourceId: entityId,
                targetId,
                type: relType,
                inferred: false,
            });
        }

        // Get inferred relationships if requested
        if (includeInferred) {
            const inferredQuery = `
${PREFIXES}
SELECT ?targetId ?relType ?confidence WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?inferredRel a beleid:InferredRelation ;
                 beleid:source <${entityUri}> ;
                 beleid:target ?target ;
                 beleid:inferenceType ?infType ;
                 beleid:confidence ?confidence .
    ?target beleid:id ?targetId .
    
    # Get the relationship property
    <${entityUri}> ?relProp ?target .
    BIND(REPLACE(STR(?relProp), STR(beleid:), "") AS ?relType)
  }
}
`;

            const inferredResults = await this.client.query(inferredQuery);
            for (const row of inferredResults) {
                const targetId = row.targetId as string;
                const relType = this.mapStringToRelationType(row.relType as string);
                const confidence = parseFloat(row.confidence as string || '0.5');
                relationships.push({
                    sourceId: entityId,
                    targetId,
                    type: relType,
                    inferred: true,
                    confidence,
                });
            }
        }

        // Get entity
        const entityQuery = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ?id ;
                   beleid:type ?type ;
                   rdfs:label ?name .
    OPTIONAL { <${entityUri}> dct:description ?description }
    OPTIONAL { <${entityUri}> beleid:metadata ?metadata }
  }
}
LIMIT 1
`;

        const entityResults = await this.client.query(entityQuery);
        if (entityResults.length === 0) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const row = entityResults[0];
        let metadata: Record<string, unknown> | undefined;
        if (row.metadata) {
            try {
                const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
                metadata = JSON.parse(metadataStr) as Record<string, unknown>;
            } catch {
                metadata = { rawMetadata: row.metadata };
            }
        }

        const entity: BaseEntity = {
            id: row.id as string,
            type: row.type as EntityType,
            name: row.name as string,
            description: row.description as string | undefined,
            metadata,
        };

        return {
            entity,
            relationships,
        };
    }
}
