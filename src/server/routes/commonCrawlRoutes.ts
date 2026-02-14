import express, { Request, Response } from 'express';
import axios from 'axios';
import { CommonCrawlQuery } from '../models/CommonCrawlQuery.js';
import { CommonCrawlResult } from '../models/CommonCrawlResult.js';
import { COMMON_CRAWL } from '../config/constants.js';
import { validate } from '../middleware/validation.js';
import { commonCrawlSchemas } from '../validation/commonCrawlSchemas.js';
import { logger } from '../utils/logger.js';
import {
    mapMongoIndexRecordsToDto,
    mapCdxResultsToDto,
    mapCrawlInfosToDto,
    mapCommonCrawlQueryWithCountToDto
} from '../utils/mappers.js';
import { QueryOptions } from '../services/common-crawl/CommonCrawlIndexService.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, ExternalServiceError, ServiceUnavailableError } from '../types/errors.js';
import { retryWithBackoff } from '../utils/retry.js';

const router = express.Router();

/**
 * Validates crawl ID format to prevent SSRF attacks
 * @param crawlId The crawl ID to validate
 * @returns Object with isValid boolean and error message if invalid
 */
function validateCrawlIdFormat(crawlId: string): { isValid: boolean; error?: string } {
    // Validate format: CC-MAIN-YYYY-WW (e.g., CC-MAIN-2024-46)
    const crawlIdPattern = /^CC-MAIN-\d{4}-\d{2}$/;
    if (!crawlIdPattern.test(crawlId)) {
        return {
            isValid: false,
            error: `Invalid crawl ID format. Must match CC-MAIN-YYYY-WW pattern`,
        };
    }

    // Additional safety: ensure no path traversal or protocol injection
    if (crawlId.includes('..') ||
        crawlId.includes('/') ||
        crawlId.includes('\\') ||
        crawlId.includes(':') ||
        crawlId.includes('http') ||
        crawlId.includes('file')) {
        return {
            isValid: false,
            error: 'CrawlId contains invalid characters that could lead to SSRF',
        };
    }

    return { isValid: true };
}

/**
 * Validates if a Common Crawl crawl ID exists and is accessible
 * @param crawlId The crawl ID to validate (e.g., 'CC-MAIN-2024-46')
 * @returns Object with isValid boolean and error message if invalid
 */
async function validateCrawlId(crawlId: string): Promise<{ isValid: boolean; error?: string }> {
    // First validate format to prevent SSRF
    const formatValidation = validateCrawlIdFormat(crawlId);
    if (!formatValidation.isValid) {
        return formatValidation;
    }

    // Check if crawl year is valid (Common Crawl started in 2013)
    const yearMatch = crawlId.match(/CC-MAIN-(\d{4})-/);
    if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (year < 2013) {
            return {
                isValid: false,
                error: `Crawl ID "${crawlId}" does not exist (Common Crawl started in 2013)`,
            };
        }
        // Also check for future years (reasonable limit: current year + 1)
        const currentYear = new Date().getFullYear();
        if (year > currentYear + 1) {
            return {
                isValid: false,
                error: `Crawl ID "${crawlId}" does not exist (year ${year} is in the future)`,
            };
        }
    }

    try {
        // Try to access the CDX endpoint with a simple test query
        // Use the -index endpoint format as documented by Common Crawl
        // crawlId is now validated, safe to use in URL path
        // Construct URL safely using URL constructor to prevent SSRF
        const baseUrl = 'http://index.commoncrawl.org';
        const pathSegment = `/${crawlId}-index`; // Already validated format, prepend / for proper URL construction
        const testUrl = new URL(pathSegment, baseUrl).href;
        const testParams = new URLSearchParams({
            url: '*',
            output: 'json',
            limit: '1',
        });

        const response = await axios.get(`${testUrl}?${testParams.toString()}`, {
            timeout: COMMON_CRAWL.API_TIMEOUT,
            headers: {
                'User-Agent': 'Beleidsscan/1.0',
            },
            validateStatus: (status) => status < 500, // Don't throw on 4xx
        });

        if (response.status === 404) {
            return {
                isValid: false,
                error: `Crawl ID "${crawlId}" does not exist or is not available`,
            };
        }

        if (response.status >= 500) {
            return {
                isValid: false,
                error: `The Common Crawl service returned an error (${response.status}). The service may be temporarily unavailable.`,
            };
        }

        // If we get here, the crawl ID passed format validation, year validation, and API check
        return { isValid: true };
    } catch (error) {
        // Handle specific error cases that indicate validation failures:
        // - 404 responses (crawl definitely does not exist)
        // - 5xx responses (service error - treat as invalid)
        // - explicit connection refused errors (service unreachable)
        // Check if error is an axios error (including mocked errors with isAxiosError property)
        const isAxiosError = axios.isAxiosError(error) ||
            (error && typeof error === 'object' && 'isAxiosError' in error && (error as { isAxiosError?: boolean }).isAxiosError === true);

        if (isAxiosError) {
            const axiosError = error as import('axios').AxiosError;
            if (axiosError.response?.status === 404) {
                return {
                    isValid: false,
                    error: `Crawl ID "${crawlId}" does not exist`,
                };
            }
            if (axiosError.response?.status && axiosError.response.status >= 500) {
                return {
                    isValid: false,
                    error: `The Common Crawl service returned an error (${axiosError.response.status}). The service may be temporarily unavailable.`,
                };
            }
            if (axiosError.code === 'ECONNREFUSED') {
                return {
                    isValid: false,
                    error: 'Connection refused while validating crawl ID',
                };
            }
        }

        logger.warn({ error, crawlId }, 'Could not validate crawl ID');
        // Other upstream issues (timeouts, transient network errors) are treated
        // as non-fatal for validation; the main query endpoint will surface a more
        // precise error via detectErrorType.
        return { isValid: true };
    }
}

