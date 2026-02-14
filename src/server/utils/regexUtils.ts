/**
 * Escapes a string for use in a regular expression.
 * 
 * @param string - The string to escape
 * @returns The escaped string
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
