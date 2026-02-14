import { BaseEntity, RelationType } from '../../../domain/ontology.js';
import { HeteroGNNScorer } from './HeteroGNNScorer.js';
import { KnowledgeGraphService } from '../../knowledge-graph/core/KnowledgeGraph.js';

/**
 * Configuration for KG confidence scoring
 */
export interface KGConfidenceConfig {
    entityReliabilityWeight: number;    // Weight for entity reliability (default: 0.3)
    sourceAuthorityWeight: number;      // Weight for source authority (default: 0.3)
    relationshipConfidenceWeight: number; // Weight for relationship confidence (default: 0.2)
    temporalRelevanceWeight: number;     // Weight for temporal relevance (default: 0.2)
}

/**
 * Breakdown of KG confidence factors
 */
export interface KGConfidenceFactors {
    entityReliability: number;      // Entity reliability score [0, 1]
    sourceAuthority: number;        // Source authority score [0, 1]
    relationshipConfidence: number; // Relationship confidence score [0, 1]
    temporalRelevance: number;      // Temporal relevance score [0, 1]
    finalScore: number;             // Weighted combination [0, 1]
}

/**
 * Entity metadata for confidence scoring
 */
export interface EntityScoringMetadata {
    sourceUrls?: string[];          // URLs where entity was extracted from
    extractionTimestamp?: Date;     // When entity was extracted
    extractionConfidence?: number;   // LLM extraction confidence [0, 1]
    relationshipCount?: number;      // Number of relationships
    lastUpdated?: Date;             // Last update timestamp
    provenance?: {
        sources: Array<{
            url: string;
            authority: 'official' | 'unofficial' | 'unknown';
            timestamp: Date;
        }>;
    };
}

/**
 * Relationship metadata for confidence scoring
 */
export interface RelationshipScoringMetadata {
    confidence?: number;             // LLM relationship confidence [0, 1]
    sourceCount?: number;            // Number of sources confirming relationship
    lastVerified?: Date;             // Last verification timestamp
}

/**
 * Service for calculating KG confidence scores
 * Combines entity reliability, source authority, relationship confidence, and temporal relevance
 */
export class KGConfidenceScorer {
    private config: KGConfidenceConfig;
    private heteroGNNScorer: HeteroGNNScorer | null = null;

    constructor(
        config: Partial<KGConfidenceConfig> = {},
        kgService?: KnowledgeGraphService
    ) {
        this.config = {
            entityReliabilityWeight: config.entityReliabilityWeight ?? 0.3,
            sourceAuthorityWeight: config.sourceAuthorityWeight ?? 0.3,
            relationshipConfidenceWeight: config.relationshipConfidenceWeight ?? 0.2,
            temporalRelevanceWeight: config.temporalRelevanceWeight ?? 0.2,
        };

        // Validate weights sum to 1.0
        const sum = 
            this.config.entityReliabilityWeight +
            this.config.sourceAuthorityWeight +
            this.config.relationshipConfidenceWeight +
            this.config.temporalRelevanceWeight;

        if (Math.abs(sum - 1.0) > 0.001) {
            console.warn(`KG confidence weights sum to ${sum}, not 1.0. Normalizing...`);
            const factor = 1.0 / sum;
            this.config.entityReliabilityWeight *= factor;
            this.config.sourceAuthorityWeight *= factor;
            this.config.relationshipConfidenceWeight *= factor;
            this.config.temporalRelevanceWeight *= factor;
        }

        // Initialize HeteroGNN scorer if KG service is provided
        if (kgService) {
            this.heteroGNNScorer = new HeteroGNNScorer(kgService);
            // Initialize asynchronously (don't await to avoid blocking constructor)
            this.heteroGNNScorer.init().catch((error) => {
                console.warn('[KGConfidenceScorer] Failed to initialize HeteroGNN scorer:', error);
                this.heteroGNNScorer = null;
            });
        }
    }

