import { BaseEntity } from '../../../domain/ontology.js';
import { ReliabilityScore, SourceInfo } from './ReliabilityScorer.js';

/**
 * Conflict information
 */
export interface Conflict {
    entityId: string;
    property: string;
    values: Array<{
        value: unknown;
        source: SourceInfo;
        reliabilityScore: ReliabilityScore;
    }>;
    severity: 'low' | 'medium' | 'high' | 'critical';
    detectedAt: Date;
}

/**
 * Resolution strategy
 */
export type ResolutionStrategy = 
    | 'most_reliable'      // Use source with highest reliability score
    | 'most_recent'         // Use most recent source
    | 'weighted_combination' // Weighted combination of values
    | 'human_review';       // Queue for human review

/**
 * Resolution result
 */
export interface ResolutionResult {
    resolved: boolean;
    strategy: ResolutionStrategy;
    resolvedValue: unknown;
    resolvedSource: SourceInfo;
    confidence: number;     // 0-1
    requiresReview: boolean;
    reason?: string;
}

/**
 * Service for resolving conflicts
 */
export class ConflictResolver {
    private readonly autoResolveThreshold = 0.85;  // Auto-resolve if confidence >= 0.85
    private readonly humanReviewThreshold = 0.70; // Human review if confidence < 0.70

    /**
     * Resolve a conflict using the specified strategy
     */
    resolve(
        conflict: Conflict,
        strategy: ResolutionStrategy = 'most_reliable'
    ): ResolutionResult {
        switch (strategy) {
            case 'most_reliable':
                return this.resolveByReliability(conflict);
            case 'most_recent':
                return this.resolveByRecency(conflict);
            case 'weighted_combination':
                return this.resolveByWeightedCombination(conflict);
            case 'human_review':
                return {
                    resolved: false,
                    strategy: 'human_review',
                    resolvedValue: null,
                    resolvedSource: conflict.values[0].source,
                    confidence: 0,
                    requiresReview: true,
                    reason: 'Manually queued for human review'
                };
            default:
                throw new Error(`Unknown resolution strategy: ${strategy}`);
        }
    }

    /**
     * Resolve conflict by selecting the most reliable source
     */
    private resolveByReliability(conflict: Conflict): ResolutionResult {
        if (conflict.values.length === 0) {
            throw new Error('Conflict has no values to resolve');
        }

        // Sort by reliability score (highest first)
        const sorted = [...conflict.values].sort((a, b) => 
            b.reliabilityScore.overall - a.reliabilityScore.overall
        );

        const best = sorted[0];
        const secondBest = sorted.length > 1 ? sorted[1] : null;

        // Calculate confidence based on score difference
        let confidence = best.reliabilityScore.overall;
        if (secondBest) {
            const scoreDiff = best.reliabilityScore.overall - secondBest.reliabilityScore.overall;
            // If scores are very close, lower confidence
            if (scoreDiff < 0.1) {
                confidence *= 0.7;
            }
        }

        const requiresReview = confidence < this.humanReviewThreshold;

        return {
            resolved: !requiresReview,
            strategy: 'most_reliable',
            resolvedValue: best.value,
            resolvedSource: best.source,
            confidence,
            requiresReview,
            reason: requiresReview 
                ? `Low confidence (${confidence.toFixed(2)}) - requires human review`
                : `Selected most reliable source (score: ${best.reliabilityScore.overall.toFixed(2)})`
        };
    }

    /**
     * Resolve conflict by selecting the most recent source
     */
    private resolveByRecency(conflict: Conflict): ResolutionResult {
        if (conflict.values.length === 0) {
            throw new Error('Conflict has no values to resolve');
        }

        // Sort by recency (most recent first)
        const sorted = [...conflict.values].sort((a, b) => {
            const dateA = a.source.timestamp ? new Date(a.source.timestamp).getTime() : 0;
            const dateB = b.source.timestamp ? new Date(b.source.timestamp).getTime() : 0;
            return dateB - dateA;
        });

        const mostRecent = sorted[0];
        
        // Confidence based on recency score
        const confidence = mostRecent.reliabilityScore.recency;
        const requiresReview = confidence < this.humanReviewThreshold;

        return {
            resolved: !requiresReview,
            strategy: 'most_recent',
            resolvedValue: mostRecent.value,
            resolvedSource: mostRecent.source,
            confidence,
            requiresReview,
            reason: requiresReview
                ? `Low recency confidence (${confidence.toFixed(2)}) - requires human review`
                : `Selected most recent source (${mostRecent.source.timestamp || 'unknown date'})`
        };
    }

    /**
     * Resolve conflict by weighted combination of values
     * Only works for numeric or string values
     */
    private resolveByWeightedCombination(conflict: Conflict): ResolutionResult {
        if (conflict.values.length === 0) {
            throw new Error('Conflict has no values to resolve');
        }

        // Check if all values are numeric
        const allNumeric = conflict.values.every(v => typeof v.value === 'number');
        
        if (allNumeric) {
            // Weighted average for numeric values
            let totalWeight = 0;
            let weightedSum = 0;

            for (const item of conflict.values) {
                const weight = item.reliabilityScore.overall;
                const value = typeof item.value === 'number' ? item.value : 0;
                weightedSum += value * weight;
                totalWeight += weight;
            }

            const resolvedValue = totalWeight > 0 ? weightedSum / totalWeight : conflict.values[0].value;
            
            // Use the source with highest reliability for provenance
            const bestSource = conflict.values.reduce((best, current) =>
                current.reliabilityScore.overall > best.reliabilityScore.overall ? current : best
            );

            // Confidence is average of all reliability scores
            const avgConfidence = conflict.values.reduce((sum, v) => sum + v.reliabilityScore.overall, 0) / conflict.values.length;
            const requiresReview = avgConfidence < this.humanReviewThreshold;

            return {
                resolved: !requiresReview,
                strategy: 'weighted_combination',
                resolvedValue,
                resolvedSource: bestSource.source,
                confidence: avgConfidence,
                requiresReview,
                reason: requiresReview
                    ? `Low average confidence (${avgConfidence.toFixed(2)}) - requires human review`
                    : `Weighted combination of ${conflict.values.length} sources (avg score: ${avgConfidence.toFixed(2)})`
            };
        } else {
            // For non-numeric values, fall back to most reliable
            return this.resolveByReliability(conflict);
        }
    }

    /**
     * Determine if a conflict should be auto-resolved
     */
    shouldAutoResolve(resolution: ResolutionResult): boolean {
        return resolution.resolved && resolution.confidence >= this.autoResolveThreshold;
    }

    /**
     * Determine if a conflict requires human review
     */
    requiresHumanReview(resolution: ResolutionResult): boolean {
        return resolution.requiresReview || resolution.confidence < this.humanReviewThreshold;
    }
}

