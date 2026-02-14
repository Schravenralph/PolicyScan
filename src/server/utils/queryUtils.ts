/**
 * Utility functions for parsing query parameters
 */

/**
 * Parses an integer query parameter with support for aliases and default values.
 * Handles parsing logic safely:
 * - Falls back to alias if primary key is missing or falsy (empty string)
 * - Returns default value if both are missing
 * - Returns default value if parsing results in NaN (invalid string)
 * 
 * @param query The express request query object
 * @param key The primary query parameter key
 * @param alias Optional alias key to check if primary is missing
 * @param defaultValue Optional default value to return if value is missing or invalid
 * @returns The parsed integer, or the default value (which may be undefined)
 */
export function parseIntQueryParam(
  query: Record<string, any>,
  key: string,
  alias?: string,
  defaultValue?: number
): number | undefined {
  // Use falsy check to match || operator behavior, so empty string falls back to alias
  const value = query[key] || (alias ? query[alias] : undefined);
  
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