    /**
     * Calculate KG confidence score for an entity
     * @param entity The entity to score
     * @param metadata Optional metadata for scoring
     * @returns Confidence factors breakdown
     */
    async calculateConfidence(
        entity: BaseEntity,
        metadata?: EntityScoringMetadata
    ): Promise<KGConfidenceFactors> {
        // Calculate entity reliability
        const entityReliability = this.calculateEntityReliability(entity, metadata);

        // Calculate source authority
        const sourceAuthority = this.calculateSourceAuthority(metadata);

        // Calculate relationship confidence (if relationships exist)
        const relationshipConfidence = this.calculateRelationshipConfidence(metadata);

        // Calculate temporal relevance
        const temporalRelevance = this.calculateTemporalRelevance(metadata);

        // Calculate weighted final score
        const finalScore =
            entityReliability * this.config.entityReliabilityWeight +
            sourceAuthority * this.config.sourceAuthorityWeight +
            relationshipConfidence * this.config.relationshipConfidenceWeight +
            temporalRelevance * this.config.temporalRelevanceWeight;

        return {
            entityReliability,
            sourceAuthority,
            relationshipConfidence,
            temporalRelevance,
            finalScore: Math.max(0, Math.min(1, finalScore)), // Clamp to [0, 1]
        };
    }

    /**
     * Calculate entity reliability score [0, 1]
     * Based on entity completeness, extraction confidence, and validation
     */
    private calculateEntityReliability(
        entity: BaseEntity,
        metadata?: EntityScoringMetadata
    ): number {
        let score = 0;
        let factors = 0;

        // Base score from entity completeness
        if (entity.name && entity.name.trim().length > 0) {
            score += 0.3;
            factors++;
        }

        if (entity.description && entity.description.trim().length > 0) {
            score += 0.2;
            factors++;
        }

        // Extraction confidence boost
        if (metadata?.extractionConfidence !== undefined) {
            score += 0.3 * metadata.extractionConfidence;
            factors++;
        }

        // Relationship count boost (more relationships = more validated)
        if (metadata?.relationshipCount !== undefined && metadata.relationshipCount > 0) {
            const relationshipBoost = Math.min(0.2, metadata.relationshipCount * 0.05);
            score += relationshipBoost;
            factors++;
        }

        // Normalize by factors
        return factors > 0 ? Math.min(1.0, score) : 0.5; // Default to 0.5 if no factors
    }

    /**
     * Calculate source authority score [0, 1]
     * Based on source URLs and their authority levels
     */
    private calculateSourceAuthority(metadata?: EntityScoringMetadata): number {
        if (!metadata?.provenance?.sources || metadata.provenance.sources.length === 0) {
            // If no provenance, check sourceUrls
            if (metadata?.sourceUrls && metadata.sourceUrls.length > 0) {
                return this.scoreUrls(metadata.sourceUrls);
            }
            return 0.5; // Default to medium confidence if no source info
        }

        const sources = metadata.provenance.sources;
        let totalScore = 0;

        for (const source of sources) {
            let sourceScore = 0.5; // Base score

            // Authority boost
            if (source.authority === 'official') {
                sourceScore = 1.0;
            } else if (source.authority === 'unofficial') {
                sourceScore = 0.3;
            }

            // URL-based authority detection (fallback)
            if (source.authority === 'unknown') {
                sourceScore = this.scoreUrl(source.url);
            }

            totalScore += sourceScore;
        }

        // Average across sources, with boost for multiple official sources
        const avgScore = totalScore / sources.length;
        const officialCount = sources.filter(s => s.authority === 'official').length;
        const multiSourceBoost = officialCount > 1 ? 0.1 : 0;

        return Math.min(1.0, avgScore + multiSourceBoost);
    }

    /**
     * Score a single URL for authority
     */
    private scoreUrl(url: string): number {
        const lowerUrl = url.toLowerCase();

        // Official government domains
        if (
            lowerUrl.includes('.nl') &&
            (lowerUrl.includes('gemeente') ||
                lowerUrl.includes('provincie') ||
                lowerUrl.includes('rijksoverheid') ||
                lowerUrl.includes('overheid.nl') ||
                lowerUrl.includes('omgevingswet'))
        ) {
            return 1.0;
        }

        // Known policy document domains
        if (lowerUrl.includes('iplo.nl') || lowerUrl.includes('ruimtelijkeplannen')) {
            return 0.9;
        }

        // Generic .nl domains (moderate authority)
        if (lowerUrl.endsWith('.nl')) {
            return 0.6;
        }

        // Other domains (lower authority)
        return 0.4;
    }

