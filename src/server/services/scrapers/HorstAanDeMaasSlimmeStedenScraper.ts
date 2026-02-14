/**
 * Horst aan de Maas Slimme Steden Scraper
 * 
 * Specialized scraper for smart cities (slimme steden) 
 * policies and documents for Gemeente Horst aan de Maas.
 * 
 * Extends HorstAanDeMaasScraper with custom features for:
 * - Digital innovation
 * - Smart city technologies
 * - ICT infrastructure
 * - Digital governance
 */

import { HorstAanDeMaasSpecializedScraper } from './HorstAanDeMaasSpecializedScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';

/**
 * Keywords specific to smart cities
 */
const SLIMME_STEDEN_KEYWORDS = [
    'slim',
    'slimme steden',
    'slimme stad',
    'smart city',
    'smart cities',
    'digitale',
    'digitaal',
    'ict',
    'technologie',
    'technologisch',
    'innovatie',
    'innovatief',
    'digitalisering',
    'digitaliseren',
    'digitale transformatie',
    'digitale transitie',
    'e-government',
    'egoverment',
    'digitale overheid',
    'online dienstverlening',
    'digitale dienstverlening',
    'digitale diensten',
    'digitale platform',
    'digitale platforms',
    'data',
    'datagedreven',
    'big data',
    'open data',
    'data-analyse',
    'data-analyse',
    'sensoren',
    'sensor',
    'internet of things',
    'iot',
    'connected',
    'verbonden',
    'slimme verlichting',
    'slimme straatverlichting',
    'slimme parkeerplaatsen',
    'slimme parkeren',
    'slimme afval',
    'slimme afvalbakken',
    'slimme mobiliteit',
    'slimme vervoer',
    'slimme verkeer',
    'slimme energie',
    'slimme energiemanagement',
    'slimme netwerken',
    'slimme infrastructuur',
    'slimme gebouwen',
    'slimme woning',
    'slimme woningen',
    'domotica',
    'home automation',
    'huisautomatisering',
    'artificiële intelligentie',
    'ai',
    'machine learning',
    'automatisering',
    'robotica',
    'robots',
    'drones',
    'drone',
    '5g',
    '5g-netwerk',
    'glasvezel',
    'fiber',
    'breedband',
    'wifi',
    'wifi-netwerk',
    'wifi-netwerken',
    'cybersecurity',
    'cyberveiligheid',
    'digitale veiligheid',
    'privacy',
    'dataprivacy',
    'databescherming',
    'digitale inclusie',
    'digitale kloof',
    'e-skills',
    'digitale vaardigheden'
];

/**
 * Specific index pages related to smart cities
 */
const SLIMME_STEDEN_INDEX_PAGES = [
    '/bestuur/digitalisering',
    '/bestuur/ict',
    '/bestuur/innovatie',
    '/ondernemen/digitalisering',
    '/ondernemen/innovatie',
    '/wonen-en-leven/digitalisering',
    '/omgevingsvisie-2040'
];

/**
 * Specialized scraper for Horst aan de Maas smart cities
 */
export class HorstAanDeMaasSlimmeStedenScraper extends HorstAanDeMaasSpecializedScraper {
    /**
     * Override scrape method to add specialized smart cities pages
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        console.log(`💻 [Horst - Slimme Steden] Starting specialized scrape for smart cities`);
        
        // Start with parent scraper results
        const baseDocuments = await super.scrape(query, onderwerp, thema);
        
        // Add specialized smart cities pages
        const smartDocs = await this.scrapeSlimmeStedenPages(onderwerp, thema);
        
        // Combine and deduplicate
        const allDocuments = [...baseDocuments, ...smartDocs];
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst - Slimme Steden] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape specific pages related to smart cities
     */
    private async scrapeSlimmeStedenPages(
        onderwerp: string, 
        thema: string
    ): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        for (const path of SLIMME_STEDEN_INDEX_PAGES) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`💻 [Horst - Slimme Steden] Scraping smart cities page: ${url}`);
                
                const html = await this.fetchPage(url);
                const $ = this.load(html);
                
                // Find links related to smart cities
                const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
                
                // Filter for smart cities related links
                const relevantLinks = links.filter(link => {
                    const linkLower = link.toLowerCase();
                    return SLIMME_STEDEN_KEYWORDS.some(keyword => 
                        linkLower.includes(keyword.toLowerCase())
                    ) || this.isRelevantPolicyUrl(link, '', onderwerp, thema);
                });

                // Scrape each relevant link
                for (const link of relevantLinks.slice(0, 15)) {
                    try {
                        if (!this.options.followLinks) continue;
                        
                        const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                        if (doc) {
                            // Boost relevance for smart cities documents
                            doc.relevanceScore = toRelevanceScore(
                                Math.min(1.0, (doc.relevanceScore || 0.5) + 0.2)
                            );
                            documents.push(doc);
                        }
                    } catch (_error) {
                        console.warn(`⚠️  [Horst - Slimme Steden] Failed to scrape: ${link}`);
                    }
                }

                // Also create document for the index page itself if it contains relevant content
                const pageContent = this.extractText($, 'main, .content, article');
                if (pageContent && pageContent.length > 200) {
                    const title = this.extractText($, 'h1, .page-title') || 'Digitaliseringsbeleid';
                    const hasRelevantContent = SLIMME_STEDEN_KEYWORDS.some(keyword =>
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
                console.warn(`⚠️  [Horst - Slimme Steden] Failed to scrape smart cities page ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Enhanced relevance check for smart cities topics
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

        // Check for smart cities keywords
        if (SLIMME_STEDEN_KEYWORDS.some(keyword => 
            combinedText.includes(keyword.toLowerCase())
        )) {
            return true;
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Enhanced search URL building with smart cities terms
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        // Add smart cities-related search terms
        const searchTerms = [
            onderwerp,
            thema,
            query,
            'slimme steden',
            'digitale',
            'ict'
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
     * Enhanced relevance scoring for smart cities documents
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        let score = super.calculateRelevanceScore(title, content, onderwerp, thema);
        
        const combinedText = `${title} ${content}`.toLowerCase();
        
        // Boost score for smart cities keywords
        const keywordMatches = SLIMME_STEDEN_KEYWORDS.filter(keyword =>
            combinedText.includes(keyword.toLowerCase())
        ).length;
        
        score += keywordMatches * 0.1; // Add 0.1 per matching keyword
        
        return Math.min(1.0, score);
    }
}

/**
 * Factory function
 */
export function createHorstAanDeMaasSlimmeStedenScraper(
    options?: ScraperOptions
): HorstAanDeMaasSlimmeStedenScraper {
    return new HorstAanDeMaasSlimmeStedenScraper(options);
}
