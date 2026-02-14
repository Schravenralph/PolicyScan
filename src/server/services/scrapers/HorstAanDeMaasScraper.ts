/**
 * Horst aan de Maas Policy Scraper
 * 
 * Bespoke scraper for Gemeente Horst aan de Maas policy documents.
 * Created for Ruimtemeesters assignment.
 * 
 * Key sources:
 * - Main site: https://www.horstaandemaas.nl
 * - Policy/rules: https://www.horstaandemaas.nl/regels-en-wetten
 * - Public info: https://www.horstaandemaas.nl/openbare-informatie-0
 * - Omgevingsvisie 2040: https://horstaandemaas2040.nl
 */

import { MunicipalityPolicyScraper, MunicipalityScraperConfig, DUTCH_PLANNING_KEYWORDS } from './MunicipalityPolicyScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../infrastructure/types.js';
import { scraperConfig } from '../../config/scraperConfig.js';

/**
 * Pre-configured selector config for horstaandemaas.nl
 * 
 * The municipality website uses a fairly standard layout with:
 * - Policy documents under /regels-en-wetten
 * - Public information under /openbare-informatie-0
 * - Separate 2040 vision site at horstaandemaas2040.nl
 */
const HORST_CONFIG: MunicipalityScraperConfig = {
    municipalityName: 'Gemeente Horst aan de Maas',
    
    // Search configuration
    searchPath: '/zoeken',
    searchParamName: 'keys',  // Drupal-style search parameter
    additionalSearchParams: {},
    
    // Search results page selectors (typical Drupal/government site structure)
    resultItemSelector: '.view-content .views-row, .search-result, .search-results li, article.node',
    resultLinkSelector: 'a, h2 a, h3 a, .field-title a',
    resultTitleSelector: 'h2, h3, .field-title',
    resultSummarySelector: '.field-body, .field-summary, .search-snippet, p',
    resultDateSelector: '.field-date, .date, time',
    
    // Detail page selectors
    detailTitleSelector: 'h1.page-title, h1, .field-title',
    detailContentSelector: '.field-body, .node-content, main article, .content, #content',
    detailSummarySelector: '.field-summary, .intro, .lead',
    detailDateSelector: '.field-date, time[datetime], .date',
    detailPdfLinkSelector: 'a[href$=".pdf"], a[href*="/files/"], a.file-link',
    
    maxResults: 30
};

/**
 * Horst aan de Maas specific keywords - local area names and projects
 */
const HORST_SPECIFIC_KEYWORDS = [
    // Municipality and region names
    'horst',
    'maas',
    'america',
    'meterik',
    'sevenum',
    'grubbenvorst',
    'lottum',
    'melderslo',
    'broekhuizen',
    'broekhuizenvorst',
    'hegelsom',
    'griendtsveen',
    'kronenberg',
    'tienray',
    'swolgen',
    'blitterswijck',
    'wanssum',
    
    // Regional terms
    'noord-limburg',
    'limburg',
    'peelregio',
    'maasduinen',
    
    // Local planning themes
    '2040',           // Omgevingsvisie 2040
    'greenport',      // Greenport Venlo region
    'glastuinbouw',   // Greenhouse horticulture (major local industry)
    'agribusiness',
    'teeltondersteunende voorzieningen',
    'intensieve veehouderij',
    'reconstructie',
    'platteland',
    'buitengebied',
    'dorpskernen',
    'centrumvisie',
    'verkavelings',
];

/**
 * Policy scraper specifically tuned for horstaandemaas.nl
 * 
 * This scraper handles:
 * 1. The main municipal website (horstaandemaas.nl)
 * 2. The dedicated Omgevingsvisie 2040 site (horstaandemaas2040.nl)
 * 3. Direct policy index pages
 */
export class HorstAanDeMaasScraper extends MunicipalityPolicyScraper {
    private static readonly MAIN_SITE = 'https://www.horstaandemaas.nl';
    private static readonly VISION_2040_SITE = 'https://horstaandemaas2040.nl';
    
    constructor(options: ScraperOptions = {}) {
        super(HorstAanDeMaasScraper.MAIN_SITE, HORST_CONFIG, {
            maxDepth: 3,
            followLinks: true,
            ...options
        });
    }

