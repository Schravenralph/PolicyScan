/**
 * MigrationFeatureFlags
 * 
 * Feature flags for v2 rollout migration phases.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/13-migrations-and-backfills.md
 */

import { FeatureFlagsService } from '../knowledge-graph/KnowledgeGraphFeatureFlags.js';

/**
 * Migration feature flag names
 */
export enum MigrationFeatureFlag {
  // Phase B: Dual-write
  MIGRATION_LEGACY_WRITE_ENABLED = 'MIGRATION_LEGACY_WRITE_ENABLED',
  
  // Phase D: Read cutover
  MIGRATION_USE_CANONICAL_SEARCH = 'MIGRATION_USE_CANONICAL_SEARCH',
  MIGRATION_LEGACY_SEARCH_FALLBACK = 'MIGRATION_LEGACY_SEARCH_FALLBACK',
}

/**
 * MigrationFeatureFlags - Helper service for migration feature flags
 */
export class MigrationFeatureFlags {
  private featureFlags: FeatureFlagsService;

  constructor() {
    this.featureFlags = new FeatureFlagsService();
  }

  /**
   * Check if legacy write is enabled (Phase B)
   * Default: true (enabled during migration period)
   */
  isLegacyWriteEnabled(): boolean {
    return this.featureFlags.isEnabled(
      MigrationFeatureFlag.MIGRATION_LEGACY_WRITE_ENABLED,
      true // Default to enabled during migration
    );
  }

  /**
   * Check if canonical search should be used (Phase D)
   * Default: false (use legacy search until cutover)
   */
  useCanonicalSearch(): boolean {
    return this.featureFlags.isEnabled(
      MigrationFeatureFlag.MIGRATION_USE_CANONICAL_SEARCH,
      false // Default to legacy search
    );
  }

  /**
   * Check if legacy search fallback is enabled (Phase D)
   * Default: true (enable fallback during cutover period)
   */
  isLegacySearchFallbackEnabled(): boolean {
    return this.featureFlags.isEnabled(
      MigrationFeatureFlag.MIGRATION_LEGACY_SEARCH_FALLBACK,
      true // Default to enabled during cutover
    );
  }
}

// Singleton instance
let migrationFeatureFlags: MigrationFeatureFlags | null = null;

/**
 * Get singleton instance of MigrationFeatureFlags
 */
export function getMigrationFeatureFlags(): MigrationFeatureFlags {
  if (!migrationFeatureFlags) {
    migrationFeatureFlags = new MigrationFeatureFlags();
  }
  return migrationFeatureFlags;
}

