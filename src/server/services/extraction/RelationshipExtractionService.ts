import { Relation, RelationType, BaseEntity } from '../../domain/ontology.js';
import { LLMService, LLMMessage } from '../llm/LLMService.js';
import { Cache } from '../infrastructure/cache.js';
import { logger } from '../../utils/logger.js';
import {
  ExtractionContext,
  ExtractedRelationship,
  RelationshipExtractionResult,
  BatchExtractionResult,
} from './models/RelationshipModels.js';
import {
  buildRelationshipExtractionSystemPrompt,
  buildRelationshipExtractionPrompt,
  getFewShotExamples,
} from './prompts/relationshipExtractionPrompts.js';
import { RelationshipValidator } from '../knowledge-graph/validators/RelationshipValidator.js';
import { FeatureFlag } from '../../models/FeatureFlag.js';

/**
 * Service for extracting relationships between entities using LLM
 * 
 * Uses LLM to extract structured relationships from documents with:
 * - Caching for performance
 * - Request queuing for rate limiting
 * - Validation against ontology rules
 * - Cost tracking and metrics
 */
export class RelationshipExtractionService {
  private llmService: LLMService;
  private cache: Cache<ExtractedRelationship[]>;
  private readonly cacheTTL: number;
  private readonly enabled: boolean;
  private readonly provider: string;
  private readonly model: string;
  private readonly maxConcurrentRequests: number;
  private requestQueue: Array<() => Promise<void>> = [];
  private processingQueue: boolean = false;
  private activeRequests: number = 0;
  private relationshipValidator: RelationshipValidator;
  
  // Performance metrics
  private requestCount: number = 0;
  private totalLatency: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private totalCost: number = 0;
  private totalRelationshipsExtracted: number = 0;
  private validationPassed: number = 0;
  private validationFailed: number = 0;

  // Cost per 1K tokens (OpenAI GPT-4o-mini pricing as of 2024)
  private readonly COST_PER_1K_PROMPT_TOKENS = 0.00015; // $0.15 per 1M tokens
  private readonly COST_PER_1K_COMPLETION_TOKENS = 0.0006; // $0.60 per 1M tokens

  constructor() {
    this.enabled = process.env.KG_RELATIONSHIP_EXTRACTION_ENABLED === 'true';
    this.provider = process.env.RELATIONSHIP_LLM_PROVIDER || 'openai';
    this.model = process.env.RELATIONSHIP_LLM_MODEL || 'gpt-4o-mini';
    const parsedCacheTTL = parseInt(process.env.RELATIONSHIP_LLM_CACHE_TTL || '2592000', 10);
    this.cacheTTL = (isNaN(parsedCacheTTL) || parsedCacheTTL <= 0 ? 2592000 : parsedCacheTTL) * 1000;
    const parsedMaxConcurrent = parseInt(process.env.RELATIONSHIP_LLM_MAX_CONCURRENT || '3', 10);
    this.maxConcurrentRequests = isNaN(parsedMaxConcurrent) || parsedMaxConcurrent <= 0 ? 3 : parsedMaxConcurrent;
    
    const parsedCacheSize = parseInt(process.env.RELATIONSHIP_LLM_CACHE_SIZE || '500', 10);
    const validCacheSize = isNaN(parsedCacheSize) || parsedCacheSize <= 0 ? 500 : parsedCacheSize;
    this.cache = new Cache<ExtractedRelationship[]>(validCacheSize, this.cacheTTL);
    
    this.llmService = new LLMService({
      provider: this.provider as 'openai' | 'anthropic' | 'local',
      model: this.model,
      temperature: 0.1, // Low temperature for consistent extraction
      maxTokens: 2000,
      enabled: this.enabled,
    });
    
    this.relationshipValidator = new RelationshipValidator();
  }

  /**
   * Check if relationship extraction is enabled
   */
  isEnabled(): boolean {
    if (!this.enabled) {
      return false;
    }
    
    // Check relationship extraction flag (respects KG_ENABLED and KG_EXTRACTION_ENABLED hierarchy)
    return FeatureFlag.isRelationshipExtractionEnabled();
  }

