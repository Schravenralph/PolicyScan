/**
 * EntityExtractor - LLM-based entity extraction
 * 
 * Extracts entities (PolicyDocument, Regulation, SpatialUnit, LandUse, Requirement)
 * from documents using LLM with structured output.
 * 
 * Replaces the deprecated EntityExtractionService.
 */

import { logger } from '../../../utils/logger.js';
import { LLMService, LLMMessage } from '../../llm/LLMService.js';
import type { IExtractor } from '../interfaces/IExtractor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import {
  BaseEntity
} from '../../../domain/ontology.js';
import { DocumentMapper } from '../../../services/orchestration/mappers/DocumentMapper.js';
import { EntitySchemaValidator } from '../../knowledge-graph/validators/EntitySchemaValidator.js';
import {
  EntityExtractionResult,
  ParsedLLMExtractionResponse,
  PolicyDocumentExtractionModel,
  RegulationExtractionModel,
  SpatialUnitExtractionModel,
  LandUseExtractionModel,
  RequirementExtractionModel,
  ExtractionProvenance
} from './models/EntityModels.js';
import {
  getCombinedExtractionPrompt,
  getEntityExtractionSystemPrompt,
  ExtractionPromptContext
} from './prompts/entityExtractionPrompts.js';
import * as crypto from 'crypto';
import { sanitizeEntityId } from '../../../utils/entityIdSanitizer.js';
import { validateAndNormalizeUrl } from '../../../utils/urlValidator.js';
import { Cache } from '../../infrastructure/cache.js';

const jurisdictionPatterns = [
  /Gemeente\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  /Provincie\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  /Waterschap\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
];

export interface ExtractionOptions {
  includeProvenance?: boolean;
  validateEntities?: boolean;
  maxRetries?: number;
  timeout?: number;
}

/**
 * LLM-based Entity Extractor
 * 
 * Extracts entities from canonical documents using LLM with structured output.
 */
export class EntityExtractor implements IExtractor<BaseEntity> {
  private llmService: LLMService;
  private validator: EntitySchemaValidator;
  private cache: Cache<EntityExtractionResult>;
  private maxRetries: number = 2;
  private timeout: number = 30000; // 30 seconds

  // Cost tracking (OpenAI pricing as of 2024)
  private readonly COST_PER_1K_PROMPT_TOKENS = 0.01; // gpt-4o-mini pricing
  private readonly COST_PER_1K_COMPLETION_TOKENS = 0.03;

  constructor(llmService?: LLMService) {
    this.llmService = llmService || new LLMService();
    this.validator = new EntitySchemaValidator();
    // Initialize cache with 1000 items and 24h TTL
    this.cache = new Cache<EntityExtractionResult>(1000, 24 * 60 * 60 * 1000, 'entity-extraction');
  }

