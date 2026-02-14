/**
 * Entity ID Sanitization Utilities
 * 
 * Provides utilities for sanitizing and normalizing entity IDs to ensure
 * they comply with validation requirements (alphanumeric with hyphens/underscores).
 * 
 * @see docs/04-policies/error-handling-standard.md
 * @see docs/21-issues/WI-SEMANTIC-CONSISTENCY-FIXES.md
 */

import { createHash } from 'crypto';
import { logger } from './logger.js';

/**
 * Sanitizes an entity ID to comply with validation regex: /^[a-zA-Z0-9_-]+$/
 * 
 * Rules:
 * - Removes or replaces special characters (except hyphens and underscores)
 * - Converts to lowercase for consistency
 * - Limits length to maxLength (default: 200)
 * - Ensures uniqueness by appending hash if needed
 * - Preserves hyphens and underscores
 * 
 * @param id - The raw entity ID to sanitize
 * @param options - Sanitization options
 * @returns Sanitized ID that complies with validation regex
 * 
 * @example
 * ```typescript
 * // URL-based ID
 * sanitizeEntityId('https://example.com/path/to/doc')
 * // Returns: 'https-example-com-path-to-doc'
 * 
 * // ID with special characters
 * sanitizeEntityId('doc-2026-02-06T12:26:49')
 * // Returns: 'doc-2026-02-06t12-26-49'
 * 
 * // ID with spaces
 * sanitizeEntityId('My Document Title')
 * // Returns: 'my-document-title'
 * ```
 */
export function sanitizeEntityId(
  id: string,
  options: {
    maxLength?: number;
    preserveCase?: boolean;
    ensureUniqueness?: boolean;
    prefix?: string;
  } = {}
): string {
  const {
    maxLength = 200,
    preserveCase = false,
    ensureUniqueness = false,
    prefix = '',
  } = options;

  if (typeof id !== 'string') {
    throw new Error('Entity ID must be a non-empty string');
  }

  // Handle empty string with fallback
  if (!id || id.trim().length === 0) {
    const fallback = createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, Math.min(32, maxLength));
    return `entity-${fallback}`;
  }

  // Start with prefix if provided
  let sanitized = prefix ? `${prefix}-` : '';

  // Normalize the ID
  let normalized = id.trim();

  // Replace common URL patterns
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      // Use hostname and pathname, remove protocol
      normalized = `${url.hostname}${url.pathname}`;
    } catch {
      // If URL parsing fails, just remove protocol
      normalized = normalized.replace(/^https?:\/\//, '');
    }
  }

  // Replace special characters with hyphens
  // Keep only alphanumeric, hyphens, underscores, and spaces (spaces will be replaced)
  normalized = normalized
    .replace(/[^a-zA-Z0-9_\s-]/g, '-') // Replace special chars with hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  // Convert to lowercase unless preserveCase is true
  if (!preserveCase) {
    normalized = normalized.toLowerCase();
  }

  // Append to prefix
  sanitized += normalized;

  // Ensure uniqueness if requested
  if (ensureUniqueness && sanitized.length > 0) {
    // Use timestamp and random component to ensure different results each time
    const hash = createHash('sha256')
      .update(`${id}-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
    sanitized = `${sanitized}-${hash}`;
  }

  // Limit length
  if (sanitized.length > maxLength) {
    // Truncate but preserve hash if present
    if (ensureUniqueness && sanitized.includes('-')) {
      const parts = sanitized.split('-');
      const hash = parts[parts.length - 1];
      const base = sanitized.substring(0, maxLength - hash.length - 1);
      sanitized = `${base}-${hash}`;
    } else {
      sanitized = sanitized.substring(0, maxLength);
    }
  }

  // Final validation: ensure it matches regex
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    // If still invalid, create a safe fallback
    logger.warn(
      { originalId: id, sanitized },
      'Entity ID sanitization produced invalid result, using fallback'
    );
    const fallback = createHash('sha256')
      .update(id)
      .digest('hex')
      .substring(0, Math.min(32, maxLength));
    sanitized = `entity-${fallback}`;
  }

  // Ensure it's not empty
  if (sanitized.length === 0) {
    const fallback = createHash('sha256')
      .update(id)
      .digest('hex')
      .substring(0, Math.min(32, maxLength));
    sanitized = `entity-${fallback}`;
  }

  return sanitized;
}

/**
 * Validates if an entity ID complies with validation requirements
 * 
 * @param id - The entity ID to validate
 * @returns True if ID is valid, false otherwise
 * 
 * @example
 * ```typescript
 * isValidEntityId('my-entity-id') // true
 * isValidEntityId('my_entity_id') // true
 * isValidEntityId('my entity id') // false (contains space)
 * isValidEntityId('my.entity.id') // false (contains dots)
 * ```
 */
export function isValidEntityId(id: string): boolean {
  if (!id || typeof id !== 'string' || id.length === 0) {
    return false;
  }

  // Must match regex: /^[a-zA-Z0-9_-]+$/
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Sanitizes multiple entity IDs and ensures they are unique
 * 
 * @param ids - Array of entity IDs to sanitize
 * @param options - Sanitization options
 * @returns Map of original IDs to sanitized IDs
 * 
 * @example
 * ```typescript
 * const ids = ['https://example.com/doc1', 'https://example.com/doc2'];
 * const sanitized = sanitizeEntityIds(ids);
 * // Returns: Map with sanitized IDs
 * ```
 */
export function sanitizeEntityIds(
  ids: string[],
  options: {
    maxLength?: number;
    preserveCase?: boolean;
    prefix?: string;
  } = {}
): Map<string, string> {
  const sanitized = new Map<string, string>();
  const seen = new Set<string>();
  const idCounts = new Map<string, number>();

  for (const id of ids) {
    // Track how many times we've seen this ID
    const count = (idCounts.get(id) || 0) + 1;
    idCounts.set(id, count);

    let sanitizedId = sanitizeEntityId(id, {
      ...options,
      ensureUniqueness: false, // We'll handle uniqueness manually
    });

    // Ensure uniqueness within the batch
    // If this is a duplicate ID, add a counter to make it unique
    if (count > 1) {
      const hash = createHash('sha256')
        .update(`${id}-${count}`)
        .digest('hex')
        .substring(0, 8);
      sanitizedId = `${sanitizedId}-${hash}`;
    }

    // If the sanitized ID is already seen (even with counter), add another hash
    let counter = 0;
    while (seen.has(sanitizedId)) {
      counter++;
      const hash = createHash('sha256')
        .update(`${id}-${count}-${counter}`)
        .digest('hex')
        .substring(0, 8);
      sanitizedId = `${sanitizedId}-${hash}`;
    }

    seen.add(sanitizedId);
    // Use a unique key for each occurrence (original ID + index)
    // This allows multiple entries for the same original ID
    const uniqueKey = count > 1 ? `${id}-${count}` : id;
    sanitized.set(uniqueKey, sanitizedId);
  }

  return sanitized;
}
