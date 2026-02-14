/**
 * Document Comparison Service
 * 
 * Provides structured document-to-document comparison with:
 * - Concept extraction and matching
 * - Evidence gathering with citations
 * - Delta analysis (what changed)
 * - Confidence scoring
 * - Explanation generation
 * 
 * This service is part of WI-COMPARISON-001: Structured Document Comparison Architecture.
 * 
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */

import { ObjectId } from 'mongodb';
import { LLMService } from '../llm/LLMService.js';
import { CanonicalChunkService } from '../canonical/CanonicalChunkService.js';
import { VectorService } from '../query/VectorService.js';
import { logger } from '../../utils/logger.js';
import { ServiceUnavailableError } from '../../types/errors.js';
import { ComparisonModel } from '../../models/Comparison.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type {
  DocumentComparison,
  ExtractedConcept,
  ConceptMatch,
  MatchedConcept,
  DocumentDifference,
  ComparisonSummary,
  EvidenceBundle,
  ChunkEvidence,
  ConceptDelta,
} from './types.js';

/**
 * Comparison options
 */
export interface ComparisonOptions {
  strategy?: 'semantic' | 'structured' | 'hybrid';
  extractionMethod?: 'llm' | 'rule-based' | 'hybrid';
  includeMetadata?: boolean;
  maxConcepts?: number;
  minConfidence?: number;
}

/**
 * Document Comparison Service
 */
export class DocumentComparisonService {
  private llmService: LLMService | null = null;
  private chunkService: CanonicalChunkService;
  private vectorService: VectorService;
  private cache: Map<string, DocumentComparison> = new Map();

