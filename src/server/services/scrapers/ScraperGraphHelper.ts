/**
 * Scraper Graph Helper
 * 
 * Utility functions to help scrapers manage their graph objects with inheritance and merging.
 */

import { Driver } from 'neo4j-driver';
import { ScraperGraphManager } from '../scraperGraph/ScraperGraphManager.js';
import { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';
import { getNeo4jDriver } from '../../config/neo4j.js';
import { BaseScraper } from './baseScraper.js';

let graphManagerInstance: ScraperGraphManager | null = null;

/**
 * Get or create the global ScraperGraphManager instance
 */
function getGraphManager(): ScraperGraphManager {
    if (!graphManagerInstance) {
        const driver = getNeo4jDriver();
        if (!driver) {
            throw new Error('Neo4j driver not available. Cannot create ScraperGraphManager.');
        }
        graphManagerInstance = new ScraperGraphManager(driver);
    }
    return graphManagerInstance;
}

/**
 * Get the scraper name from a scraper class instance
 */
export function getScraperName(scraperInstance: BaseScraper): string {
    return scraperInstance.constructor.name;
}

/**
 * Get the parent scraper name from a scraper class
 */
export function getParentScraperName(scraperClass: new (...args: unknown[]) => BaseScraper): string | null {
    const parentClass = Object.getPrototypeOf(Object.getPrototypeOf(scraperClass));
    
    if (!parentClass || parentClass.name === 'BaseScraper' || parentClass.name === 'Object') {
        return null;
    }

    const parentName = parentClass.name;
    if (parentName.includes('Scraper') && parentName !== 'BaseScraper') {
        return parentName;
    }

    return null;
}

/**
 * Initialize graph for a scraper, inheriting from parent if available
 */
export async function initializeScraperGraph(
    scraperInstance: BaseScraper,
    graph: NavigationGraph
): Promise<void> {
    const manager = getGraphManager();
    await manager.initialize();

    const scraperName = getScraperName(scraperInstance);
    const parentName = getParentScraperName(scraperInstance.constructor as new (...args: unknown[]) => BaseScraper);

    // Check if graph already exists
    const existingVersion = await manager.getVersion(scraperName);
    
    if (existingVersion) {
        console.log(`📂 Graph already exists for ${scraperName}`);
        // Load existing graph from file to Neo4j
        await manager.importGraphToNeo4j(scraperName, graph);
        return;
    }

    // If parent exists, inherit from it
    if (parentName) {
        const parentVersion = await manager.getVersion(parentName);
        
        if (parentVersion) {
            console.log(`📥 Inheriting graph from parent: ${parentName}`);
            try {
                await manager.inheritFromParent(scraperName, parentName);
                await manager.importGraphToNeo4j(scraperName, graph);
                return;
            } catch (error) {
                console.warn(`⚠️  Could not inherit from parent: ${error}`);
            }
        }
    }

    // Create new graph
    console.log(`📝 Creating new graph for ${scraperName}`);
    await manager.exportGraphToFile(scraperName, graph);
}

/**
 * Save current graph state for a scraper
 */
export async function saveScraperGraph(
    scraperInstance: BaseScraper,
    graph: NavigationGraph
): Promise<void> {
    const manager = getGraphManager();
    const scraperName = getScraperName(scraperInstance);
    
    await manager.exportGraphToFile(scraperName, graph);
    console.log(`💾 Saved graph for ${scraperName}`);
}

/**
 * Merge scraper graph with parent (like git merge)
 */
export async function mergeScraperGraphWithParent(
    scraperInstance: BaseScraper,
    conflictResolution: 'parent' | 'child' | 'merge' = 'merge'
): Promise<import('../scraperGraph/ScraperGraphManager.js').GraphMergeResult> {
    const manager = getGraphManager();
    const scraperName = getScraperName(scraperInstance);
    const parentName = getParentScraperName(scraperInstance.constructor as new (...args: unknown[]) => BaseScraper);

    if (!parentName) {
        throw new Error(`Scraper ${scraperName} has no parent scraper`);
    }

    return await manager.mergeGraphs(scraperName, parentName, conflictResolution);
}

/**
 * Load graph from file for a scraper
 */
export async function loadScraperGraph(
    scraperInstance: BaseScraper
): Promise<import('../graphs/navigation/NavigationGraph.js').NavigationGraphData | null> {
    const manager = getGraphManager();
    const scraperName = getScraperName(scraperInstance);
    
    return await manager.loadGraphFromFile(scraperName);
}

/**
 * Get graph version info for a scraper
 */
export async function getScraperGraphVersion(
    scraperInstance: BaseScraper
): Promise<import('../scraperGraph/ScraperGraphManager.js').GraphVersion | null> {
    const manager = getGraphManager();
    const scraperName = getScraperName(scraperInstance);
    
    return await manager.getVersion(scraperName);
}

