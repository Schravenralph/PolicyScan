/**
 * Query Expansion Service
 * 
 * Implements Issue #3 from docs/improvements: Query Expansion and Refinement Techniques
 * 
 * This service enhances queries by:
 * 1. Adding synonyms from domain-specific dictionaries (Dutch, planning, housing, policy)
 * 2. Integrating with IMBOR service for ontology-based expansion
 * 3. Generating multi-query strategies for different document types
 * 4. Optional LLM-based expansion (can be disabled via config)
 * 
 * The service is triggered automatically in the workflow's `enhance_with_imbor` action
 * and provides expanded query terms that improve recall without sacrificing precision.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ImborService } from '../external/imborService.js';
import { DictionaryUpdateService } from '../knowledgeBase/DictionaryUpdateService.js';
import { DictionaryUpdate } from '../learning/LearningService.js';
import { DomainClassificationService, Domain } from '../extraction/DomainClassificationService.js';
import { RuleBasedEntityExtractor } from '../parsing/extractors/RuleBasedEntityExtractor.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type { NormalizedDocument } from '../shared/types/DocumentModels.js';
import { FeatureFlag } from '../../models/FeatureFlag.js';
import { getKnowledgeGraphService, KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { GraphDBKnowledgeGraphService } from '../knowledge-graph/core/GraphDBKnowledgeGraphService.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { logger } from '../../utils/logger.js';
import { ServiceUnavailableError } from '../../types/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface QueryContext {
  onderwerp: string;
  thema?: string;
  overheidslaag?: string;
  domain?: 'planning' | 'housing' | 'policy' | 'general';
}

export interface RecognizedEntities {
  locations: string[]; // Spatial units, place names
  concepts: string[]; // Key concepts, topics
  regulations: string[]; // Regulation-related terms
  landUses: string[]; // Land use types, bestemmingen
}

export interface ExpandedQuery {
  originalTerms: string[];
  expandedTerms: string[];
  allTerms: string[]; // Combined original + expanded
  context: string;
  queryVariations: QueryVariation[];
  expansionSources: string[]; // Track which expansion methods contributed
  recognizedEntities?: RecognizedEntities; // Extracted entities from query
  detectedDomain?: Domain; // Detected domain using DomainClassificationService
  domainConfidence?: number; // Confidence score for domain detection
}

export interface QueryVariation {
  type: 'policy' | 'news' | 'official' | 'general';
  query: string;
  terms: string[];
}

/**
 * Query Expansion Service
 * 
 * HOW IT WORKS:
 * 1. Loads synonym dictionaries from data/synonyms/*.json
 * 2. Integrates with IMBOR service for ontology-based terms
 * 3. Applies domain-specific expansion based on query context
 * 4. Generates multi-query variations for different document types
 * 5. Combines all expansions into a comprehensive query
 * 
 * TRIGGERING:
 * - Automatically called in workflow action 'enhance_with_imbor'
 * - Can be called manually via expandQuery() method
 * 
 * TESTING:
 * - Unit tests: src/server/services/__tests__/QueryExpansionService.test.ts
 * - Integration: tests/e2e/query-expansion.spec.ts
 * - Manual test: Call expandQuery() with test queries and verify expanded terms
 */
export class QueryExpansionService {
  private synonymDictionaries: Map<string, Map<string, string[]>> = new Map();
  private imborService: ImborService;
  private dictionaryUpdateService: DictionaryUpdateService;
  private domainClassificationService: DomainClassificationService;
  private entityExtractor: RuleBasedEntityExtractor;
  private isInitialized = false;
  private initializationPromise: Promise<void>;
  private kgService: KnowledgeGraphService | GraphDBKnowledgeGraphService | null = null;

  // Configuration from environment
  private readonly enabled: boolean;
  private readonly maxTerms: number;
  private readonly multiQueryEnabled: boolean;
  private readonly llmExpansionEnabled: boolean;

  constructor(imborService?: ImborService) {
    this.imborService = imborService || new ImborService();
    this.dictionaryUpdateService = new DictionaryUpdateService();
    this.domainClassificationService = new DomainClassificationService();
    this.entityExtractor = new RuleBasedEntityExtractor();
    
    // Load configuration from environment
    this.enabled = process.env.QUERY_EXPANSION_ENABLED !== 'false'; // Default: true
    this.maxTerms = parseInt(process.env.QUERY_EXPANSION_MAX_TERMS || '10', 10);
    this.multiQueryEnabled = process.env.MULTI_QUERY_ENABLED !== 'false'; // Default: true
    this.llmExpansionEnabled = process.env.LLM_EXPANSION_ENABLED === 'true'; // Default: false
    
    // Load synonym dictionaries asynchronously
    this.initializationPromise = this.loadSynonymDictionaries().catch(err => {
      console.error('❌ Failed to load synonym dictionaries:', err);
      console.log('⚠️  Query expansion will work with IMBOR only');
    });
  }

  /**
   * Load synonym dictionaries from JSON files
   * 
   * Dictionaries are loaded from:
   * - data/synonyms/dutch-synonyms.json (general Dutch synonyms)
   * - data/synonyms/planning-terms.json (spatial planning terms)
   * - data/synonyms/housing-terms.json (housing-related terms)
   * - data/synonyms/policy-terms.json (policy/government terms)
   */
  private async loadSynonymDictionaries(): Promise<void> {
    try {
      // Use process.cwd() for consistent path resolution in both local and Docker environments
      const synonymsPath = join(process.cwd(), 'data', 'synonyms');
      const dictionaries = [
        { name: 'dutch', file: 'dutch-synonyms.json' },
        { name: 'planning', file: 'planning-terms.json' },
        { name: 'housing', file: 'housing-terms.json' },
        { name: 'policy', file: 'policy-terms.json' }
      ];

      for (const dict of dictionaries) {
        try {
          const filePath = join(synonymsPath, dict.file);
          const content = await readFile(filePath, 'utf-8');
          const synonyms = JSON.parse(content);
          
          const synonymMap = new Map<string, string[]>();
          for (const [term, synonymsList] of Object.entries(synonyms)) {
            synonymMap.set(term.toLowerCase(), synonymsList as string[]);
          }
          
          this.synonymDictionaries.set(dict.name, synonymMap);
          console.log(`✅ Loaded ${synonymMap.size} synonym entries from ${dict.file}`);
        } catch (err) {
          console.warn(`⚠️  Could not load ${dict.file}:`, err instanceof Error ? err.message : String(err));
        }
      }

      this.isInitialized = true;
      console.log(`✅ Query Expansion Service initialized with ${this.synonymDictionaries.size} dictionaries`);
    } catch (error) {
      console.error('Error loading synonym dictionaries:', error);
      throw error;
    }
  }

