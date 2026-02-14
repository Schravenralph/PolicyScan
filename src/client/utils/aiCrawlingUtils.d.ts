/**
 * Shared utilities for AI Crawling features
 */
export type AICrawlingStrategy = 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
/**
 * Format strategy name for display
 */
export declare function formatStrategy(strategy: string | AICrawlingStrategy): string;
/**
 * Get strategy description in Dutch
 */
export declare function getStrategyDescription(strategy: string | AICrawlingStrategy): string;
/**
 * Format decision type for display
 */
export declare function formatDecisionType(decisionType: string): string;
