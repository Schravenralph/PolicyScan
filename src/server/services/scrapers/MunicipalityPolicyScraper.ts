/**
 * Municipality Policy Scraper
 * 
 * Generic scraper for Dutch municipal policy documents (ruimtelijke ordening).
 * This class can be extended or configured per municipality site.
 */

import { BaseScraper, ScraperOptions } from './baseScraper.js';
import { ScrapedDocument, DocumentType, toISODateString, toRelevanceScore } from '../../services/infrastructure/types.js';
import { scraperConfig } from '../../config/scraperConfig.js';
import * as cheerio from 'cheerio';

// Type alias for CheerioAPI (return type of cheerio.load)
type CheerioAPI = ReturnType<typeof cheerio.load>;

/**
 * Configuration for site-specific selectors and paths
 */
export interface MunicipalityScraperConfig {
    /**
     * Display name for the municipality (e.g., "Gemeente Amsterdam")
     */
    municipalityName: string;

    /**
     * Relative path of the search page, e.g. "/zoeken" or "/search"
     */
    searchPath: string;

    /**
     * Query parameter name for the search (default: "q")
     */
    searchParamName?: string;

    /**
     * Additional search parameters (e.g., filters for document types)
     */
    additionalSearchParams?: Record<string, string>;

    /**
     * CSS selector for each search result container, e.g. ".search-result" or "li.result-item"
     */
    resultItemSelector: string;

    /**
     * Within each result item, selector for the anchor tag to the detail page.
     * Usually just "a", but could be something like "h3 a".
     */
    resultLinkSelector: string;

    /**
     * Optional: selector for result title text (for pre-filtering)
     */
    resultTitleSelector?: string;

    /**
     * Optional: selector for metadata on the search result
     */
    resultDateSelector?: string;
    resultSummarySelector?: string;

    /**
     * Selectors for the detail page (actual policy document page)
     */
    detailTitleSelector: string;   // e.g. "h1"
    detailContentSelector: string; // e.g. "main", "#content", ".article-body"
    detailSummarySelector?: string; // e.g. ".intro", ".lead"
    detailDateSelector?: string;   // e.g. "time", ".publication-date"
    detailPdfLinkSelector?: string; // e.g. "a[href$='.pdf']"

    /**
     * Maximum number of search results to process (default: 20)
     */
    maxResults?: number;
}

/**
 * Dutch spatial planning keywords specific to policy documents
 */
const DUTCH_PLANNING_KEYWORDS = [
    // Core planning documents
    'omgevingsvisie',
    'omgevingsplan',
    'omgevingsverordening',
    'bestemmingsplan',
    'structuurvisie',
    'gebiedsvisie',
    'wijkvisie',
    'stadvisie',
    'woonvisie',
    'groenvisie',
    
    // Development plans
    'ontwikkelplan',
    'ontwikkelkader',
    'ontwerpbestemmingsplan',
    'voorontwerp',
    'inpassingsplan',
    'uitwerkingsplan',
    
    // Policy documents
    'beleidsnota',
    'beleidsregel',
    'beleidsplan',
    'beleidskader',
    'kadernota',
    'uitvoeringsprogramma',
    
    // Specific policy areas
    'mobiliteitsplan',
    'verkeersbesluit',
    'parkeerbeleid',
    'welstandsnota',
    'beeldkwaliteitsplan',
    'erfgoednota',
    'monumentenbeleid',
    'horecabeleid',
    'detailhandelsvisie',
    'economische visie',
    
    // Environmental/spatial
    'milieueffectrapport',
    'mer',
    'ruimtelijke onderbouwing',
    'stedenbouwkundig plan',
    'landschapsvisie',
    'waterplan',
    'rioleringsplan',
    'klimaatadaptatie',
    'energietransitie',
    'warmtevisie',
    'zonnekaart',
    
    // Regulations
    'verordening',
    'algemene plaatselijke verordening',
    'apv',
    'bouwverordening',
    'huisvestingsverordening',
    
    // Process documents
    'zienswijze',
    'zienswijzennota',
    'nota van beantwoording',
    'raadsvoorstel',
    'raadsbesluit',
    'collegebesluit',
];

