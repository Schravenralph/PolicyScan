/**
 * WetgevingAdapter - Wetgeving (Legislation) adapter with full pipeline
 * 
 * Implements discover/acquire/extract/map/persist pipeline for Wetgeving documents
 * using KOOP SRU 2.0 discovery and XML/PDF acquisition.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/09-wetgeving-adapter.md
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import axios from 'axios';
import type { 
  CanonicalDocumentDraft, 
  ServiceContext, 
  ArtifactRef, 
  CanonicalDocument,
  IAdapter,
  ExtensionDraft
} from '../../contracts/types.js';
import { CanonicalDocumentService } from '../../services/canonical/CanonicalDocumentService.js';
import { UnifiedChunkingService } from '../../chunking/UnifiedChunkingService.js';
import { CanonicalChunkService } from '../../services/canonical/CanonicalChunkService.js';
import { EmbeddingService } from '../../embeddings/EmbeddingService.js';
import { LegalExtensionService, type LegalExtensionPayload } from '../../services/extensions/LegalExtensionService.js';
import { FileSystemArtifactStore } from '../../artifacts/FileSystemArtifactStore.js';
import { KoopSruClient } from '../../clients/KoopSruClient.js';
import { WetgevingXmlExtractor, type WetgevingExtractionResult } from './WetgevingXmlExtractor.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { validateCanonicalDocumentDraft } from '../../validation/canonicalSchemas.js';
import {
  detectDocumentType,
  getDocumentTypeDefinition
} from '../../types/document-type-registry.js';

/**
 * Wetgeving adapter configuration
 */
export interface WetgevingAdapterConfig {
  fixturePath?: string; // Path to fixture XMLs (for offline mode)
  allowEmptyFullText?: boolean; // Allow empty fullText (default: false)
  defaultModelId?: string; // Default embedding model ID
  useLiveApi?: boolean; // Use live KOOP SRU API (default: false, uses fixtures)
  connection?: 'BWB' | 'cvdr'; // SRU connection (default: BWB)
}

/**
 * Wetgeving adapter result
 */
export interface WetgevingAdapterResult {
  documentId: string;
  artifactRef: ArtifactRef;
  chunkCount: number;
  hasLegalExtension: boolean;
  isNewVersion: boolean; // True if this is a new version (different fingerprint)
}

/**
 * Discovery result from SRU
 */
export interface WetgevingDiscoveryResult {
  recordIdentifier?: string;
  title?: string;
  legalIds?: {
    bwbr?: string;
    akn?: string;
    cvdr?: string;
  };
  downloadUrl?: string; // URL to XML/PDF
  metadata?: Record<string, unknown>;
  // Discovery metadata for persistence
  discoveryQuery?: string; // CQL query used
  discoveryConnection?: string; // Connection (BWB or cvdr)
  discoveryStartRecord?: number; // Starting record position
  discoveryNextRecordPosition?: number; // Next record position for pagination
  discoveryNumberOfRecords?: number; // Total number of records
}

/**
 * WetgevingAdapter - Main adapter for Wetgeving documents
 * 
 * Implements IAdapter contract for Wetgeving (Legislation) documents.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/09-wetgeving-adapter.md
 */
export class WetgevingAdapter implements IAdapter {
  private documentService: CanonicalDocumentService;
  private chunkService: CanonicalChunkService;
  private chunkingService: UnifiedChunkingService;
  private embeddingService: EmbeddingService;
  private legalExtensionService: LegalExtensionService;
  private artifactStore: FileSystemArtifactStore;
  private extractor: WetgevingXmlExtractor;
  private sruClient?: KoopSruClient;
  private config: WetgevingAdapterConfig;

  constructor(config: WetgevingAdapterConfig = {}) {
    this.config = config;
    this.documentService = new CanonicalDocumentService();
    this.chunkService = new CanonicalChunkService();
    this.chunkingService = new UnifiedChunkingService();
    this.embeddingService = new EmbeddingService();
    this.legalExtensionService = new LegalExtensionService();
    this.artifactStore = new FileSystemArtifactStore();
    this.extractor = new WetgevingXmlExtractor();

    // Initialize SRU client if using live API
    if (config.useLiveApi) {
      try {
        this.sruClient = new KoopSruClient();
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize KOOP SRU client, will use fixtures only');
      }
    }
  }

