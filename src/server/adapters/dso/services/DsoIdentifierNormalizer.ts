/**
 * DSO Identifier Normalizer Service
 * 
 * Handles normalization of DSO identifiers from discovery API to download API format.
 * 
 * Problem: Discovery API returns identifiers in multiple formats:
 * - AKN (slash) format: /akn/nl/act/...
 * - URI-encoded AKN: _akn_nl_act_... (underscores)
 * - IMRO: NL.IMRO.... (legacy plans)
 * 
 * Download API expects AKN format. This service normalizes all formats to AKN.
 * 
 * @see docs/21-issues/WI-PERSISTENCE-GAP-DSO-DOCUMENTS.md
 */

import { logger } from '../../../utils/logger.js';
import type { DsoDiscoveryResult } from '../DsoLiveClient.js';

/**
 * Acquisition plan for a DSO document
 */
export type AcquisitionPlan =
  | { kind: 'STOPTPOD'; regelingIdAkn: string }       // for Downloaden API
  | { kind: 'TAMIMRO'; imroId: string }               // for RuimtelijkePlannen API
  | { kind: 'METADATA_ONLY'; reason: string };        // cannot download

/**
 * Normalize discovery result to acquisition plan
 * 
 * Rules:
 * 1. If identificatie starts with /akn/ → use it directly (STOPTPOD)
 * 2. If identificatie starts with _akn_ → convert _ to / (STOPTPOD)
 * 3. If uriIdentificatie exists and starts with _akn_ → convert (STOPTPOD)
 * 4. If identificatie starts with NL.IMRO. → route to RuimtelijkePlannen (TAMIMRO)
 * 5. Otherwise → METADATA_ONLY (cannot download)
 * 
 * @param record - Discovery result from DSO API
 * @returns Acquisition plan with normalized identifier
 */