    /**
     * Score multiple URLs (average)
     */
    private scoreUrls(urls: string[]): number {
        if (urls.length === 0) return 0.5;

        const scores = urls.map(url => this.scoreUrl(url));
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    /**
     * Calculate relationship confidence score [0, 1]
     * Based on relationship count and validation
     */
    private calculateRelationshipConfidence(metadata?: EntityScoringMetadata): number {
        if (!metadata?.relationshipCount || metadata.relationshipCount === 0) {
            return 0.3; // Low confidence if no relationships
        }

        // More relationships = higher confidence (up to a point)
        const relationshipScore = Math.min(1.0, metadata.relationshipCount * 0.2);
        return relationshipScore;
    }

    /**
     * Calculate temporal relevance score [0, 1]
     * Based on recency of extraction and updates
     */
    private calculateTemporalRelevance(metadata?: EntityScoringMetadata): number {
        const now = new Date();
        let score = 0.5; // Default to medium

        // Recency of extraction
        if (metadata?.extractionTimestamp) {
            const daysSinceExtraction = (now.getTime() - metadata.extractionTimestamp.getTime()) / (1000 * 60 * 60 * 24);
            // Recent extraction (< 30 days) = high score, older = lower
            const extractionScore = Math.max(0, 1.0 - daysSinceExtraction / 365); // Decay over 1 year
            score = extractionScore * 0.6;
        }

        // Recency of last update
        if (metadata?.lastUpdated) {
            const daysSinceUpdate = (now.getTime() - metadata.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
            const updateScore = Math.max(0, 1.0 - daysSinceUpdate / 365);
            score += updateScore * 0.4;
        }

        return Math.min(1.0, score);
    }

    /**
     * Calculate relationship confidence for a specific relationship
     * Optionally uses HeteroGNN scoring if available
     */
    async calculateRelationshipConfidenceForRelation(
        relationshipMetadata?: RelationshipScoringMetadata,
        sourceId?: string,
        targetId?: string,
        relationType?: RelationType,
        sourceEntity?: BaseEntity,
        targetEntity?: BaseEntity
    ): Promise<number> {
        if (!relationshipMetadata) {
            return 0.5; // Default confidence
        }

        let score = 0.5; // Base score

        // Use HeteroGNN scoring if available and enabled
        if (
            this.heteroGNNScorer &&
            this.heteroGNNScorer.isScoringEnabled() &&
            sourceId &&
            targetId &&
            relationType
        ) {
            try {
                const heteroGNNScore = await this.heteroGNNScorer.calculateScore(
                    sourceId,
                    targetId,
                    relationType,
                    sourceEntity,
                    targetEntity
                );
                // Use HeteroGNN score as base, then apply metadata boosts
                score = heteroGNNScore.score * 0.7; // 70% weight to HeteroGNN score
            } catch (error) {
                console.warn('[KGConfidenceScorer] Failed to get HeteroGNN score, using fallback:', error);
            }
        }

        // LLM confidence boost (if not using HeteroGNN or as additional factor)
        if (relationshipMetadata.confidence !== undefined) {
            if (this.heteroGNNScorer?.isScoringEnabled() && sourceId && targetId && relationType) {
                // If using HeteroGNN, apply confidence as a multiplier
                score *= (0.5 + relationshipMetadata.confidence * 0.5);
            } else {
                // If not using HeteroGNN, use confidence as base
                score = relationshipMetadata.confidence * 0.7;
            }
        }

        // Multiple sources boost
        if (relationshipMetadata.sourceCount && relationshipMetadata.sourceCount > 1) {
            score += 0.2 * Math.min(1.0, relationshipMetadata.sourceCount / 3); // Cap at 3 sources
        }

        // Recency boost
        if (relationshipMetadata.lastVerified) {
            const daysSinceVerification = (Date.now() - relationshipMetadata.lastVerified.getTime()) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 1.0 - daysSinceVerification / 365);
            score += recencyScore * 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Synchronous version for backward compatibility
     */
    calculateRelationshipConfidenceForRelationSync(
        relationshipMetadata?: RelationshipScoringMetadata
    ): number {
        if (!relationshipMetadata) {
            return 0.5; // Default confidence
        }

        let score = 0.5; // Base score

        // LLM confidence boost
        if (relationshipMetadata.confidence !== undefined) {
            score = relationshipMetadata.confidence * 0.7;
        }

        // Multiple sources boost
        if (relationshipMetadata.sourceCount && relationshipMetadata.sourceCount > 1) {
            score += 0.2 * Math.min(1.0, relationshipMetadata.sourceCount / 3); // Cap at 3 sources
        }

        // Recency boost
        if (relationshipMetadata.lastVerified) {
            const daysSinceVerification = (Date.now() - relationshipMetadata.lastVerified.getTime()) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 1.0 - daysSinceVerification / 365);
            score += recencyScore * 0.1;
        }

        return Math.min(1.0, score);
    }
}