/**
 * Detects the specific type of error from Common Crawl API response
 */
function detectErrorType(error: unknown, crawlId: string, urlPattern: string): {
    type: 'invalid_crawl' | 'no_results' | 'invalid_pattern' | 'network_error' | 'server_error' | 'unknown';
    message: string;
    suggestions: string[];
} {
    // Check if error is an axios error (including mocked errors with isAxiosError property)
    const isAxiosError = axios.isAxiosError(error) ||
        (error && typeof error === 'object' && 'isAxiosError' in error && (error as { isAxiosError?: boolean }).isAxiosError === true);

    if (isAxiosError) {
        const axiosError = error as import('axios').AxiosError;
        if (axiosError.response) {
            const status = axiosError.response.status;
            const data = axiosError.response.data;

            if (status === 404) {
                // Check response body for "No Captures found" to distinguish "no results" from "invalid crawl"
                // Common Crawl returns "No Captures found" in the body when the crawl is valid but query has no results
                const dataStr = typeof data === 'string' ? data : JSON.stringify(data || {});
                if (dataStr && dataStr.includes('No Captures found')) {
                    return {
                        type: 'no_results',
                        message: `No results found for pattern "${urlPattern}" in crawl "${crawlId}"`,
                        suggestions: [
                            'Try a broader search pattern (e.g., *beleid* instead of specific URL)',
                            'Remove or adjust the domain filter',
                            'Try a different crawl ID',
                            'Verify your URL pattern uses wildcards correctly',
                        ],
                    };
                }

                // If response is 404 but doesn't mention "No Captures found", it's likely the crawl ID is invalid
                // or the index endpoint for this crawl doesn't exist
                return {
                    type: 'invalid_crawl',
                    message: `Crawl ID "${crawlId}" does not exist or is not available`,
                    suggestions: [
                        'Select a different crawl ID from the dropdown',
                        'Check available crawls at https://index.commoncrawl.org/',
                        'Try using a recent crawl ID like CC-MAIN-2025-47',
                    ],
                };
            }

            if (status === 400) {
                return {
                    type: 'invalid_pattern',
                    message: 'Invalid URL pattern or query parameters',
                    suggestions: [
                        'Check your URL pattern syntax',
                        'Ensure wildcards are used correctly (* matches any characters)',
                        'Verify domain filter format',
                    ],
                };
            }

            if (status >= 500) {
                return {
                    type: 'server_error',
                    message: `The Common Crawl service returned an error (${status}). The service may be temporarily unavailable.`,
                    suggestions: [
                        'The Common Crawl service may be experiencing issues',
                        'Try again in a few minutes',
                        'If the problem persists, try using a different crawl ID',
                    ],
                };
            }
        }

        if (axiosError.request) {
            return {
                type: 'network_error',
                message: 'The Common Crawl service is temporarily unavailable. Our server could not connect to the Common Crawl API.',
                suggestions: [
                    'The Common Crawl service may be experiencing issues',
                    'Try again in a few minutes',
                    'If the problem persists, try using a different crawl ID',
                ],
            };
        }

        // Check for network error codes (ECONNREFUSED, ETIMEDOUT, etc.)
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED' || axiosError.code === 'ENOTFOUND') {
            return {
                type: 'network_error',
                message: 'The Common Crawl service is temporarily unavailable. Our server could not connect to the Common Crawl API.',
                suggestions: [
                    'The Common Crawl service may be experiencing issues',
                    'Try again in a few minutes',
                    'If the problem persists, try using a different crawl ID',
                ],
            };
        }
    }

    // Check for network error codes even if not recognized as axios error
    if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNABORTED' || errorCode === 'ENOTFOUND') {
            return {
                type: 'network_error',
                message: 'The Common Crawl service is temporarily unavailable. Our server could not connect to the Common Crawl API.',
                suggestions: [
                    'The Common Crawl service may be experiencing issues',
                    'Try again in a few minutes',
                    'If the problem persists, try using a different crawl ID',
                ],
            };
        }
    }

    return {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: [
            'Try again',
            'Check the server logs for more details',
        ],
    };
}

