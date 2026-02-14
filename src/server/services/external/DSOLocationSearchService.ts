/**
 * DSO Location-Based Document Search Service
 * 
 * Fetches omgevingsdocumenten from the DSO API based on a geographic location.
 * Uses the /documenten/_zoek endpoint which supports geometry-based queries.
 * 
 * This is different from DSOOntsluitenService which uses the /_suggereer endpoint
 * for text-based queries. This service finds documents applicable to a specific location.
 * 
 * API Documentation: https://developer.omgevingswet.overheid.nl/api-register/api/omgevingsinformatie-ontsluiten/
 */

import { AxiosInstance, AxiosError } from 'axios';
import axios from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';
import { PDOKGeocodingService, RDCoordinates } from './PDOKGeocodingService.js';
import type { DiscoveredDocument } from './DSOOntsluitenService.js';
import type { Point, Geometry } from 'geojson';
import { buildDsoPublicUrl } from '../../utils/dsoUrlBuilder.js';
import { isApiEndpoint } from '../../utils/urlNormalizer.js';
import { ServiceUnavailableError, BadRequestError } from '../../types/errors.js';
import { roundGeometryCoordinates } from '../../utils/geometryPrecision.js';
import { calculateGeometryArea, getPoleOfInaccessibility } from '../../utils/geometryArea.js';

/**
 * Validate geometry for DSO API requirements
 * 
 * Validates that geometry meets DSO API requirements:
 * - Has valid type and coordinates
 * - Coordinates are within RD bounds (Netherlands)
 * - Polygon geometries are properly closed
 * - No NaN or Infinity values
 * 
 * @param geometry - GeoJSON geometry to validate
 * @returns Validation result with error details if invalid
 */