  /**
   * Extract relationships from a document
   */
  async extractRelationships(
    context: ExtractionContext
  ): Promise<RelationshipExtractionResult> {
    const startTime = Date.now();
    
    if (!this.isEnabled()) {
      return {
        relationships: [],
        documentId: context.documentId,
        extractionTime: Date.now() - startTime,
        success: false,
        error: 'Relationship extraction is disabled',
      };
    }

    // Check cache
    const cacheKey = this.getCacheKey(context);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return {
        relationships: cached,
        documentId: context.documentId,
        extractionTime: Date.now() - startTime,
        success: true,
      };
    }

    this.cacheMisses++;

    // Queue request for rate limiting
    return new Promise((resolve) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.extractWithLLM(context);
          
          if (result.success && result.relationships) {
            // Cache successful results
            await this.cache.set(cacheKey, result.relationships, this.cacheTTL);
            this.totalRelationshipsExtracted += result.relationships.length;
          }

          // Track performance
          const latency = Date.now() - startTime;
          this.requestCount++;
          this.totalLatency += latency;
          
          if (result.cost) {
            this.totalCost += result.cost.estimatedCost;
          }

          resolve(result);
        } catch (error) {
          logger.error({ error }, '[RelationshipExtractionService] Error extracting relationships');
          const latency = Date.now() - startTime;
          this.requestCount++;
          this.totalLatency += latency;
          
          resolve({
            relationships: [],
            documentId: context.documentId,
            extractionTime: latency,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      this.processQueue();
    });
  }

  /**
   * Extract relationships from multiple documents (batch processing)
   */
  async extractRelationshipsBatch(
    contexts: ExtractionContext[]
  ): Promise<BatchExtractionResult> {
    const startTime = Date.now();
    const results: RelationshipExtractionResult[] = [];
    
    // Process in parallel with concurrency limit
    const batchSize = this.maxConcurrentRequests;
    for (let i = 0; i < contexts.length; i += batchSize) {
      const batch = contexts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((context) => this.extractRelationships(context))
      );
      results.push(...batchResults);
    }

