import type { ScrapedDocument } from '../infrastructure/types.js';
import { DocumentTypeExtractor } from '../ingestion/metadata/DocumentTypeExtractor.js';
import { logger } from '../../utils/logger.js';

export interface DocumentDiscoveryParams {
  onderwerp: string;
  thema?: string;
  overheidstype?: string;
  overheidsinstantie?: string;
  websiteTypes?: string[];
  websiteUrls?: string[]; // Optional: specific websites to search within
}

interface OpenAIClient {
  responses: {
    create: (params: {
      model: string;
      input: string;
      tools?: Array<{
        type: 'web_search';
        filters?: {
          domains?: string[];
        };
      }>;
      include?: string[];
    }) => Promise<{
      output_items?: Array<{
        type: string;
        content?: Array<{
          type: string;
          text?: string;
          annotations?: Array<{
            type: string;
            url?: string;
            title?: string;
          }>;
        }>;
        action?: {
          sources?: Array<{
            url: string;
            title?: string;
            snippet?: string;
          }>;
        };
      }>;
    }>;
  };
}

/**
 * Service for discovering actual documents using ChatGPT deep research
 * 
 * When enabled via feature flag CHATGPT_DEEP_RESEARCH_DOCUMENTS_ENABLED,
 * this service uses OpenAI's deep research models (e.g., o4-mini-deep-research)
 * to find specific document URLs and metadata rather than just domain names.
 * 
 * Unlike WebsiteSuggestionService which finds websites, this service focuses
 * on discovering actual policy documents, PDFs, and web pages with content.
 */
