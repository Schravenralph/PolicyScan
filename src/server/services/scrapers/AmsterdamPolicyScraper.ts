/**
 * Amsterdam Policy Scraper
 * 
 * Specialized scraper for Gemeente Amsterdam policy documents.
 * Pre-configured with selectors tuned to amsterdam.nl website structure.
 */

import { MunicipalityPolicyScraper, MunicipalityScraperConfig, DUTCH_PLANNING_KEYWORDS } from './MunicipalityPolicyScraper.js';
import { ScraperOptions } from './baseScraper.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { scraperConfig } from '../../config/scraperConfig.js';

/**
 * Pre-configured selector config for amsterdam.nl
 * 
 * Amsterdam uses a fairly standard search interface. Key pages:
 * - Search: https://www.amsterdam.nl/zoeken/
 * - Policy docs often live under: /bestuur-organisatie/beleid/
 */
const AMSTERDAM_CONFIG: MunicipalityScraperConfig = {
    municipalityName: 'Gemeente Amsterdam',
    
    // Search configuration
    searchPath: '/zoeken/',
    searchParamName: 'zoek',  // Amsterdam uses 'zoek' instead of 'q'
    additionalSearchParams: {
        // Filter to policy-related content types
        'content_type': 'beleid,publicatie,verordening'
    },
    
    // Search results page selectors
    resultItemSelector: '.search-result, .search-results-item, article.result',
    resultLinkSelector: 'a',
    resultTitleSelector: 'h2, h3, .search-result-title',
    resultSummarySelector: '.search-result-description, .summary, p',
    resultDateSelector: '.date, time, .search-result-date',
    
    // Detail page selectors
    detailTitleSelector: 'h1, .page-title',
    detailContentSelector: '.main-content, main, article, .article-body',
    detailSummarySelector: '.intro, .lead',
    detailDateSelector: 'time[datetime], .publication-date, .date',
    detailPdfLinkSelector: 'a[href$=".pdf"], a[href*="/download/"]',
    
    maxResults: 25
};

/**
 * Amsterdam-specific keywords that might not apply to other municipalities
 */
const AMSTERDAM_SPECIFIC_KEYWORDS = [
    'koers',         // "Koers 2025" - Amsterdam development vision
    'agenda',        // "Agenda Amsterdam" - policy agendas  
    'haven',         // Port of Amsterdam
    'zuidas',        // Major development area
    'ijburg',        // Major development area
    'noord',         // Amsterdam Noord development
    'grachtengordel', // Historical district
    'ringzone',      // Ring road area
    'metropool',     // Amsterdam Metropolitan Area
    'stadsregie',    // City coordination
];

/**
 * Policy scraper specifically tuned for amsterdam.nl
 */
export class AmsterdamPolicyScraper extends MunicipalityPolicyScraper {
    constructor(options: ScraperOptions = {}) {
        super('https://www.amsterdam.nl', AMSTERDAM_CONFIG, {
            maxDepth: 2,
            followLinks: true,
            ...options
        });
    }

    /**
     * Override search URL builder to handle Amsterdam-specific URL structure
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        const searchParams = new URLSearchParams();

        // Combine search terms
        const searchTerms = [onderwerp, thema, query]
            .filter(Boolean)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const combinedQuery = searchTerms.length > 0
            ? searchTerms.join(' ')
            : 'omgevingsvisie omgevingsplan beleid';

        searchParams.set('zoek', combinedQuery);
        
        // Add config params first, then override with Amsterdam-specific filters
        if (this.config.additionalSearchParams) {
            for (const [key, value] of Object.entries(this.config.additionalSearchParams)) {
                searchParams.set(key, value);
            }
        }
        
        // Amsterdam-specific filters
        // Note: These may need adjustment based on actual site structure
        searchParams.set('onderwerp', 'bestuur-organisatie');

        const searchUrl = new URL('/zoeken/', this.baseUrl);
        searchUrl.search = searchParams.toString();

        return searchUrl.toString();
    }

    /**
     * Enhanced relevance check including Amsterdam-specific keywords
     */
    protected isRelevantPolicyUrl(
        url: string,
        text: string = '',
        onderwerp: string = '',
        thema: string = ''
    ): boolean {
        const urlLower = url.toLowerCase();
        const textLower = text.toLowerCase();

        // Check Amsterdam-specific keywords first
        if (AMSTERDAM_SPECIFIC_KEYWORDS.some(kw => 
            urlLower.includes(kw) || textLower.includes(kw)
        )) {
            // But still respect excludes
            if (!scraperConfig.excludeKeywords.some((kw: string) => urlLower.includes(kw) || textLower.includes(kw))) {
                return true;
            }
        }

        // Fall back to parent implementation
        return super.isRelevantPolicyUrl(url, text, onderwerp, thema);
    }

    /**
     * Alternative method: scrape the policy index page directly
     * Amsterdam has dedicated policy overview pages that might be more efficient
     */
    async scrapePolicyIndex(category?: string): Promise<ScrapedDocument[]> {
        const indexPaths = [
            '/bestuur-organisatie/beleid/',
            '/bestuur-organisatie/verordeningen/',
            '/wonen-leefomgeving/wonen/',
            '/projecten/',
        ];

        if (category) {
            // Filter to specific category
            const matchingPath = indexPaths.find(p => p.includes(category));
            if (matchingPath) {
                return this.scrapeIndexPage(matchingPath);
            }
        }

        // Scrape all index pages
        const allDocs: ScrapedDocument[] = [];
        
        for (const path of indexPaths) {
            try {
                const docs = await this.scrapeIndexPage(path);
                allDocs.push(...docs);
            } catch (error) {
                console.warn(`⚠️  Failed to scrape index ${path}:`, error);
            }
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        return allDocs.filter(doc => {
            if (seen.has(doc.url)) return false;
            seen.add(doc.url);
            return true;
        });
    }

    /**
     * Scrape documents from an index/overview page
     */
    private async scrapeIndexPage(path: string): Promise<ScrapedDocument[]> {
        const url = new URL(path, this.baseUrl).toString();
        console.log(`📁 [Amsterdam] Scraping index page: ${url}`);

        const html = await this.fetchPage(url);
        const $ = this.load(html);

        const documents: ScrapedDocument[] = [];
        const links = this.extractLinks($, 'main a, .content a, article a', url);

        for (const link of links.slice(0, this.config.maxResults ?? 20)) {
            if (!this.isRelevantPolicyUrl(link, '')) continue;

            try {
                const doc = await this.scrapeDetailPage(link, '', '', {});
                if (doc) {
                    documents.push(doc);
                }
            } catch (error) {
                console.warn(`⚠️  Failed to scrape ${link}:`, error);
            }
        }

        return documents;
    }
}

/**
 * Factory function for quick instantiation
 */
export function createAmsterdamScraper(options?: ScraperOptions): AmsterdamPolicyScraper {
    return new AmsterdamPolicyScraper(options);
}

