/**
 * Conflict Detector
 * 
 * Detects factual conflicts between vector-retrieved content and KG facts.
 * Uses entropy-based filtering to identify when KG facts challenge LLM misconceptions.
 */

import { FactResult } from './FactFirstRetrievalService.js';
import { EnrichedChunk } from './ContextualEnrichmentService.js';
import { EntropyComparison } from './EntropyCalculator.js';
import { logger } from '../../utils/logger.js';

export interface Conflict {
    type: 'factual' | 'temporal' | 'semantic' | 'contradiction';
    severity: 'low' | 'medium' | 'high';
    vectorContent: string;
    kgFact: string;
    entityId?: string;
    entityName?: string;
    entropyDelta: number;
    description: string;
}

export interface ConflictDetectionResult {
    conflicts: Conflict[];
    totalConflicts: number;
    correctivePaths: number; // Number of paths with high entropy delta
    filteredContent: string[]; // Vector content that should be filtered out
}

/**
 * Conflict Detector Service
 * 
 * Detects and classifies conflicts between vector content and KG facts
 */
export class ConflictDetector {
    private entropyThreshold: number;

    constructor(entropyThreshold: number = 0.1) {
        this.entropyThreshold = entropyThreshold;
    }

    /**
     * Detect conflicts between vector content and KG facts
     * 
     * @param vectorChunks Vector-retrieved content chunks
     * @param kgFacts KG facts
     * @param entropyComparisons Entropy comparisons for each path
     * @returns Conflict detection result
     */
    detectConflicts(
        vectorChunks: EnrichedChunk[],
        kgFacts: FactResult[],
        entropyComparisons: EntropyComparison[]
    ): ConflictDetectionResult {
        const conflicts: Conflict[] = [];
        const filteredContent: string[] = [];

        // Group entropy comparisons by entity
        const entityEntropyMap = new Map<string, EntropyComparison[]>();
        
        for (let i = 0; i < entropyComparisons.length; i++) {
            const comparison = entropyComparisons[i];
            const fact = kgFacts[i];
            
            if (fact && comparison.isCorrective) {
                const entityId = fact.entity.id;
                if (!entityEntropyMap.has(entityId)) {
                    entityEntropyMap.set(entityId, []);
                }
                entityEntropyMap.get(entityId)!.push(comparison);
            }
        }

        // Detect conflicts for each vector chunk
        for (const chunk of vectorChunks) {
            const chunkConflicts: Conflict[] = [];

            // Check against each KG fact
            for (const fact of kgFacts) {
                const conflict = this.detectConflictBetweenChunkAndFact(chunk, fact, entityEntropyMap);
                if (conflict) {
                    chunkConflicts.push(conflict);
                }
            }

            // If conflicts found, classify and add
            if (chunkConflicts.length > 0) {
                // Use highest severity conflict
                const highestSeverity = this.getHighestSeverity(chunkConflicts);
                conflicts.push(...chunkConflicts);

                // If high severity, mark content for filtering
                if (highestSeverity === 'high') {
                    filteredContent.push(chunk.content);
                }
            }
        }

        // Count corrective paths (high entropy delta)
        const correctivePaths = entropyComparisons.filter(c => c.isCorrective).length;

        logger.info(
            `[ConflictDetector] Detected ${conflicts.length} conflicts, ` +
            `${correctivePaths} corrective paths, ` +
            `${filteredContent.length} chunks filtered`
        );

        return {
            conflicts,
            totalConflicts: conflicts.length,
            correctivePaths,
            filteredContent
        };
    }

    /**
     * Detect conflict between a vector chunk and a KG fact
     */
    private detectConflictBetweenChunkAndFact(
        chunk: EnrichedChunk,
        fact: FactResult,
        entityEntropyMap: Map<string, EntropyComparison[]>
    ): Conflict | null {
        const chunkContent = chunk.content.toLowerCase();
        const entityName = fact.entity.name?.toLowerCase() || '';

        // Check if chunk mentions the entity
        const mentionsEntity = entityName && chunkContent.includes(entityName);

        if (!mentionsEntity) {
            return null; // No conflict if entity not mentioned
        }

        // Get entropy comparison for this entity
        const entropyComparisons = entityEntropyMap.get(fact.entity.id) || [];
        const avgEntropyDelta = entropyComparisons.length > 0
            ? entropyComparisons.reduce((sum, c) => sum + c.delta, 0) / entropyComparisons.length
            : 0;

        // Detect conflict type and severity
        const conflictType = this.detectConflictType(chunk, fact);
        const severity = this.determineSeverity(avgEntropyDelta, conflictType);

        // Only report if severity is medium or high
        if (severity === 'low' && avgEntropyDelta < this.entropyThreshold) {
            return null;
        }

        return {
            type: conflictType,
            severity,
            vectorContent: chunk.content.substring(0, 200), // Truncate for storage
            kgFact: this.formatFact(fact),
            entityId: fact.entity.id,
            entityName: fact.entity.name,
            entropyDelta: avgEntropyDelta,
            description: this.generateConflictDescription(conflictType, fact, chunk)
        };
    }

