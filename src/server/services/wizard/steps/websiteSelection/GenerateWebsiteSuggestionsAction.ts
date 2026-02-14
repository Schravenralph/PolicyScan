/**
 * GenerateWebsiteSuggestionsAction - Wizard step action for generating website suggestions
 * 
 * This action handles the `website-selection` wizard step by:
 * - Validating that queryId is provided
 * - Fetching the query from the database
 * - Generating AI-powered website suggestions using WebsiteSuggestionService
 * - Caching results by queryId + prompt hash for idempotency
 * - Returning suggested websites in the expected format
 * 
 * The action is idempotent: if suggestions already exist in cache for the same queryId + prompt,
 * it will return the cached results instead of regenerating.
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import { getDB } from '../../../../config/database.js';
import { Query } from '../../../../models/Query.js';
import { WebsiteSuggestionService, type WebsiteSuggestionParams, type WebsiteSuggestion } from '../../../website-suggestion/WebsiteSuggestionService.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import { logger } from '../../../../utils/logger.js';
import { isE2EFixturesEnabled } from '../../../../config/featureFlags.js';
import { Cache } from '../../../infrastructure/cache.js';
import { NotFoundError, BadRequestError } from '../../../../types/errors.js';

// Import schema from single source of truth
import { generateWebsiteSuggestionsInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for GenerateWebsiteSuggestionsAction (re-exported from single source of truth)
 * @deprecated Use generateWebsiteSuggestionsInputSchema from definitions/schemas.ts instead
 */
export const generateWebsiteSuggestionsInputSchema = schemaFromDefinition;

/**
 * Input type for GenerateWebsiteSuggestionsAction
 */
export type GenerateWebsiteSuggestionsInput = z.infer<typeof generateWebsiteSuggestionsInputSchema>;

/**
 * Suggested website structure
 */
export interface SuggestedWebsite {
  id: string;
  url: string;
  label?: string;
  confidence?: number;
  source?: string;
  samenvatting?: string; // Summary from ChatGPT
  relevantie?: string; // Relevance explanation from ChatGPT
  website_types?: string[]; // Website types from ChatGPT
}

/**
 * Output type for GenerateWebsiteSuggestionsAction
 */
export interface GenerateWebsiteSuggestionsOutput {
  suggestedWebsites: SuggestedWebsite[];
  generatedAt: string;
  contextUpdates: {
    suggestedWebsites?: SuggestedWebsite[];
    websiteSuggestionsGeneratedAt?: string;
  };
}

/**
 * Cache entry for website suggestions
 */
interface CacheEntry {
  suggestedWebsites: SuggestedWebsite[];
  generatedAt: string;
  promptHash: string;
}

/**
 * Distributed cache for website suggestions using Redis (with in-memory fallback)
 * Key: queryId, Value: CacheEntry
 * 
 * Uses Redis for distributed caching across instances, falls back to in-memory
 * if Redis is unavailable. TTL: 24 hours (suggestions are expensive to generate)
 */
const suggestionCache = new Cache<CacheEntry>(
  1000, // Max 1000 cached suggestions
  24 * 60 * 60 * 1000, // 24 hour TTL
  'website-suggestions' // Cache name for Redis key prefix
);

/**
 * GenerateWebsiteSuggestionsAction - Generates AI-powered website suggestions for a query
 * 
 * This action implements the `generateSuggestions` action for the `website-selection` step.
 * It uses the WebsiteSuggestionService to generate suggestions and caches results for idempotency.
 */
export class GenerateWebsiteSuggestionsAction implements WizardStepAction<GenerateWebsiteSuggestionsInput, GenerateWebsiteSuggestionsOutput> {
  readonly stepId = 'website-selection';
  readonly actionId = 'generateSuggestions';
  
  /**
   * Get or create the suggestion service (lazy initialization)
   * This allows the action to be instantiated without requiring database connection
   */
  private getSuggestionService(): WebsiteSuggestionService {
    const db = getDB();
    return new WebsiteSuggestionService(db);
  }

