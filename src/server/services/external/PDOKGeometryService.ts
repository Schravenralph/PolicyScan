/**
 * PDOK Geometry Service
 * 
 * Fetches bevoegd gezag geometries from PDOK OGC API Features.
 * Uses CBS Gebiedsindelingen collections for gemeentegrenzen, provinciegrenzen, etc.
 * 
 * API Documentation: https://api.pdok.nl/cbs/gebiedsindelingen/ogc/v1
 * 
 * Supported types:
 * - GEMEENTE: Uses 'gemeente_gegeneraliseerd' collection
 * - PROVINCIE: Uses 'provincie_gegeneraliseerd' collection (if available)
 * - WATERSCHAP: May need different collection or DSO identifier fallback
 * - RIJK: May need DSO identifier fallback
 */

import { AxiosInstance } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { logger } from '../../utils/logger.js';
import type { Geometry, FeatureCollection } from 'geojson';
import { NotFoundError, BadRequestError } from '../../types/errors.js';

/**
 * PDOK OGC API Feature response
 */
interface PDOKFeature {
    type: 'Feature';
    id: string | number;
    geometry: Geometry;
    properties: {
        statcode: string;  // Gemeentecode (e.g., "GM0106")
        statnaam: string;  // Gemeentenaam (e.g., "Assen")
        jaarcode: number;  // Jaar (e.g., 2023)
        jrstatcode: string; // Jaar + code (e.g., "2023GM0106")
        startdatum: string; // ISO date
        einddatum: string | null; // ISO date or null
        rubriek: string;   // "gemeente"
        id: number;
    };
}

interface PDOKFeatureCollection extends FeatureCollection {
    features: PDOKFeature[];
    numberMatched?: number;
    numberReturned?: number;
}

/**
 * Options for fetching municipality geometry
 */
export interface MunicipalityGeometryOptions {
    /**
     * Municipality code (e.g., "GM0106" or "0106")
     * Will be normalized to "GM0106" format
     */
    municipalityCode: string;
    
    /**
     * Optional year for temporal filtering
     * If not provided, uses most recent available year
     */
    year?: number;
    
    /**
     * CRS for the returned geometry
     * Default: EPSG:28992 (RD format)
     */
    crs?: string;
}

/**
 * Options for fetching bevoegd gezag geometry
 */
export interface BevoegdGezagGeometryOptions {
    /**
     * Bevoegd gezag code (e.g., "GM0106", "PV30", "WS15", "0106", "30")
     * Will be normalized based on bestuurslaag
     */
    code: string;
    
    /**
     * Bestuurslaag type
     */
    bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    
    /**
     * Optional year for temporal filtering
     * If not provided, uses most recent available year
     */
    year?: number;
    
    /**
     * CRS for the returned geometry
     * Default: EPSG:28992 (RD format)
     */
    crs?: string;
}

/**
 * Service for fetching bevoegd gezag geometries from PDOK
 */
export class PDOKGeometryService {
    private client: AxiosInstance;
    private baseUrl = 'https://api.pdok.nl/cbs/gebiedsindelingen/ogc/v1';
    
    /**
     * Get collection ID for a given bestuurslaag
     */
    private getCollectionId(bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK'): string {
        switch (bestuurslaag) {
            case 'GEMEENTE':
                return 'gemeente_gegeneraliseerd';
            case 'PROVINCIE':
                return 'provincie_gegeneraliseerd'; // Assumed - may need verification
            case 'WATERSCHAP':
                // MVP Limitation: PDOK does not have waterschap collection
                throw new BadRequestError(
                    'Waterschap geometries are not available via PDOK in MVP. Please use an alternative workflow or provide geometry manually.',
                    {
                        reason: 'pdok_not_supported',
                        bestuurslaag: 'WATERSCHAP',
                        mvpLimitation: true,
                        alternativeWorkflows: [
                            'Use manual geometry input',
                            'Use alternative data sources (CBS, Kadaster)',
                            'Contact DSO support for geometry API access',
                        ],
                    }
                );
            case 'RIJK':
                // MVP Limitation: PDOK does not have rijk collection
                throw new BadRequestError(
                    'Rijk (national government) geometries are not available via PDOK in MVP. Please use an alternative workflow or provide geometry manually.',
                    {
                        reason: 'pdok_not_supported',
                        bestuurslaag: 'RIJK',
                        mvpLimitation: true,
                        alternativeWorkflows: [
                            'Use manual geometry input',
                            'Use alternative data sources (CBS, Kadaster)',
                            'Contact DSO support for geometry API access',
                        ],
                    }
                );
            default:
                return 'gemeente_gegeneraliseerd';
        }
    }

