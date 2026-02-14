/**
 * Scraper Registry
 * 
 * Central registry of scrapers with their metadata.
 * Used by both the scraper preset loader and the seed script.
 */

import {
    HorstAanDeMaasScraper,
    HorstAanDeMaasBetaalbareHuisvestingScraper,
    HorstAanDeMaasArbeidsmigrantenScraper,
    HorstAanDeMaasEnergietransitieScraper,
    HorstAanDeMaasKlimaatadaptatieScraper,
    HorstAanDeMaasKlimaatVeerkrachtScraper,
    HorstAanDeMaasDuurzameMobiliteitScraper
} from './index.js';
import { BaseScraper } from './baseScraper.js';
import type { ScraperMetadata } from '../scraperGraph/ScraperGraphVersioning.js';

/**
 * Scraper registry with metadata
 */
export const SCRAPER_REGISTRY: Record<string, {
    factory: () => BaseScraper;
    metadata: Omit<ScraperMetadata, 'createdAt' | 'updatedAt'>;
}> = {
    'HorstAanDeMaasScraper': {
        factory: () => new HorstAanDeMaasScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasScraper',
            scraperName: 'Horst aan de Maas Policy Scraper',
            version: '1.0.0',
            // No parent - this is the base scraper
        }
    },
    'HorstAanDeMaasBetaalbareHuisvestingScraper': {
        factory: () => new HorstAanDeMaasBetaalbareHuisvestingScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasBetaalbareHuisvestingScraper',
            scraperName: 'Horst aan de Maas Betaalbare Huisvesting Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'betaalbare huisvesting',
                keywords: ['betaalbare', 'huisvesting', 'woningbouw']
            }
        }
    },
    'HorstAanDeMaasArbeidsmigrantenScraper': {
        factory: () => new HorstAanDeMaasArbeidsmigrantenScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasArbeidsmigrantenScraper',
            scraperName: 'Horst aan de Maas Arbeidsmigranten Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'arbeidsmigranten huisvesting',
                keywords: ['arbeidsmigrant', 'seizoensarbeid']
            }
        }
    },
    'HorstAanDeMaasEnergietransitieScraper': {
        factory: () => new HorstAanDeMaasEnergietransitieScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasEnergietransitieScraper',
            scraperName: 'Horst aan de Maas Energietransitie Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'energietransitie',
                keywords: ['energie', 'duurzaam', 'transitie']
            }
        }
    },
    'HorstAanDeMaasKlimaatadaptatieScraper': {
        factory: () => new HorstAanDeMaasKlimaatadaptatieScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasKlimaatadaptatieScraper',
            scraperName: 'Horst aan de Maas Klimaatadaptatie Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'klimaatadaptatie',
                keywords: ['klimaat', 'adaptatie', 'water']
            }
        }
    },
    'HorstAanDeMaasKlimaatVeerkrachtScraper': {
        factory: () => new HorstAanDeMaasKlimaatVeerkrachtScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasKlimaatVeerkrachtScraper',
            scraperName: 'Horst aan de Maas Klimaat Veerkracht Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'klimaatverandering en veerkracht',
                keywords: ['klimaat', 'veerkracht', 'resilience']
            }
        }
    },
    'HorstAanDeMaasDuurzameMobiliteitScraper': {
        factory: () => new HorstAanDeMaasDuurzameMobiliteitScraper(),
        metadata: {
            scraperId: 'HorstAanDeMaasDuurzameMobiliteitScraper',
            scraperName: 'Horst aan de Maas Duurzame Mobiliteit Scraper',
            parentScraperId: 'HorstAanDeMaasScraper',
            version: '1.0.0',
            metadata: {
                topic: 'duurzame mobiliteit',
                keywords: ['mobiliteit', 'duurzaam', 'vervoer']
            }
        }
    }
};
