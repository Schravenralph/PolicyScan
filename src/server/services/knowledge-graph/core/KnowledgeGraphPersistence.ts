/**
 * KnowledgeGraphPersistence - Persistence layer for Knowledge Graph
 * 
 * Provides abstraction for persisting and loading knowledge graph data with optional
 * in-memory caching and sync mechanisms. Supports bulk operations and backup/restore.
 */

import { Driver, Session } from 'neo4j-driver';
import { BaseEntity, Relation, RelationType, EntityType } from '../../../domain/ontology.js';
import { KnowledgeGraphNeo4j } from './KnowledgeGraphNeo4j.js';

export interface PersistenceOptions {
    /**
     * Enable in-memory cache for faster reads
     * When enabled, reads are served from cache and writes sync to both cache and GraphDB
     */
    enableCache?: boolean;
    
    /**
     * Maximum number of entities to cache in memory
     * Only used if enableCache is true
     */
    cacheMaxSize?: number;
    
    /**
     * Time-to-live for cached entities in milliseconds
     * Only used if enableCache is true
     */
    cacheTTL?: number;
}

export interface LoadResult {
    entities: BaseEntity[];
    relationships: Relation[];
    stats: {
        entityCount: number;
        relationshipCount: number;
        loadTime: number;
    };
}

export interface SaveResult {
    saved: number;
    failed: number;
    errors: string[];
    saveTime: number;
}

interface CachedEntity {
    entity: BaseEntity;
    timestamp: number;
}

export class KnowledgeGraphPersistence {
    private neo4j: KnowledgeGraphNeo4j;
    private driver: Driver;
    private cache: Map<string, CachedEntity> | null = null;
    private cacheMaxSize: number;
    private cacheTTL: number;
    private enableCache: boolean;

    constructor(driver: Driver, options: PersistenceOptions = {}) {
        this.driver = driver;
        this.neo4j = new KnowledgeGraphNeo4j(driver);
        this.enableCache = options.enableCache ?? false;
        this.cacheMaxSize = options.cacheMaxSize ?? 1000;
        this.cacheTTL = options.cacheTTL ?? 3600000; // 1 hour default

        if (this.enableCache) {
            this.cache = new Map<string, CachedEntity>();
        }
    }

    /**
     * Get a Neo4j session
     */
    private getSession(): Session {
        return this.driver.session();
    }

