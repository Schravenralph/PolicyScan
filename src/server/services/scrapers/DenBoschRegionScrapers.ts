/**
 * Scrapers for municipalities in the Den Bosch region.
 *
 * Includes 's-Hertogenbosch, Bernheze, Bergen op Zoom, and 15 other mid-sized municipalities.
 */

import { createMunicipalityScraper, MunicipalityPolicyScraper } from './MunicipalityPolicyScraper.js';
import { ScraperOptions } from './baseScraper.js';

// 1. Bernheze
export function createBernhezeScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.bernheze.org',
        'Gemeente Bernheze',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 2. 's-Hertogenbosch
export function createDenBoschScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.s-hertogenbosch.nl',
        'Gemeente \'s-Hertogenbosch',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 3. Bergen op Zoom
export function createBergenOpZoomScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.bergenopzoom.nl',
        'Gemeente Bergen op Zoom',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 4. Boekel
export function createBoekelScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.boekel.nl',
        'Gemeente Boekel',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 5. Maashorst
export function createMaashorstScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.gemeentemaashorst.nl',
        'Gemeente Maashorst',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 6. Sint-Michielsgestel
export function createSintMichielsgestelScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.sint-michielsgestel.nl',
        'Gemeente Sint-Michielsgestel',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 7. Heusden
export function createHeusdenScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.heusden.nl',
        'Gemeente Heusden',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 8. Maasdriel
export function createMaasdrielScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.maasdriel.nl',
        'Gemeente Maasdriel',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 9. Zaltbommel
export function createZaltbommelScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.zaltbommel.nl',
        'Gemeente Zaltbommel',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 10. Boxtel
export function createBoxtelScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.boxtel.nl',
        'Gemeente Boxtel',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 11. Waalwijk
export function createWaalwijkScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.waalwijk.nl',
        'Gemeente Waalwijk',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 12. Loon op Zand
export function createLoonOpZandScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.loonopzand.nl',
        'Gemeente Loon op Zand',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 13. Oisterwijk
export function createOisterwijkScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.oisterwijk.nl',
        'Gemeente Oisterwijk',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 14. Altena
export function createAltenaScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.gemeentealtena.nl',
        'Gemeente Altena',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 15. Dongen
export function createDongenScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.dongen.nl',
        'Gemeente Dongen',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 16. Geertruidenberg
export function createGeertruidenbergScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.geertruidenberg.nl',
        'Gemeente Geertruidenberg',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 17. Gilze en Rijen
export function createGilzeEnRijenScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.gilzerijen.nl',
        'Gemeente Gilze en Rijen',
        {
            searchPath: '/zoeken',
        },
        options
    );
}

// 18. Best
export function createBestScraper(options?: ScraperOptions): MunicipalityPolicyScraper {
    return createMunicipalityScraper(
        'https://www.gemeentebest.nl',
        'Gemeente Best',
        {
            searchPath: '/zoeken',
        },
        options
    );
}