function validateGeometryForDSO(geometry: Geometry): { 
    valid: boolean; 
    error?: string; 
    details?: Record<string, unknown> 
} {
    // Check basic structure
    if (!geometry || !geometry.type) {
        return {
            valid: false,
            error: 'Geometry is missing type property',
            details: { geometry }
        };
    }

    // GeometryCollection doesn't have coordinates property
    if (geometry.type === 'GeometryCollection') {
        return {
            valid: false,
            error: 'GeometryCollection is not supported for DSO API',
            details: { geometryType: geometry.type }
        };
    }

    // Type guard: after checking for GeometryCollection, we know it has coordinates
    const geometryWithCoords = geometry as Exclude<Geometry, { type: 'GeometryCollection' }>;
    if (!geometryWithCoords.coordinates || !Array.isArray(geometryWithCoords.coordinates)) {
        return {
            valid: false,
            error: 'Geometry is missing coordinates array',
            details: { geometryType: geometry.type }
        };
    }

    // RD coordinate bounds for Netherlands (approximate)
    // X (easting): roughly 0-300000
    // Y (northing): roughly 300000-650000
    const RD_X_MIN = -5000; // Allow some margin
    const RD_X_MAX = 350000;
    const RD_Y_MIN = 250000;
    const RD_Y_MAX = 700000;

    /**
     * Validate a coordinate pair
     */
    const validateCoordinate = (coord: number[], path: string): { valid: boolean; error?: string } => {
        if (coord.length < 2) {
            return { valid: false, error: `Coordinate at ${path} has less than 2 values` };
        }

        const [x, y] = coord;
        
        if (typeof x !== 'number' || typeof y !== 'number') {
            return { valid: false, error: `Coordinate at ${path} contains non-numeric values` };
        }

        if (isNaN(x) || isNaN(y)) {
            return { valid: false, error: `Coordinate at ${path} contains NaN values` };
        }

        if (!isFinite(x) || !isFinite(y)) {
            return { valid: false, error: `Coordinate at ${path} contains Infinity values` };
        }

        // Check RD bounds
        if (x < RD_X_MIN || x > RD_X_MAX) {
            return { 
                valid: false, 
                error: `X coordinate ${x} is out of RD bounds (${RD_X_MIN} to ${RD_X_MAX})` 
            };
        }

        if (y < RD_Y_MIN || y > RD_Y_MAX) {
            return { 
                valid: false, 
                error: `Y coordinate ${y} is out of RD bounds (${RD_Y_MIN} to ${RD_Y_MAX})` 
            };
        }

        return { valid: true };
    };

    /**
     * Recursively validate coordinates based on geometry type
     */
    const validateCoordinates = (coords: unknown, path: string = 'root'): { valid: boolean; error?: string } => {
        if (!Array.isArray(coords)) {
            return { valid: false, error: `Coordinates at ${path} is not an array` };
        }

        if (geometry.type === 'Point') {
            return validateCoordinate(coords as number[], path);
        }

        if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
            const coordsArray = coords as number[][];
            if (coordsArray.length < 2) {
                return { valid: false, error: `${geometry.type} requires at least 2 coordinates` };
            }
            for (let i = 0; i < coordsArray.length; i++) {
                const result = validateCoordinate(coordsArray[i], `${path}[${i}]`);
                if (!result.valid) {
                    return result;
                }
            }
            return { valid: true };
        }

        if (geometry.type === 'Polygon') {
            const rings = coords as number[][][];
            if (rings.length === 0) {
                return { valid: false, error: 'Polygon requires at least one ring' };
            }
            
            for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
                const ring = rings[ringIndex];
                if (!Array.isArray(ring) || ring.length < 4) {
                    return { 
                        valid: false, 
                        error: `Polygon ring ${ringIndex} must have at least 4 coordinates (closed ring)` 
                    };
                }
                
                // Check if ring is closed (first and last coordinate must be the same)
                const first = ring[0];
                const last = ring[ring.length - 1];
                if (first.length >= 2 && last.length >= 2) {
                    const tolerance = 0.001; // Allow small floating point differences
                    const xDiff = Math.abs(first[0] - last[0]);
                    const yDiff = Math.abs(first[1] - last[1]);
                    if (xDiff > tolerance || yDiff > tolerance) {
                        return { 
                            valid: false, 
                            error: `Polygon ring ${ringIndex} is not closed (first and last coordinates differ: [${first[0]}, ${first[1]}] vs [${last[0]}, ${last[1]}])` 
                        };
                    }
                }
                
                // Validate all coordinates in ring
                for (let coordIndex = 0; coordIndex < ring.length; coordIndex++) {
                    const result = validateCoordinate(ring[coordIndex], `${path}[${ringIndex}][${coordIndex}]`);
                    if (!result.valid) {
                        return result;
                    }
                }
            }
            return { valid: true };
        }

        if (geometry.type === 'MultiPolygon') {
            const polygons = coords as number[][][][];
            if (polygons.length === 0) {
                return { valid: false, error: 'MultiPolygon requires at least one polygon' };
            }
            
            for (let polyIndex = 0; polyIndex < polygons.length; polyIndex++) {
                const polygon = polygons[polyIndex];
                if (!Array.isArray(polygon) || polygon.length === 0) {
                    return { 
                        valid: false, 
                        error: `MultiPolygon polygon ${polyIndex} must have at least one ring` 
                    };
                }
                
                // Validate each ring in the polygon
                for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
                    const ring = polygon[ringIndex];
                    if (!Array.isArray(ring) || ring.length < 4) {
                        return { 
                            valid: false, 
                            error: `MultiPolygon polygon ${polyIndex} ring ${ringIndex} must have at least 4 coordinates (closed ring)` 
                        };
                    }
                    
                    // Validate all coordinates in ring
                    for (let coordIndex = 0; coordIndex < ring.length; coordIndex++) {
                        const result = validateCoordinate(ring[coordIndex], `${path}[${polyIndex}][${ringIndex}][${coordIndex}]`);
                        if (!result.valid) {
                            return { valid: false, error: `MultiPolygon polygon ${polyIndex} ring ${ringIndex}: ${result.error}` };
                        }
                    }
                }
            }
            return { valid: true };
        }

        // For other types, do basic validation
        if (Array.isArray(coords) && coords.length > 0) {
            const firstItem = coords[0];
            if (Array.isArray(firstItem) && firstItem.length >= 2 && typeof firstItem[0] === 'number') {
                // Looks like coordinates, validate first one
                return validateCoordinate(firstItem as number[], `${path}[0]`);
            }
        }

        return { valid: true }; // Unknown type, let API validate
    };

    const coordValidation = validateCoordinates(geometryWithCoords.coordinates);
    if (!coordValidation.valid) {
        return {
            valid: false,
            error: coordValidation.error || 'Invalid geometry coordinates',
            details: {
                geometryType: geometry.type,
                coordinateCount: Array.isArray(geometryWithCoords.coordinates) ? geometryWithCoords.coordinates.length : 0
            }
        };
    }

    return { valid: true };
}

/**
 * Ensure Polygon geometries are properly closed
 * 
 * DSO API requires Polygon rings to be closed (first coordinate = last coordinate).
 * This function ensures all polygon rings are closed by adding the first coordinate
 * as the last coordinate if needed.
 * 
 * @param geometry - GeoJSON geometry
 * @returns Geometry with closed polygons
 */
