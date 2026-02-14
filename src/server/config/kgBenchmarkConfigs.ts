/**
 * Knowledge Graph Benchmark Configuration Presets
 * 
 * Defines preset configurations for benchmarking different KG feature combinations.
 * These configurations control which KG features are enabled/disabled during benchmarks.
 */

import { KGFeatureFlag } from '../models/FeatureFlag.js';

/**
 * Benchmark configuration preset
 */
export interface KGBenchmarkConfig {
  name: string;
  description: string;
  featureFlags: Record<string, boolean>;
}

/**
 * Vector-only configuration (baseline)
 * All KG features disabled
 */
export const VECTOR_ONLY_CONFIG: KGBenchmarkConfig = {
  name: 'vector-only',
  description: 'Baseline: All KG features disabled, vector search only',
  featureFlags: {
    [KGFeatureFlag.KG_ENABLED]: false,
    [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_VALIDATION_ENABLED]: false,
    [KGFeatureFlag.KG_REASONING_ENABLED]: false,
    [KGFeatureFlag.KG_DEDUPLICATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_HYBRID_SCORING_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED]: false,
    [KGFeatureFlag.KG_FUSION_ENABLED]: false,
    [KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTHFULRAG_ENABLED]: false,
    [KGFeatureFlag.KG_STEINER_TREE_ENABLED]: false,
    [KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED]: false,
    [KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED]: false,
    [KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED]: false,
    [KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED]: false,
    [KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED]: false,
    [KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED]: false,
    [KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED]: false,
    [KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED]: false,
    [KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED]: false,
    [KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED]: false,
    [KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED]: false,
  },
};

/**
 * KG-basic configuration
 * KG retrieval enabled, extraction/validation/reasoning disabled
 */
export const KG_BASIC_CONFIG: KGBenchmarkConfig = {
  name: 'kg-basic',
  description: 'KG retrieval enabled, extraction/validation/reasoning disabled',
  featureFlags: {
    [KGFeatureFlag.KG_ENABLED]: true,
    [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_VALIDATION_ENABLED]: false,
    [KGFeatureFlag.KG_REASONING_ENABLED]: false,
    [KGFeatureFlag.KG_DEDUPLICATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_HYBRID_SCORING_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED]: false,
    [KGFeatureFlag.KG_FUSION_ENABLED]: false,
    [KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTHFULRAG_ENABLED]: false,
    [KGFeatureFlag.KG_STEINER_TREE_ENABLED]: false,
    [KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED]: false,
    [KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED]: false,
    [KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED]: false,
    [KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED]: false,
    [KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED]: false,
    [KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED]: false,
    [KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED]: false,
    [KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED]: false,
    [KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED]: false,
    [KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED]: false,
    [KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED]: false,
  },
};

/**
 * KG-extraction configuration
 * Extraction enabled, others disabled
 */
export const KG_EXTRACTION_CONFIG: KGBenchmarkConfig = {
  name: 'kg-extraction',
  description: 'KG extraction enabled, others disabled',
  featureFlags: {
    [KGFeatureFlag.KG_ENABLED]: true,
    [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_EXTRACTION_ENABLED]: true,
    [KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED]: true,
    [KGFeatureFlag.KG_VALIDATION_ENABLED]: false,
    [KGFeatureFlag.KG_REASONING_ENABLED]: false,
    [KGFeatureFlag.KG_DEDUPLICATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_HYBRID_SCORING_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED]: false,
    [KGFeatureFlag.KG_FUSION_ENABLED]: false,
    [KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTHFULRAG_ENABLED]: false,
    [KGFeatureFlag.KG_STEINER_TREE_ENABLED]: false,
    [KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED]: false,
    [KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED]: false,
    [KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED]: false,
    [KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED]: false,
    [KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED]: false,
    [KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED]: false,
    [KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED]: false,
    [KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED]: false,
    [KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED]: false,
    [KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED]: false,
    [KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED]: false,
  },
};

/**
 * KG-reasoning configuration
 * Reasoning enabled, others disabled
 */