    /**
     * Detect conflict type
     */
    private detectConflictType(chunk: EnrichedChunk, fact: FactResult): Conflict['type'] {
        const chunkContent = chunk.content.toLowerCase();
        const _entityName = fact.entity.name?.toLowerCase() || '';
        const entityDescription = fact.entity.description?.toLowerCase() || '';

        // Check for temporal conflicts (dates, time references)
        const temporalKeywords = ['date', 'datum', 'jaar', 'year', 'tijd', 'time', 'periode', 'period'];
        if (temporalKeywords.some(keyword => chunkContent.includes(keyword))) {
            return 'temporal';
        }

        // Check for semantic conflicts (different meanings)
        if (fact.relationships && fact.relationships.length > 0) {
            // Check if relationships contradict chunk content
            const relationshipTypes = fact.relationships.map(r => r.type.toLowerCase());
            const contradictoryRelations = ['opposes', 'conflicts', 'contradicts', 'versus'];
            if (relationshipTypes.some(rt => contradictoryRelations.some(cr => rt.includes(cr)))) {
                return 'contradiction';
            }
        }

        // Check for factual conflicts (different facts)
        if (entityDescription && chunkContent.includes(entityDescription.substring(0, 20))) {
            // Similar content but might have different details
            return 'factual';
        }

        // Default to semantic
        return 'semantic';
    }

    /**
     * Determine conflict severity based on entropy delta
     */
    private determineSeverity(entropyDelta: number, _conflictType: Conflict['type']): Conflict['severity'] {
        // High severity: significant entropy increase
        if (entropyDelta > 0.3) {
            return 'high';
        }

        // Medium severity: moderate entropy increase
        if (entropyDelta > this.entropyThreshold) {
            return 'medium';
        }

        // Low severity: minor entropy increase
        return 'low';
    }

    /**
     * Get highest severity from conflicts
     */
    private getHighestSeverity(conflicts: Conflict[]): Conflict['severity'] {
        const severityOrder: Conflict['severity'][] = ['high', 'medium', 'low'];
        for (const severity of severityOrder) {
            if (conflicts.some(c => c.severity === severity)) {
                return severity;
            }
        }
        return 'low';
    }

    /**
     * Format KG fact for display
     */
    private formatFact(fact: FactResult): string {
        const parts: string[] = [];

        if (fact.entity.name) {
            parts.push(fact.entity.name);
        }

        if (fact.entity.description) {
            parts.push(fact.entity.description);
        }

        if (fact.relationships && fact.relationships.length > 0) {
            const relDesc = fact.relationships
                .map(r => `${r.type}: ${r.targetId}`)
                .join(', ');
            parts.push(`Relationships: ${relDesc}`);
        }

        return parts.join(' | ');
    }

    /**
     * Generate conflict description
     */
    private generateConflictDescription(
        type: Conflict['type'],
        fact: FactResult,
        _chunk: EnrichedChunk
    ): string {
        const entityName = fact.entity.name || 'entity';
        
        switch (type) {
            case 'factual':
                return `Factual conflict: Vector content contradicts KG fact about ${entityName}`;
            case 'temporal':
                return `Temporal conflict: Vector content has different date/time than KG fact about ${entityName}`;
            case 'semantic':
                return `Semantic conflict: Vector content has different meaning than KG fact about ${entityName}`;
            case 'contradiction':
                return `Contradiction: Vector content directly contradicts KG fact about ${entityName}`;
            default:
                return `Conflict detected between vector content and KG fact about ${entityName}`;
        }
    }

    /**
     * Set entropy threshold
     */
    setThreshold(threshold: number): void {
        this.entropyThreshold = threshold;
    }

    /**
     * Get current threshold
     */
    getThreshold(): number {
        return this.entropyThreshold;
    }
}

