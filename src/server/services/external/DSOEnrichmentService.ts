/**
 * Service for enriching DSO documents with full content from Omgevingsdocumenten Download API
 * 
 * This service provides optional enrichment for high-ranked document candidates discovered
 * via Ontsluiten v2. It downloads full document content and generates fingerprints for
 * content-level deduplication.
 * 
 * API Documentation: https://developer.omgevingswet.overheid.nl/api-register/api/omgevingsdocument-downloaden/
 * Related: DSOOntsluitenService for document discovery
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { createHash } from 'crypto';
// @ts-expect-error - adm-zip doesn't have type declarations
import AdmZip from 'adm-zip';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';
import { DiscoveredDocument } from './DSOOntsluitenService.js';
import { ServiceUnavailableError, BadRequestError, NotFoundError, ExternalServiceError, RateLimitError } from '../../types/errors.js';

/**
 * Downloaded and extracted document content
 */
export interface EnrichedDocument extends DiscoveredDocument {
    /** Full text content extracted from OP-deel */
    fullContent?: string;
    /** Content fingerprint (SHA-256 hash) for deduplication */
    contentFingerprint?: string;
    /** Geographic information objects (if downloaded) */
    gios?: unknown[];
    /** OW-objecten (if downloaded) */
    owObjecten?: unknown[];
    /** Enrichment metadata */
    enrichmentMetadata?: {
        downloadedAt: string;
        zipSize?: number;
        contentSize?: number;
    };
}

/**
 * Options for document enrichment
 */
export interface EnrichmentOptions {
    /** Maximum number of documents to enrich (top-K) */
    topK?: number;
    /** Whether to download geographic information */
    includeGeographic?: boolean;
    /** Whether to download OW-objecten */
    includeOWObjects?: boolean;
    /** Rate limit delay in milliseconds (default: 100ms = 10 req/sec) */
    rateLimitDelay?: number;
}

/**
 * Service for enriching DSO documents with full content
 */
export class DSOEnrichmentService {
    private client: AxiosInstance;
    private downloadBaseUrl: string;
    private apiKey: string;
    private useProduction: boolean;
    private rateLimitDelay: number;