  /**
   * Get or initialize knowledge graph service (lazy initialization)
   */
  private async getKGService(): Promise<KnowledgeGraphService | GraphDBKnowledgeGraphService | null> {
    if (!FeatureFlag.isRetrievalEnabled()) {
      return null;
    }

    if (this.kgService) {
      return this.kgService;
    }

    try {
      const knowledgeBackend = (process.env.KG_BACKEND || 'graphdb').toLowerCase();
      if (knowledgeBackend === 'graphdb') {
        this.kgService = new GraphDBKnowledgeGraphService();
      } else {
        // GraphDB is required for knowledge graph
        throw new ServiceUnavailableError('GraphDB is required for Knowledge Graph. Set KG_BACKEND=graphdb.', {
          reason: 'graphdb_backend_not_configured',
          operation: 'constructor',
          kgBackend: process.env.KG_BACKEND
        });
      }

      // Initialize if needed
      if ('initialize' in this.kgService && typeof this.kgService.initialize === 'function') {
        await this.kgService.initialize();
      }

      logger.debug('[QueryExpansionService] Knowledge graph service initialized for query expansion');
      return this.kgService;
    } catch (error) {
      logger.warn({ error }, '[QueryExpansionService] Failed to initialize KG service for expansion');
      return null;
    }
  }

  /**
   * Expand query using Knowledge Graph entities
   * 
   * Looks up entities in the KG that match query terms and adds:
   * - Entity names
   * - Entity types
   * - Related entity names (via relationships)
   */
  private async expandWithKnowledgeGraph(
    context: QueryContext,
    originalTerms: string[],
    domain: Domain,
    recognizedEntities: RecognizedEntities
  ): Promise<Array<{ term: string; score: number }>> {
    const kgService = await this.getKGService();
    if (!kgService) {
      return [];
    }

    const kgTerms: Array<{ term: string; score: number }> = [];
    const seenTerms = new Set<string>();

    try {
      // Search for entities matching query terms
      const searchTerms = originalTerms.filter(t => t.length > 3); // Filter short terms

      if (searchTerms.length === 0) {
        return [];
      }

      // Search for entities in KG
      const matchingEntities = await kgService.searchEntities(searchTerms);

      // Add entity names to expansion terms
      for (const entity of matchingEntities) {
        const entityName = entity.name.toLowerCase();
        if (!seenTerms.has(entityName) && entityName.length > 2) {
          kgTerms.push({ term: entity.name, score: 0.8 });
          seenTerms.add(entityName);
        }

        // Add entity type if relevant
        if (entity.type && !seenTerms.has(entity.type.toLowerCase())) {
          kgTerms.push({ term: entity.type, score: 0.6 });
          seenTerms.add(entity.type.toLowerCase());
        }

        // Get related entities via relationships (limit to avoid too many terms)
        try {
          const neighbors = await kgService.getNeighbors(entity.id);
          const relatedEntities = neighbors.slice(0, 3); // Limit to 3 related entities

          for (const related of relatedEntities) {
            const relatedName = related.name.toLowerCase();
            if (!seenTerms.has(relatedName) && relatedName.length > 2) {
              kgTerms.push({ term: related.name, score: 0.7 });
              seenTerms.add(relatedName);
            }
          }
        } catch (err) {
          // Skip relationship expansion if it fails
          logger.debug({ error: err, entityId: entity.id }, '[QueryExpansionService] Failed to get related entities');
        }
      }

      logger.debug({
        query: context.onderwerp,
        entitiesFound: matchingEntities.length,
        termsAdded: kgTerms.length
      }, '[QueryExpansionService] KG-based expansion completed');

      return kgTerms;
    } catch (error) {
      logger.warn({ error }, '[QueryExpansionService] KG expansion failed');
      return [];
    }
  }

