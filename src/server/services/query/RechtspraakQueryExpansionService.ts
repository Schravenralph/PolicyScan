/**
 * Rechtspraak Query Expansion Service
 * 
 * Specialized query expansion service for Rechtspraak (jurisprudence) searches.
 * Uses ChatGPT to generate legal/jurisprudence-specific search terms that improve
 * recall and precision when searching court decisions and legal precedents.
 * 
 * @see docs/40-implementation-plans/rechtspraak-query-expansion-architecture.md
 */

import { logger } from '../../utils/logger.js';
import { QueryExpansionService } from './QueryExpansionService.js';
import { AIUsageMonitoringService } from '../monitoring/AIUsageMonitoringService.js';

export interface RechtspraakQueryContext {
  onderwerp: string;
  thema?: string;
  overheidsinstantie?: string;
  overheidslaag?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ExpansionOptions {
  strategy?: 'auto' | 'single' | 'multiple' | 'grouped';
  maxQueries?: number;
  maxTerms?: number;
  enableGeneralExpansion?: boolean;
  cacheEnabled?: boolean;
}

export interface RechtspraakExpandedQuery {
  originalQuery: string;
  expandedTerms: string[];
  queries: string[];
  strategy: 'single' | 'multiple' | 'grouped';
  expansionSources: string[];
  metadata: {
    expansionTime: number;
    termCount: number;
    queryCount: number;
    chatGptCost?: number;
    chatGptTokens?: number;
    cacheHit?: boolean;
  };
}

type QueryStrategy = 'single' | 'multiple' | 'grouped';

/**
 * In-memory cache for expanded queries
 */
interface CacheEntry {
  expanded: RechtspraakExpandedQuery;
  timestamp: number;
}

export class RechtspraakQueryExpansionService {
  private generalExpansionService?: QueryExpansionService;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly enabled: boolean;
  private readonly maxTerms: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;
  private readonly enableGeneralExpansion: boolean;
  private readonly model: string;
  private aiUsageMonitoring?: AIUsageMonitoringService;

  constructor(options?: {
    enableGeneralExpansion?: boolean;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    maxTerms?: number;
    model?: string;
  }) {
    // Load configuration from environment with defaults
    this.enabled = process.env.RECHTSPRAAK_QUERY_EXPANSION_ENABLED !== 'false'; // Default: true
    this.maxTerms = options?.maxTerms || parseInt(process.env.RECHTSPRAAK_MAX_TERMS || '10', 10);
    this.cacheEnabled = options?.cacheEnabled ?? (process.env.RECHTSPRAAK_EXPANSION_CACHE_ENABLED !== 'false');
    this.cacheTTL = options?.cacheTTL || parseInt(process.env.RECHTSPRAAK_EXPANSION_CACHE_TTL || '3600', 10) * 1000; // Convert to ms
    this.enableGeneralExpansion = options?.enableGeneralExpansion ?? (process.env.RECHTSPRAAK_ENABLE_GENERAL_EXPANSION !== 'false');
    this.model = options?.model || process.env.RECHTSPRAAK_EXPANSION_MODEL || 'gpt-4o-mini';

    // Initialize general expansion service if enabled
    if (this.enableGeneralExpansion) {
      try {
        this.generalExpansionService = new QueryExpansionService();
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize QueryExpansionService, will skip general expansion');
      }
    }

    // Initialize AI usage monitoring if available (lazy initialization to avoid breaking tests)
    // We'll create it on first use to avoid initialization errors in test environments
    this.aiUsageMonitoring = undefined;
  }

  /**
   * Expand query for Rechtspraak search
   * 
   * @param context - Query context (onderwerp, thema, overheidsinstantie, etc.)
   * @param options - Expansion options (strategy, maxQueries, etc.)
   * @returns Expanded query with terms and strategy
   */
  async expandForRechtspraak(
    context: RechtspraakQueryContext,
    options?: ExpansionOptions
  ): Promise<RechtspraakExpandedQuery> {
    const startTime = Date.now();

    // Check if expansion is enabled
    if (!this.enabled) {
      logger.debug('Rechtspraak query expansion is disabled, using original query');
      return this.createFallbackExpansion(context.onderwerp);
    }

    // Check cache
    const cacheKey = this.generateCacheKey(context);
    let cacheHit = false;
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        logger.debug({ cacheKey }, 'Using cached Rechtspraak query expansion');
        cacheHit = true;
        return {
          ...cached.expanded,
          metadata: {
            ...cached.expanded.metadata,
            cacheHit: true,
          },
        };
      }
    }

