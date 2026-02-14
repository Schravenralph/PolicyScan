import { VectorService, LocalEmbeddingProvider } from '../../query/VectorService.js';
import { ScrapedDocument } from '../../infrastructure/types.js';
import { queryCache } from '../../query/QueryCache.js';
import { createHash } from 'crypto';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import { getCanonicalChunkService } from '../../canonical/CanonicalChunkService.js';
import { logger } from '../../../utils/logger.js';

/**
 * Document Embedding Service
 * 
 * Generates vector embeddings for scraped documents using hierarchical text extraction.
 * Implements the recommended strategy from 01-hybrid-retrieval.md:
 * - Priority-based field extraction (Title → Summary → First paragraph → Headings → Content)
 * - Smart truncation to 1500 characters (safe for Dutch text with 384-dim model)
 * - Document-type aware extraction
 */
export class DocumentEmbeddingService {
  private vectorService: VectorService;
  private embeddingProvider: LocalEmbeddingProvider;
  private readonly MAX_EMBEDDING_LENGTH = 1500; // Safe limit for Dutch text with 384-dim model
  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'; // Model used for embeddings

  constructor(vectorService?: VectorService) {
    this.vectorService = vectorService || new VectorService();
    this.embeddingProvider = new LocalEmbeddingProvider();
  }

  /**
   * Extract text for embedding from document using hierarchical priority
   * 
   * Priority order:
   * 1. Title (max 200 chars)
   * 2. Summary/Description (max 300 chars)
   * 3. First paragraph (max 400 chars)
   * 4. Headings (max 300 chars)
   * 5. Content excerpt (fill remaining space, max 500 chars)
   * 
   * Total limit: 1500 characters to stay safely under token limit
   */
  extractEmbeddingText(doc: ScrapedDocument): string {
    const parts: string[] = [];
    let totalLength = 0;

    // 1. Title (highest priority)
    if (doc.titel) {
      const title = this.truncateAtWordBoundary(doc.titel, Math.min(200, this.MAX_EMBEDDING_LENGTH - totalLength));
      if (title) {
        parts.push(title);
        totalLength += title.length;
      }
    }

    // 2. Summary/Description (high priority)
    if (totalLength < this.MAX_EMBEDDING_LENGTH && doc.samenvatting) {
      const summary = this.truncateAtWordBoundary(
        doc.samenvatting,
        Math.min(300, this.MAX_EMBEDDING_LENGTH - totalLength)
      );
      if (summary) {
        parts.push(summary);
        totalLength += summary.length;
      }
    }

    // 3. First paragraph (medium priority)
    // Note: ScrapedDocument doesn't have content field, but we can extract from URL context
    // For now, we'll skip this and rely on title + summary
    // This can be enhanced when content extraction is available

    // 4. Headings (medium priority)
    // Note: Headings would need to be extracted from HTML content
    // For now, we'll skip this as ScrapedDocument doesn't include headings

    // 5. Content excerpt (lower priority, fill remaining space)
    // Note: Content extraction would need to be added to scrapers
    // For now, we'll use available fields

    // Add metadata context if available
    const metadataParts: string[] = [];
    
    if (doc.website_titel) {
      metadataParts.push(`Bron: ${doc.website_titel}`);
    }
    
    if (doc.type_document) {
      metadataParts.push(`Type: ${doc.type_document}`);
    }
    
    if (doc.publicatiedatum) {
      metadataParts.push(`Datum: ${doc.publicatiedatum}`);
    }

    // Add metadata if there's space
    if (metadataParts.length > 0 && totalLength < this.MAX_EMBEDDING_LENGTH) {
      const metadata = metadataParts.join('. ');
      const metadataText = this.truncateAtWordBoundary(
        metadata,
        Math.min(200, this.MAX_EMBEDDING_LENGTH - totalLength)
      );
      if (metadataText) {
        parts.push(metadataText);
        totalLength += metadataText.length;
      }
    }

    // Join parts with double newlines for separation
    const combined = parts.join('\n\n');
    
    // Final safety check: ensure we don't exceed limit
    return combined.substring(0, this.MAX_EMBEDDING_LENGTH).trim();
  }

