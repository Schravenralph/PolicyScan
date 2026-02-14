/**
 * Query Decomposition Service
 * 
 * Analyzes queries to determine intent and decomposes comparison queries into
 * structured sub-questions and evidence sets for improved retrieval.
 * 
 * This service is part of WI-RETRIEVAL-001: Metadata Constraints & Query Planning.
 * 
 * @see docs/21-issues/WI-RETRIEVAL-001-metadata-constraints-query-planning.md
 */

import { LLMService } from '../llm/LLMService.js';
import { logger } from '../../utils/logger.js';
import type { SearchFilters } from '../../search/SearchService.js';

/**
 * Query intent types
 */
export type QueryIntent = 'direct' | 'comparison' | 'temporal' | 'spatial' | 'factual' | 'exploratory';

/**
 * Sub-question for decomposed query
 */
export interface SubQuestion {
  question: string;
  intent: QueryIntent;
  requiredFields?: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * Evidence set for retrieval
 */
export interface EvidenceSet {
  name: string;
  description: string;
  retrievalStrategy: 'keyword' | 'semantic' | 'hybrid';
  filters?: SearchFilters;
  subQuestions: string[]; // Related sub-questions
}

/**
 * Decomposed query result
 */
export interface DecomposedQuery {
  originalQuery: string;
  queryType: QueryIntent;
  subQuestions: SubQuestion[];
  evidenceSets: EvidenceSet[];
  confidence: number; // 0-1, confidence in decomposition
}

/**
 * Query Decomposition Service
 */
export class QueryDecompositionService {
  private llmService: LLMService | null = null;
  private cacheEnabled: boolean;
  private cache: Map<string, DecomposedQuery> = new Map();
  private cacheTTL: number;

