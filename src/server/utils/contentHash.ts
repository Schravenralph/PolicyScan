import crypto from 'crypto';

/**
 * Compute a content hash for a document based on its key fields
 * Used for change detection - if the hash changes, the document content has changed
 * 
 * @param title Document title
 * @param summary Document summary/samenvatting
 * @param url Document URL (included to detect URL changes)
 * @returns SHA-256 hash of the document content
 */
export function computeContentHash(title: string, summary: string, url: string): string {
  // Create a normalized string from key document fields
  // Normalize by trimming whitespace to avoid false positives from formatting changes
  const normalizedTitle = (title || '').trim();
  const normalizedSummary = (summary || '').trim();
  const normalizedUrl = (url || '').trim();
  
  // Combine fields in a consistent order
  const contentString = `${normalizedTitle}|${normalizedSummary}|${normalizedUrl}`;
  
  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(contentString, 'utf8').digest('hex');
}

/**
 * Detect if document content has changed by comparing hashes
 * 
 * @param newHash Current content hash
 * @param oldHash Previous content hash (if available)
 * @returns true if content has changed, false otherwise
 */
export function hasContentChanged(newHash: string, oldHash?: string | null): boolean {
  if (!oldHash) {
    return true; // No previous hash means new document (treated as "changed")
  }
  return newHash !== oldHash;
}