router.post('/query', validate(commonCrawlSchemas.query), asyncHandler(async (req: Request, res: Response) => {
    let urlPattern: string | undefined;
    let crawlId: string = 'CC-MAIN-2025-47';
    let domainFilter: string | undefined;

    try {
        const { query, domainFilter: df, crawlId: cid = 'CC-MAIN-2025-47', limit = 100 } = req.body;
        crawlId = cid || 'CC-MAIN-2025-47';
        domainFilter = df;

        // Try MongoDB index first (if .nl domain filter or no domain filter)
        // Skip MongoDB in test environment to avoid import errors
        const useMongoDB = process.env.NODE_ENV !== 'test' && (!domainFilter || domainFilter === '*.nl' || domainFilter === '.nl');

        if (useMongoDB) {
            try {
                const { CommonCrawlIndexService } = await import('../services/common-crawl/CommonCrawlIndexService.js');
                const indexService = new CommonCrawlIndexService();

                // Check if crawl is loaded
                const isLoaded = await indexService.isCrawlLoaded(crawlId);

                if (isLoaded) {
                    logger.info({ crawlId }, 'Querying MongoDB index for crawl');

                    // Build query options
                    const queryOptions: QueryOptions = {
                        crawlId,
                        limit: parseInt(limit.toString()),
                    };

                    // Handle domain filter
                    if (domainFilter) {
                        queryOptions.domainPattern = domainFilter;
                    }

                    // Handle URL pattern
                    const queryPattern = query.trim();
                    if (queryPattern.includes('*')) {
                        // Convert wildcard pattern to regex
                        queryOptions.urlPattern = queryPattern;
                    } else {
                        // Simple keyword search
                        queryOptions.urlPattern = `*${queryPattern}*`;
                    }

                    // Query MongoDB
                    const results = await indexService.query(queryOptions);
                    const total = await indexService.count(queryOptions);

                    // Transform to API format using mapper
                    const transformedResults = mapMongoIndexRecordsToDto(results);

                    logger.info({ crawlId, resultCount: results.length, total }, 'MongoDB query completed');

                    return res.json({
                        results: transformedResults,
                        total,
                        crawlId,
                        query: queryPattern,
                        source: 'mongodb',
                    });
                } else {
                    logger.info({ crawlId }, 'Crawl not loaded in MongoDB, using API');
                }
            } catch (error: unknown) {
                logger.warn({ error, crawlId }, 'MongoDB query failed, falling back to API');
                // Fall through to API query
            }
        }

        // Validate crawl ID before making the actual query (skip validation for known good crawls to speed up)
        const knownGoodCrawls = [
            'CC-MAIN-2025-47', 'CC-MAIN-2025-43', 'CC-MAIN-2025-38', 'CC-MAIN-2025-33',
            'CC-MAIN-2025-30', 'CC-MAIN-2025-26', 'CC-MAIN-2025-21', 'CC-MAIN-2025-18',
            'CC-MAIN-2024-51', 'CC-MAIN-2024-46', 'CC-MAIN-2024-42', 'CC-MAIN-2024-38'
        ];
        if (!knownGoodCrawls.includes(crawlId)) {
            logger.debug({ crawlId }, 'Validating crawl ID');
            const validation = await validateCrawlId(crawlId);
            if (!validation.isValid) {
                throw new NotFoundError('Crawl ID', crawlId, {
                    type: 'invalid_crawl',
                    suggestions: [
                        'Select a different crawl ID from the dropdown',
                        'Check available crawls at https://index.commoncrawl.org/',
                        'Try using a recent crawl ID like CC-MAIN-2025-47',
                    ],
                });
            }
        }

        // Ensure query is defined and not empty
        if (!query || typeof query !== 'string' || !query.trim()) {
            throw new BadRequestError('Query pattern is required');
        }

        urlPattern = query.trim();
        const originalQuery = query.trim(); // Store original for later use

        // If pattern doesn't start with * and doesn't contain ://, it's likely a partial pattern
        // Common Crawl CDX API requires patterns that match URL structure
        // Also handle *keyword* patterns when domain filter is present - construct domain pattern
        const needsPatternConstruction = !urlPattern.includes('://') &&
            (!urlPattern.startsWith('*') || (domainFilter && domainFilter.trim() && urlPattern.includes('*')));

        if (needsPatternConstruction) {
            // Check if it looks like a domain (contains dots and no slashes)
            const looksLikeDomain = urlPattern.includes('.') && !urlPattern.includes('/');

            if (domainFilter && domainFilter.trim()) {
                const domain = domainFilter.trim();
                if (looksLikeDomain) {
                    // If query is a domain, use it directly: antennebureau.nl -> antennebureau.nl/*
                    urlPattern = `${urlPattern}/*`;
                } else {
                    // Query is a path pattern
                    // Common Crawl CDX API doesn't properly support complex patterns like *.nl/*antenne*
                    // So we use a simpler pattern and rely on server-side filtering
                    // Strategy: Use *queryTerm* pattern (matches anywhere in URL) and filter by domain server-side
                    const endsWithWildcard = urlPattern.endsWith('*');
                    const patternWithoutWildcard = endsWithWildcard ? urlPattern.slice(0, -1) : urlPattern;

                    // If domain filter has wildcard (like *.nl), construct domain-specific pattern
                    if (domain.includes('*')) {
                        // For wildcard domains like *.nl, try to match the keyword as a domain name
                        // Pattern: antennebureau.nl/* (matches antennebureau.nl and subdomains)
                        // This works better than *antennebureau* which Common Crawl doesn't support well
                        const domainSuffix = domain.replace(/^\*/, ''); // Remove leading *
                        urlPattern = `${patternWithoutWildcard}${domainSuffix}/*`;
                    } else {
                        // Specific domain: antennebureau.nl/antenne* -> antennebureau.nl/*antenne*
                        urlPattern = `${domain}/*${patternWithoutWildcard}${endsWithWildcard ? '*' : '*'}`;
                    }
                }
            } else {
                if (looksLikeDomain) {
                    // Domain without filter: antennebureau.nl -> antennebureau.nl/*
                    urlPattern = `${urlPattern}/*`;
                } else {
                    // Path pattern without filter: antenne* -> *antenne*
                    const endsWithWildcard = urlPattern.endsWith('*');
                    const patternWithoutWildcard = endsWithWildcard ? urlPattern.slice(0, -1) : urlPattern;
                    urlPattern = `*${patternWithoutWildcard}*`;
                }
            }
        }

        // Use the -index endpoint format as documented by Common Crawl
        // Format: https://index.commoncrawl.org/CC-MAIN-YYYY-WW-index
        // Validate crawlId format before using in URL to prevent SSRF
        const formatValidation = validateCrawlIdFormat(crawlId);
        if (!formatValidation.isValid) {
            throw new BadRequestError(formatValidation.error || 'Invalid crawl ID format');
        }
        // Construct URL safely using URL constructor to prevent SSRF
        const baseUrl = 'https://index.commoncrawl.org';
        const pathSegment = `/${crawlId}-index`; // Already validated format, prepend / for proper URL construction
        const cdxUrl = new URL(pathSegment, baseUrl).href;
        const params = new URLSearchParams({
            output: 'json',
            limit: limit.toString(),
        });

        // Extract keyword from query (remove wildcards) for filter parameter
        const queryKeyword = query.trim().replace(/\*/g, '').trim();
        const hasKeyword = queryKeyword.length > 2 && !query.includes('://');

        // Use filter parameter with matchType=domain for efficient "contains" searches
        // This is the correct way to search for keywords anywhere in URLs within a domain
        // Format: url=.nl&matchType=domain&filter=url:antenne (note: no * prefix for matchType=domain)
        // However, filter=url:keyword only searches in URL paths, not domain names
        // So if keyword might be in domain (like "antennebureau" in "antennebureau.nl"), 
        // we need to use pattern matching instead
        // Check if query has wildcards around keyword (like *antennebureau*) - likely domain name
        const hasWildcardsAroundKeyword = originalQuery.startsWith('*') && originalQuery.endsWith('*');
        const keywordMightBeInDomain = queryKeyword.includes('.') ||
            hasWildcardsAroundKeyword ||
            (queryKeyword.length > 8 && !originalQuery.includes('/') && !originalQuery.includes('://'));

        if (hasKeyword && domainFilter && domainFilter.trim() && domainFilter.includes('*') && !keywordMightBeInDomain) {
            // Use matchType=domain with filter for: "all .nl URLs where URL path contains 'antenne'"
            // This works when keyword is likely in the path, not domain name
            // Remove the * prefix from domain filter for matchType=domain (e.g., *.nl -> .nl)
            const domainForMatchType = domainFilter.trim().replace(/^\*/, '');
            params.append('url', domainForMatchType);
            params.append('matchType', 'domain');
            params.append('filter', `url:${queryKeyword}`);

            logger.debug({ url: cdxUrl, params: params.toString() }, 'Querying CDX with filter');
        } else if (hasKeyword && (!domainFilter || !domainFilter.trim()) && !keywordMightBeInDomain) {
            // Empty domain filter means search all domains - use filter parameter without domain restriction
            // Format: filter=url:bureau (searches all URLs containing the keyword)
            // Note: This also only searches URL paths, not domain names

            // Fix: CDX API requires 'url' parameter even when using filter
            params.append('url', '*');
            params.append('filter', `url:${queryKeyword}`);

            logger.debug({ url: cdxUrl, params: params.toString() }, 'Querying CDX with filter (all domains)');
        } else {
            // Fall back to pattern matching for exact URL, prefix, or domain matches
            // This handles cases where keyword might be in domain name (like antennebureau.nl)
            // Pattern matching searches both domain and path
            params.append('url', urlPattern);
            logger.debug({ url: cdxUrl, params: params.toString() }, 'Querying CDX');
        }

        // Use retry logic for Common Crawl API calls (503 errors are common)
        const response = await retryWithBackoff(
            () => axios.get(`${cdxUrl}?${params.toString()}`, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Beleidsscan/1.0',
                },
            }),
            {
                maxAttempts: 3,
                initialDelay: 2000,
                maxDelay: 10000,
                multiplier: 2,
                isRetryable: (error) => {
                    // Retry on 503 (Service Unavailable) and network errors
                    if (axios.isAxiosError(error)) {
                        const status = error.response?.status;
                        if (status === 503 || status === 504 || status === 429) {
                            return true;
                        }
                        // Network errors (no response) are retryable
                        if (!error.response) {
                            return true;
                        }
                    }
                    return false;
                },
            },
            `Common Crawl query: ${crawlId}`
        );

        // Handle different response formats
        // CDX API can return various formats: array of records, single object, or NDJSON
        interface CDXResult {
            urlkey?: string;
            timestamp?: string;
            url?: string;
            mime?: string;
            status?: string;
            digest?: string;
            length?: string;
            offset?: string;
            filename?: string;
            message?: string;
        }
        let results: CDXResult[] = [];

        // Handle undefined or empty responses
        if (!response || !response.data || (typeof response.data === 'string' && response.data.trim() === '')) {
            results = [];
        } else if (typeof response.data === 'object' && response.data !== null && !Array.isArray(response.data)) {
            // Check if response is a single JSON object (e.g., {"message": "No Captures found"})
            if (response.data.message && response.data.message.includes('No Captures found')) {
                results = [];
            } else {
                // Single result object - only include if it has required fields
                if (response.data.urlkey || response.data.url) {
                    results = [response.data];
                } else {
                    results = [];
                }
            }
        } else {
            // Handle newline-delimited JSON (NDJSON) format
            const dataStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const lines = dataStr.trim().split('\n').filter((line: string) => line.trim());
            results = lines.map((line: string) => {
                try {
                    const parsed = JSON.parse(line);
                    // Skip "No Captures found" messages
                    if (parsed.message && parsed.message.includes('No Captures found')) {
                        return null;
                    }
                    // Only include well-formed results: require a URL so downstream
                    // mapping logic has enough information to build DTOs.
                    if (!parsed.url) {
                        return null;
                    }
                    return parsed;
                } catch (_e) {
                    logger.warn({ line }, 'Failed to parse CDX line');
                    return null;
                }
            }).filter((result): result is Record<string, unknown> => result !== null);
        }

        // Debug: Log parsed results count
        logger.debug({ resultsCount: results.length, results }, 'Parsed CDX results');

        // If no results and we used filter, handle gracefully (don't throw, let error detection handle it)
        // The error detection will be triggered by the empty results array

        // When using filter parameter, Common Crawl already filters results server-side
        // So we don't need additional filtering. However, we still verify results match
        // for safety and to handle edge cases.
        let filteredResults = results;

        // Only apply additional filtering if we didn't use the filter parameter
        // (i.e., we used pattern matching instead)
        if (!hasKeyword || !domainFilter || !domainFilter.includes('*')) {
            const queryForFiltering = query.trim().toLowerCase();
            const queryTerm = queryForFiltering.replace(/\*/g, '');
            const domainHasWildcard = domainFilter && domainFilter.includes('*');
            const shouldFilter = domainHasWildcard && queryTerm.length > 2;

            if (shouldFilter) {
                filteredResults = results.filter((result: CDXResult) => {
                    const url = (result.url || '').toLowerCase();
                    const urlkey = (result.urlkey || '').toLowerCase();

                    // Check if URL contains the query term
                    const containsQueryTerm = url.includes(queryTerm) || urlkey.includes(queryTerm);
                    if (!containsQueryTerm) return false;

                    // Check if URL matches domain filter pattern
                    if (domainFilter) {
                        const domainPattern = domainFilter.toLowerCase().replace(/\*/g, '.*');
                        const domainRegex = new RegExp(`^https?://${domainPattern}`);
                        return domainRegex.test(url);
                    }

                    return true;
                });
            }
        }

        // Debug: Log filtered results count
        logger.debug({ filteredResultsCount: filteredResults.length, filteredResults }, 'Filtered CDX results');

        // Transform to API format using mapper
        let transformedResults;
        try {
            transformedResults = mapCdxResultsToDto(filteredResults);
            // Debug: Log transformed results count
            logger.debug({ transformedResultsCount: transformedResults.length }, 'Transformed CDX results');
        } catch (mapperError) {
            logger.error({ error: mapperError, filteredResults }, 'Error mapping CDX results to DTO');
            throw mapperError;
        }

        // Extract query term for response metadata (ensure query is defined)
        const safeQuery = query || '';
        const queryTermForResponse = safeQuery.trim().replace(/\*/g, '');

        try {
            res.json({
                results: transformedResults,
                total: transformedResults.length,
                crawlId,
                query: urlPattern || safeQuery.trim(), // Fallback to original query if urlPattern is undefined
                originalQuery: safeQuery.trim(), // Include original query for reference
                filtered: queryTermForResponse.length > 2 ? filteredResults.length !== results.length : false, // Indicate if filtering was applied
                source: 'api', // Indicate this came from API
            });
        } catch (jsonError) {
            logger.error({ error: jsonError, transformedResults, urlPattern, crawlId }, 'Error sending JSON response');
            throw jsonError;
        }
    } catch (error) {
        // Ensure urlPattern is defined even if error occurs before it's set
        const finalUrlPattern = urlPattern || 'unknown';
        const finalCrawlId = crawlId || 'unknown';

        // Log the error for debugging
        logger.error({
            error,
            crawlId: finalCrawlId,
            urlPattern: finalUrlPattern,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error)
        }, 'Error in common crawl query route');

        // Use enhanced error detection
        const errorInfo = detectErrorType(error, finalCrawlId, finalUrlPattern);

        // Map error types to appropriate error classes / responses
        if (errorInfo.type === 'invalid_crawl') {
            const notFoundError = new NotFoundError('Crawl result', finalCrawlId, {
                type: errorInfo.type,
                suggestions: errorInfo.suggestions,
                urlPattern: finalUrlPattern,
            });
            // Preserve original error message
            notFoundError.message = errorInfo.message;
            throw notFoundError;
        } else if (errorInfo.type === 'no_results') {
            // "No results" is not an error condition for the client – return an empty result set.
            res.status(200).json({
                results: [],
                total: 0,
                crawlId: finalCrawlId,
                query: finalUrlPattern,
            });
            return;
        } else if (errorInfo.type === 'invalid_pattern') {
            throw new BadRequestError(errorInfo.message, {
                type: errorInfo.type,
                suggestions: errorInfo.suggestions,
            });
        } else if (errorInfo.type === 'server_error') {
            // For server errors, throw an ExternalServiceError (502)
            throw new ExternalServiceError('Common Crawl', errorInfo.message, {
                type: errorInfo.type,
                suggestions: errorInfo.suggestions,
            });
        } else if (errorInfo.type === 'network_error') {
            // For network errors, throw a ServiceUnavailableError (503)
            throw new ServiceUnavailableError(errorInfo.message, {
                type: errorInfo.type,
                suggestions: errorInfo.suggestions,
            });
        } else {
            // For unknown errors, re-throw the original error
            // The error handler will handle it appropriately
            throw error;
        }
    }
}));

