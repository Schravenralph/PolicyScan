/**
 * TruthfulRAG Service
 * 
 * Implements TruthfulRAG conflict resolution framework using entropy-based filtering
 * to detect and resolve factual conflicts between vector-retrieved content and KG facts.
 * 
 * Based on research: "TruthfulRAG uses entropy-based filtering (ΔH_p > τ) to detect
 * factual conflicts between vector content and KG facts"
 */

import { FactFirstRetrievalService, FactResult } from './FactFirstRetrievalService.js';
import { ContextualEnrichmentService, EnrichedChunk } from './ContextualEnrichmentService.js';
import { EntropyCalculator, EntropyComparison } from './EntropyCalculator.js';
import { ConflictDetector, Conflict } from './ConflictDetector.js';
import { LLMService } from '../llm/LLMService.js';
import { VectorService } from '../query/VectorService.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';

export interface TruthfulRAGResult {
    query: string;
    facts: FactResult[];
    vectorChunks: EnrichedChunk[];
    correctivePaths: FactResult[]; // Paths with high entropy delta (P_corrective)
    conflicts: Conflict[];
    filteredContent: string[];
    entropyComparisons: EntropyComparison[];
    metrics: {
        queryTime: number;
        entropyCalculationTime: number;
        conflictDetectionTime: number;
        totalConflicts: number;
        correctivePathsCount: number;
        filteredChunksCount: number;
    };
}

export interface TruthfulRAGOptions {
    entropyThreshold?: number; // τ threshold for entropy delta
    maxResults?: number;
    enableFiltering?: boolean; // Filter out conflicting content
    enableExplainability?: boolean; // Include detailed explanations
}

/**
 * TruthfulRAG Service
 * 
 * Detects and resolves factual conflicts between vector content and KG facts
 */
export class TruthfulRAGService {
    private factFirstService: FactFirstRetrievalService;
    private contextualEnrichmentService: ContextualEnrichmentService;
    private entropyCalculator: EntropyCalculator;
    private conflictDetector: ConflictDetector;
    private vectorService: VectorService;

    constructor(
        factFirstService: FactFirstRetrievalService,
        contextualEnrichmentService: ContextualEnrichmentService,
        llmService: LLMService,
        vectorService: VectorService,
        entropyThreshold: number = 0.1
    ) {
        this.factFirstService = factFirstService;
        this.contextualEnrichmentService = contextualEnrichmentService;
        this.vectorService = vectorService;
        this.entropyCalculator = new EntropyCalculator(llmService, entropyThreshold);
        this.conflictDetector = new ConflictDetector(entropyThreshold);
    }