  /**
   * Execute the generateSuggestions action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Fetches the query from the database
   * 3. Generates a prompt hash for caching (queryId + query parameters)
   * 4. Checks cache for existing suggestions (idempotency)
   * 5. Generates suggestions using WebsiteSuggestionService if not cached
   * 6. Caches and returns the suggestions
   * 
   * @param session - The current wizard session
   * @param input - The action input (queryId)
   * @returns Promise resolving to the action output (suggestedWebsites, generatedAt, contextUpdates)
   * @throws Error if validation fails, query not found, or suggestion generation fails
   */
  async execute(
    session: WizardSessionDocument,
    input: GenerateWebsiteSuggestionsInput
  ): Promise<GenerateWebsiteSuggestionsOutput> {
    // Validate input using schema
    const validatedInput = generateWebsiteSuggestionsInputSchema.parse(input);

    // Fetch the query
    const query = await Query.findById(validatedInput.queryId);
    if (!query) {
      throw new NotFoundError('Query', validatedInput.queryId, {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }

    // Generate prompt hash for caching (queryId + query parameters)
    // This ensures we cache by the actual query content, not just queryId
    const promptData = {
      queryId: validatedInput.queryId,
      onderwerp: query.onderwerp,
      overheidstype: query.overheidstype,
      overheidsinstantie: query.overheidsinstantie,
      websiteTypes: query.websiteTypes || [],
    };
    const promptHash = this.generatePromptHash(promptData);

    // Fixture mode for E2E tests - AUTOMATICALLY DISABLED in production
    if (isE2EFixturesEnabled()) {
      logger.error(
        { 
          queryId: validatedInput.queryId, 
          action: 'generateSuggestions',
          environment: process.env.ENVIRONMENT,
          nodeEnv: process.env.NODE_ENV,
          featureFlagValue: process.env.FEATURE_E2E_FIXTURES
        },
        '⚠️  CRITICAL: Fixture mode detected! This should NEVER happen in production. Returning fixture website suggestions instead of real API calls.'
      );

      // Import fixture suggestions dynamically to avoid circular dependencies
      // Use relative import path (consistent with other fixture imports in workflow actions)
      let fixtureSuggestions: WebsiteSuggestion[];
      try {
        const { createFixtureSuggestions } = await import('../../../../../../tests/e2e/fixtures/fixtureSuggestions.js');
        fixtureSuggestions = createFixtureSuggestions();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          { queryId: validatedInput.queryId, error: errorMessage },
          'Failed to load fixture suggestions - fixture file not found or import failed'
        );
        throw new BadRequestError(
          `Fixture mode enabled but fixture file not found. ` +
          `Original error: ${errorMessage}`,
          {
            sessionId: session.sessionId,
            stepId: this.stepId,
            actionId: this.actionId,
            queryId: validatedInput.queryId,
            originalError: errorMessage
          }
        );
      }

      // Map WebsiteSuggestion[] to SuggestedWebsite[]
      const suggestedWebsites: SuggestedWebsite[] = fixtureSuggestions.map((suggestion: WebsiteSuggestion, index: number) => ({
        id: `website-${validatedInput.queryId}-${index}`,
        url: suggestion.url,
        label: suggestion.titel,
        confidence: this.extractConfidence(suggestion),
        source: 'fixture',
      }));

      const generatedAt = new Date().toISOString();

      return {
        suggestedWebsites,
        generatedAt,
        contextUpdates: {
          suggestedWebsites,
          websiteSuggestionsGeneratedAt: generatedAt,
        },
      };
    }

    // Check cache for existing suggestions (idempotency)
    // Use queryId + promptHash as cache key to ensure cache invalidation when query changes
    const cacheKey = `${validatedInput.queryId}:${promptHash}`;
    const cached = await suggestionCache.get(cacheKey);
    if (cached && cached.promptHash === promptHash) {
      logger.info(
        { queryId: validatedInput.queryId, action: 'generateSuggestions' },
        'Returning cached website suggestions from distributed cache'
      );
      // Return cached suggestions
      return {
        suggestedWebsites: cached.suggestedWebsites,
        generatedAt: cached.generatedAt,
        contextUpdates: {
          suggestedWebsites: cached.suggestedWebsites,
          websiteSuggestionsGeneratedAt: cached.generatedAt,
        },
      };
    }

    // Generate suggestions using WebsiteSuggestionService
    const suggestionParams: WebsiteSuggestionParams = {
      onderwerp: query.onderwerp || '',
      overheidstype: query.overheidstype,
      overheidsinstantie: query.overheidsinstantie,
      websiteTypes: query.websiteTypes || [],
    };

    const suggestionService = this.getSuggestionService();
    const suggestions = await suggestionService.generateSuggestions(suggestionParams);

    // Map WebsiteSuggestion[] to SuggestedWebsite[]
    // Preserve all fields from ChatGPT JSON (titel, url, samenvatting, website_types, relevantie)
    const suggestedWebsites: SuggestedWebsite[] = suggestions.map((suggestion, index) => ({
      id: `website-${validatedInput.queryId}-${index}`,
      url: suggestion.url,
      label: suggestion.titel,
      confidence: this.extractConfidence(suggestion),
      source: 'ai-generated',
      samenvatting: suggestion.samenvatting, // Preserve summary from ChatGPT
      relevantie: suggestion.relevantie, // Preserve relevance explanation from ChatGPT
      website_types: suggestion.website_types, // Preserve website types from ChatGPT
    }));

    const generatedAt = new Date().toISOString();

    // Cache the results in distributed cache (Redis with in-memory fallback)
    const cacheEntry: CacheEntry = {
      suggestedWebsites,
      generatedAt,
      promptHash,
    };
    await suggestionCache.set(cacheKey, cacheEntry).catch((error) => {
      // Log but don't fail if caching fails
      logger.warn({ error, queryId: validatedInput.queryId }, 'Failed to cache website suggestions');
    });

    return {
      suggestedWebsites,
      generatedAt,
      contextUpdates: {
        suggestedWebsites,
        websiteSuggestionsGeneratedAt: generatedAt,
      },
    };
  }

  /**
   * Generate a hash for the prompt data
   * 
   * Used for caching: same query parameters = same hash = same cache key
   * 
   * @param promptData - The prompt data to hash
   * @returns SHA-256 hash of the prompt data
   */
  private generatePromptHash(promptData: {
    queryId: string;
    onderwerp: string;
    overheidstype?: string;
    overheidsinstantie?: string;
    websiteTypes: string[];
  }): string {
    const dataString = JSON.stringify(promptData);
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Extract confidence score from a website suggestion
   * 
   * If the suggestion has a relevance score or confidence metric, extract it.
   * Otherwise, return undefined.
   * 
   * @param suggestion - The website suggestion
   * @returns Confidence score (0-1) or undefined
   */
  private extractConfidence(_suggestion: WebsiteSuggestion): number | undefined {
    // WebsiteSuggestion doesn't have a confidence field, but we can infer from relevantie
    // For now, return undefined as confidence is optional
    // This can be enhanced later if WebsiteSuggestion includes confidence scores
    return undefined;
  }

  /**
   * Clear cache for a specific queryId (for testing/debugging)
   * 
   * @param queryId - The query ID to clear from cache
   */
  static clearCache(queryId: string): void {
    suggestionCache.delete(queryId);
  }

  /**
   * Clear all cache (for testing/debugging)
   */
  static clearAllCache(): void {
    suggestionCache.clear();
  }
}

