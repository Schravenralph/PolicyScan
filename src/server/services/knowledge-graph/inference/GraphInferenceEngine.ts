import { Driver } from 'neo4j-driver';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { BaseEntity, EntityType, RelationType } from '../../../domain/ontology.js';

/**
 * Represents an inferred relationship or entity
 */
export interface InferredResult {
    /**
     * Type of inference (e.g., 'transitive', 'type-based', 'temporal')
     */
    inferenceType: string;
    /**
     * Confidence score [0, 1]
     */
    confidence: number;
    /**
     * Source entities that led to this inference
     */
    sources: string[];
    /**
     * Timestamp when inference was made
     */
    timestamp: string;
    /**
     * Additional metadata about the inference
     */
    metadata?: Record<string, unknown>;
}

/**
 * Represents an inferred relationship
 */
export interface InferredRelationship {
    sourceId: string;
    targetId: string;
    type: RelationType;
    inference: InferredResult;
}

/**
 * Represents an inferred entity property or attribute
 */
export interface InferredProperty {
    entityId: string;
    property: string;
    value: unknown;
    inference: InferredResult;
}

/**
 * Options for running inference
 */
export interface InferenceOptions {
    /**
     * Types of inference rules to apply
     */
    ruleTypes?: InferenceRuleType[];
    /**
     * Maximum depth for transitive inference
     */
    maxDepth?: number;
    /**
     * Minimum confidence threshold for storing results
     */
    minConfidence?: number;
    /**
     * Whether to store inferred results in the graph
     */
    storeResults?: boolean;
    /**
     * Entity IDs to focus inference on (if undefined, applies to all entities)
     */
    entityIds?: string[];
}

/**
 * Types of inference rules
 */
export type InferenceRuleType =
    | 'transitive'
    | 'type-based'
    | 'temporal'
    | 'hierarchical'
    | 'all';

/**
 * Result of an inference operation
 */
export interface InferenceResult {
    /**
     * Number of relationships inferred
     */
    relationshipsInferred: number;
    /**
     * Number of properties inferred
     */
    propertiesInferred: number;
    /**
     * List of inferred relationships
     */
    relationships: InferredRelationship[];
    /**
     * List of inferred properties
     */
    properties: InferredProperty[];
    /**
     * Execution time in milliseconds
     */
    executionTime: number;
}

/**
 * Service for performing inference on the knowledge graph.
 * Implements rule-based inference to derive new relationships and properties
 * from existing graph data.
 * 
 * @deprecated This Neo4j-based implementation is deprecated in favor of GraphDBInferenceEngine.
 * According to the architecture (docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md),
 * the Knowledge Graph MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * 
 * Migration path:
 * - Use GraphDBInferenceEngine for all knowledge graph inference operations
 * - This class is kept only as a fallback for development/test environments
 * - In production, GraphDB is required and this fallback will not be used
 * 
 * See: src/server/services/knowledge-graph/inference/GraphDBInferenceEngine.ts
 */
export class GraphInferenceEngine {
    private driver: Driver;
    private readonly defaultMaxDepth: number = 3;
    private readonly defaultMinConfidence: number = 0.7;

    constructor(driver?: Driver) {
        if (!driver) {
            try {
                this.driver = getNeo4jDriver();
            } catch (_error) {
                throw new Error(
                    'GraphInferenceEngine requires a Neo4j driver connection. ' +
                    'Pass a Driver instance to the constructor or ensure connectNeo4j() has been called first.'
                );
            }
        } else {
            this.driver = driver;
        }
    }