export function normalizeDiscoveryToPlan(record: DsoDiscoveryResult): AcquisitionPlan {
  const { identificatie, uriIdentificatie, type } = record;
  
  // Log detailed metadata for Z-prefixed documents to understand their structure
  const isZPrefixed = identificatie && /\/Z\d{8,}/i.test(identificatie);
  if (isZPrefixed) {
    logger.info({
      function: 'normalizeDiscoveryToPlan',
      action: 'z_prefixed_document_analysis',
      identificatie,
      uriIdentificatie: uriIdentificatie || 'NOT_PRESENT',
      uriIdentificatieType: uriIdentificatie ? typeof uriIdentificatie : 'N/A',
      uriIdentificatieLength: uriIdentificatie ? uriIdentificatie.length : 0,
      uriIdentificatieStartsWith: uriIdentificatie ? uriIdentificatie.substring(0, 20) : 'N/A',
      type,
      allRecordKeys: Object.keys(record),
      recordSample: {
        titel: record.titel,
        opgesteldDoor: record.opgesteldDoor,
        bestuursorgaan: record.bestuursorgaan,
        publicatiedatum: record.publicatiedatum,
        publicatieLink: record.publicatieLink,
      },
    }, '[DsoIdentifierNormalizer] Analyzing Z-prefixed document metadata');
  }

  if (!identificatie) {
    return {
      kind: 'METADATA_ONLY',
      reason: 'No identificatie available in discovery result',
    };
  }

  // Rule 1: identificatie is already in AKN format
  if (identificatie.startsWith('/akn/')) {
    return {
      kind: 'STOPTPOD',
      regelingIdAkn: identificatie,
    };
  }

  // Rule 2: identificatie is in URI-encoded AKN format (_akn_...)
  if (identificatie.startsWith('_akn_')) {
    const converted = convertUriEncodedToAkn(identificatie);
    if (converted.startsWith('/akn/')) {
      logger.debug({
        function: 'normalizeDiscoveryToPlan',
        action: 'converted_identificatie_uri_encoded',
        original: identificatie,
        converted,
      }, '[DsoIdentifierNormalizer] Converted identificatie from URI-encoded to AKN format');
      return {
        kind: 'STOPTPOD',
        regelingIdAkn: converted,
      };
    }
  }

  // Rule 3: uriIdentificatie exists - check if it's already in AKN format or needs conversion
  // This is especially important for Z-prefixed documents which may have AKN in uriIdentificatie
  if (uriIdentificatie) {
    // If already in AKN format, use it directly
    if (uriIdentificatie.startsWith('/akn/')) {
      logger.info({
        function: 'normalizeDiscoveryToPlan',
        action: 'using_uriIdentificatie_akn',
        uriIdentificatie,
        identificatie,
        isZPrefixed,
      }, '[DsoIdentifierNormalizer] Using uriIdentificatie (already in AKN format) - will attempt download');
      return {
        kind: 'STOPTPOD',
        regelingIdAkn: uriIdentificatie,
      };
    }

    // If URI-encoded format, convert it
    if (uriIdentificatie.startsWith('_akn_')) {
      const converted = convertUriEncodedToAkn(uriIdentificatie);
      if (converted.startsWith('/akn/')) {
        logger.info({
          function: 'normalizeDiscoveryToPlan',
          action: 'converted_uriIdentificatie',
          original: uriIdentificatie,
          converted,
          identificatie,
          isZPrefixed,
        }, '[DsoIdentifierNormalizer] Converted uriIdentificatie from URI-encoded to AKN format - will attempt download');
        return {
          kind: 'STOPTPOD',
          regelingIdAkn: converted,
        };
      }
    }

    // If uriIdentificatie exists but is not in a recognized format, log it
    if (isZPrefixed) {
      logger.warn({
        function: 'normalizeDiscoveryToPlan',
        action: 'z_prefixed_uriIdentificatie_unrecognized',
        identificatie,
        uriIdentificatie,
        uriIdentificatieFormat: uriIdentificatie.substring(0, 50),
      }, '[DsoIdentifierNormalizer] Z-prefixed document has uriIdentificatie but format is unrecognized');
    }
  } else if (isZPrefixed) {
    // Z-prefixed document without uriIdentificatie - will be metadata-only
    logger.info({
      function: 'normalizeDiscoveryToPlan',
      action: 'z_prefixed_no_uriIdentificatie',
      identificatie,
      type,
    }, '[DsoIdentifierNormalizer] Z-prefixed document has no uriIdentificatie - will be metadata-only');
  }

  // Rule 4: IMRO format → route to RuimtelijkePlannen API
  if (identificatie.startsWith('NL.IMRO.')) {
    return {
      kind: 'TAMIMRO',
      imroId: identificatie,
    };
  }

  // Rule 5: Check for known non-downloadable patterns
  // Missionzaak documents (e.g., gm0358/RxMissionzaakZ202400004866-01)
  const isMissionzaak = identificatie.includes('/RxMissionzaakZ') || identificatie.includes('/RxMissionzaak');
  if (isMissionzaak) {
    const reason = `Missionzaak document (${identificatie}) - metadata-only, not available for download via DSO Download API`;
    logger.debug({
      identificatie,
      type,
      reason,
    }, '[DsoIdentifierNormalizer] Missionzaak document detected - metadata-only');
    return {
      kind: 'METADATA_ONLY',
      reason,
    };
  }

  // Rule 6: Unknown format → metadata only
  const reason = isZPrefixed && !uriIdentificatie
    ? `Z-prefixed identifier (${identificatie}) without uriIdentificatie - cannot download`
    : `Unknown identifier format: ${identificatie}. Expected /akn/..., _akn_..., or NL.IMRO....`;

  logger.warn({
    identificatie,
    uriIdentificatie: uriIdentificatie || 'NOT_PRESENT',
    type,
    isZPrefixed,
    reason,
  }, '[DsoIdentifierNormalizer] Cannot normalize identifier, treating as metadata-only');
  
  return {
    kind: 'METADATA_ONLY',
    reason,
  };
}

/**
 * Convert URI-encoded AKN format to AKN format
 * 
 * Converts: _akn_nl_act_gm0590_2025_PrgKlimaatadaptatie
 * To: /akn/nl/act/gm0590/2025/PrgKlimaatadaptatie
 * 
 * @param uriEncoded - URI-encoded AKN identifier (starts with _akn_)
 * @returns AKN format identifier (starts with /akn/)
 */
export function convertUriEncodedToAkn(uriEncoded: string): string {
  // Replace leading underscore with slash, then replace remaining underscores with slashes
  return uriEncoded.replace(/^_/, '/').replace(/_/g, '/');
}

/**
 * Extract AKN identifier from discovery result
 * 
 * This is a convenience function that returns the AKN identifier if available,
 * or null if the document cannot be downloaded via the Download API.
 * 
 * @param record - Discovery result
 * @returns AKN identifier or null
 */
export function extractAknIdentifier(record: DsoDiscoveryResult): string | null {
  const plan = normalizeDiscoveryToPlan(record);
  if (plan.kind === 'STOPTPOD') {
    return plan.regelingIdAkn;
  }
  return null;
}
