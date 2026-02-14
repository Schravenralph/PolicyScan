/**
 * HtmlExtractor - Extract text from HTML documents
 * 
 * Robust text extraction from HTML with boilerplate removal and markdown conversion.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/10-gemeente-beleid-adapter.md
 */

import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

/**
 * HTML extraction result
 */
export interface HtmlExtractionResult {
  fullText: string;
  title?: string;
  headings?: string[]; // Extracted headings for structure
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedAt?: Date;
  };
  diagnostics: {
    extractionMethod: 'cheerio';
    hasText: boolean;
    textLength: number;
    headingCount: number;
    linksDiscovered: number;
  };
  discoveredLinks: string[]; // Links found in the document
}

/**
 * HtmlExtractor - Extract text from HTML
 */
export class HtmlExtractor {
  private readonly minTextLength: number;
  private readonly boilerplateSelectors: string[];

  constructor(config: { minTextLength?: number; boilerplateSelectors?: string[] } = {}) {
    this.minTextLength = config.minTextLength || 200; // Minimum 200 characters for HTML
    this.boilerplateSelectors = config.boilerplateSelectors || [
      'nav',
      'header',
      'footer',
      '.navigation',
      '.nav',
      '.header',
      '.footer',
      '.sidebar',
      '.menu',
      '.cookie-banner',
      '.skip-link',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      'script',
      'style',
      'noscript',
    ];
  }

  /**
   * Extract text from HTML string
   * 
   * @param htmlContent - HTML content as string
   * @param baseUrl - Base URL for resolving relative links
   * @returns Extracted text and diagnostics
   * @throws Error if extraction fails or text is below threshold
   */
  async extract(htmlContent: string, baseUrl?: string): Promise<HtmlExtractionResult> {
    try {
      const $ = cheerio.load(htmlContent);

      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim();

      // Remove boilerplate elements
      for (const selector of this.boilerplateSelectors) {
        $(selector).remove();
      }

      // Extract main content (prefer article, main, or body)
      let contentElement = $('article').first();
      if (contentElement.length === 0) {
        contentElement = $('main').first();
      }
      if (contentElement.length === 0) {
        contentElement = $('body');
      }

      // Extract headings
      const headings: string[] = [];
      contentElement.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
        const headingText = $(el).text().trim();
        if (headingText.length > 0) {
          headings.push(headingText);
        }
      });

      // Extract text content
      let fullText = contentElement.text() || $.text();

      // Clean up whitespace
      fullText = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // Extract discovered links
      const discoveredLinks: string[] = [];
      contentElement.find('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            // Resolve relative URLs
            const absoluteUrl = baseUrl && !href.startsWith('http') 
              ? new URL(href, baseUrl).toString()
              : href;
            discoveredLinks.push(absoluteUrl);
          } catch {
            // Invalid URL, skip
          }
        }
      });

      // Extract metadata
      const metadata: HtmlExtractionResult['metadata'] = {};
      
      // Meta description
      const description = $('meta[name="description"]').attr('content');
      if (description) {
        metadata.description = description;
      }

      // Meta keywords
      const keywords = $('meta[name="keywords"]').attr('content');
      if (keywords) {
        metadata.keywords = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      }

      // Meta author
      const author = $('meta[name="author"]').attr('content');
      if (author) {
        metadata.author = author;
      }

      // Published date (try various formats)
      const publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                           $('meta[name="publication-date"]').attr('content') ||
                           $('time[datetime]').first().attr('datetime');
      if (publishedDate) {
        try {
          metadata.publishedAt = new Date(publishedDate);
        } catch {
          // Invalid date, skip
        }
      }

      // Validate extraction quality
      if (fullText.trim().length === 0) {
        throw new Error('HTML extraction produced empty text');
      }

      if (fullText.trim().length < this.minTextLength) {
        throw new Error(
          `HTML extraction produced text below minimum threshold (${fullText.trim().length} < ${this.minTextLength} characters)`
        );
      }

      logger.debug(
        {
          textLength: fullText.length,
          headingCount: headings.length,
          linksDiscovered: discoveredLinks.length,
        },
        'HTML extraction completed'
      );

      return {
        fullText,
        title: title || undefined,
        headings: headings.length > 0 ? headings : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        diagnostics: {
          extractionMethod: 'cheerio',
          hasText: true,
          textLength: fullText.length,
          headingCount: headings.length,
          linksDiscovered: discoveredLinks.length,
        },
        discoveredLinks,
      };
    } catch (error) {
      logger.error({ error }, 'HTML extraction failed');
      
      if (error instanceof Error && error.message.includes('empty text')) {
        throw error; // Re-throw validation errors
      }
      
      throw new Error(`HTML extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

