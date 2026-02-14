/**
 * Document Deduplication Service
 * 
 * Deduplicates CanonicalDocument objects using contentFingerprint (primary) and normalized URLs (secondary).
 * Uses DocumentNormalizationService for consistent normalization.
 * 
 * Deduplication Priority:
 * 1. contentFingerprint (primary - SHA256 hash of normalized fullText, most reliable)
 * 2. Normalized canonicalUrl (secondary - for documents without fingerprint)
 * 3. sourceId (tertiary - fallback)
 */

import type { CanonicalDocument } from '../../contracts/types.js';
import { DocumentNormalizationService, type NormalizedDocument } from './DocumentNormalizationService.js';
import { logger } from '../../utils/logger.js';

/**
 * Similarity thresholds for near-duplicate detection
 */
export interface SimilarityThresholds {
  /** Title similarity threshold (0-1, default: 0.8) */
  titleSimilarity?: number;
  /** Content/summary similarity threshold (0-1, default: 0.7) */
  contentSimilarity?: number;
}

/**
 * Options for deduplication
 */
export interface DeduplicationOptions {
  /** Whether to deduplicate by normalized URL (default: true) */
  byUrl?: boolean;
  /** Whether to deduplicate by stable ID (default: true) */
  byStableId?: boolean;
  /** Whether to use similarity heuristics for near-duplicate detection (default: false) */
  useSimilarityHeuristics?: boolean;
  /** Similarity thresholds (used when useSimilarityHeuristics is true) */
  similarityThresholds?: SimilarityThresholds;
  /** Strategy for handling duplicates: 'keepFirst' | 'keepLast' | 'merge' (default: 'keepFirst') */
  duplicateStrategy?: 'keepFirst' | 'keepLast' | 'merge';
}

/**
 * Result of deduplication operation
 */
export interface DeduplicationResult {
  /** Deduplicated documents */
  documents: CanonicalDocument[];
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Map of duplicate groups (for debugging/analysis) */
  duplicateGroups?: Map<string, CanonicalDocument[]>;
}

/**
 * Service for deduplicating documents
 */
export class DocumentDeduplicationService {
  private normalizationService: DocumentNormalizationService;

  constructor(normalizationService?: DocumentNormalizationService) {
    this.normalizationService = normalizationService || new DocumentNormalizationService();
  }

