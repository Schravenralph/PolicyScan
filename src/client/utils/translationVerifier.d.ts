/**
 * Translation Verification Utility
 *
 * Helps verify that translations are working correctly and identifies
 * potential missing translations.
 */
import type { TranslationKey } from './i18n.js';
/**
 * Verify that a translation key exists and returns a non-empty string
 */
export declare function verifyTranslationKey(key: TranslationKey): boolean;
/**
 * Verify that a log message gets translated
 */
export declare function verifyLogTranslation(message: string): {
    isTranslated: boolean;
    original: string;
    translated: string;
};
/**
 * Test common log message patterns to ensure they're translated
 */
export declare function testCommonLogTranslations(): {
    passed: number;
    failed: number;
    results: Array<{
        message: string;
        translated: boolean;
        result: string;
    }>;
};
/**
 * Verify critical translation keys exist
 */
export declare function verifyCriticalTranslationKeys(): {
    passed: number;
    failed: number;
    missing: string[];
};
/**
 * Print translation verification report
 */
export declare function printTranslationReport(): void;