  constructor(config?: {
    llmEnabled?: boolean;
    chunkService?: CanonicalChunkService;
    vectorService?: VectorService;
  }) {
    const llmEnabled = config?.llmEnabled ?? process.env.COMPARISON_LLM_ENABLED === 'true';
    
    if (llmEnabled) {
      try {
        this.llmService = new LLMService({
          enabled: true,
          provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic' | 'local') || 'openai',
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 2000,
          cacheEnabled: true,
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize LLM service for comparison, using rule-based extraction');
        this.llmService = null;
      }
    }

    this.chunkService = config?.chunkService || new CanonicalChunkService();
    this.vectorService = config?.vectorService || new VectorService();
  }

  /**
   * Compare two documents
   */
  async compare(
    documentA: CanonicalDocument,
    documentB: CanonicalDocument,
    options: ComparisonOptions = {}
  ): Promise<DocumentComparison> {
    const startTime = Date.now();
    const comparisonId = new ObjectId().toString();
    
    const strategy = options.strategy || 'hybrid';
    const extractionMethod = options.extractionMethod || (this.llmService ? 'hybrid' : 'rule-based');
    // const includeMetadata = options.includeMetadata ?? true; // Unused
    const maxConcepts = options.maxConcepts || 50;
    const minConfidence = options.minConfidence || 0.5;

    // Check cache
    const cacheKey = this.getCacheKey(documentA, documentB, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ comparisonId }, 'Returning cached comparison');
      return cached;
    }

    try {
      // Step 1: Extract concepts from both documents
      logger.debug({ comparisonId, documentA: documentA._id, documentB: documentB._id }, 'Extracting concepts');
      const [conceptsA, conceptsB] = await Promise.all([
        this.extractConcepts(documentA, extractionMethod, maxConcepts),
        this.extractConcepts(documentB, extractionMethod, maxConcepts),
      ]);

      // Step 2: Match concepts between documents
      logger.debug({ comparisonId, conceptsA: conceptsA.length, conceptsB: conceptsB.length }, 'Matching concepts');
      const matches = await this.matchConcepts(conceptsA, conceptsB, strategy);

      // Step 3: Gather evidence for matched concepts
      logger.debug({ comparisonId, matches: matches.length }, 'Gathering evidence');
      const matchedConcepts = await this.gatherEvidence(matches, documentA, documentB);

      // Step 4: Analyze deltas and create differences
      logger.debug({ comparisonId }, 'Analyzing deltas');
      const differences = this.analyzeDeltas(matchedConcepts);

      // Step 5: Calculate confidence scores
      const confidence = this.calculateOverallConfidence(matchedConcepts, differences);

      // Step 6: Generate summary
      const summary = this.generateSummary(matchedConcepts, differences);

      const processingTime = Date.now() - startTime;

      const comparison: DocumentComparison = {
        documentA,
        documentB,
        comparisonId,
        matchedConcepts: matchedConcepts.filter(mc => mc.confidence >= minConfidence),
        differences: differences.filter(d => d.confidence >= minConfidence),
        summary,
        confidence,
        metadata: {
          comparisonDate: new Date(),
          comparisonStrategy: strategy,
          extractionMethod: extractionMethod as 'llm' | 'rule-based' | 'hybrid',
          processingTime,
        },
      };

      // Persist result
      await ComparisonModel.create(comparison);

      // Cache result (keep for fast access in same session)
      this.cache.set(cacheKey, comparison);
      if (this.cache.size > 50) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }

      logger.info(
        {
          comparisonId,
          conceptsA: conceptsA.length,
          conceptsB: conceptsB.length,
          matched: matchedConcepts.length,
          differences: differences.length,
          confidence,
          processingTime,
        },
        'Document comparison completed'
      );

      return comparison;
    } catch (error) {
      logger.error({ error, comparisonId }, 'Document comparison failed');
      throw error;
    }
  }

  /**
   * Extract concepts from a document
   */
  private async extractConcepts(
    document: CanonicalDocument,
    method: 'llm' | 'rule-based' | 'hybrid',
    maxConcepts: number
  ): Promise<ExtractedConcept[]> {
    if (method === 'rule-based' || (method === 'hybrid' && !this.llmService)) {
      return this.extractConceptsRuleBased(document, maxConcepts);
    } else if (method === 'llm' && this.llmService) {
      return this.extractConceptsWithLLM(document, maxConcepts);
    } else {
      // Hybrid: try LLM first, fallback to rule-based
      try {
        return await this.extractConceptsWithLLM(document, maxConcepts);
      } catch (error) {
        logger.warn({ error, documentId: document._id }, 'LLM extraction failed, falling back to rule-based');
        return this.extractConceptsRuleBased(document, maxConcepts);
      }
    }
  }

  /**
   * Extract concepts using LLM
   */
  private async extractConceptsWithLLM(
    document: CanonicalDocument,
    maxConcepts: number
  ): Promise<ExtractedConcept[]> {
    if (!this.llmService) {
      throw new ServiceUnavailableError('LLM service not available', {
        reason: 'llm_service_not_configured',
        operation: 'extractConceptsWithLLM'
      });
    }

    const systemPrompt = `Je bent een expert in Nederlandse beleidsdocumenten.
Je taak is om concepten, regels, vereisten en beleidsclaims te extraheren uit een document.

Voor elk concept geef je:
- concept: De naam van het concept (bijv. "maximale bouwhoogte", "parkeernorm")
- normType: regulation | requirement | policy | procedure
- value: De waarde/claim (bijv. "15 meter", "verplicht", "verboden")
- context: De context waarin het concept voorkomt
- confidence: 0-1

Geef het resultaat als JSON array.`;

    const userPrompt = `Extraheer concepten uit dit document:

Titel: ${document.title}
${document.fullText.substring(0, 8000)}${document.fullText.length > 8000 ? '...' : ''}

Geef maximaal ${maxConcepts} concepten terug als JSON array.`;

    const response = await this.llmService.generate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Parse JSON response
    const content = response.content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : content;

    const parsed = JSON.parse(jsonText) as Array<{
      concept: string;
      normType: string;
      value?: string;
      context: string;
      confidence: number;
      chunkIds?: string[];
    }>;

    return parsed.map((item, index) => ({
      concept: item.concept,
      normType: item.normType as 'regulation' | 'requirement' | 'policy' | 'procedure',
      value: item.value,
      context: item.context,
      chunkIds: item.chunkIds || [`chunk-${index}`],
      confidence: item.confidence || 0.7,
    }));
  }

  /**
   * Extract concepts using rule-based approach
   */
  private async extractConceptsRuleBased(
    document: CanonicalDocument,
    maxConcepts: number
  ): Promise<ExtractedConcept[]> {
    const concepts: ExtractedConcept[] = [];
    const text = document.fullText || '';
    
    // Simple pattern-based extraction
    // Look for common patterns: "maximaal X meter", "minimaal X", "verplicht", "verboden", etc.
    const patterns = [
      {
        pattern: /(?:maximaal|max\.?|hoogstens)\s+(\d+(?:[.,]\d+)?)\s*(meter|m|km|cm|mm|ha|m²|m2)/gi,
        normType: 'requirement' as const,
        prefix: 'maximale',
      },
      {
        pattern: /(?:minimaal|min\.?|ten minste)\s+(\d+(?:[.,]\d+)?)\s*(meter|m|km|cm|mm|ha|m²|m2)/gi,
        normType: 'requirement' as const,
        prefix: 'minimale',
      },
      {
        pattern: /(?:verplicht|moet|dient)/gi,
        normType: 'regulation' as const,
        prefix: 'verplichting',
      },
      {
        pattern: /(?:verboden|niet toegestaan|niet mogelijk)/gi,
        normType: 'regulation' as const,
        prefix: 'verbod',
      },
    ];

    for (const { pattern, normType, prefix } of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches.slice(0, maxConcepts / patterns.length)) {
        const start = Math.max(0, match.index! - 100);
        const end = Math.min(text.length, match.index! + match[0].length + 100);
        const context = text.substring(start, end);

        concepts.push({
          concept: `${prefix} ${match[0]}`,
          normType,
          value: match[0],
          context,
          chunkIds: [`chunk-${concepts.length}`],
          confidence: 0.6, // Lower confidence for rule-based
        });
      }
    }

    return concepts.slice(0, maxConcepts);
  }

  /**
   * Match concepts between two documents
   */
  private async matchConcepts(
    conceptsA: ExtractedConcept[],
    conceptsB: ExtractedConcept[],
    strategy: 'semantic' | 'structured' | 'hybrid'
  ): Promise<ConceptMatch[]> {
    const matches: ConceptMatch[] = [];

    if (strategy === 'semantic' || strategy === 'hybrid') {
      // Use semantic similarity for matching
      await this.vectorService.init();
      
      for (const conceptA of conceptsA) {
        let bestMatch: ConceptMatch | null = null;
        let bestSimilarity = 0;

        for (const conceptB of conceptsB) {
          const similarity = await this.calculateSemanticSimilarity(conceptA, conceptB);
          
          if (similarity > bestSimilarity && similarity > 0.7) {
            bestSimilarity = similarity;
            bestMatch = {
              conceptA,
              conceptB,
              matchType: this.determineMatchType(conceptA, conceptB, similarity),
              similarity,
              confidence: similarity,
            };
          }
        }

        if (bestMatch) {
          matches.push(bestMatch);
        } else {
          // A-only concept
          matches.push({
            conceptA,
            matchType: 'a-only',
            similarity: 0,
            confidence: 0.5,
          });
        }
      }

      // Find B-only concepts
      const matchedB = new Set(matches.filter(m => m.conceptB).map(m => m.conceptB!.concept));
      for (const conceptB of conceptsB) {
        if (!matchedB.has(conceptB.concept)) {
          // For b-only, we need to create a match with conceptB but no conceptA equivalent
          // We'll use conceptB as conceptA for the structure, but mark it as b-only
          matches.push({
            conceptA: conceptB, // Store in conceptA field for structure consistency
            conceptB: undefined, // Explicitly undefined for b-only
            matchType: 'b-only',
            similarity: 0,
            confidence: 0.5,
          });
        }
      }
    } else {
      // Structured matching (exact or near-exact matches)
      for (const conceptA of conceptsA) {
        const exactMatch = conceptsB.find(c => c.concept.toLowerCase() === conceptA.concept.toLowerCase());
        if (exactMatch) {
          matches.push({
            conceptA,
            conceptB: exactMatch,
            matchType: 'identical',
            similarity: 1.0,
            confidence: 0.9,
          });
        } else {
          matches.push({
            conceptA,
            matchType: 'a-only',
            similarity: 0,
            confidence: 0.5,
          });
        }
      }

      // Find B-only concepts
      const matchedB = new Set(matches.filter(m => m.conceptB).map(m => m.conceptB!.concept));
      for (const conceptB of conceptsB) {
        if (!matchedB.has(conceptB.concept)) {
          matches.push({
            conceptA: conceptB, // Store in conceptA field for structure consistency
            conceptB: undefined, // Explicitly undefined for b-only
            matchType: 'b-only',
            similarity: 0,
            confidence: 0.5,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Calculate semantic similarity between two concepts
   */
  private async calculateSemanticSimilarity(
    conceptA: ExtractedConcept,
    conceptB: ExtractedConcept
  ): Promise<number> {
    try {
      const textA = `${conceptA.concept} ${conceptA.value || ''}`;
      const textB = `${conceptB.concept} ${conceptB.value || ''}`;

      const embeddingA = await this.vectorService.generateEmbedding(textA);
      const embeddingB = await this.vectorService.generateEmbedding(textB);

      return this.cosineSimilarity(embeddingA, embeddingB);
    } catch (error) {
      logger.warn({ error }, 'Semantic similarity calculation failed, returning 0');
      return 0;
    }
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Determine match type based on similarity and values
   */
  private determineMatchType(
    conceptA: ExtractedConcept,
    conceptB: ExtractedConcept,
    similarity: number
  ): ConceptMatch['matchType'] {
    if (similarity > 0.95) {
      return 'identical';
    } else if (similarity > 0.8) {
      // Check if values differ
      if (conceptA.value && conceptB.value && conceptA.value !== conceptB.value) {
        return 'changed';
      }
      return 'similar';
    } else if (similarity > 0.7) {
      // Check for conflicts
      if (conceptA.value && conceptB.value) {
        // Simple conflict detection (can be enhanced)
        if (
          (conceptA.value.includes('verplicht') && conceptB.value.includes('verboden')) ||
          (conceptA.value.includes('maximaal') && conceptB.value.includes('minimaal'))
        ) {
          return 'conflicting';
        }
      }
      return 'changed';
    }
    return 'a-only';
  }

  /**
   * Gather evidence for matched concepts
   */
  private async gatherEvidence(
    matches: ConceptMatch[],
    documentA: CanonicalDocument,
    documentB: CanonicalDocument
  ): Promise<MatchedConcept[]> {
    const matchedConcepts: MatchedConcept[] = [];

    for (const match of matches) {
      // For b-only concepts, conceptA actually contains the B concept
      const isBOnly = match.matchType === 'b-only';
      const evidenceA = isBOnly
        ? this.createEmptyEvidenceBundle(documentA._id.toString())
        : await this.buildEvidenceBundle(match.conceptA, documentA);
      const evidenceB = match.conceptB
        ? await this.buildEvidenceBundle(match.conceptB, documentB)
        : isBOnly
        ? await this.buildEvidenceBundle(match.conceptA, documentB) // For b-only, conceptA is the B concept
        : this.createEmptyEvidenceBundle(documentB._id.toString());

      // For b-only, use conceptB if available, otherwise conceptA (which contains B concept)
      const conceptName = isBOnly && !match.conceptB ? match.conceptA.concept : match.conceptA.concept;
      const normType = isBOnly && !match.conceptB ? match.conceptA.normType : match.conceptA.normType;

      matchedConcepts.push({
        concept: conceptName,
        normType,
        evidenceA,
        evidenceB,
        status: match.matchType === 'similar' ? 'identical' : match.matchType,
        confidence: match.confidence,
      });
    }

    return matchedConcepts;
  }

  /**
   * Build evidence bundle for a concept
   */
  private async buildEvidenceBundle(
    concept: ExtractedConcept,
    document: CanonicalDocument
  ): Promise<EvidenceBundle> {
    const chunks: ChunkEvidence[] = [];

    // Get chunks for this concept
    for (const chunkId of concept.chunkIds) {
      try {
        const chunk = await this.chunkService.findByChunkId(chunkId);
        if (chunk) {
          chunks.push({
            chunkId: chunk.chunkId,
            text: chunk.text,
            offsets: chunk.offsets,
            relevanceScore: concept.confidence,
          });
        }
      } catch (error) {
        logger.warn({ error, chunkId }, 'Failed to load chunk for evidence');
      }
    }

    // If no chunks found, use context as chunk
    if (chunks.length === 0 && concept.context) {
      chunks.push({
        chunkId: `context-${concept.concept}`,
        text: concept.context,
        offsets: { start: 0, end: concept.context.length },
        relevanceScore: concept.confidence,
      });
    }

    return {
      documentId: document._id.toString(),
      chunks,
      citations: chunks.map(chunk => ({
        chunkId: chunk.chunkId,
        text: chunk.text.substring(0, 200),
        offsets: chunk.offsets,
      })),
      confidence: concept.confidence,
    };
  }

  /**
   * Create empty evidence bundle
   */
  private createEmptyEvidenceBundle(documentId: string): EvidenceBundle {
    return {
      documentId,
      chunks: [],
      citations: [],
      confidence: 0,
    };
  }

  /**
   * Analyze deltas and create differences
   */
  private analyzeDeltas(matchedConcepts: MatchedConcept[]): DocumentDifference[] {
    const differences: DocumentDifference[] = [];

    for (const matched of matchedConcepts) {
      if (matched.status === 'identical') {
        continue; // Skip identical concepts
      }

      const delta: ConceptDelta | undefined = this.calculateDelta(matched);
      const impact = this.assessImpact(matched, delta);

      differences.push({
        category: matched.normType,
        concept: matched.concept,
        status: matched.status,
        evidenceA: matched.evidenceA,
        evidenceB: matched.evidenceB,
        delta,
        confidence: matched.confidence,
        impact,
      });
    }

    return differences;
  }

  /**
   * Calculate delta for a matched concept
   */
  private calculateDelta(matched: MatchedConcept): ConceptDelta | undefined {
    if (matched.status === 'identical' || matched.status === 'a-only' || matched.status === 'b-only') {
      return undefined;
    }

    // Extract values from evidence chunks
    const valueA = this.extractValueFromEvidence(matched.evidenceA);
    const valueB = this.extractValueFromEvidence(matched.evidenceB);

    if (!valueA && !valueB) {
      return undefined;
    }

    let type: ConceptDelta['type'];
    if (matched.status === 'conflicting') {
      type = 'conflicting';
    } else if (!valueA && valueB) {
      type = 'added';
    } else if (valueA && !valueB) {
      type = 'removed';
    } else {
      type = 'modified';
    }

    return {
      type,
      oldValue: valueA,
      newValue: valueB,
      changeDescription: this.generateChangeDescription(matched, type, valueA, valueB),
    };
  }

  /**
   * Extract value from evidence bundle
   */
  private extractValueFromEvidence(evidence: EvidenceBundle): string | undefined {
    // Try to extract value from chunks
    for (const chunk of evidence.chunks) {
      // Look for patterns like "15 meter", "verplicht", etc.
      const valueMatch = chunk.text.match(/(\d+(?:[.,]\d+)?\s*(?:meter|m|km|cm|mm|ha|m²|m2)|verplicht|verboden|toegestaan)/i);
      if (valueMatch) {
        return valueMatch[1];
      }
    }
    return undefined;
  }

  /**
   * Generate change description
   */
  private generateChangeDescription(
    matched: MatchedConcept,
    type: ConceptDelta['type'],
    oldValue?: string,
    newValue?: string
  ): string {
    switch (type) {
      case 'added':
        return `${matched.concept} is toegevoegd: ${newValue}`;
      case 'removed':
        return `${matched.concept} is verwijderd: ${oldValue}`;
      case 'modified':
        return `${matched.concept} is gewijzigd van ${oldValue} naar ${newValue}`;
      case 'conflicting':
        return `${matched.concept} heeft conflicterende waarden: ${oldValue} vs ${newValue}`;
      default:
        return `${matched.concept} is gewijzigd`;
    }
  }

  /**
   * Assess impact of a difference
   */
  private assessImpact(matched: MatchedConcept, delta?: ConceptDelta): string {
    if (matched.status === 'conflicting' || delta?.type === 'conflicting') {
      return 'Hoog: Conflicterende regels kunnen tot onduidelijkheid leiden';
    }
    if (delta?.type === 'removed') {
      return 'Middel: Regel is verwijderd, mogelijk minder restrictief';
    }
    if (delta?.type === 'added') {
      return 'Middel: Nieuwe regel toegevoegd, mogelijk meer restrictief';
    }
    if (delta?.type === 'modified') {
      return 'Variabel: Afhankelijk van de specifieke wijziging';
    }
    return 'Laag: Concept verschilt maar impact is beperkt';
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    matchedConcepts: MatchedConcept[],
    differences: DocumentDifference[]
  ): number {
    if (matchedConcepts.length === 0) {
      return 0;
    }

    const conceptConfidences = matchedConcepts.map(mc => mc.confidence);
    const differenceConfidences = differences.map(d => d.confidence);

    const avgConceptConfidence = conceptConfidences.reduce((a, b) => a + b, 0) / conceptConfidences.length;
    const avgDifferenceConfidence = differenceConfidences.length > 0
      ? differenceConfidences.reduce((a, b) => a + b, 0) / differenceConfidences.length
      : 1.0;

    // Weighted average (concepts 60%, differences 40%)
    return (avgConceptConfidence * 0.6) + (avgDifferenceConfidence * 0.4);
  }

  /**
   * Generate comparison summary
   */
  private generateSummary(
    matchedConcepts: MatchedConcept[],
    differences: DocumentDifference[]
  ): ComparisonSummary {
    const identical = matchedConcepts.filter(mc => mc.status === 'identical').length;
    const changed = matchedConcepts.filter(mc => mc.status === 'changed').length;
    const conflicting = matchedConcepts.filter(mc => mc.status === 'conflicting').length;
    const aOnly = matchedConcepts.filter(mc => mc.status === 'a-only').length;
    const bOnly = matchedConcepts.filter(mc => mc.status === 'b-only').length;

    const totalConcepts = matchedConcepts.length;
    const overallSimilarity = totalConcepts > 0 ? identical / totalConcepts : 0;

    // Get top 5 differences by confidence
    const keyDifferences = differences
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(d => d.concept);

    return {
      totalConcepts,
      identical,
      changed,
      conflicting,
      aOnly,
      bOnly,
      overallSimilarity,
      keyDifferences,
    };
  }

  /**
   * Get cache key for comparison
   */
  private getCacheKey(
    documentA: CanonicalDocument,
    documentB: CanonicalDocument,
    options: ComparisonOptions
  ): string {
    const docAId = documentA._id.toString();
    const docBId = documentB._id.toString();
    const strategy = options.strategy || 'hybrid';
    return `${docAId}-${docBId}-${strategy}`;
  }

  /**
   * Get comparison by ID
   */
  async getComparison(comparisonId: string): Promise<DocumentComparison | undefined> {
    // Try to get from database first
    const fromDb = await ComparisonModel.findById(comparisonId);
    if (fromDb) {
      return fromDb;
    }

    // Fallback to cache (for recent comparisons that might be in memory but not DB?)
    // Actually, if we always persist, cache is just an optimization.
    // But since we persist in compare(), DB should have it.

    // Search in cache values
    // Since cache key is composite, we need to iterate
    for (const comparison of this.cache.values()) {
      if (comparison.comparisonId === comparisonId) {
        return comparison;
      }
    }
    return undefined;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Generate explanation for a comparison
   */
  async generateExplanation(comparisonId: string): Promise<string | null> {
    const comparison = await this.getComparison(comparisonId);
    if (!comparison) return null;

    if (this.llmService) {
      return this.generateLLMExplanation(comparison);
    } else {
      return this.generateRuleBasedExplanation(comparison);
    }
  }

  /**
   * Generate explanation using LLM
   */
  private async generateLLMExplanation(comparison: DocumentComparison): Promise<string> {
    if (!this.llmService) {
      throw new ServiceUnavailableError('LLM service not available', {
        reason: 'llm_service_not_configured',
        operation: 'generateLLMExplanation'
      });
    }

    const systemPrompt = `Je bent een expert in het vergelijken van beleidsdocumenten.
Je taak is om een duidelijke samenvatting te geven van de verschillen tussen twee documenten.
Focus op inhoudelijke wijzigingen, conflicten en toevoegingen/verwijderingen.
Gebruik heldere taal en structuur.`;

    const diffText = comparison.differences
      .map(d => `- ${d.category}: ${d.concept} (${d.status}) - ${d.delta?.changeDescription || ''} (Impact: ${d.impact})`)
      .join('\n');

    const userPrompt = `Vergelijk deze twee documenten:
Document A: ${comparison.documentA.title}
Document B: ${comparison.documentB.title}

Samenvatting verschillen:
${diffText}

Geef een samenvattende uitleg van de belangrijkste wijzigingen en hun impact.`;

    const response = await this.llmService.generate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return response.content;
  }

  /**
   * Generate rule-based explanation
   */
  private generateRuleBasedExplanation(comparison: DocumentComparison): string {
    const { summary, differences, documentA, documentB } = comparison;

    const parts = [
      `Vergelijking tussen "${documentA.title}" en "${documentB.title}".`,
      `Er zijn in totaal ${summary.totalConcepts} concepten geanalyseerd.`,
      `Overeenkomst: ${Math.round(summary.overallSimilarity * 100)}%.`,
      '',
      'Belangrijkste verschillen:',
    ];

    if (differences.length === 0) {
      parts.push('- Geen significante verschillen gevonden.');
    } else {
      for (const diff of differences.slice(0, 10)) {
        parts.push(`- ${diff.delta?.changeDescription || diff.concept} (${diff.impact})`);
      }
    }

    if (summary.conflicting > 0) {
      parts.push('', `LET OP: Er zijn ${summary.conflicting} conflicterende regels gevonden.`);
    }

    return parts.join('\n');
  }
}
