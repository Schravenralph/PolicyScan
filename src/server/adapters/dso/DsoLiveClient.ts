/**
 * DsoLiveClient - Client for live DSO API calls
 * 
 * Handles discovery (Ontsluiten v2) and acquire (Downloaden v1) with rate limiting.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 */

import axios, { AxiosInstance } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { RateLimiter } from './RateLimiter.js';
import { getDeploymentConfig, getDSOBaseUrls, getDSOApiKey } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';
import type { Point, Geometry } from 'geojson';

/**
 * DSO discovery result
 */
export interface DsoDiscoveryResult {
  identificatie: string;
  titel: string;
  type: string;
  opgesteldDoor?: string;
  bestuursorgaan?: string;
  publicatiedatum?: string;
  geldigheidsdatum?: string;
  vervaldatum?: string;
  publicatieLink?: string;
  uriIdentificatie?: string; // AKN format identifier for download API (e.g., "/akn/nl/act/gm9999/2022/omgevingsplan")
  [key: string]: unknown;
}

/**
 * DSO live client configuration
 */
export interface DsoLiveClientConfig {
  useProduction?: boolean; // Legacy: use DSO_ENV instead
  apiKey?: string;
  rateLimitCapacity?: number; // Token bucket capacity (default: from config)
  rateLimitRefillRate?: number; // Tokens per second (default: from config)
}

/**
 * DsoLiveClient - Client for live DSO APIs
 * Uses standardized deployment configuration
 */
export class DsoLiveClient {
  private ontsluitenClient: AxiosInstance;
  private downloadenClient: AxiosInstance;
  private rateLimiter: RateLimiter;
  private useProduction: boolean;
  private apiKey: string;

  constructor(config: DsoLiveClientConfig = {}) {
    // Load standardized deployment config
    const deploymentConfig = getDeploymentConfig();
    const dsoConfig = deploymentConfig.dso;

    // Support legacy useProduction flag, but prefer DSO_ENV from config
    this.useProduction = config.useProduction ?? (dsoConfig.env === 'prod');

    // Determine effective environment
    const effectiveEnv = this.useProduction ? 'prod' : (dsoConfig.env === 'prod' ? 'prod' : 'pre');

    // Resolve URLs based on effective environment
    // Use configured URLs from deployment config if environment matches, otherwise recalculate
    let ontsluitenBaseUrl = dsoConfig.ontsluitenBaseUrl;
    let downloadenBaseUrl = dsoConfig.downloadenBaseUrl;

    if (effectiveEnv !== dsoConfig.env) {
      const urls = getDSOBaseUrls(effectiveEnv);
      ontsluitenBaseUrl = urls.ontsluiten;
      downloadenBaseUrl = urls.downloaden;
      logger.info({ effectiveEnv, originalEnv: dsoConfig.env }, 'Overriding DSO URLs based on useProduction flag');
    }

    // Resolve API Key
    let apiKey = config.apiKey;
    if (!apiKey) {
      if (effectiveEnv === dsoConfig.env) {
        apiKey = dsoConfig.apiKey;
      } else {
        // Try to get key for the effective environment
        try {
          apiKey = getDSOApiKey(effectiveEnv);
        } catch (error) {
          // Fallback to config key (which might be wrong but we tried)
          apiKey = dsoConfig.apiKey;
          logger.warn({ effectiveEnv, error: error instanceof Error ? error.message : String(error) }, 'Failed to get specific API key for effective environment, using default');
        }
      }
    }

    if (!apiKey) {
      throw new Error(
        `DSO API key not configured. Set DSO_API_KEY (or legacy DSO_${this.useProduction ? 'PROD' : 'PREPROD'}_KEY) in .env`
      );
    }

    // Store API key for use in requests
    this.apiKey = apiKey;

    // Use createHttpClient for connection pooling and retry logic (as per DSOLocationSearchService)
    // Note: Content-Crs is set in default headers (as per DSOLocationSearchService) AND in request headers
    this.ontsluitenClient = createHttpClient({
      baseURL: ontsluitenBaseUrl,
      timeout: HTTP_TIMEOUTS.STANDARD,
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/hal+json', // Required by DSO API (as per DSOLocationSearchService)
        'Content-Type': 'application/json',
        'Content-Crs': 'http://www.opengis.net/def/crs/EPSG/0/28992', // Set in default headers (as per DSOLocationSearchService)
      },
    });

