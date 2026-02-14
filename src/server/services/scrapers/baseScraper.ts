/**
 * Base Scraper Class
 * 
 * Provides common functionality for all site-specific scrapers
 * 
 * ✅ **MIGRATED** - This class now uses CanonicalDocumentService internally.
 * 
 * **Migration Status:**
 * - ✅ `saveDocumentWithEmbedding()` now uses `CanonicalDocumentService.upsertBySourceId()`
 * - ✅ Documents are persisted to `canonical_documents` collection
 * - ✅ Maintains backward compatibility (same API, different implementation)
 * 
 * **Implementation Details:**
 * - ScrapedDocument is converted to CanonicalDocumentDraft
 * - Uses samenvatting as fullText (scraped documents typically have summary)
 * - All scrapers inheriting from BaseScraper automatically use canonical storage
 * 
 * **Migration Reference:**
 * - WI-414: Backend Write Operations Migration
 * - See `docs/70-sprint-backlog/WI-414-backend-write-operations-migration.md`
 * 
 * @see WI-414: Backend Write Operations Migration
 */

import * as cheerio from 'cheerio';
import { rateLimiter } from '../infrastructure/rateLimiter.js';
import { htmlCache } from '../infrastructure/cache.js';
import { scraperConfig } from '../../config/scraperConfig.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { DocumentEmbeddingService } from '../ingestion/embeddings/DocumentEmbeddingService.js';
import { BronDocument } from '../../models/BronDocument.js';
import type { BronDocumentDocument } from '../../types/index.js';
import { getSourceMetadata } from '../source/sourceDetection.js';
import { createHttpClient } from '../../config/httpClient.js';
import type { AxiosRequestConfig } from 'axios';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import type { CanonicalDocumentDraft, DocumentSource, DocumentFamily, ServiceContext } from '../../contracts/types.js';
import { logger } from '../../utils/logger.js';

// Type alias for CheerioAPI (return type of cheerio.load)
type CheerioAPI = ReturnType<typeof cheerio.load>;

export interface ScraperOptions {
    maxDepth?: number;
    followLinks?: boolean;
    respectRateLimit?: boolean;
    useCache?: boolean;
}

export abstract class BaseScraper {
    protected baseUrl: string;
    protected options: Required<ScraperOptions>;
    protected embeddingService?: DocumentEmbeddingService;

    constructor(baseUrl: string, options: ScraperOptions = {}) {
        this.baseUrl = baseUrl;
        this.options = {
            maxDepth: options.maxDepth ?? scraperConfig.maxDepth,
            followLinks: options.followLinks ?? true,
            respectRateLimit: options.respectRateLimit ?? true,
            useCache: options.useCache ?? true
        };

        // Initialize embedding service only if EMBEDDING_ENABLED=true
        if (process.env.EMBEDDING_ENABLED === 'true') {
            this.embeddingService = new DocumentEmbeddingService();
        }
    }

    /**
     * Fetch HTML content with rate limiting and caching
     */
    protected async fetchPage(url: string): Promise<string> {
        // Check cache first
        if (this.options.useCache) {
            const cached = htmlCache.getSync(url);
            if (cached) {
                console.log(`📦 Cache hit: ${url}`);
                return cached;
            }
        }

        // Apply rate limiting and robots.txt compliance
        if (this.options.respectRateLimit) {
            await rateLimiter.acquire(url);
        }

        const startTime = Date.now();
        try {
            // Fetch with retry logic
            const html = await this.fetchWithRetry(url);
            const responseTime = Date.now() - startTime;

            // Record successful request for adaptive rate limiting
            if (this.options.respectRateLimit) {
                rateLimiter.recordResult({
                    url,
                    success: true,
                    statusCode: 200,
                    responseTime
                });
            }

            // Cache the result
            if (this.options.useCache) {
                htmlCache.set(url, html);
            }

            return html;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            const statusCode = (error as { response?: { status?: number } })?.response?.status;

            // Record failed request for adaptive rate limiting
            if (this.options.respectRateLimit) {
                rateLimiter.recordResult({
                    url,
                    success: false,
                    statusCode,
                    responseTime,
                    error: error instanceof Error ? error : new Error(String(error))
                });
            }

            throw error;
        } finally {
            // Always release the rate limiter slot when done
            if (this.options.respectRateLimit) {
                rateLimiter.release(url);
            }
        }
    }