  /**
   * Truncate text at word boundary to avoid cutting mid-word
   */
  private truncateAtWordBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text.trim();
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      // If we can find a space reasonably close to the limit, use it
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Otherwise, just truncate and add ellipsis
    return truncated.trim() + '...';
  }

  /**
   * Extract first paragraph from content text
   * Helper method for when content is available (unused)
   */
  private _extractFirstParagraph(content: string, maxLength: number = 400): string {
    if (!content) return '';

    // Remove extra whitespace
    const normalized = content.replace(/\s+/g, ' ').trim();
    
    // Find first sentence or paragraph
    const firstSentence = normalized.split(/[.!?]\s+/)[0];
    
    if (firstSentence.length <= maxLength) {
      return firstSentence;
    }

    return this.truncateAtWordBoundary(firstSentence, maxLength);
  }

  /**
   * Extract headings from HTML content
   * Helper method for when HTML content is available (unused)
   */
  private _extractHeadings(html: string, maxLength: number = 300): string {
    if (!html) return '';

    // Simple regex to extract h1, h2, h3 tags
    const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
    const headings: string[] = [];
    let match;

    while ((match = headingRegex.exec(html)) !== null && headings.length < 10) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) {
        headings.push(text);
      }
    }

    const headingsText = headings.join(' | ');
    return this.truncateAtWordBoundary(headingsText, maxLength);
  }

  /**
   * Generate embedding for a document
   * 
   * @param doc - The scraped document
   * @returns Vector embedding as array of numbers
   */
  async generateDocumentEmbedding(doc: ScrapedDocument): Promise<number[]> {
    const embeddingText = this.extractEmbeddingText(doc);
    
    if (!embeddingText || embeddingText.trim().length === 0) {
      throw new Error(`Cannot generate embedding: document has no extractable text (URL: ${doc.url})`);
    }

    return await this.embeddingProvider.generateEmbedding(embeddingText);
  }

  /**
   * Calculate content hash from document text
   * Used to detect if document content has changed
   * 
   * @param doc - The scraped document
   * @returns SHA-256 hash of document content
   */
  private calculateContentHash(doc: ScrapedDocument): string {
    const embeddingText = this.extractEmbeddingText(doc);
    return createHash('sha256').update(embeddingText).digest('hex');
  }

  /**
   * Check if document needs embedding update
   * 
   * @param docId - Document ID
   * @param contentHash - Current content hash
   * @returns true if embedding needs to be regenerated, false otherwise
   */
  private async needsEmbeddingUpdate(docId: string, contentHash: string): Promise<boolean> {
    try {
      // Try canonical document service first
      const documentService = getCanonicalDocumentService();
      const canonicalDoc = await documentService.findById(docId);
      
      if (canonicalDoc) {
        // Check content hash in enrichment metadata
        if (canonicalDoc.enrichmentMetadata?.contentHash === contentHash &&
            canonicalDoc.enrichmentMetadata?.embedding &&
            (canonicalDoc.enrichmentMetadata.embedding as number[]).length > 0) {
          return false;
        }

        // Check if document has chunks with embeddings
        const chunkService = getCanonicalChunkService();
        const chunks = await chunkService.findChunks(docId);
        
        // If no chunks exist, needs embedding
        if (chunks.length === 0) {
          return true;
        }
        
        // Check if any chunk has an embedding
        const hasEmbedding = chunks.some(chunk => 
          chunk.embedding && 
          chunk.embedding.vectorRef
        );
        
        // If no chunks have embeddings, needs embedding
        if (!hasEmbedding) {
          return true;
        }
        
        // Check if document was updated after chunks were created
        // (This is a simplified check - in practice, we'd check chunk updatedAt vs embedding generatedAt)
        if (canonicalDoc.updatedAt) {
          const latestChunkUpdate = Math.max(
            ...chunks.map(chunk => chunk.updatedAt.getTime())
          );
          if (canonicalDoc.updatedAt.getTime() > latestChunkUpdate) {
            return true;
          }
        }
        
        // Document has chunks with embeddings and hasn't been updated
        return false;
      }
      
      // No legacy fallback - canonical documents only
      // If we reach here, document doesn't exist in canonical format
      logger.debug({ docId }, 'Document not found in canonical format, needs embedding');
      return true;
    } catch (error) {
      // On error, assume update is needed (safe default)
      console.warn(`[DocumentEmbeddingService] Error checking if embedding update needed for ${docId}:`, error);
      return true;
    }
  }

  /**
   * Store document embedding in both VectorService (for fast search) and MongoDB (for persistence)
   * 
   * Implements incremental updates: only regenerates embedding if document content has changed.
   * 
   * @param docId - Document ID (MongoDB ObjectId as string)
   * @param doc - The scraped document
   * @param options - Optional configuration
   * @param options.forceRegenerate - Force regeneration even if content unchanged (default: false)
   * @returns Embedding vector that was stored (or existing if skipped)
   */
  async storeDocumentEmbedding(
    docId: string,
    doc: ScrapedDocument,
    options: { forceRegenerate?: boolean } = {}
  ): Promise<number[]> {
    const { forceRegenerate = false } = options;
    
    // Calculate content hash to detect changes
    const contentHash = this.calculateContentHash(doc);
    
    // Check if embedding update is needed (incremental update logic)
    if (!forceRegenerate) {
      const needsUpdate = await this.needsEmbeddingUpdate(docId, contentHash);
      if (!needsUpdate) {
        // Get existing embedding from canonical document
        try {
          const documentService = getCanonicalDocumentService();
          const existingDoc = await documentService.findById(docId);
          if (existingDoc?.enrichmentMetadata?.embedding) {
            const embedding = existingDoc.enrichmentMetadata.embedding as number[];
            if (Array.isArray(embedding) && embedding.length > 0) {
              logger.info({ docId }, 'Skipping embedding regeneration (content unchanged)');
              return embedding;
            }
          }
        } catch (error) {
          logger.warn({ error, docId }, 'Error checking existing embedding, proceeding with regeneration');
        }
      } else {
        logger.info({ docId }, 'Regenerating embedding (content changed or missing)');
      }
    } else {
      console.log(`[DocumentEmbeddingService] Force regenerating embedding for document ${docId}`);
    }
    
    // Generate new embedding
    const embedding = await this.generateDocumentEmbedding(doc);
    const embeddingText = this.extractEmbeddingText(doc);
    const embeddingGeneratedAt = new Date();

    // Store in VectorService for fast search (using pre-computed embedding to avoid duplicate generation)
    await this.vectorService.addDocumentWithEmbedding(docId, embeddingText, embedding, {
      url: doc.url,
      titel: doc.titel,
      website_url: doc.website_url,
      website_titel: doc.website_titel,
      type_document: doc.type_document,
      publicatiedatum: doc.publicatiedatum,
      embeddingModel: this.EMBEDDING_MODEL,
      embeddingGeneratedAt
    });

    // Store in MongoDB for persistence (including content hash)
    try {
      const documentService = getCanonicalDocumentService();
      
      // Update enrichmentMetadata with embedding information
      const updated = await documentService.updateEnrichmentMetadata(
        docId,
        {
          embedding,
          embeddingModel: this.EMBEDDING_MODEL,
          embeddingGeneratedAt: embeddingGeneratedAt.toISOString(),
          contentHash,
        }
      );
      
      if (updated) {
        // Invalidate query cache when document embeddings are updated
        // This ensures cached query results reflect the latest document state
        queryCache.invalidateAll();
        logger.info({ docId }, 'Successfully stored embedding in canonical document');
      } else {
        logger.warn({ docId }, 'Failed to update embedding in canonical document (document not found)');
      }
    } catch (error) {
      // Log error but don't fail - VectorService storage succeeded
      logger.error({ error, docId }, 'Error storing embedding in canonical document');
    }

    return embedding;
  }

  /**
   * Batch generate embeddings with concurrency control
   * 
   * @param documents - Array of documents with IDs
   * @param options - Configuration options
   * @returns Map of document ID to embedding vector or error
   */
  async generateEmbeddingsBatch(
    documents: Array<{ id: string; doc: ScrapedDocument }>,
    options: {
      concurrency?: number;  // Default: 12 (configurable 10-15 range)
      progressCallback?: (current: number, total: number, errors: number) => void;
      maxRetries?: number;  // Default: 2
      retryDelay?: number;  // Default: 1000ms
    } = {}
  ): Promise<Map<string, number[] | Error>> {
    const { 
      concurrency = 12, 
      progressCallback,
      maxRetries = 2,
      retryDelay = 1000
    } = options;
    
    const results = new Map<string, number[] | Error>();
    const errors: Array<{ id: string; url: string; error: Error }> = [];
    
    // Proper semaphore implementation using Promise-based concurrency control
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let active = 0;
    const waitingQueue: Array<() => void> = [];
    
    // Semaphore helper with proper queue-based concurrency control
    const semaphore = {
      acquire: async (): Promise<() => void> => {
        // If we're at the limit, wait in queue
        if (active >= concurrency) {
          await new Promise<void>(resolve => {
            waitingQueue.push(resolve);
          });
        }
        
        // Atomically increment active (we're guaranteed to be under limit here)
        active++;
        
        return () => {
          active--;
          // If there are waiting tasks and we're under the limit, wake one up
          if (waitingQueue.length > 0 && active < concurrency) {
            const next = waitingQueue.shift();
            if (next) {
              next();
            }
          }
        };
      }
    };

    // Retry wrapper for embedding generation
    const generateWithRetry = async (
      id: string,
      doc: ScrapedDocument,
      retriesLeft: number
    ): Promise<number[]> => {
      try {
        return await this.generateDocumentEmbedding(doc);
      } catch (error) {
        if (retriesLeft > 0) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return generateWithRetry(id, doc, retriesLeft - 1);
        }
        throw error;
      }
    };

    // Process a single document
    const processDocument = async ({ id, doc }: { id: string; doc: ScrapedDocument }) => {
      const release = await semaphore.acquire();
      
      try {
        const embedding = await generateWithRetry(id, doc, maxRetries);
        results.set(id, embedding);
        succeeded++;
        processed++;
        
        // Report progress every 10 documents or at completion
        if (progressCallback && (processed % 10 === 0 || processed === documents.length)) {
          progressCallback(processed, documents.length, failed);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.set(id, err);
        errors.push({ id, url: doc.url, error: err });
        failed++;
        processed++;
        
        // Log error but continue processing
        console.error(
          `[DocumentEmbeddingService] Failed to generate embedding for ${id} (${doc.url}):`,
          err.message
        );
        
        // Report progress even on errors
        if (progressCallback && (processed % 10 === 0 || processed === documents.length)) {
          progressCallback(processed, documents.length, failed);
        }
      } finally {
        release();
      }
    };

    // Process all documents concurrently
    const tasks = documents.map(doc => processDocument(doc));
    await Promise.all(tasks);

    // Log summary
    if (errors.length > 0) {
      console.warn(
        `[DocumentEmbeddingService] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${documents.length} total`
      );
    }

    return results;
  }

  /**
   * Store multiple document embeddings in batch with parallel processing
   * 
   * Processes documents in parallel, storing embeddings in both VectorService and MongoDB.
   * Provides progress tracking and robust error handling.
   * 
   * @param documents - Array of documents with IDs and embeddings
   * @param options - Configuration options
   * @returns Map of document ID to success status or error
   */
  async storeDocumentEmbeddingsBatch(
    documents: Array<{
      id: string;
      doc: ScrapedDocument;
      embedding: number[];
    }>,
    options: {
      concurrency?: number; // Default: 10
      progressCallback?: (current: number, total: number, succeeded: number, failed: number) => void;
    } = {}
  ): Promise<Map<string, { success: boolean; error?: Error }>> {
    const { concurrency = 10, progressCallback } = options;
    
    const results = new Map<string, { success: boolean; error?: Error }>();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let active = 0;
    
    // Semaphore for concurrency control
    const semaphore = {
      acquire: async (): Promise<() => void> => {
        while (active >= concurrency) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        active++;
        return () => {
          active--;
        };
      }
    };

    // Process a single document
    const processDocument = async ({ id, doc, embedding }: {
      id: string;
      doc: ScrapedDocument;
      embedding: number[];
    }) => {
      const release = await semaphore.acquire();
      
      try {
        const embeddingText = this.extractEmbeddingText(doc);
        const embeddingGeneratedAt = new Date();

        // Store in VectorService and MongoDB in parallel
        const [vectorResult, mongoResult] = await Promise.allSettled([
          // Store in VectorService for fast search
          this.vectorService.addDocumentWithEmbedding(id, embeddingText, embedding, {
            url: doc.url,
            titel: doc.titel,
            website_url: doc.website_url,
            website_titel: doc.website_titel,
            type_document: doc.type_document,
            publicatiedatum: doc.publicatiedatum,
            embeddingModel: this.EMBEDDING_MODEL,
            embeddingGeneratedAt
          }),
          // Store in MongoDB for persistence (canonical document)
          (async () => {
            const documentService = getCanonicalDocumentService();
            // Update enrichmentMetadata with embedding information
            await documentService.updateEnrichmentMetadata(
              id,
              {
                embedding,
                embeddingModel: this.EMBEDDING_MODEL,
                embeddingGeneratedAt: embeddingGeneratedAt.toISOString(),
              }
            );
          })()
        ]);

        // Check results
        if (vectorResult.status === 'rejected') {
          throw new Error(`VectorService storage failed: ${vectorResult.reason}`);
        }

        if (mongoResult.status === 'rejected') {
          console.warn(`[DocumentEmbeddingService] MongoDB storage failed for ${id}:`, mongoResult.reason);
          // Continue - VectorService storage succeeded
        }

        // Invalidate query cache periodically (every 50 documents)
        if (succeeded % 50 === 0) {
          queryCache.invalidateAll();
        }

        results.set(id, { success: true });
        succeeded++;
        processed++;
        
        // Report progress
        if (progressCallback && (processed % 10 === 0 || processed === documents.length)) {
          progressCallback(processed, documents.length, succeeded, failed);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.set(id, { success: false, error: err });
        failed++;
        processed++;
        
        console.error(`[DocumentEmbeddingService] Failed to store embedding for ${id} (${doc.url}):`, err.message);
        
        // Report progress even on errors
        if (progressCallback && (processed % 10 === 0 || processed === documents.length)) {
          progressCallback(processed, documents.length, succeeded, failed);
        }
      } finally {
        release();
      }
    };

    // Process all documents concurrently
    const tasks = documents.map(doc => processDocument(doc));
    await Promise.all(tasks);

    // Log summary
    if (failed > 0) {
      console.warn(
        `[DocumentEmbeddingService] Batch storage complete: ${succeeded} succeeded, ${failed} failed out of ${documents.length} total`
      );
    } else {
      console.log(
        `[DocumentEmbeddingService] Batch storage complete: ${succeeded} succeeded out of ${documents.length} total`
      );
    }

    return results;
  }

  /**
   * Migration helper: Update existing documents with embeddings
   * 
   * Processes documents in batches and generates embeddings for documents that don't have them.
   * Handles errors gracefully - continues processing even if individual documents fail.
   * 
   * @param options - Configuration options
   * @returns Migration statistics
   */
  async migrateDocumentsWithEmbeddings(options: {
    batchSize?: number; // Default: 100
    concurrency?: number; // Default: 10
    progressCallback?: (stats: {
      processed: number;
      succeeded: number;
      failed: number;
      remaining: number;
    }) => void;
  } = {}): Promise<{
    totalProcessed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ docId: string; url: string; error: string }>;
  }> {
    const { batchSize = 100, concurrency = 10, progressCallback } = options;
    const errors: Array<{ docId: string; url: string; error: string }> = [];
    let totalProcessed = 0;
    let succeeded = 0;
    let failed = 0;

    // Use canonical services to find documents without embeddings
    const chunkService = getCanonicalChunkService();
    const documentService = getCanonicalDocumentService();
    
      // Get count of documents without embeddings
      const totalRemaining = await chunkService.countDocumentsWithoutEmbeddings();
      let remaining = totalRemaining;

      console.log(`[DocumentEmbeddingService] Starting migration: ${totalRemaining} documents need embeddings`);

      // Process in batches
      while (remaining > 0) {
        // Get document IDs without embeddings
        const documentIds = await chunkService.findDocumentsWithoutEmbeddings(batchSize);
        
        if (documentIds.length === 0) {
          break; // No more documents to process
        }
        
        // Get canonical documents
        const canonicalDocs = await documentService.findByIds(documentIds);
        
        if (canonicalDocs.length === 0) {
          break; // No more documents to process
        }

        // Convert canonical documents to ScrapedDocument format for embedding generation
        // Note: This is a lightweight conversion - only extracts needed fields, no full legacy conversion
        const documentsToProcess = canonicalDocs.map(canonicalDoc => {
          // Extract summary from sourceMetadata or use first paragraph of fullText
          const summaryText = typeof canonicalDoc.sourceMetadata?.samenvatting === 'string'
            ? canonicalDoc.sourceMetadata.samenvatting
            : '';
          const samenvatting = summaryText || (canonicalDoc.fullText ? canonicalDoc.fullText.split('\n\n')[0].substring(0, 500) : '');
          
          // Get URL from canonical document
          const url = canonicalDoc.canonicalUrl || canonicalDoc.sourceId || '';
          const websiteUrl = typeof canonicalDoc.sourceMetadata?.legacyWebsiteUrl === 'string'
            ? canonicalDoc.sourceMetadata.legacyWebsiteUrl
            : url;
          const websiteTitel = typeof canonicalDoc.sourceMetadata?.legacyWebsiteTitel === 'string'
            ? canonicalDoc.sourceMetadata.legacyWebsiteTitel
            : undefined;
          
          return {
            id: canonicalDoc._id,
            doc: {
              titel: canonicalDoc.title,
              url,
              website_url: websiteUrl,
              website_titel: websiteTitel,
              samenvatting,
              type_document: canonicalDoc.documentType,
              publicatiedatum: canonicalDoc.dates?.publishedAt?.toISOString() || undefined
            } as ScrapedDocument
          };
        });

        // Count all documents as processed (including those that will fail embedding generation)
        totalProcessed += documentsToProcess.length;

        // Generate embeddings with concurrency control
        const embeddings = await this.generateEmbeddingsBatch(documentsToProcess, {
          concurrency,
          progressCallback: (_current, _total, _errors) => {
            // Progress callback for batch - can be used for detailed tracking
          }
        });

        // Prepare documents with embeddings for batch storage
        const documentsToStore: Array<{ id: string; doc: ScrapedDocument; embedding: number[] }> = [];
        for (const { id, doc } of documentsToProcess) {
          const result = embeddings.get(id);
          
          if (!result) {
            failed++;
            errors.push({
              docId: id,
              url: doc.url,
              error: 'Embedding generation failed - no result'
            });
            continue;
          }
          
          // Check if result is an Error
          if (result instanceof Error) {
            failed++;
            errors.push({
              docId: id,
              url: doc.url,
              error: result.message
            });
            continue;
          }

          documentsToStore.push({ id, doc, embedding: result });
        }

        // Store embeddings in batch (parallel processing)
        if (documentsToStore.length > 0) {
          // Capture starting state for progress reporting
          const batchStartProcessed = totalProcessed;
          const batchStartSucceeded = succeeded;
          const batchStartFailed = failed;

          const storageResults = await this.storeDocumentEmbeddingsBatch(documentsToStore, {
            concurrency,
            progressCallback: (_current, _total, storageSucceeded, storageFailed) => {
              // Report progress using temporary totals
              const currentTotalProcessed = batchStartProcessed;
              const currentSucceeded = batchStartSucceeded + storageSucceeded;
              const currentFailed = batchStartFailed + storageFailed;
              const currentRemaining = totalRemaining - currentTotalProcessed;

              // Report progress
              if (progressCallback) {
                progressCallback({
                  processed: currentTotalProcessed,
                  succeeded: currentSucceeded,
                  failed: currentFailed,
                  remaining: currentRemaining
                });
              }
            }
          });

          // Note: totalProcessed was already incremented for all documentsToProcess above

          for (const { id, doc } of documentsToStore) {
            const result = storageResults.get(id);
            if (result && !result.success) {
              failed++;
              errors.push({
                docId: id,
                url: doc.url,
                error: result.error?.message || 'Storage failed'
              });
            } else if (result && result.success) {
              succeeded++;
            }
          }
        }

        // Update remaining count (must be done regardless of whether documents were stored)
        remaining = totalRemaining - totalProcessed;

      // Log batch progress
      console.log(
        `[DocumentEmbeddingService] Batch complete: ${totalProcessed}/${totalRemaining} processed, ` +
        `${succeeded} succeeded, ${failed} failed, ${remaining} remaining`
      );
    }

    console.log(
      `[DocumentEmbeddingService] Migration complete: ${totalProcessed} processed, ` +
      `${succeeded} succeeded, ${failed} failed`
    );

    return {
      totalProcessed,
      succeeded,
      failed,
      errors
    };
  }

  /**
   * Process incremental updates for documents that need embedding updates
   * 
   * Efficiently processes only documents that:
   * - Don't have embeddings
   * - Have content changes (lastContentChange > embeddingGeneratedAt)
   * - Have been updated after embedding was generated
   * 
   * @param options - Configuration options
   * @returns Update statistics
   */
  async processIncrementalUpdates(options: {
    batchSize?: number; // Default: 100
    concurrency?: number; // Default: 10
    progressCallback?: (stats: {
      processed: number;
      succeeded: number;
      failed: number;
      remaining: number;
    }) => void;
  } = {}): Promise<{
    totalProcessed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ docId: string; url: string; error: string }>;
  }> {
    const { batchSize = 100, concurrency = 10, progressCallback } = options;
    const errors: Array<{ docId: string; url: string; error: string }> = [];
    let totalProcessed = 0;
    let succeeded = 0;
    let failed = 0;

    // Use canonical services to find documents needing embedding updates
    const chunkService = getCanonicalChunkService();
    const documentService = getCanonicalDocumentService();
    
    // Get count of documents needing updates
    const totalRemaining = await chunkService.countDocumentsNeedingEmbeddingUpdates();
    let remaining = totalRemaining;

    console.log(`[DocumentEmbeddingService] Starting incremental updates: ${totalRemaining} documents need embedding updates`);

    // Process in batches
    while (remaining > 0) {
      // Get document IDs needing updates
      const documentIds = await chunkService.findDocumentsNeedingEmbeddingUpdates(batchSize);
      
      if (documentIds.length === 0) {
        break; // No more documents to process
      }
      
      // Get canonical documents
      const canonicalDocs = await documentService.findByIds(documentIds);
      
      if (canonicalDocs.length === 0) {
        break; // No more documents to process
      }

      // Convert canonical documents to ScrapedDocument format for embedding generation
      // Note: This is a lightweight conversion - only extracts needed fields, no full legacy conversion
      const documentsToProcess = canonicalDocs.map(canonicalDoc => {
        // Extract summary from sourceMetadata or use first paragraph of fullText
        const summaryText = typeof canonicalDoc.sourceMetadata?.samenvatting === 'string'
          ? canonicalDoc.sourceMetadata.samenvatting
          : '';
        const samenvatting = summaryText || (canonicalDoc.fullText ? canonicalDoc.fullText.split('\n\n')[0].substring(0, 500) : '');
        
        // Get URL from canonical document
        const url = canonicalDoc.canonicalUrl || canonicalDoc.sourceId || '';
        const websiteUrl = typeof canonicalDoc.sourceMetadata?.legacyWebsiteUrl === 'string'
          ? canonicalDoc.sourceMetadata.legacyWebsiteUrl
          : url;
        const websiteTitel = typeof canonicalDoc.sourceMetadata?.legacyWebsiteTitel === 'string'
          ? canonicalDoc.sourceMetadata.legacyWebsiteTitel
          : undefined;
        
        return {
          id: canonicalDoc._id,
          doc: {
            titel: canonicalDoc.title,
            url,
            website_url: websiteUrl,
            website_titel: websiteTitel,
            samenvatting,
            type_document: canonicalDoc.documentType,
            publicatiedatum: canonicalDoc.dates?.publishedAt?.toISOString() || undefined
          } as ScrapedDocument
        };
      });

      // Generate embeddings with concurrency control
      const embeddings = await this.generateEmbeddingsBatch(documentsToProcess, {
        concurrency,
        progressCallback: (_current, _total, _errors) => {
          // Progress callback for batch - can be used for detailed tracking
        }
      });

      // Prepare documents with embeddings for batch storage
      const documentsToStore: Array<{ id: string; doc: ScrapedDocument; embedding: number[] }> = [];
      for (const { id, doc } of documentsToProcess) {
        const result = embeddings.get(id);
        
        if (!result) {
          failed++;
          errors.push({
            docId: id,
            url: doc.url,
            error: 'Embedding generation failed - no result'
          });
          continue;
        }
        
        // Check if result is an Error
        if (result instanceof Error) {
          failed++;
          errors.push({
            docId: id,
            url: doc.url,
            error: result.message
          });
          continue;
        }

        documentsToStore.push({ id, doc, embedding: result });
      }

      // Store embeddings in batch (parallel processing)
      if (documentsToStore.length > 0) {
        // Capture starting state for progress reporting
        const batchStartProcessed = totalProcessed;
        const batchStartSucceeded = succeeded;
        const batchStartFailed = failed;

        const storageResults = await this.storeDocumentEmbeddingsBatch(documentsToStore, {
          concurrency,
          progressCallback: (current, _total, storageSucceeded, storageFailed) => {
            // Report progress using temporary totals
            const currentTotalProcessed = batchStartProcessed + current;
            const currentSucceeded = batchStartSucceeded + storageSucceeded;
            const currentFailed = batchStartFailed + storageFailed;
            const currentRemaining = totalRemaining - currentTotalProcessed;

            // Report progress
            if (progressCallback) {
              progressCallback({
                processed: currentTotalProcessed,
                succeeded: currentSucceeded,
                failed: currentFailed,
                remaining: currentRemaining
              });
            }
          }
        });

        // Update globals based on results
        totalProcessed += documentsToStore.length;

        for (const { id, doc } of documentsToStore) {
          const result = storageResults.get(id);
          if (result && !result.success) {
            failed++;
            errors.push({
              docId: id,
              url: doc.url,
              error: result.error?.message || 'Storage failed'
            });
          } else if (result && result.success) {
            succeeded++;
          }
        }

        remaining = totalRemaining - totalProcessed;
      }

      // Log batch progress
      console.log(
        `[DocumentEmbeddingService] Incremental update batch complete: ${totalProcessed}/${totalRemaining} processed, ` +
        `${succeeded} succeeded, ${failed} failed, ${remaining} remaining`
      );
    }

    console.log(
      `[DocumentEmbeddingService] Incremental updates complete: ${totalProcessed} processed, ` +
      `${succeeded} succeeded, ${failed} failed`
    );

    return {
      totalProcessed,
      succeeded,
      failed,
      errors
    };
  }
}
