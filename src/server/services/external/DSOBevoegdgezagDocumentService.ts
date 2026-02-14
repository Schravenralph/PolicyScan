/**
 * DSO Bevoegd Gezag Document Service
 * 
 * High-level service that orchestrates geometry fetching and document retrieval
 * for any bevoegd gezag (municipality, province, water authority, or national government).
 * This service:
 * 1. Fetches or retrieves cached geometries for the bevoegd gezag
 * 2. Uses geometries to query all documents via /documenten/_zoek with exhaustive pagination
 * 3. Filters documents by bevoegd gezag code client-side
 * 4. Returns all documents for the bevoegd gezag
 * 
 * @see docs/30-dso-geometrie-opvragen/functionele-documentatie-geometrie-opvragen-v1-api.md
 * @see docs/30-dso-ontsluiten-v2/functionele-documentatie-omgevingsinformatie-ontsluiten-v2-api.md
 */

import { DSOGeometryService } from './DSOGeometryService.js';
import { DSOLocationSearchService } from './DSOLocationSearchService.js';
import { BevoegdgezagGeometryModel } from '../../models/BevoegdgezagGeometry.js';
import { logger } from '../../utils/logger.js';
import type { DiscoveredDocument } from './DSOOntsluitenService.js';
import type { Geometry } from 'geojson';
import { ServiceUnavailableError } from '../../types/errors.js';

/**
 * Options for fetching bevoegd gezag documents
 */
export interface BevoegdgezagDocumentFetchOptions {
    /** Filter documents by validity date (default: today) */
    geldigOp?: string;
    /** Include future valid documents */
    inclusiefToekomstigGeldig?: boolean;
    /** Force refresh of geometry from API (bypass cache) */
    forceRefreshGeometry?: boolean;
    /** Maximum pages to fetch (safety limit, default: 100 pages = 20,000 documents) */
    maxPages?: number;
    /** Use production API (default: false, uses preproduction) */
    useProduction?: boolean;
    /** Bestuurslaag filter (default: inferred from code or 'GEMEENTE') */
    bestuurslaag?: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
}

/**
 * Result of fetching all documents for a bevoegd gezag
 */
export interface BevoegdgezagDocumentFetchResult {
    /** All documents for the bevoegd gezag */
    documents: DiscoveredDocument[];
    /** Total documents found before filtering */
    totalFound: number;
    /** Total documents after bevoegd gezag code filtering */
    totalFiltered: number;
    /** Bevoegd gezag code used for filtering */
    bevoegdgezagCode: string;
    /** Geometry identifier used for the search */
    geometryIdentificatie?: string;
    /** Whether geometry was fetched from cache or API */
    geometrySource: 'cache' | 'api';
}

/**
 * Service for fetching all DSO documents for any bevoegd gezag
 */
export class DSOBevoegdgezagDocumentService {
    private geometryService: DSOGeometryService;
    private locationSearchService: DSOLocationSearchService;
    private useProduction: boolean;

    constructor(useProduction: boolean = false) {
        this.useProduction = useProduction;
        this.geometryService = new DSOGeometryService(useProduction);
        this.locationSearchService = new DSOLocationSearchService(useProduction);
    }

