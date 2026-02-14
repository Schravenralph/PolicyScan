import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { ScrapedDocument, DocumentType } from '../infrastructure/types.js';
import { DomainClassificationService } from '../extraction/DomainClassificationService.js';
import { robotsTxtParser } from './robotsTxtParser.js';
import { scraperConfig } from '../../config/scraperConfig.js';

interface ScoredLink {
  title: string;
  url: string;
  description: string;
  score: number;
}

export class WebsiteScraper {
  private domainClassifier: DomainClassificationService;
  private lastRequestTime: Map<string, number> = new Map(); // Track last request time per domain

  constructor() {
    this.domainClassifier = new DomainClassificationService();
  }

  /**
   * Scrape a website for documents based on query parameters
   */
  async scrapeWebsite(
    websiteUrl: string,
    onderwerp: string,
    thema: string,
    maxPages: number = 5
  ): Promise<ScrapedDocument[]> {
    const documents: ScrapedDocument[] = [];

    try {
      console.log(`Scraping website: ${websiteUrl}`);

      // Check robots.txt before scraping
      const userAgent = scraperConfig.userAgent;
      const isAllowed = await robotsTxtParser.isUrlAllowed(websiteUrl, userAgent);
      
      if (!isAllowed) {
        console.warn(`⚠️  URL ${websiteUrl} is disallowed by robots.txt. Skipping.`);
        return documents;
      }

      // Enforce crawl-delay from robots.txt
      const urlObj = new URL(websiteUrl);
      const domain = urlObj.hostname;
      await this.enforceCrawlDelay(domain, userAgent);

      const response = await axios.get(websiteUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': userAgent
        }
      });

      const $ = cheerio.load(response.data);

      // Extract the website title
      const websiteTitle = $('title').text().trim() || this.extractDomainName(websiteUrl);

      // Look for document links with relevance scoring
      const scoredLinks = this.extractRelevantLinksWithScoring($, websiteUrl, onderwerp, thema);

      // Filter links based on robots.txt rules
      const allowedLinks: ScoredLink[] = [];
      
      for (const link of scoredLinks) {
        const isLinkAllowed = await robotsTxtParser.isUrlAllowed(link.url, userAgent);
        if (isLinkAllowed) {
          allowedLinks.push(link);
        }
      }

      // Optionally discover links from sitemap
      const sitemapLinks = await this.discoverLinksFromSitemap(domain, userAgent, onderwerp, thema);
      if (sitemapLinks.length > 0) {
        // Merge sitemap links with discovered links (deduplicate by URL)
        const existingUrls = new Set(allowedLinks.map(l => l.url));
        for (const sitemapLink of sitemapLinks) {
          if (!existingUrls.has(sitemapLink.url)) {
            allowedLinks.push(sitemapLink);
          }
        }
      }

