import { Db } from 'mongodb';
import { GoogleSearchService } from '../external/googleSearch.js';
import type { ScrapedDocument } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';
import { getEnv } from '../../config/env.js';
import { BadRequestError, ServiceUnavailableError, ExternalServiceError } from '../../types/errors.js';
import type { WebsiteSuggestionParams, WebsiteSuggestion } from './types.js';
export type { WebsiteSuggestionParams, WebsiteSuggestion };
import { ResponseParser } from './components/ResponseParser.js';
import { QualityFilter } from './components/QualityFilter.js';
import { SuggestionPrompts } from './components/SuggestionPrompts.js';
import { WebsiteDatabaseService } from './components/WebsiteDatabaseService.js';
import { MockSuggestionService } from './components/MockSuggestionService.js';
import { getGovernmentDomains } from './components/utils.js';
import {
  OpenAIClient,
  OpenAIWebSearchResult,
  OpenAIToolResult,
  ChatCompletionParams,
  APIKeysMissingError
} from './openaiTypes.js';

/**
 * Service for generating website suggestions using AI (OpenAI) or Google Search API
 * 
 * Architecture (Simplified):
 *   - Always performs Google Search first (deterministic, reliable)
 *   - Uses OpenAI to analyze search results and generate recommendations
 *   - Falls back to knowledge base if Google Search returns no results
 *   - Merges with database matches for comprehensive results
 */
export class WebsiteSuggestionService {
  private googleSearch: GoogleSearchService;
  private useOpenAI: boolean;
  private openaiApiKey: string | null;

  // Components
  private responseParser: ResponseParser;
  private qualityFilter: QualityFilter;
  private suggestionPrompts: SuggestionPrompts;
  private databaseService: WebsiteDatabaseService;
  private mockService: MockSuggestionService;

  constructor(private db: Db) {
    this.googleSearch = new GoogleSearchService();

    // Initialize components
    this.responseParser = new ResponseParser();
    this.qualityFilter = new QualityFilter();
    this.suggestionPrompts = new SuggestionPrompts();
    this.databaseService = new WebsiteDatabaseService(db);
    this.mockService = new MockSuggestionService();

    // Determine which service to use based on environment
    const env = getEnv();
    const environment = env.ENVIRONMENT;

    if (environment !== 'production' && environment !== 'preproduction') {
      throw new BadRequestError(`Invalid ENVIRONMENT value: "${environment}". Must be "production" or "preproduction"`, {
        reason: 'invalid_environment',
        environment,
        operation: 'constructor'
      });
    }

    this.useOpenAI = environment === 'production';
    this.openaiApiKey = env.OPENAI_API_KEY || null;

    if (this.useOpenAI && !this.openaiApiKey) {
      throw new ServiceUnavailableError('OPENAI_API_KEY is required when ENVIRONMENT=production', {
        reason: 'missing_openai_api_key',
        environment,
        operation: 'constructor'
      });
    }

    if (!this.useOpenAI && !this.openaiApiKey) {
      logger.warn(
        { environment },
        'OPENAI_API_KEY not set. ChatGPT knowledge base fallback will not be available. For E2E tests, set OPENAI_API_KEY to use real API calls with gpt-4o-mini (cost-effective). Without API key, tests will fall back to mock suggestions.'
      );
    } else if (!this.useOpenAI && this.openaiApiKey) {
      if (!this.openaiApiKey.startsWith('sk-')) {
        logger.warn(
          { environment },
          'OPENAI_API_KEY does not appear to be valid (should start with "sk-"). API calls may fail. Check your API key configuration.'
        );
      } else {
        logger.info({ environment }, 'OPENAI_API_KEY configured - ChatGPT knowledge base will be available for fallback');
      }
    }

    if (!this.useOpenAI && !this.googleSearch.isConfigured()) {
      logger.warn(
        { environment },
        'Google Custom Search API not configured. Website suggestions will be limited to database matches only. To enable Google Search, set GOOGLE_CUSTOM_SEARCH_JSON_API_KEY and GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID in your .env file'
      );
    }

    const modeDescription = this.useOpenAI
      ? 'OpenAI Responses API with built-in web_search (ENVIRONMENT=production: o4-mini-deep-research)'
      : this.googleSearch.isConfigured()
        ? 'Google Custom Search API + gpt-4o-mini (ENVIRONMENT=preproduction)'
        : 'Database matches only (ENVIRONMENT=preproduction, Google API not configured)';
    logger.info({ environment, mode: modeDescription }, 'WebsiteSuggestionService initialized');
  }

