/**
 * Query Persistence Service
 * 
 * ✅ **MIGRATED** - This service now uses CanonicalDocumentService internally.
 * 
 * **Migration Status:**
 * - ✅ `persistDocuments()` now uses `CanonicalDocumentService.upsertBySourceId()`
 * - ✅ Documents are persisted to `canonical_documents` collection
 * - ✅ Maintains backward compatibility (same API, different implementation)
 * 
 * **Implementation Details:**
 * - DiscoveredDocument (metadata-only) is converted to CanonicalDocumentDraft
 * - Uses summary as fallback fullText for discovered documents
 * - Documents are flagged with `isMetadataOnly: true` in enrichmentMetadata
 * - Documents should be enriched later to acquire full content
 * 
 * **Note on fullText:**
 * DiscoveredDocument typically doesn't have fullText (metadata-only).
 * This service uses summary as fallback fullText. Documents should be enriched
 * later using adapters to acquire full content.
 * 
 * **Migration Reference:**
 * - WI-414: Backend Write Operations Migration
 * - See `docs/70-sprint-backlog/WI-414-backend-write-operations-migration.md`
 * 
 * @see WI-414: Backend Write Operations Migration
 */

import { Query } from '../../models/Query.js';
import { logger } from '../../utils/logger.js';
import type { QueryCreateInput } from '../../types/index.js';
import type { DiscoveredDocument } from '../external/DSOOntsluitenService.js';
import type { ClientSession } from 'mongodb';
import { getWorkflowTransactionService } from './WorkflowTransactionService.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { discoveredDocumentToCanonicalDraft } from './legacyToCanonicalConverter.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import type { CanonicalDocumentDraft, ServiceContext } from '../../contracts/types.js';

/**
 * Extract MongoDB session from workflow context if available
 * Session is stored in context as __transactionSession when step executes within transaction
 * 
 * @param context - Workflow context (params object)
 * @returns ClientSession if available, undefined otherwise
 */
export function getSessionFromContext(context: Record<string, unknown>): ClientSession | undefined {
  return context.__transactionSession as ClientSession | undefined;
}

export interface QueryCreationParams {
  onderwerp?: string;
  thema?: string;
  overheidsinstantie?: string;
  overheidslaag?: string;
  overheidstype?: string;
  websiteTypes?: string[];
  websiteUrls?: string[];
}

export interface DocumentPersistenceParams {
  queryId: string;
  documents: DiscoveredDocument[];
  source: string; // e.g., 'dso', 'iplo', 'officielebekendmakingen', etc.
  runId: string;
  workflowId?: string;
  stepId?: string;
}

/**
 * Service for creating Query documents and persisting workflow documents
 */
export class QueryPersistenceService {
  /**
   * Create a Query document from workflow parameters
   * 
   * @param params - Query creation parameters from workflow
   * @param runId - Workflow run ID for traceability
   * @param session - Optional MongoDB session for transaction support
   * @returns Query document ID (as string) or null if creation failed
   */
  async createQuery(params: QueryCreationParams, runId?: string, session?: ClientSession): Promise<string | null> {
    try {
      // Ensure onderwerp is provided (required field)
      if (!params.onderwerp || params.onderwerp.trim() === '') {
        logger.warn({ params, runId }, 'Cannot create Query: onderwerp is required');
        return null;
      }

      const queryInput: QueryCreateInput = {
        onderwerp: params.onderwerp.trim(),
        overheidstype: params.overheidstype || params.overheidslaag || undefined,
        overheidsinstantie: params.overheidsinstantie || undefined,
        websiteTypes: params.websiteTypes || [],
        websiteUrls: params.websiteUrls || [],
      };

      const query = await Query.create(queryInput, session);
      const queryId = query._id?.toString() || null;

      if (queryId) {
        logger.info({ queryId, runId, onderwerp: params.onderwerp }, 'Created Query document for workflow');
      }

      return queryId;
    } catch (error) {
      logger.error({ error, params, runId }, 'Failed to create Query document');
      return null;
    }
  }