    constructor(useProduction: boolean = false, rateLimitDelay?: number) {
        // Load standardized deployment config
        const deploymentConfig = getDeploymentConfig();
        const dsoConfig = deploymentConfig.dso;

        // Support legacy useProduction flag, but prefer DSO_ENV from config
        this.useProduction = useProduction || (dsoConfig.env === 'prod');

        // Use standardized config, with fallback to legacy env vars for backward compatibility
        this.apiKey = dsoConfig.apiKey;

        if (!this.apiKey) {
            throw new ServiceUnavailableError(
                `DSO API key not configured. Set DSO_API_KEY (or legacy DSO_${this.useProduction ? 'PROD' : 'PREPROD'}_KEY) in .env`,
                {
                    reason: 'dso_api_key_not_configured',
                    environment: this.useProduction ? 'production' : 'preproduction',
                    operation: 'constructor'
                }
            );
        }

        // Use configured base URL or fallback to environment-based defaults
        this.downloadBaseUrl = dsoConfig.downloadenBaseUrl;

        // Rate limit delay: use configured poll interval, or provided value, or default
        this.rateLimitDelay = rateLimitDelay ?? dsoConfig.downloadenPollIntervalMs ?? 100;

        // Use centralized HTTP client for connection pooling and retry logic
        // Migrated from direct axios.create() to centralized client (WI-377)
        // Longer timeout for file downloads
        this.client = createHttpClient({
            baseURL: this.downloadBaseUrl,
            timeout: HTTP_TIMEOUTS.LONG, // 2 minutes for file downloads
            headers: {
                'X-API-KEY': this.apiKey,
                'Accept': 'application/zip, application/json',
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer' // For binary ZIP file
        });
    }

    /**
     * Check if DSO Enrichment API is configured (static method for validation before instantiation)
     * 
     * @param useProduction - Whether to check production or preprod configuration (legacy, uses DSO_ENV if not provided)
     * @returns true if API key is configured, false otherwise
     */
    static isConfigured(useProduction: boolean = false): boolean {
        try {
            const deploymentConfig = getDeploymentConfig();
            const dsoConfig = deploymentConfig.dso;
            // If useProduction is explicitly provided, check that environment matches
            if (useProduction && dsoConfig.env !== 'prod') {
                return false;
            }
            return !!dsoConfig.apiKey;
        } catch {
            // Fallback to legacy env vars if config loading fails
            const apiKey = useProduction
                ? process.env.DSO_PROD_KEY
                : process.env.DSO_PREPROD_KEY;
            return !!apiKey;
        }
    }

    /**
     * Check if this service instance is configured
     * 
     * @returns true if API key is configured, false otherwise
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Enrich top-K documents with full content
     * 
     * Only enriches the highest-ranked documents to minimize API calls and latency.
     */
    async enrichDocuments(
        documents: DiscoveredDocument[],
        options: EnrichmentOptions = {}
    ): Promise<EnrichedDocument[]> {
        const topK = options.topK ?? 10; // Default: enrich top 10
        const includeGeographic = options.includeGeographic ?? false;
        const includeOWObjects = options.includeOWObjects ?? false;

        // Sort by authority score (highest first) and select top-K
        const sorted = [...documents].sort((a, b) => (b.authorityScore || 0) - (a.authorityScore || 0));
        const candidates = sorted.slice(0, topK);

        const enriched: EnrichedDocument[] = [];
        
        for (const doc of candidates) {
            try {
                // Rate limiting: wait between requests
                if (enriched.length > 0) {
                    await this.delay(this.rateLimitDelay);
                }

                const enrichedDoc = await this.enrichDocument(doc, {
                    includeGeographic,
                    includeOWObjects
                });
                enriched.push(enrichedDoc);
            } catch (error) {
                // Log error but continue with other documents
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(
                    { sourceId: doc.sourceId, error: errorMessage },
                    'Failed to enrich document'
                );
                // Return original document without enrichment
                enriched.push(doc as EnrichedDocument);
            }
        }

        // Add remaining documents without enrichment
        const remaining = sorted.slice(topK);
        enriched.push(...remaining.map(doc => doc as EnrichedDocument));

        return enriched;
    }

    /**
     * Enrich a single document with full content
     */
    private async enrichDocument(
        document: DiscoveredDocument,
        options: { includeGeographic?: boolean; includeOWObjects?: boolean }
    ): Promise<EnrichedDocument> {
        if (!document.sourceId) {
            throw new BadRequestError('Document sourceId is required for enrichment', {
                reason: 'missing_source_id',
                operation: 'enrichDocument',
                documentId: document.sourceId || 'unknown'
            });
        }

        // Download document ZIP
        const zipBuffer = await this.downloadDocument(document.sourceId, options);
        
        // Extract ZIP contents
        const extracted = await this.extractZip(zipBuffer);
        
        // Generate content fingerprint
        const contentFingerprint = this.generateFingerprint(extracted.juridischeTekst);
        
        // Build enriched document
        const enriched: EnrichedDocument = {
            ...document,
            fullContent: extracted.juridischeTekst,
            contentFingerprint,
            gios: options.includeGeographic ? extracted.gios : undefined,
            owObjecten: options.includeOWObjects ? extracted.owObjecten : undefined,
            enrichmentMetadata: {
                downloadedAt: new Date().toISOString(),
                zipSize: zipBuffer.length,
                contentSize: extracted.juridischeTekst?.length
            }
        };

        // Update summary if we have full content
        if (extracted.juridischeTekst && !enriched.summary) {
            enriched.summary = extracted.juridischeTekst.substring(0, 500) + '...';
        }

        return enriched;
    }

    /**
     * Download document ZIP file from Download API
     */
    private async downloadDocument(
        documentId: string,
        options: { includeGeographic?: boolean; includeOWObjects?: boolean }
    ): Promise<Buffer> {
        try {
            // Build request body
            const requestBody: Record<string, unknown> = {
                documentId
            };

            // Add optional location parameters if geographic data is requested
            // (Implementation depends on API format - may need adjustment)
            if (options.includeGeographic) {
                // Note: Exact format needs to be verified from API documentation
                // requestBody.locaties = [...];
            }

            const response = await this.client.post('/download', requestBody);

            if (!Buffer.isBuffer(response.data)) {
                throw new ExternalServiceError('DSO Download API', 'Expected binary ZIP data, got non-buffer response', {
                    reason: 'invalid_response_format',
                    operation: 'downloadDocument',
                    documentId,
                    responseType: typeof response.data
                });
            }

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.response?.status === 429) {
                    throw new RateLimitError('Rate limit exceeded - please increase rateLimitDelay', {
                        reason: 'rate_limit_exceeded',
                        operation: 'downloadDocument',
                        service: 'DSO Download API',
                        documentId
                    });
                }
                if (axiosError.response?.status === 404) {
                    throw new NotFoundError('DSO document', documentId, {
                        reason: 'document_not_found',
                        operation: 'downloadDocument'
                    });
                }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ExternalServiceError('DSO Download API', `Failed to download document: ${errorMessage}`, {
                reason: 'download_failed',
                operation: 'downloadDocument',
                documentId,
                originalError: errorMessage
            });
        }
    }

