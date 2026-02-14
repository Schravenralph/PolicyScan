/**
 * ArtifactRef Builder
 * 
 * Builds ArtifactRef instances with provenance redaction for security.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import { createHash } from 'crypto';
import type { ArtifactRef, ArtifactProvenance } from '../contracts/types.js';
import { getLoggingConfig } from '../config/logging.js';

/**
 * Redact sensitive headers from provenance
 * 
 * Never logs secrets/headers in full; applies redaction rules.
 * 
 * @param headers - Headers to redact
 * @returns Redacted headers object
 */
export function redactProvenanceHeaders(
  headers?: Record<string, string>
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const config = getLoggingConfig();
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    // Check if field should be redacted
    if (shouldRedactHeader(key, config)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Check if a header key should be redacted
 * 
 * Normalizes the key by removing hyphens and underscores to match common header patterns
 * like "x-api-key" or "X_API_KEY" against fields like "apiKey".
 */
function shouldRedactHeader(key: string, config: ReturnType<typeof getLoggingConfig>): boolean {
  const lowerKey = key.toLowerCase();
  // Normalize by removing hyphens and underscores for matching
  const normalizedKey = lowerKey.replace(/[-_]/g, '');
  
  return config.redactSensitiveFields.some((field) => {
    const normalizedField = field.toLowerCase().replace(/[-_]/g, '');
    return normalizedKey.includes(normalizedField);
  });
}

/**
 * Build ArtifactRef from bytes and provenance
 * 
 * @param bytes - Artifact bytes
 * @param mimeType - MIME type
 * @param provenance - Provenance information (headers will be redacted)
 * @param storageKey - Storage key (derived from sha256)
 * @returns ArtifactRef
 */
export function buildArtifactRef(
  bytes: Buffer,
  mimeType: string,
  provenance: ArtifactProvenance,
  storageKey: string
): ArtifactRef {
  // Compute sha256
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // Redact headers in provenance
  const redactedProvenance: ArtifactProvenance = {
    ...provenance,
    headers: redactProvenanceHeaders(provenance.headers),
  };

  return {
    sha256,
    storageKey,
    mimeType,
    sizeBytes: bytes.length,
    createdAt: new Date(),
    provenance: redactedProvenance,
  };
}

/**
 * Compute storage key from sha256
 * 
 * Format: {sha256[0:2]}/{sha256}
 * This creates a two-level directory structure to avoid too many files in one directory.
 * 
 * @param sha256 - SHA-256 hash (64-character hex string)
 * @returns Storage key/path
 */
export function computeStorageKey(sha256: string): string {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error(`Invalid sha256 format: ${sha256}`);
  }
  return `${sha256.substring(0, 2)}/${sha256}`;
}

