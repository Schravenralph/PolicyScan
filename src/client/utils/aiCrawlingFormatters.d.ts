/**
 * AI Crawling Formatters
 *
 * Explicit mapping from domain values to translated strings.
 * This enforces the separation between domain data and presentation.
 */
/**
 * Aggressiveness level type (domain value)
 */
export type AggressivenessLevel = 'low' | 'medium' | 'high';
/**
 * Strategy type (domain value)
 */
export type StrategyType = 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
/**
 * Format aggressiveness level to translated string
 *
 * @param aggressiveness - Aggressiveness level ('low', 'medium', or 'high')
 * @returns Translated string (e.g., "Laag", "Gemiddeld", "Hoog")
 */
export declare function formatAggressiveness(aggressiveness: string): string;
/**
 * Format strategy type to translated string
 *
 * @param strategy - Strategy type ('site_search', 'ai_navigation', 'traditional', or 'auto')
 * @returns Translated string (e.g., "Site Zoeken", "AI Navigatie")
 */
export declare function formatStrategy(strategy: string): string;
/**
 * Format cache enabled state to translated string
 *
 * @param enabled - Cache enabled state (boolean)
 * @returns Translated string ("Ingeschakeld" or "Uitgeschakeld")
 */
export declare function formatCacheEnabled(enabled: boolean): string;
/**
 * Format enabled state to translated string
 *
 * @param enabled - Enabled state (boolean)
 * @returns Translated string ("Ja" or "Nee")
 */
export declare function formatEnabled(enabled: boolean): string;
