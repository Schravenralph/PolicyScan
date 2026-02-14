/**
 * Horst aan de Maas Betaalbare Huisvesting Scraper
 * 
 * Specialized scraper for affordable housing (betaalbare huisvesting) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Affordable housing policies
 * - Social housing regulations
 * - Housing development plans
 * - Related planning documents
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toRelevanceScore } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Keywords specific to affordable housing
 */
const BETAALBARE_HUISVESTING_KEYWORDS = [
    'betaalbare',
    'betaalbare huisvesting',
    'betaalbare woning',
    'betaalbare woningen',
    'sociale woningbouw',
    'woningbouw',
    'woning',
    'woningen',
    'huisvesting',
    'huisvestingsbeleid',
    'woningbeleid',
    'woningnood',
    'woningmarkt',
    'huurwoning',
    'huurwoningen',
    'koopwoning',
    'koopwoningen',
    'starterswoning',
    'starterswoningen',
    'sociale huur',
    'huurtoeslag',
    'woningcorporatie',
    'woningcorporaties',
    'volkshuisvesting',
    'woningbouwvereniging',
    'woningbouwproject',
    'woningbouwprojecten',
    'bouwproject',
    'bouwprojecten',
    'woningbouwlocatie',
    'woningbouwlocaties',
    'woonruimte',
    'woonruimtes',
    'woonvoorziening',
    'woonvoorzieningen'
];

/**
 * Specific index pages related to affordable housing
 */
const BETAALBARE_HUISVESTING_INDEX_PAGES = [
    '/wonen-en-leven/wonen',
    '/wonen-en-leven/bouwen-en-verbouwen',
    '/bestuur/beleid/woningbeleid',
    '/bestuur/beleid/huisvestingsbeleid',
    '/bestuur/beleid/volkshuisvesting',
    '/ondernemen/vestigingsklimaat'
];

/**
 * Specialized scraper for Horst aan de Maas affordable housing
 */
export class HorstAanDeMaasBetaalbareHuisvestingScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized affordable housing pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        logger.info(`🏘️ [Horst - Betaalbare Huisvesting] Starting specialized scrape for affordable housing`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized housing pages
        const housingDocs = await this.scrapeBetaalbareHuisvestingPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...housingDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        logger.info(`📊 [Horst - Betaalbare Huisvesting] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to affordable housing
     */
    private async scrapeBetaalbareHuisvestingPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of BETAALBARE_HUISVESTING_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                logger.info(`🏘️ [Horst - Betaalbare Huisvesting] Scraping housing page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to affordable housing
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for affordable housing related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return BETAALBARE_HUISVESTING_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for affordable housing documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (error) {
                        logger.warn({ error }, `⚠️  [Horst - Betaalbare Huisvesting] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Woningbeleid';
                    const hasRelevantContent = BETAALBARE_HUISVESTING_KEYWORDS.some(keyword =>
                        pageContent.toLowerCase().includes(keyword.toLowerCase()) ||
                        title.toLowerCase().includes(keyword.toLowerCase())
                    );

                    if (hasRelevantContent) {
                        documents.push({
                            titel: title,
                            url: url,
                            website_url: this.baseUrl,
                            website_titel: 'Gemeente Horst aan de Maas',
                            samenvatting: this.generateSummary(pageContent, title),
                            type_document: 'Beleidsnota' as DocumentType,
                            publicatiedatum: null,
                            relevanceScore: toRelevanceScore(0.8)
                        });
                    }
                }
            } catch (error) {
                logger.warn({ error }, `⚠️  [Horst - Betaalbare Huisvesting] Failed to scrape housing page ${path}:`);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for affordable housing topics
     */
    protected isRelevantPolicyUrl(
        url: string,
        text: string = '',
        onderwerp: string = '',
        thema: string = ''
    ): boolean {
        const urlLower = url.toLowerCase();
        const textLower = text.toLowerCase();
        const combinedText = `${urlLower} ${textLower} ${onderwerp.toLowerCase()} ${thema.toLowerCase()}`;

        // Check for affordable housing keywords
        if (BETAALBARE_HUISVESTING_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with affordable housing terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add housing-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'betaalbare huisvesting',
            'woningbouw',
            'huisvesting'
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
     * Enhanced relevance scoring for affordable housing documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for affordable housing keywords
        const keywordMatches = BETAALBARE_HUISVESTING_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasBetaalbareHuisvestingScraper(
    options?: ScraperOptions
): HorstAanDeMaasBetaalbareHuisvestingScraper {
    return new HorstAanDeMaasBetaalbareHuisvestingScraper(options);
}
