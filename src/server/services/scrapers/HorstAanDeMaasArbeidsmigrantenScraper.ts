/**
 * Horst aan de Maas Arbeidsmigranten Huisvesting Scraper
 * 
 * Specialized scraper for labor migrant housing (arbeidsmigranten huisvesting) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Housing regulations for labor migrants
 * - Accommodation policies
 * - Related planning documents
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../../services/infrastructure/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Keywords specific to labor migrant housing
 */
const ARBEIDSMIGRANTEN_KEYWORDS = [
    'arbeidsmigrant',
    'arbeidsmigranten',
    'seizoensarbeid',
    'seizoensarbeider',
    'migrantenwerk',
    'migrantenarbeid',
    'tijdelijke huisvesting',
    'arbeidershuisvesting',
    'werknemershuisvesting',
    'seizoenarbeidershuisvesting',
    'migrantenhuisvesting',
    'logies',
    'tijdelijke verblijfsaccommodatie',
    'tijdelijke accommodatie',
    'arbeiderswoning',
    'arbeiderswoningen',
    'werkgelegenheid',
    'werkvergunning',
    'woningnood',
    'huisvestingsbeleid',
    'woningbeleid',
    'glastuinbouw',
    'agrarische sector',
    'intensieve veehouderij',
    'tuinbouw'
];

/**
 * Specific index pages related to labor migrant housing
 */
const ARBEIDSMIGRANTEN_INDEX_PAGES = [
    '/wonen-en-leven/wonen',
    '/wonen-en-leven/bouwen-en-verbouwen',
    '/ondernemen/vestigingsklimaat',
    '/ondernemen/werkgelegenheid',
    '/bestuur/beleid/woningbeleid',
    '/bestuur/beleid/huisvestingsbeleid'
];

/**
 * Specialized scraper for Horst aan de Maas labor migrant housing
 */
export class HorstAanDeMaasArbeidsmigrantenScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized labor migrant housing pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        logger.info(`🏠 [Horst - Arbeidsmigranten] Starting specialized scrape for labor migrant housing`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized housing pages
        const housingDocs = await this.scrapeArbeidsmigrantenHuisvestingPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...housingDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        logger.info({ count: uniqueDocs.length }, `📊 [Horst - Arbeidsmigranten] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to labor migrant housing
     */
    private async scrapeArbeidsmigrantenHuisvestingPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of ARBEIDSMIGRANTEN_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                logger.info({ url }, `🏠 [Horst - Arbeidsmigranten] Scraping housing page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to labor migrant housing
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for labor migrant housing related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return ARBEIDSMIGRANTEN_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for labor migrant housing documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (error) {
                        logger.warn({ error, link }, `⚠️  [Horst - Arbeidsmigranten] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Huisvestingsbeleid';
                    const hasRelevantContent = ARBEIDSMIGRANTEN_KEYWORDS.some(keyword =>
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
                logger.warn({ error, path }, `⚠️  [Horst - Arbeidsmigranten] Failed to scrape housing page ${path}`);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for labor migrant housing topics
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

        // Check for labor migrant housing keywords
        if (ARBEIDSMIGRANTEN_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with labor migrant housing terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add housing-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'huisvesting',
            'arbeidsmigranten',
            'woning'
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
     * Enhanced relevance scoring for labor migrant housing documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for labor migrant housing keywords
        const keywordMatches = ARBEIDSMIGRANTEN_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasArbeidsmigrantenScraper(
    options?: ScraperOptions
): HorstAanDeMaasArbeidsmigrantenScraper {
    return new HorstAanDeMaasArbeidsmigrantenScraper(options);
}
