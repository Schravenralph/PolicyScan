/**
 * Search Configuration
 * 
 * Configuration for search services including field boosting weights
 * for keyword search in HybridRetrievalService.
 * 
 * Field boosts can be configured via environment variables:
 * - HYBRID_FIELD_BOOST_TITLE: Weight for title matches (default: 10)
 * - HYBRID_FIELD_BOOST_SUMMARY: Weight for summary matches (default: 5)
 * - HYBRID_FIELD_BOOST_RELEVANCE: Weight for relevance field matches (default: 5)
 * - HYBRID_FIELD_BOOST_LABEL: Weight for label matches (default: 2)
 * - HYBRID_FIELD_BOOST_URL: Weight for URL matches (default: 1)
 * 
 * Optimal Weight Guidelines:
 * - Title: 8-12 (highest priority - most indicative of relevance)
 * - Summary: 4-6 (medium-high - important content indicator)
 * - Relevance: 4-6 (medium-high - explicit relevance field)
 * - Label: 1-3 (lower - metadata field)
 * - URL: 0.5-2 (lowest - structural match only)
 * 
 * Note: Weights are multiplied by match count, so higher weights have
 * exponential impact. Recommended to keep title at least 2x summary weight.
 */

export interface FieldBoostConfig {
  title: number;
  summary: number;
  relevance: number;
  label: number;
  url: number;
}

/**
 * Default field boost configuration
 * Based on empirical testing and search quality analysis:
 * - Title: Highest weight (10) - most important for relevance
 * - Summary: Medium-high weight (5) - important content indicator
 * - Relevance: Medium-high weight (5) - explicit relevance field
 * - Label: Lower weight (2) - metadata field
 * - URL: Lowest weight (1) - structural match only
 */
const DEFAULT_FIELD_BOOSTS: FieldBoostConfig = {
  title: 10,
  summary: 5,
  relevance: 5,
  label: 2,
  url: 1
};

/**
 * Load field boost configuration from environment variables
 * with validation and fallback to defaults
 */
export function loadFieldBoostConfig(): FieldBoostConfig {
  const config: FieldBoostConfig = {
    title: parseFloat(process.env.HYBRID_FIELD_BOOST_TITLE || String(DEFAULT_FIELD_BOOSTS.title)),
    summary: parseFloat(process.env.HYBRID_FIELD_BOOST_SUMMARY || String(DEFAULT_FIELD_BOOSTS.summary)),
    relevance: parseFloat(process.env.HYBRID_FIELD_BOOST_RELEVANCE || String(DEFAULT_FIELD_BOOSTS.relevance)),
    label: parseFloat(process.env.HYBRID_FIELD_BOOST_LABEL || String(DEFAULT_FIELD_BOOSTS.label)),
    url: parseFloat(process.env.HYBRID_FIELD_BOOST_URL || String(DEFAULT_FIELD_BOOSTS.url))
  };

  // Validate all weights are non-negative numbers
  const invalidFields: string[] = [];
  for (const [field, weight] of Object.entries(config)) {
    if (isNaN(weight) || weight < 0 || !isFinite(weight)) {
      invalidFields.push(field);
      // Reset to default
      config[field as keyof FieldBoostConfig] = DEFAULT_FIELD_BOOSTS[field as keyof FieldBoostConfig];
    }
  }

  if (invalidFields.length > 0) {
    console.warn(
      `[SearchConfig] Invalid field boost values for fields: ${invalidFields.join(', ')}. ` +
      `Values must be non-negative numbers. Using defaults.`
    );
  }

  // Log configuration for debugging
  if (process.env.NODE_ENV === 'development' || process.env.LOG_SEARCH_CONFIG === 'true') {
    console.log('[SearchConfig] Field boost configuration loaded:', config);
  }

  return config;
}

/**
 * Get field boost configuration (singleton pattern)
 */
let cachedConfig: FieldBoostConfig | null = null;

export function getFieldBoostConfig(): FieldBoostConfig {
  if (!cachedConfig) {
    cachedConfig = loadFieldBoostConfig();
  }
  return cachedConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetFieldBoostConfig(): void {
  cachedConfig = null;
}

