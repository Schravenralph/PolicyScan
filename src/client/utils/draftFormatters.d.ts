/**
 * Draft Field Formatters
 *
 * Explicit mapping from domain values to translated strings.
 * This enforces the separation between domain data (numbers, booleans, enums)
 * and presentation (translated strings).
 */
/**
 * Format step number to translated string
 *
 * @param step - Step number (1, 2, or 3)
 * @returns Translated step name
 */
export declare function formatStep(step: number): string;
/**
 * Format website count with proper pluralization
 *
 * @param count - Number of websites
 * @returns Formatted string with proper pluralization
 */
export declare function formatWebsiteCount(count: number): string;
/**
 * Format queryId for display
 *
 * @param queryId - Query ID string or null
 * @returns Query ID string or "Not set" translation
 */
export declare function formatQueryId(queryId: string | null | undefined): string;
/**
 * Format field value based on field name
 *
 * This is the main formatter that routes to specific formatters
 * based on the field name. Use this for generic field formatting.
 *
 * @param field - Field name
 * @param value - Field value
 * @returns Formatted string for display
 */
export declare function formatFieldValue(field: string, value: unknown): string;
