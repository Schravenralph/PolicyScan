import { BaseEntity } from '../../../domain/ontology.js';

/**
 * Tracks provenance information for fused entities
 * Records which sources contributed to each property of an entity
 */
export interface ProvenanceRecord {
    property: string; // Property name (e.g., 'name', 'description', 'metadata.jurisdiction')
    sourceEntityIds: string[]; // IDs of entities that contributed this property
    sourceUrls?: string[]; // Source URLs if available
    timestamps: string[]; // Timestamps when each source contributed
    lastUpdated: string; // Last update timestamp
}

export interface EntityProvenance {
    entityId: string;
    records: Map<string, ProvenanceRecord>; // Map from property name to provenance record
    allSources: Set<string>; // All source entity IDs
    allSourceUrls: Set<string>; // All source URLs
    createdAt: string;
    updatedAt: string;
}

/**
 * Service for tracking provenance of fused entities
 * Maintains a record of which sources contributed to each property
 */
export class ProvenanceTracker {
    private provenanceStore: Map<string, EntityProvenance> = new Map();

    /**
     * Track a property contribution from a source entity
     */
    trackProperty(
        entityId: string,
        property: string,
        sourceEntityId: string,
        sourceUrl?: string,
        timestamp?: string
    ): void {
        const provenance = this.getOrCreateProvenance(entityId);
        const record = provenance.records.get(property) || {
            property,
            sourceEntityIds: [],
            sourceUrls: [],
            timestamps: [],
            lastUpdated: timestamp || new Date().toISOString(),
        };

        // Add source if not already present
        if (!record.sourceEntityIds.includes(sourceEntityId)) {
            record.sourceEntityIds.push(sourceEntityId);
            provenance.allSources.add(sourceEntityId);
        }

        // Add source URL if provided
        if (sourceUrl && !record.sourceUrls?.includes(sourceUrl)) {
            record.sourceUrls = record.sourceUrls || [];
            record.sourceUrls.push(sourceUrl);
            provenance.allSourceUrls.add(sourceUrl);
        }

        // Add timestamp
        const ts = timestamp || new Date().toISOString();
        record.timestamps.push(ts);
        record.lastUpdated = ts;

        provenance.records.set(property, record);
        provenance.updatedAt = ts;
    }

    /**
     * Track multiple properties from a source entity
     */
    trackEntity(
        entityId: string,
        sourceEntity: BaseEntity,
        sourceUrl?: string,
        timestamp?: string
    ): void {
        const ts = timestamp || new Date().toISOString();
        const sourceId = sourceEntity.id;

        // Track all properties from the source entity
        for (const [key, value] of Object.entries(sourceEntity)) {
            if (key === 'id' || key === 'type') continue;
            
            if (key === 'metadata' && value && typeof value === 'object') {
                // Track metadata properties separately
                for (const [metaKey] of Object.entries(value as Record<string, unknown>)) {
                    this.trackProperty(entityId, `metadata.${metaKey}`, sourceId, sourceUrl, ts);
                }
            } else if (value !== undefined && value !== null) {
                this.trackProperty(entityId, key, sourceId, sourceUrl, ts);
            }
        }
    }

    /**
     * Get provenance for an entity
     */
    getProvenance(entityId: string): EntityProvenance | undefined {
        return this.provenanceStore.get(entityId);
    }

    /**
     * Get all source URLs for an entity
     */
    getSourceUrls(entityId: string): string[] {
        const provenance = this.getProvenance(entityId);
        return provenance ? Array.from(provenance.allSourceUrls) : [];
    }

    /**
     * Get all source entity IDs for an entity
     */
    getSourceEntityIds(entityId: string): string[] {
        const provenance = this.getProvenance(entityId);
        return provenance ? Array.from(provenance.allSources) : [];
    }

    /**
     * Query which sources contributed to a specific property
     */
    getPropertySources(entityId: string, property: string): ProvenanceRecord | undefined {
        const provenance = this.getProvenance(entityId);
        return provenance?.records.get(property);
    }

    /**
     * Get or create provenance record for an entity
     */
    private getOrCreateProvenance(entityId: string): EntityProvenance {
        if (!this.provenanceStore.has(entityId)) {
            const now = new Date().toISOString();
            this.provenanceStore.set(entityId, {
                entityId,
                records: new Map(),
                allSources: new Set(),
                allSourceUrls: new Set(),
                createdAt: now,
                updatedAt: now,
            });
        }
        return this.provenanceStore.get(entityId)!;
    }

    /**
     * Clear provenance for an entity
     */
    clearProvenance(entityId: string): void {
        this.provenanceStore.delete(entityId);
    }

    /**
     * Export provenance as JSON (for storage/API)
     */
    exportProvenance(entityId: string): {
        entityId: string;
        records: Record<string, ProvenanceRecord>;
        allSources: string[];
        allSourceUrls: string[];
        createdAt: string;
        updatedAt: string;
    } | null {
        const provenance = this.getProvenance(entityId);
        if (!provenance) return null;

        const records: Record<string, ProvenanceRecord> = {};
        for (const [key, record] of provenance.records.entries()) {
            records[key] = record;
        }

        return {
            entityId: provenance.entityId,
            records,
            allSources: Array.from(provenance.allSources),
            allSourceUrls: Array.from(provenance.allSourceUrls),
            createdAt: provenance.createdAt,
            updatedAt: provenance.updatedAt,
        };
    }

    /**
     * Import provenance from JSON
     */
    importProvenance(data: Record<string, unknown>): void {
        const entityId = typeof data.entityId === 'string' ? data.entityId : '';
        const allSources = Array.isArray(data.allSources) ? data.allSources.filter((s): s is string => typeof s === 'string') : [];
        const allSourceUrls = Array.isArray(data.allSourceUrls) ? data.allSourceUrls.filter((s): s is string => typeof s === 'string') : [];
        const createdAt = typeof data.createdAt === 'string' ? data.createdAt : '';
        const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';

        const provenance: EntityProvenance = {
            entityId,
            records: new Map(),
            allSources: new Set(allSources),
            allSourceUrls: new Set(allSourceUrls),
            createdAt,
            updatedAt,
        };

        for (const [key, record] of Object.entries(data.records || {})) {
            provenance.records.set(key, record as ProvenanceRecord);
        }

        this.provenanceStore.set(entityId, provenance);
    }
}

