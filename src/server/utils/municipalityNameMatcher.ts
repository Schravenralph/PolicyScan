/**
 * Municipality Name Matcher
 * 
 * Centralized utility for matching municipality names with improved strategies.
 * Handles various name variations, special characters, and common aliases.
 */

/**
 * Known municipality name variations and aliases
 */
const MUNICIPALITY_ALIASES: Record<string, string[]> = {
  "'s-Gravenhage": ['den haag', 's-gravenhage', 'gravenhage', 'the hague'],
  "'s-Hertogenbosch": ['den bosch', 's-hertogenbosch', 'hertogenbosch'],
  'Den Haag': ["'s-Gravenhage", 's-gravenhage', 'gravenhage', 'the hague'],
  'Den Bosch': ["'s-Hertogenbosch", 's-hertogenbosch', 'hertogenbosch'],
};

/**
 * Normalize municipality name for matching
 * - Removes "Gemeente", "Provincie", "Waterschap", "Rijksoverheid" prefixes
 * - Converts to lowercase
 * - Normalizes whitespace
 * - Handles special characters
 */
export function normalizeMunicipalityName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/^(gemeente|provincie|waterschap|rijksoverheid)\s+/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['"]/g, "'"); // Normalize quotes
}

/**
 * Normalize municipality name by removing all non-alphabetic characters
 * Useful for matching "Horst aan de Maas" with "horstaandemaas"
 */
export function normalizeMunicipalityNameStrict(name: string): string {
  return normalizeMunicipalityName(name)
    .replace(/[^a-z]/g, '')
    .toLowerCase();
}

/**
 * Get all possible variations of a municipality name including aliases
 */
export function getMunicipalityNameVariations(name: string): string[] {
  const normalized = normalizeMunicipalityName(name);
  const variations = new Set<string>([normalized]);
  
  // Add strict normalized version
  variations.add(normalizeMunicipalityNameStrict(name));
  
  // Check for known aliases
  for (const [canonical, aliases] of Object.entries(MUNICIPALITY_ALIASES)) {
    const canonicalNormalized = normalizeMunicipalityName(canonical);
    
    // If input matches canonical or any alias, add all variations
    if (normalized === canonicalNormalized || aliases.some(a => normalizeMunicipalityName(a) === normalized)) {
      variations.add(canonicalNormalized);
      aliases.forEach(alias => {
        variations.add(normalizeMunicipalityName(alias));
      });
    }
    
    // Also check if input matches canonical (case-insensitive)
    if (normalized.includes(canonicalNormalized) || canonicalNormalized.includes(normalized)) {
      variations.add(canonicalNormalized);
      aliases.forEach(alias => {
        variations.add(normalizeMunicipalityName(alias));
      });
    }
  }
  
  return Array.from(variations);
}

/**
 * Check if two municipality names match using various strategies
 */
export function matchMunicipalityNames(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  
  const normalized1 = normalizeMunicipalityName(name1);
  const normalized2 = normalizeMunicipalityName(name2);
  
  // Exact normalized match
  if (normalized1 === normalized2) return true;
  
  // Strict normalized match (removes all non-alphabetic)
  const strict1 = normalizeMunicipalityNameStrict(name1);
  const strict2 = normalizeMunicipalityNameStrict(name2);
  if (strict1 === strict2) return true;
  
  // Check if one contains the other (for partial matches)
  if (strict1.includes(strict2) || strict2.includes(strict1)) {
    // Only return true if the shorter name is at least 5 characters
    // This prevents false matches like "Am" matching "Amsterdam"
    const minLength = Math.min(strict1.length, strict2.length);
    if (minLength >= 5) return true;
  }
  
  // Check aliases
  const variations1 = getMunicipalityNameVariations(name1);
  const variations2 = getMunicipalityNameVariations(name2);
  
  for (const v1 of variations1) {
    for (const v2 of variations2) {
      if (v1 === v2) return true;
      if (normalizeMunicipalityNameStrict(v1) === normalizeMunicipalityNameStrict(v2)) return true;
    }
  }
  
  return false;
}

/**
 * Create a MongoDB regex pattern for matching municipality names
 * Returns a regex that matches the name and its variations
 */
export function createMunicipalityNameRegex(name: string): RegExp {
  const normalized = normalizeMunicipalityName(name);
  const variations = getMunicipalityNameVariations(name);
  
  // Escape special regex characters and create pattern
  const patterns = variations.map(v => {
    // Escape special characters but keep word boundaries meaningful
    return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  
  // Create regex that matches any of the patterns (case-insensitive)
  const pattern = `^(${patterns.join('|')})$`;
  return new RegExp(pattern, 'i');
}

/**
 * Create a MongoDB query filter for finding municipalities by name
 * Uses multiple matching strategies
 */
export function createMunicipalityNameQuery(name: string): {
  $or: Array<{ naam: { $regex: RegExp } }>;
} {
  const normalized = normalizeMunicipalityName(name);
  const variations = getMunicipalityNameVariations(name);
  
  const queries = variations.map(v => ({
    naam: { $regex: new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  }));
  
  // Also add partial match for longer names
  if (normalized.length >= 5) {
    queries.push({
      naam: { $regex: new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    });
  }
  
  return { $or: queries };
}

/**
 * Find the best matching municipality name from a list of candidates
 * Returns the candidate that best matches the input name, or null if no good match
 */
export function findBestMatch(
  inputName: string,
  candidates: string[],
  threshold: number = 0.8
): string | null {
  if (!inputName || candidates.length === 0) return null;
  
  const normalizedInput = normalizeMunicipalityName(inputName);
  const strictInput = normalizeMunicipalityNameStrict(inputName);
  
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeMunicipalityName(candidate);
    const strictCandidate = normalizeMunicipalityNameStrict(candidate);
    
    // Exact match gets highest score
    if (normalizedInput === normalizedCandidate) {
      return candidate;
    }
    
    // Strict match gets high score
    if (strictInput === strictCandidate) {
      if (1.0 > bestScore) {
        bestScore = 1.0;
        bestMatch = candidate;
      }
      continue;
    }
    
    // Calculate similarity score
    let score = 0;
    
    // Check if one contains the other
    if (strictInput.includes(strictCandidate) || strictCandidate.includes(strictInput)) {
      const minLength = Math.min(strictInput.length, strictCandidate.length);
      const maxLength = Math.max(strictInput.length, strictCandidate.length);
      score = minLength / maxLength;
    }
    
    // Check alias variations
    const inputVariations = getMunicipalityNameVariations(inputName);
    const candidateVariations = getMunicipalityNameVariations(candidate);
    
    for (const iv of inputVariations) {
      for (const cv of candidateVariations) {
        if (iv === cv) {
          score = Math.max(score, 0.95);
        } else if (normalizeMunicipalityNameStrict(iv) === normalizeMunicipalityNameStrict(cv)) {
          score = Math.max(score, 0.9);
        }
      }
    }
    
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}
