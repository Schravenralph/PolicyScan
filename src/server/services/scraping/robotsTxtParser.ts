/**
 * Robots.txt Parser Service
 * 
 * Fetches and parses robots.txt files to respect crawl-delay and disallow rules
 */

import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { scraperConfig } from '../../config/scraperConfig.js';

export interface RobotsTxtRules {
    crawlDelay?: number; // in seconds
    disallowPaths: string[]; // paths that should not be crawled
    allowPaths: string[]; // paths that are explicitly allowed
    userAgent?: string; // specific user agent these rules apply to
}

export interface ParsedRobotsTxt {
    rules: Map<string, RobotsTxtRules>; // key: user agent (or '*' for all)
    sitemaps: string[]; // sitemap URLs
    lastFetched: number; // timestamp
}

export class RobotsTxtParser {
    private cache: Map<string, ParsedRobotsTxt> = new Map();
    private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * Fetch and parse robots.txt for a domain
     */
    async getRobotsTxt(domain: string): Promise<ParsedRobotsTxt | null> {
        // Check cache first
        const cached = this.cache.get(domain);
        if (cached && Date.now() - cached.lastFetched < this.cacheTTL) {
            return cached;
        }

        try {
            const robotsUrl = `https://${domain}/robots.txt`;
            // Migrated from direct axios usage to centralized client (WI-377)
            const httpClient = createHttpClient({
                timeout: HTTP_TIMEOUTS.SHORT, // 5 seconds for quick robots.txt fetch
            });
            const response = await httpClient.get(robotsUrl, {
                headers: {
                    'User-Agent': scraperConfig.userAgent
                },
                validateStatus: (status) => status === 200 || status === 404
            });

            if (response.status === 404) {
                // No robots.txt, allow all
                const emptyRules: ParsedRobotsTxt = {
                    rules: new Map(),
                    sitemaps: [],
                    lastFetched: Date.now()
                };
                this.cache.set(domain, emptyRules);
                return emptyRules;
            }

            const parsed = this.parseRobotsTxt(response.data);
            this.cache.set(domain, parsed);
            return parsed;
        } catch (error) {
            console.warn(`⚠️  Failed to fetch robots.txt for ${domain}:`, error instanceof Error ? error.message : error);
            // On error, return null to indicate we couldn't fetch (scraper should use defaults)
            return null;
        }
    }

    /**
     * Parse robots.txt content
     */
    private parseRobotsTxt(content: string): ParsedRobotsTxt {
        const rules = new Map<string, RobotsTxtRules>();
        const sitemaps: string[] = [];
        const lines = content.split('\n');

        let currentUserAgent: string | null = null;
        let currentRules: RobotsTxtRules | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) {
                continue;
            }

            const directive = trimmed.substring(0, colonIndex).trim().toLowerCase();
            const value = trimmed.substring(colonIndex + 1).trim();

            if (directive === 'user-agent') {
                // Save previous rules
                if (currentUserAgent && currentRules) {
                    rules.set(currentUserAgent, currentRules);
                }

                // Start new user agent section
                currentUserAgent = value.toLowerCase();
                currentRules = {
                    disallowPaths: [],
                    allowPaths: []
                };
            } else if (directive === 'disallow' && currentRules) {
                if (value) {
                    currentRules.disallowPaths.push(value);
                } else {
                    // Empty disallow means allow all
                    currentRules.allowPaths.push('*');
                }
            } else if (directive === 'allow' && currentRules) {
                currentRules.allowPaths.push(value);
            } else if (directive === 'crawl-delay' && currentRules) {
                const delay = parseFloat(value);
                if (!isNaN(delay) && delay > 0) {
                    currentRules.crawlDelay = delay;
                }
            } else if (directive === 'sitemap') {
                sitemaps.push(value);
            }
        }

        // Save last user agent rules
        if (currentUserAgent && currentRules) {
            rules.set(currentUserAgent, currentRules);
        }

        return {
            rules,
            sitemaps,
            lastFetched: Date.now()
        };
    }

    /**
     * Check if a URL is allowed by robots.txt
     */
    async isUrlAllowed(url: string, userAgent: string = '*'): Promise<boolean> {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const path = urlObj.pathname;

            const robotsTxt = await this.getRobotsTxt(domain);
            if (!robotsTxt) {
                // If we couldn't fetch robots.txt, allow by default
                return true;
            }

            // Get rules for specific user agent or wildcard
            const specificRules = robotsTxt.rules.get(userAgent.toLowerCase());
            const wildcardRules = robotsTxt.rules.get('*');
            const rules = specificRules || wildcardRules;

            if (!rules) {
                // No rules for this user agent, allow
                return true;
            }

            // Check disallow paths
            for (const disallowPath of rules.disallowPaths) {
                if (this.pathMatches(path, disallowPath)) {
                    // Check if there's an allow rule that overrides
                    for (const allowPath of rules.allowPaths) {
                        if (this.pathMatches(path, allowPath)) {
                            return true;
                        }
                    }
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.warn(`⚠️  Error checking robots.txt for ${url}:`, error instanceof Error ? error.message : error);
            // On error, allow by default
            return true;
        }
    }

    /**
     * Get crawl delay for a domain
     */
    async getCrawlDelay(domain: string, userAgent: string = '*'): Promise<number | null> {
        const robotsTxt = await this.getRobotsTxt(domain);
        if (!robotsTxt) {
            return null;
        }

        const specificRules = robotsTxt.rules.get(userAgent.toLowerCase());
        const wildcardRules = robotsTxt.rules.get('*');
        const rules = specificRules || wildcardRules;

        return rules?.crawlDelay || null;
    }

    /**
     * Check if a path matches a pattern (supports wildcards)
     */
    private pathMatches(path: string, pattern: string): boolean {
        if (pattern === '*') {
            return true;
        }

        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\$/g, '\\$');
        
        const regex = new RegExp(`^${regexPattern}`);
        return regex.test(path);
    }

    /**
     * Clear cache for a domain (useful for testing)
     */
    clearCache(domain?: string): void {
        if (domain) {
            this.cache.delete(domain);
        } else {
            this.cache.clear();
        }
    }
}

// Singleton instance
export const robotsTxtParser = new RobotsTxtParser();

