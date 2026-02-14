/**
 * Feature Flag Formatters
 * 
 * Explicit mapping from domain values (booleans) to translated strings.
 * This enforces the separation between domain data and presentation.
 */

import { t, type TranslationKey } from './i18n.js';

/**
 * Feature flag state type (domain value)
 */
export type FeatureFlagState = boolean;

/**
 * Mapping from feature flag state to translation key
 */
const featureFlagLabelKey: Record<string, TranslationKey> = {
  'true': 'featureFlags.enabled',
  'false': 'featureFlags.disabled',
} as const;

/**
 * Format feature flag state to translated string
 * 
 * @param enabled - Feature flag enabled state (boolean)
 * @returns Translated string ("Ingeschakeld" or "Uitgeschakeld")
 */
export function formatFeatureFlagState(enabled: boolean): string {
  return t(featureFlagLabelKey[String(enabled)]);
}