  /**
   * Deduplicates documents using contentFingerprint (primary) and normalized URLs (secondary)
   * 
   * Strategy:
   * 1. Normalize all documents using DocumentNormalizationService
   * 2. Deduplicate by contentFingerprint (if available) - highest priority
   * 3. Deduplicate by normalized canonicalUrl - secondary
   * 4. Deduplicate by sourceId - tertiary fallback
   * 5. Apply similarity heuristics for near-duplicates (optional)
   * 6. Apply duplicate strategy (keepFirst, keepLast, or merge)
   * 
   * @param documents - Array of documents to deduplicate
   * @param options - Deduplication options
   * @returns Deduplication result with deduplicated documents
   */
  deduplicate(
    documents: CanonicalDocument[],
    options: DeduplicationOptions = {}
  ): DeduplicationResult {
    if (documents.length === 0) {
      return {
        documents: [],
        duplicatesRemoved: 0,
      };
    }

    const {
      byUrl = true,
      byStableId = true,
      useSimilarityHeuristics = false,
      similarityThresholds = {
        titleSimilarity: 0.8,
        contentSimilarity: 0.7,
      },
      duplicateStrategy = 'keepFirst',
    } = options;

    // Normalize all documents
    const normalized = this.normalizationService.normalizeDocuments(documents);

    // Track duplicate groups for analysis
    const duplicateGroups = new Map<string, CanonicalDocument[]>();
    const seenFingerprints = new Map<string, number>(); // contentFingerprint -> index in deduplicated array
    const seenStableIds = new Map<string, number>(); // stableId (from normalization) -> index in deduplicated array
    const seenUrls = new Map<string, number>(); // normalizedUrl -> index in deduplicated array
    const deduplicated: NormalizedDocument[] = [];

    for (const doc of normalized) {
      let isDuplicate = false;
      let duplicateKey: string | undefined;
      let existingIndex = -1;

      // Priority 1: Deduplicate by contentFingerprint (highest priority - most reliable)
      if (doc.contentFingerprint) {
        existingIndex = seenFingerprints.get(doc.contentFingerprint) ?? -1;
        if (existingIndex !== -1) {
          isDuplicate = true;
          duplicateKey = `fingerprint:${doc.contentFingerprint}`;
          const existingDoc = deduplicated[existingIndex];
          
          // Track duplicate group
          if (!duplicateGroups.has(duplicateKey)) {
            duplicateGroups.set(duplicateKey, [existingDoc, doc]);
          } else {
            duplicateGroups.get(duplicateKey)!.push(doc);
          }

          // Apply duplicate strategy
          if (duplicateStrategy === 'keepLast') {
            deduplicated[existingIndex] = doc;
            seenFingerprints.set(doc.contentFingerprint, existingIndex);
          } else if (duplicateStrategy === 'merge') {
            // For merge strategy, we keep the first and merge metadata
            const merged = this.mergeDocuments(existingDoc, doc);
            deduplicated[existingIndex] = merged;
            seenFingerprints.set(doc.contentFingerprint, existingIndex);
          }
          // For 'keepFirst', we just skip this document (isDuplicate = true)
        } else {
          // New document - add to deduplicated array and track
          const index = deduplicated.length;
          deduplicated.push(doc);
          seenFingerprints.set(doc.contentFingerprint, index);
          // Also track by stable ID and URL if available
          if (byStableId && doc.stableId) {
            seenStableIds.set(doc.stableId, index);
          }
          if (byUrl && doc.normalizedUrl) {
            seenUrls.set(doc.normalizedUrl, index);
          }
        }
      }

      // Priority 2: If not a duplicate by fingerprint, try by stable ID (from normalization)
      if (!isDuplicate && byStableId && doc.stableId) {
        existingIndex = seenStableIds.get(doc.stableId) ?? -1;
        if (existingIndex !== -1) {
          isDuplicate = true;
          duplicateKey = `stableId:${doc.stableId}`;
          const existingDoc = deduplicated[existingIndex];
          
          // Track duplicate group
          if (!duplicateGroups.has(duplicateKey)) {
            duplicateGroups.set(duplicateKey, [existingDoc, doc]);
          } else {
            duplicateGroups.get(duplicateKey)!.push(doc);
          }

          // Apply duplicate strategy
          if (duplicateStrategy === 'keepLast') {
            deduplicated[existingIndex] = doc;
            seenStableIds.set(doc.stableId, existingIndex);
            // Update fingerprint tracking if document has one
            if (doc.contentFingerprint) {
              seenFingerprints.set(doc.contentFingerprint, existingIndex);
            }
          } else if (duplicateStrategy === 'merge') {
            // For merge strategy, we keep the first and merge metadata
            const merged = this.mergeDocuments(existingDoc, doc);
            deduplicated[existingIndex] = merged;
            seenStableIds.set(doc.stableId, existingIndex);
            // Update fingerprint tracking if document has one
            if (merged.contentFingerprint) {
              seenFingerprints.set(merged.contentFingerprint, existingIndex);
            }
          }
          // For 'keepFirst', we just skip this document (isDuplicate = true)
        } else {
          // New document - add to deduplicated array and track
          const index = deduplicated.length;
          deduplicated.push(doc);
          seenStableIds.set(doc.stableId, index);
          // Also track by fingerprint and URL if available
          if (doc.contentFingerprint) {
            seenFingerprints.set(doc.contentFingerprint, index);
          }
          if (byUrl && doc.normalizedUrl) {
            seenUrls.set(doc.normalizedUrl, index);
          }
        }
      }

      // Priority 3: If not a duplicate, try by normalized URL
      if (!isDuplicate && byUrl && doc.normalizedUrl) {
        existingIndex = seenUrls.get(doc.normalizedUrl) ?? -1;
        if (existingIndex !== -1) {
          isDuplicate = true;
          duplicateKey = `url:${doc.normalizedUrl}`;
          const existingDoc = deduplicated[existingIndex];
          
          // Track duplicate group
          if (!duplicateGroups.has(duplicateKey)) {
            duplicateGroups.set(duplicateKey, [existingDoc, doc]);
          } else {
            duplicateGroups.get(duplicateKey)!.push(doc);
          }

          // Apply duplicate strategy
          if (duplicateStrategy === 'keepLast') {
            deduplicated[existingIndex] = doc;
            seenUrls.set(doc.normalizedUrl, existingIndex);
            // Update fingerprint and stable ID tracking if document has them
            if (doc.contentFingerprint) {
              seenFingerprints.set(doc.contentFingerprint, existingIndex);
            }
            if (byStableId && doc.stableId) {
              seenStableIds.set(doc.stableId, existingIndex);
            }
          } else if (duplicateStrategy === 'merge') {
            // For merge strategy, we keep the first and merge metadata
            const merged = this.mergeDocuments(existingDoc, doc);
            deduplicated[existingIndex] = merged;
            seenUrls.set(doc.normalizedUrl, existingIndex);
            // Update fingerprint and stable ID tracking if document has them
            if (merged.contentFingerprint) {
              seenFingerprints.set(merged.contentFingerprint, existingIndex);
            }
            if (byStableId && merged.stableId) {
              seenStableIds.set(merged.stableId, existingIndex);
            }
          }
          // For 'keepFirst', we just skip this document (isDuplicate = true)
        } else {
          // New document - add to deduplicated array and track
          const index = deduplicated.length;
          deduplicated.push(doc);
          seenUrls.set(doc.normalizedUrl, index);
          // Also track by fingerprint and stable ID if available
          if (doc.contentFingerprint) {
            seenFingerprints.set(doc.contentFingerprint, index);
          }
          if (byStableId && doc.stableId) {
            seenStableIds.set(doc.stableId, index);
          }
        }
      }

      // If not a duplicate and not already added, add to deduplicated array
      if (!isDuplicate && !doc.contentFingerprint && (!byStableId || !doc.stableId) && (!byUrl || !doc.normalizedUrl)) {
        deduplicated.push(doc);
      }
    }

    // Apply similarity heuristics for near-duplicate detection (optional)
    let finalDeduplicated = deduplicated;
    if (useSimilarityHeuristics && deduplicated.length > 1) {
      finalDeduplicated = this.deduplicateBySimilarity(
        deduplicated,
        similarityThresholds,
        duplicateStrategy,
        duplicateGroups
      );
    }

    const duplicatesRemoved = documents.length - finalDeduplicated.length;

    if (duplicatesRemoved > 0) {
      logger.debug(
        {
          originalCount: documents.length,
          deduplicatedCount: deduplicated.length,
          duplicatesRemoved,
          duplicateGroupsCount: duplicateGroups.size,
        },
        'Document deduplication completed'
      );
    }

    // Convert back to CanonicalDocument (remove normalization fields)
    const result: CanonicalDocument[] = finalDeduplicated.map(doc => {
      // Remove normalization-specific fields
      const { normalizedUrl, normalizedTitle, stableId, ...rest } = doc;
      return rest as CanonicalDocument;
    });

    return {
      documents: result,
      duplicatesRemoved,
      duplicateGroups: duplicateGroups.size > 0 ? duplicateGroups : undefined,
    };
  }

