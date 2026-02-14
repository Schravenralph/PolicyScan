/**
 * Horst aan de Maas Groene Infrastructuur Scraper
 * 
 * Specialized scraper for green infrastructure (groene infrastructuur) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Green space planning
 * - Biodiversity conservation
 * - Nature networks
 * - Ecological connectivity
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to green infrastructure
 */
const GROENE_INFRASTRUCTUUR_KEYWORDS = [
    'groen',
    'groene infrastructuur',
    'infrastructuur',
    'natuur',
    'biodiversiteit',
    'natuurnetwerk',
    'ecologisch netwerk',
    'ecologische verbindingszone',
    'ecologische verbindingszones',
    'natuurverbinding',
    'natuurverbindingen',
    'groenstructuur',
    'groenstructuurplan',
    'groenvisie',
    'groenbeleid',
    'natuurbeleid',
    'biodiversiteitsbeleid',
    'natuurgebied',
    'natuurgebieden',
    'natuurpark',
    'natuurparken',
    'park',
    'parken',
    'plantsoen',
    'plantsoenen',
    'groenstrook',
    'groenstroken',
    'bomen',
    'boom',
    'bomenstructuur',
    'bomenplan',
    'bomenbeleid',
    'bomenbeheer',
    'groenbeheer',
    'natuurbeheer',
    'landschapsbeheer',
    'ecologie',
    'ecologisch',
    'ecosysteem',
    'ecosystemen',
    'habitat',
    'habitats',
    'soorten',
    'soortenrijkdom',
    'natuurinclusief',
    'natuurinclusieve ontwikkeling',
    'groene daken',
    'groen dak',
    'gevelgroen',
    'stadsnatuur',
    'stadsnatuurplan',
    'natuurlijk kapitaal',
    'ecosysteemdiensten'
];

/**
 * Specific index pages related to green infrastructure
 */
const GROENE_INFRASTRUCTUUR_INDEX_PAGES = [
    '/wonen-en-leven/groen',
    '/wonen-en-leven/natuur',
    '/bestuur/beleid/groen',
    '/bestuur/beleid/natuur',
    '/bestuur/beleid/milieu',
    '/bestuur/beleid/landschap',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas green infrastructure
 */
export class HorstAanDeMaasGroeneInfrastructuurScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized green infrastructure pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`🌳 [Horst - Groene Infrastructuur] Starting specialized scrape for green infrastructure`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized green infrastructure pages
        const greenDocs = await this.scrapeGroeneInfrastructuurPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...greenDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Groene Infrastructuur] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to green infrastructure
     */
    private async scrapeGroeneInfrastructuurPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of GROENE_INFRASTRUCTUUR_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`🌳 [Horst - Groene Infrastructuur] Scraping green infrastructure page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to green infrastructure
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for green infrastructure related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return GROENE_INFRASTRUCTUUR_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for green infrastructure documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Groene Infrastructuur] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Groenbeleid';
                    const hasRelevantContent = GROENE_INFRASTRUCTUUR_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Groene Infrastructuur] Failed to scrape green infrastructure page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for green infrastructure topics
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

        // Check for green infrastructure keywords
        if (GROENE_INFRASTRUCTUUR_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with green infrastructure terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add green infrastructure-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'groene infrastructuur',
            'groen',
            'natuur'
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
     * Enhanced relevance scoring for green infrastructure documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for green infrastructure keywords
        const keywordMatches = GROENE_INFRASTRUCTUUR_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasGroeneInfrastructuurScraper(
    options?: ScraperOptions
): HorstAanDeMaasGroeneInfrastructuurScraper {
    return new HorstAanDeMaasGroeneInfrastructuurScraper(options);
}