  /**
   * Get or create a Query document
   * If queryId is provided and exists, return it. Otherwise, create a new Query.
   * 
   * @param queryId - Existing query ID (optional)
   * @param params - Query creation parameters (used if queryId not provided or invalid)
   * @param runId - Workflow run ID for traceability
   * @param session - Optional MongoDB session for transaction support
   * @returns Query document ID (as string) or null if creation failed
   */
  async getOrCreateQuery(
    queryId: string | undefined,
    params: QueryCreationParams,
    runId?: string,
    session?: ClientSession
  ): Promise<string | null> {
    // If queryId provided, verify it exists
    if (queryId) {
      try {
        const existingQuery = await Query.findById(queryId);
        if (existingQuery) {
          logger.debug({ queryId, runId }, 'Using existing Query document');
          return queryId;
        } else {
          logger.warn({ queryId, runId }, 'Provided queryId not found, creating new Query');
        }
      } catch (error) {
        logger.warn({ error, queryId, runId }, 'Error checking existing Query, creating new one');
      }
    }

    // Create new Query if queryId not provided or invalid
    return this.createQuery(params, runId, session);
  }

  /**
   * Extract URL from document (handles legacy formats)
   */
  private extractUrl(doc: DiscoveredDocument | { url?: string; website_url?: string }): string | undefined {
    if ('url' in doc && doc.url) {
      return doc.url;
    }
    if ('website_url' in doc && doc.website_url) {
      return doc.website_url;
    }
    return undefined;
  }