/**
 * GET /api/commoncrawl/crawls
 * Returns list of available Common Crawl crawls, fetched dynamically from collinfo.json
 */
router.get('/crawls', asyncHandler(async (_req: Request, res: Response) => {
    try {
        // Fetch latest crawls from Common Crawl's collection info API
        const response = await axios.get('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Beleidsscan/1.0',
            },
        });

        const allCrawls = response.data as Array<{ id: string; name: string;[key: string]: unknown }>;

        // Sort by ID (descending) to get latest first, limit to most recent 20
        const sortedCrawls = allCrawls
            .sort((a, b) => b.id.localeCompare(a.id))
            .slice(0, 20);

        // Transform to API format using mapper
        const recentCrawls = mapCrawlInfosToDto(sortedCrawls, extractDateFromCrawlId);

        res.json(recentCrawls);
    } catch (error) {
        logger.warn({ error }, 'Error fetching crawls from API, using fallback');

        // Fallback to hardcoded list if API fails
        const fallbackCrawls = [
            { id: 'CC-MAIN-2025-47', name: '2025-47 (Latest)', date: '2025-11' },
            { id: 'CC-MAIN-2025-43', name: '2025-43', date: '2025-10' },
            { id: 'CC-MAIN-2025-38', name: '2025-38', date: '2025-09' },
            { id: 'CC-MAIN-2025-33', name: '2025-33', date: '2025-08' },
            { id: 'CC-MAIN-2025-30', name: '2025-30', date: '2025-07' },
            { id: 'CC-MAIN-2025-26', name: '2025-26', date: '2025-06' },
            { id: 'CC-MAIN-2025-21', name: '2025-21', date: '2025-05' },
            { id: 'CC-MAIN-2025-18', name: '2025-18', date: '2025-04' },
            { id: 'CC-MAIN-2025-13', name: '2025-13', date: '2025-03' },
            { id: 'CC-MAIN-2025-08', name: '2025-08', date: '2025-02' },
            { id: 'CC-MAIN-2025-05', name: '2025-05', date: '2025-01' },
            { id: 'CC-MAIN-2024-51', name: '2024-51', date: '2024-12' },
            { id: 'CC-MAIN-2024-46', name: '2024-46', date: '2024-11' },
            { id: 'CC-MAIN-2024-42', name: '2024-42', date: '2024-10' },
            { id: 'CC-MAIN-2024-38', name: '2024-38', date: '2024-09' },
        ];

        res.json(fallbackCrawls);
    }
}));