  /**
   * IAdapter interface implementation
   * 
   * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
   */

  /**
   * Discover documents from input
   * 
   * @param input - Discovery input (CQL query string, or fixture filename string, or discovery config object)
   * @returns Array of source records (WetgevingDiscoveryResult[] or fixture filenames)
   */
  async discover(input: unknown): Promise<unknown[]> {
    // Support CQL query string (live API)
    if (typeof input === 'string') {
      // Check if it looks like a CQL query or a fixture filename
      if (input.includes('=') || input.includes(' AND ') || input.includes(' OR ')) {
        // Looks like a CQL query - use live API discoverByQuery
        if (!this.sruClient) {
          throw new Error('SRU client not initialized (useLiveApi=true required)');
        }
        const result = await this.discoverByQuery(input, this.config.connection || 'BWB', 1);
        return result.results;
      } else {
        // Treat as fixture filename
        return [input];
      }
    }

    // Support discovery config object
    if (typeof input === 'object' && input !== null && 'query' in input) {
      const config = input as { query: string; connection?: string; startRecord?: number };
      if (!this.sruClient) {
        throw new Error('SRU client not initialized (useLiveApi=true required)');
      }
      const result = await this.discoverByQuery(
        config.query,
        config.connection || this.config.connection || 'BWB',
        config.startRecord || 1
      );
      return result.results;
    }

    throw new Error(`Unsupported discovery input type. Expected string (CQL query or fixture filename) or discovery config object, got: ${typeof input}`);
  }

  /**
   * Acquire artifact from source record
   * 
   * @param record - Source record (WetgevingDiscoveryResult or fixture filename string)
   * @returns Artifact bundle (Buffer for XML/PDF file)
   */
  async acquire(record: unknown): Promise<unknown> {
    // Handle live API discovery result
    if (this.isWetgevingDiscoveryResult(record)) {
      return await this.acquireFromLiveApi(record);
    }

    // Handle fixture filename
    if (typeof record === 'string') {
      return await this.acquireFromFixture(record);
    }

    throw new Error(`Unsupported record type for acquire. Expected WetgevingDiscoveryResult or string, got: ${typeof record}`);
  }

  /**
   * Extract content from artifact bundle
   * 
   * @param bundle - Artifact bundle (XML/PDF Buffer)
   * @returns Extracted content (WetgevingExtractionResult)
   */
  async extract(bundle: unknown): Promise<unknown> {
    if (!Buffer.isBuffer(bundle)) {
      throw new Error(`Expected Buffer for artifact bundle, got: ${typeof bundle}`);
    }

    // Extract XML/PDF content
    const extraction = await this.extractor.extract(bundle);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    return extraction;
  }

  /**
   * Map extracted content to canonical document draft
   * 
   * @param extracted - Extracted content (from extract())
   * @returns Canonical document draft
   */
  map(extracted: unknown): CanonicalDocumentDraft {
    const extraction = this.validateExtractedContent(extracted);
    
    // Get sourceId from context or extraction
    const sourceId = (extracted as { sourceId?: string }).sourceId 
      || extraction.legalIds?.bwbr 
      || extraction.legalIds?.akn 
      || extraction.legalIds?.cvdr 
      || 'unknown';

    // Check if we have discovery result in context
    const discoveryResult = (extracted as { discoveryResult?: WetgevingDiscoveryResult }).discoveryResult;

    if (discoveryResult) {
      return this.mapToCanonicalFromDiscoverySync(extraction, discoveryResult);
    }

    return this.mapToCanonicalSync(extraction, sourceId);
  }

  /**
   * Generate extensions from extracted content
   * 
   * @param extracted - Extracted content (from extract())
   * @returns Array of extension drafts (LegalExtension for Wetgeving)
   */
  extensions(extracted: unknown): ExtensionDraft[] {
    const extraction = this.validateExtractedContent(extracted);

    // Generate LegalExtension if legal IDs exist
    const legalIds: string[] = [];
    if (extraction.legalIds?.bwbr) legalIds.push(extraction.legalIds.bwbr);
    if (extraction.legalIds?.akn) legalIds.push(extraction.legalIds.akn);
    if (extraction.legalIds?.cvdr) legalIds.push(extraction.legalIds.cvdr);

    if (legalIds.length === 0) {
      return [];
    }

    return [{
      type: 'legal',
      documentId: '', // Will be set in persist
      payload: {
        legalIds,
        citations: extraction.citations || [],
      },
      version: 'v1',
      updatedAt: new Date(),
    }];
  }