  /**
   * Deduplicates documents by similarity heuristics (title and content similarity)
   * 
   * @param documents - Already deduplicated documents (by exact match)
   * @param thresholds - Similarity thresholds
   * @param duplicateStrategy - Strategy for handling duplicates
   * @param duplicateGroups - Map to track duplicate groups
   * @returns Further deduplicated documents
   */
  private deduplicateBySimilarity(
    documents: NormalizedDocument[],
    thresholds: SimilarityThresholds,
    duplicateStrategy: 'keepFirst' | 'keepLast' | 'merge',
    duplicateGroups: Map<string, CanonicalDocument[]>
  ): NormalizedDocument[] {
    const titleThreshold = thresholds.titleSimilarity ?? 0.8;
    const contentThreshold = thresholds.contentSimilarity ?? 0.7;
    const processedIndices = new Set<number>();
    const result: NormalizedDocument[] = [];

    for (let i = 0; i < documents.length; i++) {
      if (processedIndices.has(i)) continue;

      const current = documents[i];
      const duplicates: number[] = [i];

      // Find documents with similar titles and content
      for (let j = i + 1; j < documents.length; j++) {
        if (processedIndices.has(j)) continue;

        const other = documents[j];
        
        // Skip if already exact duplicates (same fingerprint, stable ID, or URL)
        if (current.contentFingerprint && other.contentFingerprint && current.contentFingerprint === other.contentFingerprint) continue;
        if (current.stableId && other.stableId && current.stableId === other.stableId) continue;
        if (current.normalizedUrl && other.normalizedUrl && current.normalizedUrl === other.normalizedUrl) continue;

        // Calculate title similarity
        const titleSim = this.calculateStringSimilarity(
          current.normalizedTitle || current.title || '',
          other.normalizedTitle || other.title || ''
        );

        if (titleSim >= titleThreshold) {
          // Also check content similarity if available
          const content1 = this.extractContent(current);
          const content2 = this.extractContent(other);
          
          if (content1 && content2) {
            const contentSim = this.calculateStringSimilarity(content1, content2);
            if (contentSim >= contentThreshold) {
              duplicates.push(j);
              processedIndices.add(j);
              
              // Track duplicate group
              const duplicateKey = `similarity:${i}-${j}`;
              if (!duplicateGroups.has(duplicateKey)) {
                duplicateGroups.set(duplicateKey, [current, other]);
              } else {
                duplicateGroups.get(duplicateKey)!.push(other);
              }
            }
          } else if (titleSim >= titleThreshold) {
            // If no content available, use title similarity alone (with higher threshold)
            if (titleSim >= 0.9) {
              duplicates.push(j);
              processedIndices.add(j);
              
              // Track duplicate group
              const duplicateKey = `similarity:${i}-${j}`;
              if (!duplicateGroups.has(duplicateKey)) {
                duplicateGroups.set(duplicateKey, [current, other]);
              } else {
                duplicateGroups.get(duplicateKey)!.push(other);
              }
            }
          }
        }
      }

      // Apply duplicate strategy
      if (duplicates.length === 1) {
        result.push(current);
      } else {
        const duplicateDocs = duplicates.map(idx => documents[idx]);
        
        if (duplicateStrategy === 'keepFirst') {
          result.push(duplicateDocs[0]);
        } else if (duplicateStrategy === 'keepLast') {
          result.push(duplicateDocs[duplicateDocs.length - 1]);
        } else if (duplicateStrategy === 'merge') {
          // Merge all duplicates
          let merged = duplicateDocs[0];
          for (let k = 1; k < duplicateDocs.length; k++) {
            merged = this.mergeDocuments(merged, duplicateDocs[k]);
          }
          result.push(merged);
        }
      }

      processedIndices.add(i);
    }

    return result;
  }

