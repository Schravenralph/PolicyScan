import { FeatureFlag, KGFeatureFlag, FeatureFlagDocument } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';
import { ensureDBConnection } from '../../config/database.js';

/**
 * General Feature Flags Service
 * 
 * Provides runtime feature flag management for all features with:
 * - Environment variable configuration (takes precedence)
 * - MongoDB persistence for runtime changes
 * - In-memory caching for performance (< 1ms flag checks)
 * - Event emission for flag changes
 * 
 * Supports both KG-specific flags and general feature flags.
 */
export class FeatureFlagsService extends EventEmitter {
  private cache: Map<string, boolean> = new Map();
  private cacheTimestamp: Map<string, number> = new Map();
  private cacheTTL: number = 60000; // 1 minute cache TTL
  private initialized: boolean = false;

  /**
   * Initialize the service and load flags from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure database connection is available before initializing flags
      try {
        await ensureDBConnection();
      } catch (dbError) {
        logger.warn({ error: dbError }, '[FeatureFlags] Database not available, continuing with env var defaults');
        // Continue with env var defaults even if DB is not available
        this.initialized = true;
        return;
      }

      // Initialize default KG flags in database if they don't exist
      await FeatureFlag.initializeKGFlags();
      
      // Load all flags from database and cache them
      await this.refreshCache();
      
      this.initialized = true;
      logger.info('[FeatureFlags] Service initialized');
    } catch (error) {
      logger.error({ error }, '[FeatureFlags] Failed to initialize');
      // Continue with env var defaults even if DB fails
      this.initialized = true;
    }
  }

  /**
   * Refresh the in-memory cache from database
   * @param flagNames Optional array of flag names to refresh. If not provided, refreshes all flags.
   */
  async refreshCache(flagNames?: string[]): Promise<void> {
    try {
      const flags = flagNames 
        ? await FeatureFlag.findByNames(flagNames)
        : await FeatureFlag.findAll();
      
      for (const flag of flags) {
        this.cache.set(flag.name, flag.enabled);
        this.cacheTimestamp.set(flag.name, Date.now());
      }

      this.emit('cache-refreshed', flags);
    } catch (error) {
      logger.error({ error }, '[FeatureFlags] Failed to refresh cache');
    }
  }

  /**
   * Check if a feature flag is enabled
   * Priority: Environment variable > Database > Default (true)
   * 
   * @param flagName The feature flag name (string or KGFeatureFlag enum)
   * @param defaultValue Default value if flag not found (default: true for backwards compatibility)
   * @param context Optional context for analytics tracking
   * @returns true if enabled, false otherwise
   */
  isEnabled(
    flagName: string | KGFeatureFlag,
    defaultValue: boolean = true,
    context?: {
      service?: string;
      workflow?: string;
      userId?: string;
      userRole?: string;
    }
  ): boolean {
    const startTime = Date.now();
    const flagNameStr = typeof flagName === 'string' ? flagName : String(flagName);
    let enabled: boolean;
    let source: 'environment' | 'database' | 'default';
    
    // 1. Check environment variable (highest priority)
    const envValue = process.env[flagNameStr];
    if (envValue !== undefined) {
      enabled = envValue.toLowerCase() === 'true' || envValue === '1';
      source = 'environment';
      if (enabled !== defaultValue) {
        logger.debug(`[FeatureFlags] ${flagNameStr} = ${enabled} (from env var)`);
      }
    } else {
      // 2. Check cache (fast path)
      const cached = this.cache.get(flagNameStr);
      const cacheTime = this.cacheTimestamp.get(flagNameStr);
      
      if (cached !== undefined && cacheTime && (Date.now() - cacheTime) < this.cacheTTL) {
        enabled = cached;
        source = 'database';
      } else {
        // 3. Fallback to default (for backwards compatibility, default to enabled)
        enabled = defaultValue;
        source = 'default';
      }
    }

    // Track analytics (async, don't block)
    const latencyMs = Date.now() - startTime;
    this.trackCheckAsync(flagNameStr, enabled, latencyMs, source, context).catch(error => {
      logger.debug({ error }, '[FeatureFlags] Failed to track flag check');
    });

    return enabled;
  }

  /**
   * Track flag check asynchronously (non-blocking)
   */
  private async trackCheckAsync(
    flagName: string,
    enabled: boolean,
    latencyMs: number,
    source: 'environment' | 'database' | 'default',
    context?: {
      service?: string;
      workflow?: string;
      userId?: string;
      userRole?: string;
    }
  ): Promise<void> {
    try {
      // Only track if analytics service is available (lazy import to avoid circular dependencies)
      const { getFeatureFlagAnalyticsService } = await import('../feature-flags/FeatureFlagAnalyticsService.js');
      const analyticsService = getFeatureFlagAnalyticsService();
      analyticsService.trackCheck(flagName, enabled, latencyMs, source, context);
    } catch (error) {
      // Silently fail - analytics should not break flag checks
      logger.debug({ error }, '[FeatureFlags] Analytics service not available');
    }
  }

  /**
   * Get all feature flag states
   * @param flagNames Optional array of flag names to retrieve. If not provided, returns all KG flags.
   */
  getAllFlags(flagNames?: string[]): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const flagsToCheck = flagNames || Object.values(KGFeatureFlag);
    
    for (const flagName of flagsToCheck) {
      result[flagName] = this.isEnabled(flagName);
    }
    