  /**
   * Validate canonical document draft
   * 
   * @param draft - Document draft to validate
   * @throws Error if validation fails
   */
  validate(draft: CanonicalDocumentDraft): void {
    validateCanonicalDocumentDraft(draft);
  }

  /**
   * Persist document draft and extensions
   * 
   * @param draft - Canonical document draft
   * @param extensions - Extension drafts
   * @param ctx - Service context
   * @returns Persisted canonical document
   */
  async persist(
    draft: CanonicalDocumentDraft,
    extensions: ExtensionDraft[],
    ctx: ServiceContext
  ): Promise<unknown> {
    // Validate draft
    this.validate(draft);

    // Merge queryId and workflowRunId from ServiceContext into enrichmentMetadata
    // This ensures documents persisted by workflow actions are linked to queries and workflow runs
    if (!draft.enrichmentMetadata) {
      draft.enrichmentMetadata = {};
    }
    const queryId = (ctx as { queryId?: string }).queryId;
    const workflowRunId = (ctx as { workflowRunId?: string }).workflowRunId;
    if (queryId) {
      draft.enrichmentMetadata.queryId = queryId;
    }
    if (workflowRunId) {
      draft.enrichmentMetadata.workflowRunId = workflowRunId;
    }

    // Get artifact buffer from context (stored during acquire)
    const artifactBuffer = (ctx as { artifactBuffer?: Buffer }).artifactBuffer;
    if (!artifactBuffer) {
      throw new Error('Artifact buffer not found in context. Call acquire() before persist().');
    }

    // Get extracted data from context
    const extractedData = (ctx as { extractedData?: WetgevingExtractionResult }).extractedData;
    if (!extractedData) {
      throw new Error('Extracted data not found in context. Call extract() before persist().');
    }

    // Store artifact
    const artifactRef = await this.artifactStore.store({
      bytes: artifactBuffer,
      mimeType: 'application/xml', // Could be PDF, but XML is most common
      provenance: {
        source: 'Wetgeving',
        acquiredAt: new Date(),
        notes: `Legal IDs: ${extractedData.legalIds?.bwbr || extractedData.legalIds?.akn || extractedData.legalIds?.cvdr || 'unknown'}`,
      },
    });

    // Add artifact ref to document
    draft.artifactRefs = [artifactRef];

    // Upsert document (by fingerprint for versioning)
    const document = await this.documentService.upsertByFingerprint(draft, ctx) as CanonicalDocument;

    // Chunk document
    const chunkingResult = await this.chunkingService.chunkDocument(document, {
      chunkingVersion: 'v1',
      minChunkSize: 1600,
      maxChunkSize: 4800,
      chunkOverlap: 200,
    });

    // Upsert chunks
    await this.chunkService.upsertChunks(document._id, chunkingResult.chunks, ctx);

    // Embed chunks (if model configured)
    if (this.config.defaultModelId) {
      const chunkIds = chunkingResult.chunks.map(c => c.chunkId);
      await this.embeddingService.ensureEmbeddingsForChunks(
        chunkIds,
        this.config.defaultModelId,
        ctx
      );
    }

    // Process extensions (LegalExtension)
    for (const ext of extensions) {
      if (ext.type === 'legal' && ext.documentId === '') {
        // Set documentId and upsert
        ext.documentId = document._id;
        await this.legalExtensionService.upsert(document._id, ext.payload as LegalExtensionPayload, ctx);
      }
    }

    logger.info(
      {
        documentId: document._id,
        chunkCount: chunkingResult.chunks.length,
        extensionCount: extensions.length,
      },
      'Persisted Wetgeving document via IAdapter interface'
    );

    return document;
  }

  /**
   * Helper methods for IAdapter implementation
   */

  private isWetgevingDiscoveryResult(record: unknown): record is WetgevingDiscoveryResult {
    return (
      typeof record === 'object' &&
      record !== null &&
      ('recordIdentifier' in record || 'legalIds' in record || 'downloadUrl' in record)
    );
  }