function ensurePolygonClosed(geometry: Geometry): Geometry {
    if (geometry.type === 'GeometryCollection') {
        return geometry; // Cannot close GeometryCollection
    }
    if (geometry.type === 'Polygon') {
        const geometryWithCoords = geometry as Exclude<Geometry, { type: 'GeometryCollection' }>;
        const rings = geometryWithCoords.coordinates as number[][][];
        const closedRings = rings.map(ring => {
            if (ring.length < 4) {
                return ring; // Too few coordinates, can't close
            }
            
            const first = ring[0];
            const last = ring[ring.length - 1];
            
            // Check if ring is already closed (within tolerance)
            const tolerance = 0.001;
            const xDiff = Math.abs(first[0] - last[0]);
            const yDiff = Math.abs(first[1] - last[1]);
            
            if (xDiff <= tolerance && yDiff <= tolerance) {
                return ring; // Already closed
            }
            
            // Close the ring by adding first coordinate as last
            return [...ring, [first[0], first[1]]];
        });
        
        return {
            ...geometry,
            coordinates: closedRings,
        };
    }
    
    if (geometry.type === 'MultiPolygon') {
        const geometryWithCoords = geometry as Exclude<Geometry, { type: 'GeometryCollection' }>;
        const polygons = geometryWithCoords.coordinates as number[][][][];
        const closedPolygons = polygons.map(polygon => {
            return polygon.map(ring => {
                if (ring.length < 4) {
                    return ring;
                }
                
                const first = ring[0];
                const last = ring[ring.length - 1];
                
                const tolerance = 0.001;
                const xDiff = Math.abs(first[0] - last[0]);
                const yDiff = Math.abs(first[1] - last[1]);
                
                if (xDiff <= tolerance && yDiff <= tolerance) {
                    return ring;
                }
                
                return [...ring, [first[0], first[1]]];
            });
        });
        
        return {
            ...geometry,
            coordinates: closedPolygons,
        };
    }
    
    // For other geometry types, return as-is
    return geometry;
}

/**
 * Search parameters for location-based document search
 */
export interface LocationSearchParams {
    /** Address to search (will be geocoded if coordinates not provided) */
    address?: string;
    /** Pre-computed RD coordinates (overrides address geocoding) */
    coordinates?: RDCoordinates;
    /** Filter by government level */
    bestuurslaag?: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    /** Filter documents by validity date (default: today) */
    geldigOp?: string;
    /** Include future valid documents */
    inclusiefToekomstigGeldig?: boolean;
    /** Maximum results to return (default: 100, max: 200) */
    maxResults?: number;
}

/**
 * DSO Document from /_zoek endpoint
 */
export interface DSODocument {
    identificatie: string;
    uriIdentificatie: string;
    versie: number;
    titel: string;
    type: string;
    aangeleverdDoorEen?: {
        bestuurslaag: string;
        code: string;
        naam: string;
    };
    inwerkingVanaf?: string;
    geldigVanaf?: string;
    geldigTot?: string;
    beschikbaarVanaf?: string;
    heeftVectorTiles?: boolean;
    omgevingsdocumentMetadata?: {
        expressionId?: string;
        isOntwerp?: boolean;
        isToekomstig?: boolean;
        publicatiedatum?: string;
        publicatieUrl?: string;
        status?: string;
    };
    imroDocumentMetadata?: {
        regelStatus?: string;
        planstatusInfo?: {
            planstatus: string;
            datum: string;
        };
        statusDossier?: string;
        isTamPlan?: boolean;
        isHistorisch?: boolean;
    };
    _links?: {
        self?: { href: string };
    };
}

/**
 * DSO API response format for /_zoek endpoint
 */
interface DSOSearchResponse {
    _embedded: {
        documenten: DSODocument[];
    };
    _links: {
        self?: { href: string };
        next?: { href: string };
        prev?: { href: string };
        first?: { href: string };
        last?: { href: string };
    };
    page: {
        size: number;
        totalElements: number;
        totalPages: number;
        number: number;
    };
}

/**
 * Search result with location context
 */
export interface LocationSearchResult {
    documents: DiscoveredDocument[];
    totalFound: number;
    /** Total documents after client-side filtering (if municipality code filter applied) */
    totalFiltered?: number;
    location: {
        address?: string;
        coordinates: RDCoordinates;
    };
    searchParams: {
        geldigOp?: string;
        bestuurslaag?: string;
    };
}