  /**
   * Generate website suggestions for a query
   */
  async generateSuggestions(params: WebsiteSuggestionParams): Promise<WebsiteSuggestion[]> {
    // Fixture mode for E2E tests - AUTOMATICALLY DISABLED in production
    const { isE2EFixturesEnabled } = await import('../../config/featureFlags.js');
    if (isE2EFixturesEnabled()) {
      logger.error(
        { 
          onderwerp: params.onderwerp, 
          action: 'generateSuggestions',
          environment: process.env.ENVIRONMENT,
          nodeEnv: process.env.NODE_ENV,
          featureFlagValue: process.env.FEATURE_E2E_FIXTURES
        },
        '⚠️  CRITICAL: Fixture mode detected! This should NEVER happen in production. Using fixture website suggestions instead of real API calls.'
      );

      try {
        // Use relative import path (consistent with other fixture imports in workflow actions)
        // @ts-expect-error - Dynamic import of test fixture file (not in TypeScript compilation)
        const { createFixtureSuggestions } = await import('../../../../../../tests/e2e/fixtures/fixtureSuggestions.js');
        return createFixtureSuggestions(5);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          { onderwerp: params.onderwerp, error: errorMessage },
          'Failed to load fixture suggestions - fixture file not found or import failed'
        );
        throw new ServiceUnavailableError(
          `Fixture mode enabled but fixture file not found. Original error: ${errorMessage}`,
          {
            reason: 'fixture_file_not_found',
            operation: 'suggestWebsites',
            onderwerp: params.onderwerp,
            originalError: errorMessage
          }
        );
      }
    }

    const municipalitySuggestion = await this.databaseService.getMunicipalityWebsiteSuggestion(params);
    const initialSuggestions: WebsiteSuggestion[] = municipalitySuggestion ? [municipalitySuggestion] : [];

