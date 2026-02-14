/**
 * Service for querying the Omgevingsinformatie Ontsluiten v2 API
 * 
 * This API provides unified search across both IMOW (new) and IMRO (legacy) documents,
 * making it ideal for comprehensive policy document discovery.
 * 
 * API Documentation: https://developer.omgevingswet.overheid.nl/api-register/api/omgevingsinformatie-ontsluiten/
 * Research Documentation: docs/30-dso-ontsluiten-v2/API-RESEARCH.md
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { DSOCatalogusService } from './DSOCatalogusService.js';
import { logger } from '../../utils/logger.js';
import { ServiceConfigurationError, ServiceConnectionError, ServiceRateLimitError } from '../../utils/serviceErrors.js';
import { ServiceUnavailableError, BadRequestError } from '../../types/errors.js';
import { buildDsoPublicUrl } from '../../utils/dsoUrlBuilder.js';

/**
 * Document search query parameters
 */
export interface DocumentSearchQuery {
    /** Topic/query terms for fuzzy matching */
    query?: string;
    /** Document identifier */
    identificatie?: string;
    /** Document title */
    titel?: string;
    /** Issuing authority (bevoegd gezag / opgesteld door) */
    opgesteldDoor?: string;
    /** Document type filter */
    type?: string;
    /** Optional geographic context */
    location?: {
        address?: string;
        geometry?: GeoJSON.Geometry;
    };
}

/**
 * Document suggestion from the API
 */
export interface DocumentSuggestion {
    /** Stable document identifier (critical for deduplication) */
    identificatie: string;
    /** Document title */
    titel: string;
    /** Document type (IMOW/IMRO) - distinguish for proper handling */
    type: string;
    /** Issuing authority (bevoegd gezag / opgesteld door) */
    opgesteldDoor?: string;
    /** Validity date */
    geldigheidsdatum?: string;
    /** Publication date */
    publicatiedatum?: string;
    /** Expiration date */
    vervaldatum?: string;
    /** Additional metadata fields from API response */
    [key: string]: unknown;
}

/**
 * Canonical discovered document format
 * 
 * **Note:** This interface is maintained for backward compatibility with external APIs
 * (DSO, IPLO, Officiele Bekendmakingen, etc.) that return documents in this format.
 * 
 * **For workflow code:**
 * - Use `CanonicalDocument` (from `@/server/contracts/types`) as the primary document format
 * - `DiscoveredDocument` should only be used when interfacing with external services
 * - Convert `DiscoveredDocument` to `CanonicalDocument` using `discoveredDocumentToCanonicalDraft()` 
 *   from `@/server/services/workflow/legacyToCanonicalConverter`
 * 
 * **Migration Status:**
 * - ✅ All workflow actions now use `CanonicalDocument[]`
 * - ✅ All workflow services now use `CanonicalDocument[]`
 * - ⚠️ This interface is kept for external API compatibility only
 * 
 * @see CanonicalDocument - The canonical document format used throughout the workflow
 * @see WI-REFACTOR-001 through WI-REFACTOR-008 for migration details
 */
export interface DiscoveredDocument {
    title: string;
    url: string;
    summary?: string;
    documentCategory: 'policy' | 'official_publication' | 'jurisprudence' | 'guidance' | 'unverified_external';
    documentType?: string;
    sourceType: 'DSO' | 'IPLO' | 'KNOWN_SOURCE' | 'OFFICIELEBEKENDMAKINGEN' | 'RECHTSPRAAK' | 'COMMON_CRAWL' | 'GOOGLE_SEARCH';
    sourceId?: string;
    issuingAuthority?: string;
    publicationDate?: string;
    authorityScore: number;
    matchSignals: { keyword?: number; semantic?: number; metadata?: number };
    matchExplanation?: string;
    provenance: Array<{ sourceType: string; url: string; fetchedAt: string }>;
    /** Additional metadata including full text, source-specific fields, and linked data */
    metadata?: Record<string, unknown>;
}