  private validateExtractedContent(extracted: unknown): WetgevingExtractionResult {
    if (
      typeof extracted !== 'object' ||
      extracted === null ||
      !('fullText' in extracted)
    ) {
      throw new Error('Invalid extracted content format. Expected WetgevingExtractionResult.');
    }

    return extracted as WetgevingExtractionResult;
  }

  private mapToCanonicalSync(
    extraction: WetgevingExtractionResult,
    sourceId: string
  ): CanonicalDocumentDraft {
    const contentFingerprint = computeContentFingerprint(extraction.fullText);

    return {
      source: 'Wetgeving',
      sourceId,
      title: extraction.title || `Wetgeving ${sourceId}`,
      documentFamily: 'Juridisch',
      documentType: this.inferDocumentType(extraction),
      publisherAuthority: extraction.publisherAuthority,
      dates: {
        publishedAt: extraction.publishedAt,
        validFrom: extraction.validFrom,
        validTo: extraction.validTo,
      },
      fullText: extraction.fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [],
      sourceMetadata: {
        discovery: {
          sourceId,
        },
      },
      enrichmentMetadata: {
        wetgeving: extraction.metadata,
      },
    };
  }

  private mapToCanonicalFromDiscoverySync(
    extraction: WetgevingExtractionResult,
    discoveryResult: WetgevingDiscoveryResult
  ): CanonicalDocumentDraft {
    const contentFingerprint = computeContentFingerprint(extraction.fullText);

    // Determine sourceId from legalIds or discovery result
    const canonicalSourceId = extraction.legalIds?.bwbr 
      || extraction.legalIds?.akn 
      || extraction.legalIds?.cvdr 
      || discoveryResult.legalIds?.bwbr
      || discoveryResult.legalIds?.akn
      || discoveryResult.legalIds?.cvdr
      || discoveryResult.recordIdentifier
      || 'unknown';

    // Build discovery metadata for persistence
    const discoveryMetadata: Record<string, unknown> = {
      recordIdentifier: discoveryResult.recordIdentifier,
    };

    if (discoveryResult.discoveryQuery) {
      discoveryMetadata.query = discoveryResult.discoveryQuery;
    }
    if (discoveryResult.discoveryConnection) {
      discoveryMetadata.connection = discoveryResult.discoveryConnection;
    }
    if (discoveryResult.discoveryStartRecord !== undefined) {
      discoveryMetadata.startRecord = discoveryResult.discoveryStartRecord;
    }
    if (discoveryResult.discoveryNextRecordPosition !== undefined) {
      discoveryMetadata.nextRecordPosition = discoveryResult.discoveryNextRecordPosition;
    }
    if (discoveryResult.discoveryNumberOfRecords !== undefined) {
      discoveryMetadata.numberOfRecords = discoveryResult.discoveryNumberOfRecords;
    }

    if (discoveryResult.metadata) {
      discoveryMetadata.rawRecord = discoveryResult.metadata;
    }

    return {
      source: 'Wetgeving',
      sourceId: canonicalSourceId,
      title: discoveryResult.title || extraction.title || `Wetgeving ${canonicalSourceId}`,
      documentFamily: 'Juridisch',
      documentType: this.inferDocumentType(extraction),
      publisherAuthority: extraction.publisherAuthority,
      dates: {
        publishedAt: extraction.publishedAt,
        validFrom: extraction.validFrom,
        validTo: extraction.validTo,
      },
      fullText: extraction.fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [],
      sourceMetadata: {
        discovery: discoveryMetadata,
        // Populate legacy fields for library display compatibility
        legacyWebsiteTitel: extraction.publisherAuthority || 'Overheid.nl',
        website_titel: extraction.publisherAuthority || 'Overheid.nl',
      },
      enrichmentMetadata: {
        wetgeving: extraction.metadata,
      },
    };
  }

  /**
   * Legacy convenience methods (maintained for backward compatibility)
   */

