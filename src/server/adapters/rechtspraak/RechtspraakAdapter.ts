/**
 * RechtspraakAdapter - Rechtspraak ECLI adapter with full pipeline
 * 
 * Implements discover/acquire/extract/map/persist pipeline for Rechtspraak documents.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/08-rechtspraak-adapter.md
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { 
  CanonicalDocumentDraft, 
  ServiceContext, 
  ArtifactRef,
  IAdapter,
  ExtensionDraft,
  CanonicalDocument
} from '../../contracts/types.js';
import { CanonicalDocumentService } from '../../services/canonical/CanonicalDocumentService.js';
import { UnifiedChunkingService } from '../../chunking/UnifiedChunkingService.js';
import { CanonicalChunkService } from '../../services/canonical/CanonicalChunkService.js';
import { EmbeddingService } from '../../embeddings/EmbeddingService.js';
import { LegalExtensionService, type LegalExtensionPayload } from '../../services/extensions/LegalExtensionService.js';
import { FileSystemArtifactStore } from '../../artifacts/FileSystemArtifactStore.js';
import { RechtspraakOpenDataService, type ECLIIndexQuery } from '../../services/external/RechtspraakOpenDataService.js';
import { RechtspraakXmlExtractor, type RechtspraakExtractionResult } from './RechtspraakXmlExtractor.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import { logger } from '../../utils/logger.js';
import { validateCanonicalDocumentDraft } from '../../validation/canonicalSchemas.js';
import { getDocumentTypeDefinition, detectDocumentType } from '../../types/document-type-registry.js';

/**
 * Rechtspraak adapter configuration
 */
export interface RechtspraakAdapterConfig {
  fixturePath?: string; // Path to fixture XMLs (for offline mode)
  allowEmptyFullText?: boolean; // Allow empty fullText (default: false)
  defaultModelId?: string; // Default embedding model ID
  useLiveApi?: boolean; // Use live Rechtspraak API (default: false, uses fixtures)
}

/**
 * Rechtspraak adapter result
 */
export interface RechtspraakAdapterResult {
  documentId: string;
  artifactRef: ArtifactRef;
  chunkCount: number;
  hasLegalExtension: boolean;
}

/**
 * RechtspraakAdapter - Main adapter for Rechtspraak documents
 * 
 * Implements IAdapter contract for Rechtspraak ECLI documents.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/08-rechtspraak-adapter.md
 */
export class RechtspraakAdapter implements IAdapter {
  private documentService: CanonicalDocumentService;
  private chunkService: CanonicalChunkService;
  private chunkingService: UnifiedChunkingService;
  private embeddingService: EmbeddingService;
  private legalExtensionService: LegalExtensionService;
  private artifactStore: FileSystemArtifactStore;
  private extractor: RechtspraakXmlExtractor;
  private rechtspraakService?: RechtspraakOpenDataService;
  private config: RechtspraakAdapterConfig;

