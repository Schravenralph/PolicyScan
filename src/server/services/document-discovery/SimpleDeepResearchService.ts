import { ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { DocumentDiscoveryService } from './DocumentDiscoveryService.js';
import { WebsiteSuggestionService } from '../website-suggestion/WebsiteSuggestionService.js';
import { BronWebsite } from '../../models/BronWebsite.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { scrapedDocumentToCanonicalDraft } from '../workflow/legacyToCanonicalConverter.js';

/**
 * Simple service that uses ChatGPT deep research to:
 * 1. Get a sequence of domain websites
 * 2. Get a list of document-linking websites (actual document URLs)
 * 
 * Completely bypasses workflows, scrapers, and all complex tooling.
 */
export class SimpleDeepResearchService {
  private documentDiscovery: DocumentDiscoveryService;
  private websiteSuggestion: WebsiteSuggestionService | null = null;

  constructor() {
    this.documentDiscovery = new DocumentDiscoveryService();
  }

  /**
   * Get WebsiteSuggestionService instance, initializing it lazily with ensureDBConnection()
   */
  private async getWebsiteSuggestionService(): Promise<WebsiteSuggestionService> {
    if (!this.websiteSuggestion) {
      const db = await ensureDBConnection();
      this.websiteSuggestion = new WebsiteSuggestionService(db);
    }
    return this.websiteSuggestion;
  }

  /**
   * Use deep research to discover websites and documents, then save them directly
   */
  async discoverAndSave(
    queryId: string,
    params: {
      onderwerp: string;
      thema?: string;
      overheidstype?: string;
      overheidsinstantie?: string;
      websiteTypes?: string[];
    }
  ): Promise<{
    websitesFound: number;
    documentsFound: number;
    websiteIds: string[];
  }> {
    logger.info({ queryId, onderwerp: params.onderwerp }, '[SimpleDeepResearch] Starting deep research discovery');

    // Step 1: Use deep research to get domain websites
    logger.info('[SimpleDeepResearch] Step 1: Discovering domain websites...');
    const websiteSuggestion = await this.getWebsiteSuggestionService();
    const websiteSuggestions = await websiteSuggestion.generateSuggestions({
      onderwerp: params.onderwerp,
      overheidstype: params.overheidstype,
      overheidsinstantie: params.overheidsinstantie,
      websiteTypes: params.websiteTypes || []
    });

    logger.info({ count: websiteSuggestions.length }, '[SimpleDeepResearch] Found website suggestions');

    // Save websites to database
    const websiteIds: string[] = [];
    for (const suggestion of websiteSuggestions) {
      try {
        const website = await BronWebsite.create({
          titel: suggestion.titel,
          url: suggestion.url,
          label: suggestion.titel,
          samenvatting: suggestion.samenvatting,
          website_types: suggestion.website_types || [],
          queryId: queryId,
          'relevantie voor zoekopdracht': suggestion.relevantie || 'High - found via deep research'
        });
        if (website._id) {
          websiteIds.push(website._id.toString());
        }
      } catch (error) {
        logger.warn({ error, url: suggestion.url }, '[SimpleDeepResearch] Failed to save website');
      }
    }

    logger.info({ count: websiteIds.length }, '[SimpleDeepResearch] Saved websites to database');

    // Step 2: Use deep research to get actual document URLs
    logger.info('[SimpleDeepResearch] Step 2: Discovering document URLs...');
    const documents = await this.documentDiscovery.discoverDocuments({
      onderwerp: params.onderwerp,
      thema: params.thema,
      overheidstype: params.overheidstype,
      overheidsinstantie: params.overheidsinstantie,
      websiteTypes: params.websiteTypes || [],
      websiteUrls: websiteSuggestions.map(w => w.url)
    });

    logger.info({ count: documents.length }, '[SimpleDeepResearch] Found documents');

    // Save documents to database using canonical service
    let documentsSaved = 0;
    const canonicalService = getCanonicalDocumentService();
    
    for (const doc of documents) {
      try {
        // Convert ScrapedDocument to CanonicalDocumentDraft
        const canonicalDraft = scrapedDocumentToCanonicalDraft(
          doc,
          undefined, // fullText - will use samenvatting as fallback
          queryId,
          undefined // workflowRunId - not available in this context
        );

        // Persist using canonical service
        await canonicalService.upsertBySourceId(canonicalDraft, {});
        documentsSaved++;
      } catch (error) {
        logger.warn({ error, url: doc.url }, '[SimpleDeepResearch] Failed to save document to canonical collection');
      }
    }

    logger.info(
      { websitesFound: websiteIds.length, documentsFound: documentsSaved },
      '[SimpleDeepResearch] Deep research discovery completed'
    );

    return {
      websitesFound: websiteIds.length,
      documentsFound: documentsSaved,
      websiteIds
    };
  }
}
