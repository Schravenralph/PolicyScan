/**
 * CanonicalDocumentService
 * 
 * Service for persisting and retrieving canonical documents with idempotent upserts.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */

import { getDB } from '../../config/database.js';
import { ObjectId, MongoBulkWriteError, type ClientSession, type Filter, type UpdateFilter, type FindOneAndUpdateOptions } from 'mongodb';
import { logger } from '../../utils/logger.js';
import { escapeRegex } from '../../utils/regexUtils.js';
import { ensureCanonicalIndexes } from '../../db/migrations/ensureCanonicalIndexes.js';
import type {
  CanonicalDocumentDraft,
  CanonicalDocument,
  ServiceContext,
  DocumentFilters,
  PagingParams,
  DocumentSource,
  DocumentReviewStatus,
  DocumentReviewMetadata,
  ExtensionType,
  ArtifactRef,
  DocumentFormat,
} from '../../contracts/types.js';
import { validateCanonicalDocumentDraft } from '../../validation/canonicalSchemas.js';
import { getCanonicalDocumentMonitoringService } from '../monitoring/CanonicalDocumentMonitoringService.js';
import { BadRequestError, ServiceUnavailableError } from '../../types/errors.js';
import { buildDsoPublicUrlFromDocument, extractIdentificatie } from '../../utils/dsoUrlBuilder.js';
import { isApiEndpoint, isOldUrlFormat, isBaseDomainOnly, normalizeDsoUrl } from '../../utils/urlNormalizer.js';
import { GeoExtensionService } from '../extensions/GeoExtensionService.js';
import { LegalExtensionService } from '../extensions/LegalExtensionService.js';
import { WebExtensionService } from '../extensions/WebExtensionService.js';
import { FileSystemArtifactStore } from '../../artifacts/FileSystemArtifactStore.js';
import JSZip from 'jszip';
import type { BundleFileEntry } from '../../contracts/types.js';
import { ExtensionModel } from '../../models/ExtensionModel.js';

const COLLECTION_NAME = 'canonical_documents';
const SCHEMA_VERSION = 'v2.0';

/**
 * CanonicalDocumentService implementation
 */
export class CanonicalDocumentService {
  private monitoringService = getCanonicalDocumentMonitoringService();
  private artifactStore = new FileSystemArtifactStore();
  /**
   * Upsert document by (source, sourceId) - idempotent
   * 
   * If document exists with same (source, sourceId), updates it.
   * If fingerprint changed, it currently updates the document (latest version wins).
   * Note: Unique index on (source, sourceId) prevents creating multiple versions as separate documents.
   * 
   * @param draft - Document draft to upsert
   * @param ctx - Service context (may include session for transactions)
   * @returns Persisted canonical document
   */
  async upsertBySourceId(
    draft: CanonicalDocumentDraft,
    ctx: ServiceContext
  ): Promise<CanonicalDocument> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      // Validate draft
      validateCanonicalDocumentDraft(draft);
      
      // Enforce fullText requirement
      if (!draft.fullText || draft.fullText.trim().length === 0) {
        throw new BadRequestError('fullText is required and must not be empty', {
          reason: 'missing_full_text',
          operation: 'upsertCanonicalDocument',
          documentId: (draft as any)._id?.toString()
        });
      }
      
      // Validate and normalize canonicalUrl for DSO documents
      let normalizedCanonicalUrl = draft.canonicalUrl;
      if (draft.source === 'DSO') {
        // Check if canonicalUrl is an API endpoint, in old format, or only base domain
        if (draft.canonicalUrl && (isApiEndpoint(draft.canonicalUrl) || isOldUrlFormat(draft.canonicalUrl) || isBaseDomainOnly(draft.canonicalUrl))) {
          logger.warn(
            {
              source: draft.source,
              sourceId: draft.sourceId,
              canonicalUrl: draft.canonicalUrl,
              operation: 'upsertBySourceId',
            },
            'DSO document has API endpoint, old format, or base-domain-only URL, auto-converting'
          );
          // Normalize the URL
          normalizedCanonicalUrl = normalizeDsoUrl(draft.canonicalUrl, draft) || undefined;
        }
        
        // If canonicalUrl is missing but sourceId exists, construct from sourceId
        if (!normalizedCanonicalUrl && draft.sourceId) {
          const builtUrl = buildDsoPublicUrlFromDocument(draft);
          if (builtUrl) {
            normalizedCanonicalUrl = builtUrl;
            logger.debug(
              {
                source: draft.source,
                sourceId: draft.sourceId,
                constructedUrl: normalizedCanonicalUrl,
                operation: 'upsertBySourceId',
              },
              'Constructed canonicalUrl from sourceId for DSO document'
            );
          } else {
            logger.warn(
              {
                source: draft.source,
                sourceId: draft.sourceId,
                operation: 'upsertBySourceId',
              },
              'Could not construct canonicalUrl from sourceId for DSO document'
            );
          }
        }
      }
      
      const db = getDB();
      const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
      const session = ctx.session as ClientSession | undefined;

      const now = new Date();

      // Build filter for (source, sourceId)
      const filter: Filter<CanonicalDocument> = {
        source: draft.source,
        sourceId: draft.sourceId,
      };

      // Use atomic findOneAndUpdate with upsert=true
      // This handles both insert and update scenarios atomically, avoiding race conditions
      // and duplicate key errors on the unique index (source, sourceId).
      const update: UpdateFilter<CanonicalDocument> = {
        $set: {
          source: draft.source,
          sourceId: draft.sourceId,
          title: draft.title,
          canonicalUrl: normalizedCanonicalUrl,
          publisherAuthority: draft.publisherAuthority,
          documentFamily: draft.documentFamily,
          documentType: draft.documentType,
          dates: draft.dates,
          fullText: draft.fullText,
          contentFingerprint: draft.contentFingerprint,
          language: draft.language,
          artifactRefs: draft.artifactRefs,
          ...(draft.httpStatus !== undefined && { httpStatus: draft.httpStatus }),
          sourceMetadata: draft.sourceMetadata,
          // enrichmentMetadata is handled separately to allow merging
          // Format information
          ...(draft.documentStructure !== undefined && { documentStructure: draft.documentStructure }),
          ...(draft.format !== undefined && { format: draft.format }),
          ...(draft.formatComposition !== undefined && { formatComposition: draft.formatComposition }),
          // Versioning
          ...(draft.versionOf !== undefined && { versionOf: draft.versionOf }),
          // Review status - only set if explicitly provided (to allow updates without changing status)
          ...(draft.reviewStatus !== undefined && { reviewStatus: draft.reviewStatus }),
          ...(draft.reviewMetadata !== undefined && { reviewMetadata: draft.reviewMetadata }),
          // Tags and collections
          ...(draft.tags !== undefined && { tags: draft.tags }),
          ...(draft.collectionIds !== undefined && { collectionIds: draft.collectionIds }),
          updatedAt: now,
          schemaVersion: SCHEMA_VERSION,
        },
        $setOnInsert: {
          createdAt: now,
          _id: new ObjectId() as unknown as string, // Ensure new ID on insert (MongoDB accepts ObjectId)
          // Default reviewStatus to 'pending_review' on insert if not provided
          ...(draft.reviewStatus === undefined && { reviewStatus: 'pending_review' as DocumentReviewStatus }),
        }
      };

      // Merge enrichmentMetadata fields individually to preserve existing data
      if (draft.enrichmentMetadata) {
        const setOp = update.$set as Record<string, unknown>;
        for (const [key, value] of Object.entries(draft.enrichmentMetadata)) {
          if (value !== undefined) {
            setOp[`enrichmentMetadata.${key}`] = value;
          }
        }
      }

      const options: FindOneAndUpdateOptions = {
        upsert: true,
        returnDocument: 'after' // Return the modified document
      };

      if (session) {
        options.session = session;
      }

      // Monitor queryId linkage before persisting
      const hasQueryId = !!draft.enrichmentMetadata?.queryId;
      const hasWorkflowRunId = !!draft.enrichmentMetadata?.workflowRunId;
      const workflowRunId = draft.enrichmentMetadata?.workflowRunId as string | undefined;
      
      // Log warning if document is persisted without queryId but has workflowRunId
      // This indicates a potential linkage issue
      if (!hasQueryId && hasWorkflowRunId && workflowRunId) {
        logger.warn(
          {
            source: draft.source,
            sourceId: draft.sourceId,
            workflowRunId,
            operation: 'upsertBySourceId',
          },
          'Document persisted without queryId but has workflowRunId - potential linkage issue'
        );
      }

      const result = await collection.findOneAndUpdate(filter, update, options);

