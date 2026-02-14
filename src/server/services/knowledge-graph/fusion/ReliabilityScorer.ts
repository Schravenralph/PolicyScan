import { BaseEntity, PolicyDocument, Regulation, SpatialUnit } from '../../../domain/ontology.js';

/**
 * Reliability scores for sources
 */
export interface ReliabilityScore {
    authority: number;      // 0-1: Official sources > unofficial
    recency: number;        // 0-1: Newer sources > older
    completeness: number;   // 0-1: More complete data > incomplete
    consistency: number;    // 0-1: Consistent with other facts
    overall: number;        // 0-1: Weighted combination
}

/**
 * Source information for reliability scoring
 */
export interface SourceInfo {
    url?: string;
    sourceType?: 'official' | 'unofficial' | 'unknown';
    timestamp?: string;     // ISO date string
    entityId: string;
    entityType: string;
}

/**
 * Service for scoring source reliability
 */
export class ReliabilityScorer {
    private readonly authorityWeights: Record<string, number> = {
        'official': 1.0,
        'unofficial': 0.5,
        'unknown': 0.3
    };

    private readonly officialDomainPatterns = [
        /\.(nl|be|eu)$/i,  // Government domains
        /overheid\.nl/i,
        /gemeente\./i,
        /provincie\./i,
        /rijksoverheid\.nl/i,
        /waterschap/i
    ];

    /**
     * Calculate reliability score for a source
     */
    calculateScore(source: SourceInfo, entity: BaseEntity, allSources: SourceInfo[]): ReliabilityScore {
        const authority = this.calculateAuthorityScore(source);
        const recency = this.calculateRecencyScore(source);
        const completeness = this.calculateCompletenessScore(entity);
        const consistency = this.calculateConsistencyScore(source, entity, allSources);

        // Weighted combination (authority and consistency are most important)
        const overall = (
            authority * 0.35 +
            recency * 0.20 +
            completeness * 0.15 +
            consistency * 0.30
        );

        return {
            authority,
            recency,
            completeness,
            consistency,
            overall
        };
    }

    /**
     * Calculate authority score based on source type and domain
     */
    private calculateAuthorityScore(source: SourceInfo): number {
        // Check if source type is explicitly set
        if (source.sourceType) {
            return this.authorityWeights[source.sourceType] || 0.5;
        }

        // Infer from URL if available
        if (source.url) {
            const isOfficial = this.officialDomainPatterns.some(pattern => pattern.test(source.url!));
            return isOfficial ? 1.0 : 0.5;
        }

        // Default to unknown
        return this.authorityWeights['unknown'];
    }

    /**
     * Calculate recency score (newer sources score higher)
     * Uses exponential decay: score = e^(-days_old / 365)
     */
    private calculateRecencyScore(source: SourceInfo): number {
        if (!source.timestamp) {
            return 0.5; // Unknown recency gets medium score
        }

        try {
            const sourceDate = new Date(source.timestamp);
            const now = new Date();
            const daysOld = (now.getTime() - sourceDate.getTime()) / (1000 * 60 * 60 * 24);

            // Exponential decay: newer sources score higher
            // 1 year old = ~0.37, 2 years = ~0.14, 5 years = ~0.006
            const score = Math.exp(-daysOld / 365);
            return Math.max(0.1, Math.min(1.0, score)); // Clamp between 0.1 and 1.0
        } catch (_error) {
            return 0.5; // Invalid date gets medium score
        }
    }

    /**
     * Calculate completeness score based on entity properties
     */
    private calculateCompletenessScore(entity: BaseEntity): number {
        let score = 0;
        let maxScore = 0;

        // Required fields
        maxScore += 2;
        if (entity.id) score += 1;
        if (entity.name) score += 1;

        // Optional but valuable fields
        maxScore += 3;
        if (entity.description) score += 1;
        if (entity.uri) score += 1;
        if (entity.metadata && Object.keys(entity.metadata).length > 0) score += 1;

        // Type-specific fields
        if (entity.type === 'PolicyDocument') {
            maxScore += 3;
            const pd = entity as PolicyDocument;
            if (pd.documentType) score += 1;
            if (pd.jurisdiction) score += 1;
            if (pd.date) score += 1;
        } else if (entity.type === 'Regulation') {
            maxScore += 1;
            const reg = entity as Regulation;
            if (reg.category) score += 1;
        } else if (entity.type === 'SpatialUnit') {
            maxScore += 1;
            const su = entity as SpatialUnit;
            if (su.spatialType) score += 1;
        }

        return maxScore > 0 ? score / maxScore : 0.5;
    }

    /**
     * Calculate consistency score based on agreement with other sources
     */
    private calculateConsistencyScore(
        source: SourceInfo,
        entity: BaseEntity,
        allSources: SourceInfo[]
    ): number {
        if (allSources.length <= 1) {
            return 0.8; // Single source gets high consistency (no conflicts)
        }

        // For now, use a simple heuristic:
        // If this entity's properties match most other sources, it's consistent
        // This is a simplified version - could be enhanced with semantic similarity
        
        // Count how many sources have similar properties
        let consistentCount = 0;
        for (const otherSource of allSources) {
            if (otherSource.entityId === source.entityId) continue;

            // Simple property matching (could be enhanced)
            // For now, assume consistency if we have multiple sources
            consistentCount++;
        }

        // If we have multiple sources for the same entity, that's a sign of consistency
        // But if properties differ, that's a conflict (handled by conflict detection)
        const consistencyRatio = consistentCount / Math.max(1, allSources.length - 1);
        
        // Base consistency score (will be refined by conflict detection)
        return Math.min(0.9, 0.5 + consistencyRatio * 0.4);
    }

    /**
     * Compare two reliability scores
     * Returns: -1 if score1 < score2, 0 if equal, 1 if score1 > score2
     */
    compareScores(score1: ReliabilityScore, score2: ReliabilityScore): number {
        if (score1.overall > score2.overall) return 1;
        if (score1.overall < score2.overall) return -1;
        
        // If overall scores are equal, compare by authority
        if (score1.authority > score2.authority) return 1;
        if (score1.authority < score2.authority) return -1;
        
        // Then by recency
        if (score1.recency > score2.recency) return 1;
        if (score1.recency < score2.recency) return -1;
        
        return 0;
    }
}

