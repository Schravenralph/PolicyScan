/**
 * Service for searching government publications using SRU (Search and Retrieval via URL)
 * 
 * This service interfaces with the KOOP (Kennis- en Exploitatiecentrum Officiële Overheidspublicaties)
 * repository via SRU protocol at https://repository.overheid.nl/sru
 * 
 * SRU Protocol: https://www.loc.gov/standards/sru/
 * KOOP Repository: https://repository.overheid.nl/
 */

import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { z, type ZodIssue } from 'zod';
import { DiscoveredDocument } from './DSOOntsluitenService.js';
import { logger } from '../../utils/logger.js';
import { validateParsedRecord, type ParsedSruRecord } from './sruSchemas.js';

/**
 * Government level for SRU queries
 */
export type Overheidslaag = 'Rijk' | 'Provincie' | 'Gemeente' | 'Waterschap';

/**
 * SRU query parameters
 */
export interface SruQueryParams {
    /** Topic/subject to search for */
    onderwerp: string;
    /** Optional: Government authority (e.g., "Gemeente Amsterdam") */
    authority?: string;
    /** Optional: Publication type (e.g., "Gemeenteblad", "Staatscourant") */
    type?: string;
    /** Optional: Government level filter */
    overheidslaag?: Overheidslaag;
    /** Optional: Date range - from date (YYYY-MM-DD) */
    dateFrom?: string;
    /** Optional: Date range - to date (YYYY-MM-DD) */
    dateTo?: string;
    /** Optional: Start date (alias for dateFrom, for compatibility) */
    startDate?: string;
    /** Optional: Maximum number of results (default: 50, max: 1000) */
    maxResults?: number;
}

/**
 * Cache entry for SRU query results
 */
interface CacheEntry {
    data: DiscoveredDocument[];
    timestamp: number;
}

/**
 * Service for querying SRU endpoints
 */
export class SruService {
    private readonly BASE_URL = 'https://repository.overheid.nl/sru';
    private client: AxiosInstance;
    private readonly RECORD_SCHEMA = 'gzd'; // Gebruikers-Zichtbare Data format
    private cache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    constructor(baseUrl?: string) {
        this.client = axios.create({
            baseURL: baseUrl || this.BASE_URL,
            timeout: 30000, // 30 second timeout
            headers: {
                'Accept': 'application/xml',
                'User-Agent': 'Beleidsscan/1.0'
            }
        });

    }

    /**
     * Check if the service is configured (always true for SRU as it's a public API)
     */
    isConfigured(): boolean {
        return true; // SRU is a public API, no configuration needed
    }

    /**
     * Build cache key from query parameters
     * 
     * @param params Query parameters
     * @returns Cache key string
     */
    private buildCacheKey(params: SruQueryParams): string {
        return JSON.stringify({
            onderwerp: params.onderwerp,
            authority: params.authority,
            type: params.type,
            overheidslaag: params.overheidslaag,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            maxResults: params.maxResults
        });
    }

