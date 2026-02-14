/**
 * Translation Verification Utility
 * 
 * Helps verify that translations are working correctly and identifies
 * potential missing translations.
 */

import { t } from './i18n.js';
import { translateLogMessage } from './logTranslations.js';
import type { TranslationKey } from './i18n.js';

/**
 * Verify that a translation key exists and returns a non-empty string
 */
export function verifyTranslationKey(key: TranslationKey): boolean {
  try {
    const translation = t(key);
    return translation !== key && translation.length > 0;
  } catch {
    return false;
  }
}

/**
 * Verify that a log message gets translated
 */
export function verifyLogTranslation(message: string): {
  isTranslated: boolean;
  original: string;
  translated: string;
} {
  const translated = translateLogMessage(message);
  return {
    isTranslated: translated !== message,
    original: message,
    translated,
  };
}

/**
 * Test common log message patterns to ensure they're translated
 */
export function testCommonLogTranslations(): {
  passed: number;
  failed: number;
  results: Array<{ message: string; translated: boolean; result: string }>;
} {
  const testMessages = [
    'Run resumed',
    'Workflow execution started',
    'Workflow completed successfully',
    'Workflow failed',
    'Pause requested by user',
    'Starting execution of step: Scan IPLO (scan-iplo) with action: scan_iplo',
    'Processing subject: "bodem"',
    'Enhancing query for "bodem"...',
    'Scanning IPLO for: bodem (Theme: bodem)',
    'Found 5 documents for "bodem"',
    'Semantic theme routing for: bodem',
    'Selected themes via vectors: bodem (0.50)',
    'Starting theme-based scraping for slug: bodem',
    'Crawling: https://iplo.nl/thema/bodem/ (Depth: 1)',
    'Found 17 documents on https://iplo.nl/thema/bodem/',
    'Following 5 links from https://iplo.nl/thema/bodem/',
    'Processing 1 items...',
    'Workflow cancelled before step execution',
    'All workflow steps completed successfully. Finalizing workflow...',
    'Step failed: Scan IPLO - Connection timeout',
  ];

  const results = testMessages.map((message) => {
    const { isTranslated, translated } = verifyLogTranslation(message);
    return {
      message,
      translated: isTranslated,
      result: translated,
    };
  });

  const passed = results.filter((r) => r.translated).length;
  const failed = results.filter((r) => !r.translated).length;

  return {
    passed,
    failed,
    results,
  };
}

/**
 * Verify critical translation keys exist
 */
export function verifyCriticalTranslationKeys(): {
  passed: number;
  failed: number;
  missing: string[];
} {
  const criticalKeys: TranslationKey[] = [
    'workflowLogs.runResumed',
    'workflowLogs.pauseRequested',
    'workflowLogs.workflowCancelled',
    'workflowSteps.startingExecution',
    'workflowSteps.executingStep',
    'workflowSteps.stepCompleted',
    'errors.timeout.title',
    'errors.timeout.retry',
    'errors.timeout.dismiss',
  ];

  const missing: string[] = [];
  let passed = 0;
  let failed = 0;

  criticalKeys.forEach((key) => {
    if (verifyTranslationKey(key)) {
      passed++;
    } else {
      failed++;
      missing.push(key);
    }
  });

  return {
    passed,
    failed,
    missing,
  };
}

/**
 * Print translation verification report
 */
export function printTranslationReport(): void {
  console.log('=== Translation Verification Report ===\n');

  // Test log translations
  console.log('1. Testing Log Message Translations:');
  const logResults = testCommonLogTranslations();
  console.log(`   ✓ Passed: ${logResults.passed}`);
  console.log(`   ✗ Failed: ${logResults.failed}`);
  
  if (logResults.failed > 0) {
    console.log('\n   Untranslated messages:');
    logResults.results
      .filter((r) => !r.translated)
      .forEach((r) => {
        console.log(`     - "${r.message}"`);
      });
  }

  // Test critical keys
  console.log('\n2. Testing Critical Translation Keys:');
  const keyResults = verifyCriticalTranslationKeys();
  console.log(`   ✓ Passed: ${keyResults.passed}`);
  console.log(`   ✗ Failed: ${keyResults.failed}`);
  
  if (keyResults.missing.length > 0) {
    console.log('\n   Missing keys:');
    keyResults.missing.forEach((key) => {
      console.log(`     - ${key}`);
    });
  }

  console.log('\n=== End of Report ===\n');
}