    let aiSuggestions: WebsiteSuggestion[] = [];
    try {
      if (this.useOpenAI) {
        logger.info({ onderwerp: params.onderwerp }, 'Generating website suggestions using OpenAI');
        aiSuggestions = await this.generateWithOpenAI(params);
        logger.info({ count: aiSuggestions.length }, 'OpenAI generated website suggestions');
        
        if (aiSuggestions.length === 0) {
          logger.warn({ onderwerp: params.onderwerp }, 'OpenAI returned 0 suggestions');
        }
      } else {
        logger.info({ onderwerp: params.onderwerp }, 'Generating website suggestions using Google Search');
        aiSuggestions = await this.generateWithGoogle(params);
        logger.info({ count: aiSuggestions.length }, 'Google Search generated website suggestions');
        
        if (aiSuggestions.length === 0) {
          logger.warn({ onderwerp: params.onderwerp }, 'Google Search returned 0 suggestions');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof Error && 'code' in error ? error.code : undefined;
      
      // Log detailed error information for diagnostics
      logger.error(
        { 
          error: errorMessage, 
          errorCode,
          onderwerp: params.onderwerp,
          useOpenAI: this.useOpenAI,
          hasOpenAIKey: !!this.openaiApiKey,
          googleSearchConfigured: this.googleSearch.isConfigured(),
          errorStack: error instanceof Error ? error.stack : undefined
        },
        'Failed to generate AI website suggestions - attempting fallback to database matches'
      );
      
      // Try database matches as fallback before giving up
      try {
        const dbMatches = await this.databaseService.findDatabaseMatches(params);
        if (dbMatches.length > 0) {
          logger.info(
            { count: dbMatches.length, onderwerp: params.onderwerp },
            'Using database matches as fallback after API failure'
          );
          aiSuggestions = dbMatches;
        } else {
          // Try knowledge base as additional fallback if OpenAI key is available
          if (this.openaiApiKey && this.useOpenAI) {
            try {
              const OpenAI = await import('openai');
              const openai = new OpenAI.default({
                apiKey: this.openaiApiKey!
              }) as unknown as OpenAIClient;
              const model = process.env.OPENAI_WEBSITE_SUGGESTION_MODEL || 'gpt-4o-mini';
              const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
              if (knowledgeSuggestions.length > 0) {
                logger.info(
                  { count: knowledgeSuggestions.length, onderwerp: params.onderwerp },
                  'Using knowledge base suggestions as fallback after database search failed'
                );
                aiSuggestions = knowledgeSuggestions;
              } else {
                logger.warn(
                  { onderwerp: params.onderwerp },
                  'No database matches or knowledge base suggestions found - will return municipality website only'
                );
              }
            } catch (kbError) {
              logger.warn(
                { error: kbError instanceof Error ? kbError.message : String(kbError), onderwerp: params.onderwerp },
                'Knowledge base fallback failed - will return municipality website only'
              );
            }
          } else {
            logger.warn(
              { onderwerp: params.onderwerp },
              'No database matches found - will return municipality website only'
            );
          }
        }
      } catch (dbError) {
        logger.error(
          { error: dbError instanceof Error ? dbError.message : String(dbError), onderwerp: params.onderwerp },
          'Database fallback also failed - will return municipality website only'
        );
      }
    }

    const suggestions = [...initialSuggestions];
    const seenUrls = new Set(initialSuggestions.map(s => s.url.toLowerCase()));
    
    for (const aiSuggestion of aiSuggestions) {
      if (!seenUrls.has(aiSuggestion.url.toLowerCase())) {
        suggestions.push(aiSuggestion);
        seenUrls.add(aiSuggestion.url.toLowerCase());
      }
    }

    return suggestions;
  }

  /**
   * Generate suggestions using OpenAI with Google Search
   */
  private async generateWithOpenAI(params: WebsiteSuggestionParams): Promise<WebsiteSuggestion[]> {
    const OpenAI = await import('openai');
    const openai = new OpenAI.default({
      apiKey: this.openaiApiKey!
    }) as unknown as OpenAIClient;

    const defaultModel = process.env.OPENAI_WEBSITE_SUGGESTION_MODEL || 'gpt-4o-mini';
    const model = defaultModel;

    const useResponsesAPI = model.includes('deep-research') || model.includes('o1') || model.includes('o3');
    
    if (useResponsesAPI) {
      logger.info({ model }, 'Using OpenAI Responses API with built-in web_search');
      return this.generateWithResponsesAPI(openai, model, params);
    }

    logger.info({ model }, 'Using OpenAI with simplified Google Search mode');

    // Step 1: Always do Google Search first
    const searchQuery = this.buildGoogleSearchQuery(params);
    logger.info({ searchQuery }, 'Executing Google Search');

    let results: ScrapedDocument[] = [];
    try {
      results = await this.googleSearch.search(searchQuery, {
        numResults: 20,
        siteRestrict: getGovernmentDomains(params.websiteTypes)
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Google Search failed, using fallback');
    }

    // Step 2: If no Google Search results, try ChatGPT with designed prompts FIRST
    if (results.length === 0) {
      logger.warn({ onderwerp: params.onderwerp }, 'Google Search returned 0 results, trying ChatGPT with designed prompts');
      
      // PRIORITY 1: Use ChatGPT with knowledge base prompt (designed prompts)
      if (this.openaiApiKey) {
        try {
          logger.info({ model, onderwerp: params.onderwerp }, 'Using ChatGPT with buildKnowledgeBasePrompt');
          const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
          if (knowledgeSuggestions.length > 0) {
            logger.info(
              { count: knowledgeSuggestions.length, onderwerp: params.onderwerp },
              'ChatGPT generated website suggestions using designed prompts'
            );
            return knowledgeSuggestions;
          } else {
            logger.warn(
              { onderwerp: params.onderwerp },
              'ChatGPT returned 0 suggestions, trying database matches'
            );
          }
        } catch (kbError) {
          logger.warn(
            { error: kbError instanceof Error ? kbError.message : String(kbError), onderwerp: params.onderwerp },
            'ChatGPT knowledge base prompt failed, trying database matches'
          );
        }
      }
      
      // PRIORITY 2: Try database matches as fallback (only if ChatGPT fails or returns nothing)
      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      if (dbMatches.length > 0) {
        logger.info(
          { count: dbMatches.length, onderwerp: params.onderwerp },
          'Using database matches as fallback after ChatGPT returned no results'
        );
        return dbMatches;
      }

      // If all fallbacks fail, return empty array (municipality website will still be included by caller)
      logger.warn(
        { onderwerp: params.onderwerp },
        'All fallbacks exhausted - no non-municipality websites found'
      );
      return [];
    }

    // Step 3: Use OpenAI to analyze Google Search results
    const analysisPrompt = this.suggestionPrompts.buildGoogleResultsAnalysisPrompt(params, results);
    const systemPrompt = 'You are a Dutch policy expert. Analyze Google Search results and recommend ALL relevant government websites. Provide detailed explanations for each recommendation.';

    try {
      const analysisResponse = await this.callOpenAIWithRetry(
        openai,
        {
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        }
      );

      const analysisContent = analysisResponse.choices[0]?.message?.content || '';

      if (!analysisContent) {
        throw new ExternalServiceError('OpenAI', 'OpenAI returned empty analysis content', {
          reason: 'empty_analysis_content',
          operation: 'suggestWebsites',
          onderwerp: params.onderwerp,
          model: analysisResponse.model
        });
      }

      const websites = this.responseParser.parseOpenAIRecommendationsFromJSON(analysisContent, params.websiteTypes);

      if (websites.length === 0) {
        logger.warn('OpenAI analysis returned no websites, using fallback');
        const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
        if (knowledgeSuggestions.length > 0) return knowledgeSuggestions;
        throw new ExternalServiceError('OpenAI', 'Failed to generate website recommendations', {
          reason: 'recommendation_generation_failed',
          operation: 'generateSuggestions'
        });
      }

      // Step 4: Enrich with database matches
      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);

      // Step 5: Apply quality filter
      allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);

      // Step 6: Limit to reasonable maximum
      const maxResults = 100;
      if (allWebsites.length > maxResults) {
        allWebsites = allWebsites.slice(0, maxResults);
      }

      return allWebsites;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to analyze Google Search results with OpenAI');
      
      // Fallback: return Google Search results directly
      const websites: WebsiteSuggestion[] = results.map(result => ({
        titel: result.titel || 'Unknown',
        url: result.url,
        samenvatting: result.samenvatting || 'Found via Google Search',
        website_types: params.websiteTypes,
        relevantie: 'Found via Google Search (AI analysis failed)'
      }));

      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
      allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);

      return allWebsites;
    }
  }