    /**
     * Process query with TruthfulRAG conflict resolution
     * 
     * @param query Natural language query
     * @param options TruthfulRAG options
     * @returns TruthfulRAG result with conflicts detected and resolved
     */
    async processQuery(query: string, options: TruthfulRAGOptions = {}): Promise<TruthfulRAGResult> {
        const startTime = Date.now();

        // Check if TruthfulRAG is enabled
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_TRUTHFULRAG_ENABLED, false)) {
            logger.debug('[TruthfulRAG] Feature flag disabled, returning empty results');
            return this.createEmptyResult(query);
        }

        const entropyThreshold = options.entropyThreshold ?? 0.1;
        this.entropyCalculator.setThreshold(entropyThreshold);
        this.conflictDetector.setThreshold(entropyThreshold);

        logger.info(`[TruthfulRAG] Processing query: "${query}"`);

        // Step 1: Identify relevant entities (E_imp) and relations (R_imp) using vector similarity
        const kgResults = await this.factFirstService.query(query, {
            maxResults: options.maxResults || 50
        });

        // Step 2: Get vector content for comparison
        const vectorResults = await this.vectorService.search(query, options.maxResults || 50);
        const vectorChunks = vectorResults.map(result => ({
            id: result.document.id,
            content: result.document.content,
            similarity: result.score,
            relevanceScore: result.score,
            metadata: result.document.metadata
        }));

        // Step 3: Enrich KG facts with vector context
        const enrichmentResult = await this.contextualEnrichmentService.enrichFacts(
            kgResults.facts,
            query,
            {
                maxChunksPerEntity: 5,
                maxChunksPerQuery: 20,
                minSimilarity: 0.3
            }
        );

        // Combine vector chunks from enrichment
        const allVectorChunks: EnrichedChunk[] = [];
        for (const result of enrichmentResult.results) {
            allVectorChunks.push(...result.chunks);
        }
        // Add direct vector search results
        allVectorChunks.push(...vectorChunks);

        // Step 4: Calculate fact-aware path scoring (Ref(p)) and entropy
        const entropyStartTime = Date.now();
        const entropyComparisons = await this.calculateEntropyForPaths(
            query,
            kgResults.facts,
            allVectorChunks
        );
        const entropyCalculationTime = Date.now() - entropyStartTime;

        // Step 5: Identify corrective paths (high ΔH_p > τ)
        const correctivePaths = kgResults.facts.filter((_fact, index) => {
            const comparison = entropyComparisons[index];
            return comparison && comparison.isCorrective;
            // fact parameter unused in filter callback
        });

        // Step 6: Detect conflicts
        const conflictStartTime = Date.now();
        const conflictResult = this.conflictDetector.detectConflicts(
            allVectorChunks,
            kgResults.facts,
            entropyComparisons
        );
        const conflictDetectionTime = Date.now() - conflictStartTime;

        // Step 7: Filter conflicting content if enabled
        const filteredContent = options.enableFiltering !== false
            ? conflictResult.filteredContent
            : [];

        const queryTime = Date.now() - startTime;

        logger.info(
            `[TruthfulRAG] Query completed in ${queryTime}ms: ` +
            `${kgResults.facts.length} KG facts, ${allVectorChunks.length} vector chunks, ` +
            `${correctivePaths.length} corrective paths, ${conflictResult.totalConflicts} conflicts`
        );

        return {
            query,
            facts: kgResults.facts,
            vectorChunks: allVectorChunks,
            correctivePaths,
            conflicts: conflictResult.conflicts,
            filteredContent,
            entropyComparisons,
            metrics: {
                queryTime,
                entropyCalculationTime,
                conflictDetectionTime,
                totalConflicts: conflictResult.totalConflicts,
                correctivePathsCount: correctivePaths.length,
                filteredChunksCount: filteredContent.length
            }
        };
    }

    /**
     * Calculate entropy for each KG fact path
     */
    private async calculateEntropyForPaths(
        query: string,
        facts: FactResult[],
        vectorChunks: EnrichedChunk[]
    ): Promise<EntropyComparison[]> {
        const comparisons: EntropyComparison[] = [];

        // Combine vector chunks into single context
        const vectorContent = vectorChunks
            .slice(0, 10) // Limit to top 10 chunks
            .map(chunk => chunk.content)
            .join('\n\n');

        // Calculate entropy for each fact
        for (const fact of facts) {
            try {
                // Format KG fact
                const kgFact = this.formatFactForEntropy(fact);

                // Compare entropy before and after KG facts
                const comparison = await this.entropyCalculator.compareEntropy(
                    query,
                    vectorContent,
                    kgFact,
                    this.entropyCalculator.getThreshold()
                );

                comparisons.push(comparison);
            } catch (error) {
                logger.warn({ error }, `[TruthfulRAG] Failed to calculate entropy for fact ${fact.entity.id}:`);
                // Add default comparison (not corrective)
                comparisons.push({
                    before: { entropy: 0.5, confidence: 0.5, tokens: 0 },
                    after: { entropy: 0.5, confidence: 0.5, tokens: 0 },
                    delta: 0,
                    isCorrective: false
                });
            }
        }

        return comparisons;
    }

    /**
     * Format KG fact for entropy calculation
     */
    private formatFactForEntropy(fact: FactResult): string {
        const parts: string[] = [];

        if (fact.entity.name) {
            parts.push(`Entity: ${fact.entity.name}`);
        }

        if (fact.entity.description) {
            parts.push(`Description: ${fact.entity.description}`);
        }

        if (fact.entity.type) {
            parts.push(`Type: ${fact.entity.type}`);
        }

        if (fact.relationships && fact.relationships.length > 0) {
            const rels = fact.relationships
                .map(r => `${r.type}: ${r.targetId}`)
                .join(', ');
            parts.push(`Relationships: ${rels}`);
        }

        if (fact.provenance?.sourceUrls && fact.provenance.sourceUrls.length > 0) {
            parts.push(`Sources: ${fact.provenance.sourceUrls.join(', ')}`);
        }

        return parts.join('\n');
    }

    /**
     * Create empty result
     */
    private createEmptyResult(query: string): TruthfulRAGResult {
        return {
            query,
            facts: [],
            vectorChunks: [],
            correctivePaths: [],
            conflicts: [],
            filteredContent: [],
            entropyComparisons: [],
            metrics: {
                queryTime: 0,
                entropyCalculationTime: 0,
                conflictDetectionTime: 0,
                totalConflicts: 0,
                correctivePathsCount: 0,
                filteredChunksCount: 0
            }
        };
    }

    /**
     * Set entropy threshold
     */
    setEntropyThreshold(threshold: number): void {
        this.entropyCalculator.setThreshold(threshold);
        this.conflictDetector.setThreshold(threshold);
    }

    /**
     * Get current entropy threshold
     */
    getEntropyThreshold(): number {
        return this.entropyCalculator.getThreshold();
    }
}