  /**
   * Expand a query with synonyms, IMBOR terms, and multi-query variations
   * 
   * This is the main entry point for query expansion.
   * Now includes enhanced context-aware expansion using:
   * - Entity recognition and improved domain classification
   * - Context-aware synonym filtering based on domain and entities
   * - Entity relationship expansion (e.g., location-based planning terms)
   * - Better utilization of query context (thema, overheidslaag)
   * - Multi-word phrase handling
   * - Context-aware IMBOR result filtering
   * - Relevance-based term weighting
   * 
   * @param context Query context (onderwerp, thema, domain, etc.)
   * @returns Expanded query with all terms and variations
   */
  async expandQuery(context: QueryContext): Promise<ExpandedQuery> {
    if (!this.enabled) {
      return await this.createBasicExpansion(context);
    }

    // Wait for initialization
    if (!this.isInitialized) {
      await this.initializationPromise;
    }

    // Build comprehensive query text including all context
    const queryText = this.buildQueryText(context);
    const originalTerms = this.extractPhrases(queryText);
    const expandedTerms = new Map<string, number>(); // Map<term, relevanceScore>
    const expansionSources: string[] = [];
    let combinedContext = '';

    // Initialize with original terms (highest relevance)
    originalTerms.forEach(term => expandedTerms.set(term.toLowerCase(), 1.0));

    // 0. Context-aware analysis: Recognize entities and detect domain
    const recognizedEntities = await this.recognizeEntities(queryText);
    const domainDetection = this.detectDomainWithConfidence(context);
    const domain = context.domain || domainDetection.domain;

    // Add recognized entities to expansion terms with high relevance
    recognizedEntities.locations.forEach(loc => {
      expandedTerms.set(loc.toLowerCase(), 0.9);
    });
    recognizedEntities.concepts.forEach(concept => {
      expandedTerms.set(concept.toLowerCase(), 0.85);
    });
    recognizedEntities.landUses.forEach(lu => {
      expandedTerms.set(lu.toLowerCase(), 0.9);
    });
    recognizedEntities.regulations.forEach(reg => {
      expandedTerms.set(reg.toLowerCase(), 0.85);
    });
    
    if (recognizedEntities.locations.length > 0 || 
        recognizedEntities.concepts.length > 0 || 
        recognizedEntities.landUses.length > 0) {
      expansionSources.push('entity-recognition');
    }

    // 0b. Entity relationship expansion - add related terms based on entity types
    const relationshipTerms = this.expandEntityRelationships(recognizedEntities, domain);
    relationshipTerms.forEach(({ term, score }) => {
      const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
      expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
    });
    if (relationshipTerms.length > 0) {
      expansionSources.push('entity-relationships');
    }

    // 0c. Context-based expansion - use thema and overheidslaag for additional context
    const contextTerms = this.expandFromContext(context, domain);
    contextTerms.forEach(({ term, score }) => {
      const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
      expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
    });
    if (contextTerms.length > 0) {
      expansionSources.push('context-based');
    }

    // 1. IMBOR-based expansion (now with context-aware filtering)
    try {
      const imborResult = this.imborService.enhanceQuery(
        context.onderwerp,
        context.thema || ''
      );
      
      // Filter IMBOR terms based on context relevance
      const filteredImborTerms = this.filterImborTermsByContext(
        imborResult.enhancedTerms,
        domain,
        recognizedEntities
      );
      
      filteredImborTerms.forEach(({ term, score }) => {
        const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
        expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
      });
      
      if (filteredImborTerms.length > 0) {
        expansionSources.push('IMBOR');
      }
      
      if (imborResult.context) {
        combinedContext += imborResult.context + ' ';
      }
    } catch (err) {
      console.warn('⚠️  IMBOR expansion failed:', err instanceof Error ? err.message : String(err));
    }

    // 1.5. KG-based expansion (if enabled)
    if (FeatureFlag.isRetrievalEnabled()) {
      try {
        // Map domain string to Domain type (function doesn't actually use domain parameter)
        const domainForKG: Domain = domain === 'planning' ? 'ruimtelijke ordening' : 
                                     domain === 'housing' ? 'wonen' : 
                                     domain === 'policy' ? 'unknown' : 'unknown';
        const kgTerms = await this.expandWithKnowledgeGraph(context, originalTerms, domainForKG, recognizedEntities);
        kgTerms.forEach(({ term, score }) => {
          const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
          expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
        });
        if (kgTerms.length > 0) {
          expansionSources.push('knowledge-graph');
        }
      } catch (err) {
        logger.warn({ error: err }, '[QueryExpansionService] KG-based expansion failed, continuing with other methods');
      }
    }

    // 2. Synonym-based expansion (now with context-aware filtering)
    const synonymTerms = this.expandWithSynonymsContextAware(
      originalTerms,
      domain,
      recognizedEntities,
      context
    );
    synonymTerms.forEach(({ term, score }) => {
      const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
      expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
    });
    if (synonymTerms.length > 0) {
      expansionSources.push(`synonyms-${domain}`);
    }

    // 2b. Entity-aware synonym expansion - expand entities with domain-specific synonyms
    if (recognizedEntities.concepts.length > 0) {
      const entitySynonymTerms = this.expandWithSynonymsContextAware(
        recognizedEntities.concepts,
        domain,
        recognizedEntities,
        context
      );
      entitySynonymTerms.forEach(({ term, score }) => {
        const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
        expandedTerms.set(term.toLowerCase(), Math.max(existingScore, score));
      });
      if (entitySynonymTerms.length > 0) {
        expansionSources.push(`entity-synonyms-${domain}`);
      }
    }

    // 3. LLM-based expansion (optional, disabled by default)
    // Now includes recognized entities in the prompt for better context
    if (this.llmExpansionEnabled) {
      try {
        const llmTerms = await this.expandWithLLM(originalTerms, context, recognizedEntities);
        llmTerms.forEach(term => {
          const existingScore = expandedTerms.get(term.toLowerCase()) || 0;
          expandedTerms.set(term.toLowerCase(), Math.max(existingScore, 0.7));
        });
        if (llmTerms.length > 0) {
          expansionSources.push('LLM');
        }
      } catch (err) {
        console.warn('⚠️  LLM expansion failed:', err instanceof Error ? err.message : String(err));
        // Continue without LLM expansion
      }
    }

    // 4. Sort terms by relevance score and limit to maxTerms
    const sortedTerms = Array.from(expandedTerms.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by relevance score (descending)
      .slice(0, this.maxTerms)
      .map(([term]) => term);

    // 5. Generate multi-query variations (now context-aware with entities)
    const queryVariations: QueryVariation[] = this.multiQueryEnabled
      ? this.generateQueryVariations(sortedTerms, context, recognizedEntities)
      : [];

    return {
      originalTerms,
      expandedTerms: sortedTerms.filter(t => !originalTerms.includes(t)),
      allTerms: sortedTerms,
      context: combinedContext.trim(),
      queryVariations,
      expansionSources,
      recognizedEntities,
      detectedDomain: domainDetection.detectedDomain,
      domainConfidence: domainDetection.confidence
    };
  }

  /**
   * Build comprehensive query text from context
   * 
   * Combines onderwerp, thema, and overheidslaag into a single query text
   * for better entity recognition and domain detection.
   */
  private buildQueryText(context: QueryContext): string {
    const parts: string[] = [context.onderwerp];
    if (context.thema) {
      parts.push(context.thema);
    }
    if (context.overheidslaag) {
      parts.push(context.overheidslaag);
    }
    return parts.join(' ').trim();
  }

  /**
   * Extract multi-word phrases from query text
   * 
   * Identifies common multi-word phrases (e.g., "ruimtelijke ordening", "bestemmingsplan")
   * and treats them as single units for expansion.
   */
  private extractPhrases(queryText: string): string[] {
    const phrases: string[] = [];
    const words = queryText.toLowerCase().split(/\s+/);
    
    // Common multi-word phrases in Dutch policy/planning domain
    const commonPhrases = [
      'ruimtelijke ordening',
      'bestemmingsplan',
      'omgevingswet',
      'omgevingsvisie',
      'structuurvisie',
      'sociale woningbouw',
      'arbeidsmigranten',
      'officiële bekendmaking',
      'milieueffectrapportage',
      'waterbeheer',
      'natuurbeheer'
    ];

    // Check for phrases in the query text
    const queryLower = queryText.toLowerCase();
    for (const phrase of commonPhrases) {
      if (queryLower.includes(phrase)) {
        phrases.push(phrase);
        // Remove phrase words from individual words list
        const phraseWords = phrase.split(/\s+/);
        phraseWords.forEach(pw => {
          const index = words.indexOf(pw);
          if (index >= 0) words.splice(index, 1);
        });
      }
    }

    // Add remaining individual words (filter out stop words)
    const stopWords = ['de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij', 'en', 'of', 'is', 'zijn', 'wordt'];
    words.forEach(word => {
      if (word.length > 2 && !stopWords.includes(word)) {
        phrases.push(word);
      }
    });

    return phrases;
  }

  /**
   * Expand entities based on their relationships
   * 
   * For example, if a location is detected, add related planning terms.
   * If land use is detected, add related policy terms.
   */
  private expandEntityRelationships(
    entities: RecognizedEntities,
    domain: string
  ): Array<{ term: string; score: number }> {
    const relationshipTerms: Array<{ term: string; score: number }> = [];

    // Location-based expansion: add planning-related terms
    if (entities.locations.length > 0) {
      if (domain === 'planning') {
        relationshipTerms.push(
          { term: 'bestemmingsplan', score: 0.8 },
          { term: 'ruimtelijke ordening', score: 0.75 },
          { term: 'omgevingsvisie', score: 0.7 },
          { term: 'omgevingsplan', score: 0.7 },
          { term: 'structuurvisie', score: 0.65 },
          { term: 'ruimtelijk beleid', score: 0.65 }
        );
      } else if (domain === 'housing') {
        relationshipTerms.push(
          { term: 'woonlocatie', score: 0.75 },
          { term: 'huisvesting', score: 0.7 },
          { term: 'woonruimte', score: 0.65 }
        );
      } else if (domain === 'policy') {
        relationshipTerms.push(
          { term: 'lokaal beleid', score: 0.75 },
          { term: 'regionaal beleid', score: 0.7 }
        );
      }
    }

    // Land use-based expansion: add policy and planning terms
    if (entities.landUses.length > 0) {
      relationshipTerms.push(
        { term: 'bestemming', score: 0.8 },
        { term: 'bouwvlak', score: 0.75 },
        { term: 'gebruiksfunctie', score: 0.7 }
      );
      if (domain === 'planning') {
        relationshipTerms.push(
          { term: 'bestemmingsplan', score: 0.8 },
          { term: 'ruimtelijk plan', score: 0.75 },
          { term: 'bestemmingswijziging', score: 0.7 },
          { term: 'omgevingsplan', score: 0.7 },
          { term: 'bouwregels', score: 0.65 }
        );
      } else if (domain === 'housing') {
        relationshipTerms.push(
          { term: 'woonbestemming', score: 0.75 },
          { term: 'woonfunctie', score: 0.7 },
          { term: 'woningbouw', score: 0.65 }
        );
      }
    }

    // Regulation-based expansion: add policy terms
    if (entities.regulations.length > 0) {
      if (domain === 'policy') {
        relationshipTerms.push(
          { term: 'regelgeving', score: 0.8 },
          { term: 'verordening', score: 0.75 },
          { term: 'beleid', score: 0.7 },
          { term: 'nota', score: 0.7 },
          { term: 'richtlijn', score: 0.65 },
          { term: 'beleidsregel', score: 0.65 }
        );
      } else if (domain === 'planning') {
        relationshipTerms.push(
          { term: 'planologische regelgeving', score: 0.75 },
          { term: 'bouwverordening', score: 0.7 },
          { term: 'omgevingsverordening', score: 0.7 }
        );
      }
    }

    // Concept-based expansion: add domain-specific terms based on concepts
    if (entities.concepts.length > 0) {
      const conceptLower = entities.concepts.map(c => c.toLowerCase()).join(' ');
      
      if (domain === 'planning') {
        // Planning-specific concept relationships
        if (conceptLower.includes('water') || conceptLower.includes('riool')) {
          relationshipTerms.push(
            { term: 'waterbeheer', score: 0.75 },
            { term: 'riolering', score: 0.7 },
            { term: 'afwatering', score: 0.65 }
          );
        }
        if (conceptLower.includes('verkeer') || conceptLower.includes('mobiliteit')) {
          relationshipTerms.push(
            { term: 'verkeersplan', score: 0.75 },
            { term: 'mobiliteitsbeleid', score: 0.7 },
            { term: 'verkeerscirculatie', score: 0.65 }
          );
        }
        if (conceptLower.includes('milieu') || conceptLower.includes('natuur')) {
          relationshipTerms.push(
            { term: 'milieubeleid', score: 0.75 },
            { term: 'natuurbeleid', score: 0.7 },
            { term: 'ecologie', score: 0.65 }
          );
        }
      } else if (domain === 'housing') {
        // Housing-specific concept relationships
        if (conceptLower.includes('woning') || conceptLower.includes('huisvesting')) {
          relationshipTerms.push(
            { term: 'woonbeleid', score: 0.75 },
            { term: 'huisvestingsbeleid', score: 0.7 },
            { term: 'woningbouw', score: 0.65 }
          );
        }
      }
    }

    // Cross-entity relationships: combine entity types for richer expansion
    if (entities.locations.length > 0 && entities.landUses.length > 0 && domain === 'planning') {
      relationshipTerms.push(
        { term: 'ruimtelijk plan', score: 0.8 },
        { term: 'bestemmingsplan', score: 0.8 },
        { term: 'omgevingsplan', score: 0.75 }
      );
    }

    if (entities.locations.length > 0 && entities.regulations.length > 0 && domain === 'policy') {
      relationshipTerms.push(
        { term: 'lokaal beleid', score: 0.75 },
        { term: 'regionale regelgeving', score: 0.7 }
      );
    }

    return relationshipTerms;
  }

  /**
   * Expand terms from query context (thema, overheidslaag)
   * 
   * Uses thema and overheidslaag to add relevant expansion terms with domain-aware scoring.
   */
  private expandFromContext(
    context: QueryContext,
    domain: string
  ): Array<{ term: string; score: number }> {
    const contextTerms: Array<{ term: string; score: number }> = [];

    // Add thema as expansion term if present
    if (context.thema) {
      contextTerms.push({ term: context.thema, score: 0.85 });
      
      // Add domain-specific thema expansions
      const themaLower = context.thema.toLowerCase();
      if (domain === 'planning') {
        // Planning-specific thema expansions
        if (themaLower.includes('ruimtelijk') || themaLower.includes('planning')) {
          contextTerms.push(
            { term: 'ruimtelijke ordening', score: 0.8 },
            { term: 'ruimtelijk beleid', score: 0.75 },
            { term: 'omgevingsplan', score: 0.7 }
          );
        }
        if (themaLower.includes('water')) {
          contextTerms.push(
            { term: 'waterbeheer', score: 0.75 },
            { term: 'waterbeleid', score: 0.7 },
            { term: 'waterkwaliteit', score: 0.65 }
          );
        }
        if (themaLower.includes('milieu') || themaLower.includes('natuur')) {
          contextTerms.push(
            { term: 'milieubeleid', score: 0.75 },
            { term: 'natuurbeleid', score: 0.7 },
            { term: 'ecologie', score: 0.65 }
          );
        }
        if (themaLower.includes('verkeer') || themaLower.includes('mobiliteit')) {
          contextTerms.push(
            { term: 'verkeersbeleid', score: 0.75 },
            { term: 'mobiliteitsbeleid', score: 0.7 },
            { term: 'verkeersplan', score: 0.65 }
          );
        }
      } else if (domain === 'housing') {
        // Housing-specific thema expansions
        if (themaLower.includes('wonen') || themaLower.includes('huisvesting')) {
          contextTerms.push(
            { term: 'woonbeleid', score: 0.75 },
            { term: 'huisvestingsbeleid', score: 0.7 },
            { term: 'woningbouw', score: 0.65 }
          );
        }
      } else if (domain === 'policy') {
        // Policy-specific thema expansions
        if (themaLower.includes('beleid') || themaLower.includes('regelgeving')) {
          contextTerms.push(
            { term: 'beleidsnota', score: 0.75 },
            { term: 'beleidsregel', score: 0.7 },
            { term: 'verordening', score: 0.65 }
          );
        }
      }
    }

    // Add overheidslaag-specific terms with domain awareness
    if (context.overheidslaag) {
      const overheidslaagLower = context.overheidslaag.toLowerCase();
      if (overheidslaagLower.includes('gemeente')) {
        contextTerms.push(
          { term: 'gemeentelijk beleid', score: 0.8 },
          { term: 'gemeentelijke verordening', score: 0.75 },
          { term: 'gemeentelijk plan', score: 0.7 }
        );
        if (domain === 'planning') {
          contextTerms.push(
            { term: 'gemeentelijk bestemmingsplan', score: 0.75 },
            { term: 'gemeentelijk omgevingsplan', score: 0.7 }
          );
        }
      } else if (overheidslaagLower.includes('provincie')) {
        contextTerms.push(
          { term: 'provinciaal beleid', score: 0.8 },
          { term: 'provinciale verordening', score: 0.75 },
          { term: 'provinciaal plan', score: 0.7 }
        );
        if (domain === 'planning') {
          contextTerms.push(
            { term: 'provinciale structuurvisie', score: 0.75 },
            { term: 'provinciaal ruimtelijk beleid', score: 0.7 }
          );
        }
      } else if (overheidslaagLower.includes('rijk') || overheidslaagLower.includes('rijks')) {
        contextTerms.push(
          { term: 'rijksbeleid', score: 0.8 },
          { term: 'landelijk beleid', score: 0.75 },
          { term: 'nationale regelgeving', score: 0.7 }
        );
        if (domain === 'planning') {
          contextTerms.push(
            { term: 'nationale omgevingsvisie', score: 0.75 },
            { term: 'rijksstructuurvisie', score: 0.7 }
          );
        }
      }
    }

    // Cross-context expansion: combine thema and overheidslaag for richer terms
    if (context.thema && context.overheidslaag) {
      const themaLower = context.thema.toLowerCase();
      const overheidslaagLower = context.overheidslaag.toLowerCase();
      
      if (overheidslaagLower.includes('gemeente')) {
        if (themaLower.includes('ruimtelijk') || themaLower.includes('planning')) {
          contextTerms.push({ term: 'gemeentelijk ruimtelijk beleid', score: 0.75 });
        }
        if (themaLower.includes('water')) {
          contextTerms.push({ term: 'gemeentelijk waterbeleid', score: 0.7 });
        }
      } else if (overheidslaagLower.includes('provincie')) {
        if (themaLower.includes('ruimtelijk') || themaLower.includes('planning')) {
          contextTerms.push({ term: 'provinciaal ruimtelijk beleid', score: 0.75 });
        }
        if (themaLower.includes('water')) {
          contextTerms.push({ term: 'provinciaal waterbeleid', score: 0.7 });
        }
      }
    }

    return contextTerms;
  }

  /**
   * Filter IMBOR terms based on context relevance
   * 
   * Filters and scores IMBOR expansion terms based on:
   * - Domain match
   * - Entity relevance
   * - Context relevance
   */
  private filterImborTermsByContext(
    imborTerms: string[],
    domain: string,
    entities: RecognizedEntities
  ): Array<{ term: string; score: number }> {
    const filteredTerms: Array<{ term: string; score: number }> = [];

    for (const term of imborTerms) {
      const termLower = term.toLowerCase();
      let score = 0.7; // Base score for IMBOR terms

      // Boost score if term matches domain keywords
      const domainKeywords: Record<string, string[]> = {
        planning: ['planning', 'ruimtelijk', 'bestemming', 'omgeving', 'bouw'],
        housing: ['woning', 'huisvesting', 'woon', 'accommodatie'],
        policy: ['beleid', 'regelgeving', 'verordening', 'nota']
      };

      const keywords = domainKeywords[domain] || [];
      if (keywords.some(kw => termLower.includes(kw))) {
        score += 0.1;
      }

      // Boost score if term relates to recognized entities
      const allEntityTerms = [
        ...entities.locations,
        ...entities.concepts,
        ...entities.landUses,
        ...entities.regulations
      ].map(e => e.toLowerCase());

      if (allEntityTerms.some(entityTerm => 
        termLower.includes(entityTerm) || entityTerm.includes(termLower)
      )) {
        score += 0.1;
      }

      filteredTerms.push({ term, score: Math.min(score, 1.0) });
    }

    return filteredTerms;
  }

  /**
   * Expand query terms using synonym dictionaries with context-aware filtering
   * 
   * Searches all loaded dictionaries for synonyms of the input terms.
   * Domain-specific dictionaries are prioritized based on the detected domain.
   * Returns terms with relevance scores based on context match.
   */
  private expandWithSynonymsContextAware(
    terms: string[],
    domain: string,
    entities: RecognizedEntities,
    context: QueryContext
  ): Array<{ term: string; score: number }> {
    const synonyms: Array<{ term: string; score: number }> = [];

    // Priority order: domain-specific dictionary, then general Dutch
    const dictionaryOrder = domain !== 'general' 
      ? [domain, 'dutch']
      : ['dutch', 'planning', 'housing', 'policy'];

    for (const dictName of dictionaryOrder) {
      const dictionary = this.synonymDictionaries.get(dictName);
      if (!dictionary) continue;

      // Calculate base score based on dictionary priority
      const baseScore = dictName === domain ? 0.8 : (dictName === 'dutch' ? 0.7 : 0.6);

      for (const term of terms) {
        const termLower = term.toLowerCase();
        const termSynonyms = dictionary.get(termLower);
        if (termSynonyms) {
          termSynonyms.forEach(syn => {
            // Check if synonym is already added (avoid duplicates)
            if (!synonyms.some(s => s.term.toLowerCase() === syn.toLowerCase())) {
              let score = baseScore;

              // Boost score if synonym matches context
              const synLower = syn.toLowerCase();
              if (context.thema && synLower.includes(context.thema.toLowerCase())) {
                score += 0.1;
              }
              if (context.overheidslaag && synLower.includes(context.overheidslaag.toLowerCase())) {
                score += 0.1;
              }

              // Boost score if synonym relates to recognized entities
              const allEntityTerms = [
                ...entities.locations,
                ...entities.concepts,
                ...entities.landUses
              ].map(e => e.toLowerCase());

              if (allEntityTerms.some(entityTerm => 
                synLower.includes(entityTerm) || entityTerm.includes(synLower)
              )) {
                score += 0.05;
              }

              synonyms.push({ term: syn, score: Math.min(score, 1.0) });
            }
          });
        }
      }
    }

    return synonyms;
  }

  /**
   * Expand query terms using synonym dictionaries
   * 
   * Searches all loaded dictionaries for synonyms of the input terms.
   * Domain-specific dictionaries are prioritized based on the detected domain.
   * 
   * @deprecated Use expandWithSynonymsContextAware() for better context-aware expansion
   */
  private expandWithSynonyms(terms: string[], domain: string): string[] {
    const synonyms = new Set<string>();

    // Priority order: domain-specific dictionary, then general Dutch
    const dictionaryOrder = domain !== 'general' 
      ? [domain, 'dutch']
      : ['dutch', 'planning', 'housing', 'policy'];

    for (const dictName of dictionaryOrder) {
      const dictionary = this.synonymDictionaries.get(dictName);
      if (!dictionary) continue;

      for (const term of terms) {
        const termLower = term.toLowerCase();
        const termSynonyms = dictionary.get(termLower);
        if (termSynonyms) {
          termSynonyms.forEach(syn => synonyms.add(syn));
        }
      }
    }

    return Array.from(synonyms);
  }

  /**
   * Recognize entities from query text
   * 
   * Extracts key entities (locations, concepts, regulations, land uses) from the query
   * to improve context-aware expansion.
   * 
   * @param queryText The query text to analyze
   * @returns Recognized entities
   */
  private async recognizeEntities(queryText: string): Promise<RecognizedEntities> {
    const entities: RecognizedEntities = {
      locations: [],
      concepts: [],
      regulations: [],
      landUses: []
    };

    if (!queryText || queryText.trim().length === 0) {
      return entities;
    }

    // Use RuleBasedEntityExtractor from parsing layer to extract entities from query text
    // Convert query text to a minimal NormalizedDocument for parsing layer compatibility
    try {
      // Create a minimal NormalizedDocument from query text
      // NormalizedDocument is the output of ingestion layer, not CanonicalDocument
      const queryDocument: NormalizedDocument = {
        sourceId: 'query',
        sourceUrl: 'query://query',
        source: 'Web',
        title: 'query',
        content: queryText,
        mimeType: 'text/plain',
        rawData: { queryText },
        metadata: {
          documentType: 'Query',
          documentFamily: 'Beleid',
        },
      };

      // Convert NormalizedDocument to CanonicalDocument for extractor (which expects CanonicalDocument)
      const canonicalQueryDoc: CanonicalDocument = {
        _id: '',
        source: 'Web',
        sourceId: 'query',
        canonicalUrl: 'query://query',
        title: 'query',
        documentFamily: 'Beleid',
        documentType: 'Query',
        dates: {
          publishedAt: new Date(),
        },
        fullText: queryText,
        contentFingerprint: '',
        language: 'nl',
        artifactRefs: [],
        sourceMetadata: {
          mimeType: 'text/plain',
          rawData: { queryText },
        },
        reviewStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
        schemaVersion: '1.0',
      };

      const extractedEntities = await this.entityExtractor.extract(canonicalQueryDoc);

      // Extract locations (SpatialUnits)
      extractedEntities
        .filter(e => e.type === 'SpatialUnit')
        .forEach(e => {
          if (e.name && !entities.locations.includes(e.name)) {
            entities.locations.push(e.name);
          }
        });

      // Extract land uses
      extractedEntities
        .filter(e => e.type === 'LandUse')
        .forEach(e => {
          if (e.name && !entities.landUses.includes(e.name)) {
            entities.landUses.push(e.name);
          }
        });

      // Extract regulations
      extractedEntities
        .filter(e => e.type === 'Regulation')
        .forEach(e => {
          if (e.name && !entities.regulations.includes(e.name)) {
            entities.regulations.push(e.name);
          }
        });
    } catch (err) {
      // If extraction fails, continue without entities
      console.debug('[QueryExpansionService] Entity recognition failed:', err instanceof Error ? err.message : String(err));
    }

    // Extract key concepts (important terms that aren't stop words)
    const words = queryText.toLowerCase().split(/\s+/).filter(word => {
      const stopWords = ['de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij', 'en', 'of', 'is', 'zijn', 'wordt'];
      return word.length > 3 && !stopWords.includes(word);
    });
    
    // Add unique single-word concepts
    words.forEach(word => {
      if (!entities.concepts.includes(word) && 
          !entities.locations.some(loc => loc.toLowerCase() === word) &&
          !entities.landUses.some(lu => lu.toLowerCase() === word)) {
        entities.concepts.push(word);
      }
    });

    // Extract multi-word phrases as concepts (common domain phrases)
    const commonPhrases = [
      'ruimtelijke ordening', 'bestemmingsplan', 'omgevingsplan', 'omgevingsvisie',
      'structuurvisie', 'waterbeheer', 'milieubeleid', 'natuurbeleid',
      'verkeersplan', 'mobiliteitsbeleid', 'woonbeleid', 'huisvestingsbeleid',
      'gemeentelijk beleid', 'provinciaal beleid', 'rijksbeleid',
      'gemeentelijke verordening', 'provinciale verordening', 'rijksverordening',
      'ruimtelijk plan', 'bouwplan', 'woningbouw', 'waterkwaliteit',
      'bestemmingswijziging', 'omgevingsverordening', 'bouwverordening'
    ];

    const queryTextLower = queryText.toLowerCase();
    commonPhrases.forEach(phrase => {
      if (queryTextLower.includes(phrase) && !entities.concepts.includes(phrase)) {
        // Check if not already captured as a single entity
        const isAlreadyEntity = 
          entities.locations.some(loc => loc.toLowerCase().includes(phrase)) ||
          entities.landUses.some(lu => lu.toLowerCase().includes(phrase)) ||
          entities.regulations.some(reg => reg.toLowerCase().includes(phrase));
        
        if (!isAlreadyEntity) {
          entities.concepts.push(phrase);
        }
      }
    });

    return entities;
  }

  /**
   * Detect domain from query context using DomainClassificationService
   * 
   * Uses the improved DomainClassificationService to determine the most relevant domain
   * with confidence scoring. Falls back to simple keyword matching if needed.
   * 
   * Public method for external use (e.g., workflow actions).
   * 
   * @param context Query context
   * @returns Domain string ('planning', 'housing', 'policy', or 'general')
   */
  detectDomain(context: QueryContext): string {
    const queryText = `${context.onderwerp} ${context.thema || ''}`.trim();
    
    if (!queryText) {
      return 'general';
    }

    // Use DomainClassificationService for improved classification
    const classification = this.domainClassificationService.classify(queryText);
    
    // Map DomainClassificationService domains to QueryExpansionService domains
    const domainMapping: Record<Domain, string> = {
      'ruimtelijke ordening': 'planning',
      'wonen': 'housing',
      'milieu': 'planning',
      'water': 'planning',
      'natuur': 'planning',
      'verkeer': 'planning',
      'economie': 'general',
      'cultuur': 'general',
      'onderwijs': 'general',
      'gezondheid': 'general',
      'energie': 'planning',
      'klimaat': 'planning',
      'bodem': 'planning',
      'geluid': 'planning',
      'lucht': 'planning',
      'afval': 'planning',
      'unknown': 'general'
    };

    // If we have a good classification (confidence > 0.3), use it
    if (classification.confidence > 0.3 && classification.domain !== 'unknown') {
      return domainMapping[classification.domain] || 'general';
    }

    // Fallback to simple keyword matching for backward compatibility
    const queryTextLower = queryText.toLowerCase();
    const planningKeywords = ['planning', 'bestemmingsplan', 'ruimtelijk', 'stedenbouw', 'omgevingswet', 'bodem'];
    const housingKeywords = ['huisvesting', 'woning', 'woonruimte', 'accommodatie', 'arbeidsmigranten'];
    const policyKeywords = ['beleid', 'regelgeving', 'nota', 'richtlijn', 'verordening'];

    if (planningKeywords.some(kw => queryTextLower.includes(kw))) return 'planning';
    if (housingKeywords.some(kw => queryTextLower.includes(kw))) return 'housing';
    if (policyKeywords.some(kw => queryTextLower.includes(kw))) return 'policy';

    return 'general';
  }

  /**
   * Detect domain with confidence using DomainClassificationService
   * 
   * @param context Query context
   * @returns Domain classification result with confidence
   */
  detectDomainWithConfidence(context: QueryContext): { domain: string; confidence: number; detectedDomain: Domain } {
    const queryText = `${context.onderwerp} ${context.thema || ''}`.trim();
    
    if (!queryText) {
      return { domain: 'general', confidence: 0, detectedDomain: 'unknown' };
    }

    const classification = this.domainClassificationService.classify(queryText);
    
    const domainMapping: Record<Domain, string> = {
      'ruimtelijke ordening': 'planning',
      'wonen': 'housing',
      'milieu': 'planning',
      'water': 'planning',
      'natuur': 'planning',
      'verkeer': 'planning',
      'economie': 'general',
      'cultuur': 'general',
      'onderwijs': 'general',
      'gezondheid': 'general',
      'energie': 'planning',
      'klimaat': 'planning',
      'bodem': 'planning',
      'geluid': 'planning',
      'lucht': 'planning',
      'afval': 'planning',
      'unknown': 'general'
    };

    const mappedDomain = domainMapping[classification.domain] || 'general';
    
    return {
      domain: mappedDomain,
      confidence: classification.confidence,
      detectedDomain: classification.domain
    };
  }

  /**
   * Generate multi-query variations for different document types
   * 
   * Creates specialized query variations targeting:
   * - Policy documents: "beleid [query] gemeente"
   * - News/articles: "[query] nieuws"
   * - Official documents: "officiële bekendmaking [query]"
   * - General web: original query
   * 
   * Now includes entity-aware variations that emphasize recognized entities.
   * 
   * @param terms Expanded terms
   * @param context Query context
   * @param entities Recognized entities (optional)
   */
  private generateQueryVariations(
    terms: string[], 
    context: QueryContext, 
    entities?: RecognizedEntities
  ): QueryVariation[] {
    const baseQuery = terms.join(' ');
    const variations: QueryVariation[] = [];

    // Build entity-enhanced query if entities are available
    let entityEnhancedQuery = baseQuery;
    if (entities) {
      const entityTerms: string[] = [];
      if (entities.locations.length > 0) {
        entityTerms.push(...entities.locations.slice(0, 2)); // Limit to 2 locations
      }
      if (entities.concepts.length > 0) {
        entityTerms.push(...entities.concepts.slice(0, 3)); // Limit to 3 concepts
      }
      if (entityTerms.length > 0) {
        entityEnhancedQuery = `${entityTerms.join(' ')} ${baseQuery}`;
      }
    }

    // Policy-focused query (enhanced with entities if available)
    variations.push({
      type: 'policy',
      query: `beleid ${entityEnhancedQuery} ${context.overheidslaag || 'gemeente'}`,
      terms: ['beleid', ...terms, context.overheidslaag || 'gemeente']
    });

    // News/article query
    variations.push({
      type: 'news',
      query: `${entityEnhancedQuery} nieuws`,
      terms: [...terms, 'nieuws']
    });

    // Official document query
    variations.push({
      type: 'official',
      query: `officiële bekendmaking ${entityEnhancedQuery}`,
      terms: ['officiële', 'bekendmaking', ...terms]
    });

    // General web query (original)
    variations.push({
      type: 'general',
      query: baseQuery,
      terms: terms
    });

    return variations;
  }

  /**
   * Expand query using LLM (OpenAI)
   * 
   * Uses GPT to generate related terms, synonyms, and context-aware expansions.
   * This is optional and can be enabled via LLM_EXPANSION_ENABLED=true.
   * Now includes recognized entities in the prompt for better context-aware expansion.
   * 
   * HOW IT WORKS:
   * 1. Constructs a prompt asking the LLM to generate related terms
   * 2. Includes recognized entities for context
   * 3. Calls OpenAI API (Chat Completions)
   * 4. Parses the response to extract terms
   * 5. Caches results to avoid repeated API calls
   * 
   * TESTING:
   * - Requires OPENAI_API_KEY to be set
   * - Can be tested by enabling LLM_EXPANSION_ENABLED=true
   * - Check logs for LLM expansion results
   */
  private async expandWithLLM(
    terms: string[], 
    context: QueryContext, 
    entities?: RecognizedEntities
  ): Promise<string[]> {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn('⚠️  OPENAI_API_KEY not set, skipping LLM expansion');
      return [];
    }

    try {
      // Dynamic import to avoid requiring openai package if not using LLM
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const model = process.env.LLM_EXPANSION_MODEL || 'gpt-4o-mini';
      const queryText = terms.join(' ');
      const domain = context.domain || this.detectDomain(context);

      // Build entity context for prompt
      let entityContext = '';
      if (entities) {
        const entityParts: string[] = [];
        if (entities.locations.length > 0) {
          entityParts.push(`Locaties: ${entities.locations.join(', ')}`);
        }
        if (entities.concepts.length > 0) {
          entityParts.push(`Concepten: ${entities.concepts.join(', ')}`);
        }
        if (entities.landUses.length > 0) {
          entityParts.push(`Bestemmingen: ${entities.landUses.join(', ')}`);
        }
        if (entityParts.length > 0) {
          entityContext = `\nHerkennde entiteiten:\n${entityParts.join('\n')}`;
        }
      }

      // Construct prompt for query expansion (now with entity context)
      const prompt = `Je bent een expert in Nederlandse overheidsdocumenten en ruimtelijke ordening.

Gegeven de zoekopdracht: "${queryText}"
Domein: ${domain}
Onderwerp: ${context.onderwerp}
Thema: ${context.thema || 'niet gespecificeerd'}${entityContext}

Genereer een lijst van gerelateerde zoektermen, synoniemen en varianten die kunnen helpen om relevante documenten te vinden. 
Focus op:
- Synoniemen en varianten van de termen
- Gerelateerde concepten in het domein ${domain}
- Termen die vaak samen voorkomen in overheidsdocumenten
- Acroniemen en afkortingen die relevant kunnen zijn
${entities && entities.locations.length > 0 ? '- Gerelateerde termen voor de herkende locaties' : ''}
${entities && entities.concepts.length > 0 ? '- Uitbreidingen van de herkende concepten' : ''}

Geef alleen de termen terug, gescheiden door komma's, zonder uitleg of nummering.
Maximaal 10 termen.

Voorbeelden:
- "arbeidsmigranten" → "arbeidsimmigranten, seizoensarbeiders, gastarbeiders, tijdelijke arbeidsmigratie"
- "huisvesting" → "woning, accommodatie, woonruimte, verblijf"
- "bestemmingsplan" → "ruimtelijk plan, stedenbouwkundig plan, structuurplan"`;

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'Je bent een assistent die helpt bij het uitbreiden van zoekopdrachten voor Nederlandse overheidsdocumenten.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      // Parse the response - extract terms separated by commas
      const llmTerms = content
        .split(',')
        .map(term => term.trim())
        .filter(term => term.length > 0 && term.length < 50) // Filter out invalid terms
        .slice(0, 10); // Limit to 10 terms

      console.log(`🤖 LLM expansion generated ${llmTerms.length} terms: ${llmTerms.slice(0, 5).join(', ')}${llmTerms.length > 5 ? '...' : ''}`);

      return llmTerms;
    } catch (error) {
      console.error('Error in LLM expansion:', error);
      return [];
    }
  }