    /**
     * Main scrape method - searches both sites
     * More flexible - works with or without specific topics
     */
    async scrape(query: string = '', onderwerp: string = '', thema: string = ''): Promise<ScrapedDocument[]> {
        const topicInfo = (onderwerp || thema) ? `for: ${onderwerp || thema}` : '(general policy scan)';
        console.log(`🏛️  [Horst aan de Maas] Starting policy scan ${topicInfo}`);
        
        const allDocuments: ScrapedDocument[] = [];

        // 1. Scrape the main site via search
        try {
            const mainDocs = await super.scrape(query, onderwerp, thema);
            allDocuments.push(...mainDocs);
            console.log(`📄 [Horst aan de Maas] Found ${mainDocs.length} documents from main site search`);
        } catch (error) {
            console.warn(`⚠️  [Horst aan de Maas] Error scraping main site:`, error);
        }

        // 2. Scrape the policy index pages directly
        try {
            const indexDocs = await this.scrapePolicyIndexPages(onderwerp, thema);
            allDocuments.push(...indexDocs);
            console.log(`📄 [Horst aan de Maas] Found ${indexDocs.length} documents from index pages`);
        } catch (error) {
            console.warn(`⚠️  [Horst aan de Maas] Error scraping index pages:`, error);
        }

        // 3. Scrape the Omgevingsvisie 2040 site
        try {
            const visionDocs = await this.scrapeOmgevingsvisie2040(onderwerp, thema);
            allDocuments.push(...visionDocs);
            console.log(`📄 [Horst aan de Maas] Found ${visionDocs.length} documents from Omgevingsvisie 2040`);
        } catch (error) {
            console.warn(`⚠️  [Horst aan de Maas] Error scraping Omgevingsvisie 2040:`, error);
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        const uniqueDocs = allDocuments.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });

