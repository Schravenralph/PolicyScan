/**
 * Scraper Index
 * 
 * Exports all scrapers and provides scraper selection logic
 */

// Base and utility exports
export { BaseScraper } from './baseScraper.js';
export type { ScraperOptions } from './baseScraper.js';
export { AIGuidedScraper } from './AIGuidedScraper.js';
export type { AIGuidedScraperOptions } from './AIGuidedScraper.js';
export { ScraperRegistry, scraperRegistry } from './ScraperRegistry.js';
export type { ScraperPluginMetadata, ScraperFactory, ScraperRegistryEntry, ScraperRegistrationOptions } from './ScraperRegistry.js';
export { ScraperRegistryService, scraperRegistryService } from './ScraperRegistryService.js';
export type { ScraperDocument, ScraperMetadata } from './ScraperRegistryService.js';

// Specific scrapers
export { RijksoverheidScraper } from './rijksoverheidScraper.js';
export { GemeenteScraper } from './gemeenteScraper.js';
export { 
    MunicipalityPolicyScraper, 
    createMunicipalityScraper,
    DUTCH_PLANNING_KEYWORDS 
} from './MunicipalityPolicyScraper.js';
export type { MunicipalityScraperConfig } from './MunicipalityPolicyScraper.js';
export { 
    AmsterdamPolicyScraper, 
    createAmsterdamScraper 
} from './AmsterdamPolicyScraper.js';
export {
    HorstAanDeMaasScraper,
    createHorstAanDeMaasScraper,
    HORST_SPECIFIC_KEYWORDS
} from './HorstAanDeMaasScraper.js';
export {
    HorstAanDeMaasArbeidsmigrantenScraper,
    createHorstAanDeMaasArbeidsmigrantenScraper
} from './HorstAanDeMaasArbeidsmigrantenScraper.js';
export {
    HorstAanDeMaasEnergietransitieScraper,
    createHorstAanDeMaasEnergietransitieScraper
} from './HorstAanDeMaasEnergietransitieScraper.js';
export {
    HorstAanDeMaasBetaalbareHuisvestingScraper,
    createHorstAanDeMaasBetaalbareHuisvestingScraper
} from './HorstAanDeMaasBetaalbareHuisvestingScraper.js';
export {
    HorstAanDeMaasKlimaatadaptatieScraper,
    createHorstAanDeMaasKlimaatadaptatieScraper
} from './HorstAanDeMaasKlimaatadaptatieScraper.js';
export {
    HorstAanDeMaasKlimaatVeerkrachtScraper,
    createHorstAanDeMaasKlimaatVeerkrachtScraper
} from './HorstAanDeMaasKlimaatVeerkrachtScraper.js';
export {
    HorstAanDeMaasDuurzameMobiliteitScraper,
    createHorstAanDeMaasDuurzameMobiliteitScraper
} from './HorstAanDeMaasDuurzameMobiliteitScraper.js';
export {
    HorstAanDeMaasGroeneInfrastructuurScraper,
    createHorstAanDeMaasGroeneInfrastructuurScraper
} from './HorstAanDeMaasGroeneInfrastructuurScraper.js';
export {
    HorstAanDeMaasParticipatievePlanningScraper,
    createHorstAanDeMaasParticipatievePlanningScraper
} from './HorstAanDeMaasParticipatievePlanningScraper.js';
export {
    HorstAanDeMaasStedelijkeVernieuwingScraper,
    createHorstAanDeMaasStedelijkeVernieuwingScraper
} from './HorstAanDeMaasStedelijkeVernieuwingScraper.js';
export {
    HorstAanDeMaasSlimmeStedenScraper,
    createHorstAanDeMaasSlimmeStedenScraper
} from './HorstAanDeMaasSlimmeStedenScraper.js';

// Import Den Bosch Region Scrapers
import {
    createBernhezeScraper,
    createDenBoschScraper,
    createBergenOpZoomScraper,
    createBoekelScraper,
    createMaashorstScraper,
    createSintMichielsgestelScraper,
    createHeusdenScraper,
    createMaasdrielScraper,
    createZaltbommelScraper,
    createBoxtelScraper,
    createWaalwijkScraper,
    createLoonOpZandScraper,
    createOisterwijkScraper,
    createAltenaScraper,
    createDongenScraper,
    createGeertruidenbergScraper,
    createGilzeEnRijenScraper,
    createBestScraper
} from './DenBoschRegionScrapers.js';