    /**
     * Fetch all documents for a bevoegd gezag
     * 
     * This method:
     * 1. Looks up bevoegd gezag geometry from cache
     * 2. If not found, fetches geometry identifier and retrieves geometry from API
     * 3. Stores geometry in cache
     * 4. Uses geometry to query all documents via /documenten/_zoek with exhaustive pagination
     * 5. Filters documents by bevoegd gezag code client-side
     * 
     * @param bevoegdgezagCode - Bevoegd gezag code (e.g., "gm0301", "pv26", "ws15", "rk001")
     * @param options - Fetch options
     * @returns All documents for the bevoegd gezag
     */
    async fetchAllDocumentsForBevoegdgezag(
        bevoegdgezagCode: string,
        options: BevoegdgezagDocumentFetchOptions = {}
    ): Promise<BevoegdgezagDocumentFetchResult> {
        // Normalize bevoegd gezag code
        const normalizedCode = this.normalizeBevoegdgezagCode(bevoegdgezagCode);

        logger.info({
            bevoegdgezagCode: normalizedCode,
            forceRefresh: options.forceRefreshGeometry,
            useProduction: this.useProduction,
            bestuurslaag: options.bestuurslaag,
        }, 'Starting bevoegd gezag document fetch');

        // Infer bestuurslaag from code if not provided
        const bestuurslaag = options.bestuurslaag || this.inferBestuurslaagFromCode(normalizedCode);

        // Step 1: Get or fetch geometry
        let geometry: Geometry | null = null;
        let geometryIdentificatie: string | undefined;
        let geometrySource: 'cache' | 'api' = 'cache';

        if (!options.forceRefreshGeometry) {
            // Try to get from cache first (using bevoegd gezag geometry model)
            const cachedGeometry = await BevoegdgezagGeometryModel.findByBevoegdgezagCode(normalizedCode);
            if (cachedGeometry) {
                geometry = cachedGeometry.geometry;
                geometryIdentificatie = cachedGeometry.geometryIdentificatie;
                geometrySource = 'cache';
                logger.info({
                    bevoegdgezagCode: normalizedCode,
                    geometryIdentificatie,
                    geometryType: geometry.type,
                }, 'Using cached geometry');
            }
        }

        // Step 2: If not in cache, fetch from API
        if (!geometry) {
            logger.info({
                bevoegdgezagCode: normalizedCode,
            }, 'Geometry not in cache, fetching from API');

            // Try to determine geometry identifier based on bestuurslaag
            // Municipality geometry identifiers typically follow pattern: GM{code}_YYYYMMDD
            // For other bestuurslagen, patterns may vary
            const possibleIdentifiers = this.generatePossibleGeometryIdentifiers(normalizedCode, bestuurslaag);

            for (const identifier of possibleIdentifiers) {
                try {
                    geometry = await this.geometryService.getGeometryByIdentificatie(identifier);
                    geometryIdentificatie = identifier;
                    geometrySource = 'api';
                    logger.info({
                        bevoegdgezagCode: normalizedCode,
                        geometryIdentificatie: identifier,
                        geometryType: geometry.type,
                    }, 'Successfully fetched geometry from API');

                    // Store in cache for future use
                    // Note: This service doesn't have the name, so we use the code as name temporarily
                    // The proper way is to use the fetch-geometry-identifiers-from-documents.ts script
                    await BevoegdgezagGeometryModel.upsert(
                        normalizedCode, // naam (temporary - use script for proper seeding)
                        normalizedCode, // code
                        bestuurslaag, // bestuurslaag
                        identifier, // geometryIdentificatie
                        geometry, // geometry
                        'EPSG:28992' // crs
                    );
                    break;
                } catch (error) {
                    logger.debug({
                        bevoegdgezagCode: normalizedCode,
                        geometryIdentificatie: identifier,
                        error: error instanceof Error ? error.message : String(error),
                    }, 'Geometry identifier not found, trying next');
                }
            }

            if (!geometry) {
                throw new ServiceUnavailableError(
                    `Could not find geometry for bevoegd gezag ${normalizedCode}. Tried identifiers: ${possibleIdentifiers.join(', ')}`,
                    {
                        reason: 'bevoegdgezag_geometry_not_found',
                        bevoegdgezagCode: normalizedCode,
                        triedIdentifiers: possibleIdentifiers,
                        operation: 'fetchAllDocumentsForBevoegdgezag'
                    }
                );
            }
        }

        // Step 3: Use geometry to query all documents with exhaustive pagination
        logger.info({
            bevoegdgezagCode: normalizedCode,
            geometryType: geometry.type,
            bestuurslaag,
        }, 'Querying documents with geometry (exhaustive pagination)');

        const searchResult = await this.locationSearchService.searchAllByGeometry(
            geometry,
            normalizedCode, // Pass bevoegd gezag code for client-side filtering
            {
                bestuurslaag, // Use inferred or provided bestuurslaag
                geldigOp: options.geldigOp,
                inclusiefToekomstigGeldig: options.inclusiefToekomstigGeldig,
                maxPages: options.maxPages || 100, // Safety limit (100 pages = 20,000 documents)
            }
        );

        logger.info({
            bevoegdgezagCode: normalizedCode,
            totalFound: searchResult.totalFound,
            totalFiltered: searchResult.totalFiltered || searchResult.totalFound,
            documentsReturned: searchResult.documents.length,
            paginationExhaustive: searchResult.totalFound === (searchResult.totalFiltered || searchResult.totalFound),
        }, 'Completed bevoegd gezag document fetch');

        // Step 4: Extract bevoegd gezag name from documents and update cache if needed
        // Since we didn't have the name when we upserted the geometry (using code as placeholder),
        // we now try to find the correct name from the returned documents.
        if (searchResult.documents.length > 0) {
            // Find a document that matches our bevoegd gezag code
            const documentWithAuthority = searchResult.documents.find(doc => {
                // Safe access to metadata
                const metadata = doc.metadata || {};
                const authority = metadata.aangeleverdDoorEen as { code?: string; naam?: string } | undefined;

                if (!authority || !authority.code) return false;

                // Use normalized comparison
                const docCode = this.normalizeBevoegdgezagCode(authority.code);
                return docCode === normalizedCode;
            });

            if (documentWithAuthority) {
                const metadata = documentWithAuthority.metadata || {};
                const authority = metadata.aangeleverdDoorEen as { code?: string; naam?: string };
                const naam = authority.naam;

                // If we found a name and it's different from our placeholder (the code), update it
                if (naam && naam !== normalizedCode) {
                    try {
                        await BevoegdgezagGeometryModel.updateName(normalizedCode, naam);
                        logger.info({
                            bevoegdgezagCode: normalizedCode,
                            oldName: normalizedCode,
                            newName: naam
                        }, 'Updated bevoegd gezag name from found documents');
                    } catch (error) {
                        // Log but don't fail the request, as this is a side effect
                        logger.warn({
                            bevoegdgezagCode: normalizedCode,
                            newName: naam,
                            error: error instanceof Error ? error.message : String(error)
                        }, 'Failed to update bevoegd gezag name');
                    }
                }
            }
        }

        return {
            documents: searchResult.documents,
            totalFound: searchResult.totalFound,
            totalFiltered: searchResult.totalFiltered || searchResult.totalFound,
            bevoegdgezagCode: normalizedCode,
            geometryIdentificatie,
            geometrySource,
        };
    }

