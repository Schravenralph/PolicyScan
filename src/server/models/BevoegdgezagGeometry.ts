/**
 * BevoegdgezagGeometryModel - MongoDB model for bevoegd gezag geometries
 * 
 * Manages cached geometries for all bevoegd gezag types (municipalities, provinces, 
 * waterschappen, rijk) fetched from the DSO Geometrie Opvragen API.
 * Geometries are stored in RD format (EPSG:28992) for use with /documenten/_zoek endpoint.
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Collection, type Filter, type UpdateFilter } from 'mongodb';
import { logger } from '../utils/logger.js';
import type { Geometry } from 'geojson';

const COLLECTION_NAME = 'municipality_geometries';
let indexesEnsured = false;

/**
 * Bevoegd gezag geometry document schema
 */
export interface BevoegdgezagGeometryDocument {
    _id?: ObjectId;
    /** Bevoegd gezag name (e.g., "Almelo", "Noord-Brabant", "Waterschap Rijn en IJssel") */
    naam: string;
    /** Bevoegd gezag code (e.g., "gm0301", "pv30", "ws15", "rk001") */
    bevoegdgezagCode: string;
    /** Bestuurslaag type (GEMEENTE, PROVINCIE, WATERSCHAP, RIJK) */
    bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK';
    /** Geometry identifier from DSO API (e.g., "GM0301_20230101", "PV30_20230101") */
    geometryIdentificatie: string;
    /** GeoJSON geometry in RD format (EPSG:28992) */
    geometry: Geometry;
    /** Coordinate reference system (always "EPSG:28992" for RD) */
    crs: string;
    /** When the geometry was fetched from the API */
    fetchedAt: Date;
    /** When the document was created */
    createdAt: Date;
    /** When the document was last updated */
    updatedAt: Date;
    /** Legacy field for backward compatibility - maps to bevoegdgezagCode for municipalities */
    municipalityCode?: string;
}

/**
 * BevoegdgezagGeometryModel - MongoDB model for bevoegd gezag geometries
 */
export class BevoegdgezagGeometryModel {
    /**
     * Get the municipality_geometries collection
     */
    private static getCollection(): Collection<BevoegdgezagGeometryDocument> {
        const db = getDB();
        return db.collection<BevoegdgezagGeometryDocument>(COLLECTION_NAME);
    }

    /**
     * Ensure database indexes exist
     */
    static async ensureIndexes(): Promise<void> {
        if (indexesEnsured) return;

        try {
            const collection = this.getCollection();

            // Unique index on bevoegdgezagCode (one geometry per bevoegd gezag)
            await collection.createIndex({ bevoegdgezagCode: 1 }, { unique: true });

            // Index on municipalityCode for backward compatibility
            await collection.createIndex({ municipalityCode: 1 });

            // Index on bestuurslaag for filtering
            await collection.createIndex({ bestuurslaag: 1 });

            // Index on geometryIdentificatie for lookups
            await collection.createIndex({ geometryIdentificatie: 1 });

            // Index on fetchedAt for cache management
            await collection.createIndex({ fetchedAt: 1 });

            indexesEnsured = true;
            logger.debug('Bevoegd gezag geometries collection indexes ensured');
        } catch (error) {
            logger.error({ error }, 'Failed to ensure bevoegd gezag geometries indexes');
            throw error;
        }
    }

    /**
     * Find geometry by bevoegd gezag code
     * 
     * @param code - Bevoegd gezag code (e.g., "gm0301", "pv30", "ws15", "rk001")
     * @returns Bevoegd gezag geometry document or null if not found
     */
    static async findByBevoegdgezagCode(code: string): Promise<BevoegdgezagGeometryDocument | null> {
        const collection = this.getCollection();
        
        // Normalize code
        const normalizedCode = this.normalizeBevoegdgezagCode(code);
        
        const geometry = await collection.findOne({
            bevoegdgezagCode: normalizedCode
        });

        return geometry;
    }

    /**
     * Find geometry by municipality code (backward compatibility)
     * 
     * @param code - Municipality code (e.g., "gm0301" or "0301")
     * @returns Municipality geometry document or null if not found
     * @deprecated Use findByBevoegdgezagCode instead
     */
    static async findByMunicipalityCode(code: string): Promise<BevoegdgezagGeometryDocument | null> {
        const collection = this.getCollection();
        
        // Normalize code (lowercase, ensure 'gm' prefix)
        const normalizedCode = this.normalizeMunicipalityCode(code);
        
        // Try new field first, then legacy field for backward compatibility
        const geometry = await collection.findOne({
            $or: [
                { bevoegdgezagCode: normalizedCode },
                { municipalityCode: normalizedCode }
            ]
        });

        return geometry;
    }

    /**
     * Find geometry by geometry identifier
     * 
     * @param geometryIdentificatie - Geometry identifier (e.g., "GM0301_20230101")
     * @returns Municipality geometry document or null if not found
     */
    static async findByGeometryIdentificatie(geometryIdentificatie: string): Promise<BevoegdgezagGeometryDocument | null> {
        const collection = this.getCollection();
        
        const geometry = await collection.findOne({
            geometryIdentificatie
        });

        return geometry;
    }