  /**
   * Process Wetgeving XML from fixture (offline mode)
   * 
   * @param fixtureFilename - Filename of fixture XML (relative to fixturePath)
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processFixture(
    fixtureFilename: string,
    ctx: ServiceContext
  ): Promise<WetgevingAdapterResult> {
    // Acquire: read XML from fixture
    const xmlBuffer = await this.acquireFromFixture(fixtureFilename);
    
    // Extract: parse XML and extract content
    const extraction = await this.extractor.extract(xmlBuffer);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    // Map to canonical document draft
    const documentDraft = await this.mapToCanonical(extraction, fixtureFilename);

    // Persist: store document, chunks, extensions
    return await this.persistLegacy(documentDraft, xmlBuffer, extraction, ctx);
  }

  /**
   * Process Wetgeving document from live SRU discovery
   * 
   * @param discoveryResult - Discovery result from SRU
   * @param discoveryMetadata - Optional discovery metadata (query, connection, pagination)
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processLiveDocument(
    discoveryResult: WetgevingDiscoveryResult,
    discoveryMetadata?: {
      query?: string;
      connection?: string;
      startRecord?: number;
      nextRecordPosition?: number;
      numberOfRecords?: number;
    },
    ctx?: ServiceContext
  ): Promise<WetgevingAdapterResult> {
    if (!this.sruClient) {
      throw new Error('SRU client not initialized (useLiveApi=true required)');
    }

    if (!ctx) {
      ctx = { session: undefined };
    }

    // Merge discovery metadata into discovery result
    if (discoveryMetadata) {
      discoveryResult.discoveryQuery = discoveryMetadata.query;
      discoveryResult.discoveryConnection = discoveryMetadata.connection;
      discoveryResult.discoveryStartRecord = discoveryMetadata.startRecord;
      discoveryResult.discoveryNextRecordPosition = discoveryMetadata.nextRecordPosition;
      discoveryResult.discoveryNumberOfRecords = discoveryMetadata.numberOfRecords;
    }

    // Acquire: download XML/PDF from discovery result
    const artifactBuffer = await this.acquireFromLiveApi(discoveryResult);

    // Extract: parse XML and extract content
    const extraction = await this.extractor.extract(artifactBuffer);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    // Map to canonical document draft
    const documentDraft = await this.mapToCanonicalFromDiscovery(extraction, discoveryResult);

    // Persist: store document, chunks, extensions
    return await this.persistLegacy(documentDraft, artifactBuffer, extraction, ctx);
  }

  /**
   * Discover documents via SRU search (legacy method)
   * 
   * @param query - CQL query string
   * @param connection - Collection name (BWB or cvdr)
   * @param startRecord - Starting record position
   * @returns Discovery results and pagination info
   */
  async discoverByQuery(
    query: string,
    connection: string = this.config.connection || 'BWB',
    startRecord: number = 1
  ): Promise<{
    results: WetgevingDiscoveryResult[];
    nextRecordPosition?: number;
    numberOfRecords?: number;
  }> {
    if (!this.sruClient) {
      throw new Error('SRU client not initialized (useLiveApi=true required)');
    }

    // Execute SRU search
    const searchResponse = await this.sruClient.searchRetrieve(
      query,
      connection,
      startRecord
    );

    // Map SRU records to discovery results with discovery metadata
    const results: WetgevingDiscoveryResult[] = [];
    for (const record of searchResponse.records || []) {
      const discoveryResult = this.mapSruRecordToDiscovery(record);
      if (discoveryResult) {
        // Attach discovery metadata for persistence
        discoveryResult.discoveryQuery = query;
        discoveryResult.discoveryConnection = connection;
        discoveryResult.discoveryStartRecord = startRecord;
        discoveryResult.discoveryNextRecordPosition = searchResponse.nextRecordPosition;
        discoveryResult.discoveryNumberOfRecords = searchResponse.numberOfRecords;
        results.push(discoveryResult);
      }
    }

    return {
      results,
      nextRecordPosition: searchResponse.nextRecordPosition,
      numberOfRecords: searchResponse.numberOfRecords,
    };
  }

  /**
   * Verify SRU server capabilities via explain operation
   * 
   * Should be called once per deployment to verify server capabilities.
   * 
   * @param connection - Collection name (BWB or cvdr)
   * @returns Explain response with server capabilities
   */
  async verifyServerCapabilities(connection: string = this.config.connection || 'BWB'): Promise<unknown> {
    if (!this.sruClient) {
      throw new Error('SRU client not initialized (useLiveApi=true required)');
    }

    return await this.sruClient.explain(connection);
  }