/**
 * Extracts approximate date from crawl ID (e.g., CC-MAIN-2025-47 -> 2025-11)
 */
function extractDateFromCrawlId(crawlId: string): string {
    const match = crawlId.match(/CC-MAIN-(\d{4})-(\d+)/);
    if (match) {
        const year = match[1];
        const week = parseInt(match[2], 10);
        // Approximate month from week number (rough estimate)
        const month = Math.floor((week - 1) / 4) + 1;
        const monthStr = month.toString().padStart(2, '0');
        return `${year}-${monthStr}`;
    }
    return 'Unknown';
}

/**
 * GET /api/commoncrawl/validate/:crawlId
 * Validates if a crawl ID exists and is accessible
 */
router.get('/validate/:crawlId', validate(commonCrawlSchemas.validateCrawlId), asyncHandler(async (req: Request, res: Response) => {
    const { crawlId } = req.params;

    const validation = await validateCrawlId(crawlId);

    if (validation.isValid) {
        res.json({
            isValid: true,
            crawlId,
            message: `Crawl ID "${crawlId}" is valid and accessible`,
        });
    } else {
        // Check if it's an upstream service error (503/network error)
        if (validation.error && (
            validation.error.includes('temporarily unavailable') ||
            validation.error.includes('returned an error') ||
            validation.error.includes('Connection refused')
        )) {
            throw new ServiceUnavailableError(validation.error, {
                isValid: false,
                crawlId,
                suggestions: [
                    'The Common Crawl service may be experiencing issues',
                    'Try again in a few minutes',
                ],
            });
        }

        // Throw NotFoundError with validation details
        throw new NotFoundError('Crawl ID', crawlId, {
            isValid: false,
            error: validation.error || `Crawl ID "${crawlId}" does not exist or is not available`,
            suggestions: [
                'Select a different crawl ID from the dropdown',
                'Check available crawls at https://index.commoncrawl.org/',
                'Try using a recent crawl ID like CC-MAIN-2025-47',
            ],
        });
    }
}));

