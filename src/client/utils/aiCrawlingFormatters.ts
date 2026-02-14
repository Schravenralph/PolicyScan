/**
 * AI Crawling Formatters
 * 
 * Explicit mapping from domain values to translated strings.
 * This enforces the separation between domain data and presentation.
 */

import { t, type TranslationKey } from './i18n.js';

/**
 * Aggressiveness level type (domain value)
 */
export type AggressivenessLevel = 'low' | 'medium' | 'high';

/**
 * Strategy type (domain value)
 */
export type StrategyType = 'site_search' | 'ai_navigation' | 'traditional' | 'auto';

/**
 * Mapping from aggressiveness level to translation key
 */
const aggressivenessLabelKey: Record<AggressivenessLevel, TranslationKey> = {
  low: 'aiCrawling.aggressiveness.low',
  medium: 'aiCrawling.aggressiveness.medium',
  high: 'aiCrawling.aggressiveness.high',
} as const;

/**
 * Mapping from strategy type to translation key
 */
const strategyLabelKey: Record<StrategyType, TranslationKey> = {
  site_search: 'aiCrawling.strategy.site_search',
  ai_navigation: 'aiCrawling.strategy.ai_navigation',
  traditional: 'aiCrawling.strategy.traditional',
  auto: 'aiCrawling.strategy.auto',
} as const;

/**
 * Mapping from boolean to cache enabled/disabled translation key
 */
const cacheEnabledLabelKey: Record<string, TranslationKey> = {
  'true': 'aiCrawling.cache.enabled',
  'false': 'aiCrawling.cache.disabled',
} as const;

/**
 * Mapping from boolean to yes/no translation key
 */
const enabledLabelKey: Record<string, TranslationKey> = {
  'true': 'aiCrawling.boolean.yes',
  'false': 'aiCrawling.boolean.no',
} as const;

/**
 * Format aggressiveness level to translated string
 * 
 * @param aggressiveness - Aggressiveness level ('low', 'medium', or 'high')
 * @returns Translated string (e.g., "Laag", "Gemiddeld", "Hoog")
 */
export function formatAggressiveness(aggressiveness: string): string {
  const normalized = aggressiveness.toLowerCase() as AggressivenessLevel;
  const key = aggressivenessLabelKey[normalized];
  if (key) {
    return t(key);
  }
  return aggressiveness; // Fallback
}

/**
 * Format strategy type to translated string
 * 
 * @param strategy - Strategy type ('site_search', 'ai_navigation', 'traditional', or 'auto')
 * @returns Translated string (e.g., "Site Zoeken", "AI Navigatie")
 */
export function formatStrategy(strategy: string): string {
  const normalized = strategy.toLowerCase() as StrategyType;
  const key = strategyLabelKey[normalized];
  if (key) {
    return t(key);
  }
  return strategy; // Fallback
}

/**
 * Format cache enabled state to translated string
 * 
 * @param enabled - Cache enabled state (boolean)
 * @returns Translated string ("Ingeschakeld" or "Uitgeschakeld")
 */
export function formatCacheEnabled(enabled: boolean): string {
  return t(cacheEnabledLabelKey[String(enabled)]);
}

/**
 * Format enabled state to translated string
 * 
 * @param enabled - Enabled state (boolean)
 * @returns Translated string ("Ja" or "Nee")
 */
export function formatEnabled(enabled: boolean): string {
  return t(enabledLabelKey[String(enabled)]);
}
