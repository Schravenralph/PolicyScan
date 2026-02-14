import { BaseEntity, PolicyDocument } from '../../../domain/ontology.js';
import { ReliabilityScorer, ReliabilityScore, SourceInfo } from './ReliabilityScorer.js';
import { ConflictResolver, Conflict, ResolutionResult, ResolutionStrategy } from './ConflictResolver.js';
import { ConflictResolution } from '../../../models/ConflictResolution.js';
import { logger } from '../../../utils/logger.js';

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
    conflicts: Conflict[];
    detectedAt: Date;
    entityId: string;
}

/**
 * Truth discovery metrics
 */
export interface TruthDiscoveryMetrics {
    conflictsDetected: number;
    conflictsResolved: number;
    conflictsPending: number;
    autoResolutionRate: number;
    averageConfidence: number;
}

/**
 * Service for truth discovery and conflict resolution
 */
export class TruthDiscoveryService {
    private reliabilityScorer: ReliabilityScorer;
    private conflictResolver: ConflictResolver;
    private metrics: TruthDiscoveryMetrics = {
        conflictsDetected: 0,
        conflictsResolved: 0,
        conflictsPending: 0,
        autoResolutionRate: 0,
        averageConfidence: 0
    };

    constructor(
        private getEntityById: (id: string) => Promise<BaseEntity | undefined>,
        private getEntitiesByType: (type: string) => Promise<BaseEntity[]>,
        private updateEntity: (entity: BaseEntity) => Promise<void>
    ) {
        this.reliabilityScorer = new ReliabilityScorer();
        this.conflictResolver = new ConflictResolver();
    }

    /**
     * Detect conflicts for an entity
     */
    async detectConflicts(entity: BaseEntity, allEntities: BaseEntity[]): Promise<ConflictDetectionResult> {
        const startTime = Date.now();
        const conflicts: Conflict[] = [];

        // Find entities with the same ID (should be deduplicated, but check anyway)
        const sameIdEntities = allEntities.filter(e => e.id === entity.id);
        
        if (sameIdEntities.length <= 1) {
            // No conflicts if only one entity
            return {
                conflicts: [],
                detectedAt: new Date(),
                entityId: entity.id
            };
        }

        // Extract source information from entities
        const sourceInfos = sameIdEntities.map(e => this.extractSourceInfo(e));

        // Detect property conflicts
        const propertyConflicts = this.detectPropertyConflicts(sameIdEntities, sourceInfos);
        conflicts.push(...propertyConflicts);

        // Detect relationship conflicts (if applicable)
        // Note: Relationship conflicts would require relationship data, which is not in BaseEntity
        // This could be extended in the future

        // Update metrics
        this.metrics.conflictsDetected += conflicts.length;

        const detectionTime = Date.now() - startTime;
        if (detectionTime > 200) {
            logger.warn(`[TruthDiscovery] Conflict detection took ${detectionTime}ms for entity ${entity.id} (target: <200ms)`);
        }

        return {
            conflicts,
            detectedAt: new Date(),
            entityId: entity.id
        };
    }

    /**
     * Resolve conflicts for an entity
     */
    async resolveConflicts(
        conflicts: Conflict[],
        strategy: ResolutionStrategy = 'most_reliable'
    ): Promise<Array<{ conflict: Conflict; resolution: ResolutionResult }>> {
        const resolutions: Array<{ conflict: Conflict; resolution: ResolutionResult }> = [];

        for (const conflict of conflicts) {
            const resolution = this.conflictResolver.resolve(conflict, strategy);
            resolutions.push({ conflict, resolution });

            // Save resolution to database
            await this.saveResolution(conflict, resolution);

            // Update metrics
            if (resolution.resolved) {
                this.metrics.conflictsResolved++;
            } else {
                this.metrics.conflictsPending++;
            }

            // Auto-resolve if confidence is high enough
            if (this.conflictResolver.shouldAutoResolve(resolution)) {
                await this.applyResolution(conflict, resolution);
            }
        }

        // Update metrics
        this.updateMetrics();

        return resolutions;
    }

