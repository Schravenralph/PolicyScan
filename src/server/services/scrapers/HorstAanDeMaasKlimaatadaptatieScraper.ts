/**
 * Horst aan de Maas Klimaatadaptatie Scraper
 * 
 * Specialized scraper for climate adaptation (klimaatadaptatie) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Climate adaptation strategies
 * - Water management
 * - Heat island mitigation
 * - Flood prevention measures
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to climate adaptation
 */
const KLIMAATADAPTATIE_KEYWORDS = [
    'klimaatadaptatie',
    'klimaat',
    'adaptatie',
    'klimaatverandering',
    'klimaatbestendig',
    'klimaatbestendigheid',
    'wateroverlast',
    'waterberging',
    'waterbeheer',
    'watermanagement',
    'overstroming',
    'overstromingen',
    'overstromingsrisico',
    'hitte',
    'hitte-eiland',
    'hitte-eilanden',
    'droogte',
    'droogtebestendig',
    'watertekort',
    'waterbeschikbaarheid',
    'regenwater',
    'regenwaterafvoer',
    'regenwaterberging',
    'groen',
    'groene infrastructuur',
    'bomen',
    'verkoeling',
    'verkoelend',
    'verharding',
    'verhard oppervlak',
    'verharde oppervlakken',
    'infiltratie',
    'waterdoorlatend',
    'klimaatstresstest',
    'klimaatrisico',
    'klimaatrisico\'s',
    'kwetsbaarheid',
    'kwetsbaarheidsanalyse',
    'weerbaarheid',
    'klimaatbestendige stad',
    'klimaatbestendige gemeente'
];

/**
 * Specific index pages related to climate adaptation
 */
const KLIMAATADAPTATIE_INDEX_PAGES = [
    '/wonen-en-leven/duurzaamheid',
    '/wonen-en-leven/klimaat',
    '/bestuur/beleid/klimaat',
    '/bestuur/beleid/duurzaamheid',
    '/bestuur/beleid/milieu',
    '/bestuur/beleid/water',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas climate adaptation
 */
export class HorstAanDeMaasKlimaatadaptatieScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized climate adaptation pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`🌡️ [Horst - Klimaatadaptatie] Starting specialized scrape for climate adaptation`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized climate adaptation pages
        const climateDocs = await this.scrapeKlimaatadaptatiePages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...climateDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Klimaatadaptatie] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to climate adaptation
     */
    private async scrapeKlimaatadaptatiePages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of KLIMAATADAPTATIE_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`🌡️ [Horst - Klimaatadaptatie] Scraping climate page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to climate adaptation
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for climate adaptation related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return KLIMAATADAPTATIE_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for climate adaptation documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Klimaatadaptatie] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Klimaatbeleid';
                    const hasRelevantContent = KLIMAATADAPTATIE_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Klimaatadaptatie] Failed to scrape climate page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for climate adaptation topics
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

        // Check for climate adaptation keywords
        if (KLIMAATADAPTATIE_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with climate adaptation terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add climate-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'klimaatadaptatie',
            'klimaat',
            'waterbeheer'
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
     * Enhanced relevance scoring for climate adaptation documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for climate adaptation keywords
        const keywordMatches = KLIMAATADAPTATIE_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasKlimaatadaptatieScraper(
    options?: ScraperOptions
): HorstAanDeMaasKlimaatadaptatieScraper {
    return new HorstAanDeMaasKlimaatadaptatieScraper(options);
}

