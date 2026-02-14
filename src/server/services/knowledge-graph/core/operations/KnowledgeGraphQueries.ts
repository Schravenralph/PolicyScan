/**
 * Knowledge Graph Query Operations
 * Handles query and retrieval operations for the knowledge graph
 */

import { Driver, int, Integer } from 'neo4j-driver';
import type { BaseEntity, EntityType, Relation, Regulation } from '../../../../domain/ontology.js';
import { RelationType } from '../../../../domain/ontology.js';
import type { KnowledgeGraphQueriesOperations, KnowledgeGraphQueriesDependencies } from './KnowledgeGraphQueriesInterface.js';
import type { NeighborCounts } from '../KnowledgeGraphInterface.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Implementation of Knowledge Graph Query operations
 */
export class KnowledgeGraphQueries implements KnowledgeGraphQueriesOperations {
    constructor(private dependencies: KnowledgeGraphQueriesDependencies) {}

    /**
     * Search entities by keywords in name or description
     */
    async searchEntities(keywords: string[]): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            // Build Cypher query with keyword matching
            const conditions = keywords.map((_, i) => 
                `(e.name CONTAINS $keyword${i} OR e.description CONTAINS $keyword${i})`
            ).join(' OR ');

            const params: Record<string, string> = {};
            keywords.forEach((keyword, i) => {
                params[`keyword${i}`] = keyword;
            });

            const query = `
                MATCH (e:Entity)
                WHERE ${conditions}
                RETURN e
                LIMIT 100
            `;

            const result = await session.run(query, params);
            return result.records.map(record => this.dependencies.neo4jNodeToEntity(record.get('e')));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all neighbors of a node (outgoing edges)
     * Supports multi-hop traversals
     */
    async getNeighbors(id: string, relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            let query: string;
            const params: { id: string; maxHops: number; relationType?: RelationType } = { id, maxHops };

            if (relationType) {
                query = `
                    MATCH (source:Entity {id: $id})-[r:RELATES_TO*1..${maxHops}]->(target:Entity)
                    WHERE ALL(rel IN r WHERE rel.type = $relationType)
                    RETURN DISTINCT target
                `;
                params.relationType = relationType;
            } else {
                query = `
                    MATCH (source:Entity {id: $id})-[r:RELATES_TO*1..${maxHops}]->(target:Entity)
                    RETURN DISTINCT target
                `;
            }

            const result = await session.run(query, params);

            return result.records.map(record => this.dependencies.neo4jNodeToEntity(record.get('target')));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all neighbors of multiple nodes (outgoing edges) in a batch
     * Supports multi-hop traversals
     */
    async getNeighborsBatch(ids: string[], relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        if (ids.length === 0) return [];
        const session = this.dependencies.driver.session();

        try {
            let query: string;
            const params: { ids: string[]; maxHops: number; relationType?: RelationType } = { ids, maxHops };

            if (relationType) {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO*1..${maxHops}]->(target:Entity)
                    WHERE source.id IN $ids AND ALL(rel IN r WHERE rel.type = $relationType)
                    RETURN DISTINCT target
                `;
                params.relationType = relationType;
            } else {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO*1..${maxHops}]->(target:Entity)
                    WHERE source.id IN $ids
                    RETURN DISTINCT target
                `;
            }

            const result = await session.run(query, params);

            return result.records.map(record => this.dependencies.neo4jNodeToEntity(record.get('target')));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes that point to a specific node (incoming edges)
     * Supports multi-hop traversals
     */
    async getIncomingNeighbors(id: string, relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            let query: string;
            const params: { id: string; maxHops: number; relationType?: RelationType } = { id, maxHops };

            if (relationType) {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO*1..${maxHops}]->(target:Entity {id: $id})
                    WHERE ALL(rel IN r WHERE rel.type = $relationType)
                    RETURN DISTINCT source
                `;
                params.relationType = relationType;
            } else {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO*1..${maxHops}]->(target:Entity {id: $id})
                    RETURN DISTINCT source
                `;
            }

            const result = await session.run(query, params);

            return result.records.map(record => this.dependencies.neo4jNodeToEntity(record.get('source')));
        } finally {
            await session.close();
        }
    }

