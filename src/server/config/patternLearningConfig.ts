/**
 * Pattern Learning Configuration
 * 
 * Central configuration for navigation pattern learning system.
 * Supports flexible configuration via environment variables with sensible defaults.
 */

import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Pattern matcher type selection
 */
export type PatternMatcherType = 'semantic' | 'structural' | 'hybrid';

/**
 * Pattern learning configuration interface
 */
export interface PatternLearningConfig {
  /**
   * Enable or disable pattern learning system
   */
  enabled: boolean;

  /**
   * Pattern matcher type to use
   */
  matcherType: PatternMatcherType;

  /**
   * Minimum confidence threshold for pattern application (0-1)
   */
  minConfidenceThreshold: number;

  /**
   * Minimum match score for pattern application (0-1)
   */
  minMatchScore: number;

  /**
   * Weight for URL similarity in pattern matching (0-1)
   */
  urlSimilarityWeight: number;

  /**
   * Weight for error similarity in pattern matching (0-1)
   */
  errorSimilarityWeight: number;

  /**
   * Weight for structural similarity in pattern matching (0-1)
   */
  structuralSimilarityWeight: number;

  /**
   * Weight for semantic similarity in pattern matching (0-1)
   */
  semanticSimilarityWeight: number;

  /**
   * Maximum number of candidate patterns to evaluate
   */
  maxCandidates: number;

  /**
   * Minimum success count before pattern is considered reliable
   */
  minSuccessCount: number;

  /**
   * Minimum success rate for pattern to be auto-applied (0-1)
   */
  minSuccessRate: number;

  /**
   * Number of failures before pattern is deprecated
   */
  maxFailureCount: number;

  /**
   * Enable automatic pattern learning from user interventions
   */
  autoLearningEnabled: boolean;

  /**
   * Enable automatic pattern application
   */
  autoApplicationEnabled: boolean;

  /**
   * Logging verbosity level
   */
  loggingVerbosity: 'minimal' | 'normal' | 'verbose';

  /**
   * Enable pattern validation before application
   */
  validationEnabled: boolean;

  /**
   * Cache TTL for pattern queries (milliseconds)
   */
  cacheTTL: number;

  /**
   * Maximum age for patterns before they're considered stale (milliseconds)
   */
  maxPatternAge: number;
}

/**
 * Parse boolean environment variable with default
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Parse number environment variable with default and validation
 */
function parseNumber(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

/**
 * Parse pattern matcher type with validation
 */
function parseMatcherType(value: string | undefined): PatternMatcherType {
  if (!value) return 'hybrid';
  const normalized = value.toLowerCase();
  if (normalized === 'semantic' || normalized === 'structural' || normalized === 'hybrid') {
    return normalized;
  }
  return 'hybrid';
}

/**
 * Parse logging verbosity level with validation
 */
function parseLoggingVerbosity(value: string | undefined): 'minimal' | 'normal' | 'verbose' {
  if (!value) return 'normal';
  const normalized = value.toLowerCase();
  if (normalized === 'minimal' || normalized === 'normal' || normalized === 'verbose') {
    return normalized;
  }
  return 'normal';
}

/**
 * Configuration validation error
 */
export class ConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationValidationError';
  }
}

/**
 * Validate configuration values
 */
