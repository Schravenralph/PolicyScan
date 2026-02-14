/**
 * ScraperRegistryService
 * 
 * Service for managing scraper metadata in the database.
 * Provides CRUD operations for the scrapers collection and
 * bidirectional lookups between scrapers and municipalities.
 * 
 * @module ScraperRegistryService
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { ObjectId } from 'mongodb';
import { createMunicipalityNameQuery, findBestMatch, normalizeMunicipalityNameStrict } from '../../utils/municipalityNameMatcher.js';

/**
 * Scraper document schema as stored in MongoDB
 */
export interface ScraperDocument {
    _id?: ObjectId;
    
    // Scraper identification
    scraperId: string;                // Unique ID (e.g., "HorstAanDeMaasScraper")
    scraperName: string;              // Human-readable name
    scraperType: 'municipality' | 'rijksoverheid' | 'iplo' | 'generic';
    
    // Municipality relationship (for municipality scrapers)
    municipality?: {
        gemeenteNaam: string;         // e.g., "Horst aan de Maas"
        gemeenteId?: ObjectId;         // Reference to gemeenten._id
        isPrimary: boolean;            // Primary scraper for this municipality
    };
    
    // Scraper metadata
    version: string;                  // e.g., "1.0.0"
    description?: string;
    capabilities?: {
        topicSpecific?: boolean;      // Supports topic-specific variants
        supportsVersioning?: boolean;
        supportsA_BTesting?: boolean;
    };
    
    // Domain patterns (for backward compatibility)
    domains: string[];                // e.g., ["horstaandemaas.nl", "horstaandemaas2040.nl"]
    urlPatterns?: string[];           // Regex patterns
    
    // Factory function reference
    factoryType: 'class' | 'function' | 'factory';
    factoryModule: string;            // e.g., "./HorstAanDeMaasScraper"
    factoryExport: string;            // e.g., "HorstAanDeMaasScraper"
    
    // Configuration
    configuration?: {
        defaultOptions?: Record<string, any>;
        topicMappings?: Record<string, string>; // topic → specialized scraper ID
    };
    
    // Status
    isActive: boolean;
    isDeprecated: boolean;
    
    // Metadata
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt?: Date;
    usageCount?: number;
}

/**
 * Metadata for registering a new scraper
 */
export interface ScraperMetadata {
    scraperId: string;
    scraperName: string;
    scraperType: 'municipality' | 'rijksoverheid' | 'iplo' | 'generic';
    municipality?: {
        gemeenteNaam: string;
        gemeenteId?: ObjectId;
        isPrimary?: boolean;
    };
    version: string;
    description?: string;
    capabilities?: {
        topicSpecific?: boolean;
        supportsVersioning?: boolean;
        supportsA_BTesting?: boolean;
    };
    domains: string[];
    urlPatterns?: string[];
    factoryType: 'class' | 'function' | 'factory';
    factoryModule: string;
    factoryExport: string;
    configuration?: {
        defaultOptions?: Record<string, any>;
        topicMappings?: Record<string, string>;
    };
    isActive?: boolean;
    isDeprecated?: boolean;
    createdBy?: string;
}

/**
 * Service for managing scraper metadata in the database
 */
export class ScraperRegistryService {
    private readonly collectionName = 'scrapers';

    /**
     * Get the scrapers collection
     */
    private getCollection() {
        const db = getDB();
        return db.collection<ScraperDocument>(this.collectionName);
    }

    /**
     * Register a scraper in the database
     */
    async registerScraper(metadata: ScraperMetadata): Promise<void> {
        const collection = this.getCollection();
        
        // Check if scraper already exists
        const existing = await collection.findOne({ scraperId: metadata.scraperId });
        if (existing) {
            throw new Error(`Scraper with ID "${metadata.scraperId}" already exists`);
        }

        const now = new Date();
        const scraperDoc: ScraperDocument = {
            scraperId: metadata.scraperId,
            scraperName: metadata.scraperName,
            scraperType: metadata.scraperType,
            municipality: metadata.municipality ? {
                gemeenteNaam: metadata.municipality.gemeenteNaam,
                gemeenteId: metadata.municipality.gemeenteId,
                isPrimary: metadata.municipality.isPrimary ?? true
            } : undefined,
            version: metadata.version,
            description: metadata.description,
            capabilities: metadata.capabilities,
            domains: metadata.domains,
            urlPatterns: metadata.urlPatterns,
            factoryType: metadata.factoryType,
            factoryModule: metadata.factoryModule,
            factoryExport: metadata.factoryExport,
            configuration: metadata.configuration,
            isActive: metadata.isActive ?? true,
            isDeprecated: metadata.isDeprecated ?? false,
            createdBy: metadata.createdBy,
            createdAt: now,
            updatedAt: now,
            usageCount: 0
        };

        await collection.insertOne(scraperDoc);
        logger.info({ scraperId: metadata.scraperId }, 'Registered scraper in database');
    }

    /**
     * Get scraper metadata by ID
     */
    async getScraperById(scraperId: string): Promise<ScraperDocument | null> {
        const collection = this.getCollection();
        const scraper = await collection.findOne({ scraperId });
        return scraper;
    }

    /**
     * Get scraper for a municipality
     * Uses improved matching strategies to handle variations and aliases
     */
    async getScraperForMunicipality(gemeenteNaam: string): Promise<ScraperDocument | null> {
        const collection = this.getCollection();
        
        // Debug logging for test environment
        if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
            console.log(`[DEBUG] getScraperForMunicipality: Looking for "${gemeenteNaam}"`);
        }
        
