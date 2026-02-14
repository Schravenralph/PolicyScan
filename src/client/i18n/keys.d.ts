/**
 * Translation Key Utilities
 *
 * Lightweight module for translation key type checking.
 * This module has no dependency on the full i18n runtime (translations object, t function, etc.).
 * It only provides the type definition and validation function.
 */
export type { TranslationKey } from '../utils/i18n.js';
export { isTranslationKey } from '../utils/i18n.js';