  constructor(config?: {
    llmEnabled?: boolean;
    cacheEnabled?: boolean;
    cacheTTL?: number; // in milliseconds
  }) {
    const llmEnabled = config?.llmEnabled ?? process.env.QUERY_DECOMPOSITION_ENABLED === 'true';
    this.cacheEnabled = config?.cacheEnabled ?? true;
    this.cacheTTL = config?.cacheTTL ?? 3600000; // Default: 1 hour

    if (llmEnabled) {
      try {
        this.llmService = new LLMService({
          enabled: true,
          provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic' | 'local') || 'openai',
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          temperature: 0.3, // Lower temperature for more consistent decomposition
          maxTokens: 2000,
          cacheEnabled: true,
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize LLM service for query decomposition, using rule-based fallback');
        this.llmService = null;
      }
    }
  }

  /**
   * Decompose a query into structured sub-questions and evidence sets
   * 
   * @param query - Original user query
   * @returns Decomposed query with sub-questions and evidence sets
   */
  async decompose(query: string): Promise<DecomposedQuery> {
    // Check cache first
    if (this.cacheEnabled) {
      const cached = this.cache.get(query);
      if (cached) {
        logger.debug({ query }, 'Returning cached query decomposition');
        return cached;
      }
    }

    // Detect query type
    const queryType = this.detectQueryType(query);

    let decomposed: DecomposedQuery;

    if (queryType === 'comparison' && this.llmService) {
      // Use LLM for comparison queries
      decomposed = await this.decomposeWithLLM(query, queryType);
    } else {
      // Use rule-based decomposition for other query types
      decomposed = this.decomposeWithRules(query, queryType);
    }

    // Cache result
    if (this.cacheEnabled) {
      this.cache.set(query, decomposed);
      // Simple cache eviction (in production, use TTL-based cache)
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
    }

    return decomposed;
  }

  /**
   * Detect query type from query text
   */
  private detectQueryType(query: string): QueryIntent {
    const queryLower = query.toLowerCase();

    // Comparison indicators
    const comparisonKeywords = [
      'versus', 'vs', 'verschil', 'verschillen', 'vergelijken', 'vergelijking',
      'verschillend', 'anders', 'andere', 'tussen', 'versus', 'tegenover',
      'wat is het verschil', 'hoe verschillen', 'vergelijk', 'compare'
    ];
    if (comparisonKeywords.some(keyword => queryLower.includes(keyword))) {
      return 'comparison';
    }

    // Temporal indicators
    const temporalKeywords = [
      'wanneer', 'wann', 'datum', 'jaar', 'periode', 'tijd', 'geschiedenis',
      'eerder', 'later', 'nieuw', 'oud', 'recent', 'when', 'date', 'time'
    ];
    if (temporalKeywords.some(keyword => queryLower.includes(keyword))) {
      return 'temporal';
    }

    // Spatial indicators
    const spatialKeywords = [
      'waar', 'locatie', 'gebied', 'regio', 'gemeente', 'provincie',
      'adres', 'coördinaten', 'where', 'location', 'area', 'region'
    ];
    if (spatialKeywords.some(keyword => queryLower.includes(keyword))) {
      return 'spatial';
    }

    // Factual indicators (specific questions)
    const factualKeywords = [
      'wat is', 'wat zijn', 'hoeveel', 'welke', 'wie', 'what is', 'what are',
      'how many', 'which', 'who'
    ];
    if (factualKeywords.some(keyword => queryLower.includes(keyword))) {
      return 'factual';
    }

    // Default to direct/exploratory
    return 'direct';
  }

  /**
   * Decompose comparison query using LLM
   */
  private async decomposeWithLLM(
    query: string,
    queryType: QueryIntent
  ): Promise<DecomposedQuery> {
    if (!this.llmService) {
      return this.decomposeWithRules(query, queryType);
    }

    try {
      const systemPrompt = `Je bent een expert in het analyseren van Nederlandse beleidsvragen.
Je taak is om vergelijkingsvragen te decomposeren in gestructureerde sub-vragen en evidence sets.

Voor een vergelijkingsvraag moet je:
1. Identificeer de entiteiten/concepten die vergeleken worden
2. Genereer sub-vragen voor elk aspect dat vergeleken moet worden
3. Definieer evidence sets met retrieval strategieën

Geef je antwoord als JSON in het volgende formaat:
{
  "subQuestions": [
    {
      "question": "Specifieke sub-vraag",
      "intent": "comparison",
      "requiredFields": ["veld1", "veld2"],
      "priority": "high"
    }
  ],
  "evidenceSets": [
    {
      "name": "Naam van evidence set",
      "description": "Beschrijving",
      "retrievalStrategy": "hybrid",
      "subQuestions": ["sub-vraag 1", "sub-vraag 2"]
    }
  ],
  "confidence": 0.85
}`;

      const userPrompt = `Decomposeer de volgende vergelijkingsvraag:

"${query}"

Geef gestructureerde sub-vragen en evidence sets voor effectieve retrieval.`;

      const response = await this.llmService.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // Parse JSON response
      const content = response.content.trim();
      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonText) as {
        subQuestions: Array<{
          question: string;
          intent: string;
          requiredFields?: string[];
          priority: string;
        }>;
        evidenceSets: Array<{
          name: string;
          description: string;
          retrievalStrategy: string;
          subQuestions?: string[];
        }>;
        confidence: number;
      };

      return {
        originalQuery: query,
        queryType,
        subQuestions: parsed.subQuestions.map(sq => ({
          question: sq.question,
          intent: sq.intent as QueryIntent,
          requiredFields: sq.requiredFields,
          priority: sq.priority as 'high' | 'medium' | 'low',
        })),
        evidenceSets: parsed.evidenceSets.map(es => ({
          name: es.name,
          description: es.description,
          retrievalStrategy: es.retrievalStrategy as 'keyword' | 'semantic' | 'hybrid',
          subQuestions: es.subQuestions || [],
        })),
        confidence: parsed.confidence || 0.7,
      };
    } catch (error) {
      logger.warn(
        { error, query },
        'LLM decomposition failed, falling back to rule-based decomposition'
      );
      return this.decomposeWithRules(query, queryType);
    }
  }

  /**
   * Decompose query using rule-based approach
   */
  private decomposeWithRules(
    query: string,
    queryType: QueryIntent
  ): DecomposedQuery {
    const subQuestions: SubQuestion[] = [];
    const evidenceSets: EvidenceSet[] = [];

    if (queryType === 'comparison') {
      // Simple rule-based comparison decomposition
      // Extract entities/concepts being compared
      const entities = this.extractComparisonEntities(query);
      
      if (entities.length >= 2) {
        // Create sub-questions for each entity
        entities.forEach((entity, index) => {
          subQuestions.push({
            question: `Wat zijn de kenmerken van ${entity}?`,
            intent: 'factual',
            priority: 'high',
          });
        });

        // Create comparison sub-questions
        subQuestions.push({
          question: `Wat zijn de verschillen tussen ${entities.join(' en ')}?`,
          intent: 'comparison',
          priority: 'high',
        });

        // Create evidence sets
        entities.forEach((entity, index) => {
          evidenceSets.push({
            name: `Evidence voor ${entity}`,
            description: `Documenten gerelateerd aan ${entity}`,
            retrievalStrategy: 'hybrid',
            subQuestions: [subQuestions[index].question],
          });
        });

        evidenceSets.push({
          name: 'Vergelijkings evidence',
          description: 'Documenten die beide entiteiten vergelijken',
          retrievalStrategy: 'hybrid',
          subQuestions: [subQuestions[subQuestions.length - 1].question],
        });
      }
    } else {
      // For non-comparison queries, create a single evidence set
      subQuestions.push({
        question: query,
        intent: queryType,
        priority: 'high',
      });

      evidenceSets.push({
        name: 'Primary evidence',
        description: `Evidence voor: ${query}`,
        retrievalStrategy: 'hybrid',
        subQuestions: [query],
      });
    }

    return {
      originalQuery: query,
      queryType,
      subQuestions,
      evidenceSets,
      confidence: queryType === 'comparison' ? 0.6 : 0.8, // Lower confidence for rule-based
    };
  }

  /**
   * Extract entities/concepts from comparison query
   */
  private extractComparisonEntities(query: string): string[] {
    const entities: string[] = [];
    const queryLower = query.toLowerCase();

    // Common comparison patterns
    const patterns = [
      /verschil tussen (.+?) en (.+?)(?:[.?]|$)/i,
      /(.+?) vs (.+?)(?:[.?]|$)/i,
      /(.+?) versus (.+?)(?:[.?]|$)/i,
      /vergelijk (.+?) met (.+?)(?:[.?]|$)/i,
      /(.+?) en (.+?)(?: verschillen|verschil)/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match.length >= 3) {
        entities.push(match[1].trim(), match[2].trim());
        break;
      }
    }

    // Fallback: try to extract entities using keywords
    if (entities.length === 0) {
      const keywords = ['versus', 'vs', 'en', 'met', 'tussen'];
      const parts = query.split(new RegExp(`(${keywords.join('|')})`, 'i'));
      if (parts.length >= 3) {
        entities.push(parts[0].trim(), parts[parts.length - 1].trim());
      }
    }

    // If still no entities, return the whole query as a single entity
    if (entities.length === 0) {
      entities.push(query);
    }

    return entities;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 100,
    };
  }
}