export class DocumentDiscoveryService {
  private openaiApiKey: string | null;
  private documentTypeExtractor: DocumentTypeExtractor;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || null;
    this.documentTypeExtractor = new DocumentTypeExtractor();
  }

  /**
   * Discover documents using ChatGPT deep research
   */
  async discoverDocuments(params: DocumentDiscoveryParams): Promise<ScrapedDocument[]> {
    if (!this.openaiApiKey) {
      logger.warn('[DocumentDiscovery] OPENAI_API_KEY not set, cannot use deep research');
      return [];
    }

    try {
      const OpenAI = await import('openai');
      const openai = new OpenAI.default({
        apiKey: this.openaiApiKey
      }) as unknown as OpenAIClient;

      // Use deep research model (o4-mini-deep-research or similar)
      const model = process.env.OPENAI_DOCUMENT_DISCOVERY_MODEL || 'o4-mini-deep-research';

      logger.info({ model, onderwerp: params.onderwerp }, '[DocumentDiscovery] Starting deep research document discovery');

      const researchPrompt = this.buildDocumentDiscoveryPrompt(params);

      // Get government domains for filtering (if website types specified)
      const governmentDomains = params.websiteUrls 
        ? this.extractDomainsFromUrls(params.websiteUrls)
        : this.getGovernmentDomains(params.websiteTypes || []);

      // Use Responses API with web_search tool for deep research
      const response = await openai.responses.create({
        model: model,
        input: researchPrompt,
        tools: [
          {
            type: 'web_search',
            // Domain filtering: limit to specified domains or government domains
            filters: governmentDomains.length > 0 ? {
              domains: governmentDomains.slice(0, 100).map(domain => 
                domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
              )
            } : undefined
          }
        ],
        // Include sources in response for citation
        include: ['web_search_call.action.sources']
      });

      // Extract documents from the response
      const documents = this.extractDocumentsFromResponse(response, params);

      logger.info({ count: documents.length, model }, '[DocumentDiscovery] Discovered documents via deep research');

      return documents;

    } catch (error) {
      logger.error({ error, onderwerp: params.onderwerp }, '[DocumentDiscovery] Error discovering documents');
      throw error;
    }
  }

  /**
   * Build prompt for document discovery research
   */
  private buildDocumentDiscoveryPrompt(params: DocumentDiscoveryParams): string {
    const parts: string[] = [];

    parts.push('Find specific policy documents and publications related to:');
    
    if (params.onderwerp) {
      parts.push(`Subject: ${params.onderwerp}`);
    }
    
    if (params.thema) {
      parts.push(`Theme: ${params.thema}`);
    }

    if (params.overheidsinstantie) {
      parts.push(`Government organization: ${params.overheidsinstantie}`);
    }

    if (params.overheidstype) {
      parts.push(`Government level: ${params.overheidstype}`);
    }

    parts.push('');
    parts.push('Please find:');
    parts.push('- Specific policy documents (PDFs, web pages, publications)');
    parts.push('- Official documents with titles and URLs');
    parts.push('- Publications, reports, and policy notes');
    parts.push('- Documents published by government organizations');
    parts.push('');
    parts.push('For each document, provide:');
    parts.push('- Full URL to the document');
    parts.push('- Document title');
    parts.push('- Brief summary or description');
    parts.push('- Publication date if available');
    parts.push('');
    parts.push('Focus on finding actual documents, not just website home pages.');

    return parts.join('\n');
  }

  /**
   * Extract documents from OpenAI Responses API response
   */
  private extractDocumentsFromResponse(
    response: {
      output_items?: Array<{
        type: string;
        content?: Array<{
          type: string;
          text?: string;
          annotations?: Array<{
            type: string;
            url?: string;
            title?: string;
          }>;
        }>;
        action?: {
          sources?: Array<{
            url: string;
            title?: string;
            snippet?: string;
          }>;
        };
      }>;
    },
    params: DocumentDiscoveryParams
  ): ScrapedDocument[] {
    const documents: ScrapedDocument[] = [];
    const seenUrls = new Set<string>();

    const outputItems = response.output_items || [];

    for (const item of outputItems) {
      // Handle web_search_call items for sources (most reliable)
      if (item.type === 'web_search_call' && item.action?.sources) {
        for (const source of item.action.sources) {
          if (seenUrls.has(source.url)) continue;
          seenUrls.add(source.url);

          const document = this.convertSourceToDocument(source, params);
          if (document) {
            documents.push(document);
          }
        }
      }

      // Handle message items with citations
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          // Extract from annotations (citations)
          if (contentItem.annotations) {
            for (const annotation of contentItem.annotations) {
              if (annotation.type === 'url_citation' && annotation.url) {
                if (seenUrls.has(annotation.url)) continue;
                seenUrls.add(annotation.url);

                const document = this.convertAnnotationToDocument(annotation, contentItem.text || '', params);
                if (document) {
                  documents.push(document);
                }
              }
            }
          }

          // Try to parse documents from text content
          if (contentItem.type === 'output_text' && contentItem.text) {
            const parsedDocs = this.parseDocumentsFromText(contentItem.text, params);
            for (const doc of parsedDocs) {
              if (!seenUrls.has(doc.url)) {
                seenUrls.add(doc.url);
                documents.push(doc);
              }
            }
          }
        }
      }
    }

    return documents;
  }

  /**
   * Convert web search source to ScrapedDocument
   */
  private convertSourceToDocument(
    source: { url: string; title?: string; snippet?: string },
    _params: DocumentDiscoveryParams
  ): ScrapedDocument | null {
    if (!source.url) return null;

    try {
      const urlObj = new URL(source.url);
      const websiteUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      // Determine document type from URL
      const type = this.documentTypeExtractor.extractType({
        url: source.url,
        titel: source.title || '',
        samenvatting: source.snippet || ''
      } as ScrapedDocument);

      return {
        titel: source.title || this.extractTitleFromUrl(source.url),
        url: source.url,
        website_url: websiteUrl,
        website_titel: this.extractWebsiteTitleFromUrl(websiteUrl),
        samenvatting: source.snippet || source.title || '',
        type_document: type || 'Beleidsdocument',
        publicatiedatum: null, // Deep research may not always find publication dates
        sourceType: this.inferSourceType(websiteUrl),
        authorityLevel: this.inferAuthorityLevel(websiteUrl)
      };
    } catch (error) {
      logger.warn({ error, url: source.url }, '[DocumentDiscovery] Failed to convert source to document');
      return null;
    }
  }

  /**
   * Convert annotation to ScrapedDocument
   */
  private convertAnnotationToDocument(
    annotation: { url?: string; title?: string },
    contextText: string,
    _params: DocumentDiscoveryParams
  ): ScrapedDocument | null {
    if (!annotation.url) return null;

    try {
      const urlObj = new URL(annotation.url);
      const websiteUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      const type = this.documentTypeExtractor.extractType({
        url: annotation.url,
        titel: annotation.title || '',
        samenvatting: contextText.substring(0, 500)
      } as ScrapedDocument);

      return {
        titel: annotation.title || this.extractTitleFromUrl(annotation.url),
        url: annotation.url,
        website_url: websiteUrl,
        website_titel: this.extractWebsiteTitleFromUrl(websiteUrl),
        samenvatting: contextText.substring(0, 500) || annotation.title || '',
        type_document: type || 'Beleidsdocument',
        publicatiedatum: null,
        sourceType: this.inferSourceType(websiteUrl),
        authorityLevel: this.inferAuthorityLevel(websiteUrl)
      };
    } catch (error) {
      logger.warn({ error, url: annotation.url }, '[DocumentDiscovery] Failed to convert annotation to document');
      return null;
    }
  }

  /**
   * Parse documents from text response (fallback method)
   */
  private parseDocumentsFromText(text: string, _params: DocumentDiscoveryParams): ScrapedDocument[] {
    const documents: ScrapedDocument[] = [];

    // Try to find URLs in the text
    const urlPattern = /https?:\/\/[^\s)]+/g;
    const urls = text.match(urlPattern) || [];

    for (const url of urls) {
      try {
        // Validate URL
        new URL(url);
        
        // Try to extract title from context around URL
        const urlIndex = text.indexOf(url);
        const contextStart = Math.max(0, urlIndex - 100);
        const contextEnd = Math.min(text.length, urlIndex + url.length + 200);
        const context = text.substring(contextStart, contextEnd);

        // Look for title-like patterns before the URL
        const titleMatch = context.match(/(?:title|document|publication|rapport):\s*([^\n]+)/i);
        const title = titleMatch ? titleMatch[1].trim() : this.extractTitleFromUrl(url);

        const urlObj = new URL(url);
        const websiteUrl = `${urlObj.protocol}//${urlObj.hostname}`;

        const type = this.documentTypeExtractor.extractType({
          url: url,
          titel: title,
          samenvatting: context.substring(0, 300)
        } as ScrapedDocument);

        documents.push({
          titel: title,
          url: url,
          website_url: websiteUrl,
          website_titel: this.extractWebsiteTitleFromUrl(websiteUrl),
          samenvatting: context.substring(0, 300) || title,
          type_document: type || 'Beleidsdocument',
          publicatiedatum: null,
          sourceType: this.inferSourceType(websiteUrl),
          authorityLevel: this.inferAuthorityLevel(websiteUrl)
        });
      } catch (_error) {
        // Skip invalid URLs
        continue;
      }
    }

    return documents;
  }

  /**
   * Extract title from URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // Remove file extension and decode
        return decodeURIComponent(lastPart.replace(/\.(pdf|docx?|html?)$/i, ''))
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
      }
      
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Extract website title from URL
   */
  private extractWebsiteTitleFromUrl(websiteUrl: string): string {
    try {
      const urlObj = new URL(websiteUrl);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      
      // Capitalize domain name
      return hostname
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    } catch {
      return websiteUrl;
    }
  }

  /**
   * Get government domains based on website types
   */
  private getGovernmentDomains(websiteTypes: string[]): string[] {
    const domains: string[] = [];

    if (websiteTypes.includes('gemeente')) {
      domains.push('amsterdam.nl', 'rotterdam.nl', 'denhaag.nl', 'utrecht.nl', 'eindhoven.nl', 'groningen.nl');
    }
    if (websiteTypes.includes('provincie')) {
      domains.push('noord-holland.nl', 'zuid-holland.nl', 'utrecht.nl', 'noord-brabant.nl', 'gelderland.nl');
    }
    if (websiteTypes.includes('rijk')) {
      domains.push('rijksoverheid.nl', 'overheid.nl', 'officielebekendmakingen.nl');
    }
    if (websiteTypes.includes('waterschap')) {
      domains.push('waterschap.nl', 'hoogheemraadschap.nl');
    }

    return domains;
  }

  /**
   * Extract domains from URLs
   */
  private extractDomainsFromUrls(urls: string[]): string[] {
    const domains: string[] = [];

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        if (domain && !domains.includes(domain)) {
          domains.push(domain);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    return domains;
  }

  /**
   * Infer source type from URL
   */
  private inferSourceType(url: string): 'iplo' | 'rijksoverheid' | 'gemeente' | 'provincie' | 'other' {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('iplo.nl')) return 'iplo';
    if (urlLower.includes('rijksoverheid.nl') || urlLower.includes('overheid.nl')) return 'rijksoverheid';
    if (urlLower.includes('.nl') && !urlLower.includes('provincie') && !urlLower.includes('rijksoverheid')) {
      // Check if it's a municipality (many gemeente websites follow this pattern)
      const gemeentePattern = /(gemeente|gemeenten|amsterdam|rotterdam|denhaag|utrecht|eindhoven|groningen|maastricht|tilburg|almere|breda|nijmegen|enschede|haarlem|arnhem|zaanstad|amersfoort|apeldoorn|'s-hertogenbosch|haarlemmermeer|zwolle|zoetermeer|maastricht|leiden|dordrecht|eindhoven|groningen|almere|breda|nijmegen|enschede|tilburg)/i;
      if (gemeentePattern.test(urlLower)) return 'gemeente';
    }
    if (urlLower.includes('provincie')) return 'provincie';
    
    return 'other';
  }

  /**
   * Infer authority level from URL
   */
  private inferAuthorityLevel(url: string): 'national' | 'provincial' | 'municipal' | 'unknown' {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('rijksoverheid.nl') || urlLower.includes('overheid.nl')) return 'national';
    if (urlLower.includes('provincie')) return 'provincial';
    if (urlLower.includes('.nl') && !urlLower.includes('rijksoverheid') && !urlLower.includes('provincie')) {
      // Likely municipal
      return 'municipal';
    }
    
    return 'unknown';
  }
}