    constructor() {
        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD,
            headers: {
                'Accept': 'application/geo+json',
            },
        });
    }

    /**
     * Normalize bevoegd gezag code based on bestuurslaag
     * 
     * @param code - Bevoegd gezag code (e.g., "GM0106", "PV30", "0106", "30")
     * @param bestuurslaag - Bestuurslaag type
     * @returns Normalized code (e.g., "GM0106", "PV30")
     */
    private normalizeBevoegdGezagCode(
        code: string, 
        bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK'
    ): string {
        const upperCode = code.toUpperCase();
        
        switch (bestuurslaag) {
            case 'GEMEENTE':
                // Remove GM prefix if present
                const gmCode = upperCode.replace(/^GM/, '');
                return `GM${gmCode.padStart(4, '0')}`;
            case 'PROVINCIE':
                // Remove PV prefix if present
                const pvCode = upperCode.replace(/^PV/, '');
                return `PV${pvCode.padStart(2, '0')}`;
            case 'WATERSCHAP':
                // Remove WS prefix if present
                const wsCode = upperCode.replace(/^WS/, '');
                return `WS${wsCode.padStart(3, '0')}`;
            case 'RIJK':
                // Remove RK prefix if present
                const rkCode = upperCode.replace(/^RK/, '');
                return `RK${rkCode.padStart(3, '0')}`;
            default:
                return upperCode;
        }
    }
    
    /**
     * Normalize municipality code to GM{code} format (backward compatibility)
     * 
     * @param code - Municipality code (e.g., "GM0106", "0106", "gm0106")
     * @returns Normalized code (e.g., "GM0106")
     */
    private normalizeMunicipalityCode(code: string): string {
        return this.normalizeBevoegdGezagCode(code, 'GEMEENTE');
    }

    /**
     * Get municipality geometry from PDOK
     * 
     * @param options - Options for fetching geometry
     * @returns GeoJSON geometry in the specified CRS
     * @throws NotFoundError if municipality not found
     */
    async getMunicipalityGeometry(options: MunicipalityGeometryOptions): Promise<Geometry> {
        const normalizedCode = this.normalizeMunicipalityCode(options.municipalityCode);
        const crs = options.crs || 'http://www.opengis.net/def/crs/EPSG/0/28992'; // RD format
        
        logger.info({
            municipalityCode: options.municipalityCode,
            normalizedCode,
            year: options.year,
            crs,
        }, 'Fetching municipality geometry from PDOK');

        try {
            // Fetch features - PDOK doesn't support CQL filters, so we fetch and filter client-side
            // We fetch a reasonable number of features to find the municipality
            const limit = 500; // Should be enough to find any municipality
            const collectionId = this.getCollectionId('GEMEENTE');
            const response = await this.client.get<PDOKFeatureCollection>(
                `/collections/${collectionId}/items`,
                {
                    params: {
                        limit,
                        f: 'json',
                        crs,
                    },
                }
            );

            const features = response.data.features || [];

            if (features.length === 0) {
                throw new NotFoundError(
                    `No municipality features found in PDOK collection`,
                    normalizedCode,
                    {
                        reason: 'no_features_in_collection',
                        operation: 'getMunicipalityGeometry',
                        collectionId,
                    }
                );
            }

            // Filter by municipality code
            let matchingFeatures = features.filter(f => 
                f.properties.statcode === normalizedCode
            );

            if (matchingFeatures.length === 0) {
                logger.warn({
                    normalizedCode,
                    totalFeatures: features.length,
                    sampleCodes: features.slice(0, 5).map(f => f.properties.statcode),
                }, 'Municipality code not found in PDOK features');
                
                throw new NotFoundError(
                    `Municipality not found: ${normalizedCode}`,
                    normalizedCode,
                    {
                        reason: 'municipality_not_found',
                        operation: 'getMunicipalityGeometry',
                        municipalityCode: normalizedCode,
                        availableCodes: features.slice(0, 10).map(f => f.properties.statcode),
                    }
                );
            }

            // If year is specified, filter by year
            if (options.year !== undefined) {
                matchingFeatures = matchingFeatures.filter(f => 
                    f.properties.jaarcode === options.year
                );

                if (matchingFeatures.length === 0) {
                    // If no match for specified year, try to find closest year
                    const availableYears = [...new Set(
                        features
                            .filter(f => f.properties.statcode === normalizedCode)
                            .map(f => f.properties.jaarcode)
                    )].sort((a, b) => b - a); // Most recent first

                    logger.warn({
                        normalizedCode,
                        requestedYear: options.year,
                        availableYears,
                    }, 'Requested year not found, using most recent available');

                    // Use most recent year
                    matchingFeatures = features.filter(f => 
                        f.properties.statcode === normalizedCode &&
                        f.properties.jaarcode === availableYears[0]
                    );
                }
            } else {
                // If no year specified, use most recent year
                const years = [...new Set(matchingFeatures.map(f => f.properties.jaarcode))].sort((a, b) => b - a);
                const mostRecentYear = years[0];
                
                matchingFeatures = matchingFeatures.filter(f => 
                    f.properties.jaarcode === mostRecentYear
                );

                logger.debug({
                    normalizedCode,
                    mostRecentYear,
                    totalYearsAvailable: years.length,
                }, 'Using most recent year for municipality');
            }

            if (matchingFeatures.length === 0) {
                throw new NotFoundError(
                    `No geometry found for municipality ${normalizedCode}`,
                    normalizedCode,
                    {
                        reason: 'no_geometry_found',
                        operation: 'getMunicipalityGeometry',
                        municipalityCode: normalizedCode,
                        year: options.year,
                    }
                );
            }

            // Use first matching feature (should be only one per year)
            const feature = matchingFeatures[0];

            logger.info({
                municipalityCode: normalizedCode,
                municipalityName: feature.properties.statnaam,
                year: feature.properties.jaarcode,
                geometryType: feature.geometry.type,
            }, 'Successfully fetched municipality geometry from PDOK');

            return feature.geometry;
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw error;
            }

            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({
                municipalityCode: normalizedCode,
                error: errorMsg,
            }, 'Failed to fetch municipality geometry from PDOK');

            throw new BadRequestError(
                `Failed to fetch municipality geometry: ${errorMsg}`,
                {
                    reason: 'pdok_api_error',
                    operation: 'getMunicipalityGeometry',
                    municipalityCode: normalizedCode,
                    error: errorMsg,
                }
            );
        }
    }

    /**
     * Get bevoegd gezag geometry from PDOK
     * 
     * Generic method that works for all supported bestuurslagen.
     * 
     * @param options - Options for fetching geometry
     * @returns GeoJSON geometry in the specified CRS
     * @throws NotFoundError if bevoegd gezag not found
     * @throws BadRequestError if bestuurslaag is not supported by PDOK
     */
    async getBevoegdGezagGeometry(options: BevoegdGezagGeometryOptions): Promise<Geometry> {
        const normalizedCode = this.normalizeBevoegdGezagCode(options.code, options.bestuurslaag);
        const crs = options.crs || 'http://www.opengis.net/def/crs/EPSG/0/28992'; // RD format
        const collectionId = this.getCollectionId(options.bestuurslaag);
        
        logger.info({
            code: options.code,
            normalizedCode,
            bestuurslaag: options.bestuurslaag,
            year: options.year,
            crs,
            collectionId,
        }, 'Fetching bevoegd gezag geometry from PDOK');

        try {
            // Fetch features - PDOK doesn't support CQL filters, so we fetch and filter client-side
            const limit = 500; // Should be enough to find any bevoegd gezag
            const response = await this.client.get<PDOKFeatureCollection>(
                `/collections/${collectionId}/items`,
                {
                    params: {
                        limit,
                        f: 'json',
                        crs,
                    },
                }
            );

            const features = response.data.features || [];

            if (features.length === 0) {
                throw new NotFoundError(
                    `No features found in PDOK collection: ${collectionId}`,
                    normalizedCode,
                    {
                        reason: 'no_features_in_collection',
                        operation: 'getBevoegdGezagGeometry',
                        collectionId,
                        bestuurslaag: options.bestuurslaag,
                    }
                );
            }

            // Filter by code (statcode property)
            let matchingFeatures = features.filter(f => 
                f.properties.statcode === normalizedCode
            );

            if (matchingFeatures.length === 0) {
                logger.warn({
                    normalizedCode,
                    bestuurslaag: options.bestuurslaag,
                    totalFeatures: features.length,
                    sampleCodes: features.slice(0, 5).map(f => f.properties.statcode),
                }, 'Bevoegd gezag code not found in PDOK features');
                
                throw new NotFoundError(
                    `Bevoegd gezag not found: ${normalizedCode} (${options.bestuurslaag})`,
                    normalizedCode,
                    {
                        reason: 'bevoegd_gezag_not_found',
                        operation: 'getBevoegdGezagGeometry',
                        code: normalizedCode,
                        bestuurslaag: options.bestuurslaag,
                        availableCodes: features.slice(0, 10).map(f => f.properties.statcode),
                    }
                );
            }

            // If year is specified, filter by year
            if (options.year !== undefined) {
                matchingFeatures = matchingFeatures.filter(f => 
                    f.properties.jaarcode === options.year
                );

                if (matchingFeatures.length === 0) {
                    // If no match for specified year, try to find closest year
                    const availableYears = [...new Set(
                        features
                            .filter(f => f.properties.statcode === normalizedCode)
                            .map(f => f.properties.jaarcode)
                    )].sort((a, b) => b - a); // Most recent first

                    logger.warn({
                        normalizedCode,
                        requestedYear: options.year,
                        availableYears,
                    }, 'Requested year not found, using most recent available');

                    // Use most recent year
                    matchingFeatures = features.filter(f => 
                        f.properties.statcode === normalizedCode &&
                        f.properties.jaarcode === availableYears[0]
                    );
                }
            } else {
                // If no year specified, use most recent year
                const years = [...new Set(matchingFeatures.map(f => f.properties.jaarcode))].sort((a, b) => b - a);
                const mostRecentYear = years[0];
                
                matchingFeatures = matchingFeatures.filter(f => 
                    f.properties.jaarcode === mostRecentYear
                );

                logger.debug({
                    normalizedCode,
                    mostRecentYear,
                    totalYearsAvailable: years.length,
                }, 'Using most recent year for bevoegd gezag');
            }

            if (matchingFeatures.length === 0) {
                throw new NotFoundError(
                    `No geometry found for bevoegd gezag ${normalizedCode} (${options.bestuurslaag})`,
                    normalizedCode,
                    {
                        reason: 'no_geometry_found',
                        operation: 'getBevoegdGezagGeometry',
                        code: normalizedCode,
                        bestuurslaag: options.bestuurslaag,
                        year: options.year,
                    }
                );
            }

            // Use first matching feature (should be only one per year)
            const feature = matchingFeatures[0];

            logger.info({
                code: normalizedCode,
                naam: feature.properties.statnaam,
                bestuurslaag: options.bestuurslaag,
                year: feature.properties.jaarcode,
                geometryType: feature.geometry.type,
            }, 'Successfully fetched bevoegd gezag geometry from PDOK');

            return feature.geometry;
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof BadRequestError) {
                throw error;
            }

            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({
                code: normalizedCode,
                bestuurslaag: options.bestuurslaag,
                error: errorMsg,
            }, 'Failed to fetch bevoegd gezag geometry from PDOK');

            throw new BadRequestError(
                `Failed to fetch bevoegd gezag geometry: ${errorMsg}`,
                {
                    reason: 'pdok_api_error',
                    operation: 'getBevoegdGezagGeometry',
                    code: normalizedCode,
                    bestuurslaag: options.bestuurslaag,
                    error: errorMsg,
                }
            );
        }
    }

    /**
     * Get municipality geometry by DSO identifier format
     * 
     * Extracts municipality code from DSO identifier format (e.g., "GM0106_20230101")
     * 
     * @param dsoIdentifier - DSO geometry identifier (e.g., "GM0106_20230101")
     * @returns GeoJSON geometry
     */
    async getGeometryByDSOIdentifier(dsoIdentifier: string): Promise<Geometry> {
        // Parse DSO identifier: GM0106_20230101, PV30_20230101, WS15_20230101, etc.
        const match = dsoIdentifier.match(/^((?:GM|PV|WS|RK)\d+)_(\d{8})/);
        
        if (!match) {
            throw new BadRequestError(
                `Invalid DSO identifier format: ${dsoIdentifier}. Expected format: {prefix}{code}_YYYYMMDD`,
                {
                    reason: 'invalid_dso_identifier_format',
                    operation: 'getGeometryByDSOIdentifier',
                    dsoIdentifier,
                }
            );
        }

        const code = match[1]; // GM0106, PV30, etc.
        const dateStr = match[2]; // 20230101
        const year = parseInt(dateStr.substring(0, 4), 10); // 2023

        // Determine bestuurslaag from prefix
        let bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
        if (code.startsWith('GM')) {
            bestuurslaag = 'GEMEENTE';
        } else if (code.startsWith('PV')) {
            bestuurslaag = 'PROVINCIE';
        } else if (code.startsWith('WS')) {
            bestuurslaag = 'WATERSCHAP';
        } else if (code.startsWith('RK')) {
            bestuurslaag = 'RIJK';
        } else {
            throw new BadRequestError(
                `Unknown prefix in DSO identifier: ${dsoIdentifier}`,
                {
                    reason: 'unknown_prefix',
                    operation: 'getGeometryByDSOIdentifier',
                    dsoIdentifier,
                }
            );
        }

        return this.getBevoegdGezagGeometry({
            code,
            bestuurslaag,
            year,
        });
    }
}

// Export singleton instance
export const pdokGeometryService = new PDOKGeometryService();