    /**
     * Extract ZIP file contents
     * 
     * Extracts juridische tekst (OP-deel), GIO files, and OW-objecten from downloaded ZIP.
     */
    private async extractZip(zipBuffer: Buffer): Promise<{
        juridischeTekst: string;
        gios: unknown[];
        owObjecten: unknown[];
    }> {
        try {
            // Validate buffer before processing
            if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
                throw new Error(`Invalid ZIP buffer: ${zipBuffer?.length || 0} bytes`);
            }
            
            const zip = new AdmZip(zipBuffer);
            const entries = zip.getEntries();
            
            let juridischeTekst = '';
            const gios: unknown[] = [];
            const owObjecten: unknown[] = [];
            
            // Extract files from ZIP
            for (const entry of entries) {
                const entryName = entry.entryName.toLowerCase();
                let content: string;
                try {
                    content = entry.getData().toString('utf-8');
                } catch (error) {
                    // Handle buffer offset errors (corrupted ZIP or AdmZip bug)
                    logger.warn(
                        { 
                            error, 
                            entryName, 
                            zipSize: zipBuffer.length,
                            entrySize: entry.header?.size 
                        }, 
                        'Failed to extract ZIP entry, skipping'
                    );
                    continue;
                }
                
                // Extract juridische tekst (OP-deel) - typically in juridische-tekst/ folder
                if (entryName.includes('juridische-tekst') || entryName.includes('op-deel')) {
                    // Try to extract text content from XML/JSON
                    // For now, concatenate all text content
                    // Full parsing of STOP/TPOD format would require specialized parser
                    juridischeTekst += this.extractTextFromOPDeel(content) + '\n';
                }
                // Extract GIO files (geographic information objects)
                else if (entryName.includes('gio') || entryName.includes('geografisch')) {
                    try {
                        const gioData = JSON.parse(content);
                        gios.push(gioData);
                    } catch {
                        // If not JSON, store as raw content
                        gios.push({ content, filename: entry.entryName });
                    }
                }
                // Extract OW-objecten (Environment Act objects)
                else if (entryName.includes('ow-object') || entryName.includes('omgevingswet')) {
                    try {
                        const owData = JSON.parse(content);
                        owObjecten.push(owData);
                    } catch {
                        // If not JSON, store as raw content
                        owObjecten.push({ content, filename: entry.entryName });
                    }
                }
            }
            
            return {
                juridischeTekst: juridischeTekst.trim(),
                gios,
                owObjecten
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ExternalServiceError('DSO Enrichment', `Failed to extract ZIP contents: ${errorMessage}`, {
                reason: 'zip_extraction_failed',
                operation: 'extractZipContents',
                originalError: errorMessage
            });
        }
    }

    /**
     * Extract readable text from OP-deel content (STOP/TPOD format)
     * 
     * This is a simplified text extraction. Full parsing would require
     * a STOP/TPOD format parser.
     */
    private extractTextFromOPDeel(content: string): string {
        // Try to parse as JSON first
        try {
            const json = JSON.parse(content);
            // Extract text fields from JSON structure
            return this.extractTextFromJSON(json);
        } catch {
            // If not JSON, try XML
            // Simple XML text extraction (remove tags, keep text)
            return content
                .replace(/<[^>]+>/g, ' ') // Remove XML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
        }
    }

    /**
     * Extract text from JSON structure (recursive)
     */
    private extractTextFromJSON(obj: unknown, depth = 0): string {
        if (depth > 10) return ''; // Prevent infinite recursion
        
        if (typeof obj === 'string') {
            return obj;
        }
        
        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return String(obj);
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.extractTextFromJSON(item, depth + 1)).join(' ');
        }
        
        if (obj && typeof obj === 'object') {
            const textFields: string[] = [];
            for (const [key, value] of Object.entries(obj)) {
                // Focus on text-like fields
                if (key.toLowerCase().includes('text') || 
                    key.toLowerCase().includes('content') ||
                    key.toLowerCase().includes('titel') ||
                    key.toLowerCase().includes('label')) {
                    textFields.push(this.extractTextFromJSON(value, depth + 1));
                }
            }
            return textFields.join(' ');
        }
        
        return '';
    }

    /**
     * Generate content fingerprint (SHA-256 hash) for deduplication
     */
    private generateFingerprint(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Delay helper for rate limiting
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