function validateConfig(config: PatternLearningConfig): void {
  // Validate weights sum to reasonable range (allow some flexibility)
  const totalWeight = 
    config.urlSimilarityWeight +
    config.errorSimilarityWeight +
    config.structuralSimilarityWeight +
    config.semanticSimilarityWeight;
  
  if (totalWeight < 0.1 || totalWeight > 2.0) {
    throw new ConfigurationValidationError(
      `Pattern learning weights sum to ${totalWeight}, expected between 0.1 and 2.0`
    );
  }

  // Validate thresholds
  if (config.minConfidenceThreshold < 0 || config.minConfidenceThreshold > 1) {
    throw new ConfigurationValidationError(
      `minConfidenceThreshold must be between 0 and 1, got ${config.minConfidenceThreshold}`
    );
  }

  if (config.minMatchScore < 0 || config.minMatchScore > 1) {
    throw new ConfigurationValidationError(
      `minMatchScore must be between 0 and 1, got ${config.minMatchScore}`
    );
  }

  if (config.minSuccessRate < 0 || config.minSuccessRate > 1) {
    throw new ConfigurationValidationError(
      `minSuccessRate must be between 0 and 1, got ${config.minSuccessRate}`
    );
  }

  // Validate matcherType
  if (config.matcherType !== 'semantic' && config.matcherType !== 'structural' && config.matcherType !== 'hybrid') {
    throw new ConfigurationValidationError(
      `matcherType must be 'semantic', 'structural', or 'hybrid', got ${config.matcherType}`
    );
  }

  // Validate counts
  if (config.maxCandidates < 1) {
    throw new ConfigurationValidationError(`maxCandidates must be at least 1, got ${config.maxCandidates}`);
  }

  if (config.minSuccessCount < 0) {
    throw new ConfigurationValidationError(`minSuccessCount must be non-negative, got ${config.minSuccessCount}`);
  }

  if (config.maxFailureCount < 0) {
    throw new ConfigurationValidationError(`maxFailureCount must be non-negative, got ${config.maxFailureCount}`);
  }
}

/**
 * Pattern learning configuration
 * 
 * Reads from environment variables with sensible defaults.
 * All configuration is validated on load.
 */
export const patternLearningConfig: PatternLearningConfig = (() => {
  const config: PatternLearningConfig = {
    enabled: parseBoolean(process.env.PATTERN_LEARNING_ENABLED, true),
    matcherType: parseMatcherType(process.env.PATTERN_LEARNING_MATCHER_TYPE),
    minConfidenceThreshold: parseNumber(
      process.env.PATTERN_LEARNING_MIN_CONFIDENCE,
      0.6,
      0,
      1
    ),
    minMatchScore: parseNumber(
      process.env.PATTERN_LEARNING_MIN_MATCH_SCORE,
      0.7,
      0,
      1
    ),
    urlSimilarityWeight: parseNumber(
      process.env.PATTERN_LEARNING_URL_WEIGHT,
      0.3,
      0,
      1
    ),
    errorSimilarityWeight: parseNumber(
      process.env.PATTERN_LEARNING_ERROR_WEIGHT,
      0.3,
      0,
      1
    ),
    structuralSimilarityWeight: parseNumber(
      process.env.PATTERN_LEARNING_STRUCTURAL_WEIGHT,
      0.2,
      0,
      1
    ),
    semanticSimilarityWeight: parseNumber(
      process.env.PATTERN_LEARNING_SEMANTIC_WEIGHT,
      0.2,
      0,
      1
    ),
    maxCandidates: parseNumber(
      process.env.PATTERN_LEARNING_MAX_CANDIDATES,
      10,
      1,
      100
    ),
    minSuccessCount: parseNumber(
      process.env.PATTERN_LEARNING_MIN_SUCCESS_COUNT,
      3,
      0
    ),
    minSuccessRate: parseNumber(
      process.env.PATTERN_LEARNING_MIN_SUCCESS_RATE,
      0.7,
      0,
      1
    ),
    maxFailureCount: parseNumber(
      process.env.PATTERN_LEARNING_MAX_FAILURE_COUNT,
      5,
      0
    ),
    autoLearningEnabled: parseBoolean(
      process.env.PATTERN_LEARNING_AUTO_LEARNING,
      true
    ),
    autoApplicationEnabled: parseBoolean(
      process.env.PATTERN_LEARNING_AUTO_APPLICATION,
      true
    ),
    loggingVerbosity: parseLoggingVerbosity(
      process.env.PATTERN_LEARNING_LOGGING_VERBOSITY
    ),
    validationEnabled: parseBoolean(
      process.env.PATTERN_LEARNING_VALIDATION_ENABLED,
      true
    ),
    cacheTTL: parseNumber(
      process.env.PATTERN_LEARNING_CACHE_TTL,
      3600000, // 1 hour
      0
    ),
    maxPatternAge: parseNumber(
      process.env.PATTERN_LEARNING_MAX_PATTERN_AGE,
      90 * 24 * 60 * 60 * 1000, // 90 days
      0
    ),
  };

  // Validate configuration
  validateConfig(config);

  return config;
})();