    const totalTime = Date.now() - startTime;
    const totalRelationships = results.reduce((sum, r) => sum + r.relationships.length, 0);
    const totalCost = results.reduce((sum, r) => sum + (r.cost?.estimatedCost || 0), 0);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return {
      results,
      totalRelationships,
      totalTime,
      totalCost,
      successCount,
      failureCount,
    };
  }

  /**
   * Validate extracted relationships
   */
  async validateRelationships(
    relationships: ExtractedRelationship[],
    fetchEntities: (ids: string[]) => Promise<(BaseEntity | undefined)[]>
  ): Promise<{
    valid: Relation[];
    invalid: ExtractedRelationship[];
  }> {
    const valid: Relation[] = [];
    const invalid: ExtractedRelationship[] = [];

    // Collect all unique entity IDs to fetch in batch
    const entityIds = new Set<string>();
    for (const rel of relationships) {
      entityIds.add(rel.sourceId);
      entityIds.add(rel.targetId);
    }
    const uniqueIds = Array.from(entityIds);

    // Fetch all entities in one batch
    const entityMap = new Map<string, BaseEntity>();
    try {
      if (uniqueIds.length > 0) {
        const entities = await fetchEntities(uniqueIds);
        for (const entity of entities) {
          if (entity) {
            entityMap.set(entity.id, entity);
          }
        }
      }
    } catch (error) {
      logger.error({ error }, '[RelationshipExtractionService] Error batch fetching entities for validation');
      // Continue with empty entity map - relationships will be marked invalid individually
    }

    for (const rel of relationships) {
      try {
        const sourceEntity = entityMap.get(rel.sourceId);
        const targetEntity = entityMap.get(rel.targetId);

        if (!sourceEntity) {
          throw new Error(`Source entity ${rel.sourceId} not found`);
        }
        if (!targetEntity) {
          throw new Error(`Target entity ${rel.targetId} not found`);
        }

        const validation = await this.relationshipValidator.validate(
          {
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            metadata: rel.metadata,
          },
          sourceEntity,
          targetEntity
        );

        if (validation.isValid) {
          valid.push({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            metadata: {
              ...rel.metadata,
              confidence: rel.confidence,
              sourceText: rel.sourceText,
              extractedAt: new Date().toISOString(),
            },
          });
          this.validationPassed++;
        } else {
          invalid.push(rel);
          this.validationFailed++;
          logger.debug(
            { errors: validation.errors, relationship: rel },
            `[RelationshipExtractionService] Invalid relationship: ${rel.type} from ${rel.sourceId} to ${rel.targetId}`
          );
        }
      } catch (error) {
        invalid.push(rel);
        this.validationFailed++;
        logger.error(
          { 
            error
          },
          '[RelationshipExtractionService] Error validating relationship'
        );
      }
    }

    return { valid, invalid };
  }

  /**
   * Process request queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (!request) break;

      this.activeRequests++;
      request().finally(() => {
        this.activeRequests--;
        if (this.requestQueue.length > 0) {
          this.processQueue();
        } else {
          this.processingQueue = false;
        }
      });
    }

    this.processingQueue = false;
  }

  /**
   * Get cache key for context
   */
  private getCacheKey(context: ExtractionContext): string {
    const key = `${context.documentId}:${context.documentText.slice(0, 500)}`;
    return `rel_extract:${Buffer.from(key).toString('base64').slice(0, 100)}`;
  }

  /**
   * Extract relationships using LLM
   */
  private async extractWithLLM(
    context: ExtractionContext
  ): Promise<RelationshipExtractionResult> {
    const startTime = Date.now();

    if (!this.llmService.isEnabled()) {
      return {
        relationships: [],
        documentId: context.documentId,
        extractionTime: Date.now() - startTime,
        success: false,
        error: 'LLM service is disabled',
      };
    }

    try {
      const systemPrompt = buildRelationshipExtractionSystemPrompt();
      const userPrompt = buildRelationshipExtractionPrompt(context);
      const fewShotExamples = getFewShotExamples();

      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${fewShotExamples}\n\n${userPrompt}`,
        },
      ];

      const response = await this.llmService.generate(messages);
      const extractionTime = Date.now() - startTime;

      // Parse JSON response
      let parsed: { relationships?: ExtractedRelationship[] };
      try {
        parsed = JSON.parse(response.content);
      } catch (parseError) {
        logger.error({ error: parseError }, '[RelationshipExtractionService] Failed to parse LLM response');
        return {
          relationships: [],
          documentId: context.documentId,
          extractionTime,
          success: false,
          error: 'Failed to parse LLM response as JSON',
        };
      }

      // Convert to ExtractedRelationship format
      const relationships: ExtractedRelationship[] = [];
      if (Array.isArray(parsed.relationships)) {
        for (const rel of parsed.relationships) {
          if (
            rel.sourceId &&
            rel.targetId &&
            rel.type &&
            Object.values(RelationType).includes(rel.type)
          ) {
            relationships.push({
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              type: rel.type as RelationType,
              confidence: typeof rel.confidence === 'number' 
                ? Math.max(0, Math.min(1, rel.confidence)) 
                : 0.5,
              sourceText: rel.sourceText,
              metadata: rel.metadata || {},
            });
          }
        }
      }

      // Calculate cost
      const cost = response.usage
        ? {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            estimatedCost:
              (response.usage.promptTokens / 1000) * this.COST_PER_1K_PROMPT_TOKENS +
              (response.usage.completionTokens / 1000) * this.COST_PER_1K_COMPLETION_TOKENS,
          }
        : undefined;

      return {
        relationships,
        documentId: context.documentId,
        extractionTime,
        success: true,
        cost,
      };
    } catch (error) {
      logger.error({ error }, '[RelationshipExtractionService] Error calling LLM');
      return {
        relationships: [],
        documentId: context.documentId,
        extractionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    requestCount: number;
    averageLatency: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    activeRequests: number;
    queueLength: number;
    totalCost: number;
    totalRelationshipsExtracted: number;
    validationPassRate: number;
    validationPassed: number;
    validationFailed: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    const totalValidations = this.validationPassed + this.validationFailed;
    
    return {
      requestCount: this.requestCount,
      averageLatency: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length,
      totalCost: this.totalCost,
      totalRelationshipsExtracted: this.totalRelationshipsExtracted,
      validationPassRate: totalValidations > 0 ? this.validationPassed / totalValidations : 0,
      validationPassed: this.validationPassed,
      validationFailed: this.validationFailed,
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.requestCount = 0;
    this.totalLatency = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalCost = 0;
    this.totalRelationshipsExtracted = 0;
    this.validationPassed = 0;
    this.validationFailed = 0;
  }
}