    /**
     * Upsert bevoegd gezag geometry
     * 
     * Creates or updates a bevoegd gezag geometry document.
     * 
     * @param naam - Bevoegd gezag name (e.g., "Almelo", "Noord-Brabant")
     * @param code - Bevoegd gezag code (e.g., "gm0301", "pv30", "ws15", "rk001")
     * @param bestuurslaag - Bestuurslaag type
     * @param geometryIdentificatie - Geometry identifier from DSO API
     * @param geometry - GeoJSON geometry in RD format
     * @param crs - Coordinate reference system (default: "EPSG:28992")
     */
    static async upsert(
        naam: string,
        code: string,
        bestuurslaag: 'GEMEENTE' | 'PROVINCIE' | 'WATERSCHAP' | 'RIJK',
        geometryIdentificatie: string,
        geometry: Geometry,
        crs: string = 'EPSG:28992'
    ): Promise<void> {
        const collection = this.getCollection();
        
        // Normalize code
        const normalizedCode = this.normalizeBevoegdgezagCode(code);
        
        const now = new Date();
        
        const filter: Filter<BevoegdgezagGeometryDocument> = {
            bevoegdgezagCode: normalizedCode
        };

        const update: UpdateFilter<BevoegdgezagGeometryDocument> = {
            $set: {
                naam,
                bevoegdgezagCode: normalizedCode,
                bestuurslaag,
                geometryIdentificatie,
                geometry,
                crs,
                fetchedAt: now,
                updatedAt: now,
                // Legacy field for backward compatibility (only for municipalities)
                ...(bestuurslaag === 'GEMEENTE' && { municipalityCode: normalizedCode }),
            },
            $setOnInsert: {
                createdAt: now,
            }
        };

        await collection.updateOne(filter, update, { upsert: true });

        logger.debug({
            naam,
            bevoegdgezagCode: normalizedCode,
            bestuurslaag,
            geometryIdentificatie,
            geometryType: geometry.type,
        }, 'Upserted bevoegd gezag geometry');
    }

    /**
     * Update bevoegd gezag name
     *
     * @param code - Bevoegd gezag code (e.g., "gm0301", "pv30", "ws15", "rk001")
     * @param naam - New name
     */
    static async updateName(code: string, naam: string): Promise<void> {
        const collection = this.getCollection();

        // Normalize code
        const normalizedCode = this.normalizeBevoegdgezagCode(code);

        const filter: Filter<BevoegdgezagGeometryDocument> = {
            bevoegdgezagCode: normalizedCode
        };

        const update: UpdateFilter<BevoegdgezagGeometryDocument> = {
            $set: {
                naam,
                updatedAt: new Date()
            }
        };

        await collection.updateOne(filter, update);

        logger.debug({
            bevoegdgezagCode: normalizedCode,
            naam
        }, 'Updated bevoegd gezag name');
    }

    /**
     * Delete geometry by municipality code
     * 
     * @param code - Municipality code
     */
    static async deleteByMunicipalityCode(code: string): Promise<void> {
        const collection = this.getCollection();
        
        const normalizedCode = this.normalizeMunicipalityCode(code);
        
        const result = await collection.deleteOne({
            municipalityCode: normalizedCode
        });

        if (result.deletedCount > 0) {
            logger.debug({ municipalityCode: normalizedCode }, 'Deleted municipality geometry');
        }
    }

    /**
     * Get all municipality geometries
     * 
     * @returns Array of all municipality geometry documents
     */
    static async findAll(): Promise<BevoegdgezagGeometryDocument[]> {
        const collection = this.getCollection();
        return collection.find({}).toArray();
    }

    /**
     * Count total geometries
     * 
     * @returns Total number of cached geometries
     */
    static async count(): Promise<number> {
        const collection = this.getCollection();
        return collection.countDocuments();
    }

    /**
     * Normalize bevoegd gezag code to standard format
     * 
     * Preserves prefix (gm, pv, ws, rk) and ensures consistent formatting
     * 
     * @param code - Bevoegd gezag code in any format
     * @returns Normalized code
     */
    private static normalizeBevoegdgezagCode(code: string): string {
        const cleaned = code.toLowerCase().trim();
        
        // If it starts with a prefix, keep it
        if (cleaned.match(/^(gm|pv|ws|rk)/)) {
            const prefix = cleaned.match(/^(gm|pv|ws|rk)/)?.[1] || '';
            const number = cleaned.replace(/^(gm|pv|ws|rk)/, '');
            
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

    /**
     * Normalize municipality code to standard format (backward compatibility)
     * 
     * Ensures code is lowercase with 'gm' prefix (e.g., "gm0301")
     * 
     * @param code - Municipality code in any format
     * @returns Normalized code
     */
    private static normalizeMunicipalityCode(code: string): string {
        // Remove any existing 'gm' prefix and convert to lowercase
        const cleaned = code.toLowerCase().replace(/^gm/, '');
        
        // Ensure 4 digits (pad with zeros)
        const codeNumber = cleaned.padStart(4, '0');
        
        // Return with 'gm' prefix
        return `gm${codeNumber}`;
    }
}
