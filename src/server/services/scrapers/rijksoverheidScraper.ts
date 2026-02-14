/**
 * Rijksoverheid.nl Scraper
 * 
 * Specialized scraper for rijksoverheid.nl government documents
 */

import { DocumentType } from '../infrastructure/types.js';
import { BaseScraper, ScraperOptions } from './baseScraper.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { scraperConfig } from '../../config/scraperConfig.js';

export class RijksoverheidScraper extends BaseScraper {
    constructor(options: ScraperOptions = {}) {
        super(scraperConfig.sitePatterns.rijksoverheid.baseUrl, options);
    }

    async scrape(query: string, onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        try {
            // Strategy 1: Search for documents (depth 0 - initial search)
            const searchDocs = await this.searchDocuments(onderwerp, thema);
            documents.push(...searchDocs);

            // Strategy 2: Browse by topic if we have specific paths and followLinks is enabled
            if (this.options.followLinks && this.options.maxDepth > 0) {
                const browseDocs = await this.browseByTopic(onderwerp, 1);
                documents.push(...browseDocs);
            }

            return this.deduplicateDocuments(documents);
        } catch (error) {
            console.error('Error scraping rijksoverheid.nl:', error);
            return documents;
        }
    }

    /**
     * Search for documents using Rijksoverheid search
     */
    private async searchDocuments(onderwerp: string, thema: string): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];
        const searchQuery = `${onderwerp} ${thema}`.trim();

        // Rijksoverheid search URL pattern
        const searchUrl = `${this.baseUrl}/zoeken?searchterm=${encodeURIComponent(searchQuery)}&type=document`;

        try {
            const html = await this.fetchPage(searchUrl);
            const $ = this.load(html);

            // Extract search results
            $('.search-result-item, .document-item, .search-result').each((_, element) => {
                const $el = $(element);

                const titleLink = $el.find('a.result-title, a.document-link, h3 a').first();
                const title = titleLink.text().trim() || $el.find('h2, h3').text().trim();
                const url = titleLink.attr('href');

                if (url && title) {
                    const absoluteUrl = this.toAbsoluteUrl(url);
                    const summary = $el.find('.summary, .description, p').first().text().trim();
                    const date = $el.find('time, .date, .publication-date').attr('datetime') ||
                        $el.find('time, .date, .publication-date').text().trim();

                    const doc: ScrapedDocument = {
                        titel: title,
                        url: absoluteUrl,
                        website_url: this.baseUrl,
                        website_titel: 'Rijksoverheid',
                        samenvatting: summary || title,
                        type_document: this.determineDocumentType(absoluteUrl, title),
                        publicatiedatum: date || null,
                        sourceType: 'rijksoverheid',
                        authorityLevel: 'national'
                    };
                    documents.push(this.enrichWithSourceMetadata(doc));
                }
            });

            console.log(`Found ${documents.length} documents from rijksoverheid.nl search`);
        } catch (error) {
            console.error('Error searching rijksoverheid.nl:', error);
        }

        return documents;
    }

    /**
     * Browse documents by topic/onderwerp
     * @param onderwerp - The topic to browse
     * @param currentDepth - Current crawl depth (used for maxDepth limiting)
     */
    private async browseByTopic(onderwerp: string, currentDepth: number = 1): Promise<ScrapedDocument[]> {
        const documents: ScrapedDocument[] = [];

        // Check depth limit
        if (currentDepth > this.options.maxDepth) {
            console.log(`Skipping topic browsing: depth ${currentDepth} exceeds maxDepth ${this.options.maxDepth}`);
            return documents;
        }

        // Try to construct topic URL (onderwerpen pages)
        const topicSlug = onderwerp.toLowerCase().replace(/\s+/g, '-');
        const topicUrl = `${this.baseUrl}/onderwerpen/${topicSlug}`;

        try {
            const html = await this.fetchPage(topicUrl);
            const $ = this.load(html);

            // Look for document links on the page
            const docLinks = this.extractLinks($, '.document-link, a[href*="/documenten/"], a[href*="/publicaties/"]', topicUrl);

            // Limit to avoid too many requests
            const limitedLinks = docLinks.slice(0, 10);

            for (const docUrl of limitedLinks) {
                // Check both relevance AND that we should follow links
                if (!this.isRelevantUrl(docUrl)) {
                    continue;
                }

                // Check if we're within depth limit for following this link
                if (currentDepth + 1 > this.options.maxDepth) {
                    console.log(`Skipping ${docUrl}: would exceed maxDepth`);
                    continue;
                }

                try {
                    const doc = await this.extractDocumentDetails(docUrl);
                    if (doc) {
                        documents.push(doc);
                    }
                } catch (error) {
                    console.error(`Error extracting details from ${docUrl}:`, error);
                }
            }

            console.log(`Found ${documents.length} documents from rijksoverheid.nl topic browsing (depth: ${currentDepth})`);
        } catch (_error) {
            // Topic page might not exist, that's okay
            console.log(`Topic page not found for: ${onderwerp}`);
        }

        return documents;
    }

    /**
     * Extract details from a document page
     */
    private async extractDocumentDetails(url: string): Promise<ScrapedDocument | null> {
        try {
            const html = await this.fetchPage(url);
            const $ = this.load(html);

            const title = this.extractText($, 'h1, .page-title, .document-title');
            const summary = this.extractText($, '.intro, .summary, .lead');
            const date = $('time').attr('datetime') || $('.publication-date').text().trim();

            // Look for PDF download link
            const pdfLink = $('a[href$=".pdf"]').first().attr('href');
            const finalUrl = pdfLink ? this.toAbsoluteUrl(pdfLink) : url;

            if (title) {
                const doc: ScrapedDocument = {
                    titel: title,
                    url: finalUrl,
                    website_url: this.baseUrl,
                    website_titel: 'Rijksoverheid',
                    samenvatting: summary || title,
                    type_document: this.determineDocumentType(finalUrl, title),
                    publicatiedatum: date || null,
                    sourceType: 'rijksoverheid',
                    authorityLevel: 'national'
                };
                return this.enrichWithSourceMetadata(doc);
            }
        } catch (error) {
            console.error(`Error extracting document from ${url}:`, error);
        }

        return null;
    }

    /**
     * Determine document type
     */
    private determineDocumentType(url: string, title: string): DocumentType {
        if (url.includes('.pdf')) return 'PDF' as DocumentType;
        if (title.toLowerCase().includes('brief')) return 'Beleidsdocument';
        if (title.toLowerCase().includes('besluit')) return 'Besluit' as DocumentType;
        if (title.toLowerCase().includes('wet') || title.toLowerCase().includes('regeling')) return 'Beleidsdocument';
        if (title.toLowerCase().includes('rapport')) return 'Rapport' as DocumentType;
        if (title.toLowerCase().includes('nota')) return 'Beleidsnota';
        return 'Beleidsdocument';
    }

    /**
     * Remove duplicate documents by URL
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
