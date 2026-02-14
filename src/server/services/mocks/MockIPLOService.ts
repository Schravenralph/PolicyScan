/**
 * Mock IPLO Scraper Service
 * 
 * Provides mock implementation of IPLOScraper for testing.
 * Implements the same interface as the real service but returns
 * configurable mock responses instead of making real API calls.
 */

import { MockServiceBase } from './MockServiceBase.js';
import { getMockServiceRegistry } from './MockServiceRegistry.js';
import { logger } from '../../utils/logger.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import type { RunManager } from '../workflow/RunManager.js';
import type { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';

export class MockIPLOService extends MockServiceBase<ScrapedDocument[], Error> {
  // private maxDepth: number = 2; // unused

  constructor(maxDepth: number = 2) {
    super();
    // this.maxDepth = maxDepth; // unused
    // Set default mock response
    this.setDefaultResponse(this.getDefaultMockDocuments());
    getMockServiceRegistry().register('IPLOScraper', this);
  }

  getServiceName(): string {
    return 'MockIPLOService';
  }

  /**
   * Mock scrapeByQuery implementation
   * Note: Real service uses scrapeByQuery(onderwerp, thema, runManager?, runId?, overheidsinstantie?)
   */
  async scrapeByQuery(
    onderwerp: string,
    thema: string,
    _runManager?: RunManager,
    _runId?: string,
    overheidsinstantie?: string
  ): Promise<ScrapedDocument[]> {
    if (!this.isEnabled()) {
      logger.debug('MockIPLOService is disabled, falling back to real service.');
      return [];
    }

    logger.info(`MockIPLOService.scrapeByQuery called with onderwerp: "${onderwerp}", thema: "${thema}"${overheidsinstantie ? `, overheidsinstantie: "${overheidsinstantie}"` : ''}`);

    // Build key from query parameters
    const key = `scrape:${onderwerp}:${thema}${overheidsinstantie ? `:${overheidsinstantie}` : ''}`;
    
    // Check for error scenario
    if (this.hasError(key)) {
      const error = this.getError(key);
      if (error) {
        logger.warn(`MockIPLOService returning error for key '${key}'.`);
        throw error;
      }
    }

    // Get mock response
    const response = this.getResponse(key);

    if (response) {
      logger.debug(`MockIPLOService returning custom response for key '${key}'.`);
      // Filter by overheidsinstantie if provided (simulate real behavior)
      return this.filterByInstitution(response, overheidsinstantie);
    }

    // Return default response if no specific response set
    logger.debug(`MockIPLOService returning default response for key '${key}'.`);
    return this.filterByInstitution(this.getDefaultMockDocuments(), overheidsinstantie);
  }

  /**
   * Mock exploreExternalLinks implementation
   * Note: Real service uses exploreExternalLinks(graph, maxLinks, runManager?, runId?)
   */
  async exploreExternalLinks(
    _graph: NavigationGraph,
    maxLinks: number,
    _runManager?: RunManager,
    _runId?: string
  ): Promise<{
    processedCount: number;
    totalCollected: number;
    iploPagesScanned: number;
    failedPages: string[];
    filteredLinksCount: number;
  }> {
    if (!this.isEnabled()) {
      logger.debug('MockIPLOService is disabled, falling back to real service.');
      return {
        processedCount: 0,
        totalCollected: 0,
        iploPagesScanned: 0,
        failedPages: [],
        filteredLinksCount: 0
      };
    }

    logger.info(`MockIPLOService.exploreExternalLinks called with maxLinks: ${maxLinks}`);

    // Build key
    const key = `exploreExternalLinks:${maxLinks}`;
    
    // Check for error scenario
    if (this.hasError(key)) {
      const error = this.getError(key);
      if (error) {
        logger.warn(`MockIPLOService returning error for key '${key}'.`);
        throw error;
      }
    }

    // Return mock stats
    return {
      processedCount: Math.min(maxLinks, 5),
      totalCollected: Math.min(maxLinks, 5),
      iploPagesScanned: Math.min(maxLinks, 5),
      failedPages: [],
      filteredLinksCount: 0
    };
  }

  /**
   * Filter documents by institution (simulate real behavior)
   */
  private filterByInstitution(
    documents: ScrapedDocument[],
    overheidsinstantie?: string
  ): ScrapedDocument[] {
    if (!overheidsinstantie) {
      return documents;
    }

    const instantieLower = overheidsinstantie.toLowerCase();
    return documents.filter(doc => {
      const municipalityName = doc.municipalityName?.toLowerCase() || '';
      const websiteTitel = doc.website_titel?.toLowerCase() || '';
      const websiteUrl = doc.website_url?.toLowerCase() || '';
      
      return municipalityName.includes(instantieLower) ||
             websiteTitel.includes(instantieLower) ||
             websiteUrl.includes(instantieLower);
    });
  }

  /**
   * Get default mock documents
   */
  private getDefaultMockDocuments(): ScrapedDocument[] {
    return [
      {
        titel: 'Mock IPLO Document - Waterkwaliteit',
        url: 'https://iplo.nl/thema/water/waterkwaliteit',
        website_url: 'https://iplo.nl',
        website_titel: 'IPLO',
        samenvatting: 'Dit is een mock IPLO document over waterkwaliteit.',
        type_document: 'Webpagina' as const,
        publicatiedatum: '2024-01-10',
        sourceType: 'iplo' as const,
        authorityLevel: 'national' as const
      },
      {
        titel: 'Mock IPLO Document - Klimaatadaptatie',
        url: 'https://iplo.nl/thema/klimaat/klimaatadaptatie',
        website_url: 'https://iplo.nl',
        website_titel: 'IPLO',
        samenvatting: 'Dit is een mock IPLO document over klimaatadaptatie.',
        type_document: 'Webpagina' as const,
        publicatiedatum: '2024-02-15',
        sourceType: 'iplo' as const,
        authorityLevel: 'national' as const
      },
      {
        titel: 'Mock IPLO Document - Omgevingsvisie',
        url: 'https://iplo.nl/thema/ruimte/omgevingsvisie',
        website_url: 'https://iplo.nl',
        website_titel: 'IPLO',
        samenvatting: 'Dit is een mock IPLO document over omgevingsvisie.',
        type_document: 'Webpagina' as const,
        publicatiedatum: '2024-03-20',
        sourceType: 'iplo' as const,
        authorityLevel: 'national' as const
      }
    ];
  }
}