/**
 * POST /api/commoncrawl/queries
 * Save a Common Crawl query
 */
router.post('/queries', validate(commonCrawlSchemas.saveQuery), asyncHandler(async (req: Request, res: Response) => {
    const { query, domainFilter, crawlId, status } = req.body;

    const savedQuery = await CommonCrawlQuery.create({
        query,
        domainFilter: domainFilter || '',
        crawlId,
        status: status || 'pending'
    });

    res.status(201).json(savedQuery);
}));

/**
 * GET /api/commoncrawl/queries
 * Get all saved queries
 */
router.get('/queries', validate(commonCrawlSchemas.getQueries), asyncHandler(async (req, res) => {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000); // Max 1000 items
    const skip = (page - 1) * limit;

    const statusFilter = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;

    // Get queries and total count
    const [queries, total] = await Promise.all([
        CommonCrawlQuery.findAll({
            status: statusFilter,
            limit,
            skip
        }),
        CommonCrawlQuery.count({
            status: statusFilter
        })
    ]);

    // Collect all query IDs
    const queryIds = queries
        .filter(q => q._id)
        .map(q => q._id!.toString());

    // Get counts for all queries in one go
    const countsMap = await CommonCrawlResult.countByQueryIds(queryIds);

    // Map to DTOs
    const queriesWithCounts = queries.map(query => {
        if (!query._id) {
            throw new BadRequestError('Query missing _id', {
                reason: 'missing_query_id',
                operation: 'commonCrawl_query'
            });
        }
        const count = countsMap[query._id.toString()] || 0;
        return mapCommonCrawlQueryWithCountToDto({
            _id: query._id.toString(),
            query: query.query,
            domainFilter: query.domainFilter,
            crawlId: query.crawlId,
            status: query.status,
            createdAt: query.createdAt,
            updatedAt: query.updatedAt,
        }, count);
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    res.json({
        data: queriesWithCounts,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore,
        },
    });
}));