    return result;
  }

  /**
   * Set a feature flag value (updates database and cache)
   * 
   * @param flagName The feature flag name (string or KGFeatureFlag enum)
   * @param enabled Whether the flag should be enabled
   * @param updatedBy User email or system identifier
   */
  async setFlag(
    flagName: string | KGFeatureFlag,
    enabled: boolean,
    updatedBy?: string
  ): Promise<void> {
    const flagNameStr = typeof flagName === 'string' ? flagName : String(flagName);
    try {
      const previousValue = this.isEnabled(flagNameStr);
      
      // Update database
      await FeatureFlag.upsert({
        name: flagNameStr,
        enabled,
        updatedBy: updatedBy || 'system',
      });

      // Update cache immediately
      this.cache.set(flagNameStr, enabled);
      this.cacheTimestamp.set(flagNameStr, Date.now());

      // Emit event for monitoring/auditing
      if (previousValue !== enabled) {
        this.emit('flag-changed', {
          flagName: flagNameStr,
          previousValue,
          newValue: enabled,
          updatedBy: updatedBy || 'system',
          timestamp: new Date(),
        });

        logger.info(
          `[FeatureFlags] ${flagNameStr} changed from ${previousValue} to ${enabled} by ${updatedBy || 'system'}`
        );
      }
    } catch (error) {
      logger.error({ error, flagName: flagNameStr }, '[FeatureFlags] Failed to set flag');
      throw error;
    }
  }

  /**
   * Get feature flag details from database
   */
  async getFlagDetails(flagName: string | KGFeatureFlag): Promise<FeatureFlagDocument | null> {
    const flagNameStr = typeof flagName === 'string' ? flagName : String(flagName);
    return await FeatureFlag.findByName(flagNameStr);
  }

  /**
   * Get all feature flag details from database
   * @param flagNames Optional array of flag names. If not provided, returns all flags.
   */
  async getAllFlagDetails(flagNames?: string[]): Promise<FeatureFlagDocument[]> {
    if (flagNames) {
      return await FeatureFlag.findByNames(flagNames);
    }
    return await FeatureFlag.findAll();
  }

  /**
   * Check if KG is enabled (master flag)
   */
  isKGEnabled(): boolean {
    return this.isEnabled(KGFeatureFlag.KG_ENABLED, true);
  }

  /**
   * Check if KG retrieval is enabled (for HybridSearchService)
   * Returns false if KG_ENABLED is false
   */
  isRetrievalEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_RETRIEVAL_ENABLED, true);
  }

  /**
   * Check if KG extraction is enabled (for document extraction services)
   * Returns false if KG_ENABLED is false
   */
  isExtractionEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_EXTRACTION_ENABLED, true);
  }

  /**
   * Check if KG validation is enabled (for validation services)
   * Returns false if KG_ENABLED is false
   */
  isValidationEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_VALIDATION_ENABLED, true);
  }

  /**
   * Check if KG reasoning is enabled (for multi-hop reasoning)
   * Returns false if KG_ENABLED is false
   */
  isReasoningEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, true);
  }

  /**
   * Check if KG relationship extraction is enabled
   * Returns false if KG_ENABLED or KG_EXTRACTION_ENABLED is false
   */
  isRelationshipExtractionEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    if (!this.isExtractionEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED, false);
  }

  /**
   * Check if KG hybrid scoring is enabled
   * Returns false if KG_ENABLED is false
   */
  isHybridScoringEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_HYBRID_SCORING_ENABLED, true);
  }

  /**
   * Check if KG legal features are enabled (master flag)
   * Returns false if KG_ENABLED is false
   */
  isLegalFeaturesEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED, false);
  }

  /**
   * Get feature flag configuration for benchmarking
   * Returns a snapshot of all flags that can be used in benchmark metadata
   */
  getBenchmarkConfig(): Record<string, boolean | number> {
    return {
      ...this.getAllFlags(),
      timestamp: Date.now(),
    };
  }

  /**
   * Set multiple flags from a benchmark configuration
   * Useful for restoring flag states after benchmark runs
   */
  async setFlagsFromConfig(
    config: Record<string, boolean>,
    updatedBy?: string
  ): Promise<void> {
    for (const [flagName, enabled] of Object.entries(config)) {
      // Skip metadata fields
      if (flagName !== 'timestamp') {
        await this.setFlag(flagName, enabled, updatedBy);
      }
    }
  }
}

/**
 * @deprecated Use FeatureFlagsService instead. This alias is kept for backward compatibility.
 */
export class KnowledgeGraphFeatureFlagsService extends FeatureFlagsService {}

// Singleton instance
let featureFlagsServiceInstance: FeatureFlagsService | null = null;

/**
 * Get the singleton instance of FeatureFlagsService
 */
export function getFeatureFlagsService(): FeatureFlagsService {
  if (!featureFlagsServiceInstance) {
    featureFlagsServiceInstance = new FeatureFlagsService();
  }
  return featureFlagsServiceInstance;
}

/**
 * @deprecated Use getFeatureFlagsService() instead. This alias is kept for backward compatibility.
 */
export function getKnowledgeGraphFeatureFlagsService(): FeatureFlagsService {
  return getFeatureFlagsService();
}

// Initialize on module load (async, but don't block)
const service = getFeatureFlagsService();
service.initialize().catch((error) => {
  logger.error({ error }, '[FeatureFlags] Failed to initialize on module load');
});