  /**
   * Extract entities from a document using LLM
   * 
   * @param document - Canonical document to extract entities from
   * @returns Array of extracted entities
   */
  async extract(document: CanonicalDocument): Promise<BaseEntity[]> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[EntityExtractor] Extracting entities from document using LLM'
    );

    try {
      // Extract parsing fields
      const parsingFields = DocumentMapper.extractParsingFields(document);
      const documentUrl = document.canonicalUrl || document.sourceId || parsingFields.normalizedUrl;

      // Extract entities
      const extractionResult = await this.extractEntitiesInternal(
        document.title,
        document.fullText || '',
        documentUrl,
        {
          includeProvenance: true,
          validateEntities: true,
          maxRetries: this.maxRetries,
          timeout: this.timeout,
        }
      );

      // Get all entities as a flat array
      const entities = this.getAllEntities(extractionResult);

      logger.info(
        {
          sourceId: document.sourceId,
          entityCount: entities.length,
          extractionTime: extractionResult.metadata.extractionTime,
        },
        '[EntityExtractor] Extracted entities from document using LLM'
      );

      return entities;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sourceId: document.sourceId,
        },
        '[EntityExtractor] Failed to extract entities using LLM'
      );
      
      // Return empty array on error (caller can fall back to rule-based extraction)
      return [];
    }
  }

  /**
   * Internal method to extract structured entities
   */
  private async extractEntitiesInternal(
    documentTitle: string,
    documentContent: string,
    documentUrl: string,
    options: ExtractionOptions = {}
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    const {
      includeProvenance = true,
      validateEntities = true,
      maxRetries = this.maxRetries,
      timeout = this.timeout
    } = options;

    // Generate cache key
    const cacheKey = crypto.createHash('md5')
      .update(documentTitle || '')
      .update(documentContent || '')
      .update(documentUrl || '')
      .update(String(includeProvenance))
      .update(String(validateEntities))
      .digest('hex');

    // Check cache
    const cachedResult = await this.cache.get(cacheKey);
    if (cachedResult) {
      const extractionTime = Date.now() - startTime;

      // Clone result to prevent cache poisoning
      const clonedResult = globalThis.structuredClone
        ? globalThis.structuredClone(cachedResult)
        : JSON.parse(JSON.stringify(cachedResult));

      clonedResult.metadata.extractionTime = extractionTime;
      // Set cost to zero for cached results as no LLM call was made
      if (clonedResult.metadata.cost) {
        clonedResult.metadata.cost = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0
        };
      }
      return clonedResult;
    }

    // Extract jurisdiction from document title or content
    const jurisdiction = this.extractJurisdiction(documentTitle, documentContent);

    const context: ExtractionPromptContext = {
      documentTitle,
      documentContent,
      documentUrl,
      jurisdiction,
      documentType: this.inferDocumentType(documentTitle, documentContent)
    };

    let lastError: Error | null = null;
    let extractionResult: EntityExtractionResult | null = null;

    // Retry logic
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        extractionResult = await this.performExtraction(context, includeProvenance, validateEntities, timeout);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[EntityExtractor] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}`);

        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    if (!extractionResult) {
      throw lastError || new Error('Entity extraction failed after all retries');
    }

    const extractionTime = Date.now() - startTime;
    extractionResult.metadata.extractionTime = extractionTime;

    // Cache the result
    await this.cache.set(cacheKey, extractionResult);

    return extractionResult;
  }

  /**
   * Perform the actual LLM extraction
   */
  private async performExtraction(
    context: ExtractionPromptContext,
    includeProvenance: boolean,
    validateEntities: boolean,
    timeout: number
  ): Promise<EntityExtractionResult> {
    const systemPrompt = getEntityExtractionSystemPrompt();
    const userPrompt = getCombinedExtractionPrompt(context);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Call LLM with timeout
    const llmPromise = this.llmService.generate(messages);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Extraction timeout')), timeout);
    });

    const response = await Promise.race([llmPromise, timeoutPromise]);

    // Parse JSON response
    let parsedResult: ParsedLLMExtractionResponse;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response.content;
      parsedResult = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error({ content: response.content, error: parseError }, '[EntityExtractor] Failed to parse LLM response');
      throw new Error(`Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Transform to extraction result
    const result = this.transformToExtractionResult(
      parsedResult,
      context,
      includeProvenance,
      validateEntities
    );

    // Add cost tracking
    if (response.usage) {
      const estimatedCost = this.calculateCost(
        response.usage.promptTokens,
        response.usage.completionTokens
      );
      result.metadata.cost = {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCost
      };
    }

    return result;
  }

  /**
   * Transform parsed LLM response to extraction result
   */
  private transformToExtractionResult(
    parsed: ParsedLLMExtractionResponse,
    context: ExtractionPromptContext,
    includeProvenance: boolean,
    validateEntities: boolean
  ): EntityExtractionResult {
    const provenance: ExtractionProvenance | undefined = includeProvenance ? {
      sourceUrl: context.documentUrl,
      documentId: this.generateDocumentId(context.documentUrl),
      extractionTimestamp: new Date().toISOString(),
      extractionMethod: 'llm',
      confidence: 0.8 // Default confidence, could be improved with LLM confidence scores
    } : undefined;

    const policyDocuments: PolicyDocumentExtractionModel[] = (parsed.policyDocuments || []).map((doc: NonNullable<ParsedLLMExtractionResponse['policyDocuments']>[number]) => {
      const validDocumentTypes = ['Structure', 'Vision', 'Ordinance', 'Note'] as const;
      const validStatuses = ['Draft', 'Active', 'Archived'] as const;
      const documentType = (doc.documentType && validDocumentTypes.includes(doc.documentType as typeof validDocumentTypes[number]))
        ? (doc.documentType as typeof validDocumentTypes[number])
        : 'Note';
      const status = (doc.status && validStatuses.includes(doc.status as typeof validStatuses[number]))
        ? (doc.status as typeof validStatuses[number])
        : 'Active';

      const entityId = doc.id
        ? sanitizeEntityId(doc.id, { prefix: 'doc', maxLength: 200 })
        : this.generateEntityId('doc', doc.name || context.documentTitle || '');

      const normalizedUrl = validateAndNormalizeUrl(doc.url || context.documentUrl, {
        defaultProtocol: 'https',
        removeTrailingSlash: true
      });

      const entity: PolicyDocumentExtractionModel = {
        id: entityId,
        type: 'PolicyDocument',
        name: doc.name || context.documentTitle || '',
        documentType,
        jurisdiction: (doc.jurisdiction || context.jurisdiction || 'Unknown') as string,
        date: doc.date || new Date().toISOString().split('T')[0],
        status,
        url: normalizedUrl,
        description: doc.description,
        provenance: includeProvenance ? provenance : undefined
      };

      if (validateEntities) {
        const validation = this.validator.validate(entity);
        if (!validation.isValid) {
          logger.warn(`[EntityExtractor] Invalid PolicyDocument: ${validation.errors.map(e => e.message).join(', ')}`);
          entity.metadata = { ...entity.metadata, validationErrors: validation.errors };
        }
      }

      return entity;
    });

    const regulations: RegulationExtractionModel[] = (parsed.regulations || []).map((reg: NonNullable<ParsedLLMExtractionResponse['regulations']>[number]) => {
      const validCategories = ['Zoning', 'Environmental', 'Building', 'Procedural'] as const;
      const category = (reg.category && validCategories.includes(reg.category as typeof validCategories[number]))
        ? (reg.category as typeof validCategories[number])
        : 'Zoning';

      const entityId = reg.id
        ? sanitizeEntityId(reg.id, { prefix: 'reg', maxLength: 200 })
        : this.generateEntityId('reg', reg.name || 'Unknown');

      const entity: RegulationExtractionModel = {
        id: entityId,
        type: 'Regulation',
        name: (reg.name || '') as string,
        category,
        description: reg.description,
        legalReferences: reg.legalReferences || [],
        provenance: includeProvenance ? provenance : undefined
      };

      if (validateEntities) {
        const validation = this.validator.validate(entity);
        if (!validation.isValid) {
          logger.warn(`[EntityExtractor] Invalid Regulation: ${validation.errors.map(e => e.message).join(', ')}`);
          entity.metadata = { ...entity.metadata, validationErrors: validation.errors };
        }
      }

      return entity;
    });

    const spatialUnits: SpatialUnitExtractionModel[] = (parsed.spatialUnits || []).map((spatial: NonNullable<ParsedLLMExtractionResponse['spatialUnits']>[number]) => {
      const validSpatialTypes = ['Parcel', 'Building', 'Street', 'Neighborhood', 'ZoningArea'] as const;
      const spatialType = (spatial.spatialType && validSpatialTypes.includes(spatial.spatialType as typeof validSpatialTypes[number]))
        ? (spatial.spatialType as typeof validSpatialTypes[number])
        : 'ZoningArea';

      const entityId = spatial.id
        ? sanitizeEntityId(spatial.id, { prefix: 'spatial', maxLength: 200 })
        : this.generateEntityId('spatial', spatial.name || 'Unknown');

      const entity: SpatialUnitExtractionModel = {
        id: entityId,
        type: 'SpatialUnit',
        name: (spatial.name || '') as string,
        spatialType,
        description: spatial.description,
        provenance: includeProvenance ? provenance : undefined
      };

      if (validateEntities) {
        const validation = this.validator.validate(entity);
        if (!validation.isValid) {
          logger.warn(`[EntityExtractor] Invalid SpatialUnit: ${validation.errors.map(e => e.message).join(', ')}`);
          entity.metadata = { ...entity.metadata, validationErrors: validation.errors };
        }
      }

      return entity;
    });

    const landUses: LandUseExtractionModel[] = (parsed.landUses || []).map((landUse: NonNullable<ParsedLLMExtractionResponse['landUses']>[number]) => {
      const entityId = landUse.id
        ? sanitizeEntityId(landUse.id, { prefix: 'landuse', maxLength: 200 })
        : this.generateEntityId('landuse', landUse.name || 'Unknown');

      const entity: LandUseExtractionModel = {
        id: entityId,
        type: 'LandUse',
        name: (landUse.name || '') as string,
        category: (landUse.category || '') as string,
        provenance: includeProvenance ? provenance : undefined
      };

      if (validateEntities) {
        const validation = this.validator.validate(entity);
        if (!validation.isValid) {
          logger.warn(`[EntityExtractor] Invalid LandUse: ${validation.errors.map(e => e.message).join(', ')}`);
          entity.metadata = { ...entity.metadata, validationErrors: validation.errors };
        }
      }

      return entity;
    });

    const requirements: RequirementExtractionModel[] = (parsed.requirements || []).map((req: NonNullable<ParsedLLMExtractionResponse['requirements']>[number]) => {
      const validOperators = ['=', '>=', '>', '<', '<=', 'between'] as const;
      const operator = (req.operator && validOperators.includes(req.operator as typeof validOperators[number]))
        ? (req.operator as typeof validOperators[number])
        : '=';

      const entityId = req.id
        ? sanitizeEntityId(req.id, { prefix: 'req', maxLength: 200 })
        : this.generateEntityId('req', req.name || 'Unknown');

      // Convert value to string or number as required by Requirement type
      let value: string | number = '';
      if (req.value !== undefined && req.value !== null) {
        if (typeof req.value === 'string' || typeof req.value === 'number') {
          value = req.value;
        } else {
          value = String(req.value);
        }
      }

      const entity: RequirementExtractionModel = {
        id: entityId,
        type: 'Requirement',
        name: (req.name || '') as string,
        metric: (req.metric || '') as string,
        operator,
        value,
        unit: req.unit,
        provenance: includeProvenance ? provenance : undefined
      };

      if (validateEntities) {
        const validation = this.validator.validate(entity);
        if (!validation.isValid) {
          logger.warn(`[EntityExtractor] Invalid Requirement: ${validation.errors.map(e => e.message).join(', ')}`);
          entity.metadata = { ...entity.metadata, validationErrors: validation.errors };
        }
      }

      return entity;
    });

    const totalEntities = policyDocuments.length + regulations.length +
                         spatialUnits.length + landUses.length + requirements.length;

    return {
      policyDocuments,
      regulations,
      spatialUnits,
      landUses,
      requirements,
      metadata: {
        extractionTime: 0, // Will be set by caller
        totalEntities,
        confidence: 0.8 // Default, could be improved
      }
    };
  }

  /**
   * Get all extracted entities as a flat array
   */
  private getAllEntities(result: EntityExtractionResult): BaseEntity[] {
    return [
      ...result.policyDocuments,
      ...result.regulations,
      ...result.spatialUnits,
      ...result.landUses,
      ...result.requirements
    ];
  }

  private generateEntityId(prefix: string, name: string): string {
    const rawId = `${prefix}-${name}`;
    return sanitizeEntityId(rawId, {
      maxLength: 200,
      ensureUniqueness: true,
    });
  }

  private generateDocumentId(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
    return `doc-${hash}`;
  }

  private extractJurisdiction(title: string, content: string): string | undefined {
    const text = title + ' ' + content;
    for (const pattern of jurisdictionPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return undefined;
  }

  private inferDocumentType(title: string, content: string): string | undefined {
    const text = `${title} ${content}`.toLowerCase();
    if (text.includes('omgevingsvisie') || text.includes('visie')) return 'Vision';
    if (text.includes('bestemmingsplan')) return 'Structure';
    if (text.includes('verordening') || text.includes('regeling')) return 'Ordinance';
    return undefined;
  }

  private calculateCost(promptTokens: number, completionTokens: number): number {
    const promptCost = (promptTokens / 1000) * this.COST_PER_1K_PROMPT_TOKENS;
    const completionCost = (completionTokens / 1000) * this.COST_PER_1K_COMPLETION_TOKENS;
    return promptCost + completionCost;
  }
}
