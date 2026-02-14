/**
 * KnowledgeGraphNeo4j - Low-level Neo4j operations for Knowledge Graph (DEPRECATED)
 * 
 * This service provides direct Neo4j database operations for entities and relationships.
 * It handles schema conversion, query execution, and result mapping.
 * 
 * Note: GraphDB is the knowledge graph backend. This Neo4j implementation is deprecated
 * and should not be used for new knowledge graph operations.
 */

import { Driver, Session, Integer } from 'neo4j-driver';
import {
    BaseEntity,
    Relation,
    RelationType,
    EntityType,
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement
} from '../../../domain/ontology.js';

export interface Neo4jEntityProperties {
    id: string;
    type: EntityType;
    name: string;
    description?: string;
    uri?: string;
    schemaType?: string;
    metadata?: string; // JSON string
    createdAt: string;
    updatedAt: string;
    // Type-specific properties
    documentType?: string;
    jurisdiction?: string;
    date?: string;
    status?: string;
    url?: string;
    category?: string;
    spatialType?: string;
    geometry?: string;
    metric?: string;
    operator?: string;
    value?: number | string;
    unit?: string;
}

export interface Neo4jRelationshipProperties {
    type: RelationType;
    createdAt: string;
    metadata?: string; // JSON string
}

export class KnowledgeGraphNeo4j {
    constructor(private driver: Driver) {}

    /**
     * Convert BaseEntity to Neo4j properties
     */
    entityToNeo4jProperties(entity: BaseEntity): Neo4jEntityProperties {
        const properties: Neo4jEntityProperties = {
            id: entity.id,
            type: entity.type,
            name: entity.name,
            ...(entity.description && { description: entity.description }),
            ...(entity.uri && { uri: entity.uri }),
            ...(entity.schemaType && { schemaType: entity.schemaType }),
            ...(entity.metadata && { metadata: JSON.stringify(entity.metadata) }),
            createdAt: entity.createdAt || new Date().toISOString(),
            updatedAt: entity.updatedAt || new Date().toISOString()
        };

        // Add type-specific properties
        if (entity.type === 'PolicyDocument') {
            const pd = entity as PolicyDocument;
            properties.documentType = pd.documentType;
            properties.jurisdiction = pd.jurisdiction;
            properties.date = pd.date;
            properties.status = pd.status;
            if (pd.url) properties.url = pd.url;
        } else if (entity.type === 'Regulation') {
            const reg = entity as Regulation;
            properties.category = reg.category;
        } else if (entity.type === 'SpatialUnit') {
            const su = entity as SpatialUnit;
            properties.spatialType = su.spatialType;
            if (su.geometry) properties.geometry = JSON.stringify(su.geometry);
        } else if (entity.type === 'LandUse') {
            const lu = entity as LandUse;
            properties.category = lu.category;
        } else if (entity.type === 'Requirement') {
            const req = entity as Requirement;
            properties.metric = req.metric;
            properties.operator = req.operator;
            properties.value = req.value;
            if (req.unit) properties.unit = req.unit;
        }

        return properties;
    }