    try {
      // Step 1: Optional general expansion (synonyms, IMBOR, etc.)
      let generalExpandedTerms: string[] = [];
      let recognizedEntities: { locations: string[]; concepts: string[]; regulations: string[] } = {
        locations: [],
        concepts: [],
        regulations: [],
      };
      
      if (this.enableGeneralExpansion && this.generalExpansionService) {
        try {
          const generalExpanded = await this.generalExpansionService.expandQuery({
            onderwerp: context.onderwerp,
            thema: context.thema,
            overheidslaag: context.overheidslaag,
          });
          
          // Extract all terms, prioritizing high-relevance terms
          generalExpandedTerms = generalExpanded.allTerms || [];
          
          // Extract recognized entities if available (for better context in ChatGPT prompt)
          if (generalExpanded.recognizedEntities) {
            recognizedEntities = {
              locations: generalExpanded.recognizedEntities.locations || [],
              concepts: generalExpanded.recognizedEntities.concepts || [],
              regulations: generalExpanded.recognizedEntities.regulations || [],
            };
          }
          
          // Filter general terms to only include those relevant to legal context
          generalExpandedTerms = this.filterLegalRelevantTerms(generalExpandedTerms, context);
          
          logger.debug(
            { 
              termCount: generalExpandedTerms.length,
              entities: {
                locations: recognizedEntities.locations.length,
                concepts: recognizedEntities.concepts.length,
                regulations: recognizedEntities.regulations.length,
              },
            },
            'General expansion completed for Rechtspraak query'
          );
        } catch (error) {
          logger.warn({ error }, 'General expansion failed, continuing with legal expansion only');
        }
      }

      // Step 2: Legal-specific expansion via ChatGPT (with enhanced context)
      const legalExpansionStart = Date.now();
      const legalTermsResult = await this.generateLegalSearchTerms(
        context, 
        generalExpandedTerms,
        recognizedEntities
      );
      const legalExpansionTime = Date.now() - legalExpansionStart;
      const legalTerms = Array.isArray(legalTermsResult) ? legalTermsResult : [];
      const legalMetadata = (legalTermsResult as any).__metadata || {};

      // Combine terms with smart prioritization
      const allTerms = this.combineTermsWithPrioritization(
        context.onderwerp, 
        legalTerms, 
        generalExpandedTerms,
        recognizedEntities
      );

      // Step 3: Select query strategy
      const strategy = options?.strategy === 'auto' 
        ? this.selectQueryStrategy(allTerms)
        : (options?.strategy || 'single');

      // Step 4: Generate final queries based on strategy
      const queries = this.generateQueries(allTerms, strategy, options);

      const expansionTime = Date.now() - startTime;

      const expanded: RechtspraakExpandedQuery = {
        originalQuery: context.onderwerp,
        expandedTerms: allTerms,
        queries,
        strategy,
        expansionSources: [
          ...(legalTerms.length > 0 ? ['chatgpt'] : []),
          ...(generalExpandedTerms.length > 0 ? ['general'] : []),
        ],
        metadata: {
          expansionTime,
          termCount: allTerms.length,
          queryCount: queries.length,
          cacheHit: cacheHit,
          chatGptCost: legalMetadata.cost,
          chatGptTokens: legalMetadata.tokens,
        },
      };

      // Cache the result
      if (this.cacheEnabled) {
        this.cache.set(cacheKey, {
          expanded,
          timestamp: Date.now(),
        });
      }

      logger.info(
        {
          originalQuery: context.onderwerp,
          termCount: allTerms.length,
          queryCount: queries.length,
          strategy,
          expansionTime,
        },
        'Rechtspraak query expansion completed'
      );

      return expanded;
    } catch (error) {
      logger.error(
        { error, context },
        'Rechtspraak query expansion failed, using fallback'
      );
      return this.createFallbackExpansion(context.onderwerp);
    }
  }

  /**
   * Generate legal search terms using ChatGPT
   * 
   * @param context - Query context
   * @param generalTerms - Terms from general expansion (optional)
   * @param recognizedEntities - Recognized entities from QueryExpansionService (optional)
   * @returns Array of expanded search terms
   */
  private async generateLegalSearchTerms(
    context: RechtspraakQueryContext,
    _generalTerms: string[] = [],
    recognizedEntities?: { locations: string[]; concepts: string[]; regulations: string[] }
  ): Promise<string[]> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      logger.warn('OPENAI_API_KEY not set, skipping ChatGPT expansion for Rechtspraak');
      return [];
    }

    try {
      // Dynamic import to avoid requiring openai package if not using LLM
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      // Build prompt context with recognized entities
      const contextParts: string[] = [];
      if (context.thema) {
        contextParts.push(`Thema: ${context.thema}`);
      }
      if (context.overheidsinstantie) {
        contextParts.push(`Overheidsinstantie: ${context.overheidsinstantie}`);
      }
      if (context.overheidslaag) {
        contextParts.push(`Overheidslaag: ${context.overheidslaag}`);
      }
      
      // Add recognized entities for better context
      if (recognizedEntities) {
        if (recognizedEntities.locations.length > 0) {
          contextParts.push(`Locaties: ${recognizedEntities.locations.join(', ')}`);
        }
        if (recognizedEntities.regulations.length > 0) {
          contextParts.push(`Relevante wetgeving: ${recognizedEntities.regulations.join(', ')}`);
        }
        if (recognizedEntities.concepts.length > 0) {
          contextParts.push(`Gerelateerde concepten: ${recognizedEntities.concepts.slice(0, 5).join(', ')}`);
        }
      }
      
      const contextString = contextParts.length > 0 
        ? `\n${contextParts.join('\n')}`
        : '';

      // Build legal domain prompt
      const prompt = `Je bent een expert in Nederlandse jurisprudentie en rechtspraak.

Gegeven de zoekopdracht: "${context.onderwerp}"
${contextString || 'Thema: niet gespecificeerd\nOverheidsinstantie: niet gespecificeerd\nOverheidslaag: niet gespecificeerd'}

Genereer een lijst van juridische zoektermen, synoniemen en gerelateerde concepten die relevant zijn voor het zoeken in uitspraken en jurisprudentie.

Focus op:
- Juridische synoniemen en varianten
- Termen die vaak voorkomen in uitspraken over dit onderwerp
- Gerelateerde rechtsgebieden en concepten
- Formele juridische terminologie
- Afkortingen en acroniemen (bijv. Wro, Wabo, Omgevingswet)
- Gerelateerde wetsartikelen en regelingen

Geef alleen de termen terug, gescheiden door komma's, zonder uitleg of nummering.
Maximaal ${this.maxTerms} termen.

Voorbeelden:
- "klimaatadaptatie" → "klimaatadaptatie, wateroverlast, hitte-eilanden, waterbeheer, ruimtelijke adaptatie"
- "bestemmingsplan" → "bestemmingsplan, ruimtelijk plan, stedenbouwkundig plan, Wro, Omgevingswet"
- "vergunning" → "vergunning, omgevingsvergunning, Wabo, toestemming, machtiging"`;

      const chatGptStartTime = Date.now();
      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Je bent een assistent die helpt bij het uitbreiden van zoekopdrachten voor Nederlandse jurisprudentie en rechtspraak.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const chatGptDuration = Date.now() - chatGptStartTime;

      // Extract token usage for cost tracking
      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const totalTokens = response.usage?.total_tokens || 0;

      // Track AI usage for cost monitoring (lazy initialization)
      let estimatedCost = 0;
      estimatedCost = this.estimateCost(promptTokens, completionTokens);
      
      // Try to initialize and record AI usage (non-blocking)
      if (!this.aiUsageMonitoring) {
        try {
          this.aiUsageMonitoring = new AIUsageMonitoringService();
        } catch (error) {
          // Silently fail - monitoring is optional
          this.aiUsageMonitoring = undefined;
        }
      }
      
      if (this.aiUsageMonitoring) {
        // Record asynchronously to avoid blocking
        this.aiUsageMonitoring.recordAPICall({
          provider: 'openai',
          model: this.model,
          operation: 'rechtspraak_query_expansion',
          promptTokens,
          completionTokens,
          totalTokens,
          cacheHit: false,
          duration: chatGptDuration,
          success: true,
          metadata: {
            onderwerp: context.onderwerp,
            thema: context.thema,
            overheidsinstantie: context.overheidsinstantie,
          },
        }).catch((error) => {
          logger.debug({ error }, 'Failed to record AI usage metric');
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        logger.warn('ChatGPT returned empty response for Rechtspraak query expansion');
        return [];
      }

      // Parse the response - extract terms separated by commas
      const legalTerms = content
        .split(',')
        .map(term => term.trim())
        .filter(term => term.length > 0 && term.length < 100) // Filter out invalid terms
        .slice(0, this.maxTerms);

      logger.debug(
        { 
          termCount: legalTerms.length, 
          terms: legalTerms.slice(0, 5),
          tokens: totalTokens,
          duration: chatGptDuration,
          cost: estimatedCost,
        },
        'ChatGPT generated legal search terms for Rechtspraak'
      );

      // Store metadata for return (attach to array for retrieval)
      const termsWithMetadata = legalTerms as string[] & { __metadata?: { tokens: number; cost: number; duration: number } };
      termsWithMetadata.__metadata = {
        tokens: totalTokens,
        cost: estimatedCost,
        duration: chatGptDuration,
      };

      return termsWithMetadata;
    } catch (error) {
      logger.error({ error, context }, 'Error generating legal search terms via ChatGPT');
      return [];
    }
  }

  /**
   * Select query strategy based on expanded terms
   * 
   * @param expandedTerms - All expanded terms
   * @returns Query strategy
   */
  private selectQueryStrategy(expandedTerms: string[]): QueryStrategy {
    if (expandedTerms.length <= 3) {
      return 'single';
    } else if (expandedTerms.length <= 10) {
      return 'grouped';
    } else {
      // For many terms, use multiple strategy to improve recall
      return 'multiple';
    }
  }

  /**
   * Generate queries based on strategy
   * 
   * @param terms - All expanded terms
   * @param strategy - Query strategy
   * @param options - Expansion options
   * @returns Array of query strings
   */
  private generateQueries(
    terms: string[],
    strategy: QueryStrategy,
    options?: ExpansionOptions
  ): string[] {
    if (terms.length === 0) {
      return ['algemeen'];
    }

    const maxQueries = options?.maxQueries || 3;

    switch (strategy) {
      case 'single':
        // Combine all terms into one query (space-separated, Rechtspraak API handles OR logic)
        return [terms.join(' ')];

      case 'grouped': {
        // Group related terms into queries
        // Strategy: Original term + 2-3 related terms per query
        const queries: string[] = [];
        const originalTerm = terms[0]; // First term is always the original
        
        // Create groups of 2-3 terms each (including original in first group)
        for (let i = 0; i < terms.length && queries.length < maxQueries; i += 2) {
          const group = terms.slice(i, Math.min(i + 3, terms.length));
          // Always include original term in first query
          if (i === 0 || group.includes(originalTerm)) {
            queries.push(group.join(' '));
          } else {
            // For subsequent queries, combine with original for context
            queries.push([originalTerm, ...group].join(' '));
          }
        }
        
        return queries.length > 0 ? queries : [terms.join(' ')];
      }

      case 'multiple': {
        // Create separate queries for top N terms
        // Original term is always first, then top expanded terms
        const queries: string[] = [];
        const originalTerm = terms[0];
        
        // Always include original term as first query
        queries.push(originalTerm);
        
        // Add top expanded terms as separate queries (excluding original)
        const expandedTerms = terms.slice(1).slice(0, maxQueries - 1);
        for (const term of expandedTerms) {
          queries.push(term);
        }
        
        return queries;
      }

      default:
        return [terms.join(' ')];
    }
  }

  /**
   * Filter general terms to only include those relevant to legal/jurisprudence context
   * 
   * @param generalTerms - Terms from general expansion
   * @param context - Query context
   * @returns Filtered terms relevant to legal context
   */
  private filterLegalRelevantTerms(
    generalTerms: string[],
    context: RechtspraakQueryContext
  ): string[] {
    // Legal/jurisprudence keywords that indicate relevance
    const legalKeywords = [
      'wet', 'regeling', 'besluit', 'verordening', 'beleid', 'plan',
      'vergunning', 'toestemming', 'machtiging', 'ontheffing',
      'bestemmingsplan', 'ruimtelijk', 'omgevingswet', 'wro', 'wabo',
      'jurisprudentie', 'uitspraak', 'vonnis', 'arrest', 'rechtspraak',
      'rechter', 'rechtbank', 'hof', 'raad', 'commissie',
    ];

    return generalTerms.filter(term => {
      const lowerTerm = term.toLowerCase();
      
      // Include if term contains legal keywords
      if (legalKeywords.some(keyword => lowerTerm.includes(keyword))) {
        return true;
      }
      
      // Include if term is short (likely to be a legal concept)
      if (term.length <= 20 && term.split(' ').length <= 3) {
        return true;
      }
      
      // Exclude very long terms (likely not legal concepts)
      if (term.length > 50) {
        return false;
      }
      
      // Default: include if not clearly irrelevant
      return true;
    });
  }

  /**
   * Combine terms from different sources with smart prioritization
   * 
   * @param original - Original query term
   * @param legalTerms - Terms from ChatGPT legal expansion
   * @param generalTerms - Terms from general expansion
   * @param recognizedEntities - Recognized entities for prioritization
   * @returns Combined and deduplicated terms with smart ordering
   */
  private combineTermsWithPrioritization(
    original: string,
    legalTerms: string[],
    generalTerms: string[],
    recognizedEntities?: { locations: string[]; concepts: string[]; regulations: string[] }
  ): string[] {
    const termMap = new Map<string, number>(); // Map<term, priorityScore>

    // Priority 1: Original term (highest priority: 1.0)
    if (original && original.trim().length > 0) {
      termMap.set(original.trim().toLowerCase(), 1.0);
    }

    // Priority 2: Recognized regulations (high relevance: 0.95)
    if (recognizedEntities?.regulations) {
      recognizedEntities.regulations.forEach(reg => {
        const normalized = reg.trim().toLowerCase();
        if (normalized && normalized !== original.toLowerCase()) {
          termMap.set(normalized, Math.max(termMap.get(normalized) || 0, 0.95));
        }
      });
    }

    // Priority 3: Legal terms from ChatGPT (high relevance: 0.9)
    legalTerms.forEach((term, index) => {
      const normalized = term.trim().toLowerCase();
      if (normalized && normalized !== original.toLowerCase()) {
        // Slight priority boost for earlier terms (ChatGPT typically orders by relevance)
        const priority = 0.9 - (index * 0.01);
        termMap.set(normalized, Math.max(termMap.get(normalized) || 0, priority));
      }
    });

    // Priority 4: Recognized concepts (medium-high relevance: 0.85)
    if (recognizedEntities?.concepts) {
      recognizedEntities.concepts.forEach(concept => {
        const normalized = concept.trim().toLowerCase();
        if (normalized && !termMap.has(normalized)) {
          termMap.set(normalized, 0.85);
        }
      });
    }

    // Priority 5: General terms (lower relevance: 0.7, only if not already included)
    generalTerms.forEach(term => {
      const normalized = term.trim().toLowerCase();
      if (normalized && !termMap.has(normalized)) {
        termMap.set(normalized, 0.7);
      }
    });

    // Sort by priority score (descending) and return terms
    return Array.from(termMap.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by priority (descending)
      .map(([term]) => term);
  }

  /**
   * Estimate cost for ChatGPT API call
   * 
   * @param promptTokens - Number of prompt tokens
   * @param completionTokens - Number of completion tokens
   * @returns Estimated cost in USD
   */
  private estimateCost(promptTokens: number, completionTokens: number): number {
    // Pricing per 1K tokens (matching AIUsageMonitoringService)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    };

    const modelPricing = pricing[this.model] || pricing['gpt-4o-mini'];
    return (promptTokens / 1000 * modelPricing.input) + (completionTokens / 1000 * modelPricing.output);
  }

  /**
   * Generate cache key from context
   * 
   * @param context - Query context
   * @returns Cache key string
   */
  private generateCacheKey(context: RechtspraakQueryContext): string {
    const parts = [
      context.onderwerp || '',
      context.thema || '',
      context.overheidsinstantie || '',
      context.overheidslaag || '',
    ];
    return `rechtspraak:expansion:${parts.join('|')}`;
  }

  /**
   * Create fallback expansion (original query only)
   * 
   * @param originalQuery - Original query string
   * @returns Fallback expanded query
   */
  private createFallbackExpansion(originalQuery: string): RechtspraakExpandedQuery {
    return {
      originalQuery,
      expandedTerms: [originalQuery],
      queries: [originalQuery || 'algemeen'],
      strategy: 'single',
      expansionSources: ['fallback'],
      metadata: {
        expansionTime: 0,
        termCount: 1,
        queryCount: 1,
      },
    };
  }

  /**
   * Clear cache (useful for testing or manual invalidation)
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Rechtspraak query expansion cache cleared');
  }

  /**
   * Get cache statistics (useful for monitoring)
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

