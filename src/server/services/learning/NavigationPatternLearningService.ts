/**
 * NavigationPatternLearningService - Main service orchestrating pattern learning and application
 * 
 * Coordinates all pattern learning functionality:
 * - Finding and applying learned patterns for navigation contexts
 * - Learning new patterns from user interventions
 * - Tracking pattern application results for effectiveness
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { IPatternRepository } from '../patternLearning/PatternRepository.js';
import { PatternMatcher } from '../patternLearning/matchers/PatternMatcher.js';
import { PatternValidator } from '../patternLearning/PatternValidator.js';
import { RunManager } from '../workflow/RunManager.js';
import { LearningService } from './LearningService.js';
import {
  NavigationContext,
  LearnedPattern,
  LearnedPatternInput,
  PatternApplicationResult,
  PatternLearningConfig,
  RankedPattern,
  ValidationResult,
} from '../patternLearning/types.js';
import { logger } from '../../utils/logger.js';
import { StructuralPatternMatcher } from '../patternLearning/matchers/StructuralPatternMatcher.js';
import { PatternLearningConfigManager, getPatternLearningConfig } from '../../config/patternLearningConfig.js';

/**
 * Navigation Pattern Learning Service
 * 
 * Main orchestrator for pattern learning and application.
 * Coordinates between repository, matchers, validators, and learning services.
 */
export class NavigationPatternLearningService {
  private config: PatternLearningConfig;
  private patternMatcher: PatternMatcher;
  private configManager: PatternLearningConfigManager;

  constructor(
    private patternRepository: IPatternRepository,
    patternMatcher: PatternMatcher,
    private patternValidator: PatternValidator,
    private runManager: RunManager,
    private learningService: LearningService,
    config?: Partial<PatternLearningConfig>
  ) {
    // Load configuration using PatternLearningConfigManager
    this.configManager = new PatternLearningConfigManager(config);
    const managerConfig = this.configManager.getConfig();
    // Convert config from PatternLearningConfigManager format to PatternLearningConfig format
    this.config = {
      enabled: managerConfig.enabled,
      minConfidence: managerConfig.minConfidenceThreshold,
      minMatchScore: managerConfig.minMatchScore,
      deprecationThreshold: managerConfig.minSuccessRate,
      autoDeprecateAfterFailures: managerConfig.maxFailureCount,
      matcherStrategy: managerConfig.matcherType === 'semantic' ? 'semantic' : 
                       managerConfig.matcherType === 'structural' ? 'structural' : 'hybrid'
    };

    // Store pattern matcher (provided via constructor)
    this.patternMatcher = patternMatcher;

    if (this.config.enabled) {
      logger.info({ config: this.config }, 'NavigationPatternLearningService initialized');
    } else {
      logger.info('NavigationPatternLearningService initialized (disabled)');
    }
  }

