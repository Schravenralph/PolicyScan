import { BaseEntity, EntityType } from '../../domain/ontology.js';
import { LocalEmbeddingProvider } from '../VectorService.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { MaximumWeightMatchingService } from '../knowledge-graph/resolution/MaximumWeightMatchingService.js';

export interface DuplicateMatch {
    entity: BaseEntity;
    similarity: number;
    matchReason: 'exact_id' | 'exact_uri' | 'name_similarity' | 'normalized_name' | 'semantic_similarity' | 'metadata_match' | 'maximum_weight_matching';
    confidence: number; // 0-1 scale
}

export interface DeduplicationResult {
    original: BaseEntity;
    duplicates: DuplicateMatch[];
    shouldMerge: boolean;
}

export interface MergeResult {
    mergedEntity: BaseEntity;
    mergedFrom: string[]; // IDs of entities that were merged
    provenance: Record<string, string[]>; // Track which sources contributed to each property
}

export interface MatchingConfig {
    nameSimilarityThreshold: number;
    semanticSimilarityThreshold: number;
    autoMergeThreshold: number;
    perEntityTypeRules?: Record<EntityType, {
        nameThreshold?: number;
        semanticThreshold?: number;
        autoMergeThreshold?: number;
    }>;
}

/**
 * Service for identifying and merging duplicate entities.
 * Uses multiple matching strategies: exact ID/URI, fuzzy name matching, normalized name comparison,
 * semantic similarity (with embeddings), and metadata comparison.
 */
export class DeduplicationService {
    private readonly defaultConfig: MatchingConfig = {
        nameSimilarityThreshold: 0.85,
        semanticSimilarityThreshold: 0.75,
        autoMergeThreshold: 0.95,
    };
    private config: MatchingConfig;
    private embeddingProvider: LocalEmbeddingProvider | null = null;
    private embeddingCache: Map<string, number[]> = new Map();
    private maximumWeightMatchingService: MaximumWeightMatchingService | null = null;

    constructor(
        private getNodeById: (id: string) => Promise<BaseEntity | undefined>,
        private getNodeByUri: (uri: string) => Promise<BaseEntity | undefined>,
        private getNodesByType: (type: BaseEntity['type']) => Promise<BaseEntity[]>,
        config?: Partial<MatchingConfig>,
        enableSemanticMatching: boolean = true
    ) {
        this.config = { ...this.defaultConfig, ...config };
        
        // Initialize embedding provider if semantic matching is enabled
        if (enableSemanticMatching) {
            try {
                this.embeddingProvider = new LocalEmbeddingProvider();
            } catch (error) {
                console.warn('[DeduplicationService] Failed to initialize embedding provider, semantic matching disabled:', error);
                this.embeddingProvider = null;
            }
        }

        // Initialize maximum weight matching service if feature flag is enabled
        if (FeatureFlag.isEnabled(KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED, false)) {
            try {
                this.maximumWeightMatchingService = new MaximumWeightMatchingService();
            } catch (error) {
                console.warn('[DeduplicationService] Failed to initialize maximum weight matching service:', error);
                this.maximumWeightMatchingService = null;
            }
        }
    }

    /**
     * Normalize entity name for comparison (handles variations like "Gemeente Amsterdam" vs "Amsterdam")
     */
    private normalizeName(name: string): string {
        return name
            .toLowerCase()
            .replace(/^(gemeente|provincie|waterschap|rijksoverheid)\s+/i, '')
            .trim()
            .replace(/\s+/g, ' ');
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            return 0;
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) return 0;