    /**
     * Build CQL (Common Query Language) query from parameters
     * 
     * CQL Reference: https://www.loc.gov/standards/sru/cql/
     * KOOP CQL Indexes: https://repository.overheid.nl/sru?operation=explain
     * 
     * Query Strategy:
     * - Uses ANY operator instead of ALL for more permissive matching
     * - Searches both title and description fields to increase recall
     * - Multi-word queries match documents containing any of the words
     */
    private buildCql(params: SruQueryParams): string {
        const clauses: string[] = [];

        // Title and description search (dt.title and dt.description = Dublin Core fields)
        // Use ANY operator for more permissive matching (matches documents containing any of the query words)
        // This is more flexible than ALL which requires all words to appear
        if (params.onderwerp) {
            // Escape quotes in the search term
            const escapedOnderwerp = params.onderwerp.replace(/"/g, '\\"');
            // Search both title and description fields with ANY operator for better recall
            clauses.push(`(dt.title ANY "${escapedOnderwerp}" OR dt.description ANY "${escapedOnderwerp}")`);
        }

        // Creator/authority filter (dt.creator = Dublin Core creator)
        if (params.authority) {
            const escapedAuthority = params.authority.replace(/"/g, '\\"');
            clauses.push(`dt.creator="${escapedAuthority}"`);
        }

        // Type filter (dt.type = Dublin Core type)
        if (params.type) {
            const escapedType = params.type.replace(/"/g, '\\"');
            clauses.push(`dt.type="${escapedType}"`);
        }

        // Date range filters (dt.date = Dublin Core date)
        // Support both dateFrom and startDate (for compatibility)
        const startDate = params.dateFrom || params.startDate;
        if (startDate) {
            clauses.push(`dt.date >= "${startDate}"`);
        }
        if (params.dateTo) {
            clauses.push(`dt.date <= "${params.dateTo}"`);
        }

        // Government level filter
        // Maps government levels to publication types:
        // - Rijk -> Staatscourant (national publications)
        // - Provincie -> Provinciaalblad (provincial publications)
        // - Gemeente -> Gemeenteblad (municipal publications)
        // - Waterschap -> Waterschapsblad (water authority publications)
        if (params.overheidslaag) {
            const levelFilter = this.mapGovernmentLevelToCql(params.overheidslaag);
            if (levelFilter) {
                clauses.push(levelFilter);
            }
        }

        // If no clauses, return a default query that matches all
        if (clauses.length === 0) {
            return 'cql.allRecords=1';
        }

        // Combine clauses with AND
        // Example: (dt.title ANY "betaalbare huisvesting" OR dt.description ANY "betaalbare huisvesting") AND dt.creator="Aalten"
        const cqlQuery = clauses.join(' AND ');
        return cqlQuery;
    }

    /**
     * Map government level to SRU CQL filter
     * 
     * Maps government levels to publication types:
     * - Rijk -> Staatscourant (national publications)
     * - Provincie -> Provinciaalblad (provincial publications)
     * - Gemeente -> Gemeenteblad (municipal publications)
     * - Waterschap -> Waterschapsblad (water authority publications)
     * 
     * @param level Government level
     * @returns CQL filter string or undefined if level not supported
     */
    private mapGovernmentLevelToCql(level: Overheidslaag): string | undefined {
        const levelMappings: Record<Overheidslaag, string> = {
            'Rijk': 'dt.type="Staatscourant"',
            'Provincie': 'dt.type="Provinciaalblad"',
            'Gemeente': 'dt.type="Gemeenteblad"',
            'Waterschap': 'dt.type="Waterschapsblad"',
        };

        return levelMappings[level];
    }

    /**
     * Fetch documents from SRU endpoint with caching
     * 
     * Cache TTL: 24 hours
     * Cache key: Based on query parameters (onderwerp, authority, type, dateFrom, dateTo, maxResults)
     */
    async fetchDocuments(params: SruQueryParams): Promise<DiscoveredDocument[]> {
        const startTime = Date.now();
        let cacheHit = false;
        
        try {
            // Check cache first
            const cacheKey = this.buildCacheKey(params);
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                cacheHit = true;
                const duration = Date.now() - startTime;
                logger.debug(
                    { cacheKey, count: cached.data.length, responseTime: duration, cacheHit: true },
                    '[SRU] Cache hit - returning cached documents'
                );
                
                // Log performance metric for cache hit
                logger.info(
                    {
                        service: 'SRU',
                        responseTime: duration,
                        query: params.onderwerp,
                        resultCount: cached.data.length,
                        cacheHit: true,
                        maxResults: params.maxResults || 50
                    },
                    'SRU performance metric'
                );
                
                return cached.data;
            }
            
            // Cache miss or expired - fetch from SRU
            const cql = this.buildCql(params);
            const maxRecords = Math.min(params.maxResults || 50, 1000); // Cap at 1000

            // Log the actual CQL query being sent for debugging
            logger.info(
                { 
                    cql, 
                    maxRecords, 
                    onderwerp: params.onderwerp,
                    authority: params.authority,
                    overheidslaag: params.overheidslaag,
                    type: params.type,
                    cacheHit: false 
                },
                '[SRU] Executing SRU query (cache miss)'
            );
            
            logger.debug(
                { cql, maxRecords, params, cacheHit: false },
                '[SRU] Executing SRU query (cache miss) - detailed params'
            );

            const apiStartTime = Date.now();
            const response = await this.client.get('', {
                params: {
                    operation: 'searchRetrieve',
                    version: '1.2',
                    recordSchema: this.RECORD_SCHEMA,
                    maximumRecords: maxRecords.toString(),
                    query: cql,
                    startRecord: '1',
                    httpAccept: 'application/xml'
                }
            });
            const apiDuration = Date.now() - apiStartTime;

            // Parse XML response
            const parseStartTime = Date.now();
            const documents = this.parseXmlResponse(response.data);
            const parseDuration = Date.now() - parseStartTime;

            // Enhance titles with actual subjects from HTML pages (for officielebekendmakingen URLs)
            const enhanceStartTime = Date.now();
            const enhancedDocuments = await this.enhanceTitlesFromPages(documents);
            const enhanceDuration = Date.now() - enhanceStartTime;

            // Store in cache
            this.cache.set(cacheKey, {
                data: enhancedDocuments,
                timestamp: Date.now()
            });

            const totalDuration = Date.now() - startTime;

            logger.info(
                { count: documents.length, cql, cached: true },
                '[SRU] Found documents via SRU and cached'
            );

            // Log performance metrics
            logger.info(
                {
                    service: 'SRU',
                    responseTime: totalDuration,
                    apiTime: apiDuration,
                    parseTime: parseDuration,
                    query: params.onderwerp,
                    resultCount: documents.length,
                    cacheHit: false,
                    maxResults: maxRecords,
                    cql: cql.substring(0, 100) // Truncate long CQL queries
                },
                'SRU performance metric'
            );

            return documents;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(
                { error, params, responseTime: duration, cacheHit },
                '[SRU] Error fetching documents from SRU endpoint'
            );
            
            // Log performance metric for errors
            logger.info(
                {
                    service: 'SRU',
                    responseTime: duration,
                    query: params.onderwerp,
                    resultCount: 0,
                    cacheHit: false,
                    error: true,
                    errorType: error instanceof Error ? error.constructor.name : 'Unknown'
                },
                'SRU performance metric'
            );
            
            // Return empty array on error (don't break workflow)
            return [];
        }
    }

    /**
     * Parse SRU XML response and extract records
     * 
     * SRU Response Format (simplified):
     * <searchRetrieveResponse>
     *   <numberOfRecords>...</numberOfRecords>
     *   <records>
     *     <record>
     *       <recordData>
     *         <gzd:record>
     *           <dc:title>...</dc:title>
     *           <dc:creator>...</dc:creator>
     *           <dc:date>...</dc:date>
     *           <dc:identifier>...</dc:identifier>
     *           <dc:type>...</dc:type>
     *           <dc:description>...</dc:description>
     *         </gzd:record>
     *       </recordData>
     *     </record>
     *   </records>
     * </searchRetrieveResponse>
     */
    private parseXmlResponse(xmlData: string): DiscoveredDocument[] {
        try {
            const $ = cheerio.load(xmlData, { xmlMode: true });
            const documents: DiscoveredDocument[] = [];

            // Find all record elements (handle namespaced tags)
            // Match sru:record (most common) or just record
            const records = $('sru\\:record, record');

            records.each((_index, element) => {
                const $record = $(element);
                
                // Extract data from recordData
                // Support sru:recordData or recordData
                let $recordData = $record.find('sru\\:recordData');
                if ($recordData.length === 0) {
                    $recordData = $record.find('recordData');
                }
                
                // Find the content container.
                // In GZD schema, it can be gzd:gzd > gzd:originalData > ...
                // or just nested elements.
                // We'll search broadly within recordData for the Dublin Core elements
                const $searchContext = $recordData;

                // Extract text using multiple possible selectors including dcterms
                const title = this.extractText($searchContext, 'dcterms\\:title, dc\\:title, title');
                const creator = this.extractText($searchContext, 'dcterms\\:creator, dc\\:creator, creator');
                const date = this.extractText($searchContext, 'dcterms\\:modified, dcterms\\:date, dc\\:date, date');
                const identifier = this.extractText($searchContext, 'dcterms\\:identifier, dc\\:identifier, identifier');
                const type = this.extractText($searchContext, 'dcterms\\:type, dc\\:type, type');
                const description = this.extractText($searchContext, 'dcterms\\:description, dc\\:description, description, dcterms\\:abstract');

                // Extract ELI (Electronic Law Identifier) if available
                // ELI format: https://zoek.officielebekendmakingen.nl/gmb-2024-1234.html
                let eli: string | undefined;
                if (identifier) {
                    // Check if identifier is an ELI URL
                    if (identifier.includes('officielebekendmakingen.nl') || 
                        identifier.includes('zoek.officielebekendmakingen.nl')) {
                        eli = identifier;
                    }
                }

                // Build parsed record structure for validation
                const parsedRecord: ParsedSruRecord = {
                    title: title || undefined,
                    creator: creator || undefined,
                    date: date || undefined,
                    identifier: identifier || undefined,
                    type: type || undefined,
                    description: description || undefined,
                    eli: eli || undefined,
                };

                // Validate parsed record with Zod schema
                const validatedMetadata = validateParsedRecord(parsedRecord);
                
                if (!validatedMetadata) {
                    logger.debug(
                        { parsedRecord },
                        '[SRU] Record validation failed, skipping'
                    );
                    return;
                }

                // Build URL - prioritize ELI URLs from identifier field
                let url = '';
                
                // Priority 1: Use ELI if available (already a complete URL)
                if (eli && eli.startsWith('http')) {
                    // Validate ELI URL is not just base domain
                    if (eli.includes('zoek.officielebekendmakingen.nl')) {
                        try {
                            const urlObj = new URL(eli);
                            const pathname = urlObj.pathname.trim();
                            const isBaseDomainOnly = pathname === '' || pathname === '/';
                            
                            if (isBaseDomainOnly) {
                                throw new Error(
                                    `Invalid ELI URL for officielebekendmakingen document: base domain only (${eli}). ` +
                                    `Must have a document path. ` +
                                    `Identifier: ${validatedMetadata.identifier}, Title: ${validatedMetadata.titel || 'N/A'}`
                                );
                            }
                        } catch (error) {
                            // If it's our validation error, re-throw it
                            if (error instanceof Error && error.message.includes('Invalid ELI URL')) {
                                throw error;
                            }
                            // Otherwise it's a URL parsing error
                            throw new Error(
                                `Invalid ELI URL format for officielebekendmakingen document: ${eli}. ` +
                                `Error: ${error instanceof Error ? error.message : String(error)}`
                            );
                        }
                    }
                    url = eli;
                    logger.debug(
                        { eli, identifier: validatedMetadata.identifier },
                        '[SRU] Using ELI URL from identifier field'
                    );
                }
                // Priority 2: Check if identifier is already a complete URL
                else if (validatedMetadata.identifier && validatedMetadata.identifier.startsWith('http')) {
                    const identifierUrl = validatedMetadata.identifier;
                    
                    // Check if URL is just the base domain (no document path)
                    try {
                        const urlObj = new URL(identifierUrl);
                        const pathname = urlObj.pathname.trim();
                        const isBaseDomainOnly = pathname === '' || pathname === '/';
                        
                        if (isBaseDomainOnly && identifierUrl.includes('zoek.officielebekendmakingen.nl')) {
                            // Base domain only - try to construct proper URL from metadata
                            if (validatedMetadata.soort_publicatie && validatedMetadata.titel) {
                                const constructedUrl = this.constructUrlFromType(
                                    validatedMetadata.soort_publicatie,
                                    validatedMetadata.identifier,
                                    validatedMetadata.datum_bekendmaking,
                                    validatedMetadata.titel
                                );
                                if (constructedUrl.startsWith('http') && constructedUrl !== identifierUrl) {
                                    url = constructedUrl;
                                    logger.debug(
                                        { originalIdentifier: identifierUrl, constructedUrl, type: validatedMetadata.soort_publicatie, title: validatedMetadata.titel },
                                        '[SRU] Constructed URL from metadata (identifier was base domain only)'
                                    );
                                } else {
                                    // Construction failed or returned same URL - throw error
                                    throw new Error(
                                        `Cannot construct proper URL for officielebekendmakingen document. ` +
                                        `Identifier is base domain only (${identifierUrl}) and URL construction failed. ` +
                                        `Type: ${validatedMetadata.soort_publicatie}, Title: ${validatedMetadata.titel}`
                                    );
                                }
                            } else {
                                // No metadata to construct URL - throw error
                                throw new Error(
                                    `Cannot construct proper URL for officielebekendmakingen document. ` +
                                    `Identifier is base domain only (${identifierUrl}) but no metadata available to construct URL. ` +
                                    `Missing: ${!validatedMetadata.soort_publicatie ? 'soort_publicatie' : ''}${!validatedMetadata.titel ? 'titel' : ''}`
                                );
                            }
                        } else {
                            // URL has a path, use it as-is
                            url = identifierUrl;
                            logger.debug(
                                { identifier: identifierUrl },
                                '[SRU] Using identifier as complete URL'
                            );
                        }
                    } catch (error) {
                        // Invalid URL format - throw error
                        throw new Error(
                            `Invalid URL format in identifier for officielebekendmakingen document: ${identifierUrl}. ` +
                            `Error: ${error instanceof Error ? error.message : String(error)}`
                        );
                    }
                }
                // Priority 3: Construct URL from type, identifier, and title
                else if (validatedMetadata.soort_publicatie && validatedMetadata.identifier) {
                    // Construct URL from type and identifier
                    // Example: Gemeenteblad -> https://zoek.officielebekendmakingen.nl/gmb-{year}-{number}.html
                    // Pass title to enable parsing of patterns like "Gemeenteblad 2023, 186577"
                    const constructedUrl = this.constructUrlFromType(
                        validatedMetadata.soort_publicatie,
                        validatedMetadata.identifier,
                        validatedMetadata.datum_bekendmaking,
                        validatedMetadata.titel
                    );
                    if (constructedUrl.startsWith('http')) {
                        url = constructedUrl;
                        logger.debug(
                            { constructedUrl, type: validatedMetadata.soort_publicatie, identifier: validatedMetadata.identifier, title: validatedMetadata.titel },
                            '[SRU] Constructed URL from type and identifier'
                        );
                    } else {
                        // URL construction failed - throw error
                        throw new Error(
                            `Cannot construct proper URL for officielebekendmakingen document. ` +
                            `URL construction from metadata failed. ` +
                            `Type: ${validatedMetadata.soort_publicatie}, Identifier: ${validatedMetadata.identifier}, Title: ${validatedMetadata.titel}`
                        );
                    }
                }

                // Validate that we have a proper URL (not base domain only)
                if (!url) {
                    throw new Error(
                        `Cannot construct URL for officielebekendmakingen document. ` +
                        `No URL could be constructed from identifier: ${validatedMetadata.identifier}, ` +
                        `Type: ${validatedMetadata.soort_publicatie || 'N/A'}, Title: ${validatedMetadata.titel || 'N/A'}`
                    );
                }

                // Final validation: ensure URL is not just base domain
                if (url.includes('zoek.officielebekendmakingen.nl')) {
                    try {
                        const urlObj = new URL(url);
                        const pathname = urlObj.pathname.trim();
                        const isBaseDomainOnly = pathname === '' || pathname === '/';
                        
                        if (isBaseDomainOnly) {
                            throw new Error(
                                `Invalid URL for officielebekendmakingen document: base domain only (${url}). ` +
                                `Must have a document path. ` +
                                `Identifier: ${validatedMetadata.identifier}, Title: ${validatedMetadata.titel || 'N/A'}`
                            );
                        }
                    } catch (error) {
                        // If it's our validation error, re-throw it
                        if (error instanceof Error && error.message.includes('Invalid URL for officielebekendmakingen')) {
                            throw error;
                        }
                        // Otherwise it's a URL parsing error, which is also a problem
                        throw new Error(
                            `Invalid URL format for officielebekendmakingen document: ${url}. ` +
                            `Identifier: ${validatedMetadata.identifier}`
                        );
                    }
                }

                // Validate title is present
                if (!validatedMetadata.titel) {
                    throw new Error(
                        `Missing title for officielebekendmakingen document. ` +
                        `Identifier: ${validatedMetadata.identifier}, URL: ${url}`
                    );
                }

                // Map validated metadata to DiscoveredDocument format
                // Title enhancement will happen after parsing in fetchDocuments
                const document: DiscoveredDocument = {
                    title: validatedMetadata.titel.trim(),
                    url: url,
                    summary: validatedMetadata.description || undefined,
                    documentCategory: 'official_publication',
                    documentType: validatedMetadata.soort_publicatie || validatedMetadata.publicatienaam || this.inferDocumentType(validatedMetadata.titel, validatedMetadata.soort_publicatie),
                    sourceType: 'OFFICIELEBEKENDMAKINGEN',
                    sourceId: validatedMetadata.identifier || eli || url,
                    issuingAuthority: validatedMetadata.uitgevende_instantie || undefined,
                    publicationDate: validatedMetadata.datum_bekendmaking || undefined,
                    authorityScore: 0.9, // High authority score for official publications
                    matchSignals: {
                        keyword: 0.8, // Default keyword match score
                        metadata: 0.9 // High metadata match for structured data
                    },
                    matchExplanation: `Official publication found via SRU/KOOP repository${validatedMetadata.soort_publicatie ? ` (${validatedMetadata.soort_publicatie})` : ''}`,
                    provenance: [{
                        sourceType: 'SRU_KOOP',
                        url: url,
                        fetchedAt: new Date().toISOString()
                    }]
                };

                documents.push(document);
            });

            return documents;
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.error(
                    { 
                        error: error.issues,
                        errorDetails: error.issues.map((e: ZodIssue) => ({
                            path: e.path.join('.'),
                            message: e.message,
                            code: e.code
                        }))
                    },
                    '[SRU] Schema validation error parsing XML response'
                );
                // Re-throw schema validation errors - these indicate data quality issues
                throw error;
            } else if (error instanceof Error && (error.message.includes('Cannot construct') || error.message.includes('Invalid URL') || error.message.includes('Missing title'))) {
                // Re-throw URL construction errors - these should not be silently ignored
                logger.error(
                    { 
                        error: error.message,
                        stack: error.stack,
                        errorType: error.constructor.name
                    },
                    '[SRU] URL construction error - cannot create proper document URL'
                );
                throw error;
            } else {
                logger.error(
                    { error },
                    '[SRU] Error parsing XML response'
                );
                // For other errors, still return empty array to not break workflow
                // but log the error for debugging
                return [];
            }
        }
    }

    /**
     * Enhance titles for officielebekendmakingen documents by fetching actual subjects from HTML pages
     */
    private async enhanceTitlesFromPages(documents: DiscoveredDocument[]): Promise<DiscoveredDocument[]> {
        // Filter documents that need title enhancement (officielebekendmakingen URLs)
        const documentsToEnhance = documents.filter(doc => 
            doc.url.includes('zoek.officielebekendmakingen.nl') && 
            doc.sourceType === 'OFFICIELEBEKENDMAKINGEN'
        );

        if (documentsToEnhance.length === 0) {
            return documents;
        }

        // Enhance titles in parallel (with reasonable concurrency limit)
        const enhancedPromises = documentsToEnhance.map(async (doc) => {
            try {
                const enhancedTitle = await this.fetchActualTitleFromPage(doc);
                if (enhancedTitle) {
                    return { ...doc, title: enhancedTitle };
                }
            } catch (error) {
                // Log but don't fail - use original title as fallback
                logger.debug(
                    { error: error instanceof Error ? error.message : String(error), url: doc.url, originalTitle: doc.title },
                    '[SRU] Failed to enhance title from page, using original'
                );
            }
            return doc;
        });

        const enhancedDocs = await Promise.all(enhancedPromises);

        // Replace enhanced documents in the original array
        const enhancedMap = new Map(enhancedDocs.map(doc => [doc.url, doc]));
        return documents.map(doc => enhancedMap.get(doc.url) || doc);
    }

    /**
     * Fetch the actual title (subject) from an officielebekendmakingen.nl page
     * and format it as: "Gemeenteblad van {municipality} {year}, {number}: {actual title}"
     */
    private async fetchActualTitleFromPage(doc: DiscoveredDocument): Promise<string | null> {
        const url = doc.url;
        const originalTitle = doc.title;
        
        // Extract metadata from document
        const metadata = {
            titel: originalTitle,
            uitgevende_instantie: doc.issuingAuthority,
            datum_bekendmaking: doc.publicationDate
        };
        try {
            // Fetch the HTML page
            const response = await this.client.get(url, {
                headers: {
                    'Accept': 'text/html',
                },
                timeout: 10000, // 10 second timeout for HTML fetch
            });

            if (!response.data || typeof response.data !== 'string') {
                return null;
            }

            const $ = cheerio.load(response.data);

            // Extract the actual subject title from the page
            // Try multiple selectors that might contain the actual title
            // Priority: specific staatscourant_kop selector > h1 > .publication-title > meta og:title > title tag
            let actualTitle: string | null = null;
            
            // First, try the specific selector used by officielebekendmakingen.nl
            // This is a <p> element with class "staatscourant_kop" or "_p_single-kop-titel"
            const specificTitle = $('p.staatscourant_kop._p_single-kop-titel, p.staatscourant_kop, .staatscourant_kop, p._p_single-kop-titel').first().text().trim();
            if (specificTitle && specificTitle.length > 10 && !specificTitle.match(/^(?:Gemeenteblad|Staatscourant|Provinciaalblad)\s+\d{4}/i)) {
                actualTitle = specificTitle;
                logger.debug(
                    { url, title: actualTitle.substring(0, 100) },
                    '[SRU] Found title using staatscourant_kop selector'
                );
            }
            
            // If specific selector didn't work, try h1
            if (!actualTitle) {
                const h1Text = $('h1').first().text().trim();
                if (h1Text && !h1Text.match(/^(?:Gemeenteblad|Staatscourant|Provinciaalblad)\s+\d{4}/i)) {
                    // h1 doesn't match the generic "Gemeenteblad 2024, 12345" pattern, use it
                    actualTitle = h1Text;
                }
            }
            
            // If h1 wasn't suitable, try other selectors
            if (!actualTitle) {
                actualTitle = 
                    $('.publication-title').first().text().trim() ||
                    $('meta[property="og:title"]').attr('content')?.trim() ||
                    $('title').text().trim() ||
                    null;
            }
            
            // Clean up the title - remove "Gemeenteblad 2024, 12345 | " prefix if present
            if (actualTitle) {
                actualTitle = actualTitle
                    .replace(/^(?:Gemeenteblad|Staatscourant|Provinciaalblad)\s+\d{4}[,\s]+\d+\s*[|:]\s*/i, '')
                    .replace(/\s*\|\s*Overheid\.nl.*$/i, '')
                    .replace(/\s*>\s*Officiële bekendmakingen.*$/i, '')
                    .trim();
            }

            // If we couldn't find a different title, return null to use original
            if (!actualTitle || actualTitle === metadata.titel || actualTitle.length < 3) {
                return null;
            }

            // Extract municipality name from uitgevende_instantie or page
            let municipalityName: string | null = null;
            
            // Try to extract from uitgevende_instantie (e.g., "Gemeente Arnhem" -> "Arnhem")
            if (metadata.uitgevende_instantie) {
                const gemeenteMatch = metadata.uitgevende_instantie.match(/gemeente\s+(.+)/i);
                if (gemeenteMatch) {
                    municipalityName = gemeenteMatch[1].trim();
                } else if (metadata.uitgevende_instantie.toLowerCase().includes('gemeente')) {
                    // Fallback: try to extract name after "Gemeente"
                    const parts = metadata.uitgevende_instantie.split(/\s+/);
                    const gemeenteIndex = parts.findIndex(p => p.toLowerCase() === 'gemeente');
                    if (gemeenteIndex >= 0 && gemeenteIndex < parts.length - 1) {
                        municipalityName = parts.slice(gemeenteIndex + 1).join(' ').trim();
                    }
                }
            }

            // If not found in metadata, try to extract from page
            if (!municipalityName) {
                // Look for municipality in structured data or page content
                const jsonLd = $('script[type="application/ld+json"]').html();
                if (jsonLd) {
                    try {
                        const data = JSON.parse(jsonLd);
                        const publisher = data.publisher?.name || data.creator?.name;
                        if (publisher && typeof publisher === 'string') {
                            const gemeenteMatch = publisher.match(/gemeente\s+(.+)/i);
                            if (gemeenteMatch) {
                                municipalityName = gemeenteMatch[1].trim();
                            }
                        }
                    } catch {
                        // JSON parsing failed, continue
                    }
                }
            }

            // Extract year and number from the original title or URL
            let year = '';
            let number = '';
            
            // Try to extract from original title (e.g., "Gemeenteblad 2024, 52490")
            const titleMatch = metadata.titel.match(/(?:gemeenteblad|gmb)\s+(\d{4})[,\s]+(\d+)/i);
            if (titleMatch) {
                year = titleMatch[1];
                number = titleMatch[2];
            } else {
                // Try to extract from URL (e.g., "gmb-2024-52490.html")
                const urlMatch = url.match(/gmb-(\d{4})-(\d+)\.html/i);
                if (urlMatch) {
                    year = urlMatch[1];
                    number = urlMatch[2];
                }
            }

            // Format the enhanced title
            // Format: "Gemeenteblad van {municipality} {year}, {number}: {actual title}"
            if (municipalityName && year && number) {
                const enhancedTitle = `Gemeenteblad van ${municipalityName} ${year}, ${number}: ${actualTitle}`;
                logger.debug(
                    { originalTitle, enhancedTitle, url, municipalityName, year, number },
                    '[SRU] Enhanced title with actual subject from page'
                );
                return enhancedTitle;
            } else if (year && number) {
                // Fallback without municipality name
                const enhancedTitle = `Gemeenteblad ${year}, ${number}: ${actualTitle}`;
                logger.debug(
                    { originalTitle, enhancedTitle, url, year, number },
                    '[SRU] Enhanced title (without municipality)'
                );
                return enhancedTitle;
            } else {
                // Fallback: just use the actual title if we can't format properly
                logger.debug(
                    { originalTitle, actualTitle, url },
                    '[SRU] Using actual title without formatting (missing year/number)'
                );
                return actualTitle;
            }
        } catch (error) {
            // Return null on error - will use original title
            logger.debug(
                { error: error instanceof Error ? error.message : String(error), url, originalTitle },
                '[SRU] Error fetching actual title from page'
            );
            return null;
        }
    }

    /**
     * Extract text content from XML elements using CSS selectors
     */
    private extractText($parent: cheerio.Cheerio<any>, selectors: string): string {
        const selectorList = selectors.split(',').map(s => s.trim());
        for (const selector of selectorList) {
            const text = $parent.find(selector).first().text().trim();
            if (text) {
                return text;
            }
        }
        return '';
    }

    /**
     * Infer document type from title and type metadata
     */
    private inferDocumentType(title: string, type?: string): string | undefined {
        const text = `${title} ${type || ''}`.toLowerCase();
        
        const typePatterns: Record<string, string> = {
            'verordening': 'Verordening',
            'beleidsregel': 'Beleidsregel',
            'besluit': 'Besluit',
            'nota': 'Nota',
            'regeling': 'Regeling',
            'circulaire': 'Circulaire',
            'richtlijn': 'Richtlijn',
            'gemeenteblad': 'Gemeenteblad',
            'staatscourant': 'Staatscourant',
            'provinciaalblad': 'Provinciaalblad'
        };

        for (const [pattern, docType] of Object.entries(typePatterns)) {
            if (text.includes(pattern)) {
                return docType;
            }
        }

        return type || undefined;
    }

    /**
     * Construct URL from publication type and identifier
     * 
     * Extracts year and publication number from title, identifier, or date.
     * Priority: title parsing > identifier parsing > date parsing
     */
    private constructUrlFromType(type: string, identifier: string, date?: string, title?: string): string {
        const typeLower = type.toLowerCase();
        
        let year = '';
        let number = '';

        // Priority 1: Try to extract from title (most reliable when title has format "Type Year, Number")
        // Examples: "Gemeenteblad 2023, 186577", "Gemeenteblad 2025, 549870", "Staatscourant 2024, 12345"
        if (title) {
            if (typeLower.includes('gemeenteblad') || typeLower.includes('gmb')) {
                // Pattern: "Gemeenteblad 2023, 186577" or "Gemeenteblad 2025, 549870" or "Gemeenteblad 2025 547180"
                // Match with optional comma and flexible whitespace
                const titleMatch = title.match(/(?:gemeenteblad|gmb)\s+(\d{4})[,\s]+(\d+)/i);
                if (titleMatch) {
                    year = titleMatch[1];
                    number = titleMatch[2];
                    logger.debug(
                        { title, year, number, type: 'gemeenteblad' },
                        '[SRU] Extracted year and number from Gemeenteblad title'
                    );
                }
            } else if (typeLower.includes('staatscourant') || typeLower.includes('stb')) {
                // Pattern: "Staatscourant 2024, 12345"
                const titleMatch = title.match(/(?:staatscourant|stb)\s+(\d{4})[,\s]+(\d+)/i);
                if (titleMatch) {
                    year = titleMatch[1];
                    number = titleMatch[2];
                    logger.debug(
                        { title, year, number, type: 'staatscourant' },
                        '[SRU] Extracted year and number from Staatscourant title'
                    );
                }
            } else if (typeLower.includes('provinciaalblad') || typeLower.includes('prb')) {
                // Pattern: "Provinciaalblad 2024, 12345"
                const titleMatch = title.match(/(?:provinciaalblad|prb)\s+(\d{4})[,\s]+(\d+)/i);
                if (titleMatch) {
                    year = titleMatch[1];
                    number = titleMatch[2];
                    logger.debug(
                        { title, year, number, type: 'provinciaalblad' },
                        '[SRU] Extracted year and number from Provinciaalblad title'
                    );
                }
            }
        }

        // Priority 2: Extract year from date or identifier if not found in title
        if (!year) {
            if (date) {
                const yearMatch = date.match(/\d{4}/);
                if (yearMatch) {
                    year = yearMatch[0];
                }
            }
            if (!year && identifier) {
                const yearMatch = identifier.match(/\d{4}/);
                if (yearMatch) {
                    year = yearMatch[0];
                }
            }
        }

        // Priority 2: Extract number from identifier if not found in title
        if (!number && identifier) {
            // Check if identifier already contains the publication pattern (e.g., "gmb-2025-549870")
            if (typeLower.includes('gemeenteblad') || typeLower.includes('gmb')) {
                const idMatch = identifier.match(/gmb-(\d{4})-(\d+)/i);
                if (idMatch) {
                    if (!year) year = idMatch[1];
                    number = idMatch[2];
                }
            } else if (typeLower.includes('staatscourant') || typeLower.includes('stb')) {
                const idMatch = identifier.match(/stb-(\d{4})-(\d+)/i);
                if (idMatch) {
                    if (!year) year = idMatch[1];
                    number = idMatch[2];
                }
            } else if (typeLower.includes('provinciaalblad') || typeLower.includes('prb')) {
                const idMatch = identifier.match(/prb-(\d{4})-(\d+)/i);
                if (idMatch) {
                    if (!year) year = idMatch[1];
                    number = idMatch[2];
                }
            }
            
            // If still no number, try to extract digits (but be careful if year is already extracted)
            if (!number) {
                // If we have a year, try to extract number after the year
                if (year && identifier.includes(year)) {
                    const parts = identifier.split(year);
                    if (parts.length > 1) {
                        // Extract digits from the part after the year
                        const numberMatch = parts[1].match(/(\d+)/);
                        if (numberMatch) {
                            number = numberMatch[1];
                        }
                    }
                }
                // Fallback: remove all non-digits (but this might include year if not already extracted)
                if (!number) {
                    number = identifier.replace(/\D/g, '') || identifier;
                }
            }
        }

        // Map publication types to URL patterns
        if (typeLower.includes('gemeenteblad') || typeLower.includes('gmb')) {
            // Gemeenteblad: https://zoek.officielebekendmakingen.nl/gmb-{year}-{number}.html
            if (year && number) {
                return `https://zoek.officielebekendmakingen.nl/gmb-${year}-${number}.html`;
            }
            // Fallback if we have number but no year
            if (number) {
                return `https://zoek.officielebekendmakingen.nl/gmb-${year || '2024'}-${number}.html`;
            }
        } else if (typeLower.includes('staatscourant') || typeLower.includes('stb')) {
            // Staatscourant: https://zoek.officielebekendmakingen.nl/stb-{year}-{number}.html
            if (year && number) {
                return `https://zoek.officielebekendmakingen.nl/stb-${year}-${number}.html`;
            }
            // Fallback if we have number but no year
            if (number) {
                return `https://zoek.officielebekendmakingen.nl/stb-${year || '2024'}-${number}.html`;
            }
        } else if (typeLower.includes('provinciaalblad') || typeLower.includes('prb')) {
            // Provinciaalblad: https://zoek.officielebekendmakingen.nl/prb-{year}-{number}.html
            if (year && number) {
                return `https://zoek.officielebekendmakingen.nl/prb-${year}-${number}.html`;
            }
            // Fallback if we have number but no year
            if (number) {
                return `https://zoek.officielebekendmakingen.nl/prb-${year || '2024'}-${number}.html`;
            }
        }

        // Fallback: use identifier as-is if it looks like a URL
        if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
            return identifier;
        }

        // No valid URL can be constructed - throw error instead of using hex identifier
        throw new Error(
            `Cannot construct proper URL for ${type} publication. ` +
            `Failed to extract year and number from metadata. ` +
            `Identifier: ${identifier}, Title: ${title || 'N/A'}, Date: ${date || 'N/A'}. ` +
            `Expected format: gmb-{year}-{number}.html but could not extract year/number from available data.`
        );
    }
}

