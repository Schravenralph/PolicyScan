/**
 * Retention Policy Management
 * 
 * Manages artifact retention policies with TTL support and tombstone markers.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import type { DocumentSource, DocumentFamily } from '../contracts/types.js';
import { logger } from '../utils/logger.js';

/**
 * Retention policy configuration
 */
export interface RetentionPolicy {
  /** Source types to apply this policy to */
  sources?: DocumentSource[];
  /** Document families to apply this policy to */
  documentFamilies?: DocumentFamily[];
  /** MIME types to apply this policy to */
  mimeTypes?: string[];
  /** TTL in days (undefined = keep indefinitely) */
  ttlDays?: number;
  /** Whether to keep metadata after artifact bytes are purged */
  keepMetadataAfterPurge: boolean;
}

/**
 * Default retention policies
 * 
 * - Keep: DSO ZIPs, Rechtspraak XMLs, Wetgeving XML/PDF, Municipal PDFs
 * - Optional TTL for transient HTML snapshots (WebExtension) if re-fetchable
 * - Keep metadata indefinitely; allow artifact bytes purge with tombstone markers
 */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    sources: ['DSO'],
    mimeTypes: ['application/zip'],
    keepMetadataAfterPurge: true,
  },
  {
    sources: ['Rechtspraak'],
    mimeTypes: ['application/xml', 'text/xml'],
    keepMetadataAfterPurge: true,
  },
  {
    sources: ['Wetgeving'],
    mimeTypes: ['application/xml', 'text/xml', 'application/pdf'],
    keepMetadataAfterPurge: true,
  },
  {
    sources: ['Gemeente'],
    mimeTypes: ['application/pdf'],
    keepMetadataAfterPurge: true,
  },
  {
    sources: ['Web'],
    documentFamilies: ['Web'],
    mimeTypes: ['text/html'],
    ttlDays: 90, // Optional TTL for transient HTML snapshots
    keepMetadataAfterPurge: true,
  },
];

/**
 * Check if an artifact should be retained based on policies
 * 
 * @param source - Document source
 * @param documentFamily - Document family
 * @param mimeType - MIME type
 * @param createdAt - Artifact creation date
 * @param policies - Retention policies (defaults to DEFAULT_RETENTION_POLICIES)
 * @returns true if artifact should be retained, false if it can be purged
 */
export function shouldRetainArtifact(
  source: DocumentSource,
  documentFamily: DocumentFamily,
  mimeType: string,
  createdAt: Date,
  policies: RetentionPolicy[] = DEFAULT_RETENTION_POLICIES
): boolean {
  for (const policy of policies) {
    // Check if policy applies
    if (policy.sources && !policy.sources.includes(source)) {
      continue;
    }
    if (policy.documentFamilies && !policy.documentFamilies.includes(documentFamily)) {
      continue;
    }
    if (policy.mimeTypes && !policy.mimeTypes.includes(mimeType)) {
      continue;
    }

    // Policy applies - check TTL
    if (policy.ttlDays !== undefined) {
      const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > policy.ttlDays) {
        logger.debug(
          { source, mimeType, ageDays, ttlDays: policy.ttlDays },
          'Artifact exceeds TTL, can be purged'
        );
        return false;
      }
    }

    // Policy applies and TTL not exceeded (or no TTL)
    return true;
  }

  // No matching policy - default to retain
  logger.debug({ source, documentFamily, mimeType }, 'No retention policy matched, defaulting to retain');
  return true;
}

/**
 * Check if metadata should be kept after artifact bytes are purged
 * 
 * @param source - Document source
 * @param documentFamily - Document family
 * @param mimeType - MIME type
 * @param policies - Retention policies (defaults to DEFAULT_RETENTION_POLICIES)
 * @returns true if metadata should be kept
 */
export function shouldKeepMetadataAfterPurge(
  source: DocumentSource,
  documentFamily: DocumentFamily,
  mimeType: string,
  policies: RetentionPolicy[] = DEFAULT_RETENTION_POLICIES
): boolean {
  for (const policy of policies) {
    // Check if policy applies
    if (policy.sources && !policy.sources.includes(source)) {
      continue;
    }
    if (policy.documentFamilies && !policy.documentFamilies.includes(documentFamily)) {
      continue;
    }
    if (policy.mimeTypes && !policy.mimeTypes.includes(mimeType)) {
      continue;
    }

    // Policy applies - return keepMetadataAfterPurge setting
    return policy.keepMetadataAfterPurge;
  }

  // No matching policy - default to keep metadata
  return true;
}

/**
 * Tombstone marker for purged artifacts
 * Indicates that artifact bytes have been purged but metadata is retained
 */
export interface ArtifactTombstone {
  sha256: string;
  purgedAt: Date;
  reason: 'ttl_expired' | 'manual_purge' | 'retention_policy';
  metadataRetained: boolean;
}

/**
 * Create a tombstone marker for a purged artifact
 */
export function createTombstone(
  sha256: string,
  reason: ArtifactTombstone['reason'],
  metadataRetained: boolean
): ArtifactTombstone {
  return {
    sha256,
    purgedAt: new Date(),
    reason,
    metadataRetained,
  };
}

