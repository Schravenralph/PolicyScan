import { BaseEntity, RelationType } from '../domain/ontology.js';
import { KnowledgeGraphService } from './knowledge-graph/core/KnowledgeGraph.js';

/**
 * Configuration for ranking weights
 */
export interface RankingConfig {
    vectorWeight: number;      // Weight for vector similarity score (default: 0.5)
    graphWeight: number;       // Weight for graph relevance score (default: 0.25)
    recencyWeight: number;     // Weight for recency/freshness score (default: 0.1)
    metadataWeight: number;    // Weight for metadata-based score (default: 0.15)
}

/**
 * Breakdown of ranking factors for a result
 */
export interface RankingFactors {
    vectorScore: number;       // Normalized vector similarity [0, 1]
    graphRelevance: number;    // Normalized graph relevance [0, 1]
    recencyScore: number;      // Normalized recency score [0, 1]
    metadataScore: number;     // Normalized metadata-based score [0, 1]
    finalScore: number;        // Weighted combination
}

/**
 * Service for calculating ranking scores in hybrid search
 */
export class RankingService {
    private config: RankingConfig;
    private knowledgeGraph: KnowledgeGraphService;

    private readonly metadataRankingEnabled: boolean;

    constructor(
        knowledgeGraph: KnowledgeGraphService,
        config: Partial<RankingConfig> = {}
    ) {
        this.knowledgeGraph = knowledgeGraph;
        this.metadataRankingEnabled = process.env.METADATA_RANKING_ENABLED !== 'false';
        
        this.config = {
            vectorWeight: config.vectorWeight ?? 0.5,
            graphWeight: config.graphWeight ?? 0.25,
            recencyWeight: config.recencyWeight ?? 0.1,
            metadataWeight: config.metadataWeight ?? (this.metadataRankingEnabled ? 0.15 : 0)
        };

        // If metadata is disabled, redistribute weights proportionally
        if (!this.metadataRankingEnabled && this.config.metadataWeight > 0) {
            const remainingWeight = 1.0 - this.config.metadataWeight;
            // Scale each weight proportionally to fill the space left by removing metadataWeight
            this.config.vectorWeight = this.config.vectorWeight / remainingWeight;
            this.config.graphWeight = this.config.graphWeight / remainingWeight;
            this.config.recencyWeight = this.config.recencyWeight / remainingWeight;
            this.config.metadataWeight = 0;
        }

        // Validate weights sum to 1.0
        const sum = this.config.vectorWeight + this.config.graphWeight + this.config.recencyWeight + this.config.metadataWeight;
        if (Math.abs(sum - 1.0) > 0.001) {
            console.warn(`Ranking weights sum to ${sum}, not 1.0. Normalizing...`);
            this.config.vectorWeight /= sum;
            this.config.graphWeight /= sum;
            this.config.recencyWeight /= sum;
            this.config.metadataWeight /= sum;
        }
    }

    /**
     * Calculate the final ranking score for a search result
     * @param vectorScore Vector similarity score [0, 1]
     * @param entity Optional knowledge graph entity for graph relevance
     * @param metadata Optional metadata containing date and other metadata fields
     * @param query Optional query information for metadata matching
     * @returns Ranking factors breakdown
     */
    async calculateRankScore(
        vectorScore: number,
        entity?: BaseEntity,
        metadata?: Record<string, unknown>,
        query?: { onderwerp?: string; thema?: string; overheidslaag?: string }
    ): Promise<RankingFactors> {
        // Normalize vector score (should already be in [0, 1])
        const normalizedVectorScore = this.normalizeScore(vectorScore, 0, 1);

        // Calculate graph relevance
        const graphRelevance = entity
            ? await this.calculateGraphRelevance(entity)
            : 0;

        // Calculate recency score
        const recencyScore = metadata?.date || metadata?.publicatiedatum
            ? this.calculateRecencyScore(String(metadata.date || metadata.publicatiedatum))
            : 0.5; // Default to middle if no date

        // Calculate metadata-based score
        const metadataScore = this.metadataRankingEnabled && metadata
            ? this.calculateMetadataScore(metadata, query)
            : 0;

        // Calculate weighted final score
        const finalScore =
            normalizedVectorScore * this.config.vectorWeight +
            graphRelevance * this.config.graphWeight +
            recencyScore * this.config.recencyWeight +
            metadataScore * this.config.metadataWeight;

        return {
            vectorScore: normalizedVectorScore,
            graphRelevance,
            recencyScore,
            metadataScore,
            finalScore
        };
    }

