/**
 * URL Validation and Normalization Utilities
 * 
 * Provides utilities for validating and normalizing URLs before adding them
 * to entities. Ensures URLs are valid and properly formatted.
 * 
 * @see docs/04-policies/error-handling-standard.md
 * @see docs/21-issues/WI-SEMANTIC-CONSISTENCY-FIXES.md
 */

import { logger } from './logger.js';

/**
 * Validates if a string is a valid URL
 * 
 * @param url - The URL string to validate
 * @returns True if URL is valid, false otherwise
 * 
 * @example
 * ```typescript
 * isValidUrl('https://example.com') // true
 * isValidUrl('http://example.com') // true
 * isValidUrl('not-a-url') // false
 * isValidUrl('') // false
 * ```
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(url);
    // Must have http or https protocol
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a URL
 * 
 * Rules:
 * - Validates URL format
 * - Adds https:// protocol if missing
 * - Normalizes URL (removes trailing slashes, etc.)
 * - Returns undefined for invalid URLs
 * 
 * @param url - The URL string to validate and normalize
 * @param options - Normalization options
 * @returns Normalized URL or undefined if invalid
 * 
 * @example
 * ```typescript
 * // Valid URL
 * validateAndNormalizeUrl('https://example.com/path')
 * // Returns: 'https://example.com/path'
 * 
 * // URL without protocol
 * validateAndNormalizeUrl('example.com/path')
 * // Returns: 'https://example.com/path'
 * 
 * // Invalid URL
 * validateAndNormalizeUrl('not-a-url')
 * // Returns: undefined
 * ```
 */
export function validateAndNormalizeUrl(
  url: string | undefined | null,
  options: {
    defaultProtocol?: 'http' | 'https';
    removeTrailingSlash?: boolean;
    requireProtocol?: boolean;
  } = {}
): string | undefined {
  const {
    defaultProtocol = 'https',
    removeTrailingSlash = true,
    requireProtocol = false,
  } = options;

  // Return undefined for null/undefined/empty
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return undefined;
  }

  let normalized = url.trim();

  // Try to add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    if (requireProtocol) {
      // If protocol is required and missing, return undefined
      return undefined;
    }
    // Add default protocol
    normalized = `${defaultProtocol}://${normalized}`;
  }

  // Validate URL format
  try {
    const parsed = new URL(normalized);

    // Must have http or https protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn({ url, protocol: parsed.protocol }, 'URL has invalid protocol');
      return undefined;
    }

    // Basic hostname validation (must contain dot, be IPv6 with colon, or be localhost)
    if (!parsed.hostname.includes('.') && !parsed.hostname.includes(':') && parsed.hostname !== 'localhost') {
      return undefined;
    }

    // Normalize URL
    let result = parsed.toString();

    // Remove trailing slash if requested
    if (removeTrailingSlash && result.endsWith('/')) {
      result = result.slice(0, -1);
    }

    return result;
  } catch (error) {
    logger.debug(
      { url, error: error instanceof Error ? error.message : String(error) },
      'URL validation failed'
    );
    return undefined;
  }
}

/**
 * Validates multiple URLs and returns only valid ones
 * 
 * @param urls - Array of URL strings to validate
 * @param options - Normalization options
 * @returns Array of valid normalized URLs
 * 
 * @example
 * ```typescript
 * const urls = ['https://example.com', 'not-a-url', 'http://test.com'];
 * const valid = validateUrls(urls);
 * // Returns: ['https://example.com', 'https://test.com']
 * ```
 */
export function validateUrls(
  urls: Array<string | undefined | null>,
  options: {
    defaultProtocol?: 'http' | 'https';
    removeTrailingSlash?: boolean;
    requireProtocol?: boolean;
  } = {}
): string[] {
  const validUrls: string[] = [];

  for (const url of urls) {
    const normalized = validateAndNormalizeUrl(url, options);
    if (normalized) {
      validUrls.push(normalized);
    }
  }

  return validUrls;
}
