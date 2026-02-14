import { HorstAanDeMaasScraper } from './HorstAanDeMaasScraper.js';
import { ScraperOptions } from './baseScraper.js';

/**
 * Base class for specialized Horst aan de Maas scrapers
 * Provides common configuration defaults like maxDepth and followLinks
 */
export class HorstAanDeMaasSpecializedScraper extends HorstAanDeMaasScraper {
    constructor(options: ScraperOptions = {}) {
        super({
            maxDepth: 4, // Deeper crawl for comprehensive coverage
            followLinks: true,
            ...options
        });
    }
}
