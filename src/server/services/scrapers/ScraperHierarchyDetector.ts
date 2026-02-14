/**
 * Scraper Hierarchy Detector
 * 
 * Automatically detects parent-child relationships between scrapers
 * by analyzing their class inheritance hierarchy.
 */

import { BaseScraper } from './baseScraper.js';

/**
 * Get the parent scraper class name from a scraper instance
 * Returns null if no parent scraper is found (i.e., it's a base scraper)
 */
export function detectParentScraper(scraper: BaseScraper): string | null {
    const scraperClass = scraper.constructor;
    
    // Get the prototype chain
    let currentPrototype = Object.getPrototypeOf(Object.getPrototypeOf(scraperClass));
    
    // Traverse up the prototype chain
    while (currentPrototype && currentPrototype !== Object.prototype) {
        const parentName = currentPrototype.name;
        
        // Check if this is a scraper class (ends with 'Scraper' and is not BaseScraper)
        if (parentName && 
            parentName.endsWith('Scraper') && 
            parentName !== 'BaseScraper' &&
            parentName !== 'Object') {
            return parentName;
        }
        
        // Move up the chain
        currentPrototype = Object.getPrototypeOf(currentPrototype);
    }
    
    return null;
}

/**
 * Get the full inheritance chain for a scraper (from most specific to base)
 * Returns array like: [ChildScraper, ParentScraper, ...]
 */
export function getScraperInheritanceChain(scraper: BaseScraper): string[] {
    const chain: string[] = [];
    const currentClassName = scraper.constructor.name;
    
    // Start from the current scraper and walk up the prototype chain
    let currentPrototype = Object.getPrototypeOf(scraper);
    
    while (currentPrototype && currentPrototype !== Object.prototype) {
        const className = currentPrototype.constructor.name;
        
        // If it's a scraper class, add it to the chain
        if (className && 
            className.endsWith('Scraper') && 
            className !== 'BaseScraper' &&
            className !== 'Object') {
            // Check if we haven't already added this class
            if (!chain.includes(className)) {
                chain.push(className);
            }
        }
        
        // Move up the prototype chain
        currentPrototype = Object.getPrototypeOf(currentPrototype);
    }
    
    // Add the current class at the beginning
    chain.unshift(currentClassName);
    
    return chain;
}

/**
 * Check if a scraper class name is a known scraper (not BaseScraper)
 */
export function isScraperClass(className: string): boolean {
    return className.endsWith('Scraper') && 
           className !== 'BaseScraper' && 
           className !== 'Object';
}

/**
 * Extract scraper ID from class name (removes 'Scraper' suffix if present)
 */
export function getScraperId(className: string): string {
    return className;
}

/**
 * Generate scraper metadata automatically from a scraper instance
 * Attempts to detect parent and create appropriate metadata
 */
export function generateScraperMetadata(
    scraper: BaseScraper,
    scraperId: string,
    scraperName?: string,
    version: string = '1.0.0'
): {
    scraperId: string;
    scraperName: string;
    parentScraperId?: string;
    version: string;
} {
    const detectedParent = detectParentScraper(scraper);
    const className = scraper.constructor.name;
    
    // Generate human-readable name if not provided
    const name = scraperName || className
        .replace(/([A-Z])/g, ' $1')
        .replace(/^ /, '')
        .trim();

    return {
        scraperId: scraperId || className,
        scraperName: name,
        parentScraperId: detectedParent || undefined,
        version
    };
}

