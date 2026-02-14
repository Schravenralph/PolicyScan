/**
 * PDOK Geocoding Service
 * 
 * Converts Dutch addresses to coordinates using the PDOK Locatieserver API.
 * Returns coordinates in Rijksdriehoekstelsel (EPSG:28992) format required by DSO APIs.
 * 
 * API Documentation: https://pdok.nl/locatieserver
 */

import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { logger } from '../../utils/logger.js';
import { AxiosInstance } from 'axios';
import type { Point } from 'geojson';
import { NotFoundError, BadRequestError } from '../../types/errors.js';

/**
 * RD Coordinates (Rijksdriehoekstelsel / EPSG:28992)
 */
export interface RDCoordinates {
    x: number;  // Easting (X coordinate)
    y: number;  // Northing (Y coordinate)
}

/**
 * Geocoding result with address details and coordinates
 */
export interface GeocodingResult {
    address: string;
    displayName: string;
    coordinates: RDCoordinates;
    confidence: number;  // 0-1, higher is better
    type: string;  // 'adres', 'postcode', 'woonplaats', etc.
}

/**
 * Pre-computed coordinates for known locations
 * These are hardcoded to avoid API calls for fixed workflow locations
 * 
 * Coordinates verified via PDOK Locatieserver API on 2026-01-13
 */
const KNOWN_LOCATIONS: Record<string, RDCoordinates> = {
    // Ruimtemeesters company location: Europalaan 6D, 5232BC 's-Hertogenbosch
    // PDOK result: POINT(151800.614 413620.371)
    'europalaan 6d, s-hertogenbosch': { x: 151801, y: 413620 },
    'europalaan 6d, \'s-hertogenbosch': { x: 151801, y: 413620 },
    'europalaan 6d s-hertogenbosch': { x: 151801, y: 413620 },
    'europalaan 6d \'s-hertogenbosch': { x: 151801, y: 413620 },
    // With postal code
    'europalaan 6d, 5232bc s-hertogenbosch': { x: 151801, y: 413620 },
    'europalaan 6d, 5232bc \'s-hertogenbosch': { x: 151801, y: 413620 },
};

/**
 * PDOK Locatieserver API response format
 */
interface PDOKResponse {
    response: {
        numFound: number;
        start: number;
        maxScore: number;
        docs: PDOKDocument[];
    };
}

interface PDOKDocument {
    id: string;
    type: string;
    weergavenaam: string;
    score: number;
    centroide_rd?: string;  // "POINT(x y)" format
    centroide_ll?: string;  // "POINT(lon lat)" format for WGS84
    gemeentenaam?: string;  // Municipality name
    woonplaatsnaam?: string;  // City/town name
}

/**
 * Service for geocoding Dutch addresses to RD coordinates
 */
export class PDOKGeocodingService {
    private client: AxiosInstance;
    private baseUrl = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