/**
 * GET /api/commoncrawl/queries/:id
 * Get a specific query
 */
router.get('/queries/:id', validate(commonCrawlSchemas.getQuery), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const query = await CommonCrawlQuery.findByIdWithResultCount(id);
    throwIfNotFound(query, 'Query', id);

    res.json(query);
}));

/**
 * POST /api/commoncrawl/queries/:queryId/results
 * Save results for a query
 */
router.post('/queries/:queryId/results', validate(commonCrawlSchemas.saveResults), asyncHandler(async (req: Request, res: Response) => {
    const { queryId } = req.params;
    const { results } = req.body;

    // Verify query exists
    const query = await CommonCrawlQuery.findById(queryId);
    throwIfNotFound(query, 'Query', queryId);

    // Filter out duplicates (check if URL already exists for this query)
    const uniqueResults = [];
    const urlsToCheck = results.map((r: { url: string }) => r.url);
    const existingUrls = await CommonCrawlResult.findExistingUrls(queryId, urlsToCheck);

    for (const result of results) {
        if (!existingUrls.has(result.url)) {
            uniqueResults.push({
                ...result,
                queryId
            });
        }
    }

    if (uniqueResults.length === 0) {
        return res.json({
            message: 'All results already exist',
            saved: 0,
            skipped: results.length
        });
    }

    const savedResults = await CommonCrawlResult.createMany(uniqueResults);

    res.status(201).json({
        message: `Saved ${savedResults.length} results`,
        saved: savedResults.length,
        skipped: results.length - savedResults.length
    });
}));