// Imports for factory function
import { RijksoverheidScraper } from './rijksoverheidScraper.js';
import { GemeenteScraper } from './gemeenteScraper.js';
import { BaseScraper } from './baseScraper.js';
import { createMunicipalityScraper } from './MunicipalityPolicyScraper.js';
import { AIGuidedScraper } from './AIGuidedScraper.js';
import { AmsterdamPolicyScraper } from './AmsterdamPolicyScraper.js';
import { HorstAanDeMaasScraper } from './HorstAanDeMaasScraper.js';
import { HorstAanDeMaasArbeidsmigrantenScraper } from './HorstAanDeMaasArbeidsmigrantenScraper.js';
import { HorstAanDeMaasEnergietransitieScraper } from './HorstAanDeMaasEnergietransitieScraper.js';
import { HorstAanDeMaasBetaalbareHuisvestingScraper } from './HorstAanDeMaasBetaalbareHuisvestingScraper.js';
import { HorstAanDeMaasKlimaatadaptatieScraper } from './HorstAanDeMaasKlimaatadaptatieScraper.js';
import { HorstAanDeMaasKlimaatVeerkrachtScraper } from './HorstAanDeMaasKlimaatVeerkrachtScraper.js';
import { HorstAanDeMaasDuurzameMobiliteitScraper } from './HorstAanDeMaasDuurzameMobiliteitScraper.js';
import { HorstAanDeMaasGroeneInfrastructuurScraper } from './HorstAanDeMaasGroeneInfrastructuurScraper.js';
import { HorstAanDeMaasParticipatievePlanningScraper } from './HorstAanDeMaasParticipatievePlanningScraper.js';
import { HorstAanDeMaasStedelijkeVernieuwingScraper } from './HorstAanDeMaasStedelijkeVernieuwingScraper.js';
import { HorstAanDeMaasSlimmeStedenScraper } from './HorstAanDeMaasSlimmeStedenScraper.js';
import { scraperRegistry } from './ScraperRegistry.js';
import { scraperRegistryService } from './ScraperRegistryService.js';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Registry of known municipality scrapers
 * Key: domain pattern (lowercase)
 * Value: factory function that creates the scraper
 */
const MUNICIPALITY_SCRAPERS: Record<string, () => BaseScraper> = {
    'amsterdam.nl': () => new AmsterdamPolicyScraper(),
    'horstaandemaas.nl': () => new HorstAanDeMaasScraper(),
    'horstaandemaas2040.nl': () => new HorstAanDeMaasScraper(),

    // Den Bosch Region Scrapers
    'bernheze.org': createBernhezeScraper,
    's-hertogenbosch.nl': createDenBoschScraper,
    'bergenopzoom.nl': createBergenOpZoomScraper,
    'boekel.nl': createBoekelScraper,
    'gemeentemaashorst.nl': createMaashorstScraper,
    'sint-michielsgestel.nl': createSintMichielsgestelScraper,
    'heusden.nl': createHeusdenScraper,
    'maasdriel.nl': createMaasdrielScraper,
    'zaltbommel.nl': createZaltbommelScraper,
    'boxtel.nl': createBoxtelScraper,
    'waalwijk.nl': createWaalwijkScraper,
    'loonopzand.nl': createLoonOpZandScraper,
    'oisterwijk.nl': createOisterwijkScraper,
    'gemeentealtena.nl': createAltenaScraper,
    'dongen.nl': createDongenScraper,
    'geertruidenberg.nl': createGeertruidenbergScraper,
    'gilzerijen.nl': createGilzeEnRijenScraper,
    'gemeentebest.nl': createBestScraper,
};

/**
 * Load a scraper instance from database metadata
 * @param scraperDoc - Scraper document from database
 * @param url - The website URL
 * @param websiteTitle - Optional website title
 * @param onderwerp - Optional topic/subject
 * @returns Scraper instance or null if loading fails
 */
import type { ScraperDocument } from './ScraperRegistryService.js';

