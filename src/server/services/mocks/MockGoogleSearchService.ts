/**
 * Mock Google Search Service
 * 
 * Provides mock implementation of GoogleSearchService for testing.
 * Implements the same interface as the real service but returns
 * configurable mock responses instead of making real API calls.
 */

import { MockServiceBase } from './MockServiceBase.js';
import { ScrapedDocument } from '../infrastructure/types.js';

export interface GoogleSearchOptions {
  siteRestrict?: string[];
  excludeSites?: string[];
  numResults?: number;
  filetype?: string;
}

export class MockGoogleSearchService extends MockServiceBase<ScrapedDocument[], Error> {
  private _imborService: unknown = null;

  constructor() {
    super();
    // Set default mock response
    this.setDefaultResponse(this.getDefaultMockDocuments());
  }

  getServiceName(): string {
    return 'MockGoogleSearchService';
  }

  /**
   * Set IMBOR service (matches real service interface)
   */
  setImborService(imborService: unknown): void {
    this._imborService = imborService;
  }

  /**
   * Check if service is configured (always returns true for mock)
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Mock search implementation
   */
  async search(
    query: string,
    options?: GoogleSearchOptions
  ): Promise<ScrapedDocument[]> {
    if (!this.isEnabled()) {
      throw new Error('MockGoogleSearchService is disabled');
    }

    // Check for error scenario
    const errorKey = `search:${query}`;
    if (this.hasError(errorKey)) {
      const error = this.getError(errorKey);
      if (error) {
        throw error;
      }
    }

    // Get mock response
    const responseKey = `search:${query}`;
    const response = this.getResponse(responseKey);

    if (response) {
      // Apply options filtering (simulate real behavior)
      let documents = [...response];
      
      // Filter by site restrictions
      if (options?.siteRestrict && options.siteRestrict.length > 0) {
        documents = documents.filter(doc => {
          const docUrl = new URL(doc.url);
          return options.siteRestrict!.some(site => {
            const siteUrl = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
            return docUrl.hostname === siteUrl || docUrl.hostname.includes(siteUrl);
          });
        });
      }

      // Filter by excluded sites
      if (options?.excludeSites && options.excludeSites.length > 0) {
        documents = documents.filter(doc => {
          const docUrl = new URL(doc.url);
          return !options.excludeSites!.some(site => {
            const siteUrl = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
            return docUrl.hostname === siteUrl || docUrl.hostname.includes(siteUrl);
          });
        });
      }

      // Filter by filetype
      if (options?.filetype) {
        const filetype = options.filetype.toLowerCase().replace(/^\./, '');
        documents = documents.filter(doc => {
          const url = doc.url.toLowerCase();
          return url.endsWith(`.${filetype}`);
        });
      }

      // Limit results
      if (options?.numResults) {
        documents = documents.slice(0, options.numResults);
      }

      return documents;
    }

    // Return default response if no specific response set
    return this.getDefaultMockDocuments();
  }

  /**
   * Mock searchGovernmentSources implementation
   * Note: Real service uses (onderwerp, thema, overheidslaag) parameters
   */
  async searchGovernmentSources(
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): Promise<ScrapedDocument[]> {
    if (!this.isEnabled()) {
      throw new Error('MockGoogleSearchService is disabled');
    }

    // Build query key from parameters
    const queryKey = `${onderwerp}:${thema}:${overheidslaag}`;
    
    // Check for error scenario
    const errorKey = `searchGovernmentSources:${queryKey}`;
    if (this.hasError(errorKey)) {
      const error = this.getError(errorKey);
      if (error) {
        throw error;
      }
    }

    // Get mock response
    const responseKey = `searchGovernmentSources:${queryKey}`;
    const response = this.getResponse(responseKey);

    if (response) {
      // Filter to only government sources (simulate real behavior)
      const governmentDomains = [
        '.nl',
        '.overheid.nl',
        'gemeente',
        'provincie',
        'waterschap',
        'rijksoverheid'
      ];
      
      const documents = response.filter(doc => {
        const url = doc.url.toLowerCase();
        return governmentDomains.some(domain => url.includes(domain));
      });

      return documents;
    }

    // Return default government sources response
    return this.getDefaultGovernmentDocuments();
  }

  /**
   * Get default mock documents for general search
   */
  private getDefaultMockDocuments(): ScrapedDocument[] {
    return [
      {
        titel: 'Test Document 1',
        url: 'https://www.amsterdam.nl/klimaatadaptatie',
        website_url: 'https://www.amsterdam.nl',
        website_titel: 'Gemeente Amsterdam',
        samenvatting: 'This is a test document about climate adaptation in Amsterdam',
        type_document: 'Webpagina',
        publicatiedatum: '2024-01-15'
      },
      {
        titel: 'Test Document 2',
        url: 'https://www.rotterdam.nl/omgevingsvisie.pdf',
        website_url: 'https://www.rotterdam.nl',
        website_titel: 'Gemeente Rotterdam',
        samenvatting: 'Test document about environmental vision',
        type_document: 'PDF' as const,
        publicatiedatum: '2024-02-20'
      }
    ];
  }

  /**
   * Get default mock documents for government sources search
   */
  private getDefaultGovernmentDocuments(): ScrapedDocument[] {
    return [
      {
        titel: 'Government Policy Document',
        url: 'https://www.rijksoverheid.nl/beleid/klimaat',
        website_url: 'https://www.rijksoverheid.nl',
        website_titel: 'Rijksoverheid',
        samenvatting: 'Government policy document about climate',
        type_document: 'Webpagina',
        publicatiedatum: '2024-03-10'
      }
    ];
  }
}