  /**
   * Acquire XML from fixture
   */
  private async acquireFromFixture(fixtureFilename: string): Promise<Buffer> {
    const fixturePath = this.config.fixturePath || join(process.cwd(), 'tests', 'fixtures', 'wetgeving');
    const filePath = join(fixturePath, fixtureFilename);
    
    try {
      return await readFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read fixture file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Acquire XML/PDF from live API
   */
  private async acquireFromLiveApi(discoveryResult: WetgevingDiscoveryResult): Promise<Buffer> {
    if (!discoveryResult.downloadUrl) {
      throw new Error('Discovery result missing downloadUrl');
    }

    try {
      const response = await axios.get(discoveryResult.downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download artifact from ${discoveryResult.downloadUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Map SRU record to discovery result
   */
  private mapSruRecordToDiscovery(record: unknown): WetgevingDiscoveryResult | null {
    if (typeof record !== 'object' || record === null) {
      return null;
    }

    const recordObj = record as Record<string, unknown>;
    const recordData = recordObj.recordData || recordObj;

    // Extract metadata from recordData (structure varies by collection)
    const title = this.findValue(recordData, ['title', 'titel', 'dcterms:title', 'dc:title']);
    const bwbr = this.findValue(recordData, ['bwbr', 'BWBR', 'identifier']);
    const akn = this.findValue(recordData, ['akn', 'AKN']);
    const downloadUrl = this.findValue(recordData, ['downloadUrl', 'url', 'link', 'dcterms:identifier']);

    return {
      recordIdentifier: recordObj.recordIdentifier as string | undefined,
      title: title ? String(title) : undefined,
      legalIds: {
        bwbr: bwbr && String(bwbr).match(/^BWBR\d+$/i) ? String(bwbr).toUpperCase() : undefined,
        akn: akn ? String(akn) : undefined,
      },
      downloadUrl: downloadUrl ? String(downloadUrl) : undefined,
      metadata: recordData as Record<string, unknown>,
    };
  }

  /**
   * Map extracted content to canonical document draft (from fixture)
   */
  private async mapToCanonical(
    extraction: WetgevingExtractionResult,
    sourceId: string
  ): Promise<CanonicalDocumentDraft> {
    const contentFingerprint = computeContentFingerprint(extraction.fullText);

    // Determine sourceId from legalIds or use provided sourceId
    const canonicalSourceId = extraction.legalIds?.bwbr 
      || extraction.legalIds?.akn 
      || extraction.legalIds?.cvdr 
      || sourceId;

    return {
      source: 'Wetgeving',
      sourceId: canonicalSourceId,
      title: extraction.title || 'Wetgeving Document',
      documentFamily: 'Juridisch',
      documentType: this.inferDocumentType(extraction),
      publisherAuthority: extraction.publisherAuthority,
      dates: {
        publishedAt: extraction.publishedAt,
        validFrom: extraction.validFrom,
        validTo: extraction.validTo,
      },
      fullText: extraction.fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [], // Will be populated in persist
      sourceMetadata: {
        discovery: {
          fixtureFilename: sourceId,
        },
        // Populate legacy fields for library display compatibility
        // Note: No URL available in extraction result for fixture mode
        legacyWebsiteUrl: undefined,
        legacyWebsiteTitel: extraction.publisherAuthority || 'Wetgeving',
        website_url: undefined,
        website_titel: extraction.publisherAuthority || 'Wetgeving',
      },
      enrichmentMetadata: {
        wetgeving: extraction.metadata || {},
      },
    };
  }

  /**
   * Map extracted content to canonical document draft (from live discovery)
   */
  private async mapToCanonicalFromDiscovery(
    extraction: WetgevingExtractionResult,
    discoveryResult: WetgevingDiscoveryResult
  ): Promise<CanonicalDocumentDraft> {
    const contentFingerprint = computeContentFingerprint(extraction.fullText);

    // Determine sourceId from legalIds or discovery result
    const canonicalSourceId = extraction.legalIds?.bwbr 
      || extraction.legalIds?.akn 
      || extraction.legalIds?.cvdr 
      || discoveryResult.legalIds?.bwbr
      || discoveryResult.legalIds?.akn
      || discoveryResult.legalIds?.cvdr
      || discoveryResult.recordIdentifier
      || 'unknown';

    // Build discovery metadata for persistence
    const discoveryMetadata: Record<string, unknown> = {
      recordIdentifier: discoveryResult.recordIdentifier,
    };

    // Persist discovery query and cursor information
    if (discoveryResult.discoveryQuery) {
      discoveryMetadata.query = discoveryResult.discoveryQuery;
    }
    if (discoveryResult.discoveryConnection) {
      discoveryMetadata.connection = discoveryResult.discoveryConnection;
    }
    if (discoveryResult.discoveryStartRecord !== undefined) {
      discoveryMetadata.startRecord = discoveryResult.discoveryStartRecord;
    }
    if (discoveryResult.discoveryNextRecordPosition !== undefined) {
      discoveryMetadata.nextRecordPosition = discoveryResult.discoveryNextRecordPosition;
    }
    if (discoveryResult.discoveryNumberOfRecords !== undefined) {
      discoveryMetadata.numberOfRecords = discoveryResult.discoveryNumberOfRecords;
    }

    // Include raw SRU record metadata if available
    if (discoveryResult.metadata) {
      discoveryMetadata.rawRecord = discoveryResult.metadata;
    }

    return {
      source: 'Wetgeving',
      sourceId: canonicalSourceId,
      title: extraction.title || discoveryResult.title || 'Wetgeving Document',
      documentFamily: 'Juridisch',
      documentType: this.inferDocumentType(extraction),
      publisherAuthority: extraction.publisherAuthority,
      dates: {
        publishedAt: extraction.publishedAt,
        validFrom: extraction.validFrom,
        validTo: extraction.validTo,
      },
      fullText: extraction.fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [], // Will be populated in persist
      sourceMetadata: {
        discovery: discoveryMetadata,
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: discoveryResult.downloadUrl ? this.extractWebsiteUrl(discoveryResult.downloadUrl) : undefined,
        legacyWebsiteTitel: extraction.publisherAuthority || 'Overheid.nl',
        website_url: discoveryResult.downloadUrl ? this.extractWebsiteUrl(discoveryResult.downloadUrl) : undefined,
        website_titel: extraction.publisherAuthority || 'Overheid.nl',
      },
      enrichmentMetadata: {
        wetgeving: {
          ...extraction.metadata,
          ...discoveryResult.metadata,
        },
      },
    };
  }

  /**
   * Infer document type from extraction
   */
  private inferDocumentType(extraction: WetgevingExtractionResult): string {
    // Use document type registry for type detection
    // Try to detect from metadata
    const detectedType = detectDocumentType({
      title: extraction.title,
      sourceMetadata: extraction.metadata || {},
    });

    if (detectedType) {
      const typeDefinition = getDocumentTypeDefinition(detectedType);
      return typeDefinition?.canonicalName || detectedType;
    }

    // Fallback: Try to infer from title
    const title = extraction.title?.toLowerCase() || '';

    if (title.includes('wet') || title.includes('law')) {
      const typeDef = getDocumentTypeDefinition('wet');
      return typeDef?.canonicalName || 'wet';
    }
    if (title.includes('besluit') || title.includes('decision')) {
      const typeDef = getDocumentTypeDefinition('besluit');
      return typeDef?.canonicalName || 'besluit';
    }
    if (title.includes('regeling') || title.includes('regulation')) {
      const typeDef = getDocumentTypeDefinition('regeling');
      return typeDef?.canonicalName || 'regeling';
    }
    if (title.includes('amvb') || title.includes('algemene maatregel')) {
      const typeDef = getDocumentTypeDefinition('amvb');
      return typeDef?.canonicalName || 'amvb';
    }

    // Default fallback
    return 'wet';
  }

  /**
   * Persist document, chunks, and extensions (legacy method)
   * 
   * @deprecated Use IAdapter.persist() instead. This method is kept for backward compatibility.
   */
  private async persistLegacy(
    documentDraft: CanonicalDocumentDraft,
    artifactBuffer: Buffer,
    extraction: WetgevingExtractionResult,
    ctx: ServiceContext
  ): Promise<WetgevingAdapterResult> {
    // Use transaction if session provided
    const session = ctx.session;
    
    // Check if document exists with same sourceId to detect version changes
    const db = getDB();
    const collection = db.collection('canonical_documents');
    const existing = await collection.findOne(
      {
        source: documentDraft.source,
        sourceId: documentDraft.sourceId,
      },
      session ? { session: session as any } : undefined
    );

    const isNewVersion = existing !== null && existing.contentFingerprint !== documentDraft.contentFingerprint;
    
    // Store artifact
    const artifactRef = await this.artifactStore.store({
      bytes: artifactBuffer,
      mimeType: this.detectMimeType(artifactBuffer),
      provenance: {
        source: 'Wetgeving',
        acquiredAt: new Date(),
        notes: 'Wetgeving document artifact',
      },
    });

    // Add artifact ref to document
    documentDraft.artifactRefs = [artifactRef];

    // Upsert document (handles versioning: same sourceId + different fingerprint = new version)
    const document = await this.documentService.upsertBySourceId(documentDraft, ctx);

    // Chunk document
    const chunkingResult = await this.chunkingService.chunkDocument(document, {
      chunkingVersion: 'v1',
      minChunkSize: 1600,
      maxChunkSize: 4800,
      chunkOverlap: 200,
    });

    // Upsert chunks
    await this.chunkService.upsertChunks(document._id, chunkingResult.chunks, ctx);

    // Embed chunks (if model configured)
    if (this.config.defaultModelId) {
      const chunkIds = chunkingResult.chunks.map(c => c.chunkId);
      await this.embeddingService.ensureEmbeddingsForChunks(
        chunkIds,
        this.config.defaultModelId,
        ctx
      );
    }

    // Create LegalExtension
    // Convert legalIds object to array format as required by schema
    let hasLegalExtension = false;
    const legalIdsArray: string[] = [];
    if (extraction.legalIds) {
      if (extraction.legalIds.bwbr) legalIdsArray.push(extraction.legalIds.bwbr);
      if (extraction.legalIds.akn) legalIdsArray.push(extraction.legalIds.akn);
      if (extraction.legalIds.cvdr) legalIdsArray.push(extraction.legalIds.cvdr);
    }

    if (legalIdsArray.length > 0 || (extraction.citations && extraction.citations.length > 0)) {
      await this.legalExtensionService.upsert(
        document._id,
        {
          legalIds: legalIdsArray,
          citations: extraction.citations || [],
        },
        ctx
      );
      hasLegalExtension = true;
    }

    logger.info(
      {
        documentId: document._id,
        sourceId: document.sourceId,
        chunkCount: chunkingResult.chunks.length,
        hasLegalExtension,
        isNewVersion,
      },
      'Persisted Wetgeving document'
    );

    return {
      documentId: document._id,
      artifactRef,
      chunkCount: chunkingResult.chunks.length,
      hasLegalExtension,
      isNewVersion,
    };
  }

  /**
   * Detect MIME type from buffer
   */
  private detectMimeType(buffer: Buffer): string {
    // Check for XML signature
    const start = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
    if (start.trim().startsWith('<?xml') || start.trim().startsWith('<')) {
      return 'application/xml';
    }

    // Check for PDF signature
    if (buffer.toString('binary', 0, 4) === '%PDF') {
      return 'application/pdf';
    }

    // Default
    return 'application/octet-stream';
  }

  /**
   * Find value by key (case-insensitive, supports namespaces)
   */
  private findValue(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      // Direct match
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && value !== undefined) {
          return value;
        }
      }

      // Case-insensitive and namespace-agnostic match
      for (const [objKey, value] of Object.entries(obj)) {
        const normalizedKey = objKey.replace(/[:\\]/g, '').toLowerCase();
        const normalizedSearch = key.replace(/[:\\]/g, '').toLowerCase();
        if (normalizedKey === normalizedSearch) {
          if (value !== null && value !== undefined) {
            return value;
          }
        }
      }
    }

    // Recursive search in nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const found = this.findValue(value, keys);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  /**
   * Extract website URL (base URL) from document URL
   */
  private extractWebsiteUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      // Invalid URL, return as-is or empty
      return url.startsWith('http') ? url : '';
    }
  }
}