async function loadScraperFromMetadata(
    scraperDoc: ScraperDocument,
    url: string,
    websiteTitle?: string,
    onderwerp?: string
): Promise<BaseScraper | null> {
    try {
        // Handle topic-specific scrapers if configured
        if (onderwerp && scraperDoc.configuration?.topicMappings) {
            const onderwerpLower = onderwerp.toLowerCase();
            for (const [topic, scraperId] of Object.entries(scraperDoc.configuration.topicMappings)) {
                if (onderwerpLower.includes(topic.toLowerCase())) {
                    const topicScraperDoc = await scraperRegistryService.getScraperById(scraperId);
                    if (topicScraperDoc) {
                        return loadScraperFromMetadata(topicScraperDoc, url, websiteTitle, onderwerp);
                    }
                }
            }
        }
        
        // Load factory function from module
        // Resolve relative paths (e.g., "./DenBoschRegionScrapers" -> relative to this file)
        let factoryModule = scraperDoc.factoryModule;
        if (factoryModule.startsWith('./')) {
            // Convert relative path to include .js extension for ESM
            // e.g., "./DenBoschRegionScrapers" -> "./DenBoschRegionScrapers.js"
            factoryModule = factoryModule.replace(/\.ts$/, '').replace(/\.js$/, '') + '.js';
        } else if (!factoryModule.endsWith('.js') && !factoryModule.endsWith('.ts')) {
            // If no extension, assume it's a relative path
            factoryModule = factoryModule + '.js';
        }
        
        // Use dynamic import with proper path resolution
        const module = await import(factoryModule);
        const factory = module[scraperDoc.factoryExport];
        
        if (!factory) {
            logger.error({ scraperId: scraperDoc.scraperId, factoryExport: scraperDoc.factoryExport }, 'Factory function not found in module');
            return null;
        }
        
        // Instantiate scraper based on factory type
        if (scraperDoc.factoryType === 'class') {
            // Class constructor: new FactoryClass()
            return new factory();
        } else if (scraperDoc.factoryType === 'function') {
            // Factory function: createDenBoschScraper(options?)
            // Most factory functions take optional ScraperOptions
            // For now, call without arguments (options can be added later if needed)
            return factory();
        } else {
            // Factory that returns instance: factory()
            return factory();
        }
    } catch (error) {
        logger.error({ 
            scraperId: scraperDoc.scraperId, 
            error: error instanceof Error ? error.message : String(error) 
        }, 'Failed to load scraper from metadata');
        return null;
    }
}

/**
 * Cache for municipality lookups to avoid repeated database queries
 * Key: hostname (normalized), Value: municipality info, TTL: 5 minutes
 */
const municipalityCache = new Map<string, { data: { naam: string; website?: string } | null; expiresAt: number }>();
const MUNICIPALITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Helper function to check if a URL belongs to a municipality in the gemeenten collection
 * Results are cached for 5 minutes to improve performance
 * @param url - The website URL
 * @param hostname - The hostname (lowercase)
 * @returns Municipality info if found, null otherwise
 */
async function getMunicipalityFromUrl(url: string, hostname: string): Promise<{ naam: string; website?: string } | null> {
    // Check cache first
    const cacheKey = hostname.toLowerCase();
    const cached = municipalityCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        logger.debug({ url, hostname, cached: true }, 'Municipality lookup cache hit');
        if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
            console.log(`[DEBUG] getMunicipalityFromUrl (cached): hostname="${hostname}", municipality="${cached.data?.naam || 'null'}"`);
        }
        return cached.data;
    }
    
    try {
        const db = getDB();
        const gemeentenCollection = db.collection('gemeenten');
        
        // Extract potential municipality name from hostname
        // Examples: www.amsterdam.nl -> amsterdam, www.rotterdam.nl -> rotterdam
        const hostnameWithoutWww = hostname.replace(/^www\./, '');
        const potentialName = hostnameWithoutWww.split('.')[0]; // Get first part before first dot
        
        // Try to find municipality by website URL (exact match or contains)
        // Match if the website field contains the hostname
        let gemeente = await gemeentenCollection.findOne({
            website: { $regex: new RegExp(hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        });
        
        // If not found by website, try by name using improved matching
        if (!gemeente) {
            const { createMunicipalityNameQuery, findBestMatch } = await import('../../utils/municipalityNameMatcher.js');
            const query = createMunicipalityNameQuery(potentialName);
            gemeente = await gemeentenCollection.findOne(query);
        }
        
        // If still not found, try best match algorithm with all municipalities
        if (!gemeente) {
            const { findBestMatch } = await import('../../utils/municipalityNameMatcher.js');
            const allGemeenten = await gemeentenCollection.find({}).toArray();
            const candidateNames = allGemeenten
                .map((g: any) => g?.naam)
                .filter((name): name is string => !!name);
            
            const bestMatch = findBestMatch(potentialName, candidateNames);
            if (bestMatch) {
                gemeente = allGemeenten.find((g: any) => g?.naam === bestMatch) || null;
            }
        }
        
        const result = gemeente && gemeente.naam ? {
            naam: gemeente.naam,
            website: gemeente.website
        } : null;
        
        // Debug logging for test environment
        if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
            console.log(`[DEBUG] getMunicipalityFromUrl: hostname="${hostname}", found=${!!gemeente}, municipality="${result?.naam || 'null'}"`);
        }
        
        // Cache the result (even if null, to avoid repeated failed lookups)
        municipalityCache.set(cacheKey, {
            data: result,
            expiresAt: Date.now() + MUNICIPALITY_CACHE_TTL
        });
        
        // Clean up expired cache entries periodically (keep cache size manageable)
        if (municipalityCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of municipalityCache.entries()) {
                if (now >= value.expiresAt) {
                    municipalityCache.delete(key);
                }
            }
        }
        
        return result;
    } catch (error) {
        // If database lookup fails, log but don't throw (non-critical)
        logger.debug({ url, error: error instanceof Error ? error.message : String(error) }, 'Failed to lookup municipality from gemeenten collection');
        
        // Cache null result to avoid repeated failed lookups
        municipalityCache.set(cacheKey, {
            data: null,
            expiresAt: Date.now() + MUNICIPALITY_CACHE_TTL
        });
        
        return null;
    }
}

