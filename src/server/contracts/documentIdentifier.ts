/**
 * Document Identifier Contract
 * 
 * Defines the contract for how documents are uniquely identified across sources.
 * This enables matching documents regardless of the identifier format provided.
 * 
 * @see docs/21-issues/WI-DOCUMENT-IDENTITY-001-document-identifier-matching.md
 */

import { z } from 'zod';
import type { DocumentSource } from './types.js';

/**
 * Alternate identifier for cross-source matching
 * 
 * Example: A DSO document might have both an AKN identifier and an IMRO identifier
 */
export const AlternateIdentifierSchema = z.object({
  source: z.string().min(1, 'source is required'),
  identifier: z.string().min(1, 'identifier is required'),
});

export type AlternateIdentifier = z.infer<typeof AlternateIdentifierSchema>;

/**
 * Document Identifier Schema
 * 
 * Defines the contract for document identifiers across all sources.
 * At least one identifier must be provided (sourceId, canonicalUrl, or contentFingerprint).
 */
export const DocumentIdentifierSchema = z.object({
  // Primary identifier (required when source is known)
  source: z.enum(['DSO', 'Rechtspraak', 'Wetgeving', 'Gemeente', 'PDOK', 'Web', 'IPLO']),
  sourceId: z.string().min(1, 'sourceId is required'),
  
  // Optional identifiers for cross-source matching
  canonicalUrl: z.string().url().optional(),
  alternateIdentifiers: z.array(AlternateIdentifierSchema).optional(),
  
  // Content-based matching (fallback)
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/i, 'contentFingerprint must be a 64-character hex string (sha256)').optional(),
}).refine(
  (data) => {
    // At least one identifier must be provided
    return data.sourceId || data.canonicalUrl || data.contentFingerprint;
  },
  { message: 'At least one identifier must be provided' }
);

export type DocumentIdentifier = z.infer<typeof DocumentIdentifierSchema>;

/**
 * Identifier Normalizer Interface
 * 
 * Each adapter can normalize different identifier formats to a standard format.
 */
export interface IdentifierNormalizer {
  /**
   * Check if this normalizer can handle the given identifier
   */
  canNormalize(identifier: string): boolean;
  
  /**
   * Normalize identifier to standard format
   * Returns normalized identifier or null if cannot normalize
   */
  normalize(identifier: string): DocumentIdentifier | null;
  
  /**
   * Extract all possible identifiers from a canonical document
   * (e.g., DSO document might have AKN, IMRO, and URL identifiers)
   */
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[];
}