/**
 * Sanitize parameters to remove sensitive data from logs
 */
function sanitizeParams(params: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!params) return params;
    
    const sanitized = { ...params };
    const sensitiveKeys = ['apiKey', 'token', 'password', 'secret', 'authorization', 'x-api-key'];
    
    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        }
    }
    
    return sanitized;
}

/**
 * Format response body for logging (bounded to prevent log bloat)
 */
function formatResponseBodySnippet(responseData: unknown): string {
    if (!responseData) {
        return 'No response body';
    }
    
    try {
        const jsonString = JSON.stringify(responseData);
        // Bound to 500 characters as specified in work item
        return jsonString.length > 500 
            ? `${jsonString.substring(0, 500)}... (truncated)`
            : jsonString;
    } catch {
        return String(responseData).substring(0, 500);
    }
}

/**
 * Service for interacting with Omgevingsinformatie Ontsluiten v2 API
 * 
 * **Response Format Documentation:**
 * The API response format is documented in `docs/30-dso-ontsluiten-v2/API-RESPONSE-FORMAT.md`.
 * The service handles three possible response formats gracefully:
 * 1. Direct array: `response.data` is directly an array of document objects
 * 2. Items array: `response.data.items` is an array of document objects
 * 3. Documenten array: `response.data.documenten` is an array of document objects
 * 
 * The service logs which format is used to help identify the actual format in production.
 * See the documentation for details on verification methods.
 */
export class DSOOntsluitenService {
    private client: AxiosInstance;
    private baseUrl: string;
    private apiKey: string;
    private useProduction: boolean;
    private fallbackService: DSOCatalogusService | null = null;