/**
 * Clear the municipality lookup cache
 * Useful for testing or when municipality data is updated
 */
export function clearMunicipalityCache(): void {
    municipalityCache.clear();
    logger.debug('Municipality lookup cache cleared');
}

/**
 * Get appropriate scraper for a URL and topic
 * 
 * PRIORITY ORDER (most specific to least specific):
 * 1. Topic + Location match (e.g., HorstAanDeMaasArbeidsmigrantenScraper for "arbeidsmigranten" + "Horst aan de Maas")
 * 2. Location-only match (e.g., HorstAanDeMaasScraper for "Horst aan de Maas")
 * 3. Location category match (e.g., GemeenteScraper for any municipality)
 * 4. Specific plugins (dynamic scrapers registered via plugin registry)
 * 5. Generic fallbacks (Rijksoverheid, generic policy scrapers)
 * 
 * This order ensures the most specific scraper is selected first, falling back to less specific options.
 * 
 * @param url - The website URL to scrape
 * @param websiteTitle - Optional title of the website for better detection
 * @param onderwerp - Optional topic/subject to help select specialized scrapers
 * @returns Promise resolving to a configured scraper instance, or null if no suitable scraper found
 */
export async function getScraperForUrl(url: string, websiteTitle?: string, onderwerp?: string): Promise<BaseScraper | null> {
    // Debug logging for test environment
    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
        console.log(`[DEBUG] getScraperForUrl called: url="${url}", websiteTitle="${websiteTitle}"`);
    }
    
    // Handle invalid/empty URLs gracefully
    if (!url || typeof url !== 'string' || url.trim() === '') {
        logger.warn({ url, websiteTitle }, 'Invalid or empty URL provided to getScraperForUrl');
        return null;
    }

    let urlObj: URL;
    let hostname: string;
    try {
        urlObj = new URL(url);
        hostname = urlObj.hostname.toLowerCase();
    } catch (error) {
        logger.warn({ url, error: error instanceof Error ? error.message : String(error) }, 'Invalid URL format provided to getScraperForUrl');
        // Return null for invalid URLs instead of throwing
        return null;
    }
    
    const urlLower = url.toLowerCase();

    // ============================================
    // PRIORITY 1: Topic + Location Match (Most Specific)
    // ============================================
    // Check for location-specific scrapers with topic-specific variants
    // Example: Horst aan de Maas + "arbeidsmigranten" → HorstAanDeMaasArbeidsmigrantenScraper
    
    // 1.1. Horst aan de Maas with topic-specific scrapers
    // Only check topic-specific if both location AND topic match
    if (hostname.includes('horstaandemaas') && onderwerp) {
        const onderwerpLower = onderwerp.toLowerCase();
        
        // Check for arbeidsmigranten (labor migrants) topic - most specific
        if (onderwerpLower.includes('arbeid')) {
            return new HorstAanDeMaasArbeidsmigrantenScraper();
        }
        
        // Check for betaalbare huisvesting (affordable housing)
        if (onderwerpLower.includes('betaalbare') || 
            (onderwerpLower.includes('huisvesting') && !onderwerpLower.includes('arbeid'))) {
            return new HorstAanDeMaasBetaalbareHuisvestingScraper();
        }
        
        // Check for klimaatadaptatie (climate adaptation) - specific
        if (onderwerpLower.includes('klimaatadaptatie')) {
            return new HorstAanDeMaasKlimaatadaptatieScraper();
        }
        
        // Check for klimaatverandering en veerkracht (climate change and resilience)
        if (onderwerpLower.includes('klimaatverandering') || 
            (onderwerpLower.includes('veerkracht') && onderwerpLower.includes('klimaat'))) {
            return new HorstAanDeMaasKlimaatVeerkrachtScraper();
        }
        
        // Check for duurzame mobiliteit (sustainable mobility)
        if (onderwerpLower.includes('duurzame mobiliteit') || 
            (onderwerpLower.includes('mobiliteit') && onderwerpLower.includes('duurzaam'))) {
            return new HorstAanDeMaasDuurzameMobiliteitScraper();
        }
        
        // Check for groene infrastructuur (green infrastructure)
        if (onderwerpLower.includes('groene infrastructuur') || 
            (onderwerpLower.includes('groen') && onderwerpLower.includes('infrastructuur'))) {
            return new HorstAanDeMaasGroeneInfrastructuurScraper();
        }
        
        // Check for participatieve planning (participatory planning)
        if (onderwerpLower.includes('participatieve planning') || 
            (onderwerpLower.includes('participatie') && onderwerpLower.includes('planning'))) {
            return new HorstAanDeMaasParticipatievePlanningScraper();
        }
        
        // Check for stedelijke vernieuwing (urban renewal)
        if (onderwerpLower.includes('stedelijke vernieuwing') || 
            (onderwerpLower.includes('vernieuwing') && onderwerpLower.includes('stedelijk'))) {
            return new HorstAanDeMaasStedelijkeVernieuwingScraper();
        }
        
        // Check for slimme steden (smart cities)
        if (onderwerpLower.includes('slimme steden') || 
            onderwerpLower.includes('slimme stad') ||
            (onderwerpLower.includes('slim') && (onderwerpLower.includes('stad') || onderwerpLower.includes('steden'))) ||
            onderwerpLower.includes('smart city')) {
            return new HorstAanDeMaasSlimmeStedenScraper();
        }
        
        // Check for energie (energy) topic - matches "energie", "energietransitie", etc.
        if (onderwerpLower.includes('energie')) {
            return new HorstAanDeMaasEnergietransitieScraper();
        }
        
        // Check for klimaat (climate) - general climate topics
        if (onderwerpLower.includes('klimaat')) {
            // Prefer klimaatadaptatie if not already matched
            return new HorstAanDeMaasKlimaatadaptatieScraper();
        }
        
        // Check for mobiliteit (mobility) - general mobility topics
        if (onderwerpLower.includes('mobiliteit') || onderwerpLower.includes('vervoer') || onderwerpLower.includes('verkeer')) {
            return new HorstAanDeMaasDuurzameMobiliteitScraper();
        }
        
        // Check for groen (green) - general green/nature topics
        if (onderwerpLower.includes('groen') || onderwerpLower.includes('natuur') || onderwerpLower.includes('biodiversiteit')) {
            return new HorstAanDeMaasGroeneInfrastructuurScraper();
        }
        
        // Check for participatie (participation) - general participation topics
        if (onderwerpLower.includes('participatie') || onderwerpLower.includes('betrokkenheid')) {
            return new HorstAanDeMaasParticipatievePlanningScraper();
        }
        
        // Check for vernieuwing (renewal) - general renewal/transformation topics
        if (onderwerpLower.includes('vernieuwing') || onderwerpLower.includes('herstructurering') || onderwerpLower.includes('transformatie')) {
            return new HorstAanDeMaasStedelijkeVernieuwingScraper();
        }
        
        // Check for digital/smart topics
        if (onderwerpLower.includes('slim') || onderwerpLower.includes('smart') || 
            onderwerpLower.includes('digitale') || onderwerpLower.includes('ict') || 
            onderwerpLower.includes('technologie')) {
            return new HorstAanDeMaasSlimmeStedenScraper();
        }
        
        // If no topic-specific match found, continue to Priority 2 (location-only match)
    }

    // ============================================
    // PRIORITY 2: Location-Only Match
    // ============================================
    // Check for location-specific scrapers without topic-specific variants
    // Example: Horst aan de Maas (no topic) → HorstAanDeMaasScraper
    // Example: Amsterdam → AmsterdamPolicyScraper
    
    // 2.1. Check for Horst aan de Maas base scraper (if no topic-specific match found)
    if (hostname.includes('horstaandemaas')) {
        return new HorstAanDeMaasScraper();
    }

    // 2.2. Check database for municipality-specific scrapers FIRST (database takes priority)
    // This checks the scrapers collection for scrapers configured for the municipality
    // Database-driven scrapers should take precedence over hardcoded registry
    try {
        const municipalityInfo = await getMunicipalityFromUrl(url, hostname);
        if (municipalityInfo) {
            const { naam } = municipalityInfo;
            
            // Check if municipality has a scraper configured in database
            // Debug logging for test environment
            if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                console.log(`[DEBUG] Looking up scraper for municipality: "${naam}"`);
            }
            
            const scraperDoc = await scraperRegistryService.getScraperForMunicipality(naam);
            
            // Debug logging for test environment
            if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                console.log(`[DEBUG] getScraperForUrl: municipality="${naam}", foundScraper=${!!scraperDoc}, scraperId=${scraperDoc?.scraperId}, gemeenteNaam=${scraperDoc?.municipality?.gemeenteNaam}`);
            }
            
            logger.debug({ 
                url, 
                municipality: naam,
                foundScraper: !!scraperDoc,
                scraperId: scraperDoc?.scraperId,
                isActive: scraperDoc?.isActive,
                isDeprecated: scraperDoc?.isDeprecated,
                gemeenteNaam: scraperDoc?.municipality?.gemeenteNaam
            }, 'Database scraper lookup result');
            
            if (scraperDoc && scraperDoc.isActive && !scraperDoc.isDeprecated) {
                // Load scraper from database metadata
                const scraper = await loadScraperFromMetadata(scraperDoc, url, websiteTitle, onderwerp);
                if (scraper) {
                    // Store scraperId in the scraper instance for identification
                    // This allows tests to verify the correct scraper was selected
                    (scraper as any).__scraperId = scraperDoc.scraperId;
                    (scraper as any).__scraperName = scraperDoc.scraperName;
                    
                    logger.info({ 
                        url, 
                        municipality: naam, 
                        scraperId: scraperDoc.scraperId,
                        scraperName: scraperDoc.scraperName,
                        factoryType: scraperDoc.factoryType,
                        factoryExport: scraperDoc.factoryExport,
                        constructorName: scraper.constructor.name
                    }, '✅ Using scraper from database mapping');
                    return scraper;
                } else {
                    logger.warn({ 
                        url, 
                        municipality: naam, 
                        scraperId: scraperDoc.scraperId 
                    }, 'Failed to load scraper from metadata (loadScraperFromMetadata returned null)');
                }
            } else {
                logger.debug({ 
                    url, 
                    municipality: naam,
                    foundScraper: !!scraperDoc,
                    isActive: scraperDoc?.isActive,
                    isDeprecated: scraperDoc?.isDeprecated
                }, 'No active scraper found in database for municipality');
            }
        } else {
            logger.debug({ url, hostname }, 'Municipality not found in gemeenten collection');
        }
    } catch (error) {
        // If database lookup fails, log but continue to fallback options
        logger.debug({ url, error: error instanceof Error ? error.message : String(error) }, 'Failed to lookup scraper from database');
    }

    // 2.3. Check for other specific municipality scrapers in the registry (fallback)
    // Only check registry if database lookup didn't find a scraper
    for (const [domain, factory] of Object.entries(MUNICIPALITY_SCRAPERS)) {
        if (hostname.includes(domain)) {
            if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
                console.log(`[DEBUG] Using hardcoded registry scraper for domain: ${domain}`);
            }
            return factory();
        }
    }

    // ============================================
    // PRIORITY 3: Location Category Match
    // ============================================
    // Check for category-based scrapers (e.g., all municipalities → GemeenteScraper)
    
    // 3.1. Check if URL is from a municipality in the gemeenten collection
    // 
    // IMPORTANT: This step ensures that when a municipality website is selected:
    // - If the municipality has a specific scraper (e.g., Horst aan de Maas, Amsterdam),
    //   that specific scraper is used (handled in steps 2-3 above, which return early)
    // - If the municipality does NOT have a specific scraper, GemeenteScraper is used
    //
    // This step only runs if no specific scraper was found in steps 2-3 (they return early).
    // Therefore, if we reach here, it means:
    // 1. The URL belongs to a municipality in the gemeenten collection
    // 2. No specific scraper exists for this municipality
    // 3. We should use the generic GemeenteScraper
    const municipalityInfo = await getMunicipalityFromUrl(url, hostname);
    if (municipalityInfo) {
        const { naam } = municipalityInfo;
        
        // Use GemeenteScraper for municipalities without specific scrapers
        const gemeenteNaam = naam || websiteTitle || 'Gemeente';
        logger.debug({ url, municipality: naam, hostname }, 'Using GemeenteScraper for municipality website from gemeenten collection (no specific scraper found)');
        return new GemeenteScraper(url, gemeenteNaam);
    }

    // 3.2. Generic gemeente scraper for municipal sites (using old GemeenteScraper)
    // This handles cases where URL/title contains "gemeente" but municipality is not in database
    if (urlLower.includes('gemeente') || websiteTitle?.toLowerCase().includes('gemeente')) {
        const gemeenteNaam = websiteTitle || 'Gemeente';
        return new GemeenteScraper(url, gemeenteNaam);
    }

    // ============================================
    // PRIORITY 4: Specific Plugins (Dynamic Scrapers)
    // ============================================
    // Check plugin registry for dynamically registered scrapers
    // These may be location-specific but registered at runtime
    // NOTE: Plugin registry is checked AFTER location-specific scrapers to prevent
    // generic plugins from overriding more specific built-in scrapers
    const pluginScraper = scraperRegistry.createScraperForUrl(url, websiteTitle, onderwerp);
    if (pluginScraper) {
        return pluginScraper;
    }

    // ============================================
    // PRIORITY 5: Generic Fallbacks
    // ============================================
    // Generic scrapers for known domains or fallback options
    
    // 5.1. Check for Rijksoverheid (national level)
    if (urlLower.includes('rijksoverheid.nl')) {
        return new RijksoverheidScraper();
    }

    // 5.2. For other .nl government/policy sites, use AI-guided scraper if enabled, otherwise generic MunicipalityPolicyScraper
    if (hostname.endsWith('.nl')) {
        const siteName = websiteTitle || hostname.replace('www.', '').split('.')[0];
        
        // Use AI-guided scraper if enabled
        if (process.env.AI_CRAWLING_ENABLED === 'true') {
            return new AIGuidedScraper(url, {
                maxDepth: parseInt(process.env.AI_CRAWLING_MAX_DEPTH || '4', 10),
                useSiteSearch: process.env.AI_CRAWLING_USE_SITE_SEARCH !== 'false',
                useAINavigation: true,
                aggressiveness: (process.env.AI_CRAWLING_AGGRESSIVENESS as 'low' | 'medium' | 'high') || 'medium'
            }) as BaseScraper;
        }
        
        // Fallback to generic MunicipalityPolicyScraper
        return createMunicipalityScraper(url, siteName, {}, {
            maxDepth: 2,
            followLinks: true
        });
    }

    // 6. If AI crawling is enabled globally, use AI-guided scraper as fallback
    if (process.env.AI_CRAWLING_ENABLED === 'true') {
        return new AIGuidedScraper(url, {
            maxDepth: parseInt(process.env.AI_CRAWLING_MAX_DEPTH || '4', 10),
            useSiteSearch: process.env.AI_CRAWLING_USE_SITE_SEARCH !== 'false',
            useAINavigation: true,
            aggressiveness: (process.env.AI_CRAWLING_AGGRESSIVENESS as 'low' | 'medium' | 'high') || 'medium'
        }) as BaseScraper;
    }

    return null;
}