/**
 * Generic scraper for Dutch municipal policy documents.
 * 
 * This assumes the site has a basic full-text search that can be queried.
 * Extend this class or provide site-specific config for different municipalities.
 */
export class MunicipalityPolicyScraper extends BaseScraper {
    protected config: MunicipalityScraperConfig;

    constructor(baseUrl: string, config: MunicipalityScraperConfig, options: ScraperOptions = {}) {
        super(baseUrl, options);
        this.config = config;
    }

    /**
     * Main entrypoint: search the site for policy documents matching the query / onderwerp / thema.
     */
    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        // Validate parameters before use
        if (typeof query !== 'string') {
            throw new Error(`query is required and must be a string, got: ${typeof query}`);
        }
        if (typeof onderwerp !== 'string') {
            throw new Error(`onderwerp is required and must be a string, got: ${typeof onderwerp}`);
        }
        if (typeof thema !== 'string') {
            throw new Error(`thema is required and must be a string, got: ${typeof thema}`);
        }
        
        console.log(`🔍 [${this.config.municipalityName}] Starting policy scan for: ${onderwerp} ${thema}`);
        
        const searchUrl = this.buildSearchUrl(query, onderwerp, thema);
        console.log(`🔍 [${this.config.municipalityName}] Search URL: ${searchUrl}`);
        
        let searchHtml: string;
        try {
            searchHtml = await this.fetchPage(searchUrl);
        } catch (error) {
            console.error(`❌ [${this.config.municipalityName}] Failed to fetch search page:`, error);
            return [];
        }

        const $ = this.load(searchHtml);
        const candidateLinks = this.extractPolicyLinksFromSearchResults($, onderwerp, thema);
        
        console.log(`📋 [${this.config.municipalityName}] Found ${candidateLinks.length} candidate links`);

        // Limit results to avoid overwhelming requests
        const maxResults = this.config.maxResults ?? 20;
        const linksToProcess = candidateLinks.slice(0, maxResults);

        const documents: ScrapedDocument[] = [];

        for (const { url, previewTitle, previewSummary, previewDate } of linksToProcess) {
            // Check depth and followLinks
            if (!this.options.followLinks) {
                console.log(`⏭️  [${this.config.municipalityName}] Skipping ${url}: followLinks disabled`);
                continue;
            }

            try {
                const doc = await this.scrapeDetailPage(url, onderwerp, thema, {
                    previewTitle,
                    previewSummary,
                    previewDate
                });
                if (doc) {
                    documents.push(doc);
                    console.log(`✅ [${this.config.municipalityName}] Scraped: ${doc.titel}`);
                }
            } catch (error) {
                console.warn(`⚠️  [${this.config.municipalityName}] Failed to scrape ${url}:`, error);
            }
        }