    // Use createHttpClient for connection pooling and retry logic
    this.downloadenClient = createHttpClient({
      baseURL: downloadenBaseUrl,
      timeout: HTTP_TIMEOUTS.LONG, // Longer timeout for downloads
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter: use configured QPS, with fallback to provided config or default
    const rateLimitQps = config.rateLimitRefillRate ?? dsoConfig.rateLimitQps;
    const rateLimitCapacity = config.rateLimitCapacity ?? rateLimitQps;
    this.rateLimiter = new RateLimiter(rateLimitCapacity, rateLimitQps);
  }

  /**
   * Discover documents by query (text-based search)
   * 
   * Uses Ontsluiten v2 API to find documents matching text query and filters.
   * 
   * @param query - Text query string
   * @param opgesteldDoor - Optional: Issuing authority filter
   * @param limit - Optional: Maximum number of results to return (default: 20, max: 100)
   * @returns Array of discovered documents
   */
  async discoverByQuery(
    query?: string,
    opgesteldDoor?: string,
    limit?: number
  ): Promise<DsoDiscoveryResult[]> {
    await this.rateLimiter.acquire();

    try {
      // According to API documentation: /documenten/_suggereer uses GET with query parameters
      // Required parameter: _find (search term)
      // Response format: { _embedded: { suggesties: [...] } }
      // Reference: DSOOntsluitenService.suggestDocuments() uses GET method
      const params: Record<string, string | number> = {};
      
      // Build _find parameter - combine query and opgesteldDoor if both provided
      const findParts: string[] = [];
      if (query) findParts.push(query);
      if (opgesteldDoor) findParts.push(opgesteldDoor);
      
      if (findParts.length === 0) {
        throw new Error('Either query or opgesteldDoor must be provided for discovery');
      }

      params._find = findParts.join(' ');
      
      // Optional parameters - use provided limit or default to 20
      // Cap at 100 to avoid excessive API load (API may have its own limits)
      const effectiveLimit = limit ? Math.min(Math.max(1, limit), 100) : 20;
      params.limit = effectiveLimit;

      const endpoint = '/documenten/_suggereer';
      
      // Use GET method with query parameters (per OpenAPI spec and DSOOntsluitenService pattern)
      // API requires Accept: application/hal+json (HAL JSON format)
      const response = await this.ontsluitenClient.get<{
        _embedded?: {
          suggesties?: Array<{
            identificatie: string;
            titel: string;
            type: string;
            opgesteldDoor?: string;
            status?: string;
            statusdatum?: string;
            isBesluit?: boolean;
            isOntwerp?: boolean;
            uriIdentificatie?: string;
            [key: string]: unknown;
          }>;
        };
      }>(endpoint, {
        params,
        headers: {
          'X-API-KEY': this.apiKey,
          'Accept': 'application/hal+json',
        }
      });

      // Log raw response to see what fields are actually available
      if (response.data._embedded?.suggesties && response.data._embedded.suggesties.length > 0) {
        const firstSuggestion = response.data._embedded.suggesties[0];
        logger.debug(
          {
            availableFields: Object.keys(firstSuggestion),
            sampleFields: {
              identificatie: firstSuggestion.identificatie,
              uriIdentificatie: firstSuggestion.uriIdentificatie,
              allFields: firstSuggestion,
            },
          },
          'Raw DSO discovery API response fields'
        );
      }

      // Parse response according to OpenAPI spec: _embedded.suggesties
      let documents: DsoDiscoveryResult[] = [];
      const embedded = response.data._embedded;
      const suggesties = embedded?.suggesties;
      if (suggesties) {
        documents = suggesties.map((suggestie) => {
          // Log the raw suggestion to see ALL available fields
          if (suggesties.indexOf(suggestie) === 0) {
            logger.debug(
              {
                identificatie: suggestie.identificatie,
                allFields: Object.keys(suggestie),
                sampleData: suggestie,
              },
              'Raw suggestion from DSO API - FIRST DOCUMENT'
            );
          }
          
          const result: DsoDiscoveryResult = {
            identificatie: String(suggestie.identificatie || ''),
            titel: String(suggestie.titel || ''),
            type: String(suggestie.type || ''),
            opgesteldDoor: suggestie.opgesteldDoor ? String(suggestie.opgesteldDoor) : undefined,
          };
          
          // Map additional fields if available
          if (suggestie.status) result.status = String(suggestie.status);
          if (suggestie.statusdatum) result.statusdatum = String(suggestie.statusdatum);
          if (suggestie.isBesluit !== undefined) result.isBesluit = Boolean(suggestie.isBesluit);
          if (suggestie.isOntwerp !== undefined) result.isOntwerp = Boolean(suggestie.isOntwerp);
          if (suggestie.uriIdentificatie) result.uriIdentificatie = String(suggestie.uriIdentificatie);
          if (typeof suggestie.publicatiedatum === 'string') result.publicatiedatum = suggestie.publicatiedatum;
          if (typeof suggestie.geldigheidsdatum === 'string') result.geldigheidsdatum = suggestie.geldigheidsdatum;
          
          // Preserve ALL other fields in case they contain AKN or other useful data
          for (const [key, value] of Object.entries(suggestie)) {
            if (!['identificatie', 'titel', 'type', 'opgesteldDoor', 'status', 'statusdatum', 'isBesluit', 'isOntwerp', 'uriIdentificatie', 'publicatiedatum', 'geldigheidsdatum'].includes(key)) {
              result[key] = value;
            }
          }
          
          return result;
        });
      }

      logger.debug(
        { 
          query, 
          opgesteldDoor, 
          documentCount: documents.length,
          sampleDocument: documents[0] ? {
            identificatie: documents[0].identificatie,
            uriIdentificatie: documents[0].uriIdentificatie,
            hasUriIdentificatie: !!documents[0].uriIdentificatie,
          } : undefined,
        },
        'Discovered DSO documents by query'
      );

      return documents;
    } catch (error) {
      logger.error({ error, query, opgesteldDoor }, 'Failed to discover documents by query');
      throw new Error(`DSO discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Discover documents by geometry with exhaustive pagination
   * 
   * Uses Ontsluiten v2 API to find documents that intersect with the given geometry.
   * Fetches all pages of results and optionally filters by municipality code.
   * 
   * @param geometry - GeoJSON geometry (point or polygon)
   * @param bufferRadiusMeters - Optional buffer radius in meters (ignored for now)
   * @param options - Optional pagination and filtering options
   * @param options.maxPages - Maximum pages to fetch (default: 100, safety limit)
   * @param options.municipalityCode - Optional municipality code to filter results (e.g., "gm0301")
   * @returns Array of discovered documents (all pages)
   */
  async discoverByGeometry(
    geometry: Point,
    bufferRadiusMeters?: number,
    options?: {
      maxPages?: number;
      municipalityCode?: string;
    }
  ): Promise<DsoDiscoveryResult[]> {
    // Use provided bestuurslaag or default to GEMEENTE
    const bestuurslaag = 'GEMEENTE';
    // Safety limit for pagination (100 pages = 20,000 documents)
    const maxPages = options?.maxPages || 100;
    const pageSize = 200; // Maximum page size

    // Use the provided geometry directly (always Point for now)
    // We do not apply client-side buffering (Polygon conversion) because the DSO API
    // /documenten/_zoek endpoint appears to reject Polygon geometries with 405 Method Not Allowed.
    // We rely on the API to find relevant documents at the location.
    const searchGeometry: Geometry = geometry;

    if (bufferRadiusMeters && bufferRadiusMeters > 0) {
      logger.debug(
        { original: 'Point', bufferRadiusMeters, action: 'ignored' },
        'Ignoring bufferRadiusMeters for DSO search geometry to avoid Polygon/405 error'
      );
    }

    // Build request body for /_zoek endpoint
    const requestBody: {
      geometrie: Geometry;
      bestuurslaag: string;
    } = {
      geometrie: searchGeometry,
      bestuurslaag,
    };

    // Build query parameters
    const queryParams: Record<string, string | number | boolean> = {
      size: pageSize,
      page: 0,
    };

    const endpoint = '/documenten/_zoek';
    const allDocuments: DsoDiscoveryResult[] = [];
    let currentPage = 0;
    let totalElements = 0;
    let hasNextPage = true;
    let nextUrl: string | undefined;

    logger.info({
      endpoint,
      geometryType: searchGeometry.type,
      municipalityCode: options?.municipalityCode,
      maxPages,
      environment: this.useProduction ? 'production' : 'preproduction',
    }, 'Starting paginated DSO geometry search');

    try {
      // Pagination loop: fetch all pages exhaustively until _links.next is null/undefined
      // maxPages is a safety limit to prevent infinite loops
      while (hasNextPage && currentPage < maxPages) {
        await this.rateLimiter.acquire();

        logger.debug({
          page: currentPage,
          nextUrl: !!nextUrl,
          documentsCollected: allDocuments.length,
        }, 'Fetching DSO search page');

        let response: {
          data: {
            _embedded?: {
              documenten?: DsoDiscoveryResult[];
            };
            _links?: {
              self?: { href: string };
              next?: { href: string };
              prev?: { href: string };
              first?: { href: string };
              last?: { href: string };
            };
            page?: {
              size: number;
              totalElements: number;
              totalPages: number;
              number: number;
            };
          };
        };

        if (nextUrl) {
          // For subsequent pages, extract page number from next URL and use it in query params
          try {
            const nextUrlObj = new URL(nextUrl);
            const pageParam = nextUrlObj.searchParams.get('page');
            if (pageParam !== null) {
              queryParams.page = parseInt(pageParam, 10);
            } else {
              // If no page param, use currentPage (which was set from previous response)
              queryParams.page = currentPage;
            }
            nextUrl = undefined; // Reset to use query params
          } catch (urlError) {
            logger.warn({ nextUrl, error: urlError }, 'Failed to parse next URL, using currentPage');
            queryParams.page = currentPage;
            nextUrl = undefined;
          }
        }

        const contentCrs = 'http://www.opengis.net/def/crs/EPSG/0/28992';
        response = await this.ontsluitenClient.post(endpoint, requestBody, {
          params: queryParams,
          headers: {
            'Content-Crs': contentCrs,
          },
        });

        const { documenten } = response.data._embedded || {};
        const { totalElements: pageTotalElements, number: responsePageNumber } = response.data.page || {};
        const { next } = response.data._links || {};

        if (documenten) {
          // Accumulate documents
          allDocuments.push(...documenten);
        }

        // Update total (should be same across all pages, but use latest)
        if (pageTotalElements !== undefined) {
          totalElements = pageTotalElements;
        }

        // Check if there's a next page - exhaustively iterate until no more pages
        if (next?.href) {
          nextUrl = next.href;
          currentPage = (responsePageNumber !== undefined ? responsePageNumber : currentPage) + 1;
          hasNextPage = true;
        } else {
          // No more pages - pagination complete
          hasNextPage = false;
          logger.info({
            page: responsePageNumber !== undefined ? responsePageNumber : currentPage,
            totalPages: (responsePageNumber !== undefined ? responsePageNumber : currentPage) + 1,
            totalDocuments: allDocuments.length,
            totalElements,
          }, 'Reached end of pagination - no more pages available');
        }

        logger.debug({
          page: currentPage,
          documentsOnPage: documenten?.length || 0,
          totalDocuments: allDocuments.length,
          totalElements,
          hasNextPage,
        }, 'Completed DSO search page');
      }

      if (currentPage >= maxPages) {
        logger.warn({
          pagesFetched: currentPage,
          maxPages,
          totalDocuments: allDocuments.length,
          totalElements,
        }, 'Reached maximum page safety limit - pagination stopped. If more pages exist, increase maxPages.');
      } else {
        logger.info({
          totalPages: currentPage + 1,
          totalDocuments: allDocuments.length,
          totalElements,
          municipalityCode: options?.municipalityCode,
          paginationComplete: !hasNextPage,
        }, 'Completed exhaustive paginated DSO geometry search');
      }

      // Client-side filtering by municipality code
      let filteredDocuments = allDocuments;

      if (options?.municipalityCode) {
        // Normalize municipality code for comparison (handles various formats)
        const normalizedCode = options.municipalityCode.toLowerCase().trim();
        
        filteredDocuments = allDocuments.filter(doc => {
          // DsoDiscoveryResult may have different structure, check common fields
          const docCode = (doc as any).aangeleverdDoorEen?.code?.toLowerCase().trim() ||
                         (doc as any).opgesteldDoor?.toLowerCase().trim();
          
          if (!docCode) {
            return false;
          }
          
          // Match exact code or code without prefix (e.g., "0301" matches "gm0301")
          return docCode === normalizedCode || 
                 docCode === normalizedCode.replace(/^gm|^pv|^ws|^rk/i, '') ||
                 normalizedCode === docCode.replace(/^gm|^pv|^ws|^rk/i, '');
        });

        logger.info({
          municipalityCode: normalizedCode,
          totalBeforeFilter: allDocuments.length,
          totalAfterFilter: filteredDocuments.length,
        }, 'Applied client-side municipality code filter');
      }

      return filteredDocuments;
    } catch (error) {
      // Enhanced error logging
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
        responseHeaders: axios.isAxiosError(error) ? error.response?.headers : undefined,
        geometry,
        municipalityCode: options?.municipalityCode,
      }, 'Failed to discover documents by geometry');

      throw new Error(`DSO discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Acquire ZIP for a regeling (asynchronous flow)
   * 
   * Implements the Downloaden v1 async flow:
   * 1. POST /aanvraag with regelingId
   * 2. Poll GET /status/{requestId}
   * 3. GET /download/{requestId} to obtain ZIP URL
   * 4. Download ZIP bytes
   * 
   * @param regelingId - Regeling identifier
   * @param maxPollAttempts - Maximum polling attempts (default: 60)
   * @param pollIntervalMs - Polling interval in milliseconds (default: 2000)
   * @returns ZIP file as Buffer
   */
  async acquireZip(
    regelingId: string,
    maxPollAttempts: number = 60,
    pollIntervalMs: number = 2000,
    rateLimitRetryCount: number = 0
  ): Promise<Buffer> {
    // DEBUG: Function entry
    logger.debug({
      function: 'DsoLiveClient.acquireZip',
      action: 'function_entry',
      inputs: {
        regelingId,
        maxPollAttempts,
        pollIntervalMs,
        rateLimitRetryCount,
      },
    }, '[DSO Download API] DEBUG: acquireZip() called');
    
    // Rate limit: acquire token before API call
    await this.rateLimiter.acquire();
    
    // DEBUG: Rate limiter acquired
    logger.debug({
      function: 'DsoLiveClient.acquireZip',
      action: 'rate_limiter_acquired',
    }, '[DSO Download API] DEBUG: Rate limiter token acquired');

    try {
      // Log the exact request being sent (DEBUG level for detailed observability)
      const requestBody = { regelingId };
      const requestUrl = `${this.downloadenClient.defaults.baseURL}/aanvraag`;
      const requestHeaders = {
        ...this.downloadenClient.defaults.headers,
        'X-API-KEY': this.apiKey ? '***REDACTED***' : 'MISSING',
      };
      
      // DEBUG: Function call with inputs
      logger.debug({
        function: 'DsoLiveClient.acquireZip',
        action: 'sending_aanvraag_request',
        method: 'POST',
        url: requestUrl,
        headers: requestHeaders,
        body: requestBody,
        inputs: {
          regelingId,
          regelingIdLength: regelingId.length,
          regelingIdType: typeof regelingId,
          regelingIdStartsWith: regelingId.substring(0, 20),
          maxPollAttempts,
          pollIntervalMs,
          rateLimitRetryCount,
        },
      }, '[DSO Download API] DEBUG: Sending aanvraag request');

      // Step 1: POST /aanvraag
      const aanvraagResponse = await this.downloadenClient.post<{ verzoekIdentificatie?: string; requestId?: string; id?: string }>(
        '/aanvraag',
        requestBody,
        {
          validateStatus: (status) => status < 500, // Don't throw on 4xx, we'll handle it
        }
      );

      // DEBUG: Function output/response
      logger.debug({
        function: 'DsoLiveClient.acquireZip',
        action: 'received_aanvraag_response',
        status: aanvraagResponse.status,
        statusText: aanvraagResponse.statusText,
        headers: aanvraagResponse.headers,
        data: aanvraagResponse.data,
        dataString: typeof aanvraagResponse.data === 'string' ? aanvraagResponse.data : JSON.stringify(aanvraagResponse.data),
        inputs: {
          regelingId,
          requestBody: requestBody,
          requestUrl,
        },
        outputs: {
          requestId: aanvraagResponse.data?.verzoekIdentificatie || aanvraagResponse.data?.requestId || aanvraagResponse.data?.id,
          locationHeader: aanvraagResponse.headers.location,
        },
      }, '[DSO Download API] DEBUG: Aanvraag endpoint response');

      // The API returns verzoekIdentificatie (not requestId)
      // Response format: { verzoekIdentificatie: "uuid" }
      const data = aanvraagResponse.data as { verzoekIdentificatie?: string; requestId?: string; id?: string } | undefined;
      let requestId: string | undefined = 
        data?.verzoekIdentificatie || 
        data?.requestId || 
        data?.id;
      
      // Check Location header (common pattern: Location: /status/{requestId})
      if (!requestId && aanvraagResponse.headers.location) {
        // Use new RegExp to avoid "Unnecessary escape character" lint error with forward slashes in regex literal
        const locationMatch = aanvraagResponse.headers.location.match(new RegExp('/status/([^/]+)'));
        if (locationMatch) {
          requestId = locationMatch[1];
        }
      }

      // Check other common header patterns
      if (!requestId && aanvraagResponse.headers['x-request-id']) {
        requestId = String(aanvraagResponse.headers['x-request-id']);
      }

      if (!requestId) {
        logger.error({
          status: aanvraagResponse.status,
          statusText: aanvraagResponse.statusText,
          headers: aanvraagResponse.headers,
          data: aanvraagResponse.data,
          regelingId,
        }, 'No requestId found in aanvraag response');
        
        if (aanvraagResponse.status >= 400 && aanvraagResponse.status < 500) {
          // 404 typically means the document is not available via Download API
          // This can happen for documents that are only available via discovery, not download
          // We throw a specific error type that can be caught and handled gracefully
          if (aanvraagResponse.status === 404) {
            const error = new Error(
              `DSO document not available for download (404): Document "${regelingId}" was discovered but is not available via the Download API. This may occur for documents that are metadata-only or not yet published for download.`
            );
            // Add a flag to make it easy to detect 404 errors
            (error as Error & { is404Error?: boolean; isNotDownloadable?: boolean }).is404Error = true;
            (error as Error & { is404Error?: boolean; isNotDownloadable?: boolean }).isNotDownloadable = true;
            throw error;
          }
          
          throw new Error(`DSO download aanvraag failed (${aanvraagResponse.status}): ${JSON.stringify(aanvraagResponse.data || 'No response data')}`);
        }
        
        throw new Error(
          `No requestId returned from aanvraag endpoint. Response: ${JSON.stringify(aanvraagResponse.data)}, ` +
          `Headers: ${JSON.stringify(aanvraagResponse.headers)}`
        );
      }

      logger.debug({ regelingId, requestId }, 'Submitted download request');

      // Step 2: Poll GET /status/{requestId}
      // Status values: "IN_BEHANDELING" (pending), "BESCHIKBAAR" (ready), "MISLUKT" (failed)
      let status: string = 'IN_BEHANDELING';
      let attempts = 0;

      while ((status === 'IN_BEHANDELING' || status === 'pending' || status === 'in_behandeling') && attempts < maxPollAttempts) {
        await this.rateLimiter.acquire();
        
        const statusResponse = await this.downloadenClient.get<{ 
          status: string; 
          downloadUrl?: string;
          downloadLink?: string;
          download?: string;
          url?: string;
          link?: string;
          [key: string]: unknown;
        }>(
          `/status/${requestId}`
        );

        status = statusResponse.data.status;
        
        logger.debug(
          { 
            regelingId, 
            requestId, 
            status, 
            attempt: attempts + 1,
            responseData: statusResponse.data,
            responseKeys: Object.keys(statusResponse.data || {}),
          },
          'Polling download status'
        );

        // Handle ready status (BESCHIKBAAR = available/ready in Dutch)
        if (status === 'BESCHIKBAAR' || status === 'ready' || status === 'beschikbaar') {
          // Step 3: GET /download/{requestId} to obtain ZIP URL
          // The endpoint returns JSON with a download URL, not the ZIP directly
          await this.rateLimiter.acquire();
          
          const downloadResponse = await this.downloadenClient.get<{ 
            downloadUrl?: string;
            downloadLink?: string;
            url?: string;
            link?: string;
            download?: string;
            [key: string]: unknown;
          }>(
            `/download/${requestId}`
          );

          logger.debug({
            regelingId,
            requestId,
            status: downloadResponse.status,
            contentType: downloadResponse.headers['content-type'],
            responseData: downloadResponse.data,
            responseKeys: Object.keys(downloadResponse.data || {}),
          }, 'Download endpoint response');

          // Get download URL from response
          const downloadUrl = 
            downloadResponse.data?.downloadUrl || 
            downloadResponse.data?.downloadLink ||
            downloadResponse.data?.download ||
            downloadResponse.data?.url ||
            downloadResponse.data?.link;
            
          if (!downloadUrl || typeof downloadUrl !== 'string') {
            logger.error({
              regelingId,
              requestId,
              status: downloadResponse.status,
              contentType: downloadResponse.headers['content-type'],
              responseData: downloadResponse.data,
              responseKeys: Object.keys(downloadResponse.data || {}),
            }, 'Download URL not found in download response');
            throw new Error(
              `Download URL not provided in download response. Status: ${downloadResponse.status}, ` +
              `Content-Type: ${downloadResponse.headers['content-type']}, ` +
              `Response: ${JSON.stringify(downloadResponse.data)}`
            );
          }

          // Step 4: Download ZIP bytes from URL
          await this.rateLimiter.acquire();
          
          const zipResponse = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: {
              'X-API-KEY': this.downloadenClient.defaults.headers?.['X-API-KEY'] as string || '',
            },
          });

          // DEBUG: Function exit with success
          logger.debug({
            function: 'DsoLiveClient.acquireZip',
            action: 'download_completed',
            outputs: {
              zipSize: zipResponse.data.length,
              resultType: 'Buffer',
            },
            inputs: { regelingId, requestId },
          }, '[DSO Download API] DEBUG: Downloaded ZIP from DSO successfully');

          // Safely convert ArrayBuffer to Buffer
          // Handle both ArrayBuffer and ArrayBufferView types
          let buffer: Buffer;
          if (zipResponse.data instanceof ArrayBuffer) {
            buffer = Buffer.from(zipResponse.data);
          } else if (ArrayBuffer.isView(zipResponse.data)) {
            // For TypedArray views, use the underlying buffer with proper offset/length
            const view = zipResponse.data as ArrayBufferView;
            const maxOffset = view.buffer.byteLength;
            const requestedEnd = view.byteOffset + view.byteLength;
            
            // Validate bounds to prevent offset out of range errors
            if (view.byteOffset < 0 || view.byteOffset >= maxOffset) {
              throw new Error(`Invalid byteOffset: ${view.byteOffset} (buffer length: ${maxOffset}) for regelingId: ${regelingId}`);
            }
            if (requestedEnd > maxOffset) {
              // Adjust length to fit within buffer bounds
              const adjustedLength = maxOffset - view.byteOffset;
              logger.warn(
                { 
                  requestedLength: view.byteLength, 
                  adjustedLength, 
                  byteOffset: view.byteOffset,
                  bufferLength: maxOffset,
                  regelingId
                },
                'Buffer view exceeds buffer bounds, adjusting length'
              );
              buffer = Buffer.from(view.buffer, view.byteOffset, adjustedLength);
            } else {
              buffer = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
            }
          } else {
            // Fallback for other types
            buffer = Buffer.from(zipResponse.data);
          }

          // Validate buffer bounds to prevent offset out of range errors
          if (buffer.length === 0) {
            throw new Error(`Downloaded ZIP file is empty for regelingId: ${regelingId}`);
          }

          return buffer;
        } else if (status === 'MISLUKT' || status === 'failed' || status === 'error' || status === 'mislukt') {
          throw new Error(`Download request failed (status: ${status}) for regelingId: ${regelingId}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        attempts++;
      }

      if (status === 'IN_BEHANDELING' || status === 'pending' || status === 'in_behandeling') {
        throw new Error(`Download request timed out after ${maxPollAttempts} attempts (status: ${status}) for regelingId: ${regelingId}`);
      }
      
      // Unexpected status
      throw new Error(`Unexpected status: ${status}`);

      throw new Error(`Unexpected status: ${status}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Handle rate limit (429) with exponential backoff
        if (error.response?.status === 429) {
          const maxRetries = 3;
          
          if (rateLimitRetryCount < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const delay = Math.min(1000 * Math.pow(2, rateLimitRetryCount), 8000);
            logger.warn(
              { regelingId, retryCount: rateLimitRetryCount + 1, maxRetries, delay },
              'Rate limited, retrying with exponential backoff'
            );
            await new Promise(resolve => setTimeout(resolve, delay));
            // Retry with incremented retry count
            return this.acquireZip(regelingId, maxPollAttempts, pollIntervalMs, rateLimitRetryCount + 1);
          } else {
            logger.error(
              { regelingId, retryCount: rateLimitRetryCount },
              'Rate limit exceeded after retries, giving up'
            );
            throw new Error(`DSO API rate limit exceeded after ${maxRetries} retries for regelingId: ${regelingId}`);
          }
        }

        // Handle 4xx errors (fail-fast)
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          throw new Error(`DSO API client error (${error.response.status}): ${error.response.data || error.message}`);
        }

        // Handle 5xx errors (retry with backoff)
        if (error.response?.status && error.response.status >= 500) {
          logger.warn({ regelingId, status: error.response.status }, 'DSO API server error, retrying with backoff');
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.acquireZip(regelingId, maxPollAttempts, pollIntervalMs, rateLimitRetryCount);
        }
      }

      logger.error({ error, regelingId }, 'Failed to acquire ZIP from DSO');
      throw error;
    }
  }
}