/**
 * Get a scraper by name/identifier
 * Useful for direct instantiation in workflows
 * 
 * @param scraperName - Identifier for the scraper (e.g., 'rijksoverheid', 'amsterdam', 'gemeente')
 * @param baseUrl - Base URL for the scraper (required for generic scrapers)
 * @param options - Additional options for scraper configuration
 */
export async function getScraperByName(
    scraperName: string, 
    baseUrl?: string,
    options?: { websiteTitle?: string; onderwerp?: string }
): Promise<BaseScraper | null> {
    const nameLower = scraperName.toLowerCase();

    switch (nameLower) {
        case 'rijksoverheid':
            return new RijksoverheidScraper();
        
        case 'amsterdam':
            return new AmsterdamPolicyScraper();
        
        case 'horstaandemaas':
        case 'horst':
        case 'horst aan de maas':
            // Check if we have a topic-specific scraper to use
            if (options?.onderwerp) {
                const onderwerpLower = options.onderwerp.toLowerCase();
                
                // Use the same routing logic as getScraperForUrl
                if (onderwerpLower.includes('arbeid')) {
                    return new HorstAanDeMaasArbeidsmigrantenScraper();
                }
                if (onderwerpLower.includes('betaalbare') || 
                    (onderwerpLower.includes('huisvesting') && !onderwerpLower.includes('arbeid'))) {
                    return new HorstAanDeMaasBetaalbareHuisvestingScraper();
                }
                if (onderwerpLower.includes('klimaatadaptatie')) {
                    return new HorstAanDeMaasKlimaatadaptatieScraper();
                }
                if (onderwerpLower.includes('klimaatverandering') || 
                    (onderwerpLower.includes('veerkracht') && onderwerpLower.includes('klimaat'))) {
                    return new HorstAanDeMaasKlimaatVeerkrachtScraper();
                }
                if (onderwerpLower.includes('duurzame mobiliteit') || 
                    (onderwerpLower.includes('mobiliteit') && onderwerpLower.includes('duurzaam'))) {
                    return new HorstAanDeMaasDuurzameMobiliteitScraper();
                }
                if (onderwerpLower.includes('groene infrastructuur') || 
                    (onderwerpLower.includes('groen') && onderwerpLower.includes('infrastructuur'))) {
                    return new HorstAanDeMaasGroeneInfrastructuurScraper();
                }
                if (onderwerpLower.includes('participatieve planning') || 
                    (onderwerpLower.includes('participatie') && onderwerpLower.includes('planning'))) {
                    return new HorstAanDeMaasParticipatievePlanningScraper();
                }
                if (onderwerpLower.includes('stedelijke vernieuwing') || 
                    (onderwerpLower.includes('vernieuwing') && onderwerpLower.includes('stedelijk'))) {
                    return new HorstAanDeMaasStedelijkeVernieuwingScraper();
                }
                if (onderwerpLower.includes('slimme steden') || 
                    onderwerpLower.includes('slimme stad') ||
                    (onderwerpLower.includes('slim') && (onderwerpLower.includes('stad') || onderwerpLower.includes('steden'))) ||
                    onderwerpLower.includes('smart city')) {
                    return new HorstAanDeMaasSlimmeStedenScraper();
                }
                if (onderwerpLower.includes('energie')) {
                    return new HorstAanDeMaasEnergietransitieScraper();
                }
                if (onderwerpLower.includes('klimaat')) {
                    return new HorstAanDeMaasKlimaatadaptatieScraper();
                }
                if (onderwerpLower.includes('mobiliteit') || onderwerpLower.includes('vervoer') || onderwerpLower.includes('verkeer')) {
                    return new HorstAanDeMaasDuurzameMobiliteitScraper();
                }
                if (onderwerpLower.includes('groen') || onderwerpLower.includes('natuur') || onderwerpLower.includes('biodiversiteit')) {
                    return new HorstAanDeMaasGroeneInfrastructuurScraper();
                }
                if (onderwerpLower.includes('participatie') || onderwerpLower.includes('betrokkenheid')) {
                    return new HorstAanDeMaasParticipatievePlanningScraper();
                }
                if (onderwerpLower.includes('vernieuwing') || onderwerpLower.includes('herstructurering') || onderwerpLower.includes('transformatie')) {
                    return new HorstAanDeMaasStedelijkeVernieuwingScraper();
                }
                if (onderwerpLower.includes('slim') || onderwerpLower.includes('smart') || 
                    onderwerpLower.includes('digitale') || onderwerpLower.includes('ict') || 
                    onderwerpLower.includes('technologie')) {
                    return new HorstAanDeMaasSlimmeStedenScraper();
                }
            }
            return new HorstAanDeMaasScraper();
        
        case 'gemeente':
        case 'municipality':
            if (!baseUrl) {
                console.error('baseUrl required for gemeente scraper');
                return null;
            }
            return new GemeenteScraper(baseUrl, options?.websiteTitle || 'Gemeente');
        
        case 'policy':
        case 'beleid':
        case 'generic':
            if (!baseUrl) {
                console.error('baseUrl required for generic policy scraper');
                return null;
            }
            return createMunicipalityScraper(
                baseUrl, 
                options?.websiteTitle || 'Beleidsbron',
                {},
                { maxDepth: 2, followLinks: true }
            );
        
        default:
            // Try URL-based detection
            if (baseUrl) {
                return await getScraperForUrl(baseUrl, options?.websiteTitle, options?.onderwerp);
            }
            return null;
    }
}

/**
 * List all available scraper types
 */
export function listAvailableScrapers(): Array<{
    name: string;
    description: string;
    requiresBaseUrl: boolean;
    domains?: string[];
}> {
    return [
        {
            name: 'rijksoverheid',
            description: 'Scraper voor rijksoverheid.nl beleidsdocumenten',
            requiresBaseUrl: false,
            domains: ['rijksoverheid.nl']
        },
        {
            name: 'amsterdam',
            description: 'Scraper voor amsterdam.nl beleidsdocumenten',
            requiresBaseUrl: false,
            domains: ['amsterdam.nl']
        },
        {
            name: 'horstaandemaas',
            description: 'Scraper voor Gemeente Horst aan de Maas beleidsdocumenten (incl. Omgevingsvisie 2040)',
            requiresBaseUrl: false,
            domains: ['horstaandemaas.nl', 'horstaandemaas2040.nl']
        },
        {
            name: 'gemeente',
            description: 'Generieke scraper voor gemeentelijke websites',
            requiresBaseUrl: true
        },
        {
            name: 'policy',
            description: 'Generieke beleidsdocument scraper voor .nl websites',
            requiresBaseUrl: true
        }
    ];
}