  /**
   * Create basic expansion when service is disabled
   */
  private async createBasicExpansion(context: QueryContext): Promise<ExpandedQuery> {
    const originalTerms = [context.onderwerp, context.thema].filter(Boolean) as string[];
    const queryText = `${context.onderwerp} ${context.thema || ''}`.trim();
    const recognizedEntities = await this.recognizeEntities(queryText);
    const domainDetection = this.detectDomainWithConfidence(context);
    
    return {
      originalTerms,
      expandedTerms: [],
      allTerms: originalTerms,
      context: '',
      queryVariations: [],
      expansionSources: [],
      recognizedEntities,
      detectedDomain: domainDetection.detectedDomain,
      domainConfidence: domainDetection.confidence
    };
  }

  /**
   * Get expansion statistics (for monitoring/debugging)
   */
  getStats(): {
    dictionariesLoaded: number;
    totalSynonymEntries: number;
    enabled: boolean;
    multiQueryEnabled: boolean;
    llmExpansionEnabled: boolean;
  } {
    let totalEntries = 0;
    for (const dict of this.synonymDictionaries.values()) {
      totalEntries += dict.size;
    }

    return {
      dictionariesLoaded: this.synonymDictionaries.size,
      totalSynonymEntries: totalEntries,
      enabled: this.enabled,
      multiQueryEnabled: this.multiQueryEnabled,
      llmExpansionEnabled: this.llmExpansionEnabled
    };
  }