    constructor(useProduction: boolean = false) {
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
        this.baseUrl = dsoConfig.ontsluitenBaseUrl;

        // Use centralized HTTP client for connection pooling and retry logic
        // Migrated from direct axios.create() to centralized client (WI-377)
        // API requires Accept: application/hal+json (HAL JSON format)
        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD, // 30 seconds
            headers: {
                'X-API-KEY': this.apiKey,
                'Accept': 'application/hal+json',
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check if DSO API is configured (static method for validation before instantiation)
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
     * Check API health
     * Tries the suggestion endpoint with a minimal query
     */
    async checkHealth(): Promise<boolean> {
        try {
            // Try a simple health check - the endpoint exists (we got 405 before)
            // This is a best-effort check since we don't know the exact format yet
            const response = await this.client.get('/documenten/_suggereer', {
                params: { query: 'test' },
                validateStatus: (status) => status < 500 // Accept 4xx as "endpoint exists"
            });
            return response.status < 500;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                // 405 means endpoint exists but wrong method - that's still "healthy"
                if (axiosError.response?.status === 405) {
                    return true;
                }
                // 4xx errors mean endpoint exists but request format is wrong - still "healthy"
                if (axiosError.response?.status && axiosError.response.status < 500) {
                    return true;
                }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'DSO Ontsluiten health check failed');
            return false;
        }
    }

    /**
     * Suggest documents based on search query
     * 
     * This is the main discovery method. It searches across both IMOW and IMRO documents.
     * 
     * Based on OpenAPI spec (docs/30-dso-ontsluiten-v2/openapi-dso-ontsluiten-v2.json), the endpoint
     * uses GET method with query parameters. The endpoint is `/documenten/_suggereer`.
     * Response format: { _embedded: { suggesties: [...] } }
     */
    async suggestDocuments(query: DocumentSearchQuery): Promise<DocumentSuggestion[]> {
        // Validate configuration
        const missingConfig: string[] = [];
        if (!this.baseUrl) missingConfig.push('DSO_API_URL');
        if (!this.apiKey) missingConfig.push('DSO_API_KEY');
        if (missingConfig.length > 0) {
            throw new ServiceConfigurationError('DSO', missingConfig);
        }

        // Build query parameters according to OpenAPI spec
        // Required: _find (search term)
        // Optional: geldigOp, beschikbaarOp, limit, inclusiefToekomstigGeldig, synchroniseerMetTileset
        const params: Record<string, string | number> = {};
        
        // Build _find parameter - combine query fields
        const findParts: string[] = [];
        if (query.query) findParts.push(query.query);
        if (query.identificatie) findParts.push(query.identificatie);
        if (query.titel) findParts.push(query.titel);
        if (query.opgesteldDoor) findParts.push(query.opgesteldDoor);
        if (query.type) findParts.push(query.type);
        
        if (findParts.length === 0) {
            throw new BadRequestError('At least one search parameter (query, identificatie, titel, opgesteldDoor, or type) must be provided', {
                reason: 'missing_search_parameters',
                operation: 'suggestDocuments',
                providedParams: {
                    query: query.query,
                    identificatie: query.identificatie,
                    titel: query.titel,
                    opgesteldDoor: query.opgesteldDoor,
                    type: query.type
                }
            });
        }
        
        params._find = findParts.join(' ');
        
        // Optional parameters
        if (query.location?.address) {
            // Note: Location search may need to use /documenten/_zoek endpoint instead
            // For now, we'll include it in _find if it's a simple address string
            params._find = `${params._find} ${query.location.address}`.trim();
        }
        
        params.limit = 20; // Default from OpenAPI spec

        const endpoint = '/documenten/_suggereer';
        const fullUrl = `${this.baseUrl}${endpoint}`;

        // Enhanced logging: log request details for observability
        const requestLog = {
            method: 'GET',
            url: fullUrl,
            headers: {
                'X-API-KEY': this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET',
                'Accept': 'application/hal+json',
            },
            params,
            environment: this.useProduction ? 'production' : 'preproduction'
        };
        logger.debug({ request: requestLog }, 'Making DSO Ontsluiten API request');

        try {
            // Use GET method with query parameters (per OpenAPI spec)
            // API requires Accept: application/hal+json (HAL JSON format)
            const response = await this.client.get(endpoint, {
                params,
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Accept': 'application/hal+json',
                }
            });

            // Enhanced logging: log response details for observability
            const responseLog = {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                dataType: typeof response.data,
                isArray: Array.isArray(response.data),
                dataKeys: typeof response.data === 'object' && response.data !== null ? Object.keys(response.data) : 'N/A',
                dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
                dataSample: typeof response.data === 'object' && response.data !== null 
                    ? JSON.stringify(response.data).substring(0, 500) 
                    : String(response.data).substring(0, 500)
            };
            logger.debug({ response: responseLog }, 'DSO Ontsluiten API response received');

            // Parse response - handles multiple possible response formats
            // See docs/30-dso-ontsluiten-v2/API-RESPONSE-FORMAT.md for detailed format documentation
            // The service handles three possible formats gracefully to ensure compatibility:
            // 1. Direct array (most likely based on API design patterns)
            // 2. Items array (wrapped in object with 'items' property)
            // 3. Documenten array (wrapped in object with 'documenten' property)
            // The service logs which format is used to help identify the actual format in production.
            const data = response.data;
            
            // Format 1: Direct array (most likely based on API design)
            // Expected: response.data is directly an array of document objects
            if (Array.isArray(data)) {
                const parsed: DocumentSuggestion[] = [];
                let parseErrors = 0;
                for (const item of data) {
                    try {
                        parsed.push(this.parseSuggestion(item));
                    } catch (parseError) {
                        parseErrors++;
                        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                        logger.warn(
                            { parseError: errorMsg, itemIndex: parseErrors, itemSample: JSON.stringify(item).substring(0, 500) },
                            'Failed to parse DSO Ontsluiten item'
                        );
                    }
                }
                logger.info(
                    { parsedCount: parsed.length, rawCount: data.length, parseErrors, format: 'direct array' },
                    'Successfully parsed DSO Ontsluiten documents'
                );
                if (parsed.length === 0 && data.length > 0) {
                    logger.warn(
                        { rawCount: data.length, parseErrors, sampleItem: JSON.stringify(data[0]).substring(0, 500) },
                        'API returned items but parsing resulted in 0 documents - may indicate parsing issue'
                    );
                }
                return parsed;
            }
            
            // Format 2: Items array (wrapped in object with 'items' property)
            // Expected: response.data.items is an array of document objects
            if (data.items && Array.isArray(data.items)) {
                const parsed: DocumentSuggestion[] = [];
                let parseErrors = 0;
                for (const item of data.items) {
                    try {
                        parsed.push(this.parseSuggestion(item));
                    } catch (parseError) {
                        parseErrors++;
                        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                        logger.warn(
                            { parseError: errorMsg, itemIndex: parseErrors, itemSample: JSON.stringify(item).substring(0, 500) },
                            'Failed to parse DSO Ontsluiten item'
                        );
                    }
                }
                logger.info(
                    { parsedCount: parsed.length, rawCount: data.items.length, parseErrors, format: 'data.items array' },
                    'Successfully parsed DSO Ontsluiten documents'
                );
                if (parsed.length === 0 && data.items.length > 0) {
                    logger.warn(
                        { rawCount: data.items.length, parseErrors, sampleItem: JSON.stringify(data.items[0]).substring(0, 500) },
                        'API returned items but parsing resulted in 0 documents - may indicate parsing issue'
                    );
                }
                return parsed;
            }
            
            // Format 3: Documenten array (wrapped in object with 'documenten' property)
            // Expected: response.data.documenten is an array of document objects
            if (data.documenten && Array.isArray(data.documenten)) {
                const parsed: DocumentSuggestion[] = [];
                let parseErrors = 0;
                for (const item of data.documenten) {
                    try {
                        parsed.push(this.parseSuggestion(item));
                    } catch (parseError) {
                        parseErrors++;
                        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
                        logger.warn(
                            { parseError: errorMsg, itemIndex: parseErrors, itemSample: JSON.stringify(item).substring(0, 500) },
                            'Failed to parse DSO Ontsluiten item'
                        );
                    }
                }
                logger.info(
                    { parsedCount: parsed.length, rawCount: data.documenten.length, parseErrors, format: 'data.documenten array' },
                    'Successfully parsed DSO Ontsluiten documents'
                );
                if (parsed.length === 0 && data.documenten.length > 0) {
                    logger.warn(
                        { rawCount: data.documenten.length, parseErrors, sampleItem: JSON.stringify(data.documenten[0]).substring(0, 500) },
                        'API returned items but parsing resulted in 0 documents - may indicate parsing issue'
                    );
                }
                return parsed;
            }
            
            // Fallback: Unexpected format - log detailed warning with full diagnostic info
            const diagnosticInfo = {
                status: response.status,
                statusText: response.statusText,
                dataType: typeof data,
                dataKeys: typeof data === 'object' && data !== null ? Object.keys(data) : 'N/A',
                dataSample: typeof data === 'object' && data !== null 
                    ? JSON.stringify(data).substring(0, 1000) 
                    : String(data).substring(0, 1000),
                requestUrl: fullUrl,
                requestParams: params
            };
            logger.warn({ diagnostic: diagnosticInfo }, 'DSO Ontsluiten API returned unexpected response format');
            
            // Throw error with diagnostic info so workflow action can log it
            const formatError = new Error('DSO Ontsluiten API returned unexpected response format');
            (formatError as Error & { diagnosticInfo: unknown }).diagnosticInfo = diagnosticInfo;
            throw formatError;
        } catch (error) {
            // Enhanced error logging with full diagnostic information
            const errorDiagnostic: Record<string, unknown> = {
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error),
                requestUrl: fullUrl,
                requestParams: params,
                environment: this.useProduction ? 'production' : 'preproduction',
                apiKeyConfigured: !!this.apiKey
            };

            // Add Axios-specific error details
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                errorDiagnostic.axiosError = {
                    status: axiosError.response?.status,
                    statusText: axiosError.response?.statusText,
                    statusCode: axiosError.code,
                    responseHeaders: axiosError.response?.headers,
                    responseData: axiosError.response?.data,
                    requestConfig: {
                        method: axiosError.config?.method,
                        url: axiosError.config?.url,
                        baseURL: axiosError.config?.baseURL,
                        headers: axiosError.config?.headers ? 
                            Object.keys(axiosError.config.headers).reduce((acc, key) => {
                                const value = axiosError.config?.headers?.[key];
                                // Mask API key in logs
                                if (key.toLowerCase() === 'x-api-key') {
                                    acc[key] = value ? `${String(value).substring(0, 8)}...` : 'NOT SET';
                                } else {
                                    acc[key] = value;
                                }
                                return acc;
                            }, {} as Record<string, unknown>) : undefined
                    }
                };
            }