        console.log(`📊 [Horst aan de Maas] Total unique documents: ${uniqueDocs.length}`);
        return uniqueDocs;
    }

    /**
     * Scrape the dedicated policy index pages
     */
    async scrapePolicyIndexPages(onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        const indexPages = [
            '/regels-en-wetten',
            '/openbare-informatie-0',
            '/bestuur/gemeenteraad/vergaderingen',
            '/wonen-en-leven/bouwen-en-verbouwen',
            '/ondernemen/vestigingsklimaat',
        ];

        const documents: ScrapedDocument[] = [];

        for (const path of indexPages) {
            try {
                const url = new URL(path, this.baseUrl).toString();
                console.log(`📁 [Horst aan de Maas] Scraping index: ${url}`);
                
                const docs = await this.scrapeIndexPage(url, onderwerp, thema);
                documents.push(...docs);
            } catch (error) {
                console.warn(`⚠️  [Horst aan de Maas] Failed to scrape ${path}:`, error);
            }
        }

        return documents;
    }

    /**
     * Scrape a single index page for document links
     * More flexible - doesn't strictly filter by topic if no topic is provided
     */
    private async scrapeIndexPage(url: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        const html = await this.fetchPage(url);
        const $ = this.load(html);
        const documents: ScrapedDocument[] = [];

        // Find all links on the page
        const links = this.extractLinks($, 'main a, .content a, article a, .view-content a', url);
        
        // Filter by relevance if topic provided, otherwise get all policy-related links
        const hasTopic = (onderwerp && onderwerp.trim()) || (thema && thema.trim());
        const relevantLinks = hasTopic
            ? links.filter(link => this.isRelevantPolicyUrl(link, '', onderwerp, thema))
            : links.filter(link => this.isRelevantPolicyUrl(link, '', '', '')); // Use base policy relevance check
        const limitedLinks = relevantLinks.slice(0, this.config.maxResults ?? 30);

        for (const link of limitedLinks) {
            if (!this.options.followLinks) continue;
            
            try {
                const doc = await this.scrapeDetailPage(link, onderwerp, thema, {});
                if (doc) {
                    documents.push(doc);
                }
            } catch (_error) {
                console.warn(`⚠️  [Horst aan de Maas] Failed to scrape detail: ${link}`);
            }
        }

        return documents;
    }

    /**
     * Scrape the dedicated Omgevingsvisie 2040 website
     * This is a separate site with its own structure
     * More flexible - works with or without specific topics
     */
    async scrapeOmgevingsvisie2040(onderwerp: string = '', thema: string = ''): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];
        
        try {
            const baseUrl = HorstAanDeMaasScraper.VISION_2040_SITE;
            console.log(`🔭 [Horst aan de Maas] Scraping Omgevingsvisie 2040 site: ${baseUrl}`);
            
            const html = await this.fetchPage(baseUrl);
            const $ = this.load(html);

            // First, create a document for the main page itself
            const mainTitle = this.extractText($, 'h1, .hero-title, .page-title') || 'Omgevingsvisie Horst aan de Maas 2040';
            const mainContent = this.extractText($, 'main, .content, #content, article');
            
            if (mainContent) {
                documents.push({
                    titel: mainTitle,
                    url: baseUrl,
                    website_url: baseUrl,
                    website_titel: 'Horst aan de Maas 2040',
                    samenvatting: this.generateSummary(mainContent, mainTitle),
                    type_document: 'Omgevingsvisie' as DocumentType,
                    publicatiedatum: null,
                    relevanceScore: toRelevanceScore(1.0)  // High relevance - core planning document
                });
            }

            // Find and scrape subpages
            const navLinks = this.extractLinks($, 'nav a, .menu a, .navigation a, main a', baseUrl);
            const hasTopic = (onderwerp && onderwerp.trim()) || (thema && thema.trim());
            const relevantNavLinks = navLinks.filter(link => {
                // Stay within the 2040 site
                if (!link.includes('horstaandemaas2040')) return false;
                // Skip fragment-only links (anchor links like "#section")
                // But keep full URLs with fragments (like "https://site.nl/page#section")
                if (link.startsWith('#') || (!link.startsWith('http') && link.includes('#'))) {
                    return false;
                }
                // If topic provided, check relevance; otherwise include all 2040 vision pages
                if (hasTopic) {
                    return this.isRelevantPolicyUrl(link, '', onderwerp, thema) || 
                           link.includes('2040') ||
                           link.includes('visie') ||
                           link.includes('thema') ||
                           link.includes('gebied');
                } else {
                    // No topic - include all relevant 2040 vision pages
                    return link.includes('2040') ||
                           link.includes('visie') ||
                           link.includes('thema') ||
                           link.includes('gebied') ||
                           this.isRelevantPolicyUrl(link, '', '', '');
                }
            });

            const uniqueLinks = [...new Set(relevantNavLinks)].slice(0, 20);

            for (const link of uniqueLinks) {
                try {
                    const pageHtml = await this.fetchPage(link);
                    const $page = this.load(pageHtml);
                    
                    const title = this.extractText($page, 'h1, .page-title') || 'Omgevingsvisie 2040';
                    const content = this.extractText($page, 'main, .content, article');
                    
                    if (content && content.length > 100) {
                        documents.push({
                            titel: title,
                            url: link,
                            website_url: baseUrl,
                            website_titel: 'Horst aan de Maas 2040',
                            samenvatting: this.generateSummary(content, title),
                            type_document: 'Omgevingsvisie' as DocumentType,
                            publicatiedatum: null,
                            relevanceScore: toRelevanceScore(this.calculateRelevanceScore(title, content, onderwerp, thema))
                        });
                    }
                } catch (_error) {
                    console.warn(`⚠️  [Horst aan de Maas] Failed to scrape 2040 page: ${link}`);
                }
            }
        } catch (error) {
            console.error(`❌ [Horst aan de Maas] Error scraping Omgevingsvisie 2040 site:`, error);
        }

        return documents;
    }

    /**
     * Enhanced relevance check including Horst aan de Maas specific keywords
     */
    protected isRelevantPolicyUrl(
        url: string,
        text: string = '',
        onderwerp: string = '',
        thema: string = ''
    ): boolean {
        const urlLower = url.toLowerCase();
        const textLower = text.toLowerCase();

        // Always accept links from the 2040 site
        if (urlLower.includes('horstaandemaas2040')) {
            return true;
        }

        // Check Horst aan de Maas specific keywords
        if (HORST_SPECIFIC_KEYWORDS.some(kw => 
            urlLower.includes(kw) || textLower.includes(kw)
        )) {
            // But still respect excludes
            if (!scraperConfig.excludeKeywords.some((kw: string) => 
                urlLower.includes(kw) || textLower.includes(kw)
            )) {
                return true;
            }
        }

        // Fall back to parent implementation (general Dutch planning keywords)
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Override to handle Horst aan de Maas specific URL patterns
     * More flexible - doesn't force topic queries, works with or without specific topics
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        const searchParams = new URLSearchParams();

        // Combine search terms if provided, but don't force defaults
        const searchTerms = [onderwerp, thema, query]
            .filter(Boolean)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Use provided search terms, or generic planning terms if no specific topic
        const combinedQuery = searchTerms.length > 0
            ? searchTerms.join(' ')
            : 'omgevingsvisie omgevingsplan beleid'; // Generic fallback only if completely empty

        // Horst uses 'keys' parameter (Drupal-style)
        searchParams.set('keys', combinedQuery);

        const searchUrl = new URL('/zoeken', this.baseUrl);
        searchUrl.search = searchParams.toString();

        return searchUrl.toString();
    }

    /**
     * Static method to scrape Omgevingsvisie 2040 directly
     * Useful for targeted scraping of the vision document
     */
    static async scrapeOmgevingsvisie2040Only(options?: ScraperOptions): Promise<ScrapedDocument[]> {
        const scraper = new HorstAanDeMaasScraper(options);
        return scraper.scrapeOmgevingsvisie2040('', '');
    }
}

/**
 * Factory function for quick instantiation
 */
export function createHorstAanDeMaasScraper(options?: ScraperOptions): HorstAanDeMaasScraper {
    return new HorstAanDeMaasScraper(options);
}

// Export specific keywords for testing
export { HORST_SPECIFIC_KEYWORDS };

