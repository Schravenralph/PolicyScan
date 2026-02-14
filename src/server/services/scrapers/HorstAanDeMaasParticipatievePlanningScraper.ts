/**
 * Horst aan de Maas Participatieve Planning Scraper
 * 
 * Specialized scraper for participatory planning (participatieve planning) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Citizen participation processes
 * - Community engagement
 * - Public consultation
 * - Co-creation initiatives
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to participatory planning
 */
const PARTICIPATIEVE_PLANNING_KEYWORDS = [
    'participatie',
    'participatief',
    'participatieve planning',
    'planning',
    'betrokkenheid',
    'burgerparticipatie',
    'burgerbetrokkenheid',
    'inwonersparticipatie',
    'inwonersbetrokkenheid',
    'gemeenschapsparticipatie',
    'gemeenschapsbetrokkenheid',
    'co-creatie',
    'cocreatie',
    'samenwerking',
    'samenwerken',
    'meedenken',
    'meepraten',
    'meebeslissen',
    'inspraak',
    'inspraakproces',
    'inspraakprocessen',
    'raadpleging',
    'publieke raadpleging',
    'consultatie',
    'publieke consultatie',
    'hoorzitting',
    'hoorzittingen',
    'bijeenkomst',
    'bijeenkomsten',
    'informatieavond',
    'informatieavonden',
    'werkbijeenkomst',
    'werkbijeenkomsten',
    'atelier',
    'ateliers',
    'workshop',
    'workshops',
    'dialoog',
    'dialogen',
    'dialoogsessie',
    'dialoogsessies',
    'stakeholder',
    'stakeholders',
    'belanghebbende',
    'belanghebbenden',
    'omwonende',
    'omwonenden',
    'bewoners',
    'bewonersinitiatief',
    'bewonersinitiatieven',
    'buurtparticipatie',
    'wijkparticipatie',
    'participatief ontwerp',
    'participatief ontwerpen',
    'participatief proces',
    'participatieproces',
    'participatieprocessen',
    'participatieplan',
    'participatiebeleid',
    'participatievisie',
    'participatiestrategie'
];

/**
 * Specific index pages related to participatory planning
 */
const PARTICIPATIEVE_PLANNING_INDEX_PAGES = [
    '/bestuur/participatie',
    '/bestuur/burgerparticipatie',
    '/bestuur/inspraak',
    '/bestuur/raadpleging',
    '/wonen-en-leven/buurtparticipatie',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas participatory planning
 */
export class HorstAanDeMaasParticipatievePlanningScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized participatory planning pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`👥 [Horst - Participatieve Planning] Starting specialized scrape for participatory planning`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized participatory planning pages
        const participationDocs = await this.scrapeParticipatievePlanningPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...participationDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Participatieve Planning] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to participatory planning
     */
    private async scrapeParticipatievePlanningPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of PARTICIPATIEVE_PLANNING_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`👥 [Horst - Participatieve Planning] Scraping participation page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to participatory planning
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for participatory planning related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return PARTICIPATIEVE_PLANNING_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for participatory planning documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Participatieve Planning] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Participatiebeleid';
                    const hasRelevantContent = PARTICIPATIEVE_PLANNING_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Participatieve Planning] Failed to scrape participation page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for participatory planning topics
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

        // Check for participatory planning keywords
        if (PARTICIPATIEVE_PLANNING_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with participatory planning terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add participation-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'participatieve planning',
            'participatie',
            'betrokkenheid'
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
     * Enhanced relevance scoring for participatory planning documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for participatory planning keywords
        const keywordMatches = PARTICIPATIEVE_PLANNING_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasParticipatievePlanningScraper(
    options?: ScraperOptions
): HorstAanDeMaasParticipatievePlanningScraper {
    return new HorstAanDeMaasParticipatievePlanningScraper(options);
}