      if (!result) {
        // Should not happen with upsert: true and returnDocument: 'after'
        throw new ServiceUnavailableError('Failed to upsert canonical document', {
          reason: 'upsert_failed',
          operation: 'upsertCanonicalDocument',
          documentId: (draft as any)._id?.toString()
        });
      }

      if (process.env.DEBUG_CANONICAL_SERVICE === 'true') {
        logger.info(
          {
            source: draft.source,
            sourceId: draft.sourceId,
            queryId: draft.enrichmentMetadata?.queryId,
            workflowRunId: draft.enrichmentMetadata?.workflowRunId,
            isNew: result.createdAt.getTime() === result.updatedAt.getTime(),
          },
          'Upserted canonical document'
        );
      }

      const canonicalDoc = this.mapToCanonicalDocument(result);
      const responseTime = Date.now() - startTime;

      // Determine if it was an insert or update based on createdAt vs updatedAt
      // (Approximate check, reliable enough for metrics)
      const isNewDocument = result.createdAt.getTime() === result.updatedAt.getTime();

      // Record monitoring metric with queryId linkage tracking
      await this.monitoringService.recordOperation({
        operation: 'upsert',
        source: draft.source,
        responseTimeMs: responseTime,
        success: true,
        documentCount: 1,
        queryComplexity: 'simple',
        metadata: {
          method: 'upsertBySourceId',
          isNewDocument,
          fingerprintChanged: false, // We don't track this in atomic upsert easily
          hasQueryId,
          hasWorkflowRunId,
          queryIdLinkageIssue: !hasQueryId && hasWorkflowRunId, // Flag linkage issues
          ...(workflowRunId ? { workflowRunId } : {}),
          ...(draft.enrichmentMetadata?.queryId ? { queryId: draft.enrichmentMetadata.queryId } : {}),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document operation metric');
      });

      return canonicalDoc;
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'upsert',
        source: draft.source,
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          method: 'upsertBySourceId',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      throw error;
    }
  }
  
  /**
   * Upsert document by contentFingerprint - used when sourceId is absent/unstable
   * 
   * @param draft - Document draft to upsert
   * @param ctx - Service context (may include session for transactions)
   * @returns Persisted canonical document
   */
  async upsertByFingerprint(
    draft: CanonicalDocumentDraft,
    ctx: ServiceContext
  ): Promise<CanonicalDocument> {
    // Validate draft
    validateCanonicalDocumentDraft(draft);
    
    // Enforce fullText requirement
    if (!draft.fullText || draft.fullText.trim().length === 0) {
      throw new BadRequestError('fullText is required and must not be empty', {
        reason: 'missing_full_text',
        operation: 'upsertCanonicalDocumentWithSession',
        documentId: (draft as any)._id?.toString()
      });
    }
    
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    const session = ctx.session as ClientSession | undefined;
    
    const now = new Date();
    
    // Build filter for contentFingerprint
    const filter: Filter<CanonicalDocument> = {
      contentFingerprint: draft.contentFingerprint,
    };
    
    // Use atomic findOneAndUpdate with upsert=true
    const update: UpdateFilter<CanonicalDocument> = {
      $set: {
        source: draft.source,
        sourceId: draft.sourceId,
        title: draft.title,
        canonicalUrl: draft.canonicalUrl,
        publisherAuthority: draft.publisherAuthority,
        documentFamily: draft.documentFamily,
        documentType: draft.documentType,
        dates: draft.dates,
        fullText: draft.fullText,
        language: draft.language,
        artifactRefs: draft.artifactRefs,
        ...(draft.httpStatus !== undefined && { httpStatus: draft.httpStatus }),
        sourceMetadata: draft.sourceMetadata,
          // enrichmentMetadata is handled separately to allow merging
        // Format information
        ...(draft.documentStructure !== undefined && { documentStructure: draft.documentStructure }),
        ...(draft.format !== undefined && { format: draft.format }),
        ...(draft.formatComposition !== undefined && { formatComposition: draft.formatComposition }),
        // Versioning
        versionOf: draft.versionOf,
        // Review status - only set if explicitly provided
        ...(draft.reviewStatus !== undefined && { reviewStatus: draft.reviewStatus }),
        ...(draft.reviewMetadata !== undefined && { reviewMetadata: draft.reviewMetadata }),
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION,
      },
      $setOnInsert: {
        createdAt: now,
        _id: new ObjectId() as unknown as string, // MongoDB accepts ObjectId
        // Default reviewStatus to 'pending_review' on insert if not provided
        ...(draft.reviewStatus === undefined && { reviewStatus: 'pending_review' as DocumentReviewStatus }),
      }
    };
    
    // Merge enrichmentMetadata fields individually to preserve existing data
    if (draft.enrichmentMetadata) {
      const setOp = update.$set as Record<string, unknown>;
      for (const [key, value] of Object.entries(draft.enrichmentMetadata)) {
        if (value !== undefined) {
          setOp[`enrichmentMetadata.${key}`] = value;
        }
      }
    }

    const options: FindOneAndUpdateOptions = {
      upsert: true,
      returnDocument: 'after'
    };
    
    if (session) {
      options.session = session;
    }
    
    const result = await collection.findOneAndUpdate(filter, update, options);

    if (!result) {
      throw new ServiceUnavailableError('Failed to upsert canonical document', {
        reason: 'upsert_failed',
        operation: 'upsertCanonicalDocumentWithSession',
        documentId: (draft as any)._id?.toString()
      });
    }

    return this.mapToCanonicalDocument(result);
  }
  
  /**
   * Find document by ID
   * 
   * @param id - Document ID (MongoDB ObjectId as string)
   * @returns Canonical document or null if not found
   */
  async findById(id: string): Promise<CanonicalDocument | null> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      const db = getDB();
      const collection = db.collection(COLLECTION_NAME);
      
      if (!ObjectId.isValid(id)) {
        const responseTime = Date.now() - startTime;
        await this.monitoringService.recordOperation({
          operation: 'findById',
          responseTimeMs: responseTime,
          success: true,
          documentCount: 0,
          queryComplexity: 'simple',
          metadata: { invalidId: true },
        }).catch(() => {});
        return null;
      }
      
      const document = await collection.findOne({ _id: new ObjectId(id) });
      
      const responseTime = Date.now() - startTime;
      const documentCount = document ? 1 : 0;

      // Record monitoring metric
      await this.monitoringService.recordOperation({
        operation: 'findById',
        responseTimeMs: responseTime,
        success: true,
        documentCount,
        queryComplexity: 'simple',
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document operation metric');
      });

      if (!document) {
        return null;
      }
      
      return this.mapToCanonicalDocument(document);
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'findById',
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      // If any error occurs (e.g., mapping error), return null to trigger 404
      logger.warn({ error, id }, 'Error in findById, returning null');
      return null;
    }
  }

  /**
   * Get document with extensions (convenience API per ADR CAN-002)
   * 
   * Loads a canonical document and all requested extension types (or all if not specified).
   * Returns the document with extensions as a typed object.
   * 
   * @param documentId - Document ID
   * @param extensionTypes - Optional array of extension types to load. If not provided, loads all available extensions.
   * @param ctx - Optional service context (for transaction support)
   * @returns Document with extensions, or null if document not found
   * 
   * @example
   * ```typescript
   * // Load document with all extensions
   * const doc = await service.getDocumentWithExtensions('507f1f77bcf86cd799439011');
   * 
   * // Load document with specific extensions
   * const doc = await service.getDocumentWithExtensions('507f1f77bcf86cd799439011', ['geo', 'legal']);
   * ```
   * 
   * @see docs/06-adr/CAN-002-domain-metadata-extension-sidecars.md
   */
  async getDocumentWithExtensions(
    documentId: string,
    extensionTypes?: ExtensionType[],
    ctx?: ServiceContext
  ): Promise<(CanonicalDocument & { extensions: Partial<Record<ExtensionType, unknown>> }) | null> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      // Load the document
      const document = await this.findById(documentId);
      if (!document) {
        return null;
      }

      // Determine which extension types to load
      const typesToLoad: ExtensionType[] = extensionTypes || ['geo', 'legal', 'web'];
      
      // Initialize extension services
      const geoService = new GeoExtensionService();
      const legalService = new LegalExtensionService();
      const webService = new WebExtensionService();

      // Load extensions in parallel
      const extensionPromises: Array<Promise<[ExtensionType, unknown | null]>> = [];

      if (typesToLoad.includes('geo')) {
        extensionPromises.push(
          geoService.get(documentId, ctx).then(payload => ['geo', payload] as [ExtensionType, unknown | null])
        );
      }

      if (typesToLoad.includes('legal')) {
        extensionPromises.push(
          legalService.get(documentId, ctx).then(payload => ['legal', payload] as [ExtensionType, unknown | null])
        );
      }

      if (typesToLoad.includes('web')) {
        extensionPromises.push(
          webService.get(documentId, ctx).then(payload => ['web', payload] as [ExtensionType, unknown | null])
        );
      }

      // Wait for all extensions to load
      const extensionResults = await Promise.all(extensionPromises);

      // Build extensions object (only include non-null extensions)
      const extensions: Partial<Record<ExtensionType, unknown>> = {};
      for (const [type, payload] of extensionResults) {
        if (payload !== null) {
          extensions[type] = payload;
        }
      }

      const responseTime = Date.now() - startTime;

      // Record monitoring metric
      await this.monitoringService.recordOperation({
        operation: 'findById',
        responseTimeMs: responseTime,
        success: true,
        documentCount: 1,
        queryComplexity: 'complex',
        metadata: {
          extensionTypesLoaded: Object.keys(extensions),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document operation metric');
      });

      return {
        ...document,
        extensions,
      };
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'findById',
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      logger.error({ error, documentId, extensionTypes }, 'Error in getDocumentWithExtensions');
      throw error;
    }
  }

  /**
   * Get multiple documents with extensions (batch loading)
   * 
   * Loads multiple canonical documents and their extensions efficiently.
   * 
   * @param documentIds - Array of document IDs
   * @param extensionTypes - Optional array of extension types to load. If not provided, loads all available extensions.
   * @param ctx - Optional service context (for transaction support)
   * @returns Array of documents with extensions (null entries for documents not found)
   * 
   * @example
   * ```typescript
   * const docs = await service.getDocumentsWithExtensions(
   *   ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
   *   ['geo', 'legal']
   * );
   * ```
   */
  async getDocumentsWithExtensions(
    documentIds: string[],
    extensionTypes?: ExtensionType[],
    ctx?: ServiceContext
  ): Promise<Array<(CanonicalDocument & { extensions: Partial<Record<ExtensionType, unknown>> }) | null>> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      // Load all documents in parallel
      const documentPromises = documentIds.map(id => this.findById(id));
      const documents = await Promise.all(documentPromises);

      // Determine which extension types to load
      const typesToLoad: ExtensionType[] = extensionTypes || ['geo', 'legal', 'web'];
      
      // Get valid document IDs (filter out null documents)
      const validDocumentIds = documents
        .filter(doc => doc !== null)
        .map(doc => doc!._id);

      if (validDocumentIds.length === 0) {
        return documents.map(() => null);
      }

      // Initialize extension services for payload extraction and migration
      const geoService = new GeoExtensionService();
      const legalService = new LegalExtensionService();
      const webService = new WebExtensionService();

      // Batch load all extensions for all documents (optimized: one query per type instead of N*3 queries)
      const extensionsByDocId = new Map<string, Partial<Record<ExtensionType, unknown>>>();
      
      // Initialize map with empty objects for all documents
      for (const docId of validDocumentIds) {
        extensionsByDocId.set(docId, {});
      }

      // Load extensions by type in parallel (one query per type, not per document)
      // This reduces queries from N*types to just types queries
      // Use Promise.allSettled for resilience: if one extension type fails, continue with others
      const extensionLoadPromises: Array<Promise<void>> = [];

      if (typesToLoad.includes('geo')) {
        extensionLoadPromises.push(
          ExtensionModel.findByDocumentIdsAndType(validDocumentIds, 'geo', ctx?.session as any)
            .then(async (geoExtensions) => {
              // Process each extension through service for migration if needed (without re-querying)
              for (const [docId, extDoc] of geoExtensions.entries()) {
                if (extDoc) {
                  try {
                    const payload = await geoService.processExtensionDocument(extDoc, ctx);
                    if (payload !== null) {
                      const extensions = extensionsByDocId.get(docId)!;
                      extensions.geo = payload;
                    }
                  } catch (error) {
                    // Log error but continue processing other extensions
                    logger.warn(
                      { error, documentId: docId, extensionType: 'geo' },
                      'Failed to process geo extension, continuing with other extensions'
                    );
                  }
                }
              }
            })
            .catch((error) => {
              // Log error but don't fail entire batch
              logger.warn(
                { error, extensionType: 'geo' },
                'Failed to load geo extensions, continuing with other extension types'
              );
            })
        );
      }

      if (typesToLoad.includes('legal')) {
        extensionLoadPromises.push(
          ExtensionModel.findByDocumentIdsAndType(validDocumentIds, 'legal', ctx?.session as any)
            .then(async (legalExtensions) => {
              for (const [docId, extDoc] of legalExtensions.entries()) {
                if (extDoc) {
                  try {
                    const payload = await legalService.processExtensionDocument(extDoc, ctx);
                    if (payload !== null) {
                      const extensions = extensionsByDocId.get(docId)!;
                      extensions.legal = payload;
                    }
                  } catch (error) {
                    // Log error but continue processing other extensions
                    logger.warn(
                      { error, documentId: docId, extensionType: 'legal' },
                      'Failed to process legal extension, continuing with other extensions'
                    );
                  }
                }
              }
            })
            .catch((error) => {
              // Log error but don't fail entire batch
              logger.warn(
                { error, extensionType: 'legal' },
                'Failed to load legal extensions, continuing with other extension types'
              );
            })
        );
      }

      if (typesToLoad.includes('web')) {
        extensionLoadPromises.push(
          ExtensionModel.findByDocumentIdsAndType(validDocumentIds, 'web', ctx?.session as any)
            .then(async (webExtensions) => {
              for (const [docId, extDoc] of webExtensions.entries()) {
                if (extDoc) {
                  try {
                    const payload = await webService.processExtensionDocument(extDoc, ctx);
                    if (payload !== null) {
                      const extensions = extensionsByDocId.get(docId)!;
                      extensions.web = payload;
                    }
                  } catch (error) {
                    // Log error but continue processing other extensions
                    logger.warn(
                      { error, documentId: docId, extensionType: 'web' },
                      'Failed to process web extension, continuing with other extensions'
                    );
                  }
                }
              }
            })
            .catch((error) => {
              // Log error but don't fail entire batch
              logger.warn(
                { error, extensionType: 'web' },
                'Failed to load web extensions, continuing with other extension types'
              );
            })
        );
      }

      // Wait for all extension types to load (using allSettled for resilience)
      // This ensures we get partial results even if some extension types fail
      await Promise.allSettled(extensionLoadPromises);

      // Combine documents with extensions
      const results = documents.map(document => {
        if (!document) {
          return null;
        }
        return {
          ...document,
          extensions: extensionsByDocId.get(document._id) || {},
        };
      });

      const responseTime = Date.now() - startTime;

      // Record monitoring metric
      await this.monitoringService.recordOperation({
        operation: 'findByIds',
        responseTimeMs: responseTime,
        success: true,
        documentCount: results.filter(r => r !== null).length,
        queryComplexity: 'complex',
        metadata: {
          extensionTypesLoaded: typesToLoad,
          batchSize: documentIds.length,
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document operation metric');
      });

      return results;
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'findByIds',
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      logger.error({ error, documentIds, extensionTypes }, 'Error in getDocumentsWithExtensions');
      throw error;
    }
  }

  /**
   * Delete document by ID
   * 
   * @param id - Document ID (MongoDB ObjectId as string)
   * @param ctx - Service context (may include session for transactions)
   * @returns true if document was deleted, false if not found
   */
  async deleteById(id: string, ctx: ServiceContext = {}): Promise<boolean> {
    try {
      const db = getDB();
      const collection = db.collection(COLLECTION_NAME);
      const session = ctx.session as ClientSession | undefined;
      
      if (!ObjectId.isValid(id)) {
        return false;
      }
      
      const filter = { _id: new ObjectId(id) };
      
      let result;
      if (session) {
        result = await collection.deleteOne(
          filter,
          { session }
        );
      } else {
        result = await collection.deleteOne(filter);
      }
      
      return result.deletedCount > 0;
    } catch (error) {
      logger.warn({ error, id }, 'Error in deleteById');
      return false;
    }
  }
  
  /**
   * Find documents by query filters
   * 
   * @param filters - Query filters
   * @param paging - Paging parameters
   * @returns Array of canonical documents
   */
  async findByQuery(
    filters: DocumentFilters,
    paging?: PagingParams
  ): Promise<CanonicalDocument[]> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      const db = getDB();
      const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Build MongoDB filter
    const mongoFilter: Filter<CanonicalDocument> = {};
    
    if (filters.source) {
      mongoFilter.source = filters.source;
    }
    if (filters.sourceId) {
      mongoFilter.sourceId = filters.sourceId;
    }
    if (filters.documentFamily) {
      if (Array.isArray(filters.documentFamily)) {
        mongoFilter.documentFamily = { $in: filters.documentFamily };
      } else {
        mongoFilter.documentFamily = filters.documentFamily;
      }
    }
    if (filters.documentType) {
      if (Array.isArray(filters.documentType)) {
        mongoFilter.documentType = { $in: filters.documentType };
      } else {
        mongoFilter.documentType = filters.documentType;
      }
    }
    if (filters.language) {
      mongoFilter.language = filters.language;
    }
    if (filters.publisherAuthority) {
      mongoFilter.publisherAuthority = filters.publisherAuthority;
    }

    // Review status filters
    if (filters.reviewStatus) {
      if (Array.isArray(filters.reviewStatus)) {
        mongoFilter.reviewStatus = { $in: filters.reviewStatus };
      } else {
        mongoFilter.reviewStatus = filters.reviewStatus;
      }
    }

    // Temporal filters
    if (filters.validFrom) {
      mongoFilter['dates.validFrom'] = { $gte: filters.validFrom };
    }
    if (filters.validTo) {
      mongoFilter['dates.validTo'] = { $lte: filters.validTo };
    }
    if (filters.publishedAfter) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $gte: filters.publishedAfter };
    }
    if (filters.publishedBefore) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $lte: filters.publishedBefore };
    }

    // Spatial filters
    if (filters.areaId) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = filters.areaId;
    }
    if (filters.areaIds && filters.areaIds.length > 0) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = { $in: filters.areaIds };
    }
    
    // Support enrichmentMetadata queries (for workflow-specific fields)
    if (filters.queryId) {
      mongoFilter['enrichmentMetadata.queryId'] = filters.queryId;
    }
    if (filters.workflowRunId) {
      mongoFilter['enrichmentMetadata.workflowRunId'] = filters.workflowRunId;
    }
    if (filters.workflowId) {
      mongoFilter['enrichmentMetadata.workflowId'] = filters.workflowId;
    }
    if (filters.stepId) {
      mongoFilter['enrichmentMetadata.stepId'] = filters.stepId;
    }
    
    // Build query with chaining (more reliable than options object)
    let query = collection.find(mongoFilter).sort({ createdAt: -1 } as Record<string, 1 | -1>);
    
    if (paging) {
      if (paging.skip !== undefined) {
        query = query.skip(paging.skip);
      } else if (paging.page && paging.limit) {
        query = query.skip((paging.page - 1) * paging.limit);
      }
      if (paging.limit && paging.limit > 0) {
        query = query.limit(paging.limit);
      }
    }
    
    const documents = await query.toArray();
    
    const result = documents.map(doc => this.mapToCanonicalDocument(doc));
    const responseTime = Date.now() - startTime;

    // Determine query complexity
    const filterCount = Object.keys(mongoFilter).length;
    const queryComplexity: 'simple' | 'complex' = filterCount > 3 ? 'complex' : 'simple';

    // Record monitoring metric
    await this.monitoringService.recordOperation({
      operation: 'findByQuery',
      source: filters.source,
      responseTimeMs: responseTime,
      success: true,
      documentCount: result.length,
      queryComplexity,
      metadata: {
        filterCount,
        hasPaging: !!paging,
        pagingLimit: paging?.limit,
      },
    }).catch((err) => {
      logger.warn({ error: err }, 'Failed to record canonical document operation metric');
    });

    return result;
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'findByQuery',
        source: filters.source,
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      throw error;
    }
  }
  
  /**
   * Find documents by queryId (stored in enrichmentMetadata)
   * 
   * @param queryId - Query ID (MongoDB ObjectId as string)
   * @param paging - Paging parameters
   * @returns Array of canonical documents
   */
  async findByQueryId(
    queryId: string,
    paging?: PagingParams
  ): Promise<CanonicalDocument[]> {
    if (!ObjectId.isValid(queryId)) {
      return [];
    }
    
    return this.findByQuery(
      { queryId },
      paging
    );
  }
  
  /**
   * Count documents by queryId
   * 
   * @param queryId - Query ID (MongoDB ObjectId as string)
   * @returns Count of documents
   */
  async countByQueryId(queryId: string): Promise<number> {
    if (!ObjectId.isValid(queryId)) {
      return 0;
    }
    
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    return collection.countDocuments({
      'enrichmentMetadata.queryId': queryId,
    });
  }

  /**
   * Get counts of documents grouped by queryId for multiple query IDs
   *
   * @param queryIds - Array of query IDs to count documents for
   * @returns Map of queryId to count
   */
  async getCountsForQueryIds(queryIds: string[]): Promise<Map<string, number>> {
    if (!queryIds || queryIds.length === 0) {
      return new Map();
    }

    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);

    // Filter valid IDs
    const validIds = queryIds.filter(id => id && ObjectId.isValid(id));
    if (validIds.length === 0) {
        return new Map();
    }

    const pipeline = [
      {
        $match: {
          'enrichmentMetadata.queryId': { $in: validIds }
        }
      },
      {
        $group: {
          _id: '$enrichmentMetadata.queryId',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const counts = new Map<string, number>();
    // Initialize with 0 for all requested IDs
    validIds.forEach(id => counts.set(id, 0));

    // Update with actual counts
    results.forEach((result: any) => {
        if (result._id) {
            counts.set(String(result._id), result.count);
        }
    });

    return counts;
  }
  
  /**
   * Find documents by workflowRunId (stored in enrichmentMetadata)
   * 
   * @param workflowRunId - Workflow run ID (MongoDB ObjectId as string)
   * @param paging - Paging parameters
   * @returns Array of canonical documents
   */
  async findByWorkflowRunId(
    workflowRunId: string,
    paging?: PagingParams
  ): Promise<CanonicalDocument[]> {
    if (!ObjectId.isValid(workflowRunId)) {
      return [];
    }
    
    return this.findByQuery(
      { workflowRunId },
      paging
    );
  }
  
  /**
   * Count documents by workflowRunId
   * 
   * @param workflowRunId - Workflow run ID (MongoDB ObjectId as string)
   * @returns Count of documents
   */
  async countByWorkflowRunId(workflowRunId: string): Promise<number> {
    if (!ObjectId.isValid(workflowRunId)) {
      return 0;
    }
    
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    return collection.countDocuments({
      'enrichmentMetadata.workflowRunId': workflowRunId,
    });
  }
  
  /**
   * Find documents by date range
   * 
   * @param startDate - Start date
   * @param endDate - End date
   * @param paging - Paging parameters
   * @returns Array of canonical documents
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    paging?: PagingParams
  ): Promise<CanonicalDocument[]> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    const mongoFilter: Filter<CanonicalDocument> = {
      'dates.publishedAt': {
        $gte: startDate,
        $lte: endDate,
      },
    };
    
    const options: { limit?: number; skip?: number; sort?: { 'dates.publishedAt': number } } = {
      sort: { 'dates.publishedAt': -1 },
    };
    
    if (paging) {
      if (paging.limit) {
        options.limit = paging.limit;
      }
      if (paging.skip !== undefined) {
        options.skip = paging.skip;
      } else if (paging.page && paging.limit) {
        options.skip = (paging.page - 1) * paging.limit;
      }
    }
    
    // @ts-expect-error - MongoDB driver overload issue with find options
    const documents = await collection.find(mongoFilter, options).toArray();
    
    return documents.map(doc => this.mapToCanonicalDocument(doc));
  }
  
  /**
   * Count documents by filters
   * 
   * @param filters - Query filters
   * @returns Count of documents
   */
  async countByQuery(filters: DocumentFilters): Promise<number> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Build MongoDB filter (same logic as findByQuery)
    const mongoFilter: Filter<CanonicalDocument> = {};
    
    if (filters.source) {
      mongoFilter.source = filters.source;
    }
    if (filters.sourceId) {
      mongoFilter.sourceId = filters.sourceId;
    }
    if (filters.documentFamily) {
      if (Array.isArray(filters.documentFamily)) {
        mongoFilter.documentFamily = { $in: filters.documentFamily };
      } else {
        mongoFilter.documentFamily = filters.documentFamily;
      }
    }
    if (filters.documentType) {
      if (Array.isArray(filters.documentType)) {
        mongoFilter.documentType = { $in: filters.documentType };
      } else {
        mongoFilter.documentType = filters.documentType;
      }
    }
    if (filters.language) {
      mongoFilter.language = filters.language;
    }
    if (filters.publisherAuthority) {
      mongoFilter.publisherAuthority = filters.publisherAuthority;
    }

    // Review status filters
    if (filters.reviewStatus) {
      if (Array.isArray(filters.reviewStatus)) {
        mongoFilter.reviewStatus = { $in: filters.reviewStatus };
      } else {
        mongoFilter.reviewStatus = filters.reviewStatus;
      }
    }

    // Temporal filters
    if (filters.validFrom) {
      mongoFilter['dates.validFrom'] = { $gte: filters.validFrom };
    }
    if (filters.validTo) {
      mongoFilter['dates.validTo'] = { $lte: filters.validTo };
    }
    if (filters.publishedAfter) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $gte: filters.publishedAfter };
    }
    if (filters.publishedBefore) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $lte: filters.publishedBefore };
    }

    // Spatial filters
    if (filters.areaId) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = filters.areaId;
    }
    if (filters.areaIds && filters.areaIds.length > 0) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = { $in: filters.areaIds };
    }
    
    // Support enrichmentMetadata queries
    if (filters.queryId) {
      mongoFilter['enrichmentMetadata.queryId'] = filters.queryId;
    }
    if (filters.workflowRunId) {
      mongoFilter['enrichmentMetadata.workflowRunId'] = filters.workflowRunId;
    }
    if (filters.workflowId) {
      mongoFilter['enrichmentMetadata.workflowId'] = filters.workflowId;
    }
    if (filters.stepId) {
      mongoFilter['enrichmentMetadata.stepId'] = filters.stepId;
    }
    
    return collection.countDocuments(mongoFilter as any);
  }
  
  /**
   * Find document by URL (canonicalUrl or sourceMetadata.legacyUrl)
   * 
   * @param url - Document URL
   * @returns Canonical document or null if not found
   */
  async findByUrl(url: string): Promise<CanonicalDocument | null> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Try canonicalUrl first, then fallback to sourceMetadata.legacyUrl
    const document = await collection.findOne({
      $or: [
        { canonicalUrl: url },
        { 'sourceMetadata.legacyUrl': url },
        { 'sourceMetadata.url': url },
      ],
    });
    
    if (!document) {
      return null;
    }
    
    return this.mapToCanonicalDocument(document);
  }
  
  /**
   * Find documents by URLs (canonicalUrl or sourceMetadata.legacyUrl)
   * 
   * @param urls - Array of document URLs
   * @returns Array of canonical documents (may be fewer than input if some URLs not found)
   */
  async findByUrls(urls: string[]): Promise<CanonicalDocument[]> {
    if (!urls || urls.length === 0) {
      return [];
    }
    
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Limit array size to prevent memory exhaustion
    const MAX_URLS = parseInt(process.env.MAX_CANONICAL_DOCUMENT_URLS || '1000', 10);
    const limitedUrls = urls.slice(0, MAX_URLS);
    
    if (urls.length > MAX_URLS) {
      logger.warn(
        { totalUrls: urls.length, limitedUrls: MAX_URLS },
        'URLs list truncated to prevent memory exhaustion'
      );
    }
    
    // Find documents matching any of the URLs
    const documents = await collection.find({
      $or: [
        { canonicalUrl: { $in: limitedUrls } },
        { 'sourceMetadata.legacyUrl': { $in: limitedUrls } },
        { 'sourceMetadata.url': { $in: limitedUrls } },
      ],
    }).toArray();
    
    return documents.map(doc => this.mapToCanonicalDocument(doc));
  }
  
  /**
   * Text search on canonical documents
   * 
   * Supports MongoDB text index (when available) or regex fallback.
   * Similar to SearchService.keywordPrefilter but returns canonical documents.
   * 
   * @param query - Search query string
   * @param filters - Optional document filters
   * @param paging - Paging parameters
   * @returns Array of canonical documents with keyword scores
   */
  async textSearch(
    query: string,
    filters?: DocumentFilters,
    paging?: PagingParams
  ): Promise<Array<CanonicalDocument & { keywordScore?: number }>> {
    const startTime = Date.now();
    let errorType: string | undefined;

    try {
      const db = getDB();
      const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Build MongoDB filter
    const mongoFilter: Filter<CanonicalDocument> = {};
    let useTextIndex = false;
    
    // Apply document filters
    if (filters?.source) {
      mongoFilter.source = filters.source;
    }
    if (filters?.documentFamily) {
      if (Array.isArray(filters.documentFamily)) {
        mongoFilter.documentFamily = { $in: filters.documentFamily };
      } else {
        mongoFilter.documentFamily = filters.documentFamily;
      }
    }
    if (filters?.documentType) {
      if (Array.isArray(filters.documentType)) {
        mongoFilter.documentType = { $in: filters.documentType };
      } else {
        mongoFilter.documentType = filters.documentType;
      }
    }
    if (filters?.publisherAuthority) {
      mongoFilter.publisherAuthority = filters.publisherAuthority;
    }

    // Temporal filters
    if (filters?.validFrom) {
      mongoFilter['dates.validFrom'] = { $gte: filters.validFrom };
    }
    if (filters?.validTo) {
      mongoFilter['dates.validTo'] = { $lte: filters.validTo };
    }
    if (filters?.publishedAfter) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $gte: filters.publishedAfter };
    }
    if (filters?.publishedBefore) {
      const current = (mongoFilter['dates.publishedAt'] as any) || {};
      mongoFilter['dates.publishedAt'] = { ...current, $lte: filters.publishedBefore };
    }

    // Spatial filters
    if (filters?.areaId) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = filters.areaId;
    }
    if (filters?.areaIds && filters.areaIds.length > 0) {
      mongoFilter['sourceMetadata.spatialMetadata.areaId'] = { $in: filters.areaIds };
    }
    
    // Try text index first, fallback to regex if it fails
    let documents: CanonicalDocument[] = [];
    
    try {
      // Try MongoDB text search (requires text index on canonical_documents)
      const textFilter = { ...mongoFilter, $text: { $search: query, $language: 'nl' } };
      const limit = paging?.limit || 100;
      
      const textSearchResults = await collection
        .find(textFilter as Filter<CanonicalDocument>)
        .project({ score: { $meta: 'textScore' } } as Record<string, unknown>)
        .sort({ score: { $meta: 'textScore' } } as Record<string, 1 | -1 | { $meta: string }>)
        .limit(limit * 2)
        .toArray();
      
      if (textSearchResults.length > 0) {
        documents = textSearchResults.map(doc => this.mapToCanonicalDocument(doc));
        useTextIndex = true;
      }
    } catch (error: unknown) {
      // Fallback to regex if text index not available
      const err = error as { code?: number; codeName?: string };
      if (err.code === 27 || err.codeName === 'IndexNotFound') {
        logger.debug('Text index not available on canonical_documents, falling back to regex search');
        
        // Build regex pattern from query words
        const queryWords = query.split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length > 0) {
          const escapedWords = queryWords.map(w => escapeRegex(w));
          const regexPattern = escapedWords.join('|');
          
          // Search in title only for performance (WI-PERF-003)
          // Full text regex on large collections is too slow without an index
          mongoFilter.$or = [
            { title: { $regex: regexPattern, $options: 'i' } },
          ];

          logger.warn(
            'Text index missing on canonical_documents. Falling back to title-only regex search. Performance degraded.',
          );

          // Attempt to self-repair by creating the index in background
          ensureCanonicalIndexes().catch(err => {
            logger.warn({ error: err }, 'Failed to ensure canonical indexes during fallback');
          });
        }
        
        const limit = paging?.limit || 100;
        const skip = paging?.skip !== undefined 
          ? paging.skip 
          : (paging?.page && paging?.limit ? (paging.page - 1) * paging.limit : 0);
        
        const rawDocuments = await collection
          .find(mongoFilter)
          .limit(limit * 2)
          .skip(skip)
          .toArray();
        
        documents = rawDocuments.map(doc => this.mapToCanonicalDocument(doc));
      } else {
        logger.warn({ error }, 'Unexpected error during text search, falling back to regex');
        // Fallback to regex on error
        const queryWords = query.split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length > 0) {
          const escapedWords = queryWords.map(w => escapeRegex(w));
          const regexPattern = escapedWords.join('|');

          // Secure fallback: Search in title ONLY.
          // Searching fullText with regex is a DoS vector and extremely slow without index.
          mongoFilter.$or = [
            { title: { $regex: regexPattern, $options: 'i' } },
          ];
        }
        const limit = paging?.limit || 100;
        const rawDocuments = await collection
          .find(mongoFilter)
          .limit(limit * 2)
          .toArray();
        documents = rawDocuments.map(doc => this.mapToCanonicalDocument(doc));
      }
    }
    
    // Compute keyword scores for each document
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const documentsWithScores = documents.map(doc => {
      let keywordScore = 0;
      
      if (useTextIndex) {
        // If we used text index, try to extract textScore from the document
        // Note: textScore might not be available after mapToCanonicalDocument
        // We'll compute a score based on matches instead
        const titleLower = (doc.title || '').toLowerCase();
        const fullTextLower = (doc.fullText || '').toLowerCase();
        
        for (const word of queryWords) {
          if (titleLower.includes(word)) {
            keywordScore += 10; // Title matches weighted higher
          }
          if (fullTextLower.includes(word)) {
            keywordScore += 1; // Full text matches
          }
        }
        // Normalize to 0-100 range (similar to HybridRetrievalService)
        keywordScore = Math.min(keywordScore / 10, 100);
      } else {
        // Calculate score using field matches (regex fallback)
        const escapedQuery = escapeRegex(query);
        const regex = new RegExp(escapedQuery, 'i');
        
        // Title match: weight 10
        if (doc.title && regex.test(doc.title)) {
          const matches = (doc.title.match(regex) || []).length;
          keywordScore += 10 * matches;
        }
        
        // Full text match: weight 1
        if (doc.fullText && regex.test(doc.fullText)) {
          const matches = (doc.fullText.match(regex) || []).length;
          keywordScore += 1 * matches;
        }
      }
      
      return { ...doc, keywordScore };
    });
    
    const responseTime = Date.now() - startTime;
    const filterCount = filters ? Object.keys(mongoFilter).length : 0;
    const queryComplexity: 'simple' | 'complex' = filterCount > 3 ? 'complex' : 'simple';

    // Record monitoring metric
    await this.monitoringService.recordOperation({
      operation: 'textSearch',
      source: filters?.source,
      responseTimeMs: responseTime,
      success: true,
      documentCount: documentsWithScores.length,
      queryComplexity,
      metadata: {
        queryLength: query.length,
        filterCount,
        useTextIndex,
        hasPaging: !!paging,
        pagingLimit: paging?.limit,
      },
    }).catch((err) => {
      logger.warn({ error: err }, 'Failed to record canonical document operation metric');
    });

    return documentsWithScores;
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const responseTime = Date.now() - startTime;

      // Record error metric
      await this.monitoringService.recordOperation({
        operation: 'textSearch',
        source: filters?.source,
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch((err) => {
        logger.warn({ error: err }, 'Failed to record canonical document error metric');
      });

      throw error;
    }
  }
  
  /**
   * Find documents by website URL (stored in sourceMetadata.legacyWebsiteUrl)
   * 
   * @param websiteUrl - Website URL
   * @param paging - Paging parameters
   * @returns Array of canonical documents
   */
  async findByWebsiteUrl(
    websiteUrl: string,
    paging?: PagingParams
  ): Promise<CanonicalDocument[]> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    const mongoFilter: Filter<CanonicalDocument> = {
      $or: [
        { 'sourceMetadata.legacyWebsiteUrl': websiteUrl },
        { 'sourceMetadata.website_url': websiteUrl },
      ],
    };
    
    // Build query with chaining (more reliable than options object)
    let query = collection.find(mongoFilter).sort({ createdAt: -1 } as Record<string, 1 | -1>);
    
    if (paging) {
      if (paging.skip !== undefined) {
        query = query.skip(paging.skip);
      } else if (paging.page && paging.limit) {
        query = query.skip((paging.page - 1) * paging.limit);
      }
      if (paging.limit !== undefined && paging.limit > 0) {
        query = query.limit(paging.limit);
      }
    }
    
    const documents = await query.toArray();
    
    return documents.map(doc => this.mapToCanonicalDocument(doc));
  }
  
  /**
   * Count documents by website URL
   * 
   * @param websiteUrl - Website URL
   * @returns Count of documents
   */
  async countByWebsiteUrl(websiteUrl: string): Promise<number> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    return collection.countDocuments({
      $or: [
        { 'sourceMetadata.legacyWebsiteUrl': websiteUrl },
        { 'sourceMetadata.website_url': websiteUrl },
      ],
    });
  }
  
  /**
   * Find documents by multiple IDs
   * 
   * @param ids - Array of document IDs (MongoDB ObjectId as string)
   * @returns Array of canonical documents
   */
  async findByIds(ids: string[]): Promise<CanonicalDocument[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    // Limit array size to prevent memory exhaustion
    const MAX_IDS = parseInt(process.env.MAX_CANONICAL_DOCUMENT_IDS || '1000', 10);
    const limitedIds = ids.slice(0, MAX_IDS);
    
    if (ids.length > MAX_IDS) {
      logger.warn(
        { totalIds: ids.length, limitedIds: MAX_IDS },
        'IDs list truncated to prevent memory exhaustion'
      );
    }
    
    const validIds = limitedIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));
    
    if (validIds.length === 0) {
      return [];
    }
    
    const filter: Filter<CanonicalDocument> = {
      _id: { $in: validIds as unknown as (string | RegExp | import('mongodb').BSONRegExp)[] },
    };
    const documents = await collection
      .find(filter)
      .toArray();
    
    return documents.map(doc => this.mapToCanonicalDocument(doc));
  }
  
  /**
   * Count all documents
   * 
   * @returns Total count of documents
   */
  async count(): Promise<number> {
    return this.countByQuery({});
  }
  
  /**
   * Count documents by source
   * 
   * @param source - Document source
   * @returns Count of documents
   */
  async countBySource(source: string): Promise<number> {
    const sourceMap: Record<string, DocumentSource> = {
      'dso': 'DSO',
      'rechtspraak': 'Rechtspraak',
      'wetgeving': 'Wetgeving',
      'gemeente': 'Gemeente',
      'pdok': 'PDOK',
      'web': 'Web',
    };
    const mappedSource = sourceMap[source.toLowerCase()] || source as DocumentSource;
    return this.countByQuery({ source: mappedSource });
  }
  
  /**
   * Count documents by date range
   * 
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Count of documents
   */
  async countByDateRange(startDate: Date, endDate: Date): Promise<number> {
    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    
    return collection.countDocuments({
      'dates.publishedAt': {
        $gte: startDate,
        $lte: endDate,
      },
    });
  }
  
  /**
   * Execute function within a MongoDB transaction
   * 
   * @param fn - Function to execute within transaction
   * @returns Result of function execution
   */
  async withTransaction<T>(fn: (ctx: ServiceContext) => Promise<T>): Promise<T> {
    const db = getDB();
    const session = db.client.startSession();
    
    try {
      session.startTransaction();
      
      const ctx: ServiceContext = { session };
      const result = await fn(ctx);
      
      await session.commitTransaction();
      
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Bulk update review status for multiple documents
   *
   * Efficiently updates review status and metadata for multiple documents.
   *
   * @param params - Update parameters
   * @param ctx - Service context (may include session for transactions)
   * @returns Result summary
   */
  async bulkUpdateReviewStatus(
    params: {
      documentIds: string[];
      reviewStatus: DocumentReviewStatus;
      reviewNotes?: string;
      userId?: string;
    },
    ctx: ServiceContext = {}
  ): Promise<{
    success: boolean;
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      documentId: string;
      status: 'fulfilled' | 'rejected';
      reason?: Error | unknown;
    }>;
  }> {
    const { documentIds, reviewStatus, reviewNotes, userId } = params;
    const startTime = Date.now();
    const now = new Date();

    // Initialize results array with placeholders (all rejected initially)
    const results: Array<{
      documentId: string;
      status: 'fulfilled' | 'rejected';
      reason?: Error | unknown;
    }> = documentIds.map(id => ({
      documentId: id,
      status: 'rejected',
      reason: new Error('Not processed'),
    }));

    // Map to track result indices by ID (handling duplicates and case-insensitivity)
    const idToIndex = new Map<string, number[]>();
    documentIds.forEach((id, index) => {
      const normalizedId = id.toLowerCase();
      if (!idToIndex.has(normalizedId)) {
        idToIndex.set(normalizedId, []);
      }
      idToIndex.get(normalizedId)!.push(index);
    });

    try {
      const db = getDB();
      const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
      const session = ctx.session as ClientSession | undefined;

      // Validate IDs
      const validIds: ObjectId[] = [];

      documentIds.forEach(id => {
        if (ObjectId.isValid(id)) {
          validIds.push(new ObjectId(id));
        } else {
          const normalizedId = id.toLowerCase();
          const indices = idToIndex.get(normalizedId);
          if (indices) {
             indices.forEach(idx => {
               results[idx].reason = new Error(`Invalid document ID format: ${id}`);
             });
          }
        }
      });

      if (validIds.length === 0) {
        const successful = 0;
        const failed = documentIds.length;

        await this.monitoringService.recordOperation({
          operation: 'bulkUpdate',
          responseTimeMs: Date.now() - startTime,
          success: true,
          documentCount: 0,
          queryComplexity: 'simple',
          metadata: { totalRequested: documentIds.length, failed },
        });

        return {
            success: true,
            total: documentIds.length,
            successful,
            failed,
            results
        };
      }

      // Fetch documents to get previous status (for metadata)
      const documents = await collection.find(
          { _id: { $in: validIds as any } },
          { 
            projection: { _id: 1, reviewStatus: 1 },
            session
          }
      ).toArray();

      const foundIds = new Set(documents.map(d => d._id.toString()));

      // Mark not found documents
      validIds.forEach(oid => {
          const id = oid.toString();
          if (!foundIds.has(id)) {
              const indices = idToIndex.get(id);
              if (indices) {
                  indices.forEach(idx => {
                      results[idx].reason = new Error(`CanonicalDocument not found: ${id}`);
                  });
              }
          }
      });

      // Prepare bulk operations
      const bulkOps = documents.map(doc => {
          const previousStatus = doc.reviewStatus as DocumentReviewStatus;

          const reviewMetadata: DocumentReviewMetadata = {
              reviewedAt: now,
              reviewedBy: userId,
              reviewNotes,
              previousStatus,
          };

          return {
              updateOne: {
                  filter: { _id: doc._id },
                  update: {
                      $set: {
                          reviewStatus,
                          reviewMetadata,
                          updatedAt: now,
                      }
                  }
              }
          };
      });

      // Execute bulk write
      if (bulkOps.length > 0) {
        try {
          await (session
            ? collection.bulkWrite(bulkOps, { session, ordered: false })
            : collection.bulkWrite(bulkOps, { ordered: false }));

          // Default all found to fulfilled
          documents.forEach((doc) => {
            const id = doc._id.toString();
            const indices = idToIndex.get(id);
            if (indices) {
              indices.forEach((idx) => {
                results[idx].status = 'fulfilled';
                results[idx].reason = undefined;
              });
            }
          });
        } catch (error) {
          if (error instanceof MongoBulkWriteError) {
            // Default all found to fulfilled first (as ordered: false attempts all)
            documents.forEach((doc) => {
              const id = doc._id.toString();
              const indices = idToIndex.get(id);
              if (indices) {
                indices.forEach((idx) => {
                  results[idx].status = 'fulfilled';
                  results[idx].reason = undefined;
                });
              }
            });

            // Then mark specific failures
            if (error.writeErrors) {
              const errors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
              errors.forEach((err: any) => {
                // err.index corresponds to the index in bulkOps array
                const failedDoc = documents[err.index];
                if (failedDoc) {
                  const id = failedDoc._id.toString();
                  const indices = idToIndex.get(id);
                  if (indices) {
                    indices.forEach((idx) => {
                      results[idx].status = 'rejected';
                      results[idx].reason = new Error(err.errmsg);
                    });
                  }
                }
              });
            }
          } else {
            throw error;
          }
        }
      }

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      const responseTime = Date.now() - startTime;

      await this.monitoringService.recordOperation({
        operation: 'bulkUpdate',
        responseTimeMs: responseTime,
        success: true,
        documentCount: successful,
        queryComplexity: 'simple',
        metadata: {
            totalRequested: documentIds.length,
            failed,
        }
      });

      return {
          success: true,
          total: documentIds.length,
          successful,
          failed,
          results,
      };

    } catch (error) {
       const responseTime = Date.now() - startTime;
       const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

       await this.monitoringService.recordOperation({
        operation: 'bulkUpdate',
        responseTimeMs: responseTime,
        success: false,
        errorType,
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * Update enrichmentMetadata for a document by ID
   *
   * Updates enrichmentMetadata for a single document.
   * This is useful for updating scores, categories, and other metadata after processing.
   *
   * @param documentId - Document ID (MongoDB ObjectId as string)
   * @param enrichmentMetadata - Metadata to merge
   * @param ctx - Service context (may include session for transactions)
   * @returns true if document was updated, false if not found
   */
  async updateEnrichmentMetadata(
    documentId: string,
    enrichmentMetadata: Record<string, unknown>,
    ctx: ServiceContext = {}
  ): Promise<boolean> {
    if (!ObjectId.isValid(documentId)) {
      return false;
    }

    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    const session = ctx.session as ClientSession | undefined;
    const now = new Date();

    const filter: Filter<CanonicalDocument> = {
      _id: new ObjectId(documentId) as unknown as string,
    };

    // Build $set operation to merge enrichmentMetadata fields
    const setFields: Record<string, unknown> = {
      updatedAt: now,
    };

    // Set each enrichmentMetadata field individually to merge with existing metadata
    for (const [key, value] of Object.entries(enrichmentMetadata)) {
      setFields[`enrichmentMetadata.${key}`] = value;
    }
    setFields['enrichmentMetadata.updatedAt'] = now.toISOString();

    const updateOp: UpdateFilter<CanonicalDocument> = {
      $set: setFields,
    };

    const options = session ? { session } : {};

    const result = await collection.updateOne(filter, updateOp, options);

    return result.matchedCount > 0;
  }

  /**
   * Bulk update enrichmentMetadata for multiple documents by URL
   * 
   * Updates enrichmentMetadata for documents matching the provided URLs.
   * This is useful for updating scores, categories, and other metadata after processing.
   * 
   * @param updates - Array of updates, each containing url and enrichmentMetadata to merge
   * @param ctx - Service context (may include session for transactions)
   * @returns Number of documents updated
   */
  async bulkUpdateEnrichmentMetadata(
    updates: Array<{ url: string; enrichmentMetadata: Record<string, unknown> }>,
    ctx: ServiceContext = {}
  ): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    const db = getDB();
    const collection = db.collection<CanonicalDocument>(COLLECTION_NAME);
    const session = ctx.session as ClientSession | undefined;
    const now = new Date();

    let updatedCount = 0;

    // Process updates in batches to avoid overwhelming MongoDB
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
        const bulkOps = batch.map(update => {
        const filter: Filter<CanonicalDocument> = {
          $or: [
            { canonicalUrl: update.url },
            { 'sourceMetadata.legacyUrl': update.url },
            { 'sourceMetadata.url': update.url },
          ],
        };

        // Build $set operation to merge enrichmentMetadata fields
        const setFields: Record<string, unknown> = {
          updatedAt: now,
        };

        // Set each enrichmentMetadata field individually to merge with existing metadata
        for (const [key, value] of Object.entries(update.enrichmentMetadata)) {
          setFields[`enrichmentMetadata.${key}`] = value;
        }
        setFields['enrichmentMetadata.updatedAt'] = now.toISOString();

        const updateOp: UpdateFilter<CanonicalDocument> = {
          $set: setFields,
        };

        return {
          updateOne: {
            filter,
            update: updateOp,
            upsert: false,
          },
        };
      });

      const result = session
        ? await collection.bulkWrite(bulkOps, { session })
        : await collection.bulkWrite(bulkOps);

      updatedCount += result.modifiedCount;
    }

    logger.info({ updatedCount, totalUpdates: updates.length }, 'Bulk updated enrichmentMetadata for documents');
    return updatedCount;
  }

  /**
   * Get original artifact content for a document
   * 
   * Returns the first artifact's content, or a specific artifact by MIME type.
   * 
   * @param documentId - Document ID
   * @param mimeType - Optional MIME type filter (e.g., 'application/xml', 'application/zip')
   * @returns Artifact bytes, or null if not found
   * 
   * @example
   * ```typescript
   * // Get first artifact
   * const bytes = await service.getArtifactContent('507f1f77bcf86cd799439011');
   * 
   * // Get XML artifact specifically
   * const xmlBytes = await service.getArtifactContent('507f1f77bcf86cd799439011', 'application/xml');
   * ```
   */
  async getArtifactContent(documentId: string, mimeType?: string): Promise<Buffer | null> {
    const document = await this.findById(documentId);
    if (!document || !document.artifactRefs || document.artifactRefs.length === 0) {
      return null;
    }

    // Find artifact by MIME type if specified
    let artifactRef = document.artifactRefs[0];
    if (mimeType) {
      artifactRef = document.artifactRefs.find(ref => ref.mimeType === mimeType) || artifactRef;
    }

    try {
      return await this.artifactStore.read(artifactRef.sha256);
    } catch (error) {
      logger.warn({ error, documentId, sha256: artifactRef.sha256 }, 'Failed to read artifact');
      return null;
    }
  }

  /**
   * Get original artifact content as string (for text-based formats)
   * 
   * Convenience method for XML, HTML, JSON, and other text formats.
   * 
   * @param documentId - Document ID
   * @param mimeType - Optional MIME type filter
   * @param encoding - Text encoding (default: 'utf-8')
   * @returns Artifact content as string, or null if not found
   * 
   * @example
   * ```typescript
   * // Get XML as string
   * const xmlString = await service.getArtifactAsString('507f1f77bcf86cd799439011', 'application/xml');
   * ```
   */
  async getArtifactAsString(documentId: string, mimeType?: string, encoding: BufferEncoding = 'utf-8'): Promise<string | null> {
    const bytes = await this.getArtifactContent(documentId, mimeType);
    if (!bytes) {
      return null;
    }
    return bytes.toString(encoding);
  }

  /**
   * Get all artifact references for a document
   * 
   * @param documentId - Document ID
   * @returns Array of artifact references, or empty array if document not found
   */
  async getArtifactRefs(documentId: string): Promise<ArtifactRef[]> {
    const document = await this.findById(documentId);
    if (!document) {
      return [];
    }
    return document.artifactRefs || [];
  }

  /**
   * Get artifact reference by MIME type
   * 
   * @param documentId - Document ID
   * @param mimeType - MIME type to find
   * @returns Artifact reference, or null if not found
   */
  async getArtifactRefByMimeType(documentId: string, mimeType: string): Promise<ArtifactRef | null> {
    const artifactRefs = await this.getArtifactRefs(documentId);
    return artifactRefs.find(ref => ref.mimeType === mimeType) || null;
  }

  /**
   * Extract individual file from ZIP bundle
   * 
   * Extracts a specific file from a ZIP bundle stored in artifactRefs.
   * 
   * @param documentId - Document ID
   * @param filename - Filename within the ZIP (e.g., 'juridische-tekst/regeling.xml')
   * @param bundleMimeType - Optional MIME type filter for the bundle (default: 'application/zip')
   * @returns File content as Buffer, or null if not found
   * 
   * @example
   * ```typescript
   * // Extract XML file from ZIP bundle
   * const xmlContent = await service.extractFileFromBundle(
   *   '507f1f77bcf86cd799439011',
   *   'juridische-tekst/regeling.xml'
   * );
   * ```
   */
  async extractFileFromBundle(
    documentId: string,
    filename: string,
    bundleMimeType: string = 'application/zip'
  ): Promise<Buffer | null> {
    const bundleBytes = await this.getArtifactContent(documentId, bundleMimeType);
    if (!bundleBytes) {
      return null;
    }

    try {
      const zip = new JSZip();
      await zip.loadAsync(bundleBytes);
      
      const file = zip.file(filename);
      if (!file) {
        logger.debug({ documentId, filename }, 'File not found in bundle');
        return null;
      }

      return await file.async('nodebuffer');
    } catch (error) {
      logger.warn({ error, documentId, filename }, 'Failed to extract file from bundle');
      return null;
    }
  }

  /**
   * Extract individual file from ZIP bundle as string
   * 
   * Convenience method for text-based files (XML, JSON, etc.).
   * 
   * @param documentId - Document ID
   * @param filename - Filename within the ZIP
   * @param bundleMimeType - Optional MIME type filter for the bundle
   * @param encoding - Text encoding (default: 'utf-8')
   * @returns File content as string, or null if not found
   * 
   * @example
   * ```typescript
   * // Extract XML file as string
   * const xmlString = await service.extractFileFromBundleAsString(
   *   '507f1f77bcf86cd799439011',
   *   'juridische-tekst/regeling.xml'
   * );
   * ```
   */
  async extractFileFromBundleAsString(
    documentId: string,
    filename: string,
    bundleMimeType: string = 'application/zip',
    encoding: BufferEncoding = 'utf-8'
  ): Promise<string | null> {
    const bytes = await this.extractFileFromBundle(documentId, filename, bundleMimeType);
    if (!bytes) {
      return null;
    }
    return bytes.toString(encoding);
  }

  /**
   * List all files in a ZIP bundle
   * 
   * Returns a list of all files contained in a ZIP bundle.
   * 
   * @param documentId - Document ID
   * @param bundleMimeType - Optional MIME type filter for the bundle (default: 'application/zip')
   * @returns Array of file entries with metadata, or empty array if bundle not found
   * 
   * @example
   * ```typescript
   * // List all files in ZIP bundle
   * const files = await service.listBundleFiles('507f1f77bcf86cd799439011');
   * for (const file of files) {
   *   console.log(`${file.filename} (${file.sizeBytes} bytes)`);
   * }
   * ```
   */
  async listBundleFiles(
    documentId: string,
    bundleMimeType: string = 'application/zip'
  ): Promise<BundleFileEntry[]> {
    const bundleBytes = await this.getArtifactContent(documentId, bundleMimeType);
    if (!bundleBytes) {
      return [];
    }

    try {
      const zip = new JSZip();
      await zip.loadAsync(bundleBytes);
      
      const files: BundleFileEntry[] = [];
      
      for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir) {
          continue; // Skip directories
        }

        // Determine format from extension
        const format = this.detectFormatFromFilename(filename) as DocumentFormat;
        const mimeType = this.detectMimeTypeFromFilename(filename);

        files.push({
          filename,
          format,
          sizeBytes: (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || undefined,
          mimeType,
        });
      }

      return files.sort((a, b) => a.filename.localeCompare(b.filename));
    } catch (error) {
      logger.warn({ error, documentId }, 'Failed to list bundle files');
      return [];
    }
  }

  /**
   * Get files from bundle by format
   * 
   * Returns all files of a specific format from a ZIP bundle.
   * 
   * @param documentId - Document ID
   * @param format - Document format to filter by (e.g., 'XML', 'GeoJSON')
   * @param bundleMimeType - Optional MIME type filter for the bundle
   * @returns Array of file entries matching the format
   * 
   * @example
   * ```typescript
   * // Get all XML files from bundle
   * const xmlFiles = await service.getBundleFilesByFormat('507f1f77bcf86cd799439011', 'XML');
   * ```
   */
  async getBundleFilesByFormat(
    documentId: string,
    format: string,
    bundleMimeType: string = 'application/zip'
  ): Promise<BundleFileEntry[]> {
    const allFiles = await this.listBundleFiles(documentId, bundleMimeType);
    return allFiles.filter(file => file.format === format);
  }

  /**
   * Detect document format from filename
   */
  private detectFormatFromFilename(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const formatMap: Record<string, string> = {
      'xml': 'XML',
      'json': 'JSON',
      'geojson': 'GeoJSON',
      'pdf': 'PDF',
      'html': 'Web',
      'htm': 'Web',
      'md': 'Other', // Markdown
      'txt': 'Other',
      'zip': 'ZIP',
      'docx': 'DOCX',
      'xlsx': 'Other',
      'csv': 'Other',
    };

    return formatMap[ext] || 'Other';
  }

  /**
   * Detect MIME type from filename
   */
  private detectMimeTypeFromFilename(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const mimeMap: Record<string, string> = {
      'xml': 'application/xml',
      'json': 'application/json',
      'geojson': 'application/geo+json',
      'pdf': 'application/pdf',
      'html': 'text/html',
      'htm': 'text/html',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'csv': 'text/csv',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Map MongoDB document to CanonicalDocument
   */
  private mapToCanonicalDocument(doc: unknown): CanonicalDocument {
    const d = doc as { _id: ObjectId; [key: string]: unknown };
    return {
      _id: d._id.toString(),
      source: d.source as CanonicalDocument['source'],
      sourceId: d.sourceId as string,
      canonicalUrl: d.canonicalUrl as string | undefined,
      title: d.title as string,
      publisherAuthority: d.publisherAuthority as string | undefined,
      documentFamily: d.documentFamily as CanonicalDocument['documentFamily'],
      documentType: d.documentType as string,
      dates: d.dates as CanonicalDocument['dates'],
      fullText: d.fullText as string,
      contentFingerprint: d.contentFingerprint as string,
      language: d.language as string,
      artifactRefs: d.artifactRefs as CanonicalDocument['artifactRefs'],
      httpStatus: d.httpStatus as number | undefined,
      sourceMetadata: d.sourceMetadata as Record<string, unknown>,
      enrichmentMetadata: d.enrichmentMetadata as Record<string, unknown> | undefined,
      // Format information
      documentStructure: d.documentStructure as CanonicalDocument['documentStructure'],
      format: d.format as CanonicalDocument['format'],
      formatComposition: d.formatComposition as CanonicalDocument['formatComposition'],
      // Versioning
      versionOf: d.versionOf as string | undefined,
      // Review status - default to 'pending_review' if not present (for backward compatibility)
      reviewStatus: (d.reviewStatus as DocumentReviewStatus) || 'pending_review',
      reviewMetadata: d.reviewMetadata as DocumentReviewMetadata | undefined,
      createdAt: d.createdAt as Date,
      updatedAt: d.updatedAt as Date,
      schemaVersion: d.schemaVersion as string,
    };
  }
}

// Singleton instance
let canonicalDocumentService: CanonicalDocumentService | null = null;

/**
 * Get singleton instance of CanonicalDocumentService
 */
export function getCanonicalDocumentService(): CanonicalDocumentService {
  if (!canonicalDocumentService) {
    canonicalDocumentService = new CanonicalDocumentService();
  }
  return canonicalDocumentService;
}