        return dotProduct / denominator;
    }

    /**
     * Get or generate embedding for an entity
     */
    private async getEntityEmbedding(entity: BaseEntity): Promise<number[] | null> {
        if (!this.embeddingProvider) {
            return null;
        }

        // Check cache first
        const cacheKey = `${entity.id}:${entity.name}`;
        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey)!;
        }

        try {
            // Generate text representation for embedding
            const textParts: string[] = [entity.name];
            if (entity.description) {
                textParts.push(entity.description);
            }
            if (entity.metadata) {
                // Include key metadata fields
                const keyFields = ['jurisdiction', 'documentType', 'category', 'spatialType'];
                for (const field of keyFields) {
                    if (entity.metadata[field]) {
                        textParts.push(String(entity.metadata[field]));
                    }
                }
            }

            const text = textParts.join(' ');
            const embedding = await this.embeddingProvider.generateEmbedding(text);
            
            // Cache the embedding
            this.embeddingCache.set(cacheKey, embedding);
            return embedding;
        } catch (error) {
            console.warn(`[DeduplicationService] Failed to generate embedding for entity ${entity.id}:`, error);
            return null;
        }
    }

    /**
     * Find potential duplicates for an entity
     */
    async findDuplicates(entity: BaseEntity): Promise<DuplicateMatch[]> {
        const matches: DuplicateMatch[] = [];
        const entityTypeConfig = this.config.perEntityTypeRules?.[entity.type];

        // 1. Exact ID match (always a duplicate)
        const existingById = await this.getNodeById(entity.id);
        if (existingById && existingById.id === entity.id) {
            matches.push({
                entity: existingById,
                similarity: 1.0,
                matchReason: 'exact_id',
                confidence: 1.0,
            });
        }

        // 2. Exact URI match
        if (entity.uri) {
            const existingByUri = await this.getNodeByUri(entity.uri);
            if (existingByUri && existingByUri.id !== entity.id) {
                matches.push({
                    entity: existingByUri,
                    similarity: 1.0,
                    matchReason: 'exact_uri',
                    confidence: 1.0,
                });
            }
        }

        // 3. Normalized name match (handles "Gemeente Amsterdam" vs "Amsterdam")
        const normalizedMatches = await this.findByNormalizedName(entity);
        matches.push(...normalizedMatches);

        // 4. Name similarity (fuzzy matching)
        const nameMatches = await this.findByNameSimilarity(entity);
        matches.push(...nameMatches);

        // 5. Semantic similarity (if embeddings available)
        if (this.embeddingProvider) {
            const semanticMatches = await this.findBySemanticSimilarity(entity);
            matches.push(...semanticMatches);
        }

        // 6. Metadata comparison
        if (entity.metadata) {
            const metadataMatches = await this.findByMetadata(entity);
            matches.push(...metadataMatches);
        }

        // 7. Maximum weight matching (HERA algorithm) for heterogeneous schemas
        if (this.maximumWeightMatchingService && FeatureFlag.isEnabled(KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED, false)) {
            const mwmMatches = await this.findByMaximumWeightMatching(entity);
            matches.push(...mwmMatches);
        }

        // Sort by similarity (highest first)
        matches.sort((a, b) => b.similarity - a.similarity);

        // Remove duplicates (same entity ID), keeping the highest similarity match
        const seen = new Map<string, DuplicateMatch>();
        for (const match of matches) {
            const existing = seen.get(match.entity.id);
            if (!existing || match.similarity > existing.similarity) {
                seen.set(match.entity.id, match);
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Normalized name matching (handles "Gemeente Amsterdam" vs "Amsterdam")
     */
    private async findByNormalizedName(entity: BaseEntity): Promise<DuplicateMatch[]> {
        const candidates = await this.getNodesByType(entity.type);
        const matches: DuplicateMatch[] = [];
        const normalizedEntityName = this.normalizeName(entity.name);

        for (const candidate of candidates) {
            if (candidate.id === entity.id) continue;

            const normalizedCandidateName = this.normalizeName(candidate.name);
            
            // Exact normalized match
            if (normalizedEntityName === normalizedCandidateName) {
                matches.push({
                    entity: candidate,
                    similarity: 0.98, // High similarity but slightly less than exact ID/URI
                    matchReason: 'normalized_name',
                    confidence: 0.95,
                });
            }
        }

        return matches;
    }

    /**
     * Fuzzy name matching using Levenshtein distance
     */
    private async findByNameSimilarity(entity: BaseEntity): Promise<DuplicateMatch[]> {
        // Get all entities of the same type
        const candidates = await this.getNodesByType(entity.type);
        const matches: DuplicateMatch[] = [];
        const threshold = this.config.perEntityTypeRules?.[entity.type]?.nameThreshold ?? this.config.nameSimilarityThreshold;

        for (const candidate of candidates) {
            if (candidate.id === entity.id) continue;

            const similarity = this.calculateNameSimilarity(entity.name, candidate.name);
            if (similarity >= threshold) {
                // Calculate confidence based on similarity
                const confidence = Math.min(0.9, 0.5 + (similarity - threshold) / (1 - threshold) * 0.4);
                
                matches.push({
                    entity: candidate,
                    similarity,
                    matchReason: 'name_similarity',
                    confidence,
                });
            }
        }

        return matches;
    }

    /**
     * Semantic similarity matching using embeddings
     */
    private async findBySemanticSimilarity(entity: BaseEntity): Promise<DuplicateMatch[]> {
        if (!this.embeddingProvider) {
            return [];
        }

        const entityEmbedding = await this.getEntityEmbedding(entity);
        if (!entityEmbedding) {
            return [];
        }

        const candidates = await this.getNodesByType(entity.type);
        const matches: DuplicateMatch[] = [];
        const threshold = this.config.perEntityTypeRules?.[entity.type]?.semanticThreshold ?? this.config.semanticSimilarityThreshold;

        for (const candidate of candidates) {
            if (candidate.id === entity.id) continue;

            const candidateEmbedding = await this.getEntityEmbedding(candidate);
            if (!candidateEmbedding) continue;

            const similarity = this.cosineSimilarity(entityEmbedding, candidateEmbedding);
            if (similarity >= threshold) {
                // Confidence for semantic matches is based on similarity
                const confidence = Math.min(0.85, 0.6 + (similarity - threshold) / (1 - threshold) * 0.25);
                
                matches.push({
                    entity: candidate,
                    similarity,
                    matchReason: 'semantic_similarity',
                    confidence,
                });
            }
        }

        return matches;
    }

    /**
     * Calculate string similarity using normalized Levenshtein distance
     */
    private calculateNameSimilarity(str1: string, str2: string): number {
        // Normalize strings (lowercase, remove extra spaces)
        const s1 = str1.toLowerCase().trim().replace(/\s+/g, ' ');
        const s2 = str2.toLowerCase().trim().replace(/\s+/g, ' ');

        // Exact match
        if (s1 === s2) return 1.0;

        // Levenshtein distance
        const distance = this.levenshteinDistance(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);

        if (maxLen === 0) return 1.0;

        return 1 - distance / maxLen;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];
        const len1 = str1.length;
        const len2 = str2.length;

        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1, // deletion
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j - 1] + 1 // substitution
                    );
                }
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Find matches based on metadata similarity
     * This is a simplified version - can be enhanced with more sophisticated matching
     */
    private async findByMetadata(entity: BaseEntity): Promise<DuplicateMatch[]> {
        const matches: DuplicateMatch[] = [];

        if (!entity.metadata) return matches;

        // For PolicyDocuments, check jurisdiction and date
        if (entity.type === 'PolicyDocument') {
            const candidates = await this.getNodesByType('PolicyDocument');
            const entityJurisdiction = (entity as any).jurisdiction;
            const entityDate = (entity as any).date;

            for (const candidate of candidates) {
                if (candidate.id === entity.id) continue;

                const candidateJurisdiction = (candidate as any).jurisdiction;
                const candidateDate = (candidate as any).date;

                // Match on jurisdiction and date
                if (entityJurisdiction && candidateJurisdiction && entityJurisdiction === candidateJurisdiction) {
                    if (entityDate && candidateDate && entityDate === candidateDate) {
                        matches.push({
                            entity: candidate,
                            similarity: 0.9,
                            matchReason: 'metadata_match',
                            confidence: 0.8, // Metadata matches have moderate confidence
                        });
                    } else if (entityJurisdiction === candidateJurisdiction) {
                        // Just jurisdiction match (lower similarity)
                        matches.push({
                            entity: candidate,
                            similarity: 0.7,
                            matchReason: 'metadata_match',
                            confidence: 0.6,
                        });
                    }
                }
            }
        }

        return matches;
    }

    /**
     * Find matches using maximum weight matching (HERA algorithm).
     * This is particularly useful for heterogeneous schemas where field information may be missing.
     */
    private async findByMaximumWeightMatching(entity: BaseEntity): Promise<DuplicateMatch[]> {
        if (!this.maximumWeightMatchingService) {
            return [];
        }

        try {
            // Get candidates of the same type
            const candidates = await this.getNodesByType(entity.type);
            const filteredCandidates = candidates.filter(c => c.id !== entity.id);

            if (filteredCandidates.length === 0) {
                return [];
            }

            // Find best match using maximum weight matching
            const bestMatch = await this.maximumWeightMatchingService.findBestMatch(
                entity,
                filteredCandidates
            );

            if (!bestMatch) {
                return [];
            }

            // Return match with appropriate confidence
            const confidence = Math.min(0.9, 0.7 + (bestMatch.similarity - 0.7) / 0.3 * 0.2);

            return [
                {
                    entity: bestMatch.entity,
                    similarity: bestMatch.similarity,
                    matchReason: 'maximum_weight_matching',
                    confidence,
                },
            ];
        } catch (error) {
            console.warn(`[DeduplicationService] Maximum weight matching failed for entity ${entity.id}:`, error);
            return [];
        }
    }

    /**
     * Find optimal matches for multiple entities using maximum weight matching.
     * Useful for batch entity resolution with heterogeneous schemas.
     * 
     * @param entities Entities to match
     * @param candidates Candidate entities to match against
     * @returns Map of entity ID to matched entities with similarities
     */
    async findOptimalMatches(
        entities: BaseEntity[],
        candidates: BaseEntity[]
    ): Promise<Map<string, Array<{ entity: BaseEntity; similarity: number }>>> {
        if (!this.maximumWeightMatchingService || !FeatureFlag.isEnabled(KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED, false)) {
            // Fallback to individual matching
            const results = new Map<string, Array<{ entity: BaseEntity; similarity: number }>>();
            for (const entity of entities) {
                const matches = await this.findDuplicates(entity);
                results.set(
                    entity.id,
                    matches.map(m => ({ entity: m.entity, similarity: m.similarity }))
                );
            }
            return results;
        }

        try {
            const matchesMap = await this.maximumWeightMatchingService.findAllMatches(
                entities,
                candidates
            );

            // Convert index-based map to ID-based map
            const result = new Map<string, Array<{ entity: BaseEntity; similarity: number }>>();
            for (const [leftIdx, matches] of matchesMap.entries()) {
                const entity = entities[leftIdx];
                result.set(entity.id, matches);
            }

            return result;
        } catch (error) {
            console.warn('[DeduplicationService] Batch maximum weight matching failed:', error);
            // Fallback to individual matching
            const results = new Map<string, Array<{ entity: BaseEntity; similarity: number }>>();
            for (const entity of entities) {
                const matches = await this.findDuplicates(entity);
                results.set(
                    entity.id,
                    matches.map(m => ({ entity: m.entity, similarity: m.similarity }))
                );
            }
            return results;
        }
    }

    /**
     * Automated deduplication with user confirmation required for high-confidence matches
     */
    async autoDeduplicate(
        entity: BaseEntity,
        autoMergeThreshold?: number
    ): Promise<DeduplicationResult> {
        const entityTypeConfig = this.config.perEntityTypeRules?.[entity.type];
        const threshold = autoMergeThreshold ?? entityTypeConfig?.autoMergeThreshold ?? this.config.autoMergeThreshold;
        const duplicates = await this.findDuplicates(entity);

        // High-confidence duplicates can be auto-merged
        // Use both similarity and confidence for auto-merge decision
        const highConfidence = duplicates.filter((d) => 
            d.similarity >= threshold && d.confidence >= 0.85
        );

        // Lower-confidence duplicates require review
        const lowConfidence = duplicates.filter((d) => 
            d.similarity < threshold || d.confidence < 0.85
        );

        return {
            original: entity,
            duplicates: [...highConfidence, ...lowConfidence],
            shouldMerge: highConfidence.length > 0,
        };
    }

    /**
     * Merge duplicate entities preserving all properties and tracking provenance
     */
    async mergeEntities(
        primaryEntity: BaseEntity,
        duplicateEntities: BaseEntity[],
        mergeStrategy: 'keep_primary' | 'keep_most_recent' | 'merge_properties' = 'merge_properties'
    ): Promise<MergeResult> {
        const mergedEntity: BaseEntity = { ...primaryEntity };
        const mergedFrom: string[] = [primaryEntity.id, ...duplicateEntities.map(e => e.id)];
        const provenance: Record<string, string[]> = {};

        // Initialize provenance for primary entity properties
        for (const key of Object.keys(primaryEntity)) {
            if (key !== 'id' && key !== 'type') {
                provenance[key] = [primaryEntity.id];
            }
        }
        if (primaryEntity.metadata) {
            for (const key of Object.keys(primaryEntity.metadata)) {
                provenance[`metadata.${key}`] = [primaryEntity.id];
            }
        }

        for (const duplicate of duplicateEntities) {
            // Merge properties based on strategy
            if (mergeStrategy === 'merge_properties') {
                // Merge all non-conflicting properties
                if (duplicate.description && !mergedEntity.description) {
                    mergedEntity.description = duplicate.description;
                    provenance.description = [...(provenance.description || []), duplicate.id];
                }
                
                if (duplicate.uri && !mergedEntity.uri) {
                    mergedEntity.uri = duplicate.uri;
                    provenance.uri = [...(provenance.uri || []), duplicate.id];
                }

                // Merge metadata
                if (duplicate.metadata) {
                    mergedEntity.metadata = mergedEntity.metadata || {};
                    for (const [key, value] of Object.entries(duplicate.metadata)) {
                        if (!(key in mergedEntity.metadata)) {
                            mergedEntity.metadata[key] = value;
                            provenance[`metadata.${key}`] = [duplicate.id];
                        } else {
                            // Property exists, track both sources
                            provenance[`metadata.${key}`] = [
                                ...(provenance[`metadata.${key}`] || []),
                                duplicate.id
                            ];
                        }
                    }
                }
            } else if (mergeStrategy === 'keep_most_recent') {
                // Compare timestamps if available
                const primaryDate = (primaryEntity.metadata?.createdAt as string) || '';
                const duplicateDate = (duplicate.metadata?.createdAt as string) || '';
                
                if (duplicateDate > primaryDate) {
                    // Duplicate is more recent, use its properties but keep primary ID
                    Object.assign(mergedEntity, {
                        ...duplicate,
                        id: primaryEntity.id, // Always keep primary ID
                    });
                }
            }
            // 'keep_primary' strategy: do nothing, already using primary entity
        }

        return {
            mergedEntity,
            mergedFrom,
            provenance,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<MatchingConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): MatchingConfig {
        return { ...this.config };
    }
}