    /**
     * Save entity to persistence layer
     * If cache is enabled, also updates cache
     */
    async saveEntity(entity: BaseEntity): Promise<void> {
        const session = this.getSession();
        try {
            // Get current branch from version manager (if available)
            let branch: string | undefined;
            try {
                const { KnowledgeGraphVersionManager } = await import('../versioning/KnowledgeGraphVersionManager.js');
                const versionManager = new KnowledgeGraphVersionManager();
                branch = await versionManager.getCurrentBranch();
            } catch (error) {
                // Versioning is optional - continue without branch
            }
            
            await this.neo4j.saveEntity(session, entity, branch);
            
            // Update cache if enabled
            if (this.enableCache && this.cache) {
                this.cache.set(entity.id, {
                    entity,
                    timestamp: Date.now()
                });
                this.evictCacheIfNeeded();
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Save multiple entities in bulk
     */
    async saveEntities(entities: BaseEntity[]): Promise<SaveResult> {
        const startTime = Date.now();
        const result: SaveResult = {
            saved: 0,
            failed: 0,
            errors: [],
            saveTime: 0
        };

        const session = this.getSession();
        try {
            // Process in batches of 100 for better performance
            const batchSize = 100;
            for (let i = 0; i < entities.length; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                
                try {
                    await this.neo4j.saveEntitiesBulk(session, batch);
                    result.saved += batch.length;
                    
                    // Update cache if enabled
                    if (this.enableCache && this.cache) {
                        batch.forEach(entity => {
                            this.cache!.set(entity.id, {
                                entity,
                                timestamp: Date.now()
                            });
                        });
                        this.evictCacheIfNeeded();
                    }
                } catch (_error) {
                    // If batch fails, try individual saves
                    for (const entity of batch) {
                        try {
                            await this.saveEntity(entity);
                            result.saved++;
                        } catch (err) {
                            result.failed++;
                            const errorMsg = err instanceof Error ? err.message : String(err);
                            result.errors.push(`Failed to save ${entity.id}: ${errorMsg}`);
                        }
                    }
                }
            }
        } finally {
            await session.close();
            result.saveTime = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Load entity from persistence layer
     * If cache is enabled, checks cache first
     */
    async loadEntity(id: string): Promise<BaseEntity | null> {
        // Check cache first if enabled
        if (this.enableCache && this.cache) {
            const cached = this.cache.get(id);
            if (cached) {
                // Check if cache entry is still valid
                const age = Date.now() - cached.timestamp;
                if (age < this.cacheTTL) {
                    return cached.entity;
                } else {
                    // Cache entry expired, remove it
                    this.cache.delete(id);
                }
            }
        }

        // Load from Neo4j
        const session = this.getSession();
        try {
            const entity = await this.neo4j.loadEntity(session, id);
            
            // Update cache if enabled and entity found
            if (this.enableCache && this.cache && entity) {
                this.cache.set(id, {
                    entity,
                    timestamp: Date.now()
                });
                this.evictCacheIfNeeded();
            }
            
            return entity;
        } finally {
            await session.close();
        }
    }

    /**
     * Load entity by URI
     */
    async loadEntityByUri(uri: string): Promise<BaseEntity | null> {
        const session = this.getSession();
        try {
            return await this.neo4j.loadEntityByUri(session, uri);
        } finally {
            await session.close();
        }
    }

    /**
     * Load all entities of a specific type
     */
    async loadEntitiesByType(type: EntityType): Promise<BaseEntity[]> {
        const session = this.getSession();
        try {
            const entities = await this.neo4j.loadEntitiesByType(session, type);
            
            // Update cache if enabled
            if (this.enableCache && this.cache) {
                entities.forEach(entity => {
                    this.cache!.set(entity.id, {
                        entity,
                        timestamp: Date.now()
                    });
                });
                this.evictCacheIfNeeded();
            }
            
            return entities;
        } finally {
            await session.close();
        }
    }

    /**
     * Load all entities
     */
    async loadAllEntities(limit?: number): Promise<BaseEntity[]> {
        const session = this.getSession();
        try {
            const entities = await this.neo4j.loadAllEntities(session, limit);
            
            // Update cache if enabled
            if (this.enableCache && this.cache) {
                entities.forEach(entity => {
                    this.cache!.set(entity.id, {
                        entity,
                        timestamp: Date.now()
                    });
                });
                this.evictCacheIfNeeded();
            }
            
            return entities;
        } finally {
            await session.close();
        }
    }

    /**
     * Save relationship
     */
    async saveRelationship(
        sourceId: string,
        targetId: string,
        type: RelationType,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const session = this.getSession();
        try {
            await this.neo4j.saveRelationship(session, sourceId, targetId, type, metadata);
        } finally {
            await session.close();
        }
    }

    /**
     * Load relationships for an entity
     */
    async loadRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const session = this.getSession();
        try {
            return await this.neo4j.loadRelationships(session, entityId);
        } finally {
            await session.close();
        }
    }

    /**
     * Load incoming relationships for an entity
     */
    async loadIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const session = this.getSession();
        try {
            return await this.neo4j.loadIncomingRelationships(session, entityId);
        } finally {
            await session.close();
        }
    }

    /**
     * Delete entity
     */
    async deleteEntity(id: string): Promise<void> {
        const session = this.getSession();
        try {
            await this.neo4j.deleteEntity(session, id);
            
            // Remove from cache if enabled
            if (this.enableCache && this.cache) {
                this.cache.delete(id);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Delete relationship
     */
    async deleteRelationship(sourceId: string, targetId: string, type: RelationType): Promise<void> {
        const session = this.getSession();
        try {
            await this.neo4j.deleteRelationship(session, sourceId, targetId, type);
        } finally {
            await session.close();
        }
    }

    /**
     * Load entire graph (entities + relationships)
     * Useful for backup/export operations
     */
    async loadGraph(limit?: number): Promise<LoadResult> {
        const startTime = Date.now();
        const session = this.getSession();
        
        try {
            // Load entities
            const entities = await this.neo4j.loadAllEntities(session, limit);
            
            // Load relationships
            const relationships: Relation[] = [];
            for (const entity of entities) {
                const rels = await this.neo4j.loadRelationships(session, entity.id);
                rels.forEach(rel => {
                    relationships.push({
                        sourceId: rel.sourceId,
                        targetId: rel.targetId,
                        type: rel.type
                    });
                });
            }
            
            // Update cache if enabled
            if (this.enableCache && this.cache) {
                entities.forEach(entity => {
                    this.cache!.set(entity.id, {
                        entity,
                        timestamp: Date.now()
                    });
                });
                this.evictCacheIfNeeded();
            }
            
            return {
                entities,
                relationships,
                stats: {
                    entityCount: entities.length,
                    relationshipCount: relationships.length,
                    loadTime: Date.now() - startTime
                }
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Save entire graph (entities + relationships)
     * Useful for restore/import operations
     */
    async saveGraph(entities: BaseEntity[], relationships: Relation[]): Promise<SaveResult> {
        const startTime = Date.now();
        const result: SaveResult = {
            saved: 0,
            failed: 0,
            errors: [],
            saveTime: 0
        };

        // Save entities first
        const entityResult = await this.saveEntities(entities);
        result.saved += entityResult.saved;
        result.failed += entityResult.failed;
        result.errors.push(...entityResult.errors);

        // Then save relationships
        const session = this.getSession();
        try {
            for (const rel of relationships) {
                try {
                    await this.neo4j.saveRelationship(
                        session,
                        rel.sourceId,
                        rel.targetId,
                        rel.type,
                        rel.metadata
                    );
                    result.saved++;
                } catch (error) {
                    result.failed++;
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    result.errors.push(`Failed to save relationship ${rel.sourceId} -> ${rel.targetId}: ${errorMsg}`);
                }
            }
        } finally {
            await session.close();
            result.saveTime = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Clear all data
     */
    async clearAll(): Promise<void> {
        const session = this.getSession();
        try {
            await this.neo4j.clearAll(session);
            
            // Clear cache if enabled
            if (this.enableCache && this.cache) {
                this.cache.clear();
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Get graph statistics
     */
    async getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
        const session = this.getSession();
        try {
            return await this.neo4j.getStats(session);
        } finally {
            await session.close();
        }
    }

    /**
     * Sync cache with Neo4j
     * Refreshes all cached entities from database
     */
    async syncCache(): Promise<void> {
        if (!this.enableCache || !this.cache) {
            return;
        }

        const session = this.getSession();
        try {
            // Refresh all cached entities
            const entityIds = Array.from(this.cache.keys());
            for (const id of entityIds) {
                const entity = await this.neo4j.loadEntity(session, id);
                if (entity) {
                    this.cache.set(id, {
                        entity,
                        timestamp: Date.now()
                    });
                } else {
                    // Entity no longer exists, remove from cache
                    this.cache.delete(id);
                }
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        if (this.cache) {
            this.cache.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number; hitRate?: number } | null {
        if (!this.enableCache || !this.cache) {
            return null;
        }

        return {
            size: this.cache.size,
            maxSize: this.cacheMaxSize
        };
    }

    /**
     * Evict oldest cache entries if cache is full
     */
    private evictCacheIfNeeded(): void {
        if (!this.cache || this.cache.size <= this.cacheMaxSize) {
            return;
        }

        // Sort by timestamp and remove oldest entries
        const entries = Array.from(this.cache.entries())
            .map(([id, cached]) => ({ id, timestamp: cached.timestamp }))
            .sort((a, b) => a.timestamp - b.timestamp);

        // Remove oldest 10% of entries
        const toRemove = Math.floor(entries.length * 0.1);
        for (let i = 0; i < toRemove; i++) {
            this.cache.delete(entries[i].id);
        }
    }
}