    /**
     * Get relationships between multiple entities efficiently
     * Returns all relationships where both source and target are in the provided entity IDs
     */
    async getRelationshipsBetweenEntities(entityIds: string[]): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        if (entityIds.length === 0) return [];
        
        const session = this.dependencies.driver.session();
        try {
            const query = `
                MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity)
                WHERE source.id IN $entityIds AND target.id IN $entityIds
                RETURN source.id AS sourceId, target.id AS targetId, r.type AS type
            `;
            
            const result = await session.run(query, { entityIds });
            
            return result.records.map(record => ({
                sourceId: record.get('sourceId'),
                targetId: record.get('targetId'),
                type: record.get('type') as RelationType
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all outgoing relationships for an entity
     */
    async getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const session = this.dependencies.driver.session();
        try {
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
        } finally {
            await session.close();
        }
    }

    /**
     * Get all incoming relationships for an entity
     */
    async getIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const session = this.dependencies.driver.session();
        try {
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
        } finally {
            await session.close();
        }
    }

    /**
     * Get neighbor counts (outgoing and incoming) efficiently
     */
    async getNeighborCounts(id: string): Promise<NeighborCounts> {
        const session = this.dependencies.driver.session();

        try {
            // Efficient Cypher query using OPTIONAL MATCH with DISTINCT counts
            // Returns distinct neighbor counts and type breakdowns in a single query
            const query = `
                MATCH (n:Entity {id: $id})
                OPTIONAL MATCH (n)-[r_out:RELATES_TO]->(out)
                WITH n, count(DISTINCT out) as outgoingTotal,
                     [x IN collect(DISTINCT [out.id, r_out.type]) WHERE x[0] IS NOT NULL | x[1]] as outgoingTypes
                OPTIONAL MATCH (n)<-[r_in:RELATES_TO]-(inc)
                RETURN outgoingTotal, outgoingTypes, count(DISTINCT inc) as incomingTotal,
                       [x IN collect(DISTINCT [inc.id, r_in.type]) WHERE x[0] IS NOT NULL | x[1]] as incomingTypes
            `;

            const result = await session.run(query, { id });

            if (result.records.length === 0) {
                return {
                    outgoing: { total: 0, byType: {} },
                    incoming: { total: 0, byType: {} }
                };
            }

            const record = result.records[0];
            const outgoingTotal = record.get('outgoingTotal').toNumber();
            const outgoingTypes = record.get('outgoingTypes') as string[];
            const incomingTotal = record.get('incomingTotal').toNumber();
            const incomingTypes = record.get('incomingTypes') as string[];

            const countByType = (types: string[]) => {
                const counts: Record<string, number> = {};
                for (const type of types) {
                    counts[type] = (counts[type] || 0) + 1;
                }
                return counts;
            };

            return {
                outgoing: {
                    total: outgoingTotal,
                    byType: countByType(outgoingTypes)
                },
                incoming: {
                    total: incomingTotal,
                    byType: countByType(incomingTypes)
                }
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get applicable regulations for a given spatial unit or land use
     */
    async getApplicableRegulations(entityId: string): Promise<Regulation[]> {
        const regulations = await this.getIncomingNeighbors(entityId, RelationType.APPLIES_TO);
        return regulations.filter((node): node is Regulation => node.type === 'Regulation');
    }

    /**
     * Get the entire graph structure (for debugging/visualization)
     * WARNING: This can be slow for large graphs. Use with limit.
     */
    async getGraphSnapshot(limit: number = 10000): Promise<{ nodes: BaseEntity[]; edges: Relation[] }> {
        const session = this.dependencies.driver.session();

        try {
            // Ensure limit is a Neo4j integer (not JavaScript number)
            const intLimit = int(Math.floor(limit));
            
            // Valid semantic entity types - filter out dates, numbers, and other non-semantic entities
            const validTypes = ['PolicyDocument', 'Regulation', 'SpatialUnit', 'LandUse', 'Requirement', 'Concept'];
            
            // Get nodes - only return valid semantic entity types
            const nodesResult = await session.run(
                `MATCH (e:Entity)
                 WHERE e.type IN $validTypes
                 RETURN e 
                 LIMIT $limit`,
                { limit: intLimit, validTypes }
            );

            const nodes = nodesResult.records.map(record => this.dependencies.neo4jNodeToEntity(record.get('e')));

            // Get edges - only include relationships between valid semantic entities
            const edgesResult = await session.run(
                `MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity)
                 WHERE source.type IN $validTypes AND target.type IN $validTypes
                 RETURN source.id as sourceId, target.id as targetId, r.type as type, r.metadata as metadata
                 LIMIT $limit`,
                { limit: intLimit, validTypes }
            );

            const edges: Relation[] = edgesResult.records.map(record => {
                const metadataValue = record.get('metadata');
                let metadata: Record<string, unknown> | undefined = undefined;
                
                if (metadataValue) {
                    if (typeof metadataValue === 'string') {
                        try {
                            metadata = JSON.parse(metadataValue);
                        } catch (error) {
                            logger.warn({ error, edgeId: (record.get('id') as string) || 'unknown' }, 'Failed to parse edge metadata');
                            // Leave metadata undefined if parsing fails
                        }
                    } else if (typeof metadataValue === 'object' && metadataValue !== null) {
                        // Already an object, use it directly
                        metadata = metadataValue as Record<string, unknown>;
                    }
                }
                
                return {
                    sourceId: record.get('sourceId'),
                    targetId: record.get('targetId'),
                    type: record.get('type') as RelationType,
                    metadata
                };
            });

            return { nodes, edges };
        } finally {
            await session.close();
        }
    }

    /**
     * Get graph statistics
     */
    async getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
        const session = this.dependencies.driver.session();

        try {
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
        } finally {
            await session.close();
        }
    }

    /**
     * Get entity type distribution (optimized for clustering)
     */
    async getEntityTypeDistribution(): Promise<Record<string, number>> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                'MATCH (e:Entity) RETURN e.type as type, count(e) as count'
            );

            const distribution: Record<string, number> = {};
            result.records.forEach(record => {
                const type = record.get('type');
                const count = record.get('count')?.toNumber() ?? 0;
                if (type) {
                    distribution[type] = count;
                }
            });

            return distribution;
        } finally {
            await session.close();
        }
    }

    /**
     * Get jurisdiction distribution (optimized for clustering)
     */
    async getJurisdictionDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                `
                MATCH (e:Entity {type: 'PolicyDocument'})
                WHERE e.jurisdiction IS NOT NULL
                RETURN e.jurisdiction as jurisdiction, count(e) as count, collect(e.id) as entityIds
                `
            );

