/**
 * PatternValidator - Validates learned navigation patterns before application
 * 
 * Validates:
 * - XPath syntax
 * - CSS selector syntax
 * - Confidence thresholds
 * - Deprecation status
 * - Pattern context
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import type { LearnedPattern, ValidationResult } from './types.js';

export interface PatternValidatorConfig {
  minConfidence?: number; // Minimum confidence threshold (default: 0.5)
  allowDeprecated?: boolean; // Whether to allow deprecated patterns (default: false)
  allowExperimental?: boolean; // Whether to allow experimental patterns (default: true)
}

/**
 * Pattern validator class
 */
export class PatternValidator {
  private config: Required<PatternValidatorConfig>;

  constructor(config: PatternValidatorConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.5,
      allowDeprecated: config.allowDeprecated ?? false,
      allowExperimental: config.allowExperimental ?? true,
    };
  }

  /**
   * Validate a learned pattern
   * 
   * @param pattern - Pattern to validate
   * @returns Validation result with isValid flag, reason, warnings, and adjusted confidence
   */
  validate(pattern: LearnedPattern): ValidationResult {
    const warnings: string[] = [];
    let isValid = true;
    let reason: string | undefined;
    let confidence = pattern.effectiveness.confidence;

    // 1. Validate pattern syntax based on type
    const syntaxValidation = this.validatePatternSyntax(pattern);
    if (!syntaxValidation.isValid) {
      isValid = false;
      reason = syntaxValidation.reason;
      return { isValid, reason, warnings, confidence: 0 };
    }
    if (syntaxValidation.warnings) {
      warnings.push(...syntaxValidation.warnings);
    }

    // 2. Check deprecation status (before confidence check, but don't fail yet if allowed)
    if (pattern.status === 'deprecated') {
      if (!this.config.allowDeprecated) {
        isValid = false;
        reason = 'Pattern is deprecated';
        return { isValid, reason, warnings, confidence: 0 };
      }
      warnings.push('Pattern is deprecated');
      // Confidence reduction will be applied after threshold check
    }

    // 3. Check experimental status
    if (pattern.status === 'experimental') {
      if (!this.config.allowExperimental) {
        isValid = false;
        reason = 'Pattern is experimental and experimental patterns are not allowed';
        return { isValid, reason, warnings, confidence: 0 };
      }
      warnings.push('Pattern is experimental');
      // Slightly reduce confidence for experimental patterns (will apply after threshold check)
    }

    // 4. Check effectiveness data early (to include warnings even if pattern is invalid)
    const totalAttempts = pattern.effectiveness.successCount + pattern.effectiveness.failureCount;
    if (totalAttempts === 0) {
      warnings.push('Pattern has no usage history');
    } else if (totalAttempts < 5) {
      warnings.push(`Pattern has limited usage history (${totalAttempts} attempts)`);
    }

    // 5. Check confidence threshold (before applying reductions)
    // Also allow deprecated patterns when explicitly allowed (they'll be handled separately)
    const isDeprecatedAndAllowed = pattern.status === 'deprecated' && this.config.allowDeprecated;
    if (confidence < this.config.minConfidence && !isDeprecatedAndAllowed) {
      isValid = false;
      reason = `Pattern confidence (${confidence.toFixed(2)}) is below minimum threshold (${this.config.minConfidence.toFixed(2)})`;
      return { isValid, reason, warnings, confidence };
    }

    // Apply confidence reductions for deprecated/experimental patterns
    if (pattern.status === 'deprecated' && this.config.allowDeprecated) {
      confidence = Math.max(0, confidence * 0.5);
      // Don't re-check threshold for deprecated patterns when explicitly allowed
    } else if (pattern.status === 'experimental' && this.config.allowExperimental) {
      confidence = Math.max(0, confidence * 0.8);
      // Re-check confidence after experimental reduction
      if (confidence < this.config.minConfidence && confidence > 0) {
        isValid = false;
        reason = `Pattern confidence (${confidence.toFixed(2)}) is below minimum threshold (${this.config.minConfidence.toFixed(2)}) after adjustments`;
        return { isValid, reason, warnings, confidence };
      }
    } else {
      // Re-check confidence after reductions (for non-deprecated, non-experimental patterns)
      if (confidence < this.config.minConfidence && confidence > 0) {
        isValid = false;
        reason = `Pattern confidence (${confidence.toFixed(2)}) is below minimum threshold (${this.config.minConfidence.toFixed(2)}) after adjustments`;
        return { isValid, reason, warnings, confidence };
      }
    }

    // 6. Validate pattern context
    const contextValidation = this.validatePatternContext(pattern);
    if (!contextValidation.isValid) {
      isValid = false;
      reason = contextValidation.reason;
      return { isValid, reason, warnings, confidence: 0 };
    }
    if (contextValidation.warnings) {
      warnings.push(...contextValidation.warnings);
    }

    return {
      isValid,
      reason: isValid ? undefined : reason,
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence,
    };
  }

  /**
   * Validate pattern syntax based on pattern type
   */
  private validatePatternSyntax(pattern: LearnedPattern): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    const warnings: string[] = [];

    switch (pattern.patternType) {
      case 'xpath':
        return this.validateXPathSyntax(pattern.pattern, warnings);
      case 'css':
        return this.validateCssSelectorSyntax(pattern.pattern, warnings);
      case 'url_pattern':
        return this.validateUrlPatternSyntax(pattern.pattern, warnings);
      case 'semantic':
        // Semantic patterns are just text descriptions, minimal validation
        if (!pattern.pattern || pattern.pattern.trim().length === 0) {
          return {
            isValid: false,
            reason: 'Semantic pattern cannot be empty',
          };
        }
        if (pattern.pattern.length < 3) {
          warnings.push('Semantic pattern is very short');
        }
        return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
      default:
        return {
          isValid: false,
          reason: `Unknown pattern type: ${pattern.patternType}`,
        };
    }
  }

  /**
   * Validate XPath syntax
   */
  private validateXPathSyntax(xpath: string, warnings: string[]): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    if (!xpath || xpath.trim().length === 0) {
      return {
        isValid: false,
        reason: 'XPath cannot be empty',
      };
    }

    // Basic XPath syntax validation
    // Check for balanced parentheses and brackets
    const openParens = (xpath.match(/\(/g) || []).length;
    const closeParens = (xpath.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return {
        isValid: false,
        reason: 'XPath has unbalanced parentheses',
      };
    }

    const openBrackets = (xpath.match(/\[/g) || []).length;
    const closeBrackets = (xpath.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return {
        isValid: false,
        reason: 'XPath has unbalanced brackets',
      };
    }

    // Check for valid XPath axis or node test at the start
    if (!xpath.startsWith('/') && !xpath.startsWith('//') && !xpath.startsWith('@') && !xpath.startsWith('.')) {
      warnings.push('XPath should typically start with /, //, @, or .');
    }

    // Check for common XPath syntax issues
    // Count sequences of // (not just the characters)
    const doubleSlashSequences = (xpath.match(/\/\//g) || []).length;
    if (doubleSlashSequences >= 5) {
      warnings.push('XPath contains many // operators, which may be inefficient');
    }

    // Check for potentially dangerous XPath expressions
    if (xpath.includes('//*') && xpath.split('//*').length > 3) {
      warnings.push('XPath contains many //* wildcards, which may match too many elements');
    }

    // Try to parse as a basic XPath (simplified validation)
    // We can't fully validate without a DOM, but we can check basic structure
    try {
      // Check for valid XPath characters and structure
      const xpathRegex = /^(\/\/?|\.\.?\/?|@)?([a-zA-Z_][a-zA-Z0-9_-]*|\*)(\[.*?\])*(\/\/?([a-zA-Z_][a-zA-Z0-9_-]*|\*)(\[.*?\])*)*$/;
      if (!xpathRegex.test(xpath.replace(/\s+/g, ''))) {
        // Not a strict match, but check if it's at least somewhat valid
        // Allow more complex XPath expressions
        if (xpath.includes('[') && !xpath.includes(']')) {
          return {
            isValid: false,
            reason: 'XPath has unclosed bracket',
          };
        }
      }
    } catch (_error) {
      // If regex fails, continue with other checks
    }

    return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Validate CSS selector syntax
   */
  private validateCssSelectorSyntax(selector: string, warnings: string[]): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    if (!selector || selector.trim().length === 0) {
      return {
        isValid: false,
        reason: 'CSS selector cannot be empty',
      };
    }

    // Check for balanced brackets and parentheses
    const openBrackets = (selector.match(/\[/g) || []).length;
    const closeBrackets = (selector.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return {
        isValid: false,
        reason: 'CSS selector has unbalanced brackets',
      };
    }

    const openParens = (selector.match(/\(/g) || []).length;
    const closeParens = (selector.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return {
        isValid: false,
        reason: 'CSS selector has unbalanced parentheses',
      };
    }

    // Check for valid CSS selector characters
    // CSS selectors can contain: letters, numbers, hyphens, underscores, colons, dots, hashes, brackets, parentheses, spaces, >, +, ~, |, *
    const invalidChars = selector.match(/[^a-zA-Z0-9_\-:.#[\]()\s>+~|,*]/);
    if (invalidChars) {
      return {
        isValid: false,
        reason: `CSS selector contains invalid characters: ${invalidChars[0]}`,
      };
    }

    // Check for common CSS selector patterns
    // Valid selectors should start with a valid character (letter, #, ., [, :, *)
    const firstChar = selector.trim()[0];
    if (!/[a-zA-Z#.[:>+~*]/.test(firstChar)) {
      return {
        isValid: false,
        reason: `CSS selector must start with a valid character (tag, class, id, attribute, etc.)`,
      };
    }

    // Check for potentially inefficient selectors
    // Count standalone wildcards separated by spaces (like "* * * *")
    // Split by spaces and count standalone asterisks
    const parts = selector.trim().split(/\s+/);
    const wildcardCount = parts.filter(part => part === '*').length;
    if (wildcardCount > 2) {
      warnings.push('CSS selector contains many wildcards, which may be inefficient');
    }

    // Check for very long selectors
    if (selector.length > 500) {
      warnings.push('CSS selector is very long, consider simplifying');
    }

    return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Validate URL pattern syntax (regex pattern)
   */
  private validateUrlPatternSyntax(pattern: string, warnings: string[]): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    if (!pattern || pattern.trim().length === 0) {
      return {
        isValid: false,
        reason: 'URL pattern cannot be empty',
      };
    }

    // Try to compile as a regex
    try {
      const regex = new RegExp(pattern);
      // Test with a sample URL
      regex.test('https://example.com/test');
    } catch (err) {
      return {
        isValid: false,
        reason: `Invalid regex pattern: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    // Check for potentially dangerous regex patterns (catastrophic backtracking)
    if (pattern.includes('.*.*') || pattern.includes('++') || pattern.includes('**')) {
      warnings.push('URL pattern may cause catastrophic backtracking');
    }

    // Check for very long patterns
    if (pattern.length > 1000) {
      warnings.push('URL pattern is very long, consider simplifying');
    }

    return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Validate pattern context
   */
  private validatePatternContext(pattern: LearnedPattern): {
    isValid: boolean;
    reason?: string;
    warnings?: string[];
  } {
    const warnings: string[] = [];

    // Check domain is present and valid
    if (!pattern.context.domain || pattern.context.domain.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Pattern context must include a domain',
      };
    }

    // Validate domain format (basic check)
    try {
      // Try to construct a URL with the domain
      new URL(`https://${pattern.context.domain}`);
    } catch (_error) {
      // Domain format is invalid, warn about it
      warnings.push(`Domain format may be invalid: ${pattern.context.domain}`);
    }
    
    // Additional check for obviously invalid domains (double dots, etc.)
    if (pattern.context.domain.includes('..') || !pattern.context.domain.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
      warnings.push(`Domain format may be invalid: ${pattern.context.domain}`);
    }

    // Check source URL is present and valid
    if (!pattern.sourceUrl || pattern.sourceUrl.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Pattern must have a source URL',
      };
    }

    try {
      new URL(pattern.sourceUrl);
    } catch (_error) {
      return {
        isValid: false,
        reason: `Invalid source URL: ${pattern.sourceUrl}`,
      };
    }

    // Check if URL pattern matches domain (if both present)
    if (pattern.context.urlPattern) {
      try {
        const urlPatternRegex = new RegExp(pattern.context.urlPattern);
        // Check if pattern would match the domain
        const testUrl = `https://${pattern.context.domain}/test`;
        if (!urlPatternRegex.test(testUrl) && !urlPatternRegex.test(pattern.sourceUrl)) {
          warnings.push('URL pattern may not match the domain or source URL');
        }
      } catch (_error) {
        // URL pattern validation already checked in validateUrlPatternSyntax
      }
    }

    return { isValid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Validate multiple patterns at once
   * 
   * @param patterns - Array of patterns to validate
   * @returns Map of pattern IDs to validation results
   */
  validateBatch(patterns: LearnedPattern[]): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();
    for (const pattern of patterns) {
      results.set(pattern.id, this.validate(pattern));
    }
    return results;
  }

  /**
   * Check if a pattern passes all validation checks
   * 
   * @param pattern - Pattern to check
   * @returns True if pattern is valid and can be applied
   */
  canApply(pattern: LearnedPattern): boolean {
    return this.validate(pattern).isValid;
  }

  /**
   * Get validation summary for a pattern
   * 
   * @param pattern - Pattern to summarize
   * @returns Human-readable validation summary
   */
  getValidationSummary(pattern: LearnedPattern): string {
    const result = this.validate(pattern);
    if (result.isValid) {
      const parts = [`✓ Pattern is valid (confidence: ${result.confidence.toFixed(2)})`];
      if (result.warnings && result.warnings.length > 0) {
        parts.push(`\n  Warnings: ${result.warnings.join(', ')}`);
      }
      return parts.join('');
    } else {
      return `✗ Pattern is invalid: ${result.reason || 'Unknown reason'}`;
    }
  }
}
