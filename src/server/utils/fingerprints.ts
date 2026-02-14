/**
 * Fingerprint Utilities
 * 
 * Deterministic fingerprinting for canonical documents and chunks.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */

import { createHash } from 'crypto';

/**
 * Normalize text for fingerprinting:
 * - Trim whitespace
 * - Collapse multiple whitespace to single space
 * - Normalize newlines to \n
 * 
 * @param text - Text to normalize
 * @returns Normalized text
 */
export function normalizeTextForFingerprint(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\r/g, '\n') // Normalize Mac line endings
    .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
    .replace(/\n\s+/g, '\n') // Remove leading whitespace after newlines
    .replace(/\s+\n/g, '\n') // Remove trailing whitespace before newlines
    .replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines to double newline max
}

/**
 * Compute SHA-256 fingerprint of normalized text
 * 
 * @param text - Text to fingerprint
 * @returns 64-character hex string (sha256)
 */
export function computeContentFingerprint(text: string): string {
  const normalized = normalizeTextForFingerprint(text);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Compute chunk fingerprint (same as content fingerprint for chunk text)
 * 
 * @param chunkText - Chunk text to fingerprint
 * @returns 64-character hex string (sha256)
 */
export function computeChunkFingerprint(chunkText: string): string {
  return computeContentFingerprint(chunkText);
}

/**
 * Generate deterministic chunk ID
 * Format: "{documentId}:{chunkingVersion}:{chunkIndex}:{sha256(chunkTextNormalized)[0:16]}"
 * 
 * @param documentId - Document ID
 * @param chunkingVersion - Chunking version (e.g., "v1")
 * @param chunkIndex - Chunk index (0-based)
 * @param chunkText - Chunk text
 * @returns Deterministic chunk ID
 */
export function generateChunkId(
  documentId: string,
  chunkingVersion: string,
  chunkIndex: number,
  chunkText: string
): string {
  const normalized = normalizeTextForFingerprint(chunkText);
  const fingerprint = createHash('sha256').update(normalized, 'utf8').digest('hex');
  const shortHash = fingerprint.substring(0, 16); // First 16 chars of sha256
  
  return `${documentId}:${chunkingVersion}:${chunkIndex}:${shortHash}`;
}

