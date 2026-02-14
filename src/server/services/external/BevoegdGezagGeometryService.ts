/**
 * Bevoegd Gezag Geometry Service
 * 
 * High-level service for retrieving bevoegd gezag geometries with DB-first, PDOK-fallback pattern.
 * Supports GEMEENTE and PROVINCIE via PDOK. WATERSCHAP and RIJK are not supported in MVP.
 * 
 * Strategy:
 * 1. Try to get geometry from database cache
 * 2. If not found, try PDOK (for supported types: GEMEENTE, PROVINCIE only)
 * 3. If PDOK fails or type is unsupported, throw clear error with user-friendly message
 * 4. Persist geometry to database for future use
 * 
 * MVP Limitations:
 * - WATERSCHAP and RIJK geometries are not available via PDOK
 * - DSO Geometry Service is non-functional (returns 400 errors for all identifiers)
 * - For WATERSCHAP/RIJK, users must provide geometry manually or use alternative workflows
 */

import { BevoegdgezagGeometryModel } from '../../models/BevoegdgezagGeometry.js';
import { PDOKGeometryService } from './PDOKGeometryService.js';
import { roundGeometryCoordinates } from '../../utils/geometryPrecision.js';
import { logger } from '../../utils/logger.js';
import type { Geometry } from 'geojson';
import { NotFoundError, BadRequestError } from '../../types/errors.js';

/**
 * Options for fetching bevoegd gezag geometry
 */
export interface BevoegdGezagGeometryFetchOptions {
    /**
     * Force refresh from external source (bypass database cache)
     */
    forceRefresh?: boolean;
    
    /**
     * Optional year for temporal filtering
     */
    year?: number;
    
    /**
     * Optional bestuurslaag (auto-inferred from code if not provided)
     */
    bestuurslaag?: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    
    /**
     * Optional naam (name) for storing in database
     */
    naam?: string;
}

/**
 * Result of fetching bevoegd gezag geometry
 */
export interface BevoegdGezagGeometryResult {
    /**
     * GeoJSON geometry in RD format (EPSG:28992)
     */
    geometry: Geometry;
    
    /**
     * Geometry identifier (e.g., "GM0106_20230101", "PV30_20230101")
     */
    geometryIdentificatie: string;
    
    /**
     * Source of the geometry
     */
    geometrySource: 'database' | 'PDOK' | 'DSO';
    
    /**
     * Bestuurslaag type
     */
    bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    
    /**
     * Bevoegd gezag name (if available)
     */
    naam?: string;
}

/**
 * Service for fetching bevoegd gezag geometries
 * 
 * MVP Implementation:
 * - Supports GEMEENTE and PROVINCIE via PDOK
 * - WATERSCHAP and RIJK are not supported (throws clear error)
 * - DSO Geometry Service fallback is disabled (non-functional in current implementation)
 * 
 * Strategy:
 * 1. Try database cache first (if not force refresh)
 * 2. If not found in database, automatically fall back to PDOK
 * 3. Persist fetched geometry to database for future use
 */
export class BevoegdGezagGeometryService {
    private pdokService: PDOKGeometryService;

    constructor(_useProduction?: boolean) {
        // Note: PDOKGeometryService doesn't need production flag, but we accept it for API consistency
        this.pdokService = new PDOKGeometryService();
    }

    /**
     * Infer bestuurslaag from bevoegd gezag code
     */
    private inferBestuurslaagFromCode(code: string): 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK' {
        const normalized = code.toLowerCase().trim();
        