    /**
     * Run inference rules on the knowledge graph
     */
    async infer(options: InferenceOptions = {}): Promise<InferenceResult> {
        const startTime = Date.now();
        const ruleTypes = options.ruleTypes || ['all'];
        const maxDepth = options.maxDepth || this.defaultMaxDepth;
        const minConfidence = options.minConfidence || this.defaultMinConfidence;
        const storeResults = options.storeResults !== false; // Default to true
        const entityIds = options.entityIds;

        const relationships: InferredRelationship[] = [];
        const properties: InferredProperty[] = [];

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
            executionTime
        };
    }

    /**
     * Apply transitive inference rules
     * Rule: If A -> B and B -> C, then infer A -> C (with decreasing confidence)
     */
    private async applyTransitiveRules(
        _maxDepth: number,
        minConfidence: number,
        entityIds?: string[]
    ): Promise<InferredRelationship[]> {
        const session = this.driver.session();
        const inferred: InferredRelationship[] = [];

        try {
            // Build query to find transitive paths
            let query = `
                MATCH path = (a:Entity)-[r1:RELATES_TO]->(b:Entity)-[r2:RELATES_TO]->(c:Entity)
                WHERE a <> c
                AND NOT EXISTS {
                    MATCH (a)-[:RELATES_TO]->(c)
                }
            `;

            const params: Record<string, unknown> = {};

            if (entityIds && entityIds.length > 0) {
                query += ` AND (a.id IN $entityIds OR c.id IN $entityIds)`;
                params.entityIds = entityIds;
            }

            query += `
                RETURN a.id AS sourceId, c.id AS targetId, r1.type AS type1, r2.type AS type2,
                       [r IN relationships(path) | r.type] AS pathTypes,
                       length(path) AS pathLength
                LIMIT 1000
            `;

            const result = await session.run(query, params);

            for (const record of result.records) {
                const sourceId = record.get('sourceId');
                const targetId = record.get('targetId');
                const type1 = record.get('type1') as RelationType;
                const type2 = record.get('type2') as RelationType;
                const pathLength = record.get('pathLength').toNumber();

                // Determine inferred relationship type (use the first type in the path)
                const inferredType = this.inferRelationshipType(type1, type2);

                // Calculate confidence: decreases with path length
                const baseConfidence = 0.9;
                const confidence = Math.max(
                    minConfidence,
                    baseConfidence * Math.pow(0.8, pathLength - 1)
                );

                // Get source entities for provenance
                const sources = await this.getPathEntities(sourceId, targetId, pathLength);

                inferred.push({
                    sourceId,
                    targetId,
                    type: inferredType,
                    inference: {
                        inferenceType: 'transitive',
                        confidence,
                        sources,
                        timestamp: new Date().toISOString(),
                        metadata: {
                            pathLength,
                            pathTypes: record.get('pathTypes')
                        }
                    }
                });
            }
        } finally {
            await session.close();
        }

        return inferred;
    }

    /**
     * Apply type-based inference rules
     * Rule: If PolicyDocument applies to SpatialUnit and Regulation is part of PolicyDocument,
     *       then Regulation applies to SpatialUnit
     */
    private async applyTypeBasedRules(
        minConfidence: number,
        entityIds?: string[]
    ): Promise<InferredRelationship[]> {
        const session = this.driver.session();
        const inferred: InferredRelationship[] = [];

        try {
            let query = `
                MATCH (doc:Entity {type: 'PolicyDocument'})-[r1:RELATES_TO]->(spatial:Entity {type: 'SpatialUnit'})
                MATCH (doc)-[r2:RELATES_TO]->(reg:Entity {type: 'Regulation'})
                WHERE r2.type IN ['contains', 'defines', 'specifies']
                AND NOT EXISTS {
                    MATCH (reg)-[:RELATES_TO]->(spatial)
                }
            `;

            const params: Record<string, unknown> = {};

            if (entityIds && entityIds.length > 0) {
                query += ` AND (reg.id IN $entityIds OR spatial.id IN $entityIds)`;
                params.entityIds = entityIds;
            }

            query += `
                RETURN reg.id AS sourceId, spatial.id AS targetId, doc.id AS docId
                LIMIT 500
            `;

            const result = await session.run(query, params);

            for (const record of result.records) {
                const sourceId = record.get('sourceId');
                const targetId = record.get('targetId');
                const docId = record.get('docId');

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
                            rule: 'policy-document-regulation-spatial'
                        }
                    }
                });
            }
        } finally {
            await session.close();
        }

        return inferred;
    }

    /**
     * Apply temporal inference rules
     * Rule: If document A supersedes document B, and B relates to entity C,
     *       then A also relates to C (with lower confidence if temporal distance is large)
     */
    private async applyTemporalRules(
        minConfidence: number,
        entityIds?: string[]
    ): Promise<InferredRelationship[]> {
        const session = this.driver.session();
        const inferred: InferredRelationship[] = [];

        try {
            let query = `
                MATCH (newDoc:Entity {type: 'PolicyDocument'})-[supersedes:RELATES_TO {type: 'supersedes'}]->(oldDoc:Entity {type: 'PolicyDocument'})
                MATCH (oldDoc)-[oldRel:RELATES_TO]->(target:Entity)
                WHERE NOT EXISTS {
                    MATCH (newDoc)-[:RELATES_TO]->(target)
                }
            `;

            const params: Record<string, unknown> = {};

            if (entityIds && entityIds.length > 0) {
                query += ` AND (newDoc.id IN $entityIds OR target.id IN $entityIds)`;
                params.entityIds = entityIds;
            }

            query += `
                RETURN newDoc.id AS sourceId, target.id AS targetId, oldRel.type AS relType,
                       newDoc.date AS newDate, oldDoc.date AS oldDate, oldDoc.id AS oldDocId
                LIMIT 500
            `;

            const result = await session.run(query, params);

            for (const record of result.records) {
                const sourceId = record.get('sourceId');
                const targetId = record.get('targetId');
                const relType = record.get('relType') as RelationType;
                const newDate = record.get('newDate');
                const oldDate = record.get('oldDate');
                const oldDocId = record.get('oldDocId');

                // Calculate confidence based on temporal distance
                let confidence = 0.8;
                if (newDate && oldDate) {
                    const dateDiff = Math.abs(
                        new Date(newDate).getTime() - new Date(oldDate).getTime()
                    );
                    const yearsDiff = dateDiff / (1000 * 60 * 60 * 24 * 365);
                    // Decrease confidence if documents are far apart in time
                    confidence = Math.max(minConfidence, 0.8 - yearsDiff * 0.1);
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
                            oldDate
                        }
                    }
                });
            }
        } finally {
            await session.close();
        }

        return inferred;
    }

    /**
     * Apply hierarchical inference rules
     * Rule: If parent jurisdiction has a regulation, child jurisdictions inherit it
     */
    private async applyHierarchicalRules(
        minConfidence: number,
        entityIds?: string[]
    ): Promise<InferredRelationship[]> {
        const session = this.driver.session();
        const inferred: InferredRelationship[] = [];

        try {
            let query = `
                MATCH (parent:Entity {type: 'PolicyDocument'})-[parentRel:RELATES_TO]->(target:Entity)
                MATCH (child:Entity {type: 'PolicyDocument'})-[hier:RELATES_TO {type: 'partOf'}]->(parent)
                WHERE NOT EXISTS {
                    MATCH (child)-[:RELATES_TO]->(target)
                }
            `;

            const params: Record<string, unknown> = {};

            if (entityIds && entityIds.length > 0) {
                query += ` AND (child.id IN $entityIds OR target.id IN $entityIds)`;
                params.entityIds = entityIds;
            }

            query += `
                RETURN child.id AS sourceId, target.id AS targetId, parentRel.type AS relType,
                       parent.id AS parentId
                LIMIT 500
            `;

            const result = await session.run(query, params);

            for (const record of result.records) {
                const sourceId = record.get('sourceId');
                const targetId = record.get('targetId');
                const relType = record.get('relType') as RelationType;
                const parentId = record.get('parentId');

                // Use minConfidence as minimum, but apply hierarchical confidence calculation
                const baseConfidence = 0.75; // Moderate confidence for hierarchical inheritance
                const confidence = Math.max(minConfidence, baseConfidence);

                inferred.push({
                    sourceId,
                    targetId,
                    type: relType,
                    inference: {
                        inferenceType: 'hierarchical',
                        confidence,
                        sources: [parentId],
                        timestamp: new Date().toISOString(),
                        metadata: {
                            rule: 'hierarchical-inheritance'
                        }
                    }
                });
            }
        } finally {
            await session.close();
        }

        return inferred;
    }

    /**
     * Store inferred relationships in the graph with inference metadata
     */
    private async storeInferredRelationships(relationships: InferredRelationship[]): Promise<void> {
        if (relationships.length === 0) return;

        const session = this.driver.session();

        try {
            // Use UNWIND for batch processing
            const query = `
                UNWIND $relationships AS rel
                MATCH (source:Entity {id: rel.sourceId})
                MATCH (target:Entity {id: rel.targetId})
                MERGE (source)-[r:RELATES_TO {type: rel.type}]->(target)
                SET r.inferred = true,
                    r.inferenceType = rel.inferenceType,
                    r.inferenceConfidence = rel.confidence,
                    r.inferenceSources = rel.sources,
                    r.inferenceTimestamp = rel.timestamp,
                    r.inferenceMetadata = $metadata
            `;

            const params = {
                relationships: relationships.map(rel => ({
                    sourceId: rel.sourceId,
                    targetId: rel.targetId,
                    type: rel.type,
                    inferenceType: rel.inference.inferenceType,
                    confidence: rel.inference.confidence,
                    sources: rel.inference.sources,
                    timestamp: rel.inference.timestamp
                })),
                metadata: relationships[0].inference.metadata ? JSON.stringify(relationships[0].inference.metadata) : null
            };

            await session.run(query, params);
        } finally {
            await session.close();
        }
    }

    /**
     * Get entities along a path for provenance tracking
     */
    private async getPathEntities(sourceId: string, targetId: string, pathLength: number): Promise<string[]> {
        const session = this.driver.session();

        try {
            const result = await session.run(
                `
                MATCH path = (source:Entity {id: $sourceId})-[*1..${pathLength}]->(target:Entity {id: $targetId})
                RETURN [n IN nodes(path) | n.id] AS entityIds
                LIMIT 1
                `,
                { sourceId, targetId }
            );

            if (result.records.length > 0) {
                return result.records[0].get('entityIds') as string[];
            }
            return [sourceId, targetId];
        } finally {
            await session.close();
        }
    }

    /**
     * Infer relationship type from two relationship types in a path
     */
    private inferRelationshipType(type1: RelationType, type2: RelationType): RelationType {
        // If types are the same, use that type
        if (type1 === type2) {
            return type1;
        }

        // Special cases for common combinations
        const typeMap: Record<string, RelationType> = {
            'appliesTo,appliesTo': RelationType.APPLIES_TO,
            'contains,appliesTo': RelationType.APPLIES_TO,
            'defines,appliesTo': RelationType.APPLIES_TO,
            'partOf,appliesTo': RelationType.APPLIES_TO,
            'references,references': RelationType.RELATED_TO,
            'supersedes,supersedes': RelationType.OVERRIDES
        };

        const key = `${type1},${type2}`;
        if (typeMap[key]) {
            return typeMap[key];
        }

        // Default to the first type
        return type1;
    }

    /**
     * Query entities including inferred relationships
     * This method enhances query results with inferred relationships
     */
    async queryWithInference(
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
        const session = this.driver.session();

        try {
            let query = `
                MATCH (source:Entity {id: $entityId})-[r:RELATES_TO]->(target:Entity)
            `;

            if (!includeInferred) {
                query += ` WHERE r.inferred IS NULL OR r.inferred = false`;
            }

            query += ` RETURN source, target, r.type AS relType, r.inferred AS inferred, r.inferenceConfidence AS confidence`;

            const result = await session.run(query, { entityId });

            if (result.records.length === 0) {
                // Entity not found
                const entityResult = await session.run(
                    'MATCH (e:Entity {id: $entityId}) RETURN e',
                    { entityId }
                );
                if (entityResult.records.length === 0) {
                    throw new Error(`Entity ${entityId} not found`);
                }
                const entity = this.neo4jNodeToEntity(entityResult.records[0].get('e'));
                return { entity, relationships: [] };
            }

            const entity = this.neo4jNodeToEntity(result.records[0].get('source'));
            const relationships = result.records.map(record => ({
                target: this.neo4jNodeToEntity(record.get('target')),
                type: record.get('relType') as RelationType,
                inferred: record.get('inferred') === true,
                confidence: record.get('confidence') ? parseFloat(record.get('confidence')) : undefined
            }));

            return { entity, relationships };
        } finally {
            await session.close();
        }
    }

    /**
     * Convert Neo4j node to BaseEntity (simplified version)
     */
    private neo4jNodeToEntity(node: { properties: Record<string, unknown> }): BaseEntity {
        const props = node.properties;
        return {
            id: props.id as string,
            type: props.type as EntityType,
            name: props.name as string,
            description: props.description as string | undefined,
            uri: props.uri as string | undefined,
            schemaType: props.schemaType as string | undefined,
            metadata: props.metadata ? JSON.parse(props.metadata as string) : {}
        };
    }
}