        console.log(`📊 [${this.config.municipalityName}] Total documents found: ${documents.length}`);
        return documents;
    }

    /**
     * Build a site-specific search URL.
     */
    protected buildSearchUrl(query: string, onderwerp: string, thema: string): string {
        const searchParams = new URLSearchParams();
        const paramName = this.config.searchParamName ?? 'q';

        // Combine query terms, prioritizing onderwerp and thema for policy searches
        // Use type-safe filtering to ensure all values are strings before calling trim()
        const searchTerms = [onderwerp, thema, query]
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Add relevant policy keywords if the search is generic
        const combinedQuery = searchTerms.length > 0
            ? searchTerms.join(' ')
            : 'omgevingsvisie omgevingsplan bestemmingsplan';

        searchParams.set(paramName, combinedQuery);

        // Add any site-specific additional parameters
        if (this.config.additionalSearchParams) {
            for (const [key, value] of Object.entries(this.config.additionalSearchParams)) {
                searchParams.set(key, value);
            }
        }

        const searchUrl = new URL(this.config.searchPath, this.baseUrl);
        searchUrl.search = searchParams.toString();

        return searchUrl.toString();
    }

    /**
     * Extract candidate links to policy documents from the search result HTML.
     */
    protected extractPolicyLinksFromSearchResults(
        $: CheerioAPI,
        onderwerp: string,
        thema: string
    ): Array<{
        url: string;
        previewTitle?: string;
        previewSummary?: string;
        previewDate?: string;
    }> {
        const results: Array<{
            url: string;
            previewTitle?: string;
            previewSummary?: string;
            previewDate?: string;
        }> = [];

        const seenUrls = new Set<string>();

        $(this.config.resultItemSelector).each((_: number, element) => {
            const $el = $(element);
            
            // Get the link element
            const $link = $el.find(this.config.resultLinkSelector).first();
            const href = $link.attr('href');
            
            if (!href) return;

            // Convert to absolute URL and filter protocols
            if (this.isExcludedProtocol(href)) return;
            
            const absoluteUrl = this.toAbsoluteUrl(href, this.baseUrl);
            if (!absoluteUrl.startsWith('http')) return;

            // Skip duplicates
            if (seenUrls.has(absoluteUrl)) return;
            seenUrls.add(absoluteUrl);

            // Extract preview information from search result
            const previewTitle = this.config.resultTitleSelector
                ? $el.find(this.config.resultTitleSelector).first().text().trim()
                : $link.text().trim();

            const previewSummary = this.config.resultSummarySelector
                ? $el.find(this.config.resultSummarySelector).first().text().trim()
                : undefined;

            const previewDate = this.config.resultDateSelector
                ? ($el.find(this.config.resultDateSelector).attr('datetime') ||
                   $el.find(this.config.resultDateSelector).first().text().trim())
                : undefined;

            // Check relevance using URL and preview text
            const combinedText = `${previewTitle} ${previewSummary || ''}`;
            if (!this.isRelevantPolicyUrl(absoluteUrl, combinedText, onderwerp, thema)) {
                return;
            }

            results.push({
                url: absoluteUrl,
                previewTitle,
                previewSummary,
                previewDate
            });
        });

        return results;
    }

    /**
     * Fetch and parse the detail page into a ScrapedDocument.
     */
    protected async scrapeDetailPage(
        url: string,
        onderwerp: string,
        thema: string,
        preview?: {
            previewTitle?: string;
            previewSummary?: string;
            previewDate?: string;
        }
    ): Promise<ScrapedDocument | null> {
        // Handle direct PDF links
        if (url.toLowerCase().endsWith('.pdf')) {
            return this.createDocumentFromPdfUrl(url, preview);
        }

        const html = await this.fetchPage(url);
        const $ = this.load(html);

        // Extract title
        const title = this.extractText($, this.config.detailTitleSelector)
            || preview?.previewTitle
            || 'Onbekende titel';

        // Extract summary/intro
        const summary = this.config.detailSummarySelector
            ? this.extractText($, this.config.detailSummarySelector)
            : undefined;

        // Extract main content for relevance scoring
        const content = this.extractText($, this.config.detailContentSelector);

        // Extract date
        const dateText = this.config.detailDateSelector
            ? ($(this.config.detailDateSelector).attr('datetime') ||
               this.extractText($, this.config.detailDateSelector))
            : preview?.previewDate;

        // Check for PDF download link
        let finalUrl = url;
        let documentType = 'Webpagina';

        if (this.config.detailPdfLinkSelector) {
            const pdfLink = $(this.config.detailPdfLinkSelector).first().attr('href');
            if (pdfLink && !this.isExcludedProtocol(pdfLink)) {
                finalUrl = this.toAbsoluteUrl(pdfLink, url);
                documentType = 'PDF';
            }
        }

        // Skip if no meaningful content found
        if (!title && !content && !summary) {
            return null;
        }

        // Determine document type from URL/content
        if (documentType === 'Webpagina') {
            documentType = this.determineDocumentType(finalUrl, title, content);
        }

        // Build the ScrapedDocument with strict types
        const doc: ScrapedDocument = {
            titel: title,
            url: finalUrl,
            website_url: this.baseUrl,
            website_titel: this.config.municipalityName,
            samenvatting: summary || preview?.previewSummary || this.generateSummary(content, title),
            type_document: documentType as DocumentType,
            publicatiedatum: toISODateString(this.parseDate(dateText)),
            relevanceScore: toRelevanceScore(this.calculateRelevanceScore(title, content, onderwerp, thema)),
            sourceType: 'gemeente',
            authorityLevel: 'municipal',
            municipalityName: this.config.municipalityName
        };

        return this.enrichWithSourceMetadata(doc);
    }

    /**
     * Create a document entry from a direct PDF URL
     */
    protected createDocumentFromPdfUrl(
        url: string,
        preview?: { previewTitle?: string; previewSummary?: string; previewDate?: string }
    ): ScrapedDocument {
        // Extract title from filename or preview
        const filename = decodeURIComponent(url.split('/').pop() || '');
        const title = preview?.previewTitle || filename.replace('.pdf', '').replace(/-/g, ' ');

        return {
            titel: title,
            url,
            website_url: this.baseUrl,
            website_titel: this.config.municipalityName,
            samenvatting: preview?.previewSummary || `PDF document: ${title}`,
            type_document: 'PDF' as DocumentType,
            publicatiedatum: toISODateString(this.parseDate(preview?.previewDate))
        };
    }

    /**
     * Enhanced relevance check for Dutch spatial-planning policy documents.
     */
    protected isRelevantPolicyUrl(
        url: string,
        text: string = '',
        onderwerp: string = '',
        thema: string = ''
    ): boolean {
        const urlLower = url.toLowerCase();
        const textLower = text.toLowerCase();
        const onderwerpLower = onderwerp.toLowerCase();
        const themaLower = thema.toLowerCase();

        // 1) Always respect global excludes from scraperConfig
        if (scraperConfig.excludeKeywords.some(keyword =>
            urlLower.includes(keyword) || textLower.includes(keyword)
        )) {
            return false;
        }

        // 2) Check if it matches the specific onderwerp/thema
        if (onderwerpLower && (urlLower.includes(onderwerpLower) || textLower.includes(onderwerpLower))) {
            return true;
        }
        if (themaLower && (urlLower.includes(themaLower) || textLower.includes(themaLower))) {
            return true;
        }

        // 3) Check Dutch spatial planning keywords
        if (DUTCH_PLANNING_KEYWORDS.some(keyword =>
            urlLower.includes(keyword) || textLower.includes(keyword)
        )) {
            return true;
        }

        // 4) Fall back to the generic relevantKeywords from scraperConfig
        return scraperConfig.relevantKeywords.some(keyword =>
            urlLower.includes(keyword) || textLower.includes(keyword)
        );
    }

    /**
     * Determine the document type based on URL, title, and content
     * Returns a strict DocumentType from the union type
     */
    protected determineDocumentType(url: string, title: string, content: string): DocumentType {
        const combined = `${url} ${title} ${content}`.toLowerCase();

        if (url.endsWith('.pdf')) return 'PDF';
        if (combined.includes('omgevingsvisie')) return 'Omgevingsvisie';
        if (combined.includes('omgevingsplan')) return 'Omgevingsplan';
        if (combined.includes('bestemmingsplan')) return 'Bestemmingsplan';
        if (combined.includes('structuurvisie')) return 'Structuurvisie';
        if (combined.includes('beleidsregel')) return 'Beleidsregel';
        if (combined.includes('beleidsnota') || combined.includes('nota')) return 'Beleidsnota';
        if (combined.includes('verordening')) return 'Verordening';
        if (combined.includes('visie')) return 'Visiedocument';
        if (combined.includes('rapport')) return 'Rapport';
        if (combined.includes('besluit')) return 'Besluit';
        
        return 'Beleidsdocument';
    }

    /**
     * Generate a summary from content if none provided
     */
    protected generateSummary(content: string, title: string): string {
        if (!content) return title;
        
        // Take first ~200 characters, ending at a word boundary
        const maxLength = 200;
        if (content.length <= maxLength) return content;
        
        const truncated = content.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        return (lastSpace > 100 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }

    /**
     * Parse date string to ISO format
     */
    protected parseDate(dateText?: string): string | null {
        if (!dateText) return null;

        // Try ISO format first
        if (/^\d{4}-\d{2}-\d{2}/.test(dateText)) {
            return dateText.split('T')[0];
        }

        // Dutch date format: dd-mm-yyyy or d-m-yyyy
        const dutchMatch = dateText.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dutchMatch) {
            const [, day, month, year] = dutchMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Dutch written format: "1 januari 2024"
        const months: Record<string, string> = {
            'januari': '01', 'februari': '02', 'maart': '03', 'april': '04',
            'mei': '05', 'juni': '06', 'juli': '07', 'augustus': '08',
            'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
        };
        const writtenMatch = dateText.toLowerCase().match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/);
        if (writtenMatch) {
            const [, day, monthName, year] = writtenMatch;
            return `${year}-${months[monthName]}-${day.padStart(2, '0')}`;
        }

        return null;
    }

    /**
     * Calculate relevance score based on keyword matches
     */
    protected calculateRelevanceScore(
        title: string,
        content: string,
        onderwerp: string,
        thema: string
    ): number {
        const combined = `${title} ${content}`.toLowerCase();
        const onderwerpLower = onderwerp.toLowerCase();
        const themaLower = thema.toLowerCase();

        let score = 0.5; // Base score

        // Boost for onderwerp match
        if (onderwerpLower && combined.includes(onderwerpLower)) {
            score += 0.2;
        }

        // Boost for thema match
        if (themaLower && combined.includes(themaLower)) {
            score += 0.15;
        }

        // Boost for Dutch planning keywords in title
        const titleLower = title.toLowerCase();
        const planningKeywordsInTitle = DUTCH_PLANNING_KEYWORDS.filter(kw => titleLower.includes(kw));
        score += Math.min(planningKeywordsInTitle.length * 0.1, 0.2);

        // Cap at 1.0
        return Math.min(score, 1.0);
    }
}