  /**
   * Generate suggestions using OpenAI Responses API
   */
  private async generateWithResponsesAPI(
    openai: OpenAIClient,
    model: string,
    params: WebsiteSuggestionParams
  ): Promise<WebsiteSuggestion[]> {
    try {
      const researchPrompt = this.suggestionPrompts.buildWebSearchPrompt(params);
      const governmentDomains = getGovernmentDomains(params.websiteTypes);

      const response = await openai.responses.create({
        model: model,
        input: researchPrompt,
        tools: [
          {
            type: 'web_search',
            filters: governmentDomains.length > 0 ? {
              domains: governmentDomains.slice(0, 100).map(domain =>
                domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
              )
            } : undefined
          }
        ],
        include: ['web_search_call.action.sources']
      });

      let websites: WebsiteSuggestion[] = [];
      const outputItems = Array.isArray(response) ? response : (response.output_items || [response]);

      for (const item of outputItems) {
        if (item.type === 'message' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && contentItem.text) {
              const textRecommendations = this.responseParser.parseOpenAIRecommendations(
                contentItem.text,
                params.websiteTypes
              );
              websites.push(...textRecommendations);

              if (contentItem.annotations) {
                for (const annotation of contentItem.annotations) {
                  if (annotation.type === 'url_citation') {
                    const existingIndex = websites.findIndex(w => w.url === annotation.url);
                    if (existingIndex === -1) {
                      websites.push({
                        titel: annotation.title || this.responseParser.extractTitleFromUrl(annotation.url),
                        url: annotation.url,
                        samenvatting: `Found via ${model} web search`,
                        website_types: params.websiteTypes,
                        relevantie: 'High - cited in research results'
                      });
                    }
                  }
                }
              }
            }
          }
        }

        if (item.type === 'web_search_call' && item.action?.sources) {
          for (const source of item.action.sources) {
            const existingIndex = websites.findIndex(w => w.url === source.url);
            if (existingIndex === -1) {
              websites.push({
                titel: source.title || this.responseParser.extractTitleFromUrl(source.url),
                url: source.url,
                samenvatting: source.snippet || `Found via ${model} web search`,
                website_types: params.websiteTypes,
                relevantie: 'High - found in web search results'
              });
            }
          }
        }
      }

      // Fallback parsing
      if (websites.length === 0) {
        for (const item of outputItems) {
          if (item.type === 'message' && item.content) {
            for (const contentItem of item.content) {
              if (contentItem.type === 'output_text' && contentItem.text) {
                const textRecommendations = this.responseParser.parseOpenAIRecommendations(
                  contentItem.text,
                  params.websiteTypes
                );
                websites.push(...textRecommendations);
              }
            }
          }
        }
      }

      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      websites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
      websites = this.qualityFilter.filterByQuality(websites, params);

      const maxResults = 100;
      if (websites.length > maxResults) {
        websites = websites.slice(0, maxResults);
      }