/**
 * Service for location-based DSO document searches
 */
export class DSOLocationSearchService {
    private client: AxiosInstance;
    private baseUrl: string;
    private apiKey: string;
    private useProduction: boolean;
    private geocodingService: PDOKGeocodingService;

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

        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD,
            headers: {
                'X-API-KEY': this.apiKey,
                'Accept': 'application/hal+json',
                'Content-Type': 'application/json',
                'Content-Crs': 'http://www.opengis.net/def/crs/EPSG/0/28992',
            },
        });

        this.geocodingService = new PDOKGeocodingService();
    }

    /**
     * Check if DSO API is configured
     */
    static isConfigured(useProduction: boolean = false): boolean {
        const apiKey = useProduction
            ? process.env.DSO_PROD_KEY
            : process.env.DSO_PREPROD_KEY;
        return !!apiKey;
    }

    /**
     * Search for documents at a specific location
     * 
     * @param params - Search parameters including address or coordinates
     * @returns Search results with discovered documents
     */
    async searchByLocation(params: LocationSearchParams): Promise<LocationSearchResult> {
        // Resolve coordinates (either from params or by geocoding address)
        let coordinates: RDCoordinates;
        let address: string | undefined = params.address;

        if (params.coordinates) {
            coordinates = params.coordinates;
            logger.debug({ coordinates }, 'Using provided coordinates for location search');
        } else if (params.address) {
            const geocodeResult = await this.geocodingService.geocode(params.address);
            coordinates = geocodeResult.coordinates;
            address = geocodeResult.displayName;
            logger.info({ 
                inputAddress: params.address, 
                resolvedAddress: address, 
                coordinates 
            }, 'Geocoded address for DSO location search');
        } else {
            throw new BadRequestError('Either address or coordinates must be provided for location search', {
                reason: 'missing_location_parameters',
                operation: 'searchByLocation',
                params: { address: params.address, coordinates: params.coordinates }
            });
        }

        // Build request body for /_zoek endpoint
        const requestBody: {
            geometrie: Point;
            bestuurslaag?: string;
        } = {
            geometrie: PDOKGeocodingService.toGeoJsonPoint(coordinates),
        };

        if (params.bestuurslaag) {
            requestBody.bestuurslaag = params.bestuurslaag;
        }

        // Build query parameters
        const queryParams: Record<string, string | number | boolean> = {
            size: Math.min(params.maxResults || 100, 200),
        };

        if (params.geldigOp) {
            queryParams.geldigOp = params.geldigOp;
        }

        if (params.inclusiefToekomstigGeldig) {
            queryParams.inclusiefToekomstigGeldig = params.inclusiefToekomstigGeldig;
        }

        const endpoint = '/documenten/_zoek';
        const fullUrl = `${this.baseUrl}${endpoint}`;

        logger.info({
            endpoint,
            coordinates,
            bestuurslaag: params.bestuurslaag,
            environment: this.useProduction ? 'production' : 'preproduction',
        }, 'Searching DSO for documents at location');

        try {
            const response = await this.client.post<DSOSearchResponse>(
                endpoint,
                requestBody,
                {
                    params: queryParams,
                    headers: {
                        'Content-Crs': 'http://www.opengis.net/def/crs/EPSG/0/28992',
                    },
                }
            );

            const { documenten } = response.data._embedded;
            const { totalElements } = response.data.page;

            logger.info({
                foundDocuments: documenten.length,
                totalElements,
                address,
                coordinates,
            }, 'DSO location search completed');

            // Map to canonical DiscoveredDocument format
            const documents = documenten.map(doc => this.mapToDiscoveredDocument(doc));

            return {
                documents,
                totalFound: totalElements,
                location: {
                    address,
                    coordinates,
                },
                searchParams: {
                    geldigOp: params.geldigOp,
                    bestuurslaag: params.bestuurslaag,
                },
            };
        } catch (error) {
            this.handleError(error, fullUrl, requestBody);
            throw error;  // Re-throw after logging
        }
    }

    /**
     * Search for documents at Europalaan 6D, 's-Hertogenbosch (fixed location)
     * 
     * Convenience method for the predefined workflow location.
     */
    async searchAtEuropalaan(params?: Omit<LocationSearchParams, 'address' | 'coordinates'>): Promise<LocationSearchResult> {
        return this.searchByLocation({
            address: "Europalaan 6D, 's-Hertogenbosch",
            ...params,
        });
    }

    /**
     * Search all documents by geometry with pagination
     * 
     * Fetches all pages of results from /documenten/_zoek endpoint and optionally
     * filters by municipality code client-side. Always includes bestuurslaag=GEMEENTE
     * to avoid duplicates from other government levels.
     * 
     * @param geometry - GeoJSON geometry in RD format (EPSG:28992)
     * @param municipalityCode - Optional municipality code for client-side filtering (e.g., "gm0301")
     * @param options - Search options
     * @returns All documents matching the geometry (and municipality code if provided)
     */
    async searchAllByGeometry(
        geometry: Geometry,
        bevoegdgezagCode?: string,
        options?: {
            bestuurslaag?: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
            geldigOp?: string;
            inclusiefToekomstigGeldig?: boolean;
            maxPages?: number;  // Safety limit (default: 100 pages = 20,000 documents)
        }
    ): Promise<LocationSearchResult> {
        // Use provided bestuurslaag or default to GEMEENTE
        const bestuurslaag = options?.bestuurslaag || 'GEMEENTE';
        // Safety limit for pagination (100 pages = 20,000 documents)
        // Pagination will stop naturally when _links.next is null/undefined
        const maxPages = options?.maxPages || 100;
        const pageSize = 200; // Maximum page size

        // Validate geometry before sending to DSO API
        const geometryValidation = validateGeometryForDSO(geometry);
        if (!geometryValidation.valid) {
            const errorMessage = `Invalid geometry for DSO API: ${geometryValidation.error}`;
            logger.error({
                geometryType: geometry.type,
                error: geometryValidation.error,
                details: geometryValidation.details,
            }, 'Geometry validation failed before DSO API call');
            throw new BadRequestError(errorMessage, {
                reason: 'invalid_geometry',
                geometryType: geometry.type,
                validationError: geometryValidation.error,
                details: geometryValidation.details,
            });
        }

        // Check geometry area - DSO API has maximum area limit (99 km² = 99,000,000 m²)
        // If geometry is too large, use centroid as fallback
        const MAX_AREA_M2 = 99_000_000; // 99 km²
        const geometryArea = calculateGeometryArea(geometry);
        
        let searchGeometry: Geometry;
        
        if (geometryArea > MAX_AREA_M2) {
            logger.warn({
                bevoegdgezagCode,
                geometryArea: geometryArea.toFixed(2),
                maxArea: MAX_AREA_M2,
                geometryType: geometry.type,
            }, 'Geometry area exceeds DSO API maximum, using pole of inaccessibility as fallback');
            
            // Use pole of inaccessibility instead of centroid - guaranteed to be inside the geometry
            // Precision: 500m grid for accurate POI calculation
            const poi = getPoleOfInaccessibility(geometry, 500);
            if (!poi) {
                throw new BadRequestError(
                    `Geometry area (${(geometryArea / 1_000_000).toFixed(2)} km²) exceeds DSO API maximum (99 km²) and pole of inaccessibility could not be calculated`,
                    {
                        reason: 'geometry_too_large',
                        geometryArea: geometryArea,
                        maxArea: MAX_AREA_M2,
                        geometryType: geometry.type,
                    }
                );
            }
            
            // Round POI coordinates to 3 decimal places (DSO API requirement)
            const roundedPoi = roundGeometryCoordinates(poi, 3) as { type: 'Point'; coordinates: [number, number] };
            searchGeometry = roundedPoi;
            logger.info({
                bevoegdgezagCode,
                originalArea: geometryArea.toFixed(2),
                fallback: 'pole_of_inaccessibility',
                poi: roundedPoi.coordinates,
            }, 'Using pole of inaccessibility as fallback for large geometry (guaranteed inside area)');
        } else {
            // Ensure Polygon geometries are properly closed before rounding
            // DSO API requires closed polygons (first coordinate = last coordinate)
            const closedGeometry = ensurePolygonClosed(geometry);
            
            // Round geometry coordinates to 3 decimal places (DSO API requirement)
            // API documentation: "In deze API dienen geometrieën altijd in RD-formaat gebruikt te worden, met maximaal drie decimalen."
            searchGeometry = roundGeometryCoordinates(closedGeometry, 3);
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

        if (options?.geldigOp) {
            queryParams.geldigOp = options.geldigOp;
        }

        if (options?.inclusiefToekomstigGeldig) {
            queryParams.inclusiefToekomstigGeldig = options.inclusiefToekomstigGeldig;
        }

        const endpoint = '/documenten/_zoek';
        const allDocuments: DSODocument[] = [];
        let currentPage = 0;
        let totalElements = 0;
        let hasNextPage = true;
        let nextUrl: string | undefined;

        logger.info({
            endpoint,
            geometryType: geometry.type,
            bestuurslaag,
            bevoegdgezagCode,
            maxPages,
            environment: this.useProduction ? 'production' : 'preproduction',
        }, 'Starting paginated DSO geometry search');

        try {
            // Pagination loop: fetch all pages exhaustively until _links.next is null/undefined
            // maxPages is a safety limit to prevent infinite loops
            while (hasNextPage && currentPage < maxPages) {
                logger.debug({
                    page: currentPage,
                    nextUrl: !!nextUrl,
                    documentsCollected: allDocuments.length,
                }, 'Fetching DSO search page');

                let response: { data: DSOSearchResponse };

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

                response = await this.client.post<DSOSearchResponse>(
                    endpoint,
                    requestBody,
                    {
                        params: queryParams,
                        headers: {
                            'Content-Crs': 'http://www.opengis.net/def/crs/EPSG/0/28992',
                        },
                    }
                );

                const { documenten } = response.data._embedded;
                const { totalElements: pageTotalElements, number: responsePageNumber } = response.data.page;
                const { next } = response.data._links;

                // Accumulate documents
                allDocuments.push(...documenten);

                // Update total (should be same across all pages, but use latest)
                totalElements = pageTotalElements;

                // Check if there's a next page - exhaustively iterate until no more pages
                if (next?.href) {
                    nextUrl = next.href;
                    currentPage = responsePageNumber + 1; // Use actual page number from response + 1 for next iteration
                    hasNextPage = true;
                } else {
                    // No more pages - pagination complete
                    hasNextPage = false;
                    logger.info({
                        page: responsePageNumber,
                        totalPages: responsePageNumber + 1,
                        totalDocuments: allDocuments.length,
                        totalElements,
                    }, 'Reached end of pagination - no more pages available');
                }

                logger.debug({
                    page: currentPage,
                    documentsOnPage: documenten.length,
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
                    bevoegdgezagCode,
                    paginationComplete: !hasNextPage,
                }, 'Completed exhaustive paginated DSO geometry search');
            }

            // Client-side filtering by bevoegd gezag code
            let filteredDocuments = allDocuments;
            let totalFiltered = totalElements;

            if (bevoegdgezagCode) {
                // Normalize bevoegd gezag code for comparison (handles various formats)
                const normalizedCode = bevoegdgezagCode.toLowerCase().trim();
                
                // Track documents without code for monitoring
                let documentsWithoutCode = 0;
                
                filteredDocuments = allDocuments.filter(doc => {
                    const docCode = doc.aangeleverdDoorEen?.code?.toLowerCase().trim();
                    
                    // If document has no code, exclude it (but log for monitoring)
                    if (!docCode) {
                        documentsWithoutCode++;
                        return false;
                    }
                    
                    // Match exact code or code without prefix
                    // Normalize both codes to standard format before comparing
                    // Municipality codes are always 4 digits (e.g., "gm0197", "0197", "197" all represent the same)
                    // But "0736" and "736" are different municipalities
                    const normalizedCodeNoPrefix = normalizedCode.replace(/^gm|^pv|^ws|^rk/i, '');
                    const docCodeNoPrefix = docCode.replace(/^gm|^pv|^ws|^rk/i, '');
                    
                    // Determine bestuurslaag from prefix to know padding length
                    const normalizedPrefix = normalizedCode.match(/^(gm|pv|ws|rk)/i)?.[1]?.toLowerCase() || '';
                    const docPrefix = docCode.match(/^(gm|pv|ws|rk)/i)?.[1]?.toLowerCase() || '';
                    
                    // Normalize to standard length based on prefix
                    // GEMEENTE: 4 digits, PROVINCIE: 2 digits, WATERSCHAP/RIJK: 3 digits
                    let normalizedPadded: string;
                    let docPadded: string;
                    
                    if (normalizedPrefix === 'gm' || (!normalizedPrefix && bestuurslaag === 'GEMEENTE')) {
                        normalizedPadded = normalizedCodeNoPrefix.padStart(4, '0');
                        docPadded = (docPrefix === 'gm' || !docPrefix) ? docCodeNoPrefix.padStart(4, '0') : docCodeNoPrefix;
                    } else if (normalizedPrefix === 'pv' || (!normalizedPrefix && bestuurslaag === 'PROVINCIE')) {
                        normalizedPadded = normalizedCodeNoPrefix.padStart(2, '0');
                        docPadded = (docPrefix === 'pv' || !docPrefix) ? docCodeNoPrefix.padStart(2, '0') : docCodeNoPrefix;
                    } else {
                        normalizedPadded = normalizedCodeNoPrefix.padStart(3, '0');
                        docPadded = (docPrefix === 'ws' || docPrefix === 'rk' || !docPrefix) ? docCodeNoPrefix.padStart(3, '0') : docCodeNoPrefix;
                    }
                    
                    // Exact matches (with or without prefix)
                    if (docCode === normalizedCode || 
                        docCode === normalizedCodeNoPrefix ||
                        normalizedCode === docCode ||
                        normalizedCodeNoPrefix === docCode ||
                        normalizedCodeNoPrefix === docCodeNoPrefix) {
                        return true;
                    }
                    
                    // Match if normalized codes are the same
                    if (normalizedPadded === docPadded) {
                        return true;
                    }
                    
                    return false;
                });

                totalFiltered = filteredDocuments.length;

                // Log documents without code for monitoring
                if (documentsWithoutCode > 0) {
                    logger.warn({
                        bevoegdgezagCode: normalizedCode,
                        documentsWithoutCode,
                        totalBeforeFilter: allDocuments.length,
                        totalAfterFilter: filteredDocuments.length,
                    }, 'Some documents were filtered out because they lack aangeleverdDoorEen.code - this may indicate data quality issues in DSO API');
                }

                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    totalBeforeFilter: allDocuments.length,
                    totalAfterFilter: filteredDocuments.length,
                    documentsWithoutCode,
                }, 'Applied client-side bevoegd gezag code filter');
            }

            // Map to canonical DiscoveredDocument format
            const documents = filteredDocuments.map(doc => this.mapToDiscoveredDocument(doc));

            // Extract coordinates from geometry for location info
            let coordinates: RDCoordinates | undefined;
            if (geometry.type === 'Point') {
                const pointGeometry = geometry as Point;
                if (pointGeometry.coordinates.length >= 2) {
                    coordinates = {
                        x: pointGeometry.coordinates[0] as number,
                        y: pointGeometry.coordinates[1] as number,
                    };
                }
            }

            return {
                documents,
                totalFound: totalElements,
                totalFiltered: bevoegdgezagCode ? totalFiltered : undefined,
                location: {
                    coordinates: coordinates || { x: 0, y: 0 }, // Fallback if not Point geometry
                },
                searchParams: {
                    geldigOp: options?.geldigOp,
                    bestuurslaag,
                },
            };
        } catch (error) {
            this.handleError(error, `${this.baseUrl}${endpoint}`, requestBody);
            throw error;
        }
    }

    /**
     * Map DSO document to canonical DiscoveredDocument format
     */
    private mapToDiscoveredDocument(doc: DSODocument): DiscoveredDocument {
        // Determine document status
        const isOntwerp = doc.omgevingsdocumentMetadata?.isOntwerp || false;
        const planstatus = doc.imroDocumentMetadata?.planstatusInfo?.planstatus;
        const statusDossier = doc.imroDocumentMetadata?.statusDossier;

        // Build status string for match explanation
        let statusInfo = '';
        if (isOntwerp) {
            statusInfo = 'Ontwerp';
        } else if (planstatus) {
            statusInfo = planstatus;
            if (statusDossier) {
                statusInfo += ` - ${statusDossier}`;
            }
        } else if (doc.geldigVanaf) {
            statusInfo = `Geldend sinds ${doc.geldigVanaf}`;
        }

        // Generate URL - always construct from identificatie, never use _links.self.href (it's an API endpoint)
        let url: string;
        
        // Priority 1: Use publicatieUrl if it's a public URL (not an API endpoint)
        if (doc.omgevingsdocumentMetadata?.publicatieUrl && 
            !isApiEndpoint(doc.omgevingsdocumentMetadata.publicatieUrl)) {
            url = doc.omgevingsdocumentMetadata.publicatieUrl;
        } else {
            // Priority 2: Construct from identificatie using URL builder
            try {
                url = buildDsoPublicUrl(doc.identificatie);
            } catch (error) {
                logger.warn(
                    { error, identificatie: doc.identificatie },
                    'Failed to build DSO public URL from identificatie, using fallback'
                );
                // Fallback: construct basic URL (should not happen in normal operation)
                url = `https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/${encodeURIComponent(doc.identificatie)}`;
            }
        }

        // Determine document category based on type
        const documentCategory = this.categorizeDocument(doc.type);

        return {
            title: doc.titel || 'Omgevingsdocument',
            url,
            summary: undefined,  // DSO API doesn't provide summaries
            documentCategory,
            documentType: doc.type,
            sourceType: 'DSO',
            sourceId: doc.identificatie,
            issuingAuthority: doc.aangeleverdDoorEen?.naam,
            publicationDate: doc.omgevingsdocumentMetadata?.publicatiedatum ||
                doc.imroDocumentMetadata?.planstatusInfo?.datum,
            authorityScore: 1.0,  // DSO is authoritative
            matchSignals: {
                metadata: 1.0,
            },
            metadata: {
                ...doc.aangeleverdDoorEen && { aangeleverdDoorEen: doc.aangeleverdDoorEen },
                geldigVanaf: doc.geldigVanaf,
                geldigTot: doc.geldigTot,
                inwerkingVanaf: doc.inwerkingVanaf,
                beschikbaarVanaf: doc.beschikbaarVanaf,
                ...doc.omgevingsdocumentMetadata && { omgevingsdocumentMetadata: doc.omgevingsdocumentMetadata },
                ...doc.imroDocumentMetadata && { imroDocumentMetadata: doc.imroDocumentMetadata },
                // Store municipality code and authority information for filtering and storage
                ...(doc.aangeleverdDoorEen && {
                    aangeleverdDoorEen: {
                        code: doc.aangeleverdDoorEen.code,
                        naam: doc.aangeleverdDoorEen.naam,
                        bestuurslaag: doc.aangeleverdDoorEen.bestuurslaag,
                    },
                }),
            },
            matchExplanation: this.buildMatchExplanation(doc, statusInfo),
            provenance: [{
                sourceType: 'DSO',
                url,
                fetchedAt: new Date().toISOString(),
            }],
        };
    }

    /**
     * Categorize document based on type
     */
    private categorizeDocument(type: string): 'policy' | 'official_publication' | 'jurisprudence' | 'guidance' | 'unverified_external' {
        const policyTypes = [
            'omgevingsplan',
            'omgevingsvisie',
            'omgevingsverordening',
            'bestemmingsplan',
            'voorbereidingsbesluit',
            'programma',
            'structuurvisie',
            'projectbesluit',
        ];

        if (policyTypes.some(t => type.toLowerCase().includes(t.toLowerCase()))) {
            return 'policy';
        }

        return 'official_publication';
    }

    /**
     * Build explanation for why document matched
     */
    private buildMatchExplanation(doc: DSODocument, statusInfo: string): string {
        const parts: string[] = [];

        parts.push(`${doc.type} van ${doc.aangeleverdDoorEen?.naam || 'onbekend bevoegd gezag'}`);

        if (statusInfo) {
            parts.push(`(${statusInfo})`);
        }

        if (doc.aangeleverdDoorEen?.bestuurslaag) {
            parts.push(`[${doc.aangeleverdDoorEen.bestuurslaag}]`);
        }

        return parts.join(' ');
    }

    /**
     * Handle and log API errors
     */
    private handleError(error: unknown, url: string, requestBody: unknown): void {
        const errorDiagnostic: Record<string, unknown> = {
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            requestUrl: url,
            requestBody,
            environment: this.useProduction ? 'production' : 'preproduction',
            apiKeyConfigured: !!this.apiKey,
        };

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const responseData = axiosError.response?.data;
            const status = axiosError.response?.status;
            
            errorDiagnostic.axiosError = {
                status,
                statusText: axiosError.response?.statusText,
                responseData,
                responseHeaders: axiosError.response?.headers,
            };

            // Special handling for 422 errors - log detailed response
            if (status === 422) {
                const responseMessage = typeof responseData === 'object' && responseData !== null
                    ? JSON.stringify(responseData, null, 2)
                    : String(responseData);
                
                logger.error({
                    service: 'DSOLocationSearch',
                    ...errorDiagnostic,
                    note: '422 Unprocessable Entity - DSO API rejected the geometry. Check responseData for details.',
                    responseMessage,
                }, 'DSO API returned 422 - geometry validation failed');
            } else {
                logger.error({
                    service: 'DSOLocationSearch',
                    ...errorDiagnostic,
                }, 'DSO location search failed');
            }
        } else {
            logger.error({
                service: 'DSOLocationSearch',
                ...errorDiagnostic,
            }, 'DSO location search failed');
        }
    }
}