  /**
   * Calculate string similarity using Jaccard similarity (token-based)
   * 
   * @param str1 - First string
   * @param str2 - Second string
   * @returns Similarity score (0-1)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Normalize strings
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalized1 = normalize(str1);
    const normalized2 = normalize(str2);

    if (normalized1 === normalized2) return 1;

    // Tokenize into words
    const tokens1 = new Set(normalized1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(normalized2.split(/\s+/).filter(t => t.length > 0));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    // Calculate Jaccard similarity (intersection / union)
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Extract content from document for similarity comparison
   * 
   * @param doc - Document to extract content from
   * @returns Content string or null if not available
   */
  private extractContent(doc: NormalizedDocument): string | null {
    // Priority 1: Use fullText from CanonicalDocument (most reliable)
    if (doc.fullText) {
      return doc.fullText;
    }

    // Priority 2: Try to get content from sourceMetadata or enrichmentMetadata
    const docWithExtended = doc as NormalizedDocument & Record<string, unknown>;
    
    // Check for summary/samenvatting in sourceMetadata
    if (doc.sourceMetadata && typeof doc.sourceMetadata === 'object') {
      const sourceMetadata = doc.sourceMetadata as Record<string, unknown>;
      if (typeof sourceMetadata.samenvatting === 'string') {
        return sourceMetadata.samenvatting;
      }
      if (typeof sourceMetadata.summary === 'string') {
        return sourceMetadata.summary;
      }
    }
    
    // Check enrichmentMetadata
    if (doc.enrichmentMetadata && typeof doc.enrichmentMetadata === 'object') {
      const enrichmentMetadata = doc.enrichmentMetadata as Record<string, unknown>;
      if (typeof enrichmentMetadata.summary === 'string') {
        return enrichmentMetadata.summary;
      }
    }

    return null;
  }