  constructor(config: RechtspraakAdapterConfig = {}) {
    this.config = config;
    this.documentService = new CanonicalDocumentService();
    this.chunkService = new CanonicalChunkService();
    this.chunkingService = new UnifiedChunkingService();
    this.embeddingService = new EmbeddingService();
    this.legalExtensionService = new LegalExtensionService();
    this.artifactStore = new FileSystemArtifactStore();
    this.extractor = new RechtspraakXmlExtractor();

    // Initialize live service if using live API
    if (config.useLiveApi) {
      try {
        this.rechtspraakService = new RechtspraakOpenDataService();
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize Rechtspraak live service, will use fixtures only');
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
   * @param input - Discovery input:
   *   - ECLI string (e.g., "ECLI:NL:HR:2024:123")
   *   - Fixture filename string
   *   - Query object (ECLIIndexQuery) for searching by keywords, court, date range, etc.
   * @returns Array of source records (ECLI identifiers or fixture filenames)
   */
  async discover(input: unknown): Promise<unknown[]> {
    if (typeof input === 'string') {
      // ECLI or fixture filename
      return [input];
    }

    // Check if input is a query object
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const query = input as Partial<ECLIIndexQuery>;
      
      // If it looks like a query object (has query, court, dateRange, etc.)
      if (query.query !== undefined || query.court !== undefined || query.dateRange !== undefined) {
        if (!this.rechtspraakService) {
          throw new Error('Live API service not initialized. Set useLiveApi=true in config to use query-based discovery.');
        }

        // Query ECLI index to get ECLI identifiers
        const ecliResults = await this.rechtspraakService.queryECLIIndex(query as ECLIIndexQuery);
        
        if (ecliResults.length === 0) {
          logger.debug({ query }, 'No ECLI results found during discovery');
        }

        // Return array of ECLI strings
        return ecliResults.map(result => result.ecli);
      }
    }

    throw new Error(`Unsupported discovery input type. Expected string (ECLI or fixture filename) or query object, got: ${typeof input}`);
  }

  /**
   * Acquire artifact from source record
   * 
   * @param record - Source record (ECLI string or fixture filename string)
   * @returns Artifact bundle (Buffer for XML file)
   */
  async acquire(record: unknown): Promise<unknown> {
    if (typeof record !== 'string') {
      throw new Error(`Expected string for record (ECLI or fixture filename), got: ${typeof record}`);
    }

    // Check if it's an ECLI (starts with "ECLI:")
    if (record.startsWith('ECLI:')) {
      if (!this.rechtspraakService) {
        throw new Error('Live API service not initialized. Set useLiveApi=true in config.');
      }
      const xmlString = await this.rechtspraakService.getDocumentByECLI(record);
      return Buffer.from(xmlString, 'utf-8');
    }

    // Otherwise treat as fixture filename
    return await this.acquireFromFixture(record);
  }

  /**
   * Extract content from artifact bundle
   * 
   * @param bundle - Artifact bundle (XML Buffer)
   * @returns Extracted content (RechtspraakExtractionResult)
   */
  async extract(bundle: unknown): Promise<unknown> {
    if (!Buffer.isBuffer(bundle)) {
      throw new Error(`Expected Buffer for artifact bundle, got: ${typeof bundle}`);
    }

    // Extract XML content
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
    
    // Get sourceId from extraction (ECLI should always be present in Rechtspraak extraction)
    // Priority: 1) extraction.ecli (from XML), 2) sourceId from extracted object (original ECLI record), 3) fallback
    const sourceId = extraction.ecli || (extracted as { sourceId?: string }).sourceId;
    
    if (!sourceId) {
      logger.warn(
        { extraction: { ecli: extraction.ecli, title: extraction.title } },
        'No ECLI or sourceId found in Rechtspraak extraction - this should not happen for valid ECLI records'
      );
      // Use a fallback that includes timestamp to ensure uniqueness
      const fallbackId = `rechtspraak-unknown-${Date.now()}`;
      logger.warn({ fallbackId }, 'Using fallback sourceId for Rechtspraak document');
      return this.mapToCanonicalSync(extraction, fallbackId);
    }

    return this.mapToCanonicalSync(extraction, sourceId);
  }

  /**
   * Generate extensions from extracted content
   * 
   * 
   * @param extracted - Extracted content (from extract())
   * @returns Array of extension drafts (LegalExtension for Rechtspraak)
   */
  extensions(extracted: unknown): ExtensionDraft[] {
    const extraction = this.validateExtractedContent(extracted);

    // Generate LegalExtension if ECLI or citations exist
    if (!extraction.ecli && (!extraction.citations || extraction.citations.length === 0)) {
      return [];
    }

    return [{
      type: 'legal',
      documentId: '', // Will be set in persist
      payload: {
        legalIds: extraction.ecli ? [extraction.ecli] : [],
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
    const extractedData = (ctx as { extractedData?: RechtspraakExtractionResult }).extractedData;
    if (!extractedData) {
      throw new Error('Extracted data not found in context. Call extract() before persist().');
    }

    // Store artifact
    const artifactRef = await this.artifactStore.store({
      bytes: artifactBuffer,
      mimeType: 'application/xml',
      provenance: {
        source: 'Rechtspraak',
        acquiredAt: new Date(),
        notes: `ECLI: ${extractedData.ecli || draft.sourceId}`,
      },
    });

    // Add artifact ref to document
    draft.artifactRefs = [artifactRef];

    // Upsert document
    const document = await this.documentService.upsertBySourceId(draft, ctx) as CanonicalDocument;

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
      'Persisted Rechtspraak document via IAdapter interface'
    );

    return document;
  }

  /**
   * Helper methods for IAdapter implementation
   */

  private validateExtractedContent(extracted: unknown): RechtspraakExtractionResult {
    if (
      typeof extracted !== 'object' ||
      extracted === null ||
      !('fullText' in extracted)
    ) {
      throw new Error('Invalid extracted content format. Expected RechtspraakExtractionResult.');
    }

    return extracted as RechtspraakExtractionResult;
  }

  private mapToCanonicalSync(
    extraction: RechtspraakExtractionResult,
    sourceId: string
  ): CanonicalDocumentDraft {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Use ECLI as sourceId if available, otherwise use provided sourceId
    const finalSourceId = extraction.ecli || sourceId;

    // Use document type registry - Rechtspraak documents are 'uitspraak' type
    const rawType = extraction.documentType === 'conclusie' ? 'conclusie' : 'uitspraak';
    const typeDefinition = getDocumentTypeDefinition(rawType);
    const canonicalType = typeDefinition?.canonicalName || 'uitspraak';
    const documentFamily = typeDefinition?.documentFamily || 'Juridisch';

    // Try to detect type from metadata
    const detectedType = detectDocumentType({
      url: extraction.ecli ? `https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}` : undefined,
      title: extraction.title,
      sourceMetadata: {
        ecli: extraction.ecli,
        documentType: extraction.documentType,
      },
    });
    const finalType = detectedType || canonicalType;

    return {
      source: 'Rechtspraak',
      sourceId: finalSourceId,
      title: extraction.title || `Rechtspraak ${finalSourceId}`,
      documentFamily,
      documentType: finalType,
      publisherAuthority: extraction.publisherAuthority,
      canonicalUrl: extraction.ecli ? `https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}` : undefined,
      dates: {
        publishedAt: extraction.publishedAt,
      },
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [],
      // Format information - Rechtspraak documents are typically XML singletons
      documentStructure: 'singleton',
      format: 'XML',
      sourceMetadata: {
        discovery: {
          sourceId: finalSourceId,
          documentType: extraction.documentType,
        },
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: extraction.ecli ? this.extractWebsiteUrl(`https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}`) : undefined,
        legacyWebsiteTitel: extraction.publisherAuthority || 'Rechtspraak',
        website_url: extraction.ecli ? this.extractWebsiteUrl(`https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}`) : undefined,
        website_titel: extraction.publisherAuthority || 'Rechtspraak',
      },
      enrichmentMetadata: {
        rechtspraak: extraction.metadata,
      },
    };
  }

  /**
   * Legacy convenience methods (maintained for backward compatibility)
   */

  /**
   * Process Rechtspraak XML from fixture (offline mode)
   * 
   * @param fixtureFilename - Filename of fixture XML (relative to fixturePath)
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processFixture(
    fixtureFilename: string,
    ctx: ServiceContext
  ): Promise<RechtspraakAdapterResult> {
    // Acquire: read XML from fixture
    const xmlBuffer = await this.acquireFromFixture(fixtureFilename);
    
    // Extract: parse XML and extract content
    const extraction = await this.extractor.extract(xmlBuffer.toString('utf-8'));

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    // Map: create canonical document draft
    const documentDraft = await this.mapToCanonical(extraction, fixtureFilename);

    // Persist: store artifact, document, chunks, extensions
    const result = await this.persistLegacy(documentDraft, xmlBuffer, extraction, ctx);

    return result;
  }

  /**
   * Process ECLI document (live API)
   * 
   * @param ecli - ECLI identifier (e.g., "ECLI:NL:HR:2024:123")
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processECLI(
    ecli: string,
    ctx: ServiceContext
  ): Promise<RechtspraakAdapterResult> {
    if (!this.rechtspraakService) {
      throw new Error('Live API service not initialized. Set useLiveApi=true in config.');
    }

    // Acquire: fetch XML from live API
    const xmlString = await this.rechtspraakService.getDocumentByECLI(ecli);
    const xmlBuffer = Buffer.from(xmlString, 'utf-8');

    // Extract: parse XML and extract content
    const extraction = await this.extractor.extract(xmlBuffer);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    // Map: create canonical document draft
    const documentDraft = await this.mapToCanonical(extraction, ecli);

    // Persist: store artifact, document, chunks, extensions
    const result = await this.persistLegacy(documentDraft, xmlBuffer, extraction, ctx);

    return result;
  }

  /**
   * Acquire XML from fixture (offline mode)
   */
  private async acquireFromFixture(fixtureFilename: string): Promise<Buffer> {
    const fixturePath = this.config.fixturePath || join(process.cwd(), 'tests', 'fixtures', 'rechtspraak');
    const filePath = join(fixturePath, fixtureFilename);

    try {
      const buffer = await readFile(filePath);
      logger.debug({ fixtureFilename, size: buffer.length }, 'Read fixture XML');
      return buffer;
    } catch (error) {
      throw new Error(`Failed to read fixture XML: ${fixtureFilename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Map extracted content to canonical document draft
   */
  private async mapToCanonical(
    extraction: RechtspraakExtractionResult,
    sourceId: string
  ): Promise<CanonicalDocumentDraft> {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Use ECLI as sourceId if available, otherwise use provided sourceId
    const finalSourceId = extraction.ecli || sourceId;

    return {
      source: 'Rechtspraak',
      sourceId: finalSourceId,
      title: extraction.title || `Rechtspraak ${finalSourceId}`,
      documentFamily: 'Juridisch',
      documentType: extraction.documentType === 'conclusie' ? 'RechtspraakConclusie' : 'RechtspraakUitspraak',
      publisherAuthority: extraction.publisherAuthority,
      canonicalUrl: extraction.ecli ? `https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}` : undefined,
      dates: {
        publishedAt: extraction.publishedAt,
      },
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [], // Will be populated in persist
      sourceMetadata: {
        discovery: {
          sourceId: finalSourceId,
          documentType: extraction.documentType,
        },
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: extraction.ecli ? this.extractWebsiteUrl(`https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}`) : undefined,
        legacyWebsiteTitel: extraction.publisherAuthority || 'Rechtspraak',
        website_url: extraction.ecli ? this.extractWebsiteUrl(`https://uitspraken.rechtspraak.nl/inziendocument?id=${extraction.ecli}`) : undefined,
        website_titel: extraction.publisherAuthority || 'Rechtspraak',
      },
      enrichmentMetadata: {
        rechtspraak: extraction.metadata,
      },
    };
  }

  /**
   * Persist document, chunks, and extensions (legacy method)
   * 
   * @deprecated Use IAdapter.persist() instead. This method is kept for backward compatibility.
   */
  private async persistLegacy(
    documentDraft: CanonicalDocumentDraft,
    xmlBuffer: Buffer,
    extraction: RechtspraakExtractionResult,
    ctx: ServiceContext
  ): Promise<RechtspraakAdapterResult> {
    // Store artifact
    const artifactRef = await this.artifactStore.store({
      bytes: xmlBuffer,
      mimeType: 'application/xml',
      provenance: {
        source: 'Rechtspraak',
        acquiredAt: new Date(),
        notes: `ECLI: ${extraction.ecli || documentDraft.sourceId}`,
      },
    });

    // Add artifact ref to document
    documentDraft.artifactRefs = [artifactRef];

    // Upsert document
    const document = await this.documentService.upsertBySourceId(documentDraft, ctx);

    // Chunk document (using Juridisch strategy)
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
    let hasLegalExtension = false;
    if (extraction.ecli || extraction.citations) {
      const legalPayload = {
        legalIds: extraction.ecli ? [extraction.ecli] : [],
        citations: extraction.citations || [],
      };

      await this.legalExtensionService.upsert(document._id, legalPayload, ctx);
      hasLegalExtension = true;
    }

    logger.info(
      {
        documentId: document._id,
        ecli: extraction.ecli,
        chunkCount: chunkingResult.chunks.length,
        hasLegalExtension,
      },
      'Persisted Rechtspraak document'
    );

    return {
      documentId: document._id,
      artifactRef,
      chunkCount: chunkingResult.chunks.length,
      hasLegalExtension,
    };
  }

  /**
   * Truncate fullText if it exceeds BSON size limit
   *
   * MongoDB has a 16MB document size limit. We truncate to ~14MB to allow room for metadata.
   * Uses Buffer.byteLength to accurately handle multi-byte characters (UTF-8).
   */
  private truncateFullText(text: string): string {
    const MAX_BYTES = 14 * 1024 * 1024; // 14MB
    const textBytes = Buffer.byteLength(text, 'utf8');

    if (textBytes > MAX_BYTES) {
      logger.warn(
        { originalBytes: textBytes, limit: MAX_BYTES },
        'Truncating fullText to avoid BSON size limit'
      );

      // Fast path: if chars == bytes (ASCII), simple substring
      if (text.length === textBytes) {
        return text.substring(0, MAX_BYTES) + '\n\n[TRUNCATED: Content exceeded storage limit]';
      }

      // Slow path: multi-byte characters
      const buffer = Buffer.from(text, 'utf8');
      const truncatedBuffer = buffer.subarray(0, MAX_BYTES);
      const truncatedText = truncatedBuffer.toString('utf8');

      return truncatedText + '\n\n[TRUNCATED: Content exceeded storage limit]';
    }

    return text;
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

