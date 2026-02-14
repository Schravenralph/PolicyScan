/**
 * Horst aan de Maas Energietransitie Scraper
 * 
 * Specialized scraper for energy transition (energietransitie) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Renewable energy policies
 * - Energy transition plans
 * - Sustainability initiatives
 * - Climate adaptation measures
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to energy transition
 */
const ENERGIETRANSITIE_KEYWORDS = [
    'energie',
    'energietransitie',
    'duurzaamheid',
    'duurzame energie',
    'hernieuwbare energie',
    'zonne-energie',
    'windenergie',
    'windmolen',
    'windpark',
    'zonnepark',
    'zonnepanelen',
    'biomassa',
    'geothermie',
    'warmtenet',
    'warmte',
    'isolatie',
    'energiebesparing',
    'energie-efficiëntie',
    'co2',
    'co₂',
    'klimaat',
    'klimaatadaptatie',
    'klimaatmitigatie',
    'klimaatneutraal',
    'klimaatdoelen',
    'energievisie',
    'energieplan',
    'transitievisie',
    'warmtetransitie',
    'aardgasvrij',
    'gasvrij',
    'all-electric',
    'warmtepomp',
    'elektrisch',
    'elektrificatie'
];

/**
 * Specific index pages related to energy transition
 */
const ENERGIETRANSITIE_INDEX_PAGES = [
    '/wonen-en-leven/duurzaamheid',
    '/wonen-en-leven/energie',
    '/ondernemen/duurzaamheid',
    '/ondernemen/energie',
    '/bestuur/beleid/energie',
    '/bestuur/beleid/klimaat',
    '/bestuur/beleid/duurzaamheid',
    '/bestuur/beleid/milieu',
    '/omgevingsvisie-2040' // The 2040 vision often includes energy transition
];

/**
 * Specialized scraper for Horst aan de Maas energy transition
 */
export class HorstAanDeMaasEnergietransitieScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized energy transition pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`⚡ [Horst - Energietransitie] Starting specialized scrape for energy transition`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized energy transition pages
        const energyDocs = await this.scrapeEnergietransitiePages(onderwerp, thema);
        
        // Scrape Omgevingsvisie 2040 with energy focus (it often contains energy transition plans)
        const visionDocs = await this.scrapeOmgevingsvisie2040Energy(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...energyDocs, ...visionDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Energietransitie] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to energy transition
     */
    private async scrapeEnergietransitiePages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of ENERGIETRANSITIE_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`⚡ [Horst - Energietransitie] Scraping energy page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to energy transition
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for energy transition related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return ENERGIETRANSITIE_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for energy transition documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Energietransitie] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Energiebeleid';
                    const hasRelevantContent = ENERGIETRANSITIE_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Energietransitie] Failed to scrape energy page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced Omgevingsvisie 2040 scraping with energy transition focus
     */
    private async scrapeOmgevingsvisie2040Energy(
        onderwerp: string,
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];
        const visionSite = 'https://horstaandemaas2040.nl';

        try {
            console.log(`⚡ [Horst - Energietransitie] Scraping Omgevingsvisie 2040 with energy focus`);
            
            const html = await this.fetchPage(visionSite);
            const $ = this.load(html);

            // Find all links on the 2040 site
            const links = this.extractLinks($, 'nav a, .menu a, .navigation a, main a', visionSite);
            
            // Filter for energy-related pages
            const energyLinks = links.filter(link => {
                const linkLower = link.toLowerCase();
                return ENERGIETRANSITIE_KEYWORDS.some(keyword =>
                    linkLower.includes(keyword.toLowerCase())
                ) || linkLower.includes('thema') || linkLower.includes('visie');
            });

            // Scrape energy-related pages from the 2040 vision site
            for (const link of [...new Set(energyLinks)].slice(0, 10)) {
                try {
                    if (!link.includes('horstaandemaas2040')) continue;
                    
                    const pageHtml = await this.fetchPage(link);
                    const $page = this.load(pageHtml);
                    
                    const title = this.extractText($page, 'h1, .page-title') || 'Omgevingsvisie 2040';
                    const content = this.extractText($page, 'main, .content, article');
                    
                    if (content && content.length > 100) {
                        // Check if content is actually about energy
                        const hasEnergyContent = ENERGIETRANSITIE_KEYWORDS.some(keyword =>
                            (title + ' ' + content).toLowerCase().includes(keyword.toLowerCase())
                        );

                        if (hasEnergyContent) {
                            documents.push({
                                titel: title,
                                url: link,
                                website_url: visionSite,
                                website_titel: 'Horst aan de Maas 2040',
                                samenvatting: this.generateSummary(content, title),
                                type_document: 'Omgevingsvisie' as DocumentType,
                                publicatiedatum: null,
                                relevanceScore: toRelevanceScore(0.9) // High relevance for vision documents
                            });
                        }
                    }
                } catch (_error) {
                    console.warn(`⚠️  [Horst - Energietransitie] Failed to scrape 2040 page: ${link}`);
                }
            }
        } catch (error) {
            console.warn(`⚠️  [Horst - Energietransitie] Failed to scrape Omgevingsvisie 2040:`, error);
        }

        return documents;
    }

    /**
     * Enhanced relevance check for energy transition topics
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

        // Check for energy transition keywords
        if (ENERGIETRANSITIE_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with energy transition terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add energy-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'energie',
            'energietransitie',
            'duurzaamheid'
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
     * Enhanced relevance scoring for energy transition documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for energy transition keywords
        const keywordMatches = ENERGIETRANSITIE_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasEnergietransitieScraper(
    options?: ScraperOptions
): HorstAanDeMaasEnergietransitieScraper {
    return new HorstAanDeMaasEnergietransitieScraper(options);
}
