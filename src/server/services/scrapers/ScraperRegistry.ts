/**
 * ScraperRegistry
 * 
 * Central registry for scraper plugins with dynamic registration capabilities.
 * Provides scraper discovery, URL pattern matching, and metadata tracking.
 * 
 * @module ScraperRegistry
 */

import { BaseScraper } from './baseScraper.js';
import { logger } from '../../utils/logger.js';

/**
 * Metadata for a scraper plugin
 */
export interface ScraperPluginMetadata {
    /** Unique identifier for the scraper (e.g., "rotterdam", "custom-municipality") */
    id: string;
    
    /** Human-readable name (e.g., "Rotterdam Policy Scraper") */
    name: string;
    
    /** Description of what the scraper does */
    description: string;
    
    /** Domains this scraper handles (e.g., ["rotterdam.nl", "gemeente-rotterdam.nl"]) */
    domains?: string[];
    
    /** URL patterns to match (regex strings, e.g., ["rotterdam\\.nl/beleid"]) */
    urlPatterns?: string[];
    
    /** Optional version string */
    version?: string;
}

/**
 * Factory function type for creating scraper instances
 */
export type ScraperFactory = (
    url?: string,
    websiteTitle?: string,
    onderwerp?: string
) => BaseScraper;

/**
 * Registry entry for a scraper plugin
 */
export interface ScraperRegistryEntry {
    metadata: ScraperPluginMetadata;
    factory: ScraperFactory;
    registeredAt: Date;
    usageCount: number;
    enabled?: boolean; // Whether the plugin is enabled (default: true)
}

/**
 * Options for registering a scraper
 */
export interface ScraperRegistrationOptions {
    /** URL patterns to match (regex strings) */
    urlPatterns?: string[];
    
    /** Domains this scraper handles */
    domains?: string[];
    
    /** Priority for matching (higher = checked first, default: 0) */
    priority?: number;
}

/**
 * Registry for scraper plugins
 */
export class ScraperRegistry {
    private scrapers: Map<string, ScraperRegistryEntry> = new Map();
    private scrapersByDomain: Map<string, Set<string>> = new Map();
    private scrapersByPattern: Array<{ pattern: RegExp; scraperId: string; priority: number }> = [];

    /**
     * Register a scraper plugin in the registry
     * 
     * @param metadata Scraper metadata
     * @param factory Factory function that creates scraper instances
     * @param options Optional registration options
     * @throws Error if scraper ID already exists
     * 
     * @example
     * ```typescript
     * scraperRegistry.register(
     *   {
     *     id: 'rotterdam',
     *     name: 'Rotterdam Policy Scraper',
     *     description: 'Scraper for Rotterdam municipality policy documents',
     *     domains: ['rotterdam.nl']
     *   },
     *   (url, title, onderwerp) => new RotterdamScraper(url)
     * );
     * ```
     */
    register(
        metadata: ScraperPluginMetadata,
        factory: ScraperFactory,
        options: ScraperRegistrationOptions = {}
    ): void {
        // Check if scraper already exists
        if (this.scrapers.has(metadata.id)) {
            throw new Error(`Scraper with ID "${metadata.id}" is already registered`);
        }

        // Create registry entry
        const entry: ScraperRegistryEntry = {
            metadata: {
                ...metadata,
                domains: options.domains || metadata.domains || [],
                urlPatterns: options.urlPatterns || metadata.urlPatterns || [],
            },
            factory,
            registeredAt: new Date(),
            usageCount: 0,
            enabled: true, // Default to enabled
        };

        // Store scraper
        this.scrapers.set(metadata.id, entry);

        // Index by domain
        const domains = entry.metadata.domains || [];
        for (const domain of domains) {
            const domainKey = domain.toLowerCase();
            if (!this.scrapersByDomain.has(domainKey)) {
                this.scrapersByDomain.set(domainKey, new Set());
            }
            this.scrapersByDomain.get(domainKey)!.add(metadata.id);
        }

        // Index by URL pattern
        const urlPatterns = entry.metadata.urlPatterns || [];
        const priority = options.priority || 0;
        for (const pattern of urlPatterns) {
            try {
                const regex = new RegExp(pattern);
                this.scrapersByPattern.push({ pattern: regex, scraperId: metadata.id, priority });
            } catch (error) {
                logger.warn({ pattern, scraperId: metadata.id, error }, 'Invalid URL pattern regex, skipping');
            }
        }

        // Sort patterns by priority (higher priority first)
        this.scrapersByPattern.sort((a, b) => b.priority - a.priority);

        logger.info(`Registered scraper plugin: ${metadata.id} (${metadata.name})`);
    }

    /**
     * Get a scraper by ID
     * 
     * @param scraperId Scraper identifier
     * @returns Registry entry or undefined
     */
    get(scraperId: string): ScraperRegistryEntry | undefined {
        const entry = this.scrapers.get(scraperId);
        if (entry) {
            entry.usageCount++;
        }
        return entry;
    }

    /**
     * Get all registered scrapers
     * 
     * @returns Array of all scraper entries
     */
    getAll(): ScraperRegistryEntry[] {
        return Array.from(this.scrapers.values());
    }

