/**
 * Shared utilities for AI Crawling features
 */

export type AICrawlingStrategy = 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';

/**
 * Format strategy name for display
 */
export function formatStrategy(strategy: string | AICrawlingStrategy): string {
  switch (strategy) {
    case 'site_search':
      return 'Site Search';
    case 'ai_navigation':
      return 'AI Navigation';
    case 'traditional_crawl':
      return 'Traditional Crawl';
    case 'hybrid':
      return 'Hybrid';
    default:
      return strategy;
  }
}

/**
 * Get strategy description in Dutch
 */
export function getStrategyDescription(strategy: string | AICrawlingStrategy): string {
  switch (strategy) {
    case 'site_search':
      return 'Site Search - De website heeft een ingebouwde zoekfunctie gebruikt';
    case 'ai_navigation':
      return 'AI Navigation - Een AI-model heeft de website structuur geanalyseerd';
    case 'traditional_crawl':
      return 'Traditional Crawl - Links zijn gematcht met behulp van keyword analyse';
    case 'hybrid':
      return 'Hybrid - Meerdere strategieën zijn gebruikt';
    default:
      return `Onbekende strategie: ${strategy}`;
  }
}

/**
 * Format decision type for display
 */
export function formatDecisionType(decisionType: string): string {
  return decisionType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

