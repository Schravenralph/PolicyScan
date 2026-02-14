/**
 * GemeenteModel - MongoDB model for municipalities (gemeenten)
 * 
 * Manages municipality data including scraper configuration.
 * Provides helper methods for scraper-municipality relationships.
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Collection } from 'mongodb';
import { logger } from '../utils/logger.js';
import type { RDCoordinates } from '../services/external/PDOKGeocodingService.js';
import { PDOKGeocodingService } from '../services/external/PDOKGeocodingService.js';
import { createMunicipalityNameQuery } from '../utils/municipalityNameMatcher.js';

const COLLECTION_NAME = 'gemeenten';
let indexesEnsured = false;

/**
 * Scraper configuration for a municipality
 */
export interface GemeenteScraperConfig {
    scraperId: string;
    scraperName: string;
    version?: string;
    isActive: boolean;
    configuration?: {
        topicSpecific?: string[];
        domains?: string[];
    };
    metadata?: {
        createdBy?: string;
        createdAt?: Date;
        lastUpdated?: Date;
        notes?: string;
    };
}

/**
 * Municipality document schema
 */
export interface GemeenteDocument {
    _id?: ObjectId;
    naam: string;
    website?: string;
    email?: string;
    telefoon?: string;
    /** Municipality code from DSO API (e.g., "gm0301") - lowercase with 'gm' prefix */
    municipalityCode?: string;
    scraper?: GemeenteScraperConfig;  // NEW: Scraper configuration
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * GemeenteModel - MongoDB model for municipalities
 */
export class GemeenteModel {
    /**
     * Get the gemeenten collection
     */
    private static getCollection(): Collection<GemeenteDocument> {
        const db = getDB();
        return db.collection<GemeenteDocument>(COLLECTION_NAME);
    }

    /**
     * Ensure database indexes exist
     */
    static async ensureIndexes(): Promise<void> {
        if (indexesEnsured) return;

        try {
            const collection = this.getCollection();

            // Existing indexes
            await collection.createIndex({ naam: 1 }, { unique: true });
            await collection.createIndex({ website: 1 });

            // New indexes for scraper configuration
            await collection.createIndex({ 'scraper.scraperId': 1 });
            await collection.createIndex({ 'scraper.isActive': 1 });

            // Index on municipalityCode for lookups
            await collection.createIndex({ municipalityCode: 1 }, { sparse: true });

            indexesEnsured = true;
            logger.debug('Gemeenten collection indexes ensured');
        } catch (error) {
            logger.error({ error }, 'Failed to ensure gemeenten indexes');
            throw error;
        }
    }

    /**
     * Get scraper configuration for a municipality
     */
    static async getScraperConfig(gemeenteNaam: string): Promise<GemeenteScraperConfig | null> {
        const collection = this.getCollection();
        const query = createMunicipalityNameQuery(gemeenteNaam);
        const gemeente = await collection.findOne(query);

        return gemeente?.scraper ?? null;
    }