  /**
   * Find and apply the best matching pattern for a navigation context.
   * 
   * Process:
   * 1. Find candidate patterns from repository
   * 2. Rank patterns by similarity using matcher
   * 3. Validate top candidate
   * 4. Return application result
   * 
   * @param context - Navigation context to find pattern for
   * @returns Pattern application result with details
   */
  async findAndApplyPattern(
    context: NavigationContext
  ): Promise<PatternApplicationResult> {
    if (!this.config.enabled) {
      return {
        applied: false,
        reason: 'no_suitable_pattern',
        details: {
          candidateCount: 0,
        },
      };
    }

    try {
      logger.debug({ context }, 'Finding pattern for navigation context');

      // 1. Find candidate patterns
      const candidates = await this.patternRepository.findCandidates(context);
      logger.debug({ candidateCount: candidates.length }, 'Found pattern candidates');

      if (candidates.length === 0) {
        return {
          applied: false,
          reason: 'no_suitable_pattern',
          details: {
            candidateCount: 0,
          },
        };
      }

      // 2. Rank patterns by similarity
      const rankedPatterns = await this.patternMatcher.rankPatterns(candidates, context);
      logger.debug(
        { rankedCount: rankedPatterns.length, topScore: rankedPatterns[0]?.score },
        'Ranked patterns'
      );

      if (rankedPatterns.length === 0) {
        await this.runManager.log(
          context.runId,
          'No patterns matched after ranking',
          'debug'
        );
        return {
          applied: false,
          reason: 'no_suitable_pattern',
          details: {
            candidateCount: candidates.length,
          },
        };
      }

      // 3. Check minimum match score first
      const topPattern = rankedPatterns[0];
      if (topPattern.score < this.config.minMatchScore) {
        await this.runManager.log(
          context.runId,
          `Top pattern score (${topPattern.score.toFixed(2)}) below minimum threshold (${this.config.minMatchScore})`,
          'debug'
        );
        return {
          applied: false,
          reason: 'low_confidence',
          details: {
            candidateCount: candidates.length,
            topScore: topPattern.score,
          },
        };
      }

      // 4. Validate the top pattern
      const validationResult = this.patternValidator.validate(topPattern.pattern);

      if (!validationResult.isValid) {
        await this.runManager.log(
          context.runId,
          `Pattern validation failed: ${validationResult.reason}`,
          'warn'
        );
        return {
          applied: false,
          reason: 'validation_failed',
          details: {
            candidateCount: candidates.length,
            topScore: topPattern.score,
            validationResult,
          },
        };
      }

      // 5. Check final confidence (after validation adjustments)
      if (validationResult.confidence < this.config.minConfidence) {
        await this.runManager.log(
          context.runId,
          `Pattern confidence (${validationResult.confidence.toFixed(2)}) below minimum threshold (${this.config.minConfidence})`,
          'debug'
        );
        return {
          applied: false,
          reason: 'low_confidence',
          details: {
            candidateCount: candidates.length,
            topScore: topPattern.score,
            validationResult,
          },
        };
      }

      // 6. Pattern is valid and meets all thresholds
      const bestPattern = {
        ...topPattern,
        confidence: validationResult.confidence,
      };

      // 7. Return successful application result
      await this.runManager.log(
        context.runId,
        `Pattern found and validated: ${bestPattern.pattern.id} (score: ${bestPattern.score.toFixed(2)}, confidence: ${bestPattern.confidence.toFixed(2)})`,
        'info'
      );

      logger.info(
        {
          patternId: bestPattern.pattern.id,
          context,
          score: bestPattern.score,
          confidence: bestPattern.confidence,
        },
        'Pattern found and ready for application'
      );

      return {
        applied: true,
        pattern: bestPattern.pattern,
        matchScore: bestPattern.score,
        reason: 'pattern_applied',
        details: {
          candidateCount: candidates.length,
          topScore: bestPattern.score,
          validationResult,
        },
      };
    } catch (error) {
      logger.error({ error, context }, 'Error finding and applying pattern');
      await this.runManager.log(
        context.runId,
        `Error finding pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      
      return {
        applied: false,
        reason: 'no_suitable_pattern',
        details: {
          candidateCount: 0,
        },
      };
    }
  }

  /**
   * Learn a new pattern from user intervention.
   * 
   * Saves a new pattern to the repository with initial effectiveness metrics.
   * 
   * @param patternInput - Pattern input data
   * @param context - Navigation context where pattern was learned
   * @returns Learned pattern
   */
  async learnPattern(
    patternInput: LearnedPatternInput,
    context: NavigationContext
  ): Promise<LearnedPattern> {
    if (!this.config.enabled) {
      throw new Error('Pattern learning is disabled');
    }

    try {
      // Ensure context is included in pattern input
      const enhancedInput: LearnedPatternInput = {
        ...patternInput,
        context: {
          ...patternInput.context,
          // Ensure domain matches context
          domain: context.domain,
          // Keep URL pattern if provided
          urlPattern: patternInput.context.urlPattern,
          // Add page structure hash if available
          pageStructureHash: patternInput.context.pageStructureHash || context.pageStructure?.structureHash,
          // Add error information if available
          errorType: patternInput.context.errorType || context.errorType,
          errorMessage: patternInput.context.errorMessage || context.errorMessage,
        },
        metadata: {
          ...patternInput.metadata,
          // Ensure runId matches context
          runId: patternInput.metadata.runId || context.runId,
          // Set learnedFrom if not provided
          learnedFrom: patternInput.metadata.learnedFrom || 'user_intervention',
        },
      };

      // Validate pattern syntax before saving
      // Create a temporary pattern for validation
      const tempPattern: LearnedPattern = {
        id: 'temp',
        pattern: enhancedInput.pattern,
        patternType: enhancedInput.patternType,
        sourceUrl: enhancedInput.sourceUrl,
        context: enhancedInput.context,
        effectiveness: {
          successCount: 0,
          failureCount: 0,
          confidence: 0.5,
        },
        metadata: {
          ...enhancedInput.metadata,
          learnedAt: new Date(),
        },
        status: 'experimental',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validationResult = this.patternValidator.validate(tempPattern);
      if (!validationResult.isValid) {
        throw new Error(`Pattern validation failed: ${validationResult.reason}`);
      }

      // Save pattern to repository
      const learnedPattern = await this.patternRepository.save(enhancedInput);

      // Log pattern learning
      await this.runManager.log(
        context.runId,
        `Pattern learned: ${learnedPattern.id} (type: ${learnedPattern.patternType}, source: ${learnedPattern.sourceUrl})`,
        'info'
      );

      logger.info(
        {
          patternId: learnedPattern.id,
          patternType: learnedPattern.patternType,
          context,
        },
        'Pattern learned successfully'
      );

      return learnedPattern;
    } catch (error) {
      logger.error({ error, patternInput, context }, 'Error learning pattern');
      await this.runManager.log(
        context.runId,
        `Error learning pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Track pattern application result for learning.
   * 
   * Updates pattern effectiveness metrics and handles auto-deprecation.
   * 
   * @param patternId - ID of the pattern that was applied
   * @param success - Whether the application was successful
   * @param context - Navigation context where pattern was applied
   * @param matchScore - Optional match score from ranking
   */
  async trackApplicationResult(
    patternId: string,
    success: boolean,
    context: NavigationContext,
    matchScore?: number
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      logger.debug(
        { patternId, success, matchScore },
        'Tracking pattern application result'
      );

      // Update pattern effectiveness
      await this.patternRepository.updateEffectiveness(patternId, success, matchScore);

      // Get updated pattern to check for auto-deprecation and notify LearningService
      const pattern = await this.patternRepository.findById(patternId);
      if (!pattern) {
        logger.warn({ patternId }, 'Pattern not found for effectiveness tracking');
        return;
      }

      // Notify LearningService for cross-system learning
      try {
        const applicationResult: PatternApplicationResult = {
          applied: true,
          pattern,
          matchScore,
          reason: success ? 'pattern_applied' : 'validation_failed',
        };
        await this.learningService.learnFromPatternApplication(applicationResult, context, success);
      } catch (error) {
        // Log but don't fail - LearningService integration is optional
        logger.warn({ error, patternId }, 'Failed to notify LearningService of pattern application');
      }

      // Check for auto-deprecation
      if (
        pattern.effectiveness.confidence < this.config.deprecationThreshold &&
        pattern.status !== 'deprecated'
      ) {
        logger.info(
          {
            patternId,
            confidence: pattern.effectiveness.confidence,
            threshold: this.config.deprecationThreshold,
          },
          'Auto-deprecating pattern due to low confidence'
        );
        await this.patternRepository.deprecatePattern(
          patternId,
          `Auto-deprecated: confidence ${pattern.effectiveness.confidence.toFixed(2)} below threshold ${this.config.deprecationThreshold}`
        );
      }

      // Check for auto-deprecation after multiple failures
      const failureCount = pattern.effectiveness.failureCount;
      if (
        failureCount >= this.config.autoDeprecateAfterFailures &&
        pattern.status !== 'deprecated'
      ) {
        logger.info(
          {
            patternId,
            failureCount,
            threshold: this.config.autoDeprecateAfterFailures,
          },
          'Auto-deprecating pattern due to excessive failures'
        );
        await this.patternRepository.deprecatePattern(
          patternId,
          `Auto-deprecated: ${failureCount} failures exceeded threshold of ${this.config.autoDeprecateAfterFailures}`
        );
      }

      // Log application result
      await this.runManager.log(
        context.runId,
        `Pattern application tracked: ${patternId} (success: ${success}, matchScore: ${matchScore?.toFixed(2) || 'N/A'})`,
        success ? 'info' : 'warn'
      );

      logger.debug(
        {
          patternId,
          success,
          matchScore,
          context,
        },
        'Pattern application result tracked'
      );
    } catch (error) {
      logger.error(
        { error, patternId, success, context },
        'Error tracking pattern application result'
      );
      await this.runManager.log(
        context.runId,
        `Error tracking pattern result: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      // Don't throw - tracking failures shouldn't break the main flow
    }
  }


  /**
   * Get current configuration
   */
  getConfig(): PatternLearningConfig {
    return this.config;
  }

  /**
   * Update configuration (useful for testing or dynamic configuration)
   */
  updateConfig(config: Partial<PatternLearningConfig>): void {
    // Convert PatternLearningConfig to PatternLearningConfigManager format
    const managerConfig: Partial<import('../../config/patternLearningConfig.js').PatternLearningConfig> = {};
    if (config.enabled !== undefined) managerConfig.enabled = config.enabled;
    if (config.minConfidence !== undefined) managerConfig.minConfidenceThreshold = config.minConfidence;
    if (config.minMatchScore !== undefined) managerConfig.minMatchScore = config.minMatchScore;
    if (config.deprecationThreshold !== undefined) managerConfig.minSuccessRate = config.deprecationThreshold;
    if (config.autoDeprecateAfterFailures !== undefined) managerConfig.maxFailureCount = config.autoDeprecateAfterFailures;
    if (config.matcherStrategy !== undefined) {
      managerConfig.matcherType = config.matcherStrategy === 'semantic' ? 'semantic' :
                                   config.matcherStrategy === 'structural' ? 'structural' : 'hybrid';
    }
    this.configManager.updateConfig(managerConfig);
    const managerConfigResult = this.configManager.getConfig();
    // Convert back to PatternLearningConfig format
    this.config = {
      enabled: managerConfigResult.enabled,
      minConfidence: managerConfigResult.minConfidenceThreshold,
      minMatchScore: managerConfigResult.minMatchScore,
      deprecationThreshold: managerConfigResult.minSuccessRate,
      autoDeprecateAfterFailures: managerConfigResult.maxFailureCount,
      matcherStrategy: managerConfigResult.matcherType === 'semantic' ? 'semantic' : 
                       managerConfigResult.matcherType === 'structural' ? 'structural' : 'hybrid'
    };
  }
}
