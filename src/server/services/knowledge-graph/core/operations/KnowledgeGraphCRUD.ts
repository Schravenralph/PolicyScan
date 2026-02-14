/**
 * Knowledge Graph CRUD Operations
 * Handles basic create, read, update, delete operations for the knowledge graph
 */

import { Integer } from 'neo4j-driver';
import {
    BaseEntity,
    EntityType,
    RelationType,
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement,
    generateSchemaOrgUri,
    isValidSchemaOrgUri,
} from '../../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../../models/FeatureFlag.js';
import type { KnowledgeGraphCRUDOperations, KnowledgeGraphCRUDDependencies } from './KnowledgeGraphCRUDInterface.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Implementation of Knowledge Graph CRUD operations
 */
export class KnowledgeGraphCRUD implements KnowledgeGraphCRUDOperations {
    constructor(private dependencies: KnowledgeGraphCRUDDependencies) {}

    /**
     * Add a single node to the knowledge graph
     */
    async addNode(node: BaseEntity): Promise<void> {
        // Check if KG extraction is enabled via feature flag
        const kgExtractionEnabled = FeatureFlag.isExtractionEnabled();
        if (!kgExtractionEnabled) {
            // If extraction is disabled, skip adding to graph
            return;
        }

        // Auto-generate URI if not provided
        if (!node.uri) {
            node.uri = generateSchemaOrgUri(node);
        }

        // Check if KG validation is enabled via feature flag
        const kgValidationEnabled = FeatureFlag.isValidationEnabled();

        // Priority 1: Schema Validation (REJECT if invalid) - only if validation is enabled
        if (kgValidationEnabled) {
            // Use DynamicValidator which emits events
            await this.dependencies.dynamicValidator.validateEntity(node);
        }

        // Priority 1: Deduplication Check (WARN if duplicates found) - only if deduplication is enabled
        const kgDeduplicationEnabled = FeatureFlag.isDeduplicationEnabled();
        if (kgDeduplicationEnabled) {
            const duplicates = await this.dependencies.deduplicationService.findDuplicates(node);
            if (duplicates.length > 0) {
                const highConfidenceDuplicates = duplicates.filter((d: any) => d.similarity >= 0.95 && d.confidence >= 0.85);
                if (highConfidenceDuplicates.length > 0) {
                    logger.warn({
                        entityId: node.id,
                        duplicates: highConfidenceDuplicates.map((d: any) => ({
                            id: d.entity.id,
                            similarity: d.similarity,
                            confidence: d.confidence,
                            reason: d.matchReason,
                        })),
                    }, 'High-confidence duplicates found for entity');
                } else {
                    logger.warn({
                        entityId: node.id,
                        duplicates: duplicates.map((d: any) => ({
                            id: d.entity.id,
                            similarity: d.similarity,
                            confidence: d.confidence,
                            reason: d.matchReason,
                        })),
                    }, 'Potential duplicates found for entity');
                }
            }
        }

        // Validate URI format (legacy check, now also in EntitySchemaValidator)
        if (node.uri && !isValidSchemaOrgUri(node.uri)) {
            logger.warn({ uri: node.uri, entityId: node.id }, 'Generated URI may not be fully schema.org compliant');
        }

        const session = this.dependencies.driver.session();

        try {
            // Convert metadata to Neo4j-friendly format
            interface Neo4jProperties {
                id: string;
                type: EntityType;
                name: string;
                description?: string;
                uri?: string;
                schemaType?: string;
                metadata?: string;
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

            const properties: Neo4jProperties = {
                id: node.id,
                type: node.type,
                name: node.name,
                ...(node.description && { description: node.description }),
                ...(node.uri && { uri: node.uri }),
                ...(node.schemaType && { schemaType: node.schemaType }),
                ...(node.metadata && { metadata: JSON.stringify(node.metadata) }),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Add type-specific properties
            if (node.type === 'PolicyDocument') {
                const pd = node as PolicyDocument;
                properties.documentType = pd.documentType;
                properties.jurisdiction = pd.jurisdiction;
                properties.date = pd.date;
                properties.status = pd.status;
                if (pd.url) properties.url = pd.url;
            } else if (node.type === 'Regulation') {
                const reg = node as Regulation;
                properties.category = reg.category;
            } else if (node.type === 'SpatialUnit') {
                const su = node as SpatialUnit;
                properties.spatialType = su.spatialType;
                if (su.geometry) properties.geometry = JSON.stringify(su.geometry);
            } else if (node.type === 'LandUse') {
                const lu = node as LandUse;
                properties.category = lu.category;
            } else if (node.type === 'Requirement') {
                const req = node as Requirement;
                properties.metric = req.metric;
                properties.operator = req.operator;
                properties.value = req.value;
                if (req.unit) properties.unit = req.unit;
            }

            // Check if entity exists before update (for versioning)
            const existingEntityResult = await session.run(
                `MATCH (e:Entity {id: $id}) RETURN e`,
                { id: node.id }
            );
            const entityExists = existingEntityResult.records.length > 0;
            const existingEntity = entityExists ? existingEntityResult.records[0].get('e').properties : null;

            await session.run(
                `
                MERGE (e:Entity {id: $id})
                SET e = $properties
                RETURN e
                `,
                { id: node.id, properties }
            );

            // Create version if entity was updated and versioning is enabled
            if (entityExists && existingEntity) {
                const versioningEnabled = FeatureFlag.isEnabled(KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED, false);
                if (versioningEnabled) {
                    try {
                        const versioningService = await this.dependencies.getVersioningService();
                        if (versioningService) {
                            // Reconstruct existing entity from Neo4j properties
                            let metadata: Record<string, unknown> | undefined = undefined;
                            if (existingEntity.metadata) {
                                if (typeof existingEntity.metadata === 'string') {
                                    try {
                                        metadata = JSON.parse(existingEntity.metadata);
                                    } catch (error) {
                                        logger.warn({ error, entityId: node.id }, 'Failed to parse metadata for versioning of entity');
                                        metadata = undefined;
                                    }
                                } else if (typeof existingEntity.metadata === 'object' && existingEntity.metadata !== null) {
                                    metadata = existingEntity.metadata as Record<string, unknown>;
                                }
                            }
                            
                            const oldEntity: BaseEntity = {
                                id: existingEntity.id,
                                type: existingEntity.type,
                                name: existingEntity.name,
                                description: existingEntity.description,
                                uri: existingEntity.uri,
                                schemaType: existingEntity.schemaType,
                                metadata
                            };
                            
                            // Only create version if entity actually changed
                            if (JSON.stringify(oldEntity) !== JSON.stringify(node)) {
                                await versioningService.createVersion(oldEntity, {
                                    timestamp: new Date().toISOString(),
                                    changeReason: 'Entity updated via addNode',
                                    author: 'system'
                                });
                            }
                        }
                    } catch (error) {
                        // Log but don't fail the update if versioning fails
                        logger.warn({ error, entityId: node.id }, 'Failed to create version for entity');
                    }
                }
            }

            // Priority 2: Truth Discovery & Conflict Resolution - only if enabled
            const kgTruthDiscoveryEnabled = FeatureFlag.isTruthDiscoveryEnabled();
            if (kgTruthDiscoveryEnabled) {
                await this.dependencies.runTruthDiscovery(node);
            }

            // Invalidate traversal cache for this node if caching is enabled
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false)) {
                this.dependencies.invalidateTraversalCacheForNode(node.id);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Bulk insert multiple entities efficiently
     */
    async addNodesBulk(entities: BaseEntity[]): Promise<{ successful: number; failed: number; errors: string[] }> {
        // Check if KG extraction is enabled via feature flag
        const kgExtractionEnabled = FeatureFlag.isExtractionEnabled();
        if (!kgExtractionEnabled) {
            return { successful: 0, failed: entities.length, errors: ['KG extraction is disabled'] };
        }

        const results = { successful: 0, failed: 0, errors: [] as string[] };
        const session = this.dependencies.driver.session();
        const successfulNodeIds: string[] = []; // Track successfully added node IDs

        try {
            // Process in batches of 100 for better performance
            const batchSize = 100;
            for (let i = 0; i < entities.length; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                
                // Prepare batch data
                const batchData = batch.map(node => {
                    // Auto-generate URI if not provided
                    if (!node.uri) {
                        node.uri = generateSchemaOrgUri(node);
                    }

                    // Convert to Neo4j properties
                    interface Neo4jProperties {
                        id: string;
                        type: EntityType;
                        name: string;
                        description?: string;
                        uri?: string;
                        schemaType?: string;
                        metadata?: string;
                        createdAt: string;
                        updatedAt: string;
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

                    const properties: Neo4jProperties = {
                        id: node.id,
                        type: node.type,
                        name: node.name,
                        ...(node.description && { description: node.description }),
                        ...(node.uri && { uri: node.uri }),
                        ...(node.schemaType && { schemaType: node.schemaType }),
                        ...(node.metadata && { metadata: JSON.stringify(node.metadata) }),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    // Add type-specific properties
                    if (node.type === 'PolicyDocument') {
                        const pd = node as PolicyDocument;
                        properties.documentType = pd.documentType;
                        properties.jurisdiction = pd.jurisdiction;
                        properties.date = pd.date;
                        properties.status = pd.status;
                        if (pd.url) properties.url = pd.url;
                    } else if (node.type === 'Regulation') {
                        const reg = node as Regulation;
                        properties.category = reg.category;
                    } else if (node.type === 'SpatialUnit') {
                        const su = node as SpatialUnit;
                        properties.spatialType = su.spatialType;
                        if (su.geometry) properties.geometry = JSON.stringify(su.geometry);
                    } else if (node.type === 'LandUse') {
                        const lu = node as LandUse;
                        properties.category = lu.category;
                    } else if (node.type === 'Requirement') {
                        const req = node as Requirement;
                        properties.metric = req.metric;
                        properties.operator = req.operator;
                        properties.value = req.value;
                        if (req.unit) properties.unit = req.unit;
                    }

                    return { id: node.id, properties };
                });

                // Bulk insert using UNWIND for efficiency
                try {
                    await session.run(
                        `
                        UNWIND $batch AS item
                        MERGE (e:Entity {id: item.id})
                        SET e = item.properties
                        RETURN e.id as id
                        `,
                        { batch: batchData }
                    );

                    // Track successful nodes
                    batch.forEach(node => {
                        successfulNodeIds.push(node.id);
                        results.successful++;
                    });
                } catch (error) {
                    // If batch fails, try individual inserts
                    for (const node of batch) {
                        try {
                            await this.addNode(node);
                            successfulNodeIds.push(node.id);
                            results.successful++;
                        } catch (nodeError) {
                            results.failed++;
                            const errorMessage = nodeError instanceof Error ? nodeError.message : String(nodeError);
                            results.errors.push(`Failed to add node ${node.id}: ${errorMessage}`);
                        }
                    }
                }
            }

            // Invalidate traversal cache for all successfully added nodes if caching is enabled
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false) && successfulNodeIds.length > 0) {
                // Invalidate cache for each node individually since we don't have batch invalidation
                successfulNodeIds.forEach(nodeId => {
                    this.dependencies.invalidateTraversalCacheForNode(nodeId);
                });
            }
        } finally {
            await session.close();
        }

        return results;
    }

    /**
     * Add multiple edges (relationships) to the knowledge graph in bulk
     */
    async addEdgesBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType; metadata?: Record<string, unknown> }>): Promise<{ successful: number; failed: number; errors: string[] }> {
        const results = { successful: 0, failed: 0, errors: [] as string[] };
        const session = this.dependencies.driver.session();

        try {
            // Process in batches of 100 for better performance
            const batchSize = 100;
            for (let i = 0; i < relationships.length; i += batchSize) {
                const batch = relationships.slice(i, i + batchSize);

                const batchData = batch.map(rel => {
                    const properties: Record<string, unknown> = {
                        type: rel.type,
                        createdAt: new Date().toISOString()
                    };
                    if (rel.metadata) {
                        properties.metadata = JSON.stringify(rel.metadata);
                    }
                    return {
                        sourceId: rel.sourceId,
                        targetId: rel.targetId,
                        type: rel.type,
                        properties
                    };
                });

                try {
                    const result = await session.run(
                        `
                        UNWIND $batch AS item
                        MATCH (source:Entity {id: item.sourceId})
                        MATCH (target:Entity {id: item.targetId})
                        MERGE (source)-[r:RELATES_TO {type: item.type}]->(target)
                        SET r = item.properties
                        RETURN item.sourceId AS sourceId, item.targetId AS targetId, item.type AS type
                        `,
                        { batch: batchData }
                    );
                    const actualSuccessCount = result.records.length;
                    results.successful += actualSuccessCount;

                    // If some relationships were silently skipped (source/target node not yet visible),
                    // fall back to individual addEdge which has retry logic for transaction isolation delays
                    if (actualSuccessCount < batch.length) {
                        const successfulSet = new Set(
                            result.records.map(r => `${r.get('sourceId')}|${r.get('targetId')}|${r.get('type')}`)
                        );
                        for (const rel of batch) {
                            const key = `${rel.sourceId}|${rel.targetId}|${rel.type}`;
                            if (!successfulSet.has(key)) {
                                try {
                                    await this.addEdge(rel.sourceId, rel.targetId, rel.type, rel.metadata);
                                    results.successful++;
                                } catch (err) {
                                    results.failed++;
                                    const errorMessage = err instanceof Error ? err.message : String(err);
                                    results.errors.push(`Failed to add relationship ${rel.sourceId}->${rel.targetId}: ${errorMessage}`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    // Fallback to individual
                    for (const rel of batch) {
                        try {
                            await this.addEdge(rel.sourceId, rel.targetId, rel.type, rel.metadata);
                            results.successful++;
                        } catch (err) {
                            results.failed++;
                            const errorMessage = err instanceof Error ? err.message : String(err);
                            results.errors.push(`Failed to add relationship ${rel.sourceId}->${rel.targetId}: ${errorMessage}`);
                        }
                    }
                }
            }

            // Invalidate traversal cache if enabled
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false) && results.successful > 0) {
                 const uniqueTypes = [...new Set(relationships.map(r => r.type))];
                 uniqueTypes.forEach(type => {
                     this.dependencies.invalidateTraversalCacheForRelationship(type);
                 });
                 const uniqueNodeIds = [...new Set(relationships.flatMap(r => [r.sourceId, r.targetId]))];
                 uniqueNodeIds.forEach(nodeId => {
                     this.dependencies.invalidateTraversalCacheForNode(nodeId);
                 });
            }

        } finally {
            await session.close();
        }
        return results;
    }

    /**
     * Delete multiple nodes from the knowledge graph in bulk
     */
    async deleteNodesBulk(ids: string[], softDelete: boolean = true): Promise<{ successful: number; failed: number; errors: string[] }> {
        const results = { successful: 0, failed: 0, errors: [] as string[] };
        if (ids.length === 0) return results;

        const session = this.dependencies.driver.session();

        try {
            const batchSize = 100;
            for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize);

                try {
                    let deleteResult;
                    if (softDelete) {
                        deleteResult = await session.run(
                            `
                            UNWIND $ids AS id
                            MATCH (e:Entity {id: id})
                            SET e.deleted = true, e.deletedAt = datetime()
                            RETURN e.id AS deletedId
                            `,
                            { ids: batch }
                        );
                    } else {
                        deleteResult = await session.run(
                            `
                            UNWIND $ids AS id
                            MATCH (e:Entity {id: id})
                            DETACH DELETE e
                            RETURN id AS deletedId
                            `,
                            { ids: batch }
                        );
                    }
                    results.successful += deleteResult.records.length;
                    const notFound = batch.length - deleteResult.records.length;
                    if (notFound > 0) {
                        results.failed += notFound;
                        results.errors.push(`${notFound} node(s) not found for deletion`);
                    }
                } catch (error) {
                    results.failed += batch.length;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    results.errors.push(`Failed to delete batch: ${errorMessage}`);
                }
            }

            // Invalidate traversal cache for deleted nodes
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false) && results.successful > 0) {
                 ids.forEach(id => {
                     this.dependencies.invalidateTraversalCacheForNode(id);
                 });
            }
        } finally {
            await session.close();
        }
        return results;
    }

