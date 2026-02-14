/**
 * Horst aan de Maas Duurzame Mobiliteit Scraper
 * 
 * Specialized scraper for sustainable mobility (duurzame mobiliteit) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Sustainable transport policies
 * - Public transportation planning
 * - Cycling infrastructure
 * - Electric vehicle infrastructure
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toRelevanceScore } from '../infrastructure/types.js';
import type { CheerioAPI } from 'cheerio';
import { logger } from '../../utils/logger.js';

/**
 * Keywords specific to sustainable mobility
 */
const DUURZAME_MOBILITEIT_KEYWORDS = [
    'mobiliteit',
    'duurzame mobiliteit',
    'vervoer',
    'verkeer',
    'duurzaam vervoer',
    'duurzaam verkeer',
    'openbaar vervoer',
    'ov',
    'ov-knooppunt',
    'ov-knooppunten',
    'openbaarvervoer',
    'bus',
    'bussen',
    'buslijn',
    'buslijnen',
    'trein',
    'treinen',
    'station',
    'stations',
    'fiets',
    'fietsen',
    'fietsinfrastructuur',
    'fietspad',
    'fietspaden',
    'fietsroute',
    'fietsroutes',
    'fietsenstalling',
    'fietsenstallingen',
    'elektrisch vervoer',
    'elektrisch verkeer',
    'elektrische auto',
    'elektrische auto\'s',
    'elektrische fiets',
    'elektrische fietsen',
    'elektrisch',
    'elektrificatie',
    'laadpaal',
    'laadpalen',
    'laadinfrastructuur',
    'deelmobiliteit',
    'deelauto',
    'deelauto\'s',
    'deelfiets',
    'deelfietsen',
    'autoluwe wijk',
    'autoluwe wijken',
    'verkeerscirculatie',
    'verkeersveiligheid',
    'verkeersplan',
    'mobiliteitsplan',
    'mobiliteitsvisie',
    'mobiliteitsbeleid',
    'vervoersplan',
    'vervoersvisie',
    'vervoersbeleid',
    'parkeerbeleid',
    'parkeerplaatsen',
    'parkeerterreinen',
    'ov-verbinding',
    'ov-verbindingen',
    'bereikbaarheid',
    'bereikbaarheidsplan'
];

/**
 * Specific index pages related to sustainable mobility
 */
const DUURZAME_MOBILITEIT_INDEX_PAGES = [
    '/wonen-en-leven/verkeer',
    '/wonen-en-leven/mobiliteit',
    '/ondernemen/bereikbaarheid',
    '/bestuur/beleid/mobiliteit',
    '/bestuur/beleid/verkeer',
    '/bestuur/beleid/vervoer',
    '/omgevingsvisie-2040'
];

/**
 * Interface for links with both URL and anchor text for better relevance matching
 */
interface LinkWithText {
    url: string;
    text: string;
}

/**
 * Specialized scraper for Horst aan de Maas sustainable mobility
 */
