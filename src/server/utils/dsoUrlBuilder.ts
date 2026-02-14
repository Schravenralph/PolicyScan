/**
 * DSO URL Builder
 * 
 * Constructs public URLs for DSO documents from AKN identifiers.
 * 
 * Public URL format: https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/{identificatie}
 * Where {identificatie} has slashes (/) replaced with underscores (_).
 * 
 * Example:
 * - AKN identifier: /akn/nl/act/gm0344/2020/omgevingsplan
 * - Public URL: https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten/_akn_nl_act_gm0344_2020_omgevingsplan
 */

import { logger } from './logger.js';

const BASE_URL = 'https://omgevingswet.overheid.nl/regels-op-de-kaart/documenten';

/**
 * Build public URL from DSO identificatie
 * 
 * Handles different identifier formats:
 * - AKN format: /akn/nl/act/... → replace / with _ → _akn_nl_act_...
 * - URI-encoded AKN: _akn_nl_act_... → already in correct format
 * - IMRO: NL.IMRO.... → may need special handling
 * 
 * @param identificatie - DSO identifier (AKN, IMRO, or URI-encoded format)
 * @returns Public URL for the document
 */
export function buildDsoPublicUrl(identificatie: string): string {
  if (!identificatie || identificatie.trim() === '') {
    throw new Error('identificatie is required');
  }

  // Normalize identificatie: remove leading/trailing whitespace
  let normalized = identificatie.trim();

  // Handle AKN format: /akn/nl/act/... → _akn_nl_act_...
  if (normalized.startsWith('/akn/')) {
    // Replace all slashes with underscores
    normalized = normalized.replace(/\//g, '_');
  }
  // Handle URI-encoded AKN: _akn_nl_act_... → already correct, but ensure it starts with _
  else if (normalized.startsWith('_akn_')) {
    // Already in correct format, use as-is
    normalized = normalized;
  }
  // Handle IMRO: NL.IMRO.... → keep as-is (may need URL encoding)
  else if (normalized.startsWith('NL.IMRO.')) {
    // IMRO identifiers are kept as-is, but may need URL encoding
    // For now, we'll use them directly
    normalized = normalized;
  }
  // Handle other formats: if it contains slashes, replace with underscores
  else if (normalized.includes('/')) {
    // Replace slashes with underscores
    normalized = normalized.replace(/\//g, '_');
    // If it doesn't start with _, and looks like an AKN, add _
    if (!normalized.startsWith('_') && normalized.startsWith('akn')) {
      normalized = '_' + normalized;
    }
  }

  // Construct the full URL
  return `${BASE_URL}/${normalized}`;
}

/**
 * Extract identificatie from a DSO document
 * 
 * Tries multiple sources in priority order:
 * 1. sourceId field
 * 2. sourceMetadata.discovery.identificatie
 * 3. canonicalUrl (if it's a DSO URL, extract the identificatie part)
 * 
 * @param document - Document with potential identificatie sources
 * @returns identificatie string or null if not found
 */
export function extractIdentificatie(document: {
  sourceId?: string;
  canonicalUrl?: string;
  sourceMetadata?: Record<string, unknown>;
}): string | null {
  // Priority 1: sourceId
  if (document.sourceId) {
    return document.sourceId;
  }

  // Priority 2: sourceMetadata.discovery.identificatie
  if (document.sourceMetadata?.discovery) {
    const discovery = document.sourceMetadata.discovery as Record<string, unknown>;
    if (discovery.identificatie && typeof discovery.identificatie === 'string') {
      return discovery.identificatie;
    }
  }

  // Priority 3: Extract from canonicalUrl if it's a DSO URL
  if (document.canonicalUrl) {
    const url = document.canonicalUrl;
    // Check if it's a DSO regels-op-de-kaart URL
    if (url.includes('omgevingswet.overheid.nl/regels-op-de-kaart/documenten/')) {
      const match = url.match(/regels-op-de-kaart\/documenten\/([^?#]+)/);
      if (match && match[1]) {
        // Convert underscores back to slashes if it looks like an AKN
        let identificatie = decodeURIComponent(match[1]);
        if (identificatie.startsWith('_akn_')) {
          identificatie = identificatie.replace(/_/g, '/');
        }
        return identificatie;
      }
    }
    // Check if it's the old format: omgevingswet.overheid.nl/document/
    if (url.includes('omgevingswet.overheid.nl/document/')) {
      const match = url.match(/document\/([^?#]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

/**
 * Build public URL from a DSO document
 * 
 * Extracts identificatie and builds the URL automatically.
 * 
 * @param document - Document with potential identificatie sources
 * @returns Public URL or null if identificatie cannot be determined
 */
export function buildDsoPublicUrlFromDocument(document: {
  sourceId?: string;
  canonicalUrl?: string;
  sourceMetadata?: Record<string, unknown>;
}): string | null {
  const identificatie = extractIdentificatie(document);
  if (!identificatie) {
    return null;
  }

  try {
    return buildDsoPublicUrl(identificatie);
  } catch (error) {
    // Log error but don't throw - return null instead
    logger.error({ error, identificatie }, 'Failed to build DSO public URL');
    return null;
  }
}
