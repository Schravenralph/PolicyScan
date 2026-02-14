/**
 * Session ID Validation Utility
 * 
 * Validates and sanitizes sessionId parameters to prevent:
 * - Path traversal attacks
 * - Injection attempts
 * - Invalid characters
 * - Excessive length
 */

/**
 * Validates and sanitizes a sessionId parameter to prevent security issues
 * @param sessionId - The session identifier to validate
 * @returns Sanitized sessionId or null if invalid
 */
export function validateSessionId(sessionId: string | undefined | null): string | null {
  if (!sessionId || typeof sessionId !== 'string') {
    return null;
  }

  // Remove any path traversal attempts
  const sanitized = sessionId
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[/\\]/g, '') // Remove path separators
    .trim();

  // Check length limits (reasonable max for session IDs)
  // Allow up to 200 characters to accommodate prefixes like "session_", "discovery_", "hybrid_" plus timestamps
  if (sanitized.length === 0 || sanitized.length > 200) {
    return null;
  }

  // Check for invalid characters
  // Allow alphanumeric, hyphens, underscores, and dots (for timestamps like "session_1234567890")
  // But we already removed dots in path traversal cleanup above, so we'll allow them again for valid use cases
  // However, we need to be careful - let's re-check with the original value but ensure no path traversal
  const originalTrimmed = sessionId.trim();
  
  // Check for path traversal patterns after trim
  if (originalTrimmed.includes('..') || originalTrimmed.includes('../') || originalTrimmed.includes('..\\')) {
    return null;
  }

  // Check for path separators
  if (originalTrimmed.includes('/') || originalTrimmed.includes('\\')) {
    return null;
  }

  // Allow alphanumeric, hyphens, underscores, and dots (for timestamps)
  // But ensure dots are not used for path traversal
  if (!/^[a-zA-Z0-9._-]+$/.test(originalTrimmed)) {
    return null;
  }

  // Ensure the sanitized version doesn't start with a dot (which could be problematic)
  if (originalTrimmed.startsWith('.') || originalTrimmed.endsWith('.')) {
    return null;
  }

  return originalTrimmed;
}

/**
 * Validates sessionId and throws an error with appropriate message if invalid
 * @param sessionId - The session identifier to validate
 * @param paramName - The name of the parameter (for error messages)
 * @returns The validated sessionId
 * @throws Error if sessionId is invalid
 */
export function validateSessionIdOrThrow(
  sessionId: string | undefined | null,
  paramName: string = 'sessionId'
): string {
  const validated = validateSessionId(sessionId);
  if (!validated) {
    throw new Error(
      `Invalid ${paramName}: must be a non-empty string of 1-200 characters, ` +
      `containing only alphanumeric characters, hyphens, underscores, and dots. ` +
      `Path traversal patterns are not allowed.`
    );
  }
  return validated;
}