    /**
     * Calculate metadata-based ranking score [0, 1]
     * Considers document type, themes, authority, and confidence
     */
    private calculateMetadataScore(
        metadata: Record<string, unknown>,
        query?: { onderwerp?: string; thema?: string; overheidslaag?: string }
    ): number {
        let score = 0;
        let factors = 0;
        const confidence = (typeof metadata.metadataConfidence === 'number' ? metadata.metadataConfidence : 0.5);

        // Policy document boost for policy queries
        if (query && this.isPolicyQuery(query.onderwerp || '', query.thema || '')) {
            const docType = (metadata.documentType || metadata.type_document) as string | undefined;
            if (this.isPolicyDocument(docType)) {
                score += 0.3 * confidence;
                factors++;
            }
        }

        // Theme matching
        if (query?.thema && metadata.themes && Array.isArray(metadata.themes)) {
            const themeMatch = this.matchThemes(metadata.themes as string[], query.thema);
            if (themeMatch > 0) {
                score += 0.3 * themeMatch * confidence;
                factors++;
            }
        }

        // Authority matching
        if (query?.overheidslaag && metadata.issuingAuthority) {
            if (this.matchAuthority(String(metadata.issuingAuthority), query.overheidslaag)) {
                score += 0.2 * confidence;
                factors++;
            }
        }

        // Recency boost (already in recencyScore, but add small bonus for high confidence)
        if (metadata.publicatiedatum && typeof metadata.publicatiedatum === 'string' && confidence > 0.7) {
            score += 0.1 * confidence;
            factors++;
        }

        // Normalize by number of factors
        return factors > 0 ? Math.min(1, score) : 0;
    }

    /**
     * Check if query is policy-related
     */
    private isPolicyQuery(onderwerp: string, thema: string): boolean {
        const policyKeywords = ['beleid', 'beleidsnota', 'beleidsregel', 'beleidsdocument', 'beleidsplan'];
        const queryText = `${onderwerp} ${thema}`.toLowerCase();
        return policyKeywords.some(keyword => queryText.includes(keyword));
    }

    /**
     * Check if document type is a policy document
     */
    private isPolicyDocument(type: string | undefined): boolean {
        if (!type) return false;
        const policyTypes = [
            'Beleidsdocument',
            'Beleidsnota',
            'Beleidsregel',
            'Omgevingsvisie',
            'Structuurvisie',
            'Visiedocument'
        ];
        return policyTypes.includes(type);
    }

    /**
     * Match document themes to query theme
     */
    private matchThemes(documentThemes: string[], queryTheme: string): number {
        if (!queryTheme || documentThemes.length === 0) return 0;

        const queryLower = queryTheme.toLowerCase();
        let bestMatch = 0;

        for (const theme of documentThemes) {
            const themeLower = theme.toLowerCase();
            
            if (themeLower === queryLower) return 1.0;
            if (themeLower.includes(queryLower) || queryLower.includes(themeLower)) {
                bestMatch = Math.max(bestMatch, 0.7);
            }
        }

        return bestMatch;
    }

    /**
     * Check if document authority matches query government layer
     */
    private matchAuthority(issuingAuthority: string, overheidslaag: string): boolean {
        if (!issuingAuthority || !overheidslaag) return false;

        const authorityLower = issuingAuthority.toLowerCase();
        const layerLower = overheidslaag.toLowerCase();

        if (layerLower.includes('gemeente') && authorityLower.includes('gemeente')) return true;
        if (layerLower.includes('provincie') && authorityLower.includes('provincie')) return true;
        if ((layerLower.includes('rijk') || layerLower.includes('nationaal')) && 
            (authorityLower.includes('rijk') || authorityLower.includes('rijksoverheid'))) {
            return true;
        }

        return false;
    }