    /**
     * Infer bestuurslaag from bevoegd gezag code
     */
    private inferBestuurslaagFromCode(code: string): 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK' {
        const normalized = code.toLowerCase().trim();
        if (normalized.startsWith('gm') || /^\d{4}$/.test(normalized)) {
            return 'GEMEENTE';
        }
        if (normalized.startsWith('pv') || normalized.startsWith('pr')) {
            return 'PROVINCIE';
        }
        if (normalized.startsWith('ws') || normalized.startsWith('w')) {
            return 'WATERSCHAP';
        }
        if (normalized.startsWith('rk') || normalized.startsWith('r')) {
            return 'RIJK';
        }
        // Default to GEMEENTE if unclear
        return 'GEMEENTE';
    }

    /**
     * Generate possible geometry identifiers based on code and bestuurslaag
     */
    private generatePossibleGeometryIdentifiers(
        code: string,
        bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK'
    ): string[] {
        const codeNumber = code.toLowerCase().replace(/^(gm|pv|ws|rk)/, '').padStart(4, '0');
        
        switch (bestuurslaag) {
            case 'GEMEENTE':
                return [
                    `GM${codeNumber}_20230101`,
                    `GM${codeNumber}_20240101`,
                    `GM${codeNumber}_20250101`,
                ];
            case 'PROVINCIE':
                return [
                    `PV${codeNumber}_20230101`,
                    `PV${codeNumber}_20240101`,
                    `PV${codeNumber}_20250101`,
                ];
            case 'WATERSCHAP':
                return [
                    `WS${codeNumber}_20230101`,
                    `WS${codeNumber}_20240101`,
                    `WS${codeNumber}_20250101`,
                ];
            case 'RIJK':
                return [
                    `RK${codeNumber}_20230101`,
                    `RK${codeNumber}_20240101`,
                    `RK${codeNumber}_20250101`,
                ];
            default:
                // Fallback to municipality pattern
                return [
                    `GM${codeNumber}_20230101`,
                    `GM${codeNumber}_20240101`,
                    `GM${codeNumber}_20250101`,
                ];
        }
    }

    /**
     * Normalize bevoegd gezag code to standard format
     * 
     * Preserves prefix (gm, pv, ws, rk) and ensures consistent formatting
     * 
     * @param code - Bevoegd gezag code in any format
     * @returns Normalized code
     */
    private normalizeBevoegdgezagCode(code: string): string {
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
        
        // If it's just a number, assume municipality (gm)
        if (/^\d+$/.test(cleaned)) {
            return `gm${cleaned.padStart(4, '0')}`;
        }
        
        // Return as-is if format is unclear
        return cleaned;
    }
}
