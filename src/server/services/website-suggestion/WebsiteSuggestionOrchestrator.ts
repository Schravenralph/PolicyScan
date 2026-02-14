import { getDB, type Db } from '../../config/database.js';
import { Query } from '../../models/Query.js';
import { WebsiteSuggestionService, type WebsiteSuggestionParams } from './WebsiteSuggestionService.js';
import { getQueryProgressService, type QueryProgress } from '../query/QueryProgressService.js';
import { logger } from '../../utils/logger.js';
import type { WebsiteSuggestionDTO, WebsiteSuggestionsResponseDTO } from '../../types/dto.js';
import { mapWebsiteSuggestionsToDto } from '../../utils/mappers.js';
import { NotFoundError } from '../../types/errors.js';

/**
 * Orchestrator service for website suggestion generation
 * Coordinates progress tracking, suggestion generation, and error handling
 */
export class WebsiteSuggestionOrchestrator {
  private suggestionService: WebsiteSuggestionService;
  private progressService = getQueryProgressService();

  constructor(db?: Db) {
    const database = db || getDB();
    this.suggestionService = new WebsiteSuggestionService(database);
  }

  /**
   * Generate website suggestions for a query with progress tracking
   */
  async generateSuggestions(queryId: string): Promise<WebsiteSuggestionsResponseDTO> {
    try {
      // Get query
      const query = await Query.findById(queryId);
      if (!query) {
        throw new NotFoundError('Query', queryId, {
          reason: 'query_not_found',
          operation: 'generateSuggestions'
        });
      }

      logger.info({ queryId, onderwerp: query.onderwerp }, 'Generating website suggestions for query');

      // Initialize progress tracking
      this.progressService.initialize(queryId);
      this.progressService.update(queryId, {
        progress: 10,
        status: 'analyzing',
        currentStep: 'Onderwerp analyseren...'
      });

      // Update progress to searching phase
      this.progressService.update(queryId, {
        progress: 30,
        status: 'searching',
        currentStep: 'Zoeken naar relevante websites...'
      });

      // Generate suggestions
      const suggestionParams: WebsiteSuggestionParams = {
        onderwerp: query.onderwerp || '',
        overheidstype: query.overheidstype,
        overheidsinstantie: query.overheidsinstantie,
        websiteTypes: query.websiteTypes || []
      };

      const suggestions = await this.suggestionService.generateSuggestions(suggestionParams);

      // Update progress to evaluating phase
      this.progressService.update(queryId, {
        progress: 70,
        status: 'evaluating',
        currentStep: 'Website relevantie evalueren...'
      });

      // Small delay to show evaluation status
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update progress to generating phase
      this.progressService.update(queryId, {
        progress: 90,
        status: 'generating',
        currentStep: 'Suggesties genereren...'
      });

      logger.info({ queryId, suggestionCount: suggestions.length }, 'Generated website suggestions for query');

      // Convert suggestions to DTO format using mapper
      const websites: WebsiteSuggestionDTO[] = mapWebsiteSuggestionsToDto(suggestions);

      // Calculate metadata: check if only municipality website exists (AI found nothing)
      // Municipality website typically has a specific pattern (e.g., "Gemeente X" in title)
      const municipalityPattern = /^Gemeente\s+/i;
      const municipalityWebsites = websites.filter(w => municipalityPattern.test(w.titel));
      const aiSuggestionsCount = websites.length - municipalityWebsites.length;
      const onlyMunicipalityWebsite = municipalityWebsites.length > 0 && aiSuggestionsCount === 0;

      // Mark progress as completed
      this.progressService.complete(queryId);

      return {
        success: true,
        websites,
        metadata: {
          aiSuggestionsCount,
          municipalityWebsiteIncluded: municipalityWebsites.length > 0,
          onlyMunicipalityWebsite
        }
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error generating website suggestions');

      // Mark progress as error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.progressService.error(queryId, errorMessage);

      throw error;
    }
  }

  /**
   * Generate mock website suggestions for development/testing
   */
  async generateMockSuggestions(queryId: string): Promise<WebsiteSuggestionsResponseDTO> {
    try {
      const query = await Query.findById(queryId);
      if (!query) {
        throw new NotFoundError('Query', queryId, {
          reason: 'query_not_found',
          operation: 'generateMockSuggestions'
        });
      }

      logger.info({ queryId, onderwerp: query.onderwerp }, 'Generating mock website suggestions for query');

      const suggestionParams: WebsiteSuggestionParams = {
        onderwerp: query.onderwerp || '',
        overheidstype: query.overheidstype,
        overheidsinstantie: query.overheidsinstantie,
        websiteTypes: query.websiteTypes || []
      };

      // Use generateSuggestions method which handles mock mode internally
      const suggestions = await this.suggestionService.generateSuggestions(suggestionParams);

      logger.info({ queryId, suggestionCount: suggestions.length }, 'Generated mock website suggestions for query');

      // Convert suggestions to DTO format using mapper
      const websites: WebsiteSuggestionDTO[] = mapWebsiteSuggestionsToDto(suggestions);

      return {
        success: true,
        websites,
        isMock: true
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error generating mock website suggestions');
      throw error;
    }
  }

  /**
   * Get progress for a query
   */
  getProgress(queryId: string): QueryProgress | null {
    return this.progressService.getProgress(queryId);
  }
}
