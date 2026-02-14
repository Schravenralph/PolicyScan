/**
 * DSO Geometry Service
 * 
 * Fetches geometries from the DSO Geometrie Opvragen API.
 * This service retrieves GeoJSON geometries by geometry identifier (geometrieIdentificatie).
 * 
 * API Documentation: docs/30-dso-geometrie-opvragen/functionele-documentatie-geometrie-opvragen-v1-api.md
 */

import { AxiosInstance, AxiosError } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';
import type { Geometry } from 'geojson';
import { ServiceUnavailableError, BadRequestError } from '../../types/errors.js';

/**
 * Service for fetching geometries from DSO Geometrie Opvragen API
 */
export class DSOGeometryService {
    private client: AxiosInstance;
    private baseUrl: string;
    private apiKey: string;
    private useProduction: boolean;

    constructor(useProduction: boolean = false) {
        // Load standardized deployment config
        const deploymentConfig = getDeploymentConfig();
        const dsoConfig = deploymentConfig.dso;

        // Support legacy useProduction flag - if explicitly provided, use it
        // Otherwise fall back to DSO_ENV from config
        if (useProduction !== undefined && useProduction !== null) {
            this.useProduction = useProduction;
        } else {
            this.useProduction = (dsoConfig.env === 'prod');
        }

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

        // Determine base URL for geometry API
        // Geometry API uses different base URL than ontsluiten API
        // Production uses service.omgevingswet.overheid.nl
        if (this.useProduction) {
            this.baseUrl = 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/geometrieopvragen/v1';
        } else {
            this.baseUrl = 'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/geometrieopvragen/v1';
        }

        // Support override via environment variable
        const envBaseUrl = process.env.DSO_GEOMETRIE_BASE_URL;
        if (envBaseUrl) {
            this.baseUrl = envBaseUrl;
        }

        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD,
            headers: {
                'X-API-KEY': this.apiKey,
                'x-api-key': this.apiKey, // Also set lowercase as docs mention x-api-key (HTTP headers are case-insensitive but some APIs are picky)
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Check if DSO API is configured
     */
    static isConfigured(_useProduction: boolean = false): boolean {
        try {
            const deploymentConfig = getDeploymentConfig();
            return !!deploymentConfig.dso.apiKey;
        } catch {
            return false;
        }
    }

    /**
     * Get geometry by geometry identifier
     * 
     * @param geometrieIdentificatie - Geometry identifier (e.g., "GM0301_20230101" or UUID)
     * @param crs - Coordinate reference system (default: EPSG:28992 for RD format)
     * @returns GeoJSON geometry in the specified CRS
     */
    async getGeometryByIdentificatie(
        geometrieIdentificatie: string,
        crs: string = 'EPSG:28992'
    ): Promise<Geometry> {
        if (!geometrieIdentificatie) {
            throw new BadRequestError('geometrieIdentificatie is required', {
                reason: 'missing_geometry_identifier',
                operation: 'getGeometryByIdentificatie'
            });
        }

        // CRS must always be provided (required by API, otherwise 422 error)
        // Format: http://www.opengis.net/def/crs/EPSG/0/{code}
        const crsUrl = `http://www.opengis.net/def/crs/EPSG/0/${crs.replace('EPSG:', '')}`;

        const endpoint = `/geometrieen/${encodeURIComponent(geometrieIdentificatie)}`;
        const fullUrl = `${this.baseUrl}${endpoint}?crs=${encodeURIComponent(crsUrl)}`;

        logger.info({
            endpoint,
            geometrieIdentificatie,
            crs,
            crsUrl,
            fullUrl,
            environment: this.useProduction ? 'production' : 'preproduction',
        }, 'Fetching geometry from DSO Geometrie API');

        try {
            const response = await this.client.get<Geometry>(endpoint, {
                params: {
                    crs: crsUrl
                }
            });

            const geometry = response.data;

            if (!geometry || !geometry.type) {
                throw new ServiceUnavailableError(
                    'Invalid geometry response from DSO API',
                    {
                        reason: 'invalid_geometry_response',
                        operation: 'getGeometryByIdentificatie',
                        geometrieIdentificatie
                    }
                );
            }

            logger.info({
                geometrieIdentificatie,
                geometryType: geometry.type,
                environment: this.useProduction ? 'production' : 'preproduction',
            }, 'Successfully fetched geometry from DSO API');

            return geometry;
        } catch (error) {
            this.handleError(error, fullUrl, geometrieIdentificatie);
            throw error;  // Re-throw after logging
        }
    }

    /**
     * Get municipality geometry by municipality code
     * 
     * This method attempts to construct the geometry identifier from the municipality code.
     * Municipality geometry identifiers typically follow the pattern: GM{code}_YYYYMMDD
     * 
     * @param municipalityCode - Municipality code (e.g., "gm0301" or "0301")
     * @param crs - Coordinate reference system (default: EPSG:28992 for RD format)
     * @returns GeoJSON geometry in the specified CRS, or null if not found
     */
    async getMunicipalityGeometry(
        municipalityCode: string,
        crs: string = 'EPSG:28992'
    ): Promise<Geometry | null> {
        // Normalize municipality code (remove 'gm' prefix if present, ensure uppercase)
        const normalizedCode = municipalityCode.toLowerCase().replace(/^gm/, '');
        const codeNumber = normalizedCode.padStart(4, '0'); // Ensure 4 digits

        // Try common geometry identifier patterns
        // Pattern: GM{code}_YYYYMMDD (e.g., GM0301_20230101)
        // We'll try the most recent date first (20230101 is common)
        const possibleIdentifiers = [
            `GM${codeNumber}_20230101`,
            `GM${codeNumber}_20240101`,
            `GM${codeNumber}_20250101`,
        ];

        for (const identifier of possibleIdentifiers) {
            try {
                const geometry = await this.getGeometryByIdentificatie(identifier, crs);
                logger.info({
                    municipalityCode,
                    geometryIdentificatie: identifier,
                    geometryType: geometry.type,
                }, 'Found municipality geometry');
                return geometry;
            } catch (error) {
                // Continue to next identifier if this one fails
                logger.debug({
                    municipalityCode,
                    geometryIdentificatie: identifier,
                    error: error instanceof Error ? error.message : String(error),
                }, 'Geometry identifier not found, trying next');
            }
        }

        logger.warn({
            municipalityCode,
            triedIdentifiers: possibleIdentifiers,
        }, 'Could not find geometry for municipality with any of the tried identifiers');

        return null;
    }

    /**
     * Handle and log API errors
     */
    private handleError(error: unknown, url: string, geometrieIdentificatie: string): void {
        const errorDiagnostic: Record<string, unknown> = {
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            requestUrl: url,
            geometrieIdentificatie,
            environment: this.useProduction ? 'production' : 'preproduction',
            apiKeyConfigured: !!this.apiKey,
        };

        if (error instanceof AxiosError) {
            errorDiagnostic.axiosError = {
                status: error.response?.status,
                statusText: error.response?.statusText,
                responseData: error.response?.data,
            };

            // Special handling for 401 (Unauthorized) - API key issue
            if (error.response?.status === 401) {
                logger.error({
                    service: 'DSOGeometry',
                    ...errorDiagnostic,
                    note: '401 Unauthorized - API key may not have access to geometrie opvragen API. Verify API key has access to this endpoint.',
                    suggestion: 'Check if API key has access to geometrie opvragen API. Same key should work for all DSO APIs per documentation.',
                }, 'DSO geometry API authentication failed');
                return;
            }

            // Special handling for 400 (Bad Request) - usually means invalid identifier format
            if (error.response?.status === 400) {
                logger.warn({
                    service: 'DSOGeometry',
                    ...errorDiagnostic,
                    note: '400 Bad Request - geometry identifier format may be invalid',
                }, 'DSO geometry API returned 400 - identifier format may be invalid');
                return;
            }

            // Special handling for 422 (Unprocessable Entity) - usually means CRS not provided
            if (error.response?.status === 422) {
                logger.error({
                    service: 'DSOGeometry',
                    ...errorDiagnostic,
                    note: '422 Unprocessable Entity - CRS parameter may be missing or invalid',
                }, 'DSO geometry API returned 422 - CRS parameter may be missing or invalid');
                return;
            }

            // Special handling for 404 (Not Found) - geometry identifier doesn't exist
            if (error.response?.status === 404) {
                logger.debug({
                    service: 'DSOGeometry',
                    ...errorDiagnostic,
                    note: '404 Not Found - geometry identifier does not exist in API',
                }, 'Geometry identifier not found in DSO API');
                return;
            }
        }

        logger.error({
            service: 'DSOGeometry',
            ...errorDiagnostic,
        }, 'DSO geometry API request failed');
    }
}