/**
 * GET /api/commoncrawl/queries/:queryId/results
 * Get results for a query with pagination
 */
router.get('/queries/:queryId/results', validate(commonCrawlSchemas.getResults), asyncHandler(async (req: Request, res: Response) => {
    const { queryId } = req.params;
    const { approved } = req.query;

    // Parse pagination parameters using standard utility
    const { limit, skip, page } = parsePaginationParams(req.query, {
        defaultLimit: 50,
        maxLimit: 1000
    });

    // Determine approved filter
    const approvedFilter = approved === 'true' ? true : approved === 'false' ? false : undefined;

    // Get results and total count in parallel
    const [results, total] = await Promise.all([
        CommonCrawlResult.findByQueryId(queryId, {
            approved: approvedFilter,
            limit,
            skip
        }),
        CommonCrawlResult.countByQueryId(queryId, {
            approved: approvedFilter
        })
    ]);

    // Return paginated response
    const response = createPaginatedResponse(results, total, limit, page, skip);
    res.json(response);
}));

/**
 * POST /api/commoncrawl/results/:resultId/approve
 * Approve a result
 */
router.post('/results/:resultId/approve', validate(commonCrawlSchemas.approveResult), asyncHandler(async (req: Request, res: Response) => {
    const { resultId } = req.params;

    const result = await CommonCrawlResult.approve(resultId);
    throwIfNotFound(result, 'Result', resultId);

    res.json(result);
}));

/**
 * POST /api/commoncrawl/results/approve-many
 * Approve multiple results
 */
router.post('/results/approve-many', validate(commonCrawlSchemas.approveMany), asyncHandler(async (req: Request, res: Response) => {
    const { resultIds } = req.body;

    const count = await CommonCrawlResult.approveMany(resultIds);

    res.json({
        message: `Approved ${count} results`,
        approved: count
    });
}));

/**
 * DELETE /api/commoncrawl/queries/:id
 * Delete a query and its results
 */
router.delete('/queries/:id', validate(commonCrawlSchemas.deleteQuery), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Delete all results first
    await CommonCrawlResult.deleteByQueryId(id);

    // Delete the query
    const deleted = await CommonCrawlQuery.delete(id);
    throwIfNotFound(deleted, 'Query', id);

    res.json({ message: '[i18n:apiMessages.queryAndResultsDeleted]' });
}));

/**
 * GET /api/commoncrawl/index/status
 * Get status of MongoDB index (which crawls are loaded)
 */
router.get('/index/status', asyncHandler(async (_req: Request, res: Response) => {
    const { CommonCrawlIndexService } = await import('../services/common-crawl/CommonCrawlIndexService.js');
    const indexService = new CommonCrawlIndexService();

    const stats = await indexService.getStats();

    res.json({
        loaded: stats.total > 0,
        stats: {
            total: stats.total,
            uniqueDomains: stats.uniqueDomains,
            uniqueUrls: stats.uniqueUrls,
            crawlIds: stats.crawlIds,
        }
    });
}));

/**
 * GET /api/commoncrawl/migration/health
 * Get health status of CDX file migration
 */
router.get('/migration/health', asyncHandler(async (_req: Request, res: Response) => {
    const { CDXMigrationHealthService } = await import('../services/common-crawl/CDXMigrationHealthService.js');
    const healthService = new CDXMigrationHealthService();

    const healthStatus = await healthService.getHealthStatus();
    const migrationStatus = await healthService.getMigrationStatus();

    res.json({
        ...healthStatus,
        migrationStatus,
    });
}));

export function createCommonCrawlRouter() {
    return router;
}