    /**
     * Fetch with exponential backoff retry
     * Implements exponential backoff for 429, 503, 504 errors as per acceptance criteria
     * Uses centralized HTTP client for connection pooling and basic retry logic
     * Additional scraper-specific retry logic handles 429 (rate limit) errors
     */
    private async fetchWithRetry(url: string, attempt: number = 0): Promise<string> {
        // Create HTTP client with scraper-specific timeout and disabled retry
        // (we handle retry logic ourselves for 429 errors)
        const httpClient = createHttpClient({
            timeout: scraperConfig.timeout,
            // Disable centralized retry - we handle retry logic specifically for 429 errors
            // Note: retryMax is not a standard Axios config option, handled separately
        });

        try {
            const config: AxiosRequestConfig = {
                headers: {
                    'User-Agent': scraperConfig.userAgent
                }
            };

            const response = await httpClient.get(url, config);
            return response.data;
        } catch (error: unknown) {
            const maxAttempts = scraperConfig.retry.maxAttempts;
            const statusCode = (error as { response?: { status?: number } })?.response?.status;

            // Check if this is a retryable error (429, 503, 504)
            // Note: 503, 504 are 5xx errors and would be retried by centralized client
            // but we handle them here for consistency with scraper-specific logic
            const isRetryableError = statusCode === 429 || statusCode === 503 || statusCode === 504;

            if (attempt < maxAttempts - 1 && (isRetryableError || !statusCode)) {
                // Exponential backoff: 1s, 2s, 4s, 8s, etc. as per acceptance criteria
                const delay = Math.min(
                    scraperConfig.retry.initialDelay * Math.pow(scraperConfig.retry.backoffMultiplier, attempt),
                    scraperConfig.retry.maxDelay
                );

                console.warn(`⚠️  Retry ${attempt + 1}/${maxAttempts} for ${url} after ${delay}ms${statusCode ? ` (HTTP ${statusCode})` : ''}`);
                await new Promise(resolve => setTimeout(resolve, delay));

                return this.fetchWithRetry(url, attempt + 1);
            }

            console.error(`❌ Failed to fetch ${url} after ${maxAttempts} attempts:`, error);
            throw error;
        }
    }

    /**
     * Load HTML with cheerio
     * Returns a CheerioAPI instance for parsing and querying the HTML
     */
    protected load(html: string): CheerioAPI {
        return cheerio.load(html);
    }

    /**
     * Extract absolute URL
     */
    protected toAbsoluteUrl(relativeUrl: string, baseUrl?: string): string {
        try {
            return new URL(relativeUrl, baseUrl || this.baseUrl).toString();
        } catch {
            return relativeUrl;
        }
    }

    /**
     * Check if URL is relevant based on keywords
     */
    protected isRelevantUrl(url: string, text: string = ''): boolean {
        const urlLower = url.toLowerCase();
        const textLower = text.toLowerCase();

        // Exclude if contains excluded keywords
        if (scraperConfig.excludeKeywords.some(keyword =>
            urlLower.includes(keyword) || textLower.includes(keyword)
        )) {
            return false;
        }

        // Include if contains relevant keywords
        return scraperConfig.relevantKeywords.some(keyword =>
            urlLower.includes(keyword) || textLower.includes(keyword)
        );
    }

    /**
     * Non-navigable protocols to exclude from extracted links
     */
    private static readonly EXCLUDED_PROTOCOLS = [
        'mailto:',
        'tel:',
        'javascript:',
        'data:',
        'blob:',
        'file:',
        '#'  // Fragment-only links
    ];

    /**
     * Check if a URL has an excluded protocol
     */
    protected isExcludedProtocol(href: string): boolean {
        const hrefLower = href.toLowerCase().trim();
        return BaseScraper.EXCLUDED_PROTOCOLS.some(protocol => 
            hrefLower.startsWith(protocol)
        );
    }

    /**
     * Extract links from a page, filtering out non-navigable protocols
     */
    protected extractLinks($: CheerioAPI, selector: string, baseUrl: string): string[] {
        const links: string[] = [];

        $(selector).each((_index: number, element) => {
            const href = $(element).attr('href');
            if (href && !this.isExcludedProtocol(href)) {
                const absoluteUrl = this.toAbsoluteUrl(href, baseUrl);
                // Only include http/https URLs
                if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
                    links.push(absoluteUrl);
                }
            }
        });