            const distribution: Record<string, { count: number; entityIds: string[] }> = {};
            result.records.forEach(record => {
                const jurisdiction = record.get('jurisdiction');
                const count = record.get('count')?.toNumber() ?? 0;
                const entityIds = record.get('entityIds') as string[];

                if (jurisdiction) {
                    distribution[jurisdiction] = { count, entityIds };
                }
            });

            return distribution;
        } finally {
            await session.close();
        }
    }

    /**
     * Count edges between two entity types
     */
    async countEdgesBetweenTypes(sourceType: EntityType, targetType: EntityType): Promise<number> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                `
                MATCH (source:Entity {type: $sourceType})-[r:RELATES_TO]->(target:Entity {type: $targetType})
                RETURN count(r) as count
                `,
                { sourceType, targetType }
            );

            return result.records[0]?.get('count')?.toNumber() ?? 0;
        } finally {
            await session.close();
        }
    }

    /**
     * Get entities grouped by type (for entity-type clustering)
     */
    async getEntitiesByType(type: EntityType, limit?: number): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            let query = 'MATCH (e:Entity {type: $type}) RETURN e';
            const params: { type: EntityType; limit?: ReturnType<typeof int> } = { type };
            
            if (limit) {
                query += ' LIMIT $limit';
                params.limit = int(limit);
            }

            const result = await session.run(query, params);
            return result.records.map(record => {
                const node = record.get('e');
                return this.dependencies.neo4jNodeToEntity(node as { properties: Record<string, unknown> });
            });
        } finally {
            await session.close();
        }
    }
}



