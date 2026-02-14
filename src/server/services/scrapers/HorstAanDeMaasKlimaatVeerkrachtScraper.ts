/**
 * Horst aan de Maas Klimaatverandering en Veerkracht Scraper
 * 
 * Specialized scraper for climate change and resilience (klimaatverandering en veerkracht) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Climate change mitigation strategies
 * - Community resilience planning
 * - Risk assessment and management
 * - Adaptation measures
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to climate change and resilience
 */
const KLIMAAT_VEERKRACHT_KEYWORDS = [
    'klimaatverandering',
    'klimaat',
    'veerkracht',
    'resilience',
    'weerbaarheid',
    'klimaatbestendig',
    'klimaatbestendigheid',
    'klimaatrisico',
    'klimaatrisico\'s',
    'kwetsbaarheid',
    'kwetsbaarheidsanalyse',
    'risicoanalyse',
    'risicomanagement',
    'klimaatadaptatie',
    'klimaatmitigatie',
    'klimaatdoelen',
    'klimaatneutraal',
    'klimaatbeleid',
    'klimaatstrategie',
    'klimaatplan',
    'klimaatvisie',
    'overstroming',
    'overstromingen',
    'overstromingsrisico',
    'wateroverlast',
    'droogte',
    'hitte',
    'hitte-eiland',
    'extreme weersomstandigheden',
    'weersextremen',
    'klimaatstresstest',
    'klimaatscenario',
    'klimaatscenario\'s',
    'adaptatie',
    'mitigatie',
    'co2',
    'co₂',
    'emissie',
    'emissies',
    'uitstoot',
    'klimaatbestendige stad',
    'klimaatbestendige gemeente',
    'veerkrachtige gemeente',
    'weerbare gemeente'
];

/**
 * Specific index pages related to climate change and resilience
 */
const KLIMAAT_VEERKRACHT_INDEX_PAGES = [
    '/wonen-en-leven/duurzaamheid',
    '/wonen-en-leven/klimaat',
    '/bestuur/beleid/klimaat',
    '/bestuur/beleid/duurzaamheid',
    '/bestuur/beleid/milieu',
    '/bestuur/beleid/veiligheid',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas climate change and resilience
 */
export class HorstAanDeMaasKlimaatVeerkrachtScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized climate change and resilience pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`🌍 [Horst - Klimaat Veerkracht] Starting specialized scrape for climate change and resilience`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized climate change and resilience pages
        const climateDocs = await this.scrapeKlimaatVeerkrachtPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...climateDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Klimaat Veerkracht] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to climate change and resilience
     */
    private async scrapeKlimaatVeerkrachtPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of KLIMAAT_VEERKRACHT_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`🌍 [Horst - Klimaat Veerkracht] Scraping climate page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to climate change and resilience
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for climate change and resilience related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return KLIMAAT_VEERKRACHT_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for climate change and resilience documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Klimaat Veerkracht] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Klimaatbeleid';
                    const hasRelevantContent = KLIMAAT_VEERKRACHT_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Klimaat Veerkracht] Failed to scrape climate page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for climate change and resilience topics
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

        // Check for climate change and resilience keywords
        if (KLIMAAT_VEERKRACHT_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with climate change and resilience terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add climate-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'klimaatverandering',
            'veerkracht',
            'klimaat'
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
     * Enhanced relevance scoring for climate change and resilience documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for climate change and resilience keywords
        const keywordMatches = KLIMAAT_VEERKRACHT_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasKlimaatVeerkrachtScraper(
    options?: ScraperOptions
): HorstAanDeMaasKlimaatVeerkrachtScraper {
    return new HorstAanDeMaasKlimaatVeerkrachtScraper(options);
}