        return Array.from(new Set(links)); // Deduplicate
    }

    /**
     * Extract text content safely from a selector
     * Returns empty string if element not found
     */
    protected extractText($: CheerioAPI, selector: string): string {
        return $(selector).first().text().trim();
    }

    /**
     * Generate embedding for a document asynchronously (fire and forget)
     * This method:
     * - Generates embedding for the document
     * - Updates MongoDB document with embedding (via storeDocumentEmbedding)
     * - Adds to VectorService for fast search
     * - Handles errors gracefully (log but don't fail scraping)
     * 
     * Note: storeDocumentEmbedding() already handles both VectorService and MongoDB updates,
     * so we don't need to update MongoDB separately here.
     * 
     * @param documentId - MongoDB document ID
     * @param doc - The scraped document
     */
    protected generateEmbeddingAsync(documentId: string, doc: ScrapedDocument): void {
        // Only proceed if embedding is enabled and service is available
        if (!this.embeddingService || process.env.EMBEDDING_ENABLED !== 'true') {
            return;
        }

        // Run in background (don't await, but handle errors)
        (async () => {
            try {
                // Generate embedding, store in VectorService, and update MongoDB
                // storeDocumentEmbedding() handles all of this
                await this.embeddingService!.storeDocumentEmbedding(documentId, doc);

                console.log(`✅ Generated embedding for document ${documentId} (${doc.url})`);
            } catch (error) {
                // Log error but don't fail the scrape
                console.error(`⚠️  Failed to generate embedding for document ${documentId} (${doc.url}):`, error);
            }
        })().catch(error => {
            // Catch any unhandled errors in the async function
            console.error(`⚠️  Unhandled error in embedding generation for document ${documentId}:`, error);
        });
    }

    /**
     * Convert ScrapedDocument to CanonicalDocumentDraft
     * 
     * Handles the conversion of scraped documents to canonical format.
     * Uses samenvatting as fullText (scraped documents typically have summary).
     */
    private convertScrapedToCanonicalDraft(
        doc: ScrapedDocument,
        queryId?: string
    ): CanonicalDocumentDraft {
        // ScrapedDocument has samenvatting which can be used as fullText
        // If samenvatting is empty, use title as fallback
        const fullText = doc.samenvatting || doc.titel || 'No content available';

        // Compute content fingerprint
        const contentFingerprint = computeContentFingerprint(fullText);

        // Determine source based on sourceType or infer from URL
        let source: DocumentSource = 'Web'; // Default
        if (doc.sourceType === 'gemeente' || doc.sourceType === 'provincie' || (doc.sourceType as string) === 'waterschap') {
            source = 'Gemeente'; // Municipal sources
        } else if (doc.sourceType === 'rijksoverheid') {
            source = 'Wetgeving'; // Government sources
        }

        // Use URL as sourceId (stable identifier)
        const sourceId = doc.url;

        // Determine document family (default to Web, can be inferred from type)
        let documentFamily: DocumentFamily = 'Web';
        if (doc.type_document === 'Beleidsdocument' || doc.type_document === 'Beleidsnota') {
            documentFamily = 'Beleid';
        } else if ((doc.type_document as string) === 'Regeling' || doc.type_document === 'Verordening') {
            documentFamily = 'Juridisch';
        }

        // Parse publication date if available
        let publishedAt: Date | undefined;
        if (doc.publicatiedatum) {
            try {
                publishedAt = new Date(doc.publicatiedatum);
                if (isNaN(publishedAt.getTime())) {
                    publishedAt = undefined;
                }
            } catch {
                // Invalid date, ignore
            }
        }

        // Build enrichment metadata
        const enrichmentMetadata: Record<string, unknown> = {
            scraped: true,
            websiteTitel: doc.website_titel,
            relevanceScore: doc.relevanceScore,
            sourceType: doc.sourceType,
            authorityLevel: doc.authorityLevel,
            municipalityName: doc.municipalityName,
            provinceName: doc.provinceName,
            domain: doc.domain,
            domainConfidence: doc.domainConfidence,
            domainKeywords: doc.domainKeywords,
        };

        // Add queryId if provided
        if (queryId) {
            enrichmentMetadata.queryId = queryId;
        }

        // Remove undefined values
        Object.keys(enrichmentMetadata).forEach(key => {
            if (enrichmentMetadata[key] === undefined) {
                delete enrichmentMetadata[key];
            }
        });

        return {
            source,
            sourceId,
            canonicalUrl: doc.url,
            title: doc.titel,
            publisherAuthority: doc.website_titel || doc.municipalityName || doc.provinceName,
            documentFamily,
            documentType: doc.type_document,
            dates: {
                publishedAt,
            },
            fullText,
            contentFingerprint,
            language: 'nl', // Default to Dutch
            artifactRefs: [], // Empty for scraped documents (no artifact acquired yet)
            sourceMetadata: {
                url: doc.url,
                website_url: doc.website_url,
                website_titel: doc.website_titel,
                samenvatting: doc.samenvatting,
                type_document: doc.type_document,
                publicatiedatum: doc.publicatiedatum,
                scrapedAt: new Date().toISOString(),
            },
            enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
            // All scraped documents start with 'pending_review' status
            reviewStatus: 'pending_review',
        };
    }

    /**
     * Save a document to MongoDB and trigger async embedding generation
     * 
     * **Migration:** This method now uses CanonicalDocumentService instead of BronDocument.
     * Documents are persisted as canonical documents with proper structure.
     * 
     * This is a helper method that scrapers can use to save documents with embedding support.
     * 
     * @param doc - The scraped document to save
     * @param queryId - Optional query ID to associate with the document
     * @returns The saved document with MongoDB _id (backward compatible format)
     */
    protected async saveDocumentWithEmbedding(
        doc: ScrapedDocument,
        queryId?: string
    ): Promise<BronDocumentDocument> {
        // Convert ScrapedDocument to CanonicalDocumentDraft
        const canonicalDraft = this.convertScrapedToCanonicalDraft(doc, queryId);

        // Persist using CanonicalDocumentService
        const canonicalService = getCanonicalDocumentService();
        const serviceContext: ServiceContext = {};

        let savedCanonical;
        try {
            savedCanonical = await canonicalService.upsertBySourceId(canonicalDraft, serviceContext);
        } catch (error) {
            logger.error(
                { error, url: doc.url, queryId },
                'Failed to persist scraped document to canonical_documents collection'
            );
            throw error;
        }

        // Convert saved canonical document to BronDocumentDocument format for backward compatibility
        // This maintains the return type while using canonical storage
        const savedDocument: BronDocumentDocument = {
            _id: savedCanonical._id as any, // Type compatibility
            titel: savedCanonical.title,
            url: savedCanonical.canonicalUrl || savedCanonical.sourceId,
            website_url: doc.website_url,
            website_titel: doc.website_titel || '',
            label: 'scraped',
            samenvatting: doc.samenvatting,
            'relevantie voor zoekopdracht': `Document gevonden tijdens scraping van ${doc.website_titel || 'website'}`,
            type_document: doc.type_document,
            publicatiedatum: doc.publicatiedatum,
            subjects: [],
            themes: [],
            accepted: null,
            queryId: queryId as any,
            createdAt: savedCanonical.createdAt,
            updatedAt: savedCanonical.updatedAt,
        };

        // Trigger async embedding generation in background (don't await)
        // Note: Embedding service works with canonical documents (uses canonical document ID)
        // ScrapedDocument is passed for text extraction, but storage uses canonical format
        if (this.embeddingService && process.env.EMBEDDING_ENABLED === 'true') {
            const documentId = savedCanonical._id;
            this.generateEmbeddingAsync(documentId, doc);
        }

        return savedDocument;
    }

    /**
     * Enriches a ScrapedDocument with source metadata (source type, authority level, etc.)
     * This method should be called when creating documents to ensure source metadata is populated
     * 
     * @param doc - The document to enrich
     * @returns The document with source metadata added
     */
    protected enrichWithSourceMetadata(doc: ScrapedDocument): ScrapedDocument {
        // Only add metadata if not already present
        if (doc.sourceType && doc.authorityLevel) {
            return doc;
        }

        const sourceMetadata = getSourceMetadata(doc.url, doc.website_titel);
        
        return {
            ...doc,
            sourceType: doc.sourceType || sourceMetadata.sourceType,
            authorityLevel: doc.authorityLevel || sourceMetadata.authorityLevel,
            municipalityName: doc.municipalityName || sourceMetadata.municipalityName,
            provinceName: doc.provinceName || sourceMetadata.provinceName
        };
    }

    /**
     * Abstract method - each scraper implements its own logic
     */
    abstract scrape(query: string, onderwerp: string, thema: string, traceSessionId?: string): Promise<ScrapedDocument[]>;
}