    /**
     * Detect property value conflicts
     */
    private detectPropertyConflicts(
        entities: BaseEntity[],
        sourceInfos: SourceInfo[]
    ): Conflict[] {
        const conflicts: Conflict[] = [];

        // Compare properties across entities
        const propertyMap = new Map<string, Set<string>>();

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const _sourceInfo = sourceInfos[i];

            // Check direct properties
            for (const [key, value] of Object.entries(entity)) {
                if (key === 'id' || key === 'type') continue; // Skip ID and type

                if (!propertyMap.has(key)) {
                    propertyMap.set(key, new Set());
                }

                const valueSet = propertyMap.get(key)!;
                const valueKey = this.normalizeValue(value);
                valueSet.add(valueKey);
            }

            // Check metadata properties
            if (entity.metadata) {
                for (const [key, value] of Object.entries(entity.metadata)) {
                    const fullKey = `metadata.${key}`;
                    if (!propertyMap.has(fullKey)) {
                        propertyMap.set(fullKey, new Set());
                    }

                    const valueSet = propertyMap.get(fullKey)!;
                    const valueKey = this.normalizeValue(value);
                    valueSet.add(valueKey);
                }
            }
        }

        // Identify conflicts (properties with multiple different values)
        for (const [property, valueSet] of propertyMap.entries()) {
            if (valueSet.size > 1) {
                // Conflict detected - multiple different values
                const values: Array<{
                    value: unknown;
                    source: SourceInfo;
                    reliabilityScore: ReliabilityScore;
                }> = [];

                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    const sourceInfo = sourceInfos[i];
                    
                    // Get the actual value (from entity or metadata)
                    let actualValue: unknown;
                    if (property.startsWith('metadata.')) {
                        const metaKey = property.replace('metadata.', '');
                        actualValue = entity.metadata?.[metaKey];
                    } else {
                        actualValue = (entity as unknown as Record<string, unknown>)[property];
                    }

                    if (actualValue !== undefined) {
                        // Calculate reliability score
                        const reliabilityScore = this.reliabilityScorer.calculateScore(
                            sourceInfo,
                            entity,
                            sourceInfos
                        );

                        values.push({
                            value: actualValue,
                            source: sourceInfo,
                            reliabilityScore
                        });
                    }
                }

                if (values.length > 1) {
                    const severity = this.classifySeverity(property, values);
                    conflicts.push({
                        entityId: entities[0].id,
                        property,
                        values,
                        severity,
                        detectedAt: new Date()
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Classify conflict severity
     */
    private classifySeverity(
        property: string,
        values: Array<{ value: unknown; source: SourceInfo; reliabilityScore: ReliabilityScore }>
    ): 'low' | 'medium' | 'high' | 'critical' {
        // Critical: ID, type, or core identifying properties
        if (property === 'id' || property === 'type' || property === 'name') {
            return 'critical';
        }

        // High: Important metadata like jurisdiction, date, status
        if (property.includes('jurisdiction') || property.includes('date') || property.includes('status')) {
            return 'high';
        }

        // Medium: Descriptive properties with significant differences
        const scoreDiff = Math.max(...values.map(v => v.reliabilityScore.overall)) -
                         Math.min(...values.map(v => v.reliabilityScore.overall));
        if (scoreDiff > 0.3) {
            return 'high';
        }

        // Low: Minor differences in optional properties
        return 'low';
    }

    /**
     * Normalize value for comparison
     */
    private normalizeValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value).toLowerCase().trim();
    }

    /**
     * Extract source information from entity
     */
    private extractSourceInfo(entity: BaseEntity): SourceInfo {
        const urlValue = (entity.type === 'PolicyDocument' ? (entity as PolicyDocument).url : undefined) || entity.metadata?.sourceUrl || entity.metadata?.url;
        const timestampValue = (entity.type === 'PolicyDocument' ? (entity as PolicyDocument).date : undefined) || entity.metadata?.createdAt || entity.metadata?.timestamp;
        const url = typeof urlValue === 'string' ? urlValue : undefined;
        const timestamp = typeof timestampValue === 'string' ? timestampValue : undefined;

        // Infer source type from URL
        let sourceType: 'official' | 'unofficial' | 'unknown' = 'unknown';
        if (url && typeof url === 'string') {
            const officialPatterns = [
                /\.(nl|be|eu)$/i,
                /overheid\.nl/i,
                /gemeente\./i,
                /provincie\./i,
                /rijksoverheid\.nl/i,
                /waterschap/i
            ];
            if (officialPatterns.some(pattern => pattern.test(url))) {
                sourceType = 'official';
            } else {
                sourceType = 'unofficial';
            }
        }

        return {
            url,
            sourceType,
            timestamp,
            entityId: entity.id,
            entityType: entity.type
        };
    }

    /**
     * Apply resolution to entity
     */
    private async applyResolution(conflict: Conflict, resolution: ResolutionResult): Promise<void> {
        if (!resolution.resolved || !resolution.resolvedValue) {
            return;
        }

        const entity = await this.getEntityById(conflict.entityId);
        if (!entity) {
            logger.warn(`[TruthDiscovery] Entity ${conflict.entityId} not found for resolution`);
            return;
        }

        // Update the entity property
        if (conflict.property.startsWith('metadata.')) {
            const metaKey = conflict.property.replace('metadata.', '');
            entity.metadata = entity.metadata || {};
            entity.metadata[metaKey] = resolution.resolvedValue;
        } else {
            const entityRecord = entity as BaseEntity & Record<string, unknown>;
            entityRecord[conflict.property] = resolution.resolvedValue;
        }

        // Update entity in database
        await this.updateEntity(entity);

        logger.info(
            `[TruthDiscovery] Resolved conflict for ${conflict.entityId}.${conflict.property} ` +
            `using ${resolution.strategy} (confidence: ${resolution.confidence.toFixed(2)})`
        );
    }

    /**
     * Save resolution to database
     */
    private async saveResolution(conflict: Conflict, resolution: ResolutionResult): Promise<void> {
        try {
            await ConflictResolution.create({
                entityId: conflict.entityId,
                property: conflict.property,
                conflictValues: conflict.values.map(v => ({
                    value: v.value,
                    sourceUrl: v.source.url,
                    sourceType: v.source.sourceType,
                    reliabilityScore: v.reliabilityScore.overall
                })),
                resolutionStrategy: resolution.strategy,
                resolvedValue: resolution.resolvedValue,
                resolvedSourceUrl: resolution.resolvedSource.url,
                confidence: resolution.confidence,
                requiresReview: resolution.requiresReview,
                resolved: resolution.resolved,
                reason: resolution.reason,
                severity: conflict.severity,
                detectedAt: conflict.detectedAt,
                resolvedAt: resolution.resolved ? new Date() : null,
                resolvedBy: resolution.resolved ? 'system' : null
            });
        } catch (error) {
            logger.error({ error }, '[TruthDiscovery] Failed to save resolution');
        }
    }

    /**
     * Update metrics
     */
    private updateMetrics(): void {
        const total = this.metrics.conflictsDetected;
        if (total > 0) {
            this.metrics.autoResolutionRate = this.metrics.conflictsResolved / total;
            
            // Calculate average confidence from recent resolutions
            // This is a simplified version - could be enhanced with actual tracking
            this.metrics.averageConfidence = 0.85; // Placeholder
        }
    }

    /**
     * Get current metrics
     */
    getMetrics(): TruthDiscoveryMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics(): void {
        this.metrics = {
            conflictsDetected: 0,
            conflictsResolved: 0,
            conflictsPending: 0,
            autoResolutionRate: 0,
            averageConfidence: 0
        };
    }
}