      // Sort by relevance score (highest first) and limit to maxPages
      const limitedLinks = allowedLinks
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPages);

      for (const link of limitedLinks) {
        // Classify document content
        const classificationText = `${link.title} ${link.description}`;
        const classification = this.domainClassifier.classify(classificationText, link.url);

        // Calculate content quality scores
        const qualityScores = this.calculateContentQuality(link, onderwerp, thema);

        // Detect language
        const language = this.detectLanguage(classificationText);

        documents.push({
          titel: link.title,
          url: link.url,
          website_url: websiteUrl,
          website_titel: websiteTitle,
          samenvatting: link.description,
          type_document: this.determineDocumentType(link.url),
          publicatiedatum: null,
          domain: classification.domain !== 'unknown' ? classification.domain : undefined,
          domainConfidence: classification.confidence > 0 ? classification.confidence : undefined,
          domainKeywords: classification.keywords.length > 0 ? classification.keywords : undefined,
          // Enhanced classification metadata
          contentQuality: qualityScores,
          language: language,
          classificationTimestamp: new Date().toISOString()
        });
      }

      console.log(`Scraped ${documents.length} documents from ${websiteUrl}`);
    } catch (error) {
      console.error(`Error scraping website ${websiteUrl}:`, error);
    }

    return documents;
  }

  /**
   * Extract relevant links from HTML with relevance scoring
   * Improved link discovery that scores links based on multiple factors
   */
  private extractRelevantLinksWithScoring(
    $: cheerio.CheerioAPI,
    baseUrl: string,
    onderwerp: string,
    thema: string
  ): ScoredLink[] {
    const links: ScoredLink[] = [];
    const seen = new Set<string>();

    // Priority selectors: prefer links in semantic HTML5 elements
    const prioritySelectors = [
      'article a', 'main a', 'section[role="main"] a', // Main content areas
      'nav a[href*="beleid"]', 'nav a[href*="document"]', // Policy/document navigation
      '.content a', '.main-content a', '.document-list a', // Common content classes
      'a[href$=".pdf"]', 'a[href$=".doc"]', 'a[href$=".docx"]' // Direct document links
    ];

    const allSelectors = ['a']; // Fallback to all links

    // First pass: collect links from priority areas
    prioritySelectors.forEach(selector => {
      const elements = $(selector).toArray().filter((el): el is Element => el.type === 'tag');
      elements.forEach((element: Element) => {
        this.processLink($, element, baseUrl, onderwerp, thema, seen, links, true);
      });
    });

    // Second pass: collect remaining relevant links
    const allElements = $(allSelectors.join(', ')).toArray().filter((el): el is Element => el.type === 'tag');
    allElements.forEach((element: Element) => {
      this.processLink($, element, baseUrl, onderwerp, thema, seen, links, false);
    });

    return links;
  }

  /**
   * Process a single link element and add it to the results if relevant
   */
  private processLink(
    $: cheerio.CheerioAPI,
    element: Element,
    baseUrl: string,
    onderwerp: string,
    thema: string,
    seen: Set<string>,
    links: ScoredLink[],
    isPriorityArea: boolean
  ): void {
    const link = $(element);
    const href = link.attr('href');
    const text = link.text().trim();

    if (!href) return;

    // Resolve relative URLs
    const fullUrl = this.resolveUrl(href, baseUrl);

    // Skip duplicates
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    // Basic relevance check
    if (!this.isRelevantLink(fullUrl, text, onderwerp, thema)) return;

    // Calculate relevance score
    const score = this.calculateRelevanceScore(
      fullUrl,
      text,
      onderwerp,
      thema,
      link,
      $,
      isPriorityArea
    );

    // Get enhanced description from surrounding context
    const description = this.extractLinkDescription(link, $);

    links.push({
      title: text || this.extractTitleFromUrl(fullUrl),
      url: fullUrl,
      description,
      score
    });
  }

  /**
   * Calculate relevance score for a link based on multiple factors
   */
  private calculateRelevanceScore(
    url: string,
    text: string,
    onderwerp: string,
    thema: string,
    linkElement: cheerio.Cheerio<Element>,
    $: cheerio.CheerioAPI,
    isPriorityArea: boolean
  ): number {
    let score = 0;
    const lowerUrl = url.toLowerCase();
    const lowerText = text.toLowerCase();
    const lowerOnderwerp = onderwerp.toLowerCase();
    const lowerThema = thema.toLowerCase();

    // Base score for priority areas (main content, articles, etc.)
    if (isPriorityArea) {
      score += 10;
    }

    // Document type scoring
    if (lowerUrl.endsWith('.pdf')) score += 30; // PDFs are highly relevant
    if (lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx')) score += 25;
    if (lowerUrl.includes('beleid')) score += 20;
    if (lowerUrl.includes('document') || lowerUrl.includes('publicatie')) score += 15;
    if (lowerUrl.includes('nota') || lowerUrl.includes('plan')) score += 15;
    if (lowerUrl.includes('verordening') || lowerUrl.includes('besluit')) score += 15;

    // Keyword matching in URL
    if (lowerUrl.includes(lowerOnderwerp)) score += 25;
    if (lowerUrl.includes(lowerThema)) score += 20;

    // Keyword matching in link text
    if (lowerText.includes(lowerOnderwerp)) score += 20;
    if (lowerText.includes(lowerThema)) score += 15;

    // Context scoring (check parent elements for relevance indicators)
    const parent = linkElement.parent();
    const parentText = parent.text().toLowerCase();
    if (parentText.includes(lowerOnderwerp)) score += 10;
    if (parentText.includes(lowerThema)) score += 8;

    // Semantic HTML scoring
    if (linkElement.closest('article').length > 0) score += 5;
    if (linkElement.closest('nav').length > 0) score += 3;
    if (linkElement.closest('main, section[role="main"]').length > 0) score += 5;

    // Negative scoring for low-value patterns
    if (lowerUrl.includes('/contact') || lowerUrl.includes('/cookie')) score -= 20;
    if (lowerUrl.includes('social') || lowerUrl.includes('share')) score -= 15;
    if (lowerText.length < 3) score -= 10; // Very short link text is less informative

    return Math.max(0, score); // Ensure non-negative
  }

  /**
   * Extract enhanced description from link context
   */
  private extractLinkDescription(linkElement: cheerio.Cheerio<Element>, $: cheerio.CheerioAPI): string {
    // Try to get description from multiple sources
    let description = '';

    // 1. Check for aria-label or title attribute
    description = linkElement.attr('aria-label') || linkElement.attr('title') || '';

    // 2. Get text from parent paragraph or list item
    if (!description) {
      const parent = linkElement.closest('p, li, div.description, div.summary');
      if (parent.length > 0) {
        description = parent.text().trim().substring(0, 200);
      }
    }

    // 3. Get surrounding text from article or section
    if (!description || description.length < 20) {
      const container = linkElement.closest('article, section, .content, .main-content');
      if (container.length > 0) {
        const containerText = container.text().trim();
        const linkText = linkElement.text().trim();
        const linkIndex = containerText.indexOf(linkText);
        if (linkIndex >= 0) {
          // Extract text around the link (50 chars before and after)
          const start = Math.max(0, linkIndex - 50);
          const end = Math.min(containerText.length, linkIndex + linkText.length + 50);
          description = containerText.substring(start, end).trim();
        }
      }
    }

    // 4. Fallback to link text if no description found
    if (!description) {
      description = linkElement.text().trim();
    }

    return description.substring(0, 250); // Limit length
  }

  /**
   * Extract title from URL if link text is empty
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      const lastPart = pathParts[pathParts.length - 1] || '';
      // Remove file extension and decode URL
      return decodeURIComponent(lastPart.replace(/\.(pdf|doc|docx|html?)$/i, ''))
        .replace(/[-_]/g, ' ')
        .trim() || 'Document';
    } catch {
      return 'Document';
    }
  }

  /**
   * Check if link is relevant to the query
   */
  private isRelevantLink(
    url: string,
    text: string,
    onderwerp: string,
    thema: string
  ): boolean {
    const lowerUrl = url.toLowerCase();
    const lowerText = text.toLowerCase();
    const lowerOnderwerp = onderwerp.toLowerCase();
    const lowerThema = thema.toLowerCase();

    // Exclude common non-content links
    const excludePatterns = [
      'javascript:',
      'mailto:',
      '#',
      '/contact',
      '/cookie',
      '/privacy',
      '/disclaimer',
      'facebook.com',
      'twitter.com',
      'linkedin.com',
      'instagram.com'
    ];

    if (excludePatterns.some(pattern => lowerUrl.includes(pattern))) {
      return false;
    }

    // Include PDFs and policy documents
    if (lowerUrl.includes('.pdf')) return true;
    if (lowerUrl.includes('beleid')) return true;
    if (lowerUrl.includes('document')) return true;
    if (lowerUrl.includes('publicatie')) return true;

    // Check for keyword matches in URL or text
    const hasOnderwerpMatch =
      lowerUrl.includes(lowerOnderwerp) || lowerText.includes(lowerOnderwerp);
    const hasThemaMatch =
      lowerUrl.includes(lowerThema) || lowerText.includes(lowerThema);

    return hasOnderwerpMatch || hasThemaMatch;
  }

  /**
   * Resolve relative URLs to absolute
   */
  private resolveUrl(href: string, baseUrl: string): string {
    try {
      const url = new URL(href, baseUrl);
      return url.href;
    } catch {
      return href;
    }
  }

  /**
   * Determine document type from URL
   */
  private determineDocumentType(url: string): DocumentType {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.endsWith('.pdf')) return 'PDF';
    if (lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx')) return 'Beleidsdocument';
    if (lowerUrl.includes('beleid')) return 'Beleidsdocument';
    if (lowerUrl.includes('verordening') || lowerUrl.includes('regelgeving')) return 'Verordening';
    if (lowerUrl.includes('rapport')) return 'Rapport';
    if (lowerUrl.includes('nieuws')) return 'Beleidsdocument';

    return 'Webpagina';
  }

  /**
   * Extract domain name from URL
   */
  private extractDomainName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Calculate content quality scores for a scraped link
   * Returns scores for relevance, completeness, and informativeness
   */
  private calculateContentQuality(
    link: ScoredLink,
    onderwerp: string,
    thema: string
  ): {
    relevance: number;
    completeness: number;
    informativeness: number;
    overall: number;
  } {
    // Relevance score: how well content matches query
    let relevanceScore = 0;
    const lowerTitle = link.title.toLowerCase();
    const lowerDescription = link.description.toLowerCase();
    const lowerOnderwerp = onderwerp.toLowerCase();
    const lowerThema = thema.toLowerCase();

    // Title relevance
    if (lowerTitle.includes(lowerOnderwerp)) relevanceScore += 30;
    if (lowerTitle.includes(lowerThema)) relevanceScore += 20;
    // Description relevance
    if (lowerDescription.includes(lowerOnderwerp)) relevanceScore += 20;
    if (lowerDescription.includes(lowerThema)) relevanceScore += 15;
    // URL relevance (already scored in link scoring, but add here too)
    if (link.url.toLowerCase().includes(lowerOnderwerp)) relevanceScore += 10;
    if (link.url.toLowerCase().includes(lowerThema)) relevanceScore += 5;

    relevanceScore = Math.min(100, relevanceScore);

    // Completeness score: how complete the metadata is
    let completenessScore = 0;
    if (link.title && link.title.trim().length > 0) completenessScore += 30;
    if (link.description && link.description.trim().length > 10) completenessScore += 30;
    if (link.url && link.url.trim().length > 0) completenessScore += 20;
    // Bonus for longer descriptions (more complete)
    if (link.description && link.description.length > 50) completenessScore += 10;
    if (link.description && link.description.length > 100) completenessScore += 10;

    completenessScore = Math.min(100, completenessScore);

    // Informativeness score: how informative the content is
    let informativenessScore = 0;
    // Longer titles/descriptions are generally more informative
    if (link.title && link.title.length > 20) informativenessScore += 20;
    if (link.title && link.title.length > 40) informativenessScore += 10;
    if (link.description && link.description.length > 50) informativenessScore += 30;
    if (link.description && link.description.length > 100) informativenessScore += 20;
    if (link.description && link.description.length > 200) informativenessScore += 10;
    // Penalty for very short or generic content
    if (link.title && link.title.length < 5) informativenessScore -= 20;
    if (link.description && link.description.length < 20) informativenessScore -= 20;

    informativenessScore = Math.max(0, Math.min(100, informativenessScore));

    // Overall score: weighted average
    const overallScore = Math.round(
      relevanceScore * 0.5 + completenessScore * 0.3 + informativenessScore * 0.2
    );

    return {
      relevance: Math.round(relevanceScore),
      completeness: Math.round(completenessScore),
      informativeness: Math.round(informativenessScore),
      overall: overallScore
    };
  }

  /**
   * Enforce crawl-delay from robots.txt
   * Waits for the required delay between requests to the same domain
   */
  private async enforceCrawlDelay(domain: string, userAgent: string): Promise<void> {
    try {
      const crawlDelay = await robotsTxtParser.getCrawlDelay(domain, userAgent);
      if (crawlDelay && crawlDelay > 0) {
        const lastRequest = this.lastRequestTime.get(domain) || 0;
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequest;
        const delayMs = crawlDelay * 1000; // Convert seconds to milliseconds

        if (timeSinceLastRequest < delayMs) {
          const waitTime = delayMs - timeSinceLastRequest;
          console.log(`⏳ Respecting robots.txt crawl-delay of ${crawlDelay}s for ${domain} (waiting ${waitTime}ms)`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime.set(domain, Date.now());
      }
    } catch (error) {
      // If crawl-delay check fails, log but continue
      console.warn(`⚠️  Failed to get crawl-delay for ${domain}:`, error instanceof Error ? error.message : error);
    }
  }

  /**
   * Discover links from sitemap
   * Fetches sitemap URLs from robots.txt and extracts relevant links
   */
  private async discoverLinksFromSitemap(
    domain: string,
    userAgent: string,
    onderwerp: string,
    thema: string
  ): Promise<ScoredLink[]> {
    try {
      // Use RobotsTxtParser class directly to access getRobotsTxt method
      const { RobotsTxtParser } = await import('./robotsTxtParser.js');
      const parser = new RobotsTxtParser();
      const robotsTxt = await parser.getRobotsTxt(domain);
      if (!robotsTxt || robotsTxt.sitemaps.length === 0) {
        return [];
      }

      const links: ScoredLink[] = [];
      const lowerOnderwerp = onderwerp.toLowerCase();
      const lowerThema = thema.toLowerCase();

      // Process first sitemap (can be enhanced to process all sitemaps)
      const sitemapUrl = robotsTxt.sitemaps[0];
      console.log(`🗺️  Discovering links from sitemap: ${sitemapUrl}`);

      try {
        const response = await axios.get(sitemapUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': userAgent
          }
        });

        // Parse XML sitemap
        const $ = cheerio.load(response.data, { xmlMode: true });

        // Extract URLs from sitemap (supports both sitemap index and URL set)
        $('urlset url loc, sitemapindex sitemap loc').each((_index, element) => {
          const url = $(element).text().trim();
          if (url) {
            // Check if URL is relevant to query
            const urlLower = url.toLowerCase();
            const isRelevant = 
              urlLower.includes(lowerOnderwerp) || 
              urlLower.includes(lowerThema) ||
              urlLower.includes('beleid') ||
              urlLower.includes('document') ||
              urlLower.endsWith('.pdf');

            if (isRelevant) {
              // Extract title from URL or use URL as title
              const title = this.extractTitleFromUrl(url);
              links.push({
                title,
                url,
                description: `Discovered from sitemap`,
                score: 15 // Base score for sitemap links
              });
            }
          }
        });

        console.log(`✅ Discovered ${links.length} relevant links from sitemap`);
      } catch (error) {
        console.warn(`⚠️  Failed to fetch sitemap ${sitemapUrl}:`, error instanceof Error ? error.message : error);
      }

      return links;
    } catch (error) {
      console.warn(`⚠️  Failed to discover links from sitemap for ${domain}:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Detect language of content
   * Simple heuristic-based detection (can be enhanced with proper language detection library)
   */
  private detectLanguage(text: string): string {
    if (!text || text.trim().length === 0) {
      return 'unknown';
    }

    const lowerText = text.toLowerCase();
    
    // Dutch language indicators
    const dutchIndicators = [
      'de', 'het', 'een', 'van', 'en', 'in', 'op', 'voor', 'met', 'aan',
      'is', 'zijn', 'wordt', 'worden', 'heeft', 'hebben', 'kan', 'kunnen',
      'beleid', 'document', 'verordening', 'nota', 'plan', 'rapport'
    ];
    
    // English language indicators
    const englishIndicators = [
      'the', 'and', 'is', 'are', 'was', 'were', 'have', 'has', 'can', 'could',
      'policy', 'document', 'regulation', 'report', 'plan', 'note'
    ];

    let dutchCount = 0;
    let englishCount = 0;

    for (const indicator of dutchIndicators) {
      const regex = new RegExp(`\\b${indicator}\\b`, 'i');
      if (regex.test(lowerText)) {
        dutchCount++;
      }
    }

    for (const indicator of englishIndicators) {
      const regex = new RegExp(`\\b${indicator}\\b`, 'i');
      if (regex.test(lowerText)) {
        englishCount++;
      }
    }

    // Determine language based on indicator count
    if (dutchCount > englishCount && dutchCount > 2) {
      return 'nl';
    } else if (englishCount > dutchCount && englishCount > 2) {
      return 'en';
    } else if (dutchCount > 0 || englishCount > 0) {
      // Default to Dutch if we have some indicators but not enough to be certain
      return dutchCount >= englishCount ? 'nl' : 'en';
    }

    return 'unknown';
  }
}