  /**
   * Update dictionary with new terms and synonyms from LearningService
   * 
   * This method is called by LearningService when new terms are discovered.
   * It updates the dictionary files and reloads them into memory.
   * 
   * @param updates Dictionary updates to apply
   * @param dictionaryName Which dictionary to update (default: 'dutch')
   * @returns Update result with statistics
   */
  async updateDictionary(
    updates: DictionaryUpdate[],
    dictionaryName: string = 'dutch'
  ): Promise<{
    success: boolean;
    termsAdded: number;
    synonymsAdded: number;
  }> {
    if (!this.enabled) {
      return { success: false, termsAdded: 0, synonymsAdded: 0 };
    }

    try {
      // Use DictionaryUpdateService to update the file
      const result = await this.dictionaryUpdateService.updateDictionary(
        updates,
        dictionaryName,
        0.9 // Auto-approve high-confidence terms
      );

      if (result.success) {
        // Reload dictionaries to pick up changes
        await this.loadSynonymDictionaries();
        console.log(`[QueryExpansionService] Dictionary updated and reloaded: ${result.termsAdded} terms, ${result.synonymsAdded} synonyms`);
      }

      return {
        success: result.success,
        termsAdded: result.termsAdded,
        synonymsAdded: result.synonymsAdded
      };
    } catch (error) {
      console.error('[QueryExpansionService] Error updating dictionary:', error);
      return { success: false, termsAdded: 0, synonymsAdded: 0 };
    }
  }

  /**
   * Reload synonym dictionaries from files
   * 
   * Useful after dictionary updates or manual file changes.
   */
  async reloadDictionaries(): Promise<void> {
    await this.loadSynonymDictionaries();
  }
}

