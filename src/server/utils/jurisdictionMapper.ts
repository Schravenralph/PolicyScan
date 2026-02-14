/**
 * Jurisdiction Mapping Utilities
 * 
 * Provides utilities for mapping query context (overheidslaag, entity) to jurisdiction strings.
 * Used to improve jurisdiction extraction when document metadata is missing.
 * 
 * @see docs/04-policies/error-handling-standard.md
 * @see docs/21-issues/WI-SEMANTIC-CONSISTENCY-FIXES.md
 */

/**
 * Map overheidslaag and entity to jurisdiction string
 * 
 * @param overheidslaag - Government level (gemeente, provincie, waterschap, etc.)
 * @param entity - Entity name (e.g., "Amsterdam", "Noord-Holland")
 * @returns Formatted jurisdiction string or undefined if mapping fails
 * 
 * @example
 * ```typescript
 * mapToJurisdiction('gemeente', 'Amsterdam')
 * // Returns: 'Gemeente Amsterdam'
 * 
 * mapToJurisdiction('provincie', 'Noord-Holland')
 * // Returns: 'Provincie Noord-Holland'
 * ```
 */
export function mapToJurisdiction(
  overheidslaag: string | undefined | null,
  entity: string | undefined | null
): string | undefined {
  if (!overheidslaag || typeof overheidslaag !== 'string') {
    return undefined;
  }

  const normalizedLaag = overheidslaag.toLowerCase().trim();
  const normalizedEntity = entity && typeof entity === 'string' ? entity.trim() : '';

  // Map overheidslaag to jurisdiction prefix
  let prefix: string | undefined;
  switch (normalizedLaag) {
    case 'gemeente':
      prefix = 'Gemeente';
      break;
    case 'provincie':
      prefix = 'Provincie';
      break;
    case 'waterschap':
      prefix = 'Waterschap';
      break;
    case 'rijksorganisatie':
    case 'rijksoverheid':
      return 'Rijksoverheid';
    case 'kennisinstituut':
      // Kennisinstituut doesn't have a specific entity, use entity name if available
      return normalizedEntity || 'Kennisinstituut';
    default:
      // Unknown overheidslaag, try to capitalize and use as-is
      prefix = normalizedLaag.charAt(0).toUpperCase() + normalizedLaag.slice(1);
  }

  if (!prefix) {
    return undefined;
  }

  // If entity is provided, combine with prefix
  if (normalizedEntity) {
    // Capitalize entity name properly
    const capitalizedEntity = normalizedEntity
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    return `${prefix} ${capitalizedEntity}`;
  }

  // If no entity, just return prefix (for cases where entity is optional)
  return prefix;
}

/**
 * Extract jurisdiction from query context
 * 
 * Attempts to extract jurisdiction from query parameters in the following order:
 * 1. Direct jurisdiction from context
 * 2. Map from overheidslaag + entity
 * 3. Map from overheidslaag only
 * 
 * @param context - Query context with overheidslaag, entity, etc.
 * @returns Jurisdiction string or undefined
 * 
 * @example
 * ```typescript
 * extractJurisdictionFromContext({
 *   overheidslaag: 'gemeente',
 *   entity: 'Amsterdam',
 *   onderwerp: 'klimaatadaptatie'
 * })
 * // Returns: 'Gemeente Amsterdam'
 * ```
 */
export function extractJurisdictionFromContext(
  context: Record<string, unknown>
): string | undefined {
  // Try direct jurisdiction first
  if (context.jurisdiction && typeof context.jurisdiction === 'string') {
    const jurisdiction = context.jurisdiction.trim();
    if (jurisdiction.length > 0 && jurisdiction !== 'Unknown') {
      return jurisdiction;
    }
  }

  // Try mapping from overheidslaag + entity
  const overheidslaag = context.overheidslaag || context.overheidstype;
  const entity = context.entity || context.overheidsinstantie;

  if (overheidslaag) {
    const mapped = mapToJurisdiction(
      typeof overheidslaag === 'string' ? overheidslaag : String(overheidslaag),
      entity && typeof entity === 'string' ? entity : undefined
    );
    
    if (mapped) {
      return mapped;
    }
  }

  return undefined;
}
