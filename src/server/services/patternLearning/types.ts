/**
 * Type definitions for Navigation Pattern Learning System
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

/**
 * Context information for pattern matching
 */
export interface NavigationContext {
  url: string;
  domain: string;
  errorMessage?: string;
  errorType?: string;
  pageStructure?: {
    html?: string; // Full HTML (optional, for validation)
    structureHash?: string; // DOM structure hash
    title?: string;
  };
  runId: string;
  timestamp: Date;
}

/**
 * Learned navigation pattern
 */
export interface LearnedPattern {
  id: string;
  pattern: string; // XPath, CSS selector, URL pattern, etc.
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl: string; // Where pattern was learned
  context: {
    domain: string;
    urlPattern?: string; // Regex pattern for matching URLs
    pageStructureHash?: string; // DOM structure hash for similarity
    errorType?: string; // Type of error that triggered learning
    errorMessage?: string; // Original error message
  };
  effectiveness: {
    successCount: number;
    failureCount: number;
    lastUsed?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
    confidence: number; // Calculated: successCount / (successCount + failureCount)
    averageMatchScore?: number; // Average similarity score when matched
  };
  metadata: {
    learnedAt: Date;
    learnedFrom: 'user_intervention' | 'auto_discovery' | 'manual';
    userId?: string;
    runId?: string;
    notes?: string;
  };
  status: 'active' | 'deprecated' | 'experimental';
  deprecatedAt?: Date;
  deprecatedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new learned pattern
 */
export interface LearnedPatternInput {
  pattern: string;
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl: string;
  context: {
    domain: string;
    urlPattern?: string;
    pageStructureHash?: string;
    errorType?: string;
    errorMessage?: string;
  };
  metadata: {
    learnedFrom: 'user_intervention' | 'auto_discovery' | 'manual';
    userId?: string;
    runId?: string;
    notes?: string;
  };
}

/**
 * Result of pattern application attempt
 */
export interface PatternApplicationResult {
  applied: boolean;
  pattern?: LearnedPattern;
  matchScore?: number;
  reason: 'pattern_applied' | 'no_suitable_pattern' | 'validation_failed' | 'low_confidence';
  details?: {
    candidateCount: number;
    topScore?: number;
    validationResult?: ValidationResult;
  };
}

/**
 * Ranked pattern with match details
 */
export interface RankedPattern {
  pattern: LearnedPattern;
  score: number; // 0-1, higher is better
  matchDetails: {
    urlSimilarity: number;
    errorSimilarity: number;
    structuralSimilarity?: number;
    semanticSimilarity?: number;
  };
  confidence: number; // Pattern's historical effectiveness
}

/**
 * Pattern validation result
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  warnings?: string[];
  confidence: number; // Adjusted confidence after validation
}

/**
 * Configuration for pattern learning service
 */
export interface PatternLearningConfig {
  enabled: boolean;
  minConfidence: number; // Minimum confidence to apply pattern
  minMatchScore: number; // Minimum match score to consider
  deprecationThreshold: number; // Auto-deprecate below this confidence
  autoDeprecateAfterFailures: number; // Auto-deprecate after N failures
  matcherStrategy: 'semantic' | 'structural' | 'hybrid';
}