    /**
     * Find a scraper for a given URL
     * Checks URL patterns first (by priority), then domains
     * 
     * @param url The URL to find a scraper for
     * @param websiteTitle Optional website title for context
     * @param onderwerp Optional topic/subject
     * @returns Registry entry or undefined
     */
    findForUrl(url: string, websiteTitle?: string, onderwerp?: string): ScraperRegistryEntry | undefined {
        const urlLower = url.toLowerCase();

        // Check URL patterns first (sorted by priority)
        for (const { pattern, scraperId } of this.scrapersByPattern) {
            if (pattern.test(urlLower)) {
                const entry = this.scrapers.get(scraperId);
                if (entry) {
                    entry.usageCount++;
                    return entry;
                }
            }
        }

        // Check domains
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            
            // Check exact domain match
            const domainScrapers = this.scrapersByDomain.get(hostname);
            if (domainScrapers && domainScrapers.size > 0) {
                // Use first matching scraper (could be enhanced to use priority)
                const scraperId = Array.from(domainScrapers)[0];
                const entry = this.scrapers.get(scraperId);
                if (entry) {
                    entry.usageCount++;
                    return entry;
                }
            }

            // Check partial domain match (e.g., "rotterdam.nl" matches "www.rotterdam.nl")
            for (const [domain, scraperIds] of this.scrapersByDomain.entries()) {
                if (hostname.includes(domain) || hostname.endsWith('.' + domain)) {
                    const scraperId = Array.from(scraperIds)[0];
                    const entry = this.scrapers.get(scraperId);
                    if (entry) {
                        entry.usageCount++;
                        return entry;
                    }
                }
            }
        } catch (error) {
            // Invalid URL, skip domain matching
            logger.debug({ url, error }, 'Invalid URL for domain matching');
        }

        return undefined;
    }

    /**
     * Create a scraper instance for a given URL
     * 
     * @param url The URL to create a scraper for
     * @param websiteTitle Optional website title
     * @param onderwerp Optional topic/subject
     * @returns Scraper instance or null
     */
    createScraperForUrl(url: string, websiteTitle?: string, onderwerp?: string): BaseScraper | null {
        const entry = this.findForUrl(url, websiteTitle, onderwerp);
        if (!entry) {
            return null;
        }

        // Check if plugin is enabled
        if (entry.enabled === false) {
            logger.debug({ scraperId: entry.metadata.id, url }, 'Scraper plugin is disabled');
            return null;
        }

        try {
            return entry.factory(url, websiteTitle, onderwerp);
        } catch (error) {
            logger.error({ scraperId: entry.metadata.id, url, error }, 'Failed to create scraper instance');
            return null;
        }
    }

    /**
     * Enable a scraper plugin
     * 
     * @param scraperId Scraper identifier
     * @returns True if plugin was enabled, false if not found
     */
    enable(scraperId: string): boolean {
        const entry = this.scrapers.get(scraperId);
        if (!entry) {
            return false;
        }

        entry.enabled = true;
        logger.info(`Enabled scraper plugin: ${scraperId}`);
        return true;
    }

    /**
     * Disable a scraper plugin
     * 
     * @param scraperId Scraper identifier
     * @returns True if plugin was disabled, false if not found
     */
    disable(scraperId: string): boolean {
        const entry = this.scrapers.get(scraperId);
        if (!entry) {
            return false;
        }

        entry.enabled = false;
        logger.info(`Disabled scraper plugin: ${scraperId}`);
        return true;
    }

    /**
     * Unregister a scraper
     * 
     * @param scraperId Scraper identifier
     * @returns True if scraper was removed, false if not found
     */
    unregister(scraperId: string): boolean {
        const entry = this.scrapers.get(scraperId);
        if (!entry) {
            return false;
        }

        // Remove from domain index
        const domains = entry.metadata.domains || [];
        for (const domain of domains) {
            const domainKey = domain.toLowerCase();
            const scrapers = this.scrapersByDomain.get(domainKey);
            if (scrapers) {
                scrapers.delete(scraperId);
                if (scrapers.size === 0) {
                    this.scrapersByDomain.delete(domainKey);
                }
            }
        }

        // Remove from pattern index
        this.scrapersByPattern = this.scrapersByPattern.filter(p => p.scraperId !== scraperId);

        // Remove from main registry
        this.scrapers.delete(scraperId);

        logger.info(`Unregistered scraper plugin: ${scraperId}`);
        return true;
    }

    /**
     * Clear all registered scrapers
     */
    clear(): void {
        this.scrapers.clear();
        this.scrapersByDomain.clear();
        this.scrapersByPattern = [];
        logger.info('Cleared all scraper plugins from registry');
    }

    /**
     * Get statistics about registered scrapers
     */
    getStatistics(): {
        totalScrapers: number;
        scrapersByDomain: number;
        scrapersByPattern: number;
        totalUsage: number;
    } {
        const totalUsage = Array.from(this.scrapers.values()).reduce((sum, entry) => sum + entry.usageCount, 0);
        return {
            totalScrapers: this.scrapers.size,
            scrapersByDomain: this.scrapersByDomain.size,
            scrapersByPattern: this.scrapersByPattern.length,
            totalUsage,
        };
    }
}

/**
 * Singleton instance of the scraper registry
 */
export const scraperRegistry = new ScraperRegistry();