  /**
   * Deduplicate documents by URL
   * 
   * @param documents - Array of documents to deduplicate
   * @returns Deduplicated array (first occurrence of each URL is kept)
   */
  deduplicateDocuments(documents: DiscoveredDocument[]): DiscoveredDocument[] {
    const seenUrls = new Set<string>();
    const deduplicated: DiscoveredDocument[] = [];

    for (const doc of documents) {
      const url = this.extractUrl(doc);
      if (url) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          deduplicated.push(doc);
        }
      } else {
        // Keep documents without URL (assuming unique if no URL is present)
        deduplicated.push(doc);
      }
    }

    if (documents.length !== deduplicated.length) {
      logger.debug(
        { originalCount: documents.length, deduplicatedCount: deduplicated.length },
        'Deduplicated documents by URL'
      );
    }

    return deduplicated;
  }

  /**
   * Convert DiscoveredDocument to CanonicalDocumentDraft
   * 
   * Handles the case where DiscoveredDocument doesn't have fullText (metadata-only).
   * Uses summary as fallback fullText for discovered documents.
   * 
   * @param discovered - Discovered document (may be metadata-only)
   * @param params - Persistence parameters (for queryId, runId, etc.)
   * @returns Canonical document draft
   */
  private convertDiscoveredToCanonicalDraft(
    discovered: DiscoveredDocument,
    params: DocumentPersistenceParams
  ): CanonicalDocumentDraft {
    // DiscoveredDocument typically doesn't have fullText - use summary as fallback
    // This is a known limitation: discovered documents are metadata-only until enriched
    const fullText = discovered.summary || discovered.title || 'No content available';
    
    // Use existing converter (it requires fullText, which we provide from summary)
    const draft = discoveredDocumentToCanonicalDraft(discovered, fullText, params.runId);
    
    // Add workflow metadata to enrichmentMetadata
    const enrichmentMetadata = {
      ...draft.enrichmentMetadata,
      queryId: params.queryId,
      workflowRunId: params.runId,
      workflowId: params.workflowId,
      stepId: params.stepId,
      source: params.source,
      discoveredAt: new Date().toISOString(),
      // Flag to indicate this is a metadata-only document (needs enrichment)
      isMetadataOnly: !discovered.summary || discovered.summary.trim().length === 0,
    };
    
    return {
      ...draft,
      enrichmentMetadata,
    };
  }

  /**
   * Persist discovered documents to canonical_documents collection
   * 
   * **Migration:** This method now uses CanonicalDocumentService instead of BronDocument.
   * Documents are persisted as canonical documents with proper structure.
   * 
   * **Note:** DiscoveredDocument typically doesn't have fullText (metadata-only).
   * This method uses summary as fallback fullText. Documents should be enriched
   * later to acquire full content.
   * 
   * @param params - Document persistence parameters
   * @param session - Optional MongoDB session for transaction support
   * @returns Number of documents persisted
   */
  async persistDocuments(params: DocumentPersistenceParams, session?: ClientSession): Promise<number> {
    try {
      if (!params.documents || params.documents.length === 0) {
        logger.debug({ queryId: params.queryId, source: params.source, runId: params.runId }, 'No documents to persist');
        return 0;
      }

      // Deduplicate documents before persistence
      const deduplicated = this.deduplicateDocuments(params.documents);

      // Convert DiscoveredDocument to CanonicalDocumentDraft
      const canonicalDrafts: CanonicalDocumentDraft[] = deduplicated.map(doc => 
        this.convertDiscoveredToCanonicalDraft(doc, params)
      );

      // Persist documents using CanonicalDocumentService
      const canonicalService = getCanonicalDocumentService();
      const serviceContext: ServiceContext = session ? { session } : {};
      
      let persistedCount = 0;
      const errors: Array<{ url: string; error: unknown }> = [];

      // Persist each document (upsert by sourceId for idempotency)
      for (const draft of canonicalDrafts) {
        try {
          await canonicalService.upsertBySourceId(draft, serviceContext);
          persistedCount++;
        } catch (error) {
          const url = draft.canonicalUrl || draft.sourceId;
          logger.warn(
            { error, url, source: draft.source, sourceId: draft.sourceId, queryId: params.queryId },
            'Failed to persist document to canonical_documents collection'
          );
          errors.push({ url: url || 'unknown', error });
        }
      }

      if (errors.length > 0) {
        logger.warn(
          {
            queryId: params.queryId,
            source: params.source,
            runId: params.runId,
            errorCount: errors.length,
            successCount: persistedCount,
            totalCount: canonicalDrafts.length,
          },
          'Some documents failed to persist to canonical_documents collection'
        );
      }

      logger.info(
        {
          queryId: params.queryId,
          source: params.source,
          runId: params.runId,
          persistedCount,
          originalCount: params.documents.length,
          deduplicatedCount: deduplicated.length,
        },
        'Persisted documents to canonical_documents collection'
      );

      return persistedCount;
    } catch (error) {
      logger.error(
        { error, queryId: params.queryId, source: params.source, runId: params.runId },
        'Failed to persist documents to canonical_documents collection'
      );
      return 0;
    }
  }

  /**
   * Create Query and persist documents in one operation
   * Optionally uses MongoDB transactions for atomicity
   * 
   * @param queryParams - Query creation parameters
   * @param documents - Documents to persist
   * @param source - Document source identifier
   * @param runId - Workflow run ID
   * @param queryId - Optional existing query ID (if provided, reuse it)
   * @param useTransaction - Whether to use MongoDB transaction (default: false, checks transaction support)
   * @returns Object with queryId and persistedCount
   */
  async createQueryAndPersistDocuments(
    queryParams: QueryCreationParams,
    documents: DiscoveredDocument[],
    source: string,
    runId: string,
    queryId?: string,
    useTransaction: boolean = false
  ): Promise<{ queryId: string | null; persistedCount: number }> {
    // Check if transaction should be used
    const transactionService = getWorkflowTransactionService();
    const shouldUseTransaction = useTransaction && await transactionService.isTransactionSupported();

    if (shouldUseTransaction) {
      // Execute in transaction
      const result = await transactionService.executeInTransaction(async (session) => {
        // Get or create Query within transaction
        const finalQueryId = await this.getOrCreateQuery(queryId, queryParams, runId, session);

        if (!finalQueryId) {
          logger.warn({ runId, source }, 'Could not create Query, skipping document persistence');
          return { queryId: null, persistedCount: 0 };
        }

        // Persist documents within transaction
        const persistedCount = await this.persistDocuments({
          queryId: finalQueryId,
          documents,
          source,
          runId,
        }, session);

        return { queryId: finalQueryId, persistedCount };
      });

      if (!result.success) {
        logger.error(
          { error: result.error, runId, source },
          'Transaction failed for createQueryAndPersistDocuments'
        );
        throw result.error || new Error('Transaction failed');
      }

      return result.result || { queryId: null, persistedCount: 0 };
    } else {
      // Execute without transaction (backward compatible)
      // Get or create Query
      const finalQueryId = await this.getOrCreateQuery(queryId, queryParams, runId);

      if (!finalQueryId) {
        logger.warn({ runId, source }, 'Could not create Query, skipping document persistence');
        return { queryId: null, persistedCount: 0 };
      }

      // Persist documents
      const persistedCount = await this.persistDocuments({
        queryId: finalQueryId,
        documents,
        source,
        runId,
      });

      return { queryId: finalQueryId, persistedCount };
    }
  }
}

// Singleton instance
let queryPersistenceService: QueryPersistenceService | null = null;

/**
 * Get the singleton QueryPersistenceService instance
 */
export function getQueryPersistenceService(): QueryPersistenceService {
  if (!queryPersistenceService) {
    queryPersistenceService = new QueryPersistenceService();
  }
  return queryPersistenceService;
}

