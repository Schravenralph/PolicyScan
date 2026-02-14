/**
 * Feature Flag Formatters
 *
 * Explicit mapping from domain values (booleans) to translated strings.
 * This enforces the separation between domain data and presentation.
 */
/**
 * Feature flag state type (domain value)
 */
export type FeatureFlagState = boolean;
/**
 * Format feature flag state to translated string
 *
 * @param enabled - Feature flag enabled state (boolean)
 * @returns Translated string ("Ingeschakeld" or "Uitgeschakeld")
 */
export declare function formatFeatureFlagState(enabled: boolean): string;