      return websites;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, onderwerp: params.onderwerp },
        'Error generating suggestions with OpenAI Responses API, falling back to function calling'
      );
      return this.generateWithFunctionCalling(openai, 'gpt-4o-mini', params);
    }
  }

  /**
   * @deprecated Fallback for non-deep-research models
   */
  private async generateWithFunctionCalling(
    openai: OpenAIClient,
    model: string,
    params: WebsiteSuggestionParams
  ): Promise<WebsiteSuggestion[]> {

    try {
      const webSearchFunction = {
        name: 'web_search',
        description: 'Search the web for Dutch government websites.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            site_restrictions: { type: 'array', items: { type: 'string' } },
            num_results: { type: 'number' }
          },
          required: ['query']
        }
      };

      const researchPrompt = this.suggestionPrompts.buildWebSearchPrompt(params);
      const systemPrompt = 'You are a Dutch policy research expert. Use the web_search function to find ALL relevant government websites.';

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: researchPrompt }
        ],
        tools: [{ type: 'function', function: webSearchFunction }],
        tool_choice: { type: 'function', function: { name: 'web_search' } },
        temperature: 0.7,
        max_tokens: 2000
      });

      const message = response.choices[0]?.message;
      let websites: WebsiteSuggestion[] = [];

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolResults: OpenAIToolResult[] = [];
        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function' || toolCall.function.name !== 'web_search') continue;

          const args = JSON.parse(toolCall.function.arguments);
          const searchQuery = args.query;
          const siteRestrict = args.site_restrictions || getGovernmentDomains(params.websiteTypes);
          const numResults = Math.min(args.num_results || 20, 50);

          const searchResults = await this.googleSearch.search(searchQuery, {
            siteRestrict: siteRestrict,
            numResults: numResults
          });

          if (searchResults.length === 0) {
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: 'web_search',
              content: JSON.stringify({
                query: searchQuery,
                results: [],
                total_results: 0,
                note: 'No results found.'
              })
            });
          } else {
            const formattedResults: OpenAIWebSearchResult[] = searchResults.map((doc, idx) => ({
              rank: idx + 1,
              title: doc.titel,
              url: doc.url,
              website_url: doc.website_url,
              website_title: doc.website_titel,
              snippet: doc.samenvatting,
              document_type: doc.type_document
            }));

            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: 'web_search',
              content: JSON.stringify({
                query: searchQuery,
                results: formattedResults,
                total_results: formattedResults.length
              })
            });
          }
        }

        const analysisSystemPrompt = 'You are a Dutch policy expert. Analyze ALL web search results and recommend ALL relevant government websites.';
        const analysisUserPrompt = 'Based on the web search results, recommend ALL relevant Dutch government websites. Return as JSON object with "websites" array.';

        const analysisResponse = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: analysisSystemPrompt },
            { role: 'user', content: researchPrompt },
            message,
            ...toolResults,
            { role: 'user', content: analysisUserPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        });

        const analysisContent = analysisResponse.choices[0]?.message?.content || '';
        websites = this.responseParser.parseOpenAIRecommendationsFromJSON(analysisContent, params.websiteTypes);

      } else {
        const recommendationsText = message.content || '';
        websites = this.responseParser.parseOpenAIRecommendations(recommendationsText, params.websiteTypes);

        if (websites.length === 0 && recommendationsText.includes('{')) {
          try {
            websites = this.responseParser.parseOpenAIRecommendationsFromJSON(recommendationsText, params.websiteTypes);
          } catch {
            // Ignore parsing errors, fallback to text parsing already done
          }
        }
      }

      if (websites.length === 0) {
        websites = await this.generateFromKnowledgeBase(openai, model, params);
      }

      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      websites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
      websites = this.qualityFilter.filterByQuality(websites, params);

      const maxResults = 100;
      if (websites.length > maxResults) {
        websites = websites.slice(0, maxResults);
      }

      return websites;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, onderwerp: params.onderwerp },
        'Error generating suggestions with OpenAI function calling'
      );
      throw error;
    }
  }

  /**
   * Call OpenAI API with retry logic
   */
  private async callOpenAIWithRetry(
    openai: OpenAIClient,
    params: ChatCompletionParams,
    retryCount: number = 0
  ): Promise<{
    choices: Array<{
      message?: {
        content?: string | null;
        tool_calls?: unknown[];
      };
    }>;
    model: string;
  }> {
    const MAX_RETRIES = 4;
    const INITIAL_DELAY_MS = 1000;
    const BACKOFF_MULTIPLIER = 2;

    try {
      return await openai.chat.completions.create(params);
    } catch (error: unknown) {
      const statusCode = (error as { status?: number; response?: { status?: number } })?.status ||
        (error as { status?: number; response?: { status?: number } })?.response?.status;
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const isRateLimitError = statusCode === 429 || errorMessage.includes('rate limit');

      if (isRateLimitError && retryCount < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, retryCount);
        logger.warn(
          { retryCount, delay, maxRetries: MAX_RETRIES },
          'OpenAI API rate limit hit, retrying'
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callOpenAIWithRetry(openai, params, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Generate suggestions using Google Custom Search API
   */
  private async generateWithGoogle(params: WebsiteSuggestionParams): Promise<WebsiteSuggestion[]> {
    if (!this.googleSearch.isConfigured()) {
      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      if (dbMatches.length === 0) {
        const env = getEnv();
        if (env.USE_MOCK_WEBSITE_SUGGESTIONS) {
          logger.info('Returning mock suggestions');
          return this.mockService.getMockSuggestions(params);
        }

        const error: APIKeysMissingError = Object.assign(
          new Error('API keys are not configured.'),
          {
            code: 'API_KEYS_MISSING' as const,
            missingKeys: {
              google: !env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID,
              openai: !this.openaiApiKey
            },
            canUseMock: (process.env.NODE_ENV as string) === 'development'
          }
        );
        throw error;
      }
      return dbMatches;
    }

    if (!this.openaiApiKey) {
      let results: ScrapedDocument[] = [];
      try {
        const searchQuery = this.buildGoogleSearchQuery(params);
        const governmentDomains = getGovernmentDomains(params.websiteTypes);
        const searchOptions: { numResults: number; siteRestrict?: string[] } = { numResults: 20 };
        if (governmentDomains.length > 0) searchOptions.siteRestrict = governmentDomains;
        results = await this.googleSearch.search(searchQuery, searchOptions);
      } catch (_error) {
        // Continue
      }

      if (results.length === 0) {
        logger.warn({ onderwerp: params.onderwerp }, 'Google Search returned 0 results, trying ChatGPT with designed prompts');
        
        // PRIORITY 1: Use ChatGPT with knowledge base prompt (designed prompts) if OpenAI key is available
        if (this.openaiApiKey) {
          try {
            const OpenAI = await import('openai');
            const openai = new OpenAI.default({
              apiKey: this.openaiApiKey!
            }) as unknown as OpenAIClient;
            const model = process.env.OPENAI_WEBSITE_SUGGESTION_MODEL || 'gpt-4o-mini';
            logger.info({ model, onderwerp: params.onderwerp }, 'Using ChatGPT with buildKnowledgeBasePrompt');
            const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
            if (knowledgeSuggestions.length > 0) {
              logger.info(
                { count: knowledgeSuggestions.length, onderwerp: params.onderwerp },
                'ChatGPT generated website suggestions using designed prompts'
              );
              return knowledgeSuggestions;
            } else {
              logger.warn(
                { onderwerp: params.onderwerp },
                'ChatGPT returned 0 suggestions, trying database matches'
              );
            }
          } catch (kbError) {
            logger.warn(
              { error: kbError instanceof Error ? kbError.message : String(kbError), onderwerp: params.onderwerp },
              'ChatGPT knowledge base prompt failed, trying database matches'
            );
          }
        }

        // PRIORITY 2: Try database matches as fallback (only if ChatGPT fails or returns nothing)
        const dbMatches = await this.databaseService.findDatabaseMatches(params);
        if (dbMatches.length > 0) {
          logger.info(
            { count: dbMatches.length, onderwerp: params.onderwerp },
            'Using database matches as fallback after ChatGPT returned no results'
          );
          return dbMatches;
        }

        const env = getEnv();
        if (env.USE_MOCK_WEBSITE_SUGGESTIONS) {
          logger.info('Returning mock suggestions as last resort');
          return this.mockService.getMockSuggestions(params);
        }

        // Don't throw error - return empty array and let caller handle (municipality website will still be included)
        logger.warn(
          { onderwerp: params.onderwerp },
          'All fallbacks exhausted - returning empty array (municipality website will be included by caller)'
        );
        return [];
      }

      const websites: WebsiteSuggestion[] = results.map(result => ({
        titel: result.titel,
        url: result.url,
        samenvatting: result.samenvatting || 'Found via Google Search',
        website_types: params.websiteTypes,
        relevantie: 'Found via Google Search'
      }));

      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
      allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);
      const maxResults = 100;
      if (allWebsites.length > maxResults) allWebsites = allWebsites.slice(0, maxResults);

      return allWebsites;
    }

    // Standard flow (Google + OpenAI) handled by generateWithOpenAI now (called if useOpenAI is false? No, wait)
    // In original code: if (!this.useOpenAI) -> generateWithGoogle.
    // generateWithGoogle had logic to call OpenAI if key present.

    // I should preserve the logic:
    // If Google Configured and OpenAI key present -> Search + Analyze (same as generateWithOpenAI simplified flow)
    // But since I have `generateWithOpenAI` which does exactly that, maybe I can reuse it?

    // But `generateWithOpenAI` checks `useOpenAI` flag? No, it's called if `useOpenAI` is true.
    // `generateWithGoogle` is called if `useOpenAI` is false.

    // So if `useOpenAI` is false (preproduction), but we have key, we should do Google Search + AI Analysis.
    // The original code duplicated this logic in `generateWithGoogle`.

    // I will keep duplication for now to match original behavior, but using components.

    // Step 1: Use Google Search
    const searchQuery = this.buildGoogleSearchQuery(params);
    const results = await this.googleSearch.search(searchQuery, {
      numResults: 20,
      siteRestrict: getGovernmentDomains(params.websiteTypes)
    });

    const hasValidApiKey = this.openaiApiKey && this.openaiApiKey.startsWith('sk-');
    
    if (!hasValidApiKey) {
      if (results.length > 0) {
        // results is ScrapedDocument[] from googleSearch.search, which has titel/url/samenvatting
        const websites = results.map((result) => ({
          titel: result.titel || 'Unknown',
          url: result.url || '',
          samenvatting: result.samenvatting || 'Found via Google Search',
          website_types: params.websiteTypes,
          relevantie: 'Found via Google Search'
        }));

        const dbMatches = await this.databaseService.findDatabaseMatches(params);
        let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
        allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);
        return allWebsites;
      } else {
        // No Google Search results - try ChatGPT with designed prompts FIRST
        logger.warn({ onderwerp: params.onderwerp }, 'Google Search returned 0 results, trying ChatGPT with designed prompts');
        
        // PRIORITY 1: Use ChatGPT with knowledge base prompt if OpenAI key is available
        if (this.openaiApiKey) {
          try {
            const OpenAI = await import('openai');
            const openai = new OpenAI.default({
              apiKey: this.openaiApiKey!
            }) as unknown as OpenAIClient;
            const model = process.env.OPENAI_WEBSITE_SUGGESTION_MODEL || 'gpt-4o-mini';
            logger.info({ model, onderwerp: params.onderwerp }, 'Using ChatGPT with buildKnowledgeBasePrompt');
            const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
            if (knowledgeSuggestions.length > 0) {
              logger.info(
                { count: knowledgeSuggestions.length, onderwerp: params.onderwerp },
                'ChatGPT generated website suggestions using designed prompts'
              );
              return knowledgeSuggestions;
            } else {
              logger.warn(
                { onderwerp: params.onderwerp },
                'ChatGPT returned 0 suggestions, trying database matches'
              );
            }
          } catch (kbError) {
            logger.warn(
              { error: kbError instanceof Error ? kbError.message : String(kbError), onderwerp: params.onderwerp },
              'ChatGPT knowledge base prompt failed, trying database matches'
            );
          }
        }
        
        // PRIORITY 2: Try database matches as fallback (only if ChatGPT fails or returns nothing)
        const dbMatches = await this.databaseService.findDatabaseMatches(params);
        if (dbMatches.length > 0) {
          logger.info(
            { count: dbMatches.length, onderwerp: params.onderwerp },
            'Using database matches as fallback after ChatGPT returned no results'
          );
          return dbMatches;
        }
        
        // Return empty array (municipality website will be included by caller)
        logger.warn(
          { onderwerp: params.onderwerp },
          'All fallbacks exhausted - returning empty array (municipality website will be included by caller)'
        );
        return [];
      }
    }

    // Initialize OpenAI conditionally
    let openai: OpenAIClient | null = null;
    if (hasValidApiKey) {
      const OpenAI = await import('openai');
      openai = new OpenAI.default({
        apiKey: this.openaiApiKey!
      }) as unknown as OpenAIClient;
    }

    const model = process.env.OPENAI_WEBSITE_SUGGESTION_MODEL || 'gpt-4o-mini';

    if (results.length === 0) {
      logger.warn({ onderwerp: params.onderwerp }, 'Google Search returned 0 results, trying ChatGPT with designed prompts');
      
      // PRIORITY 1: Use ChatGPT with knowledge base prompt (designed prompts) if OpenAI is available
      if (openai) {
        try {
          logger.info({ model, onderwerp: params.onderwerp }, 'Using ChatGPT with buildKnowledgeBasePrompt');
          const knowledgeSuggestions = await this.generateFromKnowledgeBase(openai, model, params);
          if (knowledgeSuggestions.length > 0) {
            logger.info(
              { count: knowledgeSuggestions.length, onderwerp: params.onderwerp },
              'ChatGPT generated website suggestions using designed prompts'
            );
            return knowledgeSuggestions;
          } else {
            logger.warn(
              { onderwerp: params.onderwerp },
              'ChatGPT returned 0 suggestions, trying database matches'
            );
          }
        } catch (kbError) {
          logger.warn(
            { error: kbError instanceof Error ? kbError.message : String(kbError), onderwerp: params.onderwerp },
            'ChatGPT knowledge base prompt failed, trying database matches'
          );
        }
      }

      // PRIORITY 2: Try database matches as fallback (only if ChatGPT fails or returns nothing)
      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      if (dbMatches.length > 0) {
        logger.info(
          { count: dbMatches.length, onderwerp: params.onderwerp },
          'Using database matches as fallback after ChatGPT returned no results'
        );
        return dbMatches;
      }

      const env = getEnv();
      if (env.USE_MOCK_WEBSITE_SUGGESTIONS) {
        logger.info('Returning mock suggestions as last resort');
        return this.mockService.getMockSuggestions(params);
      }

      // Return empty array (municipality website will be included by caller)
      logger.warn(
        { onderwerp: params.onderwerp },
        'All fallbacks exhausted - returning empty array (municipality website will be included by caller)'
      );
      return [];
    }

    // If we reach here, we have results > 0.
    // If hasValidApiKey was false, we would have returned above.
    // So openai should be initialized. But for type safety/robustness:
    if (!openai) {
      const websites = results.map(result => ({
        titel: result.titel || 'Unknown',
        url: result.url,
        samenvatting: result.samenvatting || 'Found via Google Search',
        website_types: params.websiteTypes,
        relevantie: 'Found via Google Search'
      }));

      const dbMatches = await this.databaseService.findDatabaseMatches(params);
      let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
      allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);
      return allWebsites;
    }

    // Analyze with OpenAI
    const analysisPrompt = this.suggestionPrompts.buildGoogleResultsAnalysisPrompt(params, results);
    const systemPrompt = 'You are a Dutch policy expert. Analyze Google Search results and recommend ALL relevant government websites.';

    const analysisResponse = await this.callOpenAIWithRetry(
      openai,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      }
    );

    const analysisContent = analysisResponse.choices[0]?.message?.content || '';
    const websites = this.responseParser.parseOpenAIRecommendationsFromJSON(analysisContent, params.websiteTypes);

    if (websites.length === 0) {
      throw new ExternalServiceError('Google Search', 'Failed to generate website recommendations from Google Search results', {
        reason: 'google_search_recommendation_failed',
        operation: 'generateSuggestionsFromGoogleSearch'
      });
    }

    const dbMatches = await this.databaseService.findDatabaseMatches(params);
    let allWebsites = this.databaseService.mergeWithDatabaseMatches(websites, dbMatches);
    allWebsites = this.qualityFilter.filterByQuality(allWebsites, params);

    const maxResults = 100;
    if (allWebsites.length > maxResults) {
      allWebsites = allWebsites.slice(0, maxResults);
    }

    return allWebsites;
  }

  /**
   * Generate website suggestions using ChatGPT's knowledge base fallback
   */
  private async generateFromKnowledgeBase(
    openai: OpenAIClient,
    model: string,
    params: WebsiteSuggestionParams
  ): Promise<WebsiteSuggestion[]> {
    const knowledgePrompt = this.suggestionPrompts.buildKnowledgeBasePrompt(params);
    const systemPrompt = 'You are a Dutch policy expert. Suggest relevant official Dutch government websites.';

    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: knowledgePrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content || '';
      return this.responseParser.parseOpenAIRecommendationsFromJSON(content, params.websiteTypes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, onderwerp: params.onderwerp },
        'Error generating suggestions from knowledge base'
      );
      return [];
    }
  }

  private buildGoogleSearchQuery(params: WebsiteSuggestionParams): string {
    const parts: string[] = [params.onderwerp];
    if (params.overheidsinstantie) parts.push(params.overheidsinstantie);
    if (params.overheidstype) parts.push(params.overheidstype);
    parts.push('beleid', 'document', 'overheid');
    return parts.join(' ');
  }
}