    constructor() {
        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD,
            headers: {
                'Accept': 'application/json',
            },
        });
    }

    /**
     * Geocode an address to RD coordinates
     * 
     * First checks known locations cache, then falls back to PDOK API.
     * 
     * @param address - Dutch address to geocode
     * @returns Geocoding result with RD coordinates
     * @throws Error if geocoding fails or no results found
     */
    async geocode(address: string): Promise<GeocodingResult> {
        const normalizedAddress = address.toLowerCase().trim();
        
        // Check known locations first (for hardcoded workflow locations)
        const knownCoords = KNOWN_LOCATIONS[normalizedAddress];
        if (knownCoords) {
            logger.debug({ address, coordinates: knownCoords }, 'Using pre-computed coordinates for known location');
            return {
                address: address,
                displayName: address,
                coordinates: knownCoords,
                confidence: 1.0,
                type: 'known_location',
            };
        }

        // Call PDOK API
        logger.debug({ address }, 'Geocoding address via PDOK Locatieserver');

        try {
            const response = await this.client.get<PDOKResponse>('/free', {
                params: {
                    q: address,
                    fq: 'type:adres OR type:postcode',  // Prefer exact address matches
                    rows: 1,
                    fl: 'id,type,weergavenaam,score,centroide_rd',
                },
            });

            const { docs } = response.data.response;

            if (!docs || docs.length === 0) {
                logger.warn({ address }, 'No geocoding results found for address');
                throw new NotFoundError('Geocoding results', address, {
                    reason: 'no_geocoding_results',
                    operation: 'geocodeAddress',
                });
            }

            const result = docs[0];

            // Parse RD coordinates from POINT(x y) format
            if (!result.centroide_rd) {
                throw new BadRequestError(`PDOK result missing RD coordinates for address: ${address}`, {
                    reason: 'missing_rd_coordinates',
                    operation: 'geocodeAddress',
                    address,
                    result: result
                });
            }

            const coordinates = this.parsePointCoordinates(result.centroide_rd);

            // Calculate confidence based on score and maximum possible score
            const maxScore = response.data.response.maxScore || result.score;
            const confidence = result.score / maxScore;

            const geocodingResult: GeocodingResult = {
                address: address,
                displayName: result.weergavenaam,
                coordinates,
                confidence,
                type: result.type,
            };

            logger.info({ 
                address, 
                result: geocodingResult,
            }, 'Successfully geocoded address');

            return geocodingResult;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ address, error: errorMsg }, 'Geocoding failed');
            throw error;
        }
    }

    /**
     * Parse WKT POINT string to RD coordinates
     * 
     * @param pointWkt - WKT string in "POINT(x y)" format
     * @returns RD coordinates
     */
    private parsePointCoordinates(pointWkt: string): RDCoordinates {
        // Parse "POINT(x y)" format
        const match = pointWkt.match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/i);
        if (!match) {
            throw new BadRequestError(`Invalid POINT WKT format: ${pointWkt}`, {
                reason: 'invalid_wkt_format',
                operation: 'parsePointCoordinates',
                pointWkt
            });
        }

        return {
            x: Math.round(parseFloat(match[1])),  // Round to nearest meter
            y: Math.round(parseFloat(match[2])),
        };
    }

    /**
     * Get RD coordinates for a known location (synchronous, no API call)
     * 
     * @param address - Address to look up
     * @returns RD coordinates if known, undefined otherwise
     */
    getKnownLocation(address: string): RDCoordinates | undefined {
        const normalizedAddress = address.toLowerCase().trim();
        return KNOWN_LOCATIONS[normalizedAddress];
    }

    /**
     * Check if a location is in the known locations cache
     * 
     * @param address - Address to check
     * @returns true if the location has pre-computed coordinates
     */
    isKnownLocation(address: string): boolean {
        const normalizedAddress = address.toLowerCase().trim();
        return normalizedAddress in KNOWN_LOCATIONS;
    }

    /**
     * Reverse geocode coordinates to get address and municipality
     * 
     * Uses PDOK Locatieserver reverse geocoding API to find the address
     * and municipality name for given RD coordinates.
     * 
     * @param coordinates - RD coordinates (EPSG:28992)
     * @returns Address and municipality name
     * @throws Error if reverse geocoding fails or no results found
     */
    async reverseGeocode(coordinates: RDCoordinates): Promise<{ address: string; municipalityName?: string }> {
        logger.debug({ coordinates }, 'Reverse geocoding coordinates via PDOK Locatieserver');

        try {
            // PDOK reverse geocoding uses the format: POINT(x y) in RD coordinates
            const pointWkt = `POINT(${coordinates.x} ${coordinates.y})`;
            
            const response = await this.client.get<PDOKResponse>('/free', {
                params: {
                    q: pointWkt,
                    fq: 'type:adres',  // Prefer address results
                    rows: 1,
                    fl: 'id,type,weergavenaam,score,gemeentenaam,woonplaatsnaam',
                },
            });

            const { docs } = response.data.response;

            if (!docs || docs.length === 0) {
                logger.warn({ coordinates }, 'No reverse geocoding results found for coordinates');
                throw new NotFoundError('Reverse geocoding results', pointWkt, {
                    reason: 'no_reverse_geocoding_results',
                    operation: 'reverseGeocode',
                });
            }

            const result = docs[0];
            const address = result.weergavenaam || pointWkt;
            
            // Extract municipality name (prefer gemeentenaam, fallback to woonplaatsnaam)
            const municipalityName = result.gemeentenaam || result.woonplaatsnaam;

            logger.info({
                coordinates,
                address,
                municipalityName,
            }, 'Successfully reverse geocoded coordinates');

            return {
                address,
                municipalityName,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error({ coordinates, error: errorMsg }, 'Reverse geocoding failed');
            throw error;
        }
    }

    /**
     * Convert RD coordinates to GeoJSON Point geometry
     * 
     * @param coordinates - RD coordinates
     * @returns GeoJSON Point geometry (for DSO API)
     */
    static toGeoJsonPoint(coordinates: RDCoordinates): Point {
        return {
            type: 'Point',
            coordinates: [coordinates.x, coordinates.y],
        };
    }
}

// Export singleton instance
export const pdokGeocodingService = new PDOKGeocodingService();