        // First try exact match (case-sensitive)
        let scraper = await collection.findOne({
            'municipality.gemeenteNaam': gemeenteNaam,
            isActive: true,
            isDeprecated: false
        });
        
        if (scraper && (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
            console.log(`[DEBUG] Found scraper with exact match: ${scraper.scraperId}`);
        }
        
        // If not found, try improved matching query
        if (!scraper) {
            // Build query using improved matching - adapt for municipality.gemeenteNaam field
            const nameQuery = createMunicipalityNameQuery(gemeenteNaam);
            // Transform the query to work with municipality.gemeenteNaam instead of naam
            const adaptedQuery = {
                $or: nameQuery.$or.map(q => ({
                    'municipality.gemeenteNaam': q.naam
                })),
                isActive: true,
                isDeprecated: false
            };
            scraper = await collection.findOne(adaptedQuery);
            
            if (scraper && (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                console.log(`[DEBUG] Found scraper with improved match: ${scraper.scraperId}`);
            }
        }
        
        // If still not found, try normalized match with best match algorithm
        if (!scraper) {
            const allScrapers = await collection.find({
                isActive: true,
                isDeprecated: false,
                'municipality.gemeenteNaam': { $exists: true }
            }).toArray();
            
            if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                const normalizedName = normalizeMunicipalityNameStrict(gemeenteNaam);
                console.log(`[DEBUG] Trying normalized match. Normalized name: "${normalizedName}"`);
                console.log(`[DEBUG] Available scrapers in DB: ${allScrapers.map((s: ScraperDocument) => `"${s.municipality?.gemeenteNaam}" (${s.scraperId})`).join(', ')}`);
            }
            
            const candidateNames = allScrapers
                .map((s: ScraperDocument) => s.municipality?.gemeenteNaam)
                .filter((name): name is string => !!name);
            
            const bestMatch = findBestMatch(gemeenteNaam, candidateNames);
            
            if (bestMatch) {
                scraper = allScrapers.find((s: ScraperDocument) => s.municipality?.gemeenteNaam === bestMatch) || null;
                
                if (scraper && (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true')) {
                    console.log(`[DEBUG] Found scraper with best match algorithm: ${scraper.scraperId}`);
                }
            } else if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                console.log(`[DEBUG] No scraper found with normalized match`);
            }
        }
        
        return scraper;
    }

    /**
     * Get municipality for a scraper
     */
    async getMunicipalityForScraper(scraperId: string): Promise<string | null> {
        const collection = this.getCollection();
        const scraper = await collection.findOne({ scraperId });
        return scraper?.municipality?.gemeenteNaam ?? null;
    }

    /**
     * List all scrapers for municipalities
     */
    async listMunicipalityScrapers(): Promise<ScraperDocument[]> {
        const collection = this.getCollection();
        const scrapers = await collection.find({
            scraperType: 'municipality',
            isActive: true,
            isDeprecated: false
        }).toArray();
        return scrapers;
    }

    /**
     * Update scraper metadata
     */
    async updateScraper(scraperId: string, updates: Partial<ScraperDocument>): Promise<void> {
        const collection = this.getCollection();
        
        // Remove _id from updates if present (cannot update _id)
        const { _id, ...updateData } = updates;
        
        const result = await collection.updateOne(
            { scraperId },
            {
                $set: {
                    ...updateData,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Scraper with ID "${scraperId}" not found`);
        }

        logger.debug({ scraperId, updates: Object.keys(updateData) }, 'Updated scraper metadata');
    }

    /**
     * Increment usage count for a scraper
     */
    async incrementUsage(scraperId: string): Promise<void> {
        const collection = this.getCollection();
        await collection.updateOne(
            { scraperId },
            {
                $inc: { usageCount: 1 },
                $set: { lastUsedAt: new Date() }
            }
        );
    }

    /**
     * Get all scrapers (for admin/debugging)
     */
    async listAllScrapers(): Promise<ScraperDocument[]> {
        const collection = this.getCollection();
        const scrapers = await collection.find({}).toArray();
        return scrapers;
    }

    /**
     * Delete a scraper (soft delete by setting isDeprecated)
     */
    async deleteScraper(scraperId: string): Promise<void> {
        await this.updateScraper(scraperId, {
            isDeprecated: true,
            isActive: false
        });
        logger.info({ scraperId }, 'Deprecated scraper');
    }

    /**
     * Initialize indexes for the scrapers collection
     * Should be called on application startup
     */
    async initializeIndexes(): Promise<void> {
        const collection = this.getCollection();
        
        try {
            // Create unique index on scraperId
            await collection.createIndex({ scraperId: 1 }, { unique: true });
            
            // Create index on municipality name for fast lookups
            await collection.createIndex({ 'municipality.gemeenteNaam': 1 });
            
            // Create index on municipality ID
            await collection.createIndex({ 'municipality.gemeenteId': 1 });
            
            // Create compound index for active municipality scrapers
            await collection.createIndex({ 
                scraperType: 1, 
                isActive: 1, 
                isDeprecated: 1 
            });
            
            // Create index on domains for domain-based lookups
            await collection.createIndex({ domains: 1 });
            
            logger.info('Initialized indexes for scrapers collection');
        } catch (error) {
            logger.error({ error }, 'Failed to initialize indexes for scrapers collection');
            throw error;
        }
    }
}

/**
 * Singleton instance of the scraper registry service
 */
export const scraperRegistryService = new ScraperRegistryService();