export class HorstAanDeMaasDuurzameMobiliteitScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Normalize URL by removing fragments and common tracking parameters
     */
    private canonicalizeUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            // Remove fragment
            urlObj.hash = '';
            // Remove common tracking parameters
            const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
            trackingParams.forEach(param => urlObj.searchParams.delete(param));
            // Remove trailing slash if not root
            let pathname = urlObj.pathname;
            if (pathname !== '/' && pathname.endsWith('/')) {
                pathname = pathname.slice(0, -1);
            }
            urlObj.pathname = pathname;
            return urlObj.toString();
        } catch {
            // If URL parsing fails, return as-is
            return url;
        }
    }

    /**
     * Extract links with both URL and anchor text for better relevance matching
     */
    private extractLinksWithText($: CheerioAPI, selector: string, baseUrl: string): LinkWithText[] {
        const links: LinkWithText[] = [];
        const seen = new Set<string>();

        $(selector).each((_index: number, element) => {
            const href = $(element).attr('href');
            if (!href || this.isExcludedProtocol(href)) return;

            const absoluteUrl = this.toAbsoluteUrl(href, baseUrl);
            // Only include http/https URLs
            if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) return;

            const canonicalUrl = this.canonicalizeUrl(absoluteUrl);
            // Skip duplicates
            if (seen.has(canonicalUrl)) return;
            seen.add(canonicalUrl);

            const text = $(element).text().trim();
            links.push({
                url: canonicalUrl,
                text: text
            });
        });

        return links;
    }

    /**
     * Normalize text for keyword matching (remove diacritics, collapse whitespace, replace hyphens)
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .replace(/[-_/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Override scrape method to add specialized sustainable mobility pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        logger.info(`🚲 [Horst - Duurzame Mobiliteit] Starting specialized scrape for sustainable mobility`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized sustainable mobility pages
        const mobilityDocs = await this.scrapeDuurzameMobiliteitPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...mobilityDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        logger.info(`📊 [Horst - Duurzame Mobiliteit] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to sustainable mobility
     */
    private async scrapeDuurzameMobiliteitPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of DUURZAME_MOBILITEIT_INDEX_PAGES) {
            // Structured counters for observability
            let extractedLinks = 0;
            let relevantLinks = 0;
            let scrapedSuccess = 0;
            let scrapedFail = 0;

            try {
                const url = new URL(path, this.baseUrl).toString();
                logger.info(`🚲 [Horst - Duurzame Mobiliteit] Scraping mobility page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Early exit if followLinks is disabled - still process index page content
                if (!this.options.followLinks) {
                    logger.info(`⏭️  [Horst - Duurzame Mobiliteit] followLinks disabled, skipping link extraction for ${url}`);
                } else {
                    // Extract links with anchor text for better relevance matching
                    const linksWithText = this.extractLinksWithText($, 'main a, .content a, article a, .view-content a', url);
                    extractedLinks = linksWithText.length;
                    
                    // Filter for sustainable mobility related links using both URL and text
                    const relevantLinksWithText = linksWithText.filter(({ url: linkUrl, text }) => {
                        const normalizedUrl = this.normalizeText(linkUrl);
                        const normalizedText = this.normalizeText(text);
                        const combined = `${normalizedUrl} ${normalizedText}`;
                        
                        return DUURZAME_MOBILITEIT_KEYWORDS.some(keyword => {
                            const normalizedKeyword = this.normalizeText(keyword);
                            return combined.includes(normalizedKeyword);
                        }) || this.isRelevantPolicyUrl(linkUrl, text, onderwerp, thema);
                    });
                    
                    relevantLinks = relevantLinksWithText.length;
                    
                    // Deduplicate by URL before slicing
                    const uniqueRelevantLinks = Array.from(
                        new Map(relevantLinksWithText.map(link => [link.url, link])).values()
                    );
                    
                    // Determine max links per page (fewer for large pages like omgevingsvisie)
                    const maxLinks = path === '/omgevingsvisie-2040' ? 5 : 15;
                    const linksToScrape = uniqueRelevantLinks.slice(0, maxLinks);
                    
                    logger.info(`📊 [Horst - Duurzame Mobiliteit] ${url}: extracted=${extractedLinks}, relevant=${relevantLinks}, unique=${uniqueRelevantLinks.length}, scraping=${linksToScrape.length}`);

                    // Scrape links with controlled concurrency (3 concurrent requests)
                    const batchSize = 3;
                    for (let i = 0; i < linksToScrape.length; i += batchSize) {
                        const batch = linksToScrape.slice(i, i + batchSize);
                        const batchPromises = batch.map(async ({ url: linkUrl }) => {
                            try {
                                const doc = await this.scrapeDetailPage(linkUrl, onderwerp, thema, {});
                                if (doc) {
                                    // Boost relevance for sustainable mobility documents
                                    doc.relevanceScore = toRelevanceScore(
                                        Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                                    );
                                    scrapedSuccess++;
                                    return doc;
                                }
                                return null;
                            } catch (error) {
                                scrapedFail++;
                                const message = error instanceof Error ? error.message : String(error);
                                const errorName = error instanceof Error ? error.name : 'Unknown';
                                // Check for status code if available
                                const statusCode = error && typeof error === 'object' && 'status' in error 
                                    ? ` (status: ${error.status})` 
                                    : '';
                                logger.warn(
                                    { err: error },
                                    `⚠️  [Horst - Duurzame Mobiliteit] Failed to scrape: ${linkUrl} (${errorName}: ${message}${statusCode})`
                                );
                                return null;
                            }
                        });
                        
                        const batchResults = await Promise.all(batchPromises);
                        documents.push(...batchResults.filter((doc): doc is ScrapedDocument => doc !== null));
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Mobiliteitsbeleid';
                    const normalizedContent = this.normalizeText(pageContent);
                    const normalizedTitle = this.normalizeText(title);
                    const hasRelevantContent = DUURZAME_MOBILITEIT_KEYWORDS.some(keyword =>
                        normalizedContent.includes(this.normalizeText(keyword)) ||
                        normalizedTitle.includes(this.normalizeText(keyword))
                    );

                    if (hasRelevantContent) {
                        // Use 'Webpagina' for index/landing pages instead of 'Beleidsnota'
                        documents.push({
                            titel: title,
                            url: url,
                            website_url: this.baseUrl,
                            website_titel: 'Gemeente Horst aan de Maas',
                            samenvatting: this.generateSummary(pageContent, title),
                            type_document: 'Webpagina' as DocumentType,
                            publicatiedatum: null,
                            relevanceScore: toRelevanceScore(0.8)
                        });
                    }
                }

                // Log structured metrics
                if (this.options.followLinks) {
                    logger.info(`📈 [Horst - Duurzame Mobiliteit] ${url} metrics: extracted=${extractedLinks}, relevant=${relevantLinks}, success=${scrapedSuccess}, failed=${scrapedFail}`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const errorName = error instanceof Error ? error.name : 'Unknown';
                logger.warn({ err: error }, `⚠️  [Horst - Duurzame Mobiliteit] Failed to scrape mobility page ${path} (${errorName}: ${message})`);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for sustainable mobility topics
     */
    protected isRelevantPolicyUrl(
        url: string,
        text: string = '',
        onderwerp: string = '',
        thema: string = ''
    ): boolean {
        const normalizedUrl = this.normalizeText(url);
        const normalizedText = this.normalizeText(text);
        const normalizedOnderwerp = this.normalizeText(onderwerp);
        const normalizedThema = this.normalizeText(thema);
        const combinedText = `${normalizedUrl} ${normalizedText} ${normalizedOnderwerp} ${normalizedThema}`;

        // Check for sustainable mobility keywords using normalized matching
        if (DUURZAME_MOBILITEIT_KEYWORDS.some(keyword => 
            combinedText.includes(this.normalizeText(keyword))
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with sustainable mobility terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add mobility-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'duurzame mobiliteit',
            'mobiliteit',
            'vervoer'
        ].filter(Boolean)
         .map(s => s.trim())
         .filter(s => s.length > 0);

        const combinedQuery = searchTerms.join(' ');

        const searchParams = new URLSearchParams();
        searchParams.set('keys', combinedQuery);

        const searchUrl = new URL('/zoeken', this.baseUrl);
        searchUrl.search = searchParams.toString();

        return searchUrl.toString();
    }

    /**
     * Enhanced relevance scoring for sustainable mobility documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const normalizedText = this.normalizeText(`${title} ${content}`);
        
        // Count keyword matches with normalized text
        const keywordMatches = DUURZAME_MOBILITEIT_KEYWORDS.filter(keyword =>
            normalizedText.includes(this.normalizeText(keyword))
        ).length;
        
        // Cap keyword boost separately to avoid everything scoring 1.0
        // Use lower per-keyword weight (0.05) and cap total boost at 0.3
        const keywordBoost = Math.min(0.3, keywordMatches * 0.05);
        score = Math.min(1.0, score + keywordBoost);
        
        return score;
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasDuurzameMobiliteitScraper(
    options?: ScraperOptions
): HorstAanDeMaasDuurzameMobiliteitScraper {
    return new HorstAanDeMaasDuurzameMobiliteitScraper(options);
}
