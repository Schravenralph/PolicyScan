/**
 * URL Normalizer
 * 
 * Detects API endpoint URLs and converts them to public URLs.
 * Used for migrating existing data that may have API endpoints stored.
 */

import { buildDsoPublicUrl, extractIdentificatie } from './dsoUrlBuilder.js';

/**
 * Check if a URL is an API endpoint
 * 
 * @param url - URL to check
 * @returns true if the URL appears to be an API endpoint
 */
export function isApiEndpoint(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const urlLower = url.toLowerCase();
  
  // Check for API endpoint patterns
  return (
    urlLower.includes('/api/') ||
    urlLower.includes('service.omgevingswet.overheid.nl') ||
    urlLower.includes('service.pre.omgevingswet.overheid.nl') ||
    urlLower.includes('/documenten/_zoek') ||
    urlLower.includes('/documenten/_suggereer') ||
    urlLower.includes('/publiek/')
  );
}

/**
 * Check if a URL is in the old incorrect format
 * 
 * Old format: https://omgevingswet.overheid.nl/document/{identificatie}
 * New format: https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/{identificatie}
 * 
 * @param url - URL to check
 * @returns true if the URL is in the old format
 */
export function isOldUrlFormat(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check if it's the old format (has /document/ but not /regels-op-de-kaart/documenten/)
  return (
    url.includes('omgevingswet.overheid.nl/document/') &&
    !url.includes('regels-op-de-kaart/documenten/')
  );
}

/**
 * Check if a URL is only the base domain without a document path
 * 
 * Base domain only: https://omgevingswet.overheid.nl (no path)
 * Correct format: https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/{identificatie}
 * 
 * @param url - URL to check
 * @returns true if the URL is only the base domain
 */
export function isBaseDomainOnly(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check if it's exactly the base domain (with or without trailing slash)
  const normalized = url.trim().replace(/\/$/, '');
  return (
    normalized === 'https://omgevingswet.overheid.nl' ||
    normalized === 'http://omgevingswet.overheid.nl'
  );
}

/**
 * Extract identificatie from an API endpoint URL
 * 
 * Attempts to extract the identificatie from various API endpoint URL patterns.
 * 
 * @param url - API endpoint URL
 * @returns identificatie if found, null otherwise
 */
export function extractIdentificatieFromApiUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Pattern 1: /documenten/{identificatie} in API endpoint
  const documentenMatch = url.match(/\/documenten\/([^/?#]+)/);
  if (documentenMatch && documentenMatch[1]) {
    let identificatie = decodeURIComponent(documentenMatch[1]);
    // If it's in underscore format, convert to slash format
    if (identificatie.startsWith('_akn_')) {
      identificatie = identificatie.replace(/_/g, '/');
    }
    return identificatie;
  }

  // Pattern 2: /document/{identificatie} (old format)
  const documentMatch = url.match(/\/document\/([^/?#]+)/);
  if (documentMatch && documentMatch[1]) {
    return decodeURIComponent(documentMatch[1]);
  }

  // Pattern 3: Try to find identificatie in query parameters or path segments
  // This is a fallback for other API endpoint formats
  const urlObj = new URL(url);

  // Check for /akn/ pattern in the full pathname (unencoded)
  if (urlObj.pathname.includes('/akn/')) {
    const startIndex = urlObj.pathname.indexOf('/akn/');
    return decodeURIComponent(urlObj.pathname.substring(startIndex));
  }

  const pathParts = urlObj.pathname.split('/').filter(p => p);
  
  // Look for patterns that might be identificatie
  for (const part of pathParts) {
    // Check if it looks like an AKN identifier
    if (part.startsWith('_akn_') || part.startsWith('/akn/') || part.startsWith('akn')) {
      let identificatie = decodeURIComponent(part);
      if (identificatie.startsWith('_akn_')) {
        identificatie = identificatie.replace(/_/g, '/');
      } else if (identificatie.startsWith('akn') && !identificatie.startsWith('/')) {
        identificatie = '/' + identificatie;
      }
      return identificatie;
    }
    // Check if it looks like an IMRO identifier
    if (part.startsWith('NL.IMRO.')) {
      return decodeURIComponent(part);
    }
  }

  return null;
}

/**
 * Normalize a URL to the correct public format
 * 
 * If the URL is an API endpoint or in old format, converts it to the correct public URL.
 * If the URL is already correct, returns it as-is.
 * 
 * @param url - URL to normalize
 * @param document - Optional document object to extract identificatie from if URL parsing fails
 * @returns Normalized public URL or null if cannot be determined
 */
export function normalizeDsoUrl(
  url: string | undefined | null,
  document?: {
    sourceId?: string;
    canonicalUrl?: string;
    sourceMetadata?: Record<string, unknown>;
  }
): string | null {
  if (!url || typeof url !== 'string') {
    // If no URL but we have a document, try to build from identificatie
    if (document) {
      return buildDsoPublicUrlFromDocument(document);
    }
    return null;
  }

  // If it's already a correct public URL, return as-is
  if (url.includes('omgevingswet.overheid.nl/regels-op-de-kaart/documenten/')) {
    return url;
  }

  // If it's an API endpoint, try to extract identificatie
  if (isApiEndpoint(url)) {
    const identificatie = extractIdentificatieFromApiUrl(url);
    if (identificatie) {
      try {
        return buildDsoPublicUrl(identificatie);
      } catch (error) {
        // If building fails, try to use document as fallback
        if (document) {
          return buildDsoPublicUrlFromDocument(document);
        }
        return null;
      }
    }
    // If we can't extract from URL, try document
    if (document) {
      return buildDsoPublicUrlFromDocument(document);
    }
    return null;
  }

  // If it's in old format, extract identificatie and rebuild
  if (isOldUrlFormat(url)) {
    const identificatie = extractIdentificatieFromApiUrl(url);
    if (identificatie) {
      try {
        return buildDsoPublicUrl(identificatie);
      } catch (error) {
        // If building fails, try to use document as fallback
        if (document) {
          return buildDsoPublicUrlFromDocument(document);
        }
        return null;
      }
    }
    // If we can't extract from URL, try document
    if (document) {
      return buildDsoPublicUrlFromDocument(document);
    }
    return null;
  }

  // If it's only the base domain (no path), try to build from document
  if (isBaseDomainOnly(url)) {
    if (document) {
      const builtUrl = buildDsoPublicUrlFromDocument(document);
      if (builtUrl) {
        return builtUrl;
      }
    }
    // If we can't build from document, return null
    return null;
  }

  // Unknown format - if we have a document, try to build from it
  if (document) {
    return buildDsoPublicUrlFromDocument(document);
  }

  // Return null if we can't determine the correct URL
  return null;
}

import { buildDsoPublicUrlFromDocument } from './dsoUrlBuilder.js';

// Re-export for convenience
export { buildDsoPublicUrlFromDocument };