/**
 * Factory function to create a pre-configured municipality scraper
 */
export function createMunicipalityScraper(
    baseUrl: string,
    municipalityName: string,
    config: Partial<MunicipalityScraperConfig> = {},
    options: ScraperOptions = {}
): MunicipalityPolicyScraper {
    // Default configuration that works for many Dutch municipal sites
    const defaultConfig: MunicipalityScraperConfig = {
        municipalityName,
        searchPath: '/zoeken',
        searchParamName: 'q',
        resultItemSelector: '.search-result, .result-item, li.result, article.result',
        resultLinkSelector: 'a, h2 a, h3 a, .title a',
        resultTitleSelector: 'h2, h3, .title',
        resultSummarySelector: '.summary, .description, .intro, p',
        resultDateSelector: 'time, .date, .publication-date',
        detailTitleSelector: 'h1, .page-title, .article-title',
        detailContentSelector: 'main, #content, .content, article, .article-body',
        detailSummarySelector: '.intro, .lead, .summary',
        detailDateSelector: 'time, .publication-date, .date',
        detailPdfLinkSelector: 'a[href$=".pdf"]',
        maxResults: 20,
        ...config
    };

    return new MunicipalityPolicyScraper(baseUrl, defaultConfig, options);
}

// Export the planning keywords for use in tests and other scrapers
export { DUTCH_PLANNING_KEYWORDS };