        if (normalized.startsWith('gm')) {
            return 'GEMEENTE';
        } else if (normalized.startsWith('pv')) {
            return 'PROVINCIE';
        } else if (normalized.startsWith('ws')) {
            return 'WATERSCHAP';
        } else if (normalized.startsWith('rk')) {
            return 'RIJK';
        } else if (/^\d{4}$/.test(normalized)) {
            // 4 digits = municipality
            return 'GEMEENTE';
        } else if (/^\d{2}$/.test(normalized)) {
            // 2 digits = province
            return 'PROVINCIE';
        } else {
            // Default to municipality
            return 'GEMEENTE';
        }
    }

    /**
     * Normalize bevoegd gezag code
     */
    private normalizeBevoegdGezagCode(code: string, bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK'): string {
        const cleaned = code.toLowerCase().trim();
        
        // If it starts with a prefix, keep it
        const prefixMatch = cleaned.match(/^(gm|pv|ws|rk)(\d+)$/);
        if (prefixMatch) {
            const prefix = prefixMatch[1]; // First capture group is the prefix
            const number = prefixMatch[2]; // Second capture group is the number
            
            // Pad based on prefix
            if (prefix === 'gm') {
                return `${prefix}${number.padStart(4, '0')}`;
            } else if (prefix === 'pv') {
                return `${prefix}${number.padStart(2, '0')}`;
            } else {
                return `${prefix}${number.padStart(3, '0')}`;
            }
        }
        
        // If it's just a number, pad based on bestuurslaag
        if (/^\d+$/.test(cleaned)) {
            if (bestuurslaag === 'GEMEENTE') {
                return `gm${cleaned.padStart(4, '0')}`;
            } else if (bestuurslaag === 'PROVINCIE') {
                return `pv${cleaned.padStart(2, '0')}`;
            } else if (bestuurslaag === 'WATERSCHAP') {
                return `ws${cleaned.padStart(3, '0')}`;
            } else if (bestuurslaag === 'RIJK') {
                return `rk${cleaned.padStart(3, '0')}`;
            }
        }
        
        // Return as-is if format is unclear
        return cleaned;
    }


    /**
     * Get bevoegd gezag geometry with DB-first, PDOK/DSO-fallback pattern
     * 
     * @param bevoegdgezagCode - Bevoegd gezag code (e.g., "gm0106", "pv30", "ws15", "rk001")
     * @param options - Fetch options
     * @returns Geometry result with metadata
     */
    async getBevoegdGezagGeometry(
        bevoegdgezagCode: string,
        options: BevoegdGezagGeometryFetchOptions = {}
    ): Promise<BevoegdGezagGeometryResult> {
        // Infer bestuurslaag if not provided
        const bestuurslaag = options.bestuurslaag || this.inferBestuurslaagFromCode(bevoegdgezagCode);
        const normalizedCode = this.normalizeBevoegdGezagCode(bevoegdgezagCode, bestuurslaag);

        logger.info({
            bevoegdgezagCode,
            normalizedCode,
            bestuurslaag,
            forceRefresh: options.forceRefresh,
        }, 'Fetching bevoegd gezag geometry');

        // Step 1: Try database cache (unless force refresh)
        if (!options.forceRefresh) {
            const cachedGeometry = await BevoegdgezagGeometryModel.findByBevoegdgezagCode(normalizedCode);
            if (cachedGeometry && cachedGeometry.geometry && cachedGeometry.geometry.type) {
                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    bestuurslaag,
                    geometryIdentificatie: cachedGeometry.geometryIdentificatie,
                    geometryType: cachedGeometry.geometry.type,
                }, 'Found geometry in database cache');

                return {
                    geometry: cachedGeometry.geometry,
                    geometryIdentificatie: cachedGeometry.geometryIdentificatie,
                    geometrySource: 'database',
                    bestuurslaag: cachedGeometry.bestuurslaag,
                    naam: cachedGeometry.naam,
                };
            } else {
                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    bestuurslaag,
                    reason: 'not_in_database',
                }, 'Geometry not found in database cache, falling back to PDOK');
            }
        } else {
            logger.info({
                bevoegdgezagCode: normalizedCode,
                bestuurslaag,
                reason: 'force_refresh',
            }, 'Force refresh requested, skipping database cache and fetching from PDOK');
        }

        // Step 2: Check if bestuurslaag is supported
        if (bestuurslaag === 'WATERSCHAP' || bestuurslaag === 'RIJK') {
            // MVP Limitation: WATERSCHAP and RIJK are not supported
            const userMessage = bestuurslaag === 'WATERSCHAP' 
                ? 'Waterschap geometries are not available via PDOK. Please use an alternative workflow or provide geometry manually.'
                : 'Rijk (national government) geometries are not available via PDOK. Please use an alternative workflow or provide geometry manually.';
            
            logger.error({
                bevoegdgezagCode: normalizedCode,
                bestuurslaag,
                reason: 'unsupported_bestuurslaag_mvp',
                userMessage,
            }, 'Unsupported bestuurslaag for geometry fetching in MVP');
            
            throw new BadRequestError(
                userMessage,
                {
                    reason: 'unsupported_bestuurslaag_mvp',
                    bestuurslaag,
                    bevoegdgezagCode: normalizedCode,
                    supportedTypes: ['GEMEENTE', 'PROVINCIE'],
                    operation: 'getBevoegdGezagGeometry',
                }
            );
        }

        // Step 3: Try PDOK (for GEMEENTE and PROVINCIE only)
        if (bestuurslaag === 'GEMEENTE' || bestuurslaag === 'PROVINCIE') {
            try {
                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    bestuurslaag,
                    source: 'PDOK',
                }, 'Fetching geometry from PDOK');

                const geometry = await this.pdokService.getBevoegdGezagGeometry({
                    code: normalizedCode,
                    bestuurslaag,
                    year: options.year,
                });

                // Generate geometry identifier (PDOK doesn't provide DSO identifier, so we construct it)
                const year = options.year || new Date().getFullYear();
                const dateStr = `${year}0101`; // Use January 1st of the year
                let geometryIdentificatie: string;
                
                if (bestuurslaag === 'GEMEENTE') {
                    const codeNumber = normalizedCode.replace(/^gm/, '').padStart(4, '0');
                    geometryIdentificatie = `GM${codeNumber}_${dateStr}`;
                } else {
                    const codeNumber = normalizedCode.replace(/^pv/, '').padStart(2, '0');
                    geometryIdentificatie = `PV${codeNumber}_${dateStr}`;
                }

                // Round coordinates for DSO API compatibility
                const roundedGeometry = roundGeometryCoordinates(geometry, 3);

                // Persist to database
                await BevoegdgezagGeometryModel.upsert(
                    options.naam || normalizedCode,
                    normalizedCode,
                    bestuurslaag,
                    geometryIdentificatie,
                    roundedGeometry,
                    'EPSG:28992'
                );

                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    bestuurslaag,
                    geometryIdentificatie,
                    geometryType: roundedGeometry.type,
                    source: 'PDOK',
                }, 'Successfully fetched and cached geometry from PDOK');

                return {
                    geometry: roundedGeometry,
                    geometryIdentificatie,
                    geometrySource: 'PDOK',
                    bestuurslaag,
                    naam: options.naam,
                };
            } catch (error) {
                // Enhanced error logging with full context
                const errorContext = {
                    bevoegdgezagCode: normalizedCode,
                    bestuurslaag,
                    source: 'PDOK',
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                    errorMessage: error instanceof Error ? error.message : String(error),
                    errorDetails: error instanceof BadRequestError ? (error as any).details : undefined,
                    stack: error instanceof Error ? error.stack : undefined,
                };

                if (error instanceof BadRequestError && 
                    (error as any).details?.reason === 'pdok_not_supported') {
                    logger.error(errorContext, 'PDOK does not support this bestuurslaag type');
                } else {
                    logger.error(errorContext, 'Failed to fetch geometry from PDOK');
                }

                // Re-throw with enhanced context
                if (error instanceof BadRequestError) {
                    throw new BadRequestError(
                        `Failed to fetch ${bestuurslaag.toLowerCase()} geometry from PDOK for ${normalizedCode}: ${error.message}`,
                        {
                            ...(error as any).details,
                            originalError: error.message,
                            bevoegdgezagCode: normalizedCode,
                            bestuurslaag,
                            source: 'PDOK',
                        }
                    );
                } else if (error instanceof NotFoundError) {
                    throw new NotFoundError(
                        `Geometry not found in PDOK for ${normalizedCode} (${bestuurslaag})`,
                        normalizedCode,
                        {
                            reason: 'pdok_geometry_not_found',
                            bevoegdgezagCode: normalizedCode,
                            bestuurslaag,
                            source: 'PDOK',
                            originalError: error instanceof Error ? error.message : String(error),
                        }
                    );
                } else {
                    // Generic error
                    throw new BadRequestError(
                        `Failed to fetch geometry from PDOK: ${error instanceof Error ? error.message : String(error)}`,
                        {
                            reason: 'pdok_fetch_error',
                            bevoegdgezagCode: normalizedCode,
                            bestuurslaag,
                            source: 'PDOK',
                            originalError: error instanceof Error ? error.message : String(error),
                        }
                    );
                }
            }
        }

        // This should never be reached due to checks above, but include for type safety
        throw new BadRequestError(
            `Unsupported bestuurslaag: ${bestuurslaag}. Only GEMEENTE and PROVINCIE are supported in MVP.`,
            {
                reason: 'unsupported_bestuurslaag',
                bestuurslaag,
                bevoegdgezagCode: normalizedCode,
                supportedTypes: ['GEMEENTE', 'PROVINCIE'],
            }
        );
    }
}