/**
 * Pattern Learning Configuration Manager
 * 
 * Manages pattern learning configuration with support for:
 * - Default values
 * - Environment variable overrides
 * - Runtime configuration updates
 * - Validation
 */
export class PatternLearningConfigManager {
  private config: PatternLearningConfig;

  constructor(overrides?: Partial<PatternLearningConfig>) {
    // Start with defaults from the main config
    const defaultConfig: PatternLearningConfig = {
      enabled: parseBoolean(process.env.PATTERN_LEARNING_ENABLED, true),
      matcherType: parseMatcherType(process.env.PATTERN_LEARNING_MATCHER_TYPE),
      minConfidenceThreshold: parseNumber(
        process.env.PATTERN_LEARNING_MIN_CONFIDENCE,
        0.6,
        0,
        1
      ),
      minMatchScore: parseNumber(
        process.env.PATTERN_LEARNING_MIN_MATCH_SCORE,
        0.7,
        0,
        1
      ),
      urlSimilarityWeight: parseNumber(
        process.env.PATTERN_LEARNING_URL_WEIGHT,
        0.3,
        0,
        1
      ),
      errorSimilarityWeight: parseNumber(
        process.env.PATTERN_LEARNING_ERROR_WEIGHT,
        0.3,
        0,
        1
      ),
      structuralSimilarityWeight: parseNumber(
        process.env.PATTERN_LEARNING_STRUCTURAL_WEIGHT,
        0.2,
        0,
        1
      ),
      semanticSimilarityWeight: parseNumber(
        process.env.PATTERN_LEARNING_SEMANTIC_WEIGHT,
        0.2,
        0,
        1
      ),
      maxCandidates: parseNumber(
        process.env.PATTERN_LEARNING_MAX_CANDIDATES,
        10,
        1,
        100
      ),
      minSuccessCount: parseNumber(
        process.env.PATTERN_LEARNING_MIN_SUCCESS_COUNT,
        3,
        0
      ),
      minSuccessRate: parseNumber(
        process.env.PATTERN_LEARNING_MIN_SUCCESS_RATE,
        0.7,
        0,
        1
      ),
      maxFailureCount: parseNumber(
        process.env.PATTERN_LEARNING_MAX_FAILURE_COUNT,
        5,
        0
      ),
      autoLearningEnabled: parseBoolean(
        process.env.PATTERN_LEARNING_AUTO_LEARNING,
        true
      ),
      autoApplicationEnabled: parseBoolean(
        process.env.PATTERN_LEARNING_AUTO_APPLICATION,
        true
      ),
      loggingVerbosity: parseLoggingVerbosity(
        process.env.PATTERN_LEARNING_LOGGING_VERBOSITY
      ),
      validationEnabled: parseBoolean(
        process.env.PATTERN_LEARNING_VALIDATION_ENABLED,
        true
      ),
      cacheTTL: parseNumber(
        process.env.PATTERN_LEARNING_CACHE_TTL,
        3600000,
        0
      ),
      maxPatternAge: parseNumber(
        process.env.PATTERN_LEARNING_MAX_PATTERN_AGE,
        90 * 24 * 60 * 60 * 1000,
        0
      ),
    };

    // Apply overrides (highest priority)
    this.config = { ...defaultConfig, ...overrides };

    // Validate
    this.validateConfig(this.config);
  }

  /**
   * Validate configuration values
   */
  private validateConfig(config: PatternLearningConfig): void {
    validateConfig(config);
  }

  /**
   * Get current configuration (returns a copy)
   */
  getConfig(): PatternLearningConfig {
    return { ...this.config };
  }

  /**
   * Update configuration with validation
   */
  updateConfig(updates: Partial<PatternLearningConfig>): void {
    const newConfig = { ...this.config, ...updates };
    this.validateConfig(newConfig);
    this.config = newConfig;
  }

  /**
   * Check if pattern learning is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Get pattern learning configuration without creating a manager instance
 */
export function getPatternLearningConfig(
  overrides?: Partial<PatternLearningConfig>
): PatternLearningConfig {
  const manager = new PatternLearningConfigManager(overrides);
  return manager.getConfig();
}