    /**
     * Convert Neo4j node to BaseEntity
     */
    neo4jNodeToEntity(node: { properties: Record<string, unknown> }): BaseEntity {
        const properties = node.properties;
        
        const baseEntity: BaseEntity = {
            id: properties.id as string,
            type: properties.type as EntityType,
            name: properties.name as string,
        };
        
        if (properties.description) {
            baseEntity.description = properties.description as string;
        }
        if (properties.uri) {
            baseEntity.uri = properties.uri as string;
        }
        if (properties.schemaType) {
            baseEntity.schemaType = properties.schemaType as string;
        }
        if (properties.metadata) {
            baseEntity.metadata = JSON.parse(properties.metadata as string) as Record<string, unknown>;
        } else {
            baseEntity.metadata = {};
        }
        if (properties.createdAt) {
            baseEntity.createdAt = properties.createdAt as string;
        }
        if (properties.updatedAt) {
            baseEntity.updatedAt = properties.updatedAt as string;
        }

        // Helper function to convert Neo4j Integer objects to JavaScript numbers
        const toNumber = (value: unknown): number | undefined => {
            if (value === undefined || value === null) return undefined;
            if (typeof value === 'number') return value;
            if (typeof value === 'bigint') return Number(value);
            // Check if it's a Neo4j Integer object (has toNumber method)
            if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as Integer).toNumber === 'function') {
                return (value as Integer).toNumber();
            }
            // Check if it's a Neo4j Integer object with low/high properties
            if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
                const intValue = value as { low: number; high: number };
                return intValue.low + (intValue.high * 0x100000000);
            }
            return undefined;
        };

        // Include GDS metrics in metadata if present
        const communityIdNum = toNumber(properties.communityId);
        if (communityIdNum !== undefined) {
            baseEntity.metadata.communityId = communityIdNum;
        }
        const pagerankNum = toNumber(properties.pagerank);
        if (pagerankNum !== undefined) {
            baseEntity.metadata.pagerank = pagerankNum;
        }
        const betweennessNum = toNumber(properties.betweenness);
        if (betweennessNum !== undefined) {
            baseEntity.metadata.betweenness = betweennessNum;
        }
        const degreeNum = toNumber(properties.degree);
        if (degreeNum !== undefined) {
            baseEntity.metadata.degree = degreeNum;
        }
        const eigenvectorNum = toNumber(properties.eigenvector);
        if (eigenvectorNum !== undefined) {
            baseEntity.metadata.eigenvector = eigenvectorNum;
        }

        // Add type-specific properties
        if (baseEntity.type === 'PolicyDocument') {
            const pd = baseEntity as PolicyDocument;
            pd.documentType = properties.documentType as PolicyDocument['documentType'];
            pd.jurisdiction = properties.jurisdiction as string;
            pd.date = properties.date as string;
            pd.status = properties.status as PolicyDocument['status'];
            if (properties.url) pd.url = properties.url as string;
            return pd;
        } else if (baseEntity.type === 'Regulation') {
            const reg = baseEntity as Regulation;
            reg.category = properties.category as Regulation['category'];
            return reg;
        } else if (baseEntity.type === 'SpatialUnit') {
            const su = baseEntity as SpatialUnit;
            su.spatialType = properties.spatialType as SpatialUnit['spatialType'];
            if (properties.geometry) su.geometry = JSON.parse(properties.geometry as string);
            return su;
        } else if (baseEntity.type === 'LandUse') {
            const lu = baseEntity as LandUse;
            lu.category = properties.category as string;
            return lu;
        } else if (baseEntity.type === 'Requirement') {
            const req = baseEntity as Requirement;
            req.metric = properties.metric as string;
            req.operator = properties.operator as Requirement['operator'];
            req.value = properties.value as number | string;
            if (properties.unit) req.unit = properties.unit as string;
            return req;
        }

        return baseEntity;
    }

    /**
     * Save entity to Neo4j
     */
    async saveEntity(session: Session, entity: BaseEntity, branch?: string | null): Promise<void> {
        const properties = this.entityToNeo4jProperties(entity);
        
        // Branch handling: null for main, branch name for others, undefined means no branch tracking
        const branchValue = branch === undefined ? undefined : (branch === 'main' ? null : branch);
        
        await session.run(
            `
            MERGE (e:Entity {id: $id})
            SET e = $properties
            ${branchValue !== undefined ? 'SET e.branch = $branchValue' : ''}
            SET e.updatedAt = datetime()
            ON CREATE SET e.createdAt = datetime()
            RETURN e
            `,
            { 
                id: entity.id, 
                properties,
                ...(branchValue !== undefined && { branchValue })
            }
        );
    }

    /**
     * Save multiple entities in bulk
     */
    async saveEntitiesBulk(session: Session, entities: BaseEntity[]): Promise<void> {
        const batchData = entities.map(entity => ({
            id: entity.id,
            properties: this.entityToNeo4jProperties(entity)
        }));

        await session.run(
            `
            UNWIND $batch AS entity
            MERGE (e:Entity {id: entity.id})
            SET e = entity.properties
            RETURN e.id as id
            `,
            { batch: batchData }
        );
    }

    /**
     * Load entity from Neo4j by ID
     */
    async loadEntity(session: Session, id: string): Promise<BaseEntity | null> {
        const result = await session.run(
            'MATCH (e:Entity {id: $id}) RETURN e',
            { id }
        );

        if (result.records.length === 0) {
            return null;
        }

        return this.neo4jNodeToEntity(result.records[0].get('e'));
    }

    /**
     * Load entity from Neo4j by URI
     */
    async loadEntityByUri(session: Session, uri: string): Promise<BaseEntity | null> {
        const result = await session.run(
            'MATCH (e:Entity {uri: $uri}) RETURN e',
            { uri }
        );

        if (result.records.length === 0) {
            return null;
        }

        return this.neo4jNodeToEntity(result.records[0].get('e'));
    }

    /**
     * Load all entities of a specific type
     */
    async loadEntitiesByType(session: Session, type: EntityType): Promise<BaseEntity[]> {
        const result = await session.run(
            'MATCH (e:Entity {type: $type}) RETURN e',
            { type }
        );

        return result.records.map(record => this.neo4jNodeToEntity(record.get('e')));
    }

    /**
     * Load all entities
     */
    async loadAllEntities(session: Session, limit?: number): Promise<BaseEntity[]> {
        let query = 'MATCH (e:Entity) RETURN e';
        const params: { limit?: Integer } = {};
        
        if (limit) {
            query += ' LIMIT $limit';
            const { int } = await import('neo4j-driver');
            params.limit = int(limit);
        }

        const result = await session.run(query, params);
        return result.records.map(record => this.neo4jNodeToEntity(record.get('e')));
    }

    /**
     * Delete entity from Neo4j
     */
    async deleteEntity(session: Session, id: string): Promise<void> {
        await session.run(
            'MATCH (e:Entity {id: $id}) DETACH DELETE e',
            { id }
        );
    }

    /**
     * Save relationship to Neo4j
     */
    async saveRelationship(
        session: Session,
        sourceId: string,
        targetId: string,
        type: RelationType,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const relProperties: Neo4jRelationshipProperties = {
            type: type,
            createdAt: new Date().toISOString()
        };

        if (metadata) {
            relProperties.metadata = JSON.stringify(metadata);
        }

        await session.run(
            `
            MATCH (source:Entity {id: $sourceId})
            MATCH (target:Entity {id: $targetId})
            MERGE (source)-[r:RELATES_TO {type: $type}]->(target)
            SET r = $properties
            RETURN r
            `,
            {
                sourceId,
                targetId,
                type,
                properties: relProperties
            }
        );
    }

    /**
     * Load relationships for an entity
     */
    async loadRelationships(session: Session, entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const result = await session.run(
            `
            MATCH (source:Entity {id: $entityId})-[r:RELATES_TO]->(target:Entity)
            RETURN source.id AS sourceId, target.id AS targetId, r.type AS type
            `,
            { entityId }
        );

        return result.records.map(record => ({
            sourceId: record.get('sourceId'),
            targetId: record.get('targetId'),
            type: record.get('type') as RelationType
        }));
    }

    /**
     * Load incoming relationships for an entity
     */
    async loadIncomingRelationships(session: Session, entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const result = await session.run(
            `
            MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity {id: $entityId})
            RETURN source.id AS sourceId, target.id AS targetId, r.type AS type
            `,
            { entityId }
        );

        return result.records.map(record => ({
            sourceId: record.get('sourceId'),
            targetId: record.get('targetId'),
            type: record.get('type') as RelationType
        }));
    }

    /**
     * Delete relationship from Neo4j
     */
    async deleteRelationship(
        session: Session,
        sourceId: string,
        targetId: string,
        type: RelationType
    ): Promise<void> {
        await session.run(
            `
            MATCH (source:Entity {id: $sourceId})-[r:RELATES_TO {type: $type}]->(target:Entity {id: $targetId})
            DELETE r
            `,
            { sourceId, targetId, type }
        );
    }

    /**
     * Clear all entities and relationships
     */
    async clearAll(session: Session): Promise<void> {
        await session.run('MATCH (n) DETACH DELETE n');
    }

    /**
     * Get graph statistics
     */
    async getStats(session: Session): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
        const nodeCountResult = await session.run('MATCH (e:Entity) RETURN count(e) as count');
        const nodeCount = nodeCountResult.records[0]?.get('count')?.toNumber() ?? 0;

        const edgeCountResult = await session.run('MATCH ()-[r:RELATES_TO]->() RETURN count(r) as count');
        const edgeCount = edgeCountResult.records[0]?.get('count')?.toNumber() ?? 0;

        const typeResult = await session.run(
            'MATCH (e:Entity) RETURN e.type as type, count(e) as count'
        );

        const typeDistribution: Record<string, number> = {};
        typeResult.records.forEach(record => {
            const type = record.get('type');
            const count = record.get('count')?.toNumber() ?? 0;
            if (type) {
                typeDistribution[type] = count;
            }
        });

        return { nodeCount, edgeCount, typeDistribution };
    }
}








