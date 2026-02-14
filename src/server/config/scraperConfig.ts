/**
 * Scraper Configuration
 * 
 * Central configuration for all scraping operations
 */

export const scraperConfig = {
    // Rate limiting - mode-specific configurations
    // Dev mode: More lenient for exploration
    // Prod mode: Stricter for production efficiency
    rateLimits: {
        'iplo.nl': { requestsPerSecond: 1, burstSize: 2 },
        'rijksoverheid.nl': { requestsPerSecond: 2, burstSize: 5 },
        'overheid.nl': { requestsPerSecond: 2, burstSize: 5 },
        'officielebekendmakingen.nl': { requestsPerSecond: 1, burstSize: 3 },
        default: { requestsPerSecond: 1, burstSize: 3 }
    },
    
    // Mode-specific configurations (US-010)
    modes: {
        dev: {
            // Development mode: More lenient rate limiting for exploration
            rateLimitMultiplier: 0.8, // 80% of base rate (slower, more careful)
            loggingVerbosity: 'verbose', // Log everything for debugging
            errorHandling: 'permissive', // Continue on errors, log for review
            explorationEnabled: true, // Full exploration enabled
            changeDetection: false, // Don't skip unchanged content (explore everything)
            pauseOnUnknownPattern: true // Pause for human input on unknown patterns
        },
        prod: {
            // Production mode: Stricter rate limiting, efficient updates
            rateLimitMultiplier: 1.2, // 120% of base rate (faster, but still respectful)
            loggingVerbosity: 'minimal', // Only log important events
            errorHandling: 'strict', // Fail fast on errors
            explorationEnabled: false, // No exploration, use graph only
            changeDetection: true, // Skip unchanged content
            pauseOnUnknownPattern: false // Don't pause, log and continue
        },
        hybrid: {
            // Hybrid mode: Balanced approach
            rateLimitMultiplier: 1.0, // Base rate
            loggingVerbosity: 'normal', // Standard logging
            errorHandling: 'balanced', // Balanced error handling
            explorationEnabled: true, // Explore within patterns
            changeDetection: true, // Use change detection for known pages
            pauseOnUnknownPattern: false // Don't pause in hybrid mode
        }
    },

    // Crawl depth limits
    maxDepth: 2,

    // Retry settings
    retry: {
        maxAttempts: 3,
        initialDelay: 1000, // ms
        maxDelay: 10000, // ms
        backoffMultiplier: 2
    },

    // Cache TTL
    cache: {
        htmlTTL: 24 * 60 * 60 * 1000, // 24 hours
        metadataTTL: 7 * 24 * 60 * 60 * 1000 // 7 days
    },

    // Request timeout
    timeout: 10000, // 10 seconds

    // User agent - format per acceptance criteria: "Beleidsscan-Bot/1.0 (+https://beleidsscan.nl/bot; contact@example.com)"
    userAgent: process.env.SCRAPER_USER_AGENT || 'Beleidsscan-Bot/1.0 (+https://beleidsscan.nl/bot; contact@beleidsscan.nl)',

    // Site-specific patterns
    sitePatterns: {
        rijksoverheid: {
            baseUrl: 'https://www.rijksoverheid.nl',
            documentPaths: ['/documenten', '/publicaties'],
            selectors: {
                documentList: '.document-list .document-item',
                documentLink: 'a.document-link',
                title: 'h1, .document-title',
                date: '.publication-date, time',
                summary: '.document-summary, .intro'
            }
        },
        gemeente: {
            commonPaths: ['/beleid', '/documenten', '/publicaties', '/raad'],
            selectors: {
                documentLink: 'a[href*="pdf"], a[href*="document"]',
                title: 'h1, h2.title',
                date: 'time, .date, .publication-date'
            }
        },
        iplo: {
            baseUrl: 'https://iplo.nl',
            themePath: '/thema/',
            selectors: {
                // Improved selectors for better coverage
                articleLink: 'article a, .content a, main a, .main-content a, section a, .article-content a, [role="article"] a',
                pdfLink: 'a[href$=".pdf"], a[href*=".pdf?"], a[href*=".pdf#"]',
                title: 'h1, h2, h3, h4, .title, .heading, [class*="title"]',
                content: '.content, article, main, .main-content, section, [role="article"]',
                // Search result selectors
                searchResult: '.search-result, .result-item, .search-results article, .search-results .result, article.search-result, li.search-result',
                searchSnippet: '.snippet, .description, .summary, .excerpt, .intro, .lead'
            }
        },
        officielebekendmakingen: {
            baseUrl: 'https://www.officielebekendmakingen.nl',
            selectors: {
                documentLink: 'a.document',
                title: 'h1.title',
                date: '.publication-date',
                summary: '.summary'
            }
        }
    },

    // Keywords to identify relevant links (Dutch spatial planning policy terms)
    relevantKeywords: [
        // Core spatial planning documents
        'omgevingsvisie',
        'omgevingsplan',
        'omgevingsverordening',
        'bestemmingsplan',
        'structuurvisie',
        'verordening',
        
        // Policy documents
        'beleid',
        'beleidsplan',
        'beleidsnota',
        'beleidsregel',
        'nota',
        'visie',
        'strategie',
        
        // Administrative documents
        'besluit',
        'besluitvorming',
        'raad',
        'raadsbesluit',
        'collegebesluit',
        
        // Environmental/spatial themes
        'ruimtelijk',
        'ruimte',
        'omgeving',
        'leefomgeving',
        'milieu',
        'klimaat',
        'duurzaam',
        'energie',
        'mobiliteit',
        'wonen',
        'groen',
        'water',
        'natuur',
        'landschap',
        
        // Generic document types
        'document',
        'publicatie',
        'regelgeving',
        'rapport',
        'onderzoek'
    ],

    // Keywords to exclude
    excludeKeywords: [
        // Generic website elements
        'contact',
        'contactformulier',
        'contactgegevens',
        'cookies',
        'cookiebeleid',
        'privacy',
        'privacyverklaring',
        'toegankelijkheid',
        'toegankelijkheidsverklaring',
        'sitemap',
        'zoeken',
        'zoekresulta',
        'login',
        'inloggen',
        'mijn-',
        'account',
        
        // News and events (not policy documents)
        'nieuws',
        'nieuwsbericht',
        'nieuwsbrief',
        'agenda',
        'evenement',
        'activiteit',
        'kalender',
        
        // Jobs
        'vacature',
        'werken-bij',
        'sollicit',
        'carriere',
        
        // Social media
        'twitter',
        'facebook',
        'linkedin',
        'instagram',
        'youtube',
        'share',
        'delen',
        
        // Footer/utility links
        'disclaimer',
        'voorwaarden',
        'colofon',
        'copyright',
        'webmaster',
        'feedback',
        
        // Commerce/non-policy
        'webshop',
        'winkel',
        'producten',
        'diensten',
        'tarieven'
    ]
};

export type ScraperConfig = typeof scraperConfig;

/**
 * US-010: Get mode-specific rate limit configuration
 * Applies the mode's rateLimitMultiplier to the base rate limits
 */
export function getModeSpecificRateLimits(mode: 'dev' | 'prod' | 'hybrid' = 'dev') {
    const modeConfig = scraperConfig.modes[mode];
    const multiplier = modeConfig.rateLimitMultiplier;
    
    const modeRateLimits: Record<string, { requestsPerSecond: number; burstSize: number }> = {};
    
    for (const [domain, config] of Object.entries(scraperConfig.rateLimits)) {
        modeRateLimits[domain] = {
            requestsPerSecond: Math.max(0.1, config.requestsPerSecond * multiplier),
            burstSize: Math.max(1, Math.round(config.burstSize * multiplier))
        };
    }
    
    return modeRateLimits;
}

/**
 * US-010: Get mode-specific configuration
 */
export function getModeConfig(mode: 'dev' | 'prod' | 'hybrid' = 'dev') {
    return scraperConfig.modes[mode] || scraperConfig.modes.dev;
}
