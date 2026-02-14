/**
 * Centralized Feature Flags Configuration
 * 
 * Provides a single source of truth for feature flags used across the application.
 * Supports environment variable configuration with type-safe access.
 * 
 * Priority: Environment variable > Default value
 */

/**
 * E2E Testing Feature Flags
 * 
 * @deprecated E2E fixtures are deprecated. E2E tests should use production services
 * (FEATURE_E2E_FIXTURES=false) to test real user experience. Fixtures are retained
 * for opt-in use cases (debugging, fast smoke tests) but are not the default.
 * 
 * See TEST-003 ADR (docs/06-adr/TEST-003-e2e-fixtures-deprecation.md) for details.
 */
export const E2E_FEATURE_FLAGS = {
  /**
   * Enable E2E fixtures mode
   * When enabled, workflow actions return deterministic fixture data instead of calling external services.
   * 
   * @deprecated E2E fixtures are deprecated. Use production services for E2E tests.
   * See TEST-003 ADR for details.
   * 
   * Environment variable: FEATURE_E2E_FIXTURES
   * Default: false
   */
  E2E_FIXTURES: process.env.FEATURE_E2E_FIXTURES === 'true',
} as const;

/**
 * Check if E2E fixtures are enabled
 * 
 * @deprecated E2E fixtures are deprecated. E2E tests should use production services
 * (FEATURE_E2E_FIXTURES=false) to test real user experience. Fixtures are retained
 * for opt-in use cases (debugging, fast smoke tests) but are not the default.
 * 
 * See TEST-003 ADR (docs/06-adr/TEST-003-e2e-fixtures-deprecation.md) for details.
 * 
 * IMPORTANT: Fixture mode is AUTOMATICALLY DISABLED in production environments.
 * This prevents accidental use of test fixtures in production.
 * 
 * @returns true if FEATURE_E2E_FIXTURES environment variable is set to 'true' AND not in production
 */
export function isE2EFixturesEnabled(): boolean {
  // CRITICAL: Never allow fixtures in production, even if flag is set
  // Also disable in non-test environments to prevent accidental fixture usage
  const isProduction = process.env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';
  const isTestEnvironment = process.env.E2E_TEST === 'true' || process.env.NODE_ENV === 'test';
  
  // Only allow fixtures in explicit test environments
  if (!isTestEnvironment) {
    if (process.env.FEATURE_E2E_FIXTURES === 'true') {
      console.error('[FeatureFlags] ⚠️  CRITICAL: FEATURE_E2E_FIXTURES=true detected in NON-TEST environment!');
      console.error('[FeatureFlags] ⚠️  Fixture mode is FORCED DISABLED - this should only be used for E2E testing.');
      console.error('[FeatureFlags] ⚠️  Remove FEATURE_E2E_FIXTURES=true from your environment configuration.');
      console.error('[FeatureFlags] ⚠️  Environment:', { 
        ENVIRONMENT: process.env.ENVIRONMENT, 
        NODE_ENV: process.env.NODE_ENV,
        E2E_TEST: process.env.E2E_TEST 
      });
    }
    return false;
  }
  
  if (isProduction) {
    if (process.env.FEATURE_E2E_FIXTURES === 'true') {
      console.error('[FeatureFlags] ⚠️  CRITICAL: FEATURE_E2E_FIXTURES=true detected in PRODUCTION environment!');
      console.error('[FeatureFlags] ⚠️  Fixture mode is FORCED DISABLED in production for safety.');
      console.error('[FeatureFlags] ⚠️  Remove FEATURE_E2E_FIXTURES=true from your environment configuration.');
    }
    return false;
  }
  
  const enabled = E2E_FEATURE_FLAGS.E2E_FIXTURES;
  if (enabled) {
    console.warn(`[FeatureFlags] ⚠️  Fixture mode ENABLED: ${enabled} (process.env.FEATURE_E2E_FIXTURES: ${process.env.FEATURE_E2E_FIXTURES})`);
    console.warn(`[FeatureFlags] ⚠️  This should only be used for E2E testing, not production!`);
  } else {
    console.log(`[FeatureFlags] ✅ Fixture mode disabled (production mode)`);
  }
  return enabled;
}

/**
 * Feature flag names for reference
 */
export const FEATURE_FLAG_NAMES = {
  E2E_FIXTURES: 'FEATURE_E2E_FIXTURES',
} as const;

/**
 * Get all E2E feature flag states
 * Useful for debugging and logging
 */
export function getE2EFeatureFlags(): Record<string, boolean> {
  return {
    [FEATURE_FLAG_NAMES.E2E_FIXTURES]: isE2EFixturesEnabled(),
  };
}

