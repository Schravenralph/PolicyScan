/**
 * Gemeente (Municipal) Scraper
 * 
 * Generic scraper for municipal websites with common patterns
 */

import { BaseScraper, ScraperOptions } from './baseScraper.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { scraperConfig } from '../../config/scraperConfig.js';

export class GemeenteScraper extends BaseScraper {
    private gemeenteNaam: string;

    constructor(websiteUrl: string, gemeenteNaam: string = 'Gemeente', options: ScraperOptions = {}) {
        super(websiteUrl, options);
        this.gemeenteNaam = gemeenteNaam;
    }

    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        try {
            // Try common paths (each path starts at depth 0)
            for (const path of scraperConfig.sitePatterns.gemeente.commonPaths) {
                const pathUrl = `${this.baseUrl}${path}`;
                const pathDocs = await this.scrapePath(pathUrl, onderwerp, thema, 0);
                documents.push(...pathDocs);
            }

            return this.deduplicateDocuments(documents);
        } catch (error) {
            console.error(`Error scraping ${this.gemeenteNaam}:`, error);
            return documents;
        }
    }

    /**
     * Scrape a specific path for documents
     * @param url - URL to scrape
     * @param onderwerp - Subject to search for
     * @param thema - Theme to search for
     * @param currentDepth - Current crawl depth for maxDepth limiting
     */
    private async scrapePath(url: string, onderwerp: string, thema: string, currentDepth: number = 0): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        // Check depth limit
        if (currentDepth > this.options.maxDepth) {
            console.log(`Skipping ${url}: depth ${currentDepth} exceeds maxDepth ${this.options.maxDepth}`);
            return documents;
        }

        try {
            const html = await this.fetchPage(url);
            const $ = this.load(html);

            // Extract document links
            const links = this.extractLinks($, scraperConfig.sitePatterns.gemeente.selectors.documentLink, url);

            // Filter relevant links using isRelevantUrl
            const relevantLinks = links.filter(link => {
                // First check if it's relevant using the base method
                if (!this.isRelevantUrl(link)) {
                    return false;
                }
                // Then check topic match
                return (
                    link.toLowerCase().includes(onderwerp.toLowerCase()) ||
                    link.toLowerCase().includes(thema.toLowerCase())
                );
            }).slice(0, 5); // Limit per path

            // Check if we should follow links
            if (!this.options.followLinks) {
                console.log(`followLinks disabled: not following ${relevantLinks.length} links from ${url}`);
                return documents;
            }

            // Check if following would exceed depth limit
            if (currentDepth + 1 > this.options.maxDepth) {
                console.log(`Not following links from ${url}: would exceed maxDepth`);
                return documents;
            }

            for (const docUrl of relevantLinks) {
                try {
                    const doc = await this.extractDocumentDetails(docUrl);
                    if (doc) {
                        documents.push(doc);
                    }
                } catch (error) {
                    console.error(`Error extracting ${docUrl}:`, error);
                }
            }

            console.log(`Found ${documents.length} documents from ${url} (depth: ${currentDepth})`);
        } catch (_error) {
            // Path might not exist, that's okay
            console.log(`Path not accessible: ${url}`);
        }

        return documents;
    }

    /**
     * Extract document details from a page
     */
    private async extractDocumentDetails(url: string): Promise<ScrapedDocument | null> {
        try {
            // If it's a direct PDF, don't fetch it
            if (url.endsWith('.pdf')) {
                const title = decodeURIComponent(url.split('/').pop() || '').replace('.pdf', '');
                return {
                    titel: title,
                    url,
                    website_url: this.baseUrl,
                    website_titel: this.gemeenteNaam,
                    samenvatting: `PDF document: ${title}`,
                    type_document: 'PDF',
                    publicatiedatum: null
                };
            }

            const html = await this.fetchPage(url);
            const $ = this.load(html);

            const title = this.extractText($, scraperConfig.sitePatterns.gemeente.selectors.title) ||
                this.extractText($, 'h1, h2');

            const summary = this.extractText($, 'pdf, .intro, .summary, .lead, article p');
            const date = $('time').attr('datetime') ||
                this.extractText($, scraperConfig.sitePatterns.gemeente.selectors.date);

            // Check for PDF link on the page
            const pdfLink = $('a[href$=".pdf"]').first().attr('href');
            const finalUrl = pdfLink ? this.toAbsoluteUrl(pdfLink) : url;

            if (title) {
                return {
                    titel: title,
                    url: finalUrl,
                    website_url: this.baseUrl,
                    website_titel: this.gemeenteNaam,
                    samenvatting: summary || title,
                    type_document: finalUrl.endsWith('.pdf') ? 'PDF' : 'Webpagina',
                    publicatiedatum: date || null
                };
            }
        } catch (error) {
            console.error(`Error extracting details from ${url}:`, error);
        }

        return null;
    }

    /**
     * Remove duplicates
     */
    private deduplicateDocuments(documents: ScrapedDocument[]): ScrapedDocument[] {
        const seen = new Set<string>();
        return documents.filter(doc => {
            if (seen.has(doc.url)) {
                return false;
            }
            seen.add(doc.url);
            return true;
        });
    }
}