  /**
   * Full merge of two documents with intelligent field merging
   * 
   * Strategy:
   * - Prefer canonicalUrl from sources with higher authority (Rechtspraak, Wetgeving for legal docs)
   * - Merge artifactRefs arrays (remove duplicates)
   * - Take maximum values for authorityScore and matchSignals
   * - Preserve best title (longer, more descriptive)
   * - Merge dates (prefer more recent or more specific)
   * - Merge sourceMetadata and enrichmentMetadata
   * - Preserve best metadata from each source
   * 
   * @param doc1 - First document
   * @param doc2 - Second document
   * @returns Merged document
   */
  private mergeDocuments(doc1: NormalizedDocument, doc2: NormalizedDocument): NormalizedDocument {
    // Determine source types for intelligent merging
    const rechtspraakDoc = doc1.source === 'Rechtspraak' ? doc1 :
                           doc2.source === 'Rechtspraak' ? doc2 : null;
    const wetgevingDoc = doc1.source === 'Wetgeving' ? doc1 :
                         doc2.source === 'Wetgeving' ? doc2 : null;
    const dsoDoc = doc1.source === 'DSO' ? doc1 :
                   doc2.source === 'DSO' ? doc2 : null;
    
    // Prefer canonicalUrl from Rechtspraak or Wetgeving for legal links, but keep DSO metadata
    const preferredCanonicalUrl = rechtspraakDoc?.canonicalUrl || wetgevingDoc?.canonicalUrl || doc1.canonicalUrl || doc2.canonicalUrl;
    const preferredSourceId = dsoDoc?.sourceId || doc1.sourceId || doc2.sourceId;
    const preferredDocumentType = dsoDoc?.documentType || doc1.documentType || doc2.documentType;

    // Prefer longer, more descriptive title
    const title1 = doc1.title || '';
    const title2 = doc2.title || '';
    const preferredTitle = title1.length >= title2.length ? title1 : title2;

    // Merge fullText (prefer longer, more complete)
    const fullText1 = doc1.fullText || '';
    const fullText2 = doc2.fullText || '';
    const preferredFullText = fullText1.length >= fullText2.length ? fullText1 : fullText2;

    // Merge dates (prefer more recent or more specific)
    const date1 = doc1.dates?.publishedAt;
    const date2 = doc2.dates?.publishedAt;
    const preferredDate = this.mergeDates(date1, date2);

    // Merge artifactRefs from both sources (remove duplicates by URL)
    const mergedArtifactRefs = [
      ...(doc1.artifactRefs || []),
      ...(doc2.artifactRefs || []),
    ];
    const uniqueArtifactRefs = mergedArtifactRefs.filter((ref, index, self) =>
      index === self.findIndex((r) => r.sha256 === ref.sha256 && r.storageKey === ref.storageKey)
    );

    // Get authority scores from enrichmentMetadata
    const authorityScore1 = (typeof doc1.enrichmentMetadata?.authorityScore === 'number' ? doc1.enrichmentMetadata.authorityScore : 0) || 0;
    const authorityScore2 = (typeof doc2.enrichmentMetadata?.authorityScore === 'number' ? doc2.enrichmentMetadata.authorityScore : 0) || 0;
    const preferredAuthorityScore = Math.max(authorityScore1, authorityScore2);

    // Merge match signals (take maximum)
    const matchSignals1 = doc1.enrichmentMetadata?.matchSignals || {};
    const matchSignals2 = doc2.enrichmentMetadata?.matchSignals || {};
    const mergedMatchSignals = {
      keyword: Math.max(
        (typeof matchSignals1 === 'object' && 'keyword' in matchSignals1 ? matchSignals1.keyword : 0) as number,
        (typeof matchSignals2 === 'object' && 'keyword' in matchSignals2 ? matchSignals2.keyword : 0) as number
      ),
      semantic: Math.max(
        (typeof matchSignals1 === 'object' && 'semantic' in matchSignals1 ? matchSignals1.semantic : 0) as number,
        (typeof matchSignals2 === 'object' && 'semantic' in matchSignals2 ? matchSignals2.semantic : 0) as number
      ),
      metadata: Math.max(
        (typeof matchSignals1 === 'object' && 'metadata' in matchSignals1 ? matchSignals1.metadata : 0) as number,
        (typeof matchSignals2 === 'object' && 'metadata' in matchSignals2 ? matchSignals2.metadata : 0) as number
      ),
    };

    // Prefer document with higher authority score as base
    const baseDoc = authorityScore2 > authorityScore1 ? doc2 : doc1;

    // Merge sourceMetadata (prefer from document with higher authority)
    const mergedSourceMetadata = {
      ...(baseDoc.sourceMetadata && typeof baseDoc.sourceMetadata === 'object' ? baseDoc.sourceMetadata : {}),
      ...(doc1.sourceMetadata && typeof doc1.sourceMetadata === 'object' ? doc1.sourceMetadata : {}),
      ...(doc2.sourceMetadata && typeof doc2.sourceMetadata === 'object' ? doc2.sourceMetadata : {}),
    };

    // Merge enrichmentMetadata
    // Start with base document's enrichmentMetadata, then merge in specific fields
    const baseEnrichment = baseDoc.enrichmentMetadata && typeof baseDoc.enrichmentMetadata === 'object' 
      ? baseDoc.enrichmentMetadata as Record<string, unknown>
      : {};
    const doc1Enrichment = doc1.enrichmentMetadata && typeof doc1.enrichmentMetadata === 'object'
      ? doc1.enrichmentMetadata as Record<string, unknown>
      : {};
    const doc2Enrichment = doc2.enrichmentMetadata && typeof doc2.enrichmentMetadata === 'object'
      ? doc2.enrichmentMetadata as Record<string, unknown>
      : {};
    
    const mergedEnrichmentMetadata = {
      ...baseEnrichment,
      ...doc1Enrichment,
      ...doc2Enrichment,
      // Override with merged values (these take priority)
      authorityScore: preferredAuthorityScore,
      matchSignals: mergedMatchSignals,
    };

    // Build merged document with all fields
    const merged: NormalizedDocument = {
      ...baseDoc,
      title: preferredTitle,
      canonicalUrl: preferredCanonicalUrl,
      fullText: preferredFullText || baseDoc.fullText,
      documentFamily: doc1.documentFamily || doc2.documentFamily || baseDoc.documentFamily,
      documentType: preferredDocumentType || baseDoc.documentType,
      source: baseDoc.source, // Keep base document's source
      sourceId: preferredSourceId || baseDoc.sourceId,
      publisherAuthority: doc1.publisherAuthority || doc2.publisherAuthority || baseDoc.publisherAuthority,
      dates: {
        ...baseDoc.dates,
        publishedAt: preferredDate instanceof Date ? preferredDate : (baseDoc.dates?.publishedAt),
      },
      artifactRefs: uniqueArtifactRefs.length > 0 ? uniqueArtifactRefs : baseDoc.artifactRefs,
      sourceMetadata: Object.keys(mergedSourceMetadata).length > 0 ? mergedSourceMetadata : baseDoc.sourceMetadata,
      enrichmentMetadata: Object.keys(mergedEnrichmentMetadata).length > 0 ? mergedEnrichmentMetadata : baseDoc.enrichmentMetadata,
      // Preserve normalization fields
      normalizedUrl: baseDoc.normalizedUrl,
      normalizedTitle: baseDoc.normalizedTitle,
      stableId: baseDoc.stableId,
      // Preserve contentFingerprint (should be same for duplicates, but prefer from base)
      contentFingerprint: baseDoc.contentFingerprint || doc1.contentFingerprint || doc2.contentFingerprint,
    };

    return merged;
  }

  /**
   * Merge two date values, preferring more recent or more specific date
   * 
   * @param date1 - First date (Date or undefined)
   * @param date2 - Second date (Date or undefined)
   * @returns Preferred date or undefined
   */
  private mergeDates(date1: Date | undefined, date2: Date | undefined): Date | undefined {
    if (!date1 && !date2) return undefined;
    if (!date1) return date2;
    if (!date2) return date1;

    // If either is invalid, return the valid one
    if (isNaN(date1.getTime())) return date2;
    if (isNaN(date2.getTime())) return date1;

    // Prefer more recent date
    return date1 > date2 ? date1 : date2;
  }
}