    /**
     * Set scraper configuration for a municipality
     */
    static async setScraperConfig(
        gemeenteNaam: string,
        config: GemeenteScraperConfig
    ): Promise<void> {
        const collection = this.getCollection();
        const query = createMunicipalityNameQuery(gemeenteNaam);
        
        const result = await collection.updateOne(
            query,
            {
                $set: {
                    scraper: {
                        ...config,
                        metadata: {
                            ...config.metadata,
                            lastUpdated: new Date()
                        }
                    },
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Municipality "${gemeenteNaam}" not found`);
        }

        logger.debug({ gemeenteNaam, scraperId: config.scraperId }, 'Updated scraper configuration for municipality');
    }

    /**
     * Get all municipalities with scrapers
     */
    static async getMunicipalitiesWithScrapers(): Promise<GemeenteDocument[]> {
        const collection = this.getCollection();
        const gemeenten = await collection.find({
            'scraper.scraperId': { $exists: true },
            'scraper.isActive': true
        }).toArray();

        return gemeenten;
    }

    /**
     * Find municipalities by multiple names (batch operation)
     *
     * Fetches all municipalities (projecting minimal fields) and matches in memory.
     * This avoids complex OR queries and ensures consistent matching logic.
     *
     * @param names - List of municipality names
     * @returns Map of name -> projected municipality data (naam and municipalityCode only)
     */
    static async findByNames(names: string[]): Promise<Map<string, Pick<GemeenteDocument, '_id' | 'naam' | 'municipalityCode'>>> {
        const collection = this.getCollection();
        const uniqueNames = [...new Set(names)];

        if (uniqueNames.length === 0) {
            return new Map();
        }

        // Fetch all municipalities (projecting minimal fields)
        // There are ~350 municipalities, so this is very fast.
        const allGemeenten = await collection
            .find({})
            .project({ naam: 1, municipalityCode: 1 })
            .toArray();

        const result = new Map<string, Pick<GemeenteDocument, '_id' | 'naam' | 'municipalityCode'>>();

        for (const name of uniqueNames) {
            // Use the same query logic as findByName (createMunicipalityNameQuery)
            // to ensure consistent matching behavior between bulk and individual lookups
            const query = createMunicipalityNameQuery(name);
            const match = allGemeenten.find(g =>
                query.$or.some(q => q.naam.$regex.test(g.naam))
            ) as Pick<GemeenteDocument, '_id' | 'naam' | 'municipalityCode'> | undefined;

            if (match) {
                result.set(name, match);
            }
        }

        return result;
    }

    /**
     * Find municipality by name (case-insensitive)
     * Uses improved matching strategies to handle variations and aliases
     */
    static async findByName(gemeenteNaam: string): Promise<GemeenteDocument | null> {
        const collection = this.getCollection();
        
        // Use improved matching query that handles variations
        const query = createMunicipalityNameQuery(gemeenteNaam);
        const gemeente = await collection.findOne(query);

        return gemeente;
    }

    /**
     * Find municipality by website URL
     */
    static async findByWebsite(website: string): Promise<GemeenteDocument | null> {
        const collection = this.getCollection();
        const gemeente = await collection.findOne({
            website: { $regex: new RegExp(website.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        });

        return gemeente;
    }

    /**
     * Get municipality by ID
     */
    static async findById(id: ObjectId | string): Promise<GemeenteDocument | null> {
        const collection = this.getCollection();
        const objectId = typeof id === 'string' ? new ObjectId(id) : id;
        const gemeente = await collection.findOne({ _id: objectId });

        return gemeente;
    }

    /**
     * Remove scraper configuration from a municipality
     */
    static async removeScraperConfig(gemeenteNaam: string): Promise<void> {
        const collection = this.getCollection();
        const query = createMunicipalityNameQuery(gemeenteNaam);
        
        const result = await collection.updateOne(
            query,
            {
                $unset: { scraper: '' },
                $set: { updatedAt: new Date() }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Municipality "${gemeenteNaam}" not found`);
        }

        logger.debug({ gemeenteNaam }, 'Removed scraper configuration from municipality');
    }

    /**
     * Check if municipality has an active scraper
     */
    static async hasActiveScraper(gemeenteNaam: string): Promise<boolean> {
        const config = await this.getScraperConfig(gemeenteNaam);
        return config?.isActive ?? false;
    }

    /**
     * Find municipality by municipality code
     * 
     * @param code - Municipality code (e.g., "gm0301")
     * @returns Municipality document or null if not found
     */
    static async findByMunicipalityCode(code: string): Promise<GemeenteDocument | null> {
        const collection = this.getCollection();
        
        // Normalize code: lowercase, ensure 'gm' prefix
        const normalizedCode = code.toLowerCase().replace(/^gm/, '');
        const municipalityCode = `gm${normalizedCode}`;
        
        const gemeente = await collection.findOne({
            municipalityCode
        });

        return gemeente;
    }

    /**
     * Update municipality code for a municipality
     * 
     * @param naam - Municipality name
     * @param code - Municipality code (e.g., "gm0301")
     */
    static async updateMunicipalityCode(naam: string, code: string): Promise<void> {
        const collection = this.getCollection();
        
        // Normalize code: lowercase, ensure 'gm' prefix, pad to 4 digits
        // Pads to 4 digits: "308" -> "gm0308", "30" -> "gm0030", "3" -> "gm0003"
        const normalizedCode = code.toLowerCase().replace(/^gm/, '');
        const municipalityCode = `gm${normalizedCode.padStart(4, '0')}`;
        const query = createMunicipalityNameQuery(naam);
        
        const result = await collection.updateOne(
            query,
            {
                $set: {
                    municipalityCode,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Municipality "${naam}" not found`);
        }

        logger.debug({ naam, municipalityCode }, 'Updated municipality code for municipality');
    }

    /**
     * Find municipality by coordinates using reverse geocoding
     * 
     * Uses PDOK reverse geocoding to get municipality name, then looks up in database.
     * 
     * @param coordinates - RD coordinates (EPSG:28992)
     * @returns Municipality document or null if not found
     */
    static async findByCoordinates(coordinates: RDCoordinates): Promise<GemeenteDocument | null> {
        try {
            const geocodingService = new PDOKGeocodingService();
            const reverseGeocodeResult = await geocodingService.reverseGeocode(coordinates);
            
            if (!reverseGeocodeResult.municipalityName) {
                logger.warn({ coordinates }, 'Reverse geocoding did not return municipality name');
                return null;
            }

            // Try to find municipality by name
            // Remove common prefixes like "Gemeente " or "gemeente "
            const municipalityName = reverseGeocodeResult.municipalityName
                .replace(/^gemeente\s+/i, '')
                .trim();

            const gemeente = await this.findByName(municipalityName);
            
            if (gemeente) {
                logger.debug({ coordinates, municipalityName, found: true }, 'Found municipality by coordinates');
            } else {
                logger.debug({ coordinates, municipalityName, found: false }, 'Municipality not found in database');
            }

            return gemeente;
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                coordinates,
            }, 'Failed to find municipality by coordinates');
            return null;
        }
    }

    /**
     * Find municipality by address
     * 
     * Extracts municipality name from address and looks up in database.
     * Handles various address formats and tries to extract municipality name.
     * 
     * @param address - Address string (e.g., "Europalaan 6D, 's-Hertogenbosch")
     * @returns Municipality document or null if not found
     */
    static async findByAddress(address: string): Promise<GemeenteDocument | null> {
        try {
            // Common patterns for extracting municipality from address:
            // - "Street, City" -> City
            // - "Street, PostalCode City" -> City
            // - "Street, City, Province" -> City
            
            // Split by comma and get the last part (usually contains city/municipality)
            const parts = address.split(',').map(p => p.trim());
            
            // Try the last part first (most common format)
            let municipalityName = parts[parts.length - 1];
            
            // Remove postal code if present (e.g., "5232BC 's-Hertogenbosch" -> "'s-Hertogenbosch")
            municipalityName = municipalityName.replace(/^\d{4}\s*[A-Z]{2}\s*/i, '');
            
            // Remove common prefixes
            municipalityName = municipalityName
                .replace(/^gemeente\s+/i, '')
                .trim();

            // Try to find by name
            let gemeente = await this.findByName(municipalityName);
            
            // If not found, try without apostrophes and special characters
            if (!gemeente) {
                const normalizedName = municipalityName
                    .replace(/'/g, '')
                    .replace(/s-/g, '')
                    .trim();
                
                if (normalizedName !== municipalityName) {
                    gemeente = await this.findByName(normalizedName);
                }
            }

            // If still not found, try other parts of the address
            if (!gemeente && parts.length > 1) {
                for (let i = parts.length - 2; i >= 0; i--) {
                    const part = parts[i]
                        .replace(/^\d{4}\s*[A-Z]{2}\s*/i, '')
                        .replace(/^gemeente\s+/i, '')
                        .trim();
                    
                    if (part.length > 2) {
                        gemeente = await this.findByName(part);
                        if (gemeente) {
                            municipalityName = part;
                            break;
                        }
                    }
                }
            }

            if (gemeente) {
                logger.debug({ address, municipalityName, found: true }, 'Found municipality by address');
            } else {
                logger.debug({ address, municipalityName, found: false }, 'Municipality not found in database');
            }

            return gemeente;
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                address,
            }, 'Failed to find municipality by address');
            return null;
        }
    }

    /**
     * Update website URL for a municipality
     * 
     * @param naam - Municipality name
     * @param website - Website URL
     */
    static async updateWebsite(naam: string, website: string): Promise<void> {
        const collection = this.getCollection();
        const query = createMunicipalityNameQuery(naam);
        
        const result = await collection.updateOne(
            query,
            {
                $set: {
                    website,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Municipality "${naam}" not found`);
        }

        logger.debug({ naam, website }, 'Updated website for municipality');
    }
}