    /**
     * Calculate graph relevance score for an entity based on its connections
     * @param entity The knowledge graph entity
     * @returns Normalized relevance score [0, 1]
     */
    async calculateGraphRelevance(entity: BaseEntity): Promise<number> {
        // Use Neo4j to efficiently get neighbor counts
        const counts = await this.knowledgeGraph.getNeighborCounts(entity.id);
        
        // Count edges (we don't need the actual edge objects, just counts)
        const outgoingEdgeCount = counts.outgoing.total;
        const incomingEdgeCount = counts.incoming.total;

        // Calculate base connectivity score
        // Incoming edges are weighted more heavily (being referenced is important)
        const connectivityScore = (incomingEdgeCount * 2 + outgoingEdgeCount) / 10;

        // Entity type importance weights
        const typeWeights: Record<string, number> = {
            'PolicyDocument': 1.0,
            'Regulation': 0.8,
            'Requirement': 0.6,
            'SpatialUnit': 0.5,
            'LandUse': 0.4,
            'Concept': 0.3
        };
        const typeScore = typeWeights[entity.type] ?? 0.5;

        // Relationship type importance
        let relationshipScore = 0;

        // Check outgoing relationships
        const outgoingDefinedInCount = counts.outgoing.byType[RelationType.DEFINED_IN] || 0;
        const outgoingAppliesToCount = counts.outgoing.byType[RelationType.APPLIES_TO] || 0;
        relationshipScore += (outgoingDefinedInCount + outgoingAppliesToCount) * 0.1;

        // Check incoming relationships
        const incomingDefinedInCount = counts.incoming.byType[RelationType.DEFINED_IN] || 0;
        const incomingAppliesToCount = counts.incoming.byType[RelationType.APPLIES_TO] || 0;
        relationshipScore += (incomingDefinedInCount + incomingAppliesToCount) * 0.1;

        // Combine scores (weighted average)
        const rawScore = (
            connectivityScore * 0.4 +
            typeScore * 0.4 +
            Math.min(relationshipScore, 1.0) * 0.2
        );

        // Normalize to [0, 1]
        return this.normalizeScore(rawScore, 0, 2);
    }

    /**
     * Calculate recency score based on document date
     * More recent documents get higher scores
     * @param dateString ISO date string
     * @returns Normalized recency score [0, 1]
     */
    calculateRecencyScore(dateString: string): number {
        try {
            const date = new Date(dateString);

            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 0.5;
            }

            const now = new Date();
            const ageInDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

            // Exponential decay: documents lose relevance over time
            // Half-life of ~365 days (1 year)
            const halfLife = 365;
            const score = Math.exp(-ageInDays / halfLife);

            return this.normalizeScore(score, 0, 1);
        } catch (e) {
            // If date parsing fails, return neutral score
            return 0.5;
        }
    }

    /**
     * Normalize a score to [0, 1] range
     * @param value The value to normalize
     * @param min Minimum possible value
     * @param max Maximum possible value
     * @returns Normalized value in [0, 1]
     */
    normalizeScore(value: number, min: number, max: number): number {
        if (max === min) return 0.5;
        const normalized = (value - min) / (max - min);
        return Math.max(0, Math.min(1, normalized));
    }

    /**
     * Get current ranking configuration
     */
    getConfig(): RankingConfig {
        return { ...this.config };
    }

    /**
     * Update ranking configuration
     */
    updateConfig(config: Partial<RankingConfig>): void {
        this.config = {
            ...this.config,
            ...config
        };

        // Re-normalize weights
        const sum = this.config.vectorWeight + this.config.graphWeight + this.config.recencyWeight + this.config.metadataWeight;
        if (Math.abs(sum - 1.0) > 0.001) {
            this.config.vectorWeight /= sum;
            this.config.graphWeight /= sum;
            this.config.recencyWeight /= sum;
            this.config.metadataWeight /= sum;
        }
    }
}
