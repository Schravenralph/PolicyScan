/**
 * Horst aan de Maas Stedelijke Vernieuwing Scraper
 * 
 * Specialized scraper for urban renewal (stedelijke vernieuwing) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Urban renewal projects
 * - Neighborhood regeneration
 * - Urban transformation
 * - Area redevelopment
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to urban renewal
 */
const STEDELIJKE_VERNIEUWING_KEYWORDS = [
    'vernieuwing',
    'stedelijke vernieuwing',
    'stedelijk',
    'herstructurering',
    'transformatie',
    'herontwikkeling',
    'herontwikkelen',
    'herbestemming',
    'herbestemmen',
    'renovatie',
    'renoveren',
    'revitalisering',
    'revitaliseren',
    'opknappen',
    'opknap',
    'opwaardering',
    'opwaarderen',
    'wijkvernieuwing',
    'buurtvernieuwing',
    'gebiedsontwikkeling',
    'gebiedsontwikkeling',
    'gebiedstransformatie',
    'locatieontwikkeling',
    'projectontwikkeling',
    'vastgoedontwikkeling',
    'stedenbouw',
    'stedenbouwkundig',
    'stedenbouwkundige',
    'stedenbouwkundig plan',
    'stedenbouwkundige plannen',
    'masterplan',
    'masterplannen',
    'structuurvisie',
    'structuurvisies',
    'gebiedsvisie',
    'gebiedsvisies',
    'wijkplan',
    'wijkplannen',
    'buurtplan',
    'buurtplannen',
    'herstructureringsplan',
    'vernieuwingsplan',
    'vernieuwingsplannen',
    'transformatieplan',
    'transformatieplannen',
    'inbreiding',
    'verdichting',
    'verdichten',
    'brownfield',
    'brownfields',
    'hergebruik',
    'hergebruiken',
    'nieuwbouw',
    'nieuwbouwwijk',
    'nieuwbouwwijken',
    'wijkontwikkeling',
    'buurtontwikkeling',
    'centrumvernieuwing',
    'centrumontwikkeling'
];

/**
 * Specific index pages related to urban renewal
 */
const STEDELIJKE_VERNIEUWING_INDEX_PAGES = [
    '/wonen-en-leven/bouwen-en-verbouwen',
    '/wonen-en-leven/wijkontwikkeling',
    '/ondernemen/vestigingsklimaat',
    '/bestuur/beleid/stedenbouw',
    '/bestuur/beleid/ruimtelijke-ordening',
    '/bestuur/beleid/gebiedsontwikkeling',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas urban renewal
 */
export class HorstAanDeMaasStedelijkeVernieuwingScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized urban renewal pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`🏗️ [Horst - Stedelijke Vernieuwing] Starting specialized scrape for urban renewal`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized urban renewal pages
        const renewalDocs = await this.scrapeStedelijkeVernieuwingPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...renewalDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Stedelijke Vernieuwing] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to urban renewal
     */
    private async scrapeStedelijkeVernieuwingPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of STEDELIJKE_VERNIEUWING_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`🏗️ [Horst - Stedelijke Vernieuwing] Scraping urban renewal page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to urban renewal
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for urban renewal related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return STEDELIJKE_VERNIEUWING_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for urban renewal documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Stedelijke Vernieuwing] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Stedelijke Ontwikkeling';
                    const hasRelevantContent = STEDELIJKE_VERNIEUWING_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Stedelijke Vernieuwing] Failed to scrape urban renewal page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for urban renewal topics
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

        // Check for urban renewal keywords
        if (STEDELIJKE_VERNIEUWING_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with urban renewal terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add urban renewal-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'stedelijke vernieuwing',
            'vernieuwing',
            'herstructurering'
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
     * Enhanced relevance scoring for urban renewal documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for urban renewal keywords
        const keywordMatches = STEDELIJKE_VERNIEUWING_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasStedelijkeVernieuwingScraper(
    options?: ScraperOptions
): HorstAanDeMaasStedelijkeVernieuwingScraper {
    return new HorstAanDeMaasStedelijkeVernieuwingScraper(options);
}