export const KG_REASONING_CONFIG: KGBenchmarkConfig = {
  name: 'kg-reasoning',
  description: 'KG reasoning enabled, others disabled',
  featureFlags: {
    [KGFeatureFlag.KG_ENABLED]: true,
    [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED]: false,
    [KGFeatureFlag.KG_VALIDATION_ENABLED]: false,
    [KGFeatureFlag.KG_REASONING_ENABLED]: true,
    [KGFeatureFlag.KG_DEDUPLICATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRAVERSAL_ENABLED]: true,
    [KGFeatureFlag.KG_HYBRID_SCORING_ENABLED]: true,
    [KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED]: false,
    [KGFeatureFlag.KG_FUSION_ENABLED]: false,
    [KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED]: true,
    [KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED]: true,
    [KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED]: false,
    [KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED]: false,
    [KGFeatureFlag.KG_TRUTHFULRAG_ENABLED]: false,
    [KGFeatureFlag.KG_STEINER_TREE_ENABLED]: false,
    [KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED]: false,
    [KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED]: false,
    [KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED]: false,
    [KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED]: false,
    [KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED]: false,
    [KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED]: false,
    [KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED]: false,
    [KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED]: false,
    [KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED]: false,
    [KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED]: false,
    [KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED]: false,
    [KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED]: false,
    [KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED]: false,
  },
};

/**
 * KG-full configuration
 * All KG features enabled
 */
export const KG_FULL_CONFIG: KGBenchmarkConfig = {
  name: 'kg-full',
  description: 'All KG features enabled',
  featureFlags: {
    [KGFeatureFlag.KG_ENABLED]: true,
    [KGFeatureFlag.KG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_EXTRACTION_ENABLED]: true,
    [KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED]: true,
    [KGFeatureFlag.KG_VALIDATION_ENABLED]: true,
    [KGFeatureFlag.KG_REASONING_ENABLED]: true,
    [KGFeatureFlag.KG_DEDUPLICATION_ENABLED]: true,
    [KGFeatureFlag.KG_TRAVERSAL_ENABLED]: true,
    [KGFeatureFlag.KG_HYBRID_SCORING_ENABLED]: true,
    [KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED]: true,
    [KGFeatureFlag.KG_FUSION_ENABLED]: true,
    [KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED]: true,
    [KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED]: true,
    [KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED]: true,
    [KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED]: true,
    [KGFeatureFlag.KG_TRUTHFULRAG_ENABLED]: true,
    [KGFeatureFlag.KG_STEINER_TREE_ENABLED]: true,
    [KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED]: true,
    [KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED]: true,
    [KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED]: true,
    [KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED]: true,
    [KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED]: true,
    [KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED]: true,
    [KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED]: true,
    [KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED]: true,
    [KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED]: true,
    [KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED]: true,
    [KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED]: true,
    [KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED]: true,
    [KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED]: true,
  },
};

/**
 * All preset configurations
 */
export const KG_BENCHMARK_CONFIGS: KGBenchmarkConfig[] = [
  VECTOR_ONLY_CONFIG,
  KG_BASIC_CONFIG,
  KG_EXTRACTION_CONFIG,
  KG_REASONING_CONFIG,
  KG_FULL_CONFIG,
];

/**
 * Get a configuration by name
 */
export function getConfigByName(name: string): KGBenchmarkConfig | undefined {
  return KG_BENCHMARK_CONFIGS.find((config) => config.name === name);
}

/**
 * Get all configuration names
 */
export function getConfigNames(): string[] {
  return KG_BENCHMARK_CONFIGS.map((config) => config.name);
}

/**
 * Create a custom benchmark configuration from feature flag combinations
 * 
 * @param config - Configuration name and feature flags
 * @returns Custom benchmark configuration
 * 
 * @example
 * const customConfig = createCustomConfig({
 *   name: 'my-config',
 *   description: 'Custom configuration',
 *   featureFlags: {
 *     KG_ENABLED: true,
 *     KG_RETRIEVAL_ENABLED: true,
 *     KG_EXTRACTION_ENABLED: false,
 *   },
 * });
 */
export function createCustomConfig(config: {
  name: string;
  description: string;
  featureFlags: Record<string, boolean>;
}): KGBenchmarkConfig {
  // Merge with default flags (all disabled) and override with provided flags
  const defaultFlags: Record<string, boolean> = {};
  Object.values(KGFeatureFlag).forEach((flag) => {
    defaultFlags[flag] = false;
  });
  
  return {
    name: config.name,
    description: config.description,
    featureFlags: {
      ...defaultFlags,
      ...config.featureFlags,
    },
  };
}