    /**
     * Delete multiple relationships from the knowledge graph in bulk
     */
    async deleteRelationshipsBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType }>): Promise<{ successful: number; failed: number; errors: string[] }> {
        const results = { successful: 0, failed: 0, errors: [] as string[] };
        if (relationships.length === 0) return results;

        const session = this.dependencies.driver.session();

        try {
            const batchSize = 100;
            for (let i = 0; i < relationships.length; i += batchSize) {
                const batch = relationships.slice(i, i + batchSize);

                try {
                    const deleteResult = await session.run(
                        `
                        UNWIND $batch AS item
                        MATCH (source:Entity {id: item.sourceId})-[r:RELATES_TO {type: item.type}]->(target:Entity {id: item.targetId})
                        DELETE r
                        RETURN item.sourceId AS sourceId, item.targetId AS targetId
                        `,
                        { batch }
                    );
                    results.successful += deleteResult.records.length;
                    const notFound = batch.length - deleteResult.records.length;
                    if (notFound > 0) {
                        results.failed += notFound;
                        results.errors.push(`${notFound} relationship(s) not found for deletion`);
                    }
                } catch (error) {
                    results.failed += batch.length;
                     const errorMessage = error instanceof Error ? error.message : String(error);
                    results.errors.push(`Failed to delete relationship batch: ${errorMessage}`);
                }
            }

            // Invalidate traversal cache for deleted relationships
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false) && results.successful > 0) {
                const uniqueTypes = [...new Set(relationships.map(r => r.type))];
                uniqueTypes.forEach(type => {
                    this.dependencies.invalidateTraversalCacheForRelationship(type);
                });
            }
        } finally {
            await session.close();
        }
        return results;
    }

    /**
     * Add an edge (relationship) between two entities
     */
    async addEdge(sourceId: string, targetId: string, type: RelationType, metadata?: Record<string, unknown>): Promise<void> {
        // Check if KG validation is enabled via feature flag
        const kgValidationEnabled = FeatureFlag.isValidationEnabled();
        
        // Always check if entities exist (even when validation is disabled) to prevent silent failures
        // Retry the check multiple times to handle Neo4j transaction isolation/consistency delays
        // This is necessary because nodes created in one session may not be immediately visible
        // to queries in another session, even with auto-commit. This is a known Neo4j behavior.
        let sourceEntity: BaseEntity | undefined;
        let targetEntity: BaseEntity | undefined;
        const maxRetries = 10; // Increased retries for test environments
        const retryDelay = 100; // milliseconds - increased delay
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
            
            sourceEntity = await this.getNode(sourceId);
            targetEntity = await this.getNode(targetId);
            
            if (sourceEntity && targetEntity) {
                break;
            }
        }

        // Verify entities exist before attempting to create relationship
        if (!sourceEntity) {
            throw new Error(`Source entity ${sourceId} not found after ${maxRetries} attempts`);
        }
        if (!targetEntity) {
            throw new Error(`Target entity ${targetId} not found after ${maxRetries} attempts`);
        }

        const relation = {
            sourceId,
            targetId,
            type,
            metadata,
        };

        if (kgValidationEnabled) {
            // Use DynamicValidator which emits events
            const validationResult = await this.dependencies.dynamicValidator.validateRelationship(relation, sourceEntity, targetEntity);
            
            if (!validationResult.isValid) {
                const errorMessages = validationResult.errors.join(', ');
                throw new Error(`Relationship validation failed: ${errorMessages}`);
            }

            // Also validate fact plausibility (Priority 2) - non-blocking
            this.dependencies.dynamicValidator.validateFact(relation).catch((error: unknown) => {
                logger.warn({ 
                    error: error instanceof Error ? error : String(error), 
                    relationId: `${relation.sourceId}->${relation.targetId}:${relation.type}` 
                }, 'Error validating fact');
            });
        }

        const session = this.dependencies.driver.session();

        try {
            interface RelationProperties {
                type: RelationType;
                createdAt: string;
                metadata?: string;
            }

            const relProperties: RelationProperties = {
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

            // Invalidate traversal cache for both nodes and relationship type if caching is enabled
            if (FeatureFlag.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false)) {
                this.dependencies.invalidateTraversalCacheForNode(sourceId);
                this.dependencies.invalidateTraversalCacheForNode(targetId);
                this.dependencies.invalidateTraversalCacheForRelationship(type);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Get a node by its ID
     */
    async getNode(id: string): Promise<BaseEntity | undefined> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                'MATCH (e:Entity {id: $id}) RETURN e',
                { id }
            );

            if (result.records.length === 0) {
                return undefined;
            }

            return this.neo4jNodeToEntity(result.records[0].get('e'));
        } finally {
            await session.close();
        }
    }

    /**
     * Get multiple nodes by ID
     */
    async getNodes(ids: string[]): Promise<(BaseEntity | undefined)[]> {
        if (ids.length === 0) {
            return [];
        }

        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                `
                MATCH (e:Entity)
                WHERE e.id IN $ids
                RETURN e
                `,
                { ids }
            );

            const nodesMap = new Map<string, BaseEntity>();
            result.records.forEach(record => {
                const entity = this.neo4jNodeToEntity(record.get('e'));
                nodesMap.set(entity.id, entity);
            });

            return ids.map(id => nodesMap.get(id));
        } finally {
            await session.close();
        }
    }

    /**
     * Get a node by its schema.org URI
     */
    async getNodeByUri(uri: string): Promise<BaseEntity | undefined> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                'MATCH (e:Entity {uri: $uri}) RETURN e',
                { uri }
            );

            if (result.records.length === 0) {
                return undefined;
            }

            return this.neo4jNodeToEntity(result.records[0].get('e'));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes of a specific type
     */
    async getNodesByType(type: EntityType): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            const result = await session.run(
                'MATCH (e:Entity {type: $type}) RETURN e',
                { type }
            );

            return result.records.map(record => this.neo4jNodeToEntity(record.get('e')));
        } finally {
            await session.close();
        }
    }

    /**
     * Find nodes of a specific type where the name contains the given substring (case-insensitive)
     */
    async findNodesByNameSubstring(type: EntityType, substring: string): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();

        try {
            // Escape special regex characters in substring
            const escapedSubstring = substring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Replace spaces with \s+ to match one or more whitespace characters
            const regexPattern = escapedSubstring.replace(/\s+/g, '\\s+');
            
            const result = await session.run(
                'MATCH (e:Entity {type: $type}) WHERE e.name =~ $regex RETURN e',
                { 
                    type, 
                    regex: `(?i).*${regexPattern}.*` 
                }
            );

            return result.records.map(record => this.neo4jNodeToEntity(record.get('e')));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes in the graph
     */
    async getAllNodes(): Promise<BaseEntity[]> {
        const session = this.dependencies.driver.session();
        try {
            const result = await session.run('MATCH (e:Entity) RETURN e');
            return result.records.map(record => this.neo4jNodeToEntity(record.get('e')));
        } finally {
            await session.close();
        }
    }

    /**
     * Clear all nodes and relationships from the graph
     */
    async clear(): Promise<void> {
        const session = this.dependencies.driver.session();

        try {
            await session.run('MATCH (n) DETACH DELETE n');
            logger.info('Knowledge graph cleared from GraphDB');
        } finally {
            await session.close();
        }
    }

    /**
     * Convert Neo4j node to BaseEntity
     */
    neo4jNodeToEntity(node: { properties: Record<string, unknown> }): BaseEntity {
        const properties = node.properties;
        
        // Validate required fields
        if (!properties.id || typeof properties.id !== 'string') {
            throw new Error(`Invalid entity: missing or invalid id property`);
        }
        if (!properties.type || typeof properties.type !== 'string') {
            throw new Error(`Invalid entity ${properties.id}: missing or invalid type property`);
        }
        if (!properties.name || typeof properties.name !== 'string') {
            throw new Error(`Invalid entity ${properties.id}: missing or invalid name property`);
        }
        
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
            // Handle metadata - it might be a string (JSON) or already an object
            if (typeof properties.metadata === 'string') {
                try {
                    baseEntity.metadata = JSON.parse(properties.metadata) as Record<string, unknown>;
                } catch (error) {
                    logger.warn({ error, entityId: properties.id }, 'Failed to parse metadata for entity');
                    baseEntity.metadata = {};
                }
            } else if (typeof properties.metadata === 'object' && properties.metadata !== null) {
                // Already an object, use it directly
                baseEntity.metadata = properties.metadata as Record<string, unknown>;
            } else {
                baseEntity.metadata = {};
            }
        } else {
            baseEntity.metadata = {};
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
                // Convert Neo4j Integer to number
                return intValue.low + (intValue.high * 0x100000000);
            }
            return undefined;
        };

        // Include GDS metrics in metadata if present
        // These are written directly to node properties by GDS algorithms
        // Convert Neo4j Integer objects to JavaScript numbers
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
            if (properties.geometry) {
                // Handle geometry - it might be a string (JSON) or already an object
                if (typeof properties.geometry === 'string') {
                    try {
                        su.geometry = JSON.parse(properties.geometry);
                    } catch (error) {
                        logger.warn({ error, entityId: properties.id }, 'Failed to parse geometry for entity');
                        // Leave geometry undefined if parsing fails
                    }
                } else if (typeof properties.geometry === 'object' && properties.geometry !== null) {
                    // Already an object, use it directly
                    su.geometry = properties.geometry;
                }
            }
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
}