            logger.error({ diagnostic: errorDiagnostic }, 'DSO Ontsluiten error suggesting documents');
            
            // Re-throw errors with diagnostic info (e.g., unexpected response format)
            // These should be logged by the workflow action
            if (error instanceof Error && 'diagnosticInfo' in error) {
                throw error;
            }
            
            // Fallback to DSOCatalogusService if available (only for server errors)
            if (this.shouldFallback(error)) {
                logger.info('Attempting fallback to DSOCatalogusService');
                return this.fallbackToCatalogus(query);
            }
            
            // For other errors, throw with enhanced diagnostic context
            // Build detailed error message with full information (not truncated)
            let detailedErrorMessage = 'DSO Ontsluiten API error';
            // let axiosErrorDetails: { status?: number; statusText?: string; data?: unknown; headers?: unknown } | undefined; // Unused
            
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                
                // Check if it's a network error (request sent but no response)
                if (axiosError.request && !axiosError.response) {
                    // Network error (request sent but no response)
                    logger.error({
                        service: 'DSOOntsluiten',
                        error: {
                            type: 'network_error',
                            requestUrl: fullUrl,
                            requestMethod: 'POST',
                            requestParams: sanitizeParams(params),
                        },
                    }, 'DSO Ontsluiten API network error - no response received');
                    
                    detailedErrorMessage = 
                        `DSO Ontsluiten API network error: POST ${fullUrl} - no response received. ` +
                        `Request params: ${JSON.stringify(sanitizeParams(params))}`;
                    
                    // Throw ServiceConnectionError for network errors
                    throw new ServiceConnectionError('DSO', undefined, detailedErrorMessage);
                } else {
                    // HTTP error with response
                    const statusCode = axiosError.response?.status;
                    const statusText = axiosError.response?.statusText;
                    const requestMethod = axiosError.config?.method?.toUpperCase() || 'POST';
                    const requestUrl = axiosError.config?.url || fullUrl;
                    const responseBodySnippet = formatResponseBodySnippet(axiosError.response?.data);
                    const requestParams = sanitizeParams(params);
                    
                    // Handle rate limit errors (429) - throw immediately
                    if (statusCode === 429) {
                        const retryAfter = parseInt(
                            axiosError.response?.headers?.['retry-after'] || 
                            axiosError.response?.headers?.['Retry-After'] || 
                            '60',
                            10
                        );
                        throw new ServiceRateLimitError('DSO', retryAfter);
                    }
                    
                    // Handle 405 Method Not Allowed with actionable message - throw immediately
                    if (statusCode === 405) {
                        throw new ServiceConnectionError(
                            'DSO',
                            405,
                            'Method Not Allowed - check if API endpoint accepts POST requests'
                        );
                    }
                    
                    // For other HTTP errors, build comprehensive error message
                    detailedErrorMessage = 
                        `DSO Ontsluiten API error: ${requestMethod} ${requestUrl} failed with status ${statusCode || 'unknown'} ${statusText || ''}. ` +
                        `Request params: ${JSON.stringify(requestParams)}. ` +
                        `Response: ${responseBodySnippet}`;
                    
                    // Log structured error with full context
                    logger.error({
                        service: 'DSOOntsluiten',
                        error: {
                            statusCode,
                            statusText,
                            requestMethod,
                            requestUrl,
                            requestParams: sanitizeParams(params),
                            responseBody: responseBodySnippet,
                            environment: this.useProduction ? 'production' : 'preproduction',
                        },
                        originalError: error.message,
                    }, 'DSO Ontsluiten API request failed');
                    
                    // Throw ServiceConnectionError for other HTTP errors
                    throw new ServiceConnectionError('DSO', statusCode, detailedErrorMessage);
                }
            } else {
                // Unknown error (not an Axios error)
                const errorMsg = error instanceof Error ? error.message : String(error);
                detailedErrorMessage = `DSO Ontsluiten API error: ${errorMsg}`;
                
                logger.error({
                    service: 'DSOOntsluiten',
                    error: {
                        type: 'unknown_error',
                        message: errorMsg,
                        requestUrl: fullUrl,
                        requestParams: sanitizeParams(params),
                    },
                }, 'DSO Ontsluiten API unknown error');
                
                // Throw ServiceConnectionError for unknown errors
                throw new ServiceConnectionError('DSO', undefined, detailedErrorMessage);
            }
            
            // Fallback to DSOCatalogusService if available (only for server errors)
            if (this.shouldFallback(error)) {
                logger.info('Attempting fallback to DSOCatalogusService');
                return this.fallbackToCatalogus(query);
            }
            
            // Re-throw service errors
            throw error;
        }
    }

    /**
     * Search documents by authority (bevoegd gezag / opgesteld door)
     */
    async searchByAuthority(authority: string, query?: string): Promise<DocumentSuggestion[]> {
        return this.suggestDocuments({
            opgesteldDoor: authority,
            query
        });
    }

    /**
     * Search documents by topic/query terms
     * 
     * Note: Topic search may be limited (matches on title/type, not semantic content).
     * This is a known limitation of the API.
     */
    async searchByTopic(query: string, authority?: string): Promise<DocumentSuggestion[]> {
        return this.suggestDocuments({
            query,
            opgesteldDoor: authority
        });
    }

    /**
     * Map document suggestion to canonical DiscoveredDocument format
     */
    mapToDiscoveredDocument(suggestion: DocumentSuggestion): DiscoveredDocument {
        // Generate URL from identificatie using URL builder
        // Follow pattern from DSOLocationSearchService (regel 976-995)
        let url: string;
        if (suggestion.identificatie) {
            try {
                url = buildDsoPublicUrl(suggestion.identificatie);
            } catch (error) {
                logger.warn(
                    { error, identificatie: suggestion.identificatie },
                    'Failed to build DSO public URL from identificatie, using fallback'
                );
                // Fallback: construct basic URL (should not happen in normal operation)
                url = `https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/${encodeURIComponent(suggestion.identificatie)}`;
            }
        } else {
            // If identificatie is missing, log warning and use placeholder
            // Never use only base domain without document path
            logger.warn(
                { suggestion },
                'Cannot build DSO URL: missing identificatie in DocumentSuggestion'
            );
            // Since url is required in DiscoveredDocument, use a placeholder that indicates the issue
            // This should not happen in normal operation as identificatie is required in DocumentSuggestion
            url = 'https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_missing_identificatie';
        }

        return {
            title: suggestion.titel || 'Omgevingsdocument',
            url,
            summary: undefined, // API returns meta-information only
            documentCategory: 'policy',
            documentType: suggestion.type,
            sourceType: 'DSO',
            sourceId: suggestion.identificatie,
            issuingAuthority: suggestion.opgesteldDoor,
            publicationDate: suggestion.publicatiedatum,
            authorityScore: 1.0, // High score for DSO documents (authoritative source)
            matchSignals: {
                metadata: 1.0 // High metadata match for DSO documents
            },
            matchExplanation: `DSO document: ${suggestion.type}${suggestion.opgesteldDoor ? ` van ${suggestion.opgesteldDoor}` : ''}`,
            provenance: [{
                sourceType: 'DSO',
                url,
                fetchedAt: new Date().toISOString()
            }]
        };
    }

    /**
     * Parse API response item to DocumentSuggestion
     * 
     * Expected fields (based on code analysis - see API-RESPONSE-FORMAT.md):
     * - Required: `identificatie` (or `id`), `titel` (or `title`)
     * - Optional: `type` (or `documentType`), `opgesteldDoor`, `geldigheidsdatum`, 
     *   `publicatiedatum`, `vervaldatum`
     * - Additional fields are preserved
     * 
     * @param item - Raw item from API response
     * @returns Parsed DocumentSuggestion
     * @throws Error if required fields are missing
     */
    private parseSuggestion(item: unknown): DocumentSuggestion {
        if (typeof item !== 'object' || item === null) {
            throw new BadRequestError('Invalid suggestion item: not an object', {
                reason: 'invalid_suggestion_item_type',
                operation: 'parseSuggestion',
                itemType: typeof item
            });
        }

        const obj = item as Record<string, unknown>;

        // Extract required fields
        const identificatie = String(obj.identificatie || obj.id || '');
        const titel = String(obj.titel || obj.title || '');
        const type = String(obj.type || obj.documentType || '');

        if (!identificatie || !titel) {
            throw new BadRequestError(`Invalid suggestion: missing required fields (identificatie: ${identificatie}, titel: ${titel})`, {
                reason: 'missing_required_fields',
                operation: 'parseSuggestion',
                identificatie: identificatie || 'missing',
                titel: titel || 'missing'
            });
        }

        return {
            identificatie,
            titel,
            type,
            opgesteldDoor: obj.opgesteldDoor ? String(obj.opgesteldDoor) : undefined,
            geldigheidsdatum: obj.geldigheidsdatum ? String(obj.geldigheidsdatum) : undefined,
            publicatiedatum: obj.publicatiedatum ? String(obj.publicatiedatum) : undefined,
            vervaldatum: obj.vervaldatum ? String(obj.vervaldatum) : undefined,
            // Preserve any additional fields
            ...Object.fromEntries(
                Object.entries(obj).filter(([key]) => 
                    !['identificatie', 'id', 'titel', 'title', 'type', 'documentType', 
                      'opgesteldDoor', 'geldigheidsdatum', 'publicatiedatum', 'vervaldatum'].includes(key)
                )
            )
        };
    }

    /**
     * Determine if we should fallback to catalogus service
     */
    private shouldFallback(error: unknown): boolean {
        if (!axios.isAxiosError(error)) {
            return false;
        }

        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;

        // Fallback on server errors or if API is unavailable
        if (status && status >= 500) {
            return true;
        }

        // Don't fallback on client errors (4xx) - those are likely request format issues
        return false;
    }

    /**
     * Fallback to DSOCatalogusService if Ontsluiten v2 fails
     * 
     * Note: This is a simplified fallback. The catalogus service doesn't provide
     * the same document discovery capabilities, but can serve as a basic fallback.
     */
    private async fallbackToCatalogus(query: DocumentSearchQuery): Promise<DocumentSuggestion[]> {
        try {
            if (!this.fallbackService) {
                this.fallbackService = new DSOCatalogusService(this.useProduction);
            }

            // Use catalogus service to search for begrippen (concepts)
            // This is a simplified fallback - may not return exact same results as Ontsluiten v2
            const catalogusResults = await this.fallbackService.getBegrippen({
                query: query.query,
                pageSize: 20
            });

            // Map catalogus results to document suggestions (simplified)
            // Note: This is not ideal as begrippen are concepts, not documents
            // But it provides a basic fallback mechanism
            return catalogusResults.items.map(item => ({
                identificatie: item.id,
                titel: item.label || '',
                type: 'begrip', // Generic type for catalogus items
                opgesteldDoor: item.bronhouder
            }));
        } catch (fallbackError) {
            const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            logger.error({ error: errorMessage }, 'DSO Ontsluiten fallback to catalogus also failed');
            return [];
        }
    }
}

