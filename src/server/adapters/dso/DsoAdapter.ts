/**
 * DsoAdapter - DSO STOP/TPOD adapter with full pipeline
 * 
 * Implements discover/acquire/extract/map/persist pipeline for DSO documents.
 * For P09, acquire reads from local fixture ZIPs.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
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
import { GeoExtensionService, type GeoExtensionPayload } from '../../services/extensions/GeoExtensionService.js';
import { FileSystemArtifactStore } from '../../artifacts/FileSystemArtifactStore.js';
import { DsoZipParser, type DsoZipContents } from './DsoZipParser.js';
import { StopTpodExtractor } from './StopTpodExtractor.js';
import { ImroExtractor } from './ImroExtractor.js';
import { DsoLiveClient, type DsoDiscoveryResult } from './DsoLiveClient.js';
import { DsoXmlLinker } from './services/DsoXmlLinker.js';
import { buildDsoPublicUrl } from '../../utils/dsoUrlBuilder.js';
import { isApiEndpoint } from '../../utils/urlNormalizer.js';
import { transformGeometry } from '../../geo/crsTransform.js';
import { computeGeometryHash } from '../../geo/geometryHash.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import { computeBbox } from '../../geo/bbox.js';
import { logger } from '../../utils/logger.js';
import { validateCanonicalDocumentDraft } from '../../validation/canonicalSchemas.js';
import type { Geometry, FeatureCollection, Point } from 'geojson';
import type { GioGeometry } from './DsoZipParser.js';
import { 
  getDocumentTypeDefinition, 
  detectDocumentType,
} from '../../types/document-type-registry.js';
import { PolicyParser } from '../../services/parsing/PolicyParser.js';
import { detectFormatFromContent } from './dsoFormatDetection.js';
import { normalizeDiscoveryToPlan } from './services/DsoIdentifierNormalizer.js';

/**
 * DSO adapter configuration
 */
export interface DsoAdapterConfig {
  fixturePath?: string; // Path to fixture ZIPs (for offline mode)
  allowEmptyFullText?: boolean; // Allow empty fullText (default: false)
  defaultModelId?: string; // Default embedding model ID
  useLiveApi?: boolean; // Use live DSO API (default: false, uses fixtures)
  useProduction?: boolean; // Use production API (default: false, uses preprod)
  apiKey?: string; // DSO API key (optional, uses env var if not provided)
}

/**
 * DSO adapter result
 */
export interface DsoAdapterResult {
  documentId: string;
  artifactRef: ArtifactRef;
  chunkCount: number;
  hasGeometry: boolean;
}

/**
 * DsoAdapter - Main adapter for DSO documents
 * 
 * Implements IAdapter contract for DSO STOP/TPOD documents.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 */
export class DsoAdapter implements IAdapter {
  private documentService: CanonicalDocumentService;
  private chunkService: CanonicalChunkService;
  private chunkingService: UnifiedChunkingService;
  private embeddingService: EmbeddingService;
  private geoExtensionService: GeoExtensionService;
  private artifactStore: FileSystemArtifactStore;
  private zipParser: DsoZipParser;
  private extractor: StopTpodExtractor;
  private imroExtractor: ImroExtractor;
  private liveClient?: DsoLiveClient;
  private xmlLinker: DsoXmlLinker;
  private policyParser: PolicyParser;
  private config: DsoAdapterConfig;

  constructor(config: DsoAdapterConfig = {}) {
    this.config = config;
    this.documentService = new CanonicalDocumentService();
    this.chunkService = new CanonicalChunkService();
    this.chunkingService = new UnifiedChunkingService();
    this.embeddingService = new EmbeddingService();
    this.geoExtensionService = new GeoExtensionService();
    this.artifactStore = new FileSystemArtifactStore();
    this.zipParser = new DsoZipParser();
    this.extractor = new StopTpodExtractor();
    this.imroExtractor = new ImroExtractor();
    this.xmlLinker = new DsoXmlLinker();
    this.policyParser = new PolicyParser();

    // Initialize live client if using live API
    if (config.useLiveApi) {
      try {
        this.liveClient = new DsoLiveClient({
          useProduction: config.useProduction,
          apiKey: config.apiKey,
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize DSO live client, will use fixtures only');
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
   * Thin wrapper delegating to DsoLiveClient for separation of concerns
   * while maintaining IAdapter contract compliance.
   * 
   * @param input - Discovery input (Geometry for DSO, query object, or fixture filename string)
   * @returns Array of source records (DsoDiscoveryResult[] or fixture filenames)
   */
  async discover(input: unknown): Promise<unknown[]> {
    // Thin wrapper delegating to DsoLiveClient for separation of concerns
    // while maintaining IAdapter contract compliance
    
    if (!this.liveClient) {
      throw new Error('Live API client not initialized. Set useLiveApi=true in config.');
    }

    // Geometry-based discovery
    if (this.isGeometry(input)) {
      if (!this.isPoint(input)) {
        throw new Error('DSO discovery only supports Point geometry, not ' + input.type);
      }
      return await this.liveClient.discoverByGeometry(input);
    }

    // Query-based discovery
    if (this.isQueryInput(input)) {
      return await this.liveClient.discoverByQuery(input.query, input.opgesteldDoor);
    }

    // Fixture filename discovery (offline mode)
    if (typeof input === 'string') {
      // Return single fixture as array
      return [input];
    }

    throw new Error(`Unsupported discovery input type. Expected Geometry, query object, or string (fixture filename), got: ${typeof input}`);
  }

  /**
   * Acquire artifact from source record
   * 
   * @param record - Source record (DsoDiscoveryResult or fixture filename string)
   * @returns Artifact bundle (Buffer for ZIP file or GML file for IMRO documents)
   */
  async acquire(record: unknown): Promise<unknown> {
    // Handle live API discovery result
    if (this.isDsoDiscoveryResult(record)) {
      if (!this.liveClient) {
        throw new Error('Live API client not initialized. Set useLiveApi=true in config.');
      }
      
      // Normalize discovery result to acquisition plan
      const plan = normalizeDiscoveryToPlan(record);
      
      logger.debug({
        function: 'DsoAdapter.acquire',
        action: 'normalized_discovery_to_plan',
        plan,
        inputs: {
          identificatie: record.identificatie,
          uriIdentificatie: record.uriIdentificatie,
          type: record.type,
        },
      }, '[DsoAdapter] DEBUG: Normalized discovery result to acquisition plan');
      
      if (plan.kind === 'METADATA_ONLY') {
        // Document cannot be downloaded - throw error so caller can handle fallback persistence
        throw new Error(`Document cannot be downloaded: ${plan.reason}. Identificatie: ${record.identificatie}`);
      }
      
      if (plan.kind === 'TAMIMRO') {
        // IMRO documents: Use Ruimtelijke Plannen API
        logger.info(
          { imroId: plan.imroId, type: record.type },
          '[DsoAdapter] Detected IMRO document, using Ruimtelijke Plannen API'
        );
        
        const { RuimtelijkePlannenService } = await import('../../services/external/RuimtelijkePlannenService.js');
        const ruimtelijkeService = new RuimtelijkePlannenService(this.config.useProduction);
        
        // Get complete plan data (plan + teksten + GML)
        // The Ruimtelijke Plannen API doesn't provide ZIP files - we need to bundle the components
        const completePlan = await ruimtelijkeService.getCompletePlan(plan.imroId);
        
        // Return GML if available (DsoZipParser and ImroExtractor can handle GML directly)
        // Note: Currently returning GML only. Plan metadata and teksten are extracted from GML by ImroExtractor.
        // Future enhancement: Could bundle plan + teksten + GML into a ZIP structure for consistency with STOP/TPOD workflow
        if (completePlan.gml) {
          return completePlan.gml;
        }
        
        // If no GML, we could bundle the JSON data, but for now throw error
        throw new Error(`No GML file available for IMRO document: ${plan.imroId}. Plan data available but needs bundling.`);
      }
      
      // STOPTPOD documents: Use Omgevingsdocumenten Download API
      const regelingId = plan.regelingIdAkn;
      
      logger.debug({
        function: 'DsoAdapter.acquire',
        action: 'final_regelingId_prepared',
        outputs: {
          finalRegelingId: regelingId,
          isAknFormat: regelingId.startsWith('/akn/'),
          regelingIdLength: regelingId.length,
        },
        inputs: {
          originalIdentificatie: record.identificatie,
          originalUriIdentificatie: record.uriIdentificatie,
        },
      }, '[DsoAdapter] DEBUG: Final regelingId to send to Download API');
      
      // DEBUG: Function call - calling acquireZip
      logger.debug({
        function: 'DsoAdapter.acquire',
        action: 'calling_acquireZip',
        inputs: { regelingId },
      }, '[DsoAdapter] DEBUG: Calling liveClient.acquireZip()');
      
      const result = await this.liveClient.acquireZip(regelingId);
      
      // DEBUG: Function exit with output
      logger.debug({
        function: 'DsoAdapter.acquire',
        action: 'acquireZip_completed',
        outputs: {
          resultType: Buffer.isBuffer(result) ? 'Buffer' : typeof result,
          resultSize: Buffer.isBuffer(result) ? result.length : undefined,
        },
      }, '[DsoAdapter] DEBUG: acquireZip() completed successfully');
      
      return result;
    }

    // Handle fixture filename
    if (typeof record === 'string') {
      return await this.acquireFromFixture(record);
    }

    throw new Error(`Unsupported record type for acquire. Expected DsoDiscoveryResult or string, got: ${typeof record}`);
  }

  /**
   * Extract content from artifact bundle
   * 
   * @param bundle - Artifact bundle (ZIP Buffer)
   * @returns Extracted content (DsoZipContents with extraction result)
   */
  async extract(bundle: unknown): Promise<unknown> {
    if (!Buffer.isBuffer(bundle)) {
      throw new Error(`Expected Buffer for artifact bundle, got: ${typeof bundle}`);
    }

    // Detect document format from content
    const formatFromContent = detectFormatFromContent(bundle);
    logger.debug({
      function: 'DsoAdapter.extract',
      action: 'format_detection',
      formatFromContent,
      bufferLength: bundle.length,
    }, '[DsoAdapter] DEBUG: Detected document format from content');
    
    // Also check with existing method for compatibility
    const isGml = this.isGmlFile(bundle);
    
    if (formatFromContent === 'TAMIMRO' || isGml) {
      // IMRO GML file - parse directly with ImroExtractor
      logger.debug('Detected GML file, using ImroExtractor');
      const extraction = await this.imroExtractor.extract(bundle);
      
      // Validate fullText
      if (!extraction.fullText || extraction.fullText.trim().length === 0) {
        if (!this.config.allowEmptyFullText) {
          throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
        }
      }

      // Create minimal contents structure for IMRO GML
      const contents: DsoZipContents = {
        stopTpodXmls: [],
        allXmlFiles: [],
        gioGeometries: [],
      };

      // Try to parse GML as geometry (for GeoExtension)
      try {
        const gioGeometry = await this.parseGmlAsGeometry(bundle);
        if (gioGeometry) {
          contents.gioGeometries.push(gioGeometry);
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to parse GML as geometry');
      }

      return {
        extraction,
        contents,
        isImro: true,
      };
    }

    // ZIP file - parse with DsoZipParser
    const contents = await this.zipParser.parse(bundle);

    // Process first STOP/TPOD document (MVP)
    if (contents.stopTpodXmls.length === 0) {
      throw new Error('No STOP/TPOD XML files found in ZIP');
    }

    // Prioritize Regeling/Tekst.xml (main document) over other XML files
    let selectedXml = contents.stopTpodXmls[0];
    const tekstXml = contents.stopTpodXmls.find(xml => 
      xml.filename.toLowerCase().includes('tekst.xml')
    );
    if (tekstXml) {
      selectedXml = tekstXml;
    } else {
      // Fallback: use the largest XML file (likely the main document)
      selectedXml = contents.stopTpodXmls.reduce((largest, current) => {
        return current.content.length > largest.content.length ? current : largest;
      }, contents.stopTpodXmls[0]);
    }

    const extraction = await this.extractor.extract(selectedXml.content);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    return {
      extraction,
      contents,
      isImro: false,
    };
  }

  /**
   * Map extracted content to canonical document draft
   * 
   * @param extracted - Extracted content (from extract())
   * @returns Canonical document draft
   */
  map(extracted: unknown): CanonicalDocumentDraft {
    const extractedData = this.validateExtractedContent(extracted);

    // Determine sourceId and mapping method
    if (extractedData.sourceId) {
      // From fixture
      return this.mapToCanonicalSync(
        extractedData.extraction,
        extractedData.contents,
        extractedData.sourceId
      );
    } else if (extractedData.discoveryResult) {
      // From live discovery
      return this.mapToCanonicalFromDiscoverySync(
        extractedData.extraction,
        extractedData.contents,
        extractedData.discoveryResult
      );
    }

    throw new Error('Cannot map extracted content: missing sourceId or discoveryResult');
  }

  /**
   * Generate extensions from extracted content
   * 
   * @param extracted - Extracted content (from extract())
   * @returns Array of extension drafts (GeoExtension for DSO)
   */
  extensions(extracted: unknown): ExtensionDraft[] {
    const extractedData = this.validateExtractedContent(extracted);

    // Generate GeoExtension if geometries exist
    if (extractedData.contents.gioGeometries.length === 0) {
      return [];
    }

    // Transform geometries to WGS84
    const geometriesWgs84: Geometry[] = [];
    const sources: string[] = [];

    for (const gio of extractedData.contents.gioGeometries) {
      const sourceCrs = gio.crs || 'EPSG:28992';
      
      let transformed: Geometry;
      if (gio.geometry.type === 'FeatureCollection') {
        for (const feature of gio.geometry.features) {
          transformed = transformGeometry(feature.geometry, sourceCrs, 'EPSG:4326');
          geometriesWgs84.push(transformed);
        }
      } else {
        transformed = transformGeometry(gio.geometry, sourceCrs, 'EPSG:4326');
        geometriesWgs84.push(transformed);
      }

      sources.push(gio.identifier);
    }

    if (geometriesWgs84.length === 0) {
      return [];
    }

    const bbox = computeBbox(geometriesWgs84);
    const geometryForHash = geometriesWgs84.length === 1 
      ? geometriesWgs84[0]
      : {
          type: 'GeometryCollection' as const,
          geometries: geometriesWgs84,
        };
    const geometryHash = computeGeometryHash(geometryForHash);

    // Create GeoExtension draft
    return [{
      type: 'geo',
      documentId: '', // Will be set in persist
      payload: {
        crsSource: 'EPSG:28992',
        crsStored: 'EPSG:4326',
        geometriesWgs84,
        bboxWgs84: bbox,
        geometryHash,
        sources,
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
  ): Promise<DsoAdapterResult> {
    // Validate draft
    this.validate(draft);

    // Merge queryId, workflowRunId, and stepId from ServiceContext into enrichmentMetadata
    // This ensures documents persisted by workflow actions are linked to queries and workflow runs
    if (!draft.enrichmentMetadata) {
      draft.enrichmentMetadata = {};
    }
    const queryId = (ctx as { queryId?: string }).queryId;
    const workflowRunId = (ctx as { workflowRunId?: string }).workflowRunId;
    const stepId = (ctx as { stepId?: string }).stepId;
    if (queryId) {
      draft.enrichmentMetadata.queryId = queryId;
    }
    if (workflowRunId) {
      draft.enrichmentMetadata.workflowRunId = workflowRunId;
    }
    if (stepId) {
      draft.enrichmentMetadata.stepId = stepId;
    }

    // Get artifact buffer from context (stored during acquire)
    const artifactBuffer = (ctx as { artifactBuffer?: Buffer }).artifactBuffer;
    if (!artifactBuffer) {
      throw new Error('Artifact buffer not found in context. Call acquire() before persist().');
    }

    // Get extracted contents from context
    const extractedData = (ctx as { extractedData?: { contents: DsoZipContents } }).extractedData;
    if (!extractedData) {
      throw new Error('Extracted data not found in context. Call extract() before persist().');
    }

    // Store artifact (handle permission errors gracefully for tests)
    let artifactRef: ArtifactRef | undefined;
    try {
      artifactRef = await this.artifactStore.store({
        bytes: artifactBuffer,
        mimeType: 'application/zip',
        provenance: {
          source: 'DSO',
          acquiredAt: new Date(),
          notes: 'DSO ZIP artifact',
        },
      });
      draft.artifactRefs = [artifactRef];
    } catch (error) {
      // Handle permission errors gracefully (common in test environments)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EACCES') {
        logger.warn(
          {
            error,
            sourceId: draft.sourceId,
          },
          'Artifact storage permission denied, continuing without artifact storage'
        );
        draft.artifactRefs = []; // Continue without artifacts
      } else if (error instanceof Error && error.message.includes('permission denied')) {
        logger.warn(
          {
            error,
            sourceId: draft.sourceId,
          },
          'Artifact storage permission denied, continuing without artifact storage'
        );
        draft.artifactRefs = []; // Continue without artifacts
      } else {
        // Re-throw other errors
        throw error;
      }
    }

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

    // Process extensions (GeoExtension)
    for (const ext of extensions) {
      if (ext.type === 'geo' && ext.documentId === '') {
        // Set documentId and upsert
        ext.documentId = document._id;
        await this.geoExtensionService.upsert(document._id, ext.payload as GeoExtensionPayload, ctx);
      }
    }

    logger.info(
      {
        documentId: document._id,
        chunkCount: chunkingResult.chunks.length,
        extensionCount: extensions.length,
      },
      'Persisted DSO document via IAdapter interface'
    );

    const hasGeometry = extensions.some(ext => ext.type === 'geo');
    
    // Create a placeholder artifactRef if storage failed (for backward compatibility)
    const finalArtifactRef: ArtifactRef = artifactRef || ({
      storageKey: '',
      sha256: '',
      mimeType: 'application/zip',
      sizeBytes: 0,
      createdAt: new Date(),
      provenance: {
        source: 'DSO',
        acquiredAt: new Date(),
        notes: 'Artifact storage skipped (permission denied)',
      },
    } as ArtifactRef);
    
    const result: DsoAdapterResult = {
      documentId: document._id,
      artifactRef: finalArtifactRef,
      chunkCount: chunkingResult.chunks.length,
      hasGeometry,
    };
    return result;
  }

  /**
   * Helper methods for IAdapter implementation
   */

  private isGeometry(input: unknown): input is Geometry {
    return (
      typeof input === 'object' &&
      input !== null &&
      'type' in input &&
      typeof (input as { type: unknown }).type === 'string'
    );
  }

  private isPoint(geometry: Geometry): geometry is Point {
    return geometry.type === 'Point';
  }

  private isDsoDiscoveryResult(record: unknown): record is DsoDiscoveryResult {
    return (
      typeof record === 'object' &&
      record !== null &&
      'identificatie' in record &&
      typeof (record as { identificatie: unknown }).identificatie === 'string'
    );
  }

  private isQueryInput(input: unknown): input is { query?: string; opgesteldDoor?: string } {
    return (
      typeof input === 'object' &&
      input !== null &&
      ('query' in input || 'opgesteldDoor' in input) &&
      !('type' in input) // Not a geometry
    );
  }

  private validateExtractedContent(extracted: unknown): {
    extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } };
    contents: DsoZipContents;
    sourceId?: string;
    discoveryResult?: DsoDiscoveryResult;
  } {
    if (
      typeof extracted !== 'object' ||
      extracted === null ||
      !('extraction' in extracted) ||
      !('contents' in extracted)
    ) {
      throw new Error('Invalid extracted content format. Expected object with extraction and contents.');
    }

    const data = extracted as {
      extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } };
      contents: DsoZipContents;
      sourceId?: string;
      discoveryResult?: DsoDiscoveryResult;
    };

    return data;
  }

  private mapToCanonicalSync(
    extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } },
    contents: DsoZipContents,
    sourceId: string
  ): CanonicalDocumentDraft {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Try to construct canonicalUrl for fixtures
    // Use publicatieLink if it's a public URL (not an API endpoint), otherwise construct from sourceId
    let canonicalUrl: string | undefined;
    const publicatieLink = (extraction.metadata as Record<string, unknown>)?.publicatieLink as string | undefined;
    if (publicatieLink && !isApiEndpoint(publicatieLink)) {
      canonicalUrl = publicatieLink;
    } else if (sourceId) {
      // Construct URL from sourceId using URL builder
      try {
        canonicalUrl = buildDsoPublicUrl(sourceId);
      } catch (error) {
        // If building fails, log warning but continue without canonicalUrl
        logger.warn(
          { error, sourceId },
          'Failed to build DSO public URL from sourceId in mapToCanonical'
        );
      }
    }

    return {
      source: 'DSO',
      sourceId,
      title: extraction.metadata?.title || 'DSO Document',
      documentFamily: 'Omgevingsinstrument',
      documentType: extraction.metadata?.documentType || 'STOP',
      publisherAuthority: extraction.metadata?.bestuursorgaan,
      canonicalUrl,
      dates: {
        publishedAt: new Date(),
      },
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [],
      reviewStatus: 'pending_review',
      sourceMetadata: {
        discovery: {
          fixtureFilename: sourceId,
        },
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: publicatieLink ? this.extractWebsiteUrl(publicatieLink) : canonicalUrl ? this.extractWebsiteUrl(canonicalUrl) : undefined,
        legacyWebsiteTitel: extraction.metadata?.bestuursorgaan || 'DSO',
        website_url: publicatieLink ? this.extractWebsiteUrl(publicatieLink) : canonicalUrl ? this.extractWebsiteUrl(canonicalUrl) : undefined,
        website_titel: extraction.metadata?.bestuursorgaan || 'DSO',
      },
      enrichmentMetadata: {
        owObjecten: contents.owObjecten,
      },
    };
  }

  private mapToCanonicalFromDiscoverySync(
    extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } },
    contents: DsoZipContents,
    discoveryResult: DsoDiscoveryResult
  ): CanonicalDocumentDraft {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Merge metadata from all sources (extraction, XML files, OW-objecten, discovery)
    const aggregatedMetadata = this.mergeMetadata(
      extraction.metadata,
      contents.metadata,
      contents.owObjecten
    );
    
    // Also merge discovery result metadata (takes precedence)
    if (discoveryResult.titel) aggregatedMetadata.title = discoveryResult.titel;
    if (discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor) {
      aggregatedMetadata.bestuursorgaan = discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor;
    }
    if (discoveryResult.type) aggregatedMetadata.documentType = discoveryResult.type;
    if (discoveryResult.publicatiedatum) aggregatedMetadata.publicatiedatum = discoveryResult.publicatiedatum;
    if (discoveryResult.geldigheidsdatum) aggregatedMetadata.geldigheidsdatum = discoveryResult.geldigheidsdatum;

    // Extract dates from aggregated metadata (includes dates from all XML files)
    const dates = this.extractDates(aggregatedMetadata);
    
    // Fallback to discovery result dates if not found in metadata
    if (!dates.publishedAt && discoveryResult.publicatiedatum) {
      try {
        dates.publishedAt = new Date(discoveryResult.publicatiedatum);
      } catch {
        dates.publishedAt = new Date();
      }
    }

    // Use document type registry to normalize document type
    const rawType = (typeof aggregatedMetadata.documentType === 'string' ? aggregatedMetadata.documentType : null) 
      || discoveryResult.type 
      || extraction.metadata?.documentType 
      || 'omgevingsplan';
    const rawTypeStr = typeof rawType === 'string' ? rawType : String(rawType);
    const typeDefinition = getDocumentTypeDefinition(rawTypeStr.toLowerCase());
    const canonicalType = typeDefinition?.canonicalName || rawTypeStr.toLowerCase();
    const documentFamily = typeDefinition?.documentFamily || 'Omgevingsinstrument';

    // Try to detect type from metadata if not found
    const detectedType = detectDocumentType({
      url: discoveryResult.publicatieLink,
      title: (typeof aggregatedMetadata.title === 'string' ? aggregatedMetadata.title : null) || discoveryResult.titel || extraction.metadata?.title,
      sourceMetadata: {
        type: (typeof aggregatedMetadata.documentType === 'string' ? aggregatedMetadata.documentType : undefined) || discoveryResult.type,
        identificatie: discoveryResult.identificatie,
      },
    });
    const finalType = detectedType || canonicalType;

    // DSO documents are bundles (ZIP files containing multiple formats)
    const formatComposition = this.extractFormatComposition(contents);

    return {
      source: 'DSO',
      sourceId: discoveryResult.identificatie,
      title: (typeof aggregatedMetadata.title === 'string' ? aggregatedMetadata.title : null) || discoveryResult.titel || extraction.metadata?.title || 'DSO Document',
      documentFamily,
      documentType: finalType,
      publisherAuthority: (typeof aggregatedMetadata.bestuursorgaan === 'string' ? aggregatedMetadata.bestuursorgaan : null) || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || extraction.metadata?.bestuursorgaan,
      canonicalUrl: discoveryResult.publicatieLink,
      dates,
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [],
      reviewStatus: 'pending_review',
      // Format information
      documentStructure: 'bundle',
      format: 'ZIP',
      formatComposition,
      sourceMetadata: {
        ...aggregatedMetadata,
        discovery: {
          identificatie: discoveryResult.identificatie,
          type: discoveryResult.type,
          opgesteldDoor: discoveryResult.opgesteldDoor,
          publicatiedatum: discoveryResult.publicatiedatum,
          geldigheidsdatum: discoveryResult.geldigheidsdatum,
        },
        xmlFileCount: contents.allXmlFiles.length,
        xmlFiles: contents.allXmlFiles.map(f => f.filename),
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: discoveryResult.publicatieLink ? this.extractWebsiteUrl(discoveryResult.publicatieLink) : undefined,
        legacyWebsiteTitel: aggregatedMetadata.bestuursorgaan || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || undefined,
        website_url: discoveryResult.publicatieLink ? this.extractWebsiteUrl(discoveryResult.publicatieLink) : undefined,
        website_titel: aggregatedMetadata.bestuursorgaan || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || undefined,
      },
      enrichmentMetadata: {
        owObjecten: contents.owObjecten,
        xmlMetadata: contents.allXmlFiles.map(f => ({
          filename: f.filename,
          rootElement: f.rootElement,
          metadata: f.metadata,
        })),
        // Extract and link rules, activities, and areas
        ...this.extractLinkedXmlData(contents.allXmlFiles),
      },
    };
  }

  /**
   * Extract format composition from DSO ZIP contents
   * 
   * DSO ZIPs typically contain:
   * - XML files (STOP/TPOD juridische tekst)
   * - GeoJSON files (GIOs)
   * - JSON files (OW-objecten)
   * 
   * Enhanced to track individual files for better bundle access.
   */
  private extractFormatComposition(contents: DsoZipContents): import('../../contracts/types.js').FormatComposition | undefined {
    const formats: import('../../contracts/types.js').FormatManifest[] = [];
    let totalFiles = 0;
    
    // Count XML files (juridische tekst)
    const xmlCount = contents.stopTpodXmls?.length || 0;
    if (xmlCount > 0) {
      const xmlFiles: import('../../contracts/types.js').BundleFileEntry[] = contents.stopTpodXmls.map(f => ({
        filename: f.filename,
        format: 'XML',
        purpose: 'legal-text',
        mimeType: 'application/xml',
      }));
      
      formats.push({
        format: 'XML',
        count: xmlCount,
        primary: true,
        purpose: 'legal-text',
        filePatterns: contents.stopTpodXmls?.map(f => f.filename), // Keep for backward compatibility
        files: xmlFiles, // Enhanced: individual file entries
      });
      totalFiles += xmlCount;
    }

    // Count GeoJSON files (GIOs)
    const geojsonCount = contents.gioGeometries?.length || 0;
    if (geojsonCount > 0) {
      const geojsonFiles: import('../../contracts/types.js').BundleFileEntry[] = contents.gioGeometries.map(g => ({
        filename: g.identifier || 'unknown.geojson',
        format: 'GeoJSON',
        purpose: 'geographic-data',
        mimeType: 'application/geo+json',
      }));
      
      formats.push({
        format: 'GeoJSON',
        count: geojsonCount,
        purpose: 'geographic-data',
        filePatterns: contents.gioGeometries?.map(g => g.identifier || 'unknown.geojson'), // Keep for backward compatibility
        files: geojsonFiles, // Enhanced: individual file entries
      });
      totalFiles += geojsonCount;
    }

    // Count JSON files (OW-objecten)
    if (contents.owObjecten) {
      formats.push({
        format: 'JSON',
        count: 1,
        purpose: 'ow-objecten',
        files: [{
          filename: 'ow-objecten.json', // Best guess filename
          format: 'JSON',
          purpose: 'ow-objecten',
          mimeType: 'application/json',
        }],
      });
      totalFiles += 1;
    }

    // Also include all XML files (not just STOP/TPOD) for completeness
    if (contents.allXmlFiles && contents.allXmlFiles.length > xmlCount) {
      const additionalXmlFiles: import('../../contracts/types.js').BundleFileEntry[] = contents.allXmlFiles
        .filter(xml => !contents.stopTpodXmls?.some(stop => stop.filename === xml.filename))
        .map(xml => ({
          filename: xml.filename,
          format: 'XML',
          mimeType: 'application/xml',
        }));
      
      if (additionalXmlFiles.length > 0) {
        // Add to existing XML format or create new entry
        const xmlFormat = formats.find(f => f.format === 'XML');
        if (xmlFormat && xmlFormat.files) {
          xmlFormat.files.push(...additionalXmlFiles);
          xmlFormat.count += additionalXmlFiles.length;
          totalFiles += additionalXmlFiles.length;
        }
      }
    }

    return formats.length > 0 ? { 
      formats,
      totalFiles,
      bundleFormat: 'ZIP',
    } : undefined;
  }

  /**
   * Legacy convenience methods (maintained for backward compatibility)
   */

  /**
   * Process DSO ZIP from fixture (offline mode)
   * 
   * Legacy convenience method. For IAdapter interface usage, call:
   * discover() → acquire() → extract() → map() → extensions() → validate() → persist()
   * 
   * @param fixtureFilename - Filename of fixture ZIP (relative to fixturePath)
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processFixture(
    fixtureFilename: string,
    ctx: ServiceContext
  ): Promise<DsoAdapterResult> {
    // Use legacy private methods for backward compatibility
    const zipBuffer = await this.acquireFromFixture(fixtureFilename);
    const contents = await this.zipParser.parse(zipBuffer);
    
    if (contents.stopTpodXmls.length === 0) {
      throw new Error(`No STOP/TPOD XML files found in fixture: ${fixtureFilename}`);
    }

    const firstXml = contents.stopTpodXmls[0];
    const extraction = await this.extractor.extract(firstXml.content);

    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    let documentDraft = await this.mapToCanonical(
      extraction,
      contents,
      fixtureFilename
    );

    // Enrich with parsing results from PolicyParser
    documentDraft = await this.enrichWithParsing(documentDraft, contents);

    // Populate context for persist
    ctx.artifactBuffer = zipBuffer;
    ctx.extractedData = { contents };

    // Extract extensions from contents
    const extensions: ExtensionDraft[] = [];
    if (contents.gioGeometries.length > 0) {
      // Create GeoExtension draft
      const geometriesWgs84: Geometry[] = [];
      const sources: string[] = [];
      
      for (const gio of contents.gioGeometries) {
        const sourceCrs = gio.crs || 'EPSG:28992';
        let transformed: Geometry;
        if (gio.geometry.type === 'FeatureCollection') {
          for (const feature of gio.geometry.features) {
            transformed = transformGeometry(feature.geometry, sourceCrs, 'EPSG:4326');
            geometriesWgs84.push(transformed);
          }
        } else {
          transformed = transformGeometry(gio.geometry, sourceCrs, 'EPSG:4326');
          geometriesWgs84.push(transformed);
        }
        sources.push(gio.identifier);
      }
      
      if (geometriesWgs84.length > 0) {
        const bbox = computeBbox(geometriesWgs84);
        const geometryForHash = geometriesWgs84.length === 1 
          ? geometriesWgs84[0]
          : { type: 'GeometryCollection' as const, geometries: geometriesWgs84 };
        const geometryHash = computeGeometryHash(geometryForHash);
        
        extensions.push({
          type: 'geo',
          documentId: '',
          payload: {
            crsSource: 'EPSG:28992',
            crsStored: 'EPSG:4326' as const,
            geometriesWgs84,
            bboxWgs84: bbox,
            geometryHash,
            sources,
          } as GeoExtensionPayload,
          version: 'v1',
          updatedAt: new Date(),
        });
      }
    }
    
    const result = await this.persist(documentDraft, extensions, ctx);
    return result as DsoAdapterResult;
  }

  /**
   * Discover documents by geometry (live API)
   * 
   * @param geometry - GeoJSON geometry (point or polygon)
   * @param bufferRadiusMeters - Optional buffer radius in meters
   * @returns Array of discovered documents
   */
  async discoverByGeometry(
    geometry: Geometry,
    bufferRadiusMeters?: number
  ): Promise<DsoDiscoveryResult[]> {
    if (!this.liveClient) {
      throw new Error('Live API client not initialized. Set useLiveApi=true in config.');
    }

    if (!this.isPoint(geometry)) {
      throw new Error('DSO discovery only supports Point geometry, not ' + geometry.type);
    }

    return await this.liveClient.discoverByGeometry(geometry, bufferRadiusMeters);
  }

  /**
   * Process a discovered document (live API)
   * 
   * Acquires ZIP from live API and processes it through the full pipeline.
   * 
   * @param discoveryResult - Discovered document from DSO API
   * @param ctx - Service context
   * @returns Adapter result
   */
  async processLiveDocument(
    discoveryResult: DsoDiscoveryResult,
    ctx: ServiceContext
  ): Promise<DsoAdapterResult> {
    if (!this.liveClient) {
      throw new Error('Live API client not initialized. Set useLiveApi=true in config.');
    }

    // Acquire: download ZIP from live API
    // Normalize discovery result to acquisition plan
    const plan = normalizeDiscoveryToPlan(discoveryResult);
    
    logger.debug({
      function: 'DsoAdapter.processLiveDocument',
      action: 'normalized_discovery_to_plan',
      plan,
      inputs: {
        identificatie: discoveryResult.identificatie,
        uriIdentificatie: discoveryResult.uriIdentificatie,
        type: discoveryResult.type,
      },
    }, '[DsoAdapter] DEBUG: Normalized discovery result to acquisition plan');
    
    if (plan.kind === 'METADATA_ONLY') {
      // Mark this as an expected, non-downloadable document
      // This allows callers to handle it gracefully without logging errors
      const error = new Error(`Document cannot be downloaded: ${plan.reason}. Identificatie: ${discoveryResult.identificatie}`);
      (error as Error & { isNotDownloadable?: boolean; isMetadataOnly?: boolean; isExpected?: boolean }).isNotDownloadable = true;
      (error as Error & { isNotDownloadable?: boolean; isMetadataOnly?: boolean; isExpected?: boolean }).isMetadataOnly = true;
      (error as Error & { isNotDownloadable?: boolean; isMetadataOnly?: boolean; isExpected?: boolean }).isExpected = true;
      throw error;
    }
    
    if (plan.kind === 'TAMIMRO') {
      // IMRO documents: Use Ruimtelijke Plannen API
      logger.info(
        { imroId: plan.imroId, type: discoveryResult.type },
        '[DsoAdapter] Detected IMRO document, using Ruimtelijke Plannen API'
      );
      
      const { RuimtelijkePlannenService } = await import('../../services/external/RuimtelijkePlannenService.js');
      const ruimtelijkeService = new RuimtelijkePlannenService(this.config.useProduction);
      
      const completePlan = await ruimtelijkeService.getCompletePlan(plan.imroId);
      
      if (completePlan.gml) {
        // For IMRO, we return GML directly (not ZIP)
        // The rest of the pipeline will handle GML extraction
        await this.imroExtractor.extract(completePlan.gml);
        // Continue with IMRO extraction path...
        // (The rest of the method should handle this case)
        throw new Error('IMRO processing in processLiveDocument needs to be completed - returning GML for now');
      }
      
      throw new Error(`No GML file available for IMRO document: ${plan.imroId}`);
    }
    
    // STOPTPOD documents: Use Omgevingsdocumenten Download API
    const regelingId = plan.regelingIdAkn;
    
    const zipBuffer = await this.liveClient.acquireZip(regelingId);

    // Extract: parse ZIP and extract components
    const contents = await this.zipParser.parse(zipBuffer);

    // Process each STOP/TPOD document in the ZIP
    if (contents.stopTpodXmls.length === 0) {
      throw new Error(`No STOP/TPOD XML files found in ZIP for: ${discoveryResult.identificatie}`);
    }

    // For MVP, process the first STOP/TPOD document
    const firstXml = contents.stopTpodXmls[0];
    const extraction = await this.extractor.extract(firstXml.content);

    // Validate fullText
    if (!extraction.fullText || extraction.fullText.trim().length === 0) {
      if (!this.config.allowEmptyFullText) {
        throw new Error('Extracted fullText is empty (use allowEmptyFullText=true to allow)');
      }
    }

    // Map: create canonical document draft
    let documentDraft = await this.mapToCanonicalFromDiscovery(
      extraction,
      contents,
      discoveryResult
    );

    // Enrich with parsing results from PolicyParser
    documentDraft = await this.enrichWithParsing(documentDraft, contents);

    // Persist: store artifact, document, chunks, extensions
    const result = await this.persistLegacy(documentDraft, zipBuffer, contents, ctx);

    return result;
  }

  /**
   * Acquire ZIP from fixture (offline mode)
   */
  private async acquireFromFixture(fixtureFilename: string): Promise<Buffer> {
    const fixturePath = this.config.fixturePath || join(process.cwd(), 'tests', 'fixtures', 'dso');
    const filePath = join(fixturePath, fixtureFilename);

    try {
      const buffer = await readFile(filePath);
      logger.debug({ fixtureFilename, size: buffer.length }, 'Read fixture ZIP');
      return buffer;
    } catch (error) {
      throw new Error(`Failed to read fixture ZIP: ${fixtureFilename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Map extracted content to canonical document draft (from fixture)
   */
  private async mapToCanonical(
    extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } },
    contents: DsoZipContents,
    sourceId: string
  ): Promise<CanonicalDocumentDraft> {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Merge metadata from all sources (extraction, XML files, OW-objecten)
    const aggregatedMetadata = this.mergeMetadata(extraction.metadata, contents.metadata, contents.owObjecten);

    // Use document type registry to normalize document type
    const rawType = (typeof aggregatedMetadata.documentType === 'string' ? aggregatedMetadata.documentType : null) || extraction.metadata?.documentType || 'omgevingsplan';
    const rawTypeStr = typeof rawType === 'string' ? rawType : String(rawType);
    const typeDefinition = getDocumentTypeDefinition(rawTypeStr.toLowerCase());
    const canonicalType = typeDefinition?.canonicalName || rawTypeStr.toLowerCase();
    const documentFamily = typeDefinition?.documentFamily || 'Omgevingsinstrument';

    // Extract dates from metadata
    const dates = this.extractDates(aggregatedMetadata);

    // DSO documents are bundles (ZIP files containing multiple formats)
    const formatComposition = this.extractFormatComposition(contents);

    // Try to construct canonicalUrl for fixtures
    // Use publicatieLink if it's a public URL (not an API endpoint), otherwise construct from sourceId
    let canonicalUrl: string | undefined;
    const publicatieLink = (extraction.metadata as Record<string, unknown>)?.publicatieLink as string | undefined;
    if (publicatieLink && !isApiEndpoint(publicatieLink)) {
      canonicalUrl = publicatieLink;
    } else if (sourceId) {
      // Construct URL from sourceId using URL builder
      try {
        canonicalUrl = buildDsoPublicUrl(sourceId);
      } catch (error) {
        // If building fails, log warning but continue without canonicalUrl
        logger.warn(
          { error, sourceId },
          'Failed to build DSO public URL from sourceId in mapToCanonical'
        );
      }
    }

    return {
      source: 'DSO',
      sourceId,
      title: (typeof aggregatedMetadata.title === 'string' ? aggregatedMetadata.title : null) || extraction.metadata?.title || 'DSO Document',
      documentFamily,
      documentType: canonicalType,
      publisherAuthority: (typeof aggregatedMetadata.bestuursorgaan === 'string' ? aggregatedMetadata.bestuursorgaan : null) || extraction.metadata?.bestuursorgaan,
      canonicalUrl,
      dates,
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [], // Will be populated in persist
      reviewStatus: 'pending_review',
      // Format information
      documentStructure: 'bundle',
      format: 'ZIP',
      formatComposition,
      // Include aggregated metadata from all XML files
      sourceMetadata: {
        ...aggregatedMetadata,
        discovery: {
          fixtureFilename: sourceId,
        },
        xmlFileCount: contents.allXmlFiles.length,
        xmlFiles: contents.allXmlFiles.map(f => f.filename),
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: publicatieLink ? this.extractWebsiteUrl(publicatieLink) : canonicalUrl ? this.extractWebsiteUrl(canonicalUrl) : undefined,
        legacyWebsiteTitel: aggregatedMetadata.bestuursorgaan || extraction.metadata?.bestuursorgaan || undefined,
        website_url: publicatieLink ? this.extractWebsiteUrl(publicatieLink) : canonicalUrl ? this.extractWebsiteUrl(canonicalUrl) : undefined,
        website_titel: aggregatedMetadata.bestuursorgaan || extraction.metadata?.bestuursorgaan || undefined,
      },
      enrichmentMetadata: {
        owObjecten: contents.owObjecten,
        xmlMetadata: contents.allXmlFiles.map(f => ({
          filename: f.filename,
          rootElement: f.rootElement,
          metadata: f.metadata,
        })),
        // Extract and link rules, activities, and areas
        ...this.extractLinkedXmlData(contents.allXmlFiles),
      },
    };
  }

  /**
   * Map extracted content to canonical document draft (from live discovery)
   */
  private async mapToCanonicalFromDiscovery(
    extraction: { fullText: string; metadata?: { title?: string; bestuursorgaan?: string; documentType?: string } },
    contents: DsoZipContents,
    discoveryResult: DsoDiscoveryResult
  ): Promise<CanonicalDocumentDraft> {
    // Truncate fullText if too large (avoid BSON limit)
    const fullText = this.truncateFullText(extraction.fullText);
    const contentFingerprint = computeContentFingerprint(fullText);

    // Merge metadata from all sources (extraction, XML files, OW-objecten, discovery)
    const aggregatedMetadata = this.mergeMetadata(
      extraction.metadata,
      contents.metadata,
      contents.owObjecten
    );
    
    // Also merge discovery result metadata (takes precedence)
    if (discoveryResult.titel) aggregatedMetadata.title = discoveryResult.titel;
    if (discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor) {
      aggregatedMetadata.bestuursorgaan = discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor;
    }
    if (discoveryResult.type) aggregatedMetadata.documentType = discoveryResult.type;
    if (discoveryResult.publicatiedatum) aggregatedMetadata.publicatiedatum = discoveryResult.publicatiedatum;
    if (discoveryResult.geldigheidsdatum) aggregatedMetadata.geldigheidsdatum = discoveryResult.geldigheidsdatum;

    // Extract dates from aggregated metadata (includes dates from all XML files)
    const dates = this.extractDates(aggregatedMetadata);
    
    // Fallback to discovery result dates if not found in metadata
    if (!dates.publishedAt && discoveryResult.publicatiedatum) {
      try {
        dates.publishedAt = new Date(discoveryResult.publicatiedatum);
      } catch {
        dates.publishedAt = new Date();
      }
    }

    // Use document type registry to normalize document type
    const rawType = (typeof aggregatedMetadata.documentType === 'string' ? aggregatedMetadata.documentType : null) 
      || discoveryResult.type 
      || extraction.metadata?.documentType 
      || 'omgevingsplan';
    const rawTypeStr = typeof rawType === 'string' ? rawType : String(rawType);
    const typeDefinition = getDocumentTypeDefinition(rawTypeStr.toLowerCase());
    const canonicalType = typeDefinition?.canonicalName || rawTypeStr.toLowerCase();
    const documentFamily = typeDefinition?.documentFamily || 'Omgevingsinstrument';

    // Try to detect type from metadata if not found
    const detectedType = detectDocumentType({
      url: discoveryResult.publicatieLink,
      title: (typeof aggregatedMetadata.title === 'string' ? aggregatedMetadata.title : null) || discoveryResult.titel || extraction.metadata?.title,
      sourceMetadata: {
        type: (typeof aggregatedMetadata.documentType === 'string' ? aggregatedMetadata.documentType : undefined) || discoveryResult.type,
        identificatie: discoveryResult.identificatie,
      },
    });
    const finalType = detectedType || canonicalType;

    // DSO documents are bundles (ZIP files containing multiple formats)
    const formatComposition = this.extractFormatComposition(contents);

    return {
      source: 'DSO',
      sourceId: discoveryResult.identificatie,
      title: (typeof aggregatedMetadata.title === 'string' ? aggregatedMetadata.title : null) || discoveryResult.titel || extraction.metadata?.title || 'DSO Document',
      documentFamily,
      documentType: finalType,
      publisherAuthority: (typeof aggregatedMetadata.bestuursorgaan === 'string' ? aggregatedMetadata.bestuursorgaan : null) || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || extraction.metadata?.bestuursorgaan,
      canonicalUrl: discoveryResult.publicatieLink,
      dates,
      fullText,
      contentFingerprint,
      language: 'nl',
      artifactRefs: [], // Will be populated in persist
      reviewStatus: 'pending_review',
      // Format information
      documentStructure: 'bundle',
      format: 'ZIP',
      formatComposition,
      sourceMetadata: {
        ...aggregatedMetadata,
        discovery: {
          identificatie: discoveryResult.identificatie,
          type: discoveryResult.type,
          opgesteldDoor: discoveryResult.opgesteldDoor,
          publicatiedatum: discoveryResult.publicatiedatum,
          geldigheidsdatum: discoveryResult.geldigheidsdatum,
        },
        xmlFileCount: contents.allXmlFiles.length,
        xmlFiles: contents.allXmlFiles.map(f => f.filename),
        // Populate legacy fields for library display compatibility
        legacyWebsiteUrl: discoveryResult.publicatieLink ? this.extractWebsiteUrl(discoveryResult.publicatieLink) : undefined,
        legacyWebsiteTitel: aggregatedMetadata.bestuursorgaan || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || undefined,
        website_url: discoveryResult.publicatieLink ? this.extractWebsiteUrl(discoveryResult.publicatieLink) : undefined,
        website_titel: aggregatedMetadata.bestuursorgaan || discoveryResult.bestuursorgaan || discoveryResult.opgesteldDoor || undefined,
      },
      enrichmentMetadata: {
        owObjecten: contents.owObjecten,
        xmlMetadata: contents.allXmlFiles.map(f => ({
          filename: f.filename,
          rootElement: f.rootElement,
          metadata: f.metadata,
        })),
        // Extract and link rules, activities, and areas
        ...this.extractLinkedXmlData(contents.allXmlFiles),
      },
    };
  }

  /**
   * Convert CanonicalDocumentDraft to CanonicalDocument for parsing
   * 
   * Creates a CanonicalDocument structure from a draft for use with PolicyParser.
   * Parsers now accept CanonicalDocument directly.
   * 
   * @param draft - Canonical document draft
   * @param contents - DSO ZIP contents (for raw XML data)
   * @returns Canonical document ready for parsing
   */
  private draftToCanonicalDocument(
    draft: CanonicalDocumentDraft,
    contents: DsoZipContents
  ): CanonicalDocument {
    // Find the primary XML file (STOP/TPOD) for raw data
    const primaryXml = contents.stopTpodXmls[0] || contents.allXmlFiles[0];
    const rawData = primaryXml?.content || undefined;

    // Create a CanonicalDocument structure
    // Store parsing-specific fields (mimeType, rawData) in sourceMetadata
    return {
      _id: '', // Will be set when document is persisted
      source: draft.source,
      sourceId: draft.sourceId,
      canonicalUrl: draft.canonicalUrl,
      title: draft.title,
      publisherAuthority: draft.publisherAuthority,
      documentFamily: draft.documentFamily,
      documentType: draft.documentType,
      dates: draft.dates,
      fullText: draft.fullText,
      contentFingerprint: draft.contentFingerprint,
      language: draft.language,
      artifactRefs: draft.artifactRefs,
      sourceMetadata: {
        ...draft.sourceMetadata,
        mimeType: 'application/xml', // DSO documents are XML
        rawData,
      },
      enrichmentMetadata: draft.enrichmentMetadata,
      documentStructure: draft.documentStructure,
      format: draft.format,
      formatComposition: draft.formatComposition,
      versionOf: draft.versionOf,
      reviewStatus: draft.reviewStatus || 'pending_review',
      reviewMetadata: draft.reviewMetadata,
      createdAt: new Date(), // Temporary
      updatedAt: new Date(), // Temporary
      schemaVersion: '1.0', // Default schema version
    };
  }

  /**
   * Enrich document draft with parsing results from PolicyParser
   * 
   * Uses PolicyParser to parse the document and extract rules, entities, and citations.
   * Stores the parsing results in enrichmentMetadata.parsingResults.
   * 
   * @param draft - Canonical document draft to enrich
   * @param contents - DSO ZIP contents (for raw XML data)
   * @returns Enriched document draft with parsing results
   */
  private async enrichWithParsing(
    draft: CanonicalDocumentDraft,
    contents: DsoZipContents
  ): Promise<CanonicalDocumentDraft> {
    try {
      logger.debug(
        { sourceId: draft.sourceId },
        '[DsoAdapter] Starting parsing with PolicyParser'
      );

      // Convert draft to CanonicalDocument for parsing
      const canonicalDoc = this.draftToCanonicalDocument(draft, contents);

      // Parse document using PolicyParser (now accepts CanonicalDocument directly)
      const parsedDoc = await this.policyParser.parse(canonicalDoc);

      logger.info(
        {
          sourceId: draft.sourceId,
          rulesCount: parsedDoc.rules.length,
          entitiesCount: parsedDoc.entities.length,
          citationsCount: parsedDoc.citations.length,
        },
        '[DsoAdapter] Successfully parsed document with PolicyParser'
      );

      // Store parsing results in enrichmentMetadata
      const enrichedDraft: CanonicalDocumentDraft = {
        ...draft,
        enrichmentMetadata: {
          ...draft.enrichmentMetadata,
          parsingResults: {
            parsedAt: parsedDoc.parsedAt,
            rules: parsedDoc.rules,
            entities: parsedDoc.entities,
            citations: parsedDoc.citations,
            metadata: parsedDoc.metadata,
          },
        },
      };

      return enrichedDraft;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sourceId: draft.sourceId,
        },
        '[DsoAdapter] Failed to parse document with PolicyParser, continuing without parsing results'
      );
      // Don't fail the entire mapping if parsing fails
      return draft;
    }
  }

  /**
   * Extract and link XML data (rules, activities, areas)
   * 
   * Uses DsoXmlLinker to create bidirectional links between rules, activities, and areas.
   * 
   * @param allXmlFiles - All parsed XML files from DSO ZIP
   * @returns Linked XML data structure
   */
  private extractLinkedXmlData(allXmlFiles: DsoZipContents['allXmlFiles']): Record<string, unknown> {
    logger.debug(
      { xmlFileCount: allXmlFiles.length },
      '[DsoAdapter] Extracting and linking XML data (rules, activities, areas)'
    );

    try {
      const linkedData = this.xmlLinker.extractAndLink(allXmlFiles);

      logger.info(
        {
          rules: linkedData.statistics.totalRules,
          activities: linkedData.statistics.totalActivities,
          areas: linkedData.statistics.totalAreas,
          ruleTexts: linkedData.statistics.totalRuleTexts,
          linksCreated: {
            rulesWithAreas: linkedData.statistics.rulesWithAreas,
            rulesWithTexts: linkedData.statistics.rulesWithTexts,
            areasWithRules: linkedData.statistics.areasWithRules,
          },
        },
        '[DsoAdapter] Successfully extracted and linked XML data'
      );

      return {
        linkedXmlData: {
          rules: linkedData.rules,
          activities: linkedData.activities,
          regulationAreas: linkedData.regulationAreas,
          ruleTexts: linkedData.ruleTexts,
          links: linkedData.links,
          statistics: linkedData.statistics,
        },
      };
    } catch (error) {
      logger.error(
        { error, xmlFileCount: allXmlFiles.length },
        '[DsoAdapter] Failed to extract and link XML data, continuing without links'
      );
      // Don't fail the entire mapping if linking fails
      return {};
    }
  }

  /**
   * Persist document, chunks, and extensions (legacy method)
   * 
   * @deprecated Use IAdapter.persist() instead. This method is kept for backward compatibility.
   */
  private async persistLegacy(
    documentDraft: CanonicalDocumentDraft,
    zipBuffer: Buffer,
    contents: DsoZipContents,
    ctx: ServiceContext
  ): Promise<DsoAdapterResult> {
    // Store artifact
    const artifactRef = await this.artifactStore.store({
      bytes: zipBuffer,
      mimeType: 'application/zip',
      provenance: {
        source: 'DSO',
        acquiredAt: new Date(),
        notes: 'Fixture ZIP for testing',
      },
    });

    // Add artifact ref to document
    documentDraft.artifactRefs = [artifactRef];

    // Upsert document
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

    // Process geometries and create GeoExtension
    let hasGeometry = false;
    if (contents.gioGeometries.length > 0) {
      await this.processGeometries(document._id, contents.gioGeometries, ctx);
      hasGeometry = true;
    }

    logger.info(
      {
        documentId: document._id,
        chunkCount: chunkingResult.chunks.length,
        hasGeometry,
      },
      'Persisted DSO document'
    );

    return {
      documentId: document._id,
      artifactRef,
      chunkCount: chunkingResult.chunks.length,
      hasGeometry,
    };
  }

  /**
   * Process geometries and create GeoExtension
   */
  private async processGeometries(
    documentId: string,
    gioGeometries: Array<{ identifier: string; geometry: Geometry | FeatureCollection; crs?: string }>,
    ctx: ServiceContext
  ): Promise<void> {
    // Transform geometries to WGS84
    const geometriesWgs84: Geometry[] = [];
    const sources: string[] = [];

    for (const gio of gioGeometries) {
      const sourceCrs = gio.crs || 'EPSG:28992'; // Default to RD for DSO
      
      // Transform to WGS84
      let transformed: Geometry;
      if (gio.geometry.type === 'FeatureCollection') {
        // Extract geometries from FeatureCollection
        for (const feature of gio.geometry.features) {
          transformed = transformGeometry(feature.geometry, sourceCrs, 'EPSG:4326');
          geometriesWgs84.push(transformed);
        }
      } else {
        transformed = transformGeometry(gio.geometry, sourceCrs, 'EPSG:4326');
        geometriesWgs84.push(transformed);
      }

      sources.push(gio.identifier);
    }

    if (geometriesWgs84.length === 0) {
      return;
    }

    // Compute bbox
    const bbox = computeBbox(geometriesWgs84);

    // Compute geometry hash (for idempotency)
    // Use first geometry or combine all geometries
    const geometryForHash = geometriesWgs84.length === 1 
      ? geometriesWgs84[0]
      : {
          type: 'GeometryCollection' as const,
          geometries: geometriesWgs84,
        };
    const geometryHash = computeGeometryHash(geometryForHash);

    // Create GeoExtension payload
    const geoPayload = {
      crsSource: 'EPSG:28992', // DSO typically uses RD
      crsStored: 'EPSG:4326' as const,
      geometriesWgs84,
      bboxWgs84: bbox,
      geometryHash,
      sources,
    };

    // Upsert GeoExtension (will enqueue outbox event)
    await this.geoExtensionService.upsert(documentId, geoPayload, ctx);
  }

  /**
   * Check if buffer is a GML file (IMRO document)
   */
  private isGmlFile(buffer: Buffer): boolean {
    const start = buffer.toString('utf-8', 0, Math.min(500, buffer.length));
    return start.includes('<imro:FeatureCollectionIMRO') || 
           start.includes('FeatureCollectionIMRO') ||
           start.includes('xmlns:imro') ||
           start.includes('IMRO2008') ||
           start.includes('IMRO2006');
  }

  /**
   * Parse GML file as geometry (for GeoExtension)
   * 
   * This is a simplified implementation - full GML parsing would require a proper GML parser.
   * For now, we extract basic geometry information from the GML structure.
   */
  private async parseGmlAsGeometry(gmlBuffer: Buffer): Promise<GioGeometry | null> {
    try {
      const gmlString = gmlBuffer.toString('utf-8');
      const { parseStringPromise } = await import('xml2js');
      
      const parsed = await parseStringPromise(gmlString, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
      });

      // Extract CRS and bounding box from boundedBy envelope
      let crs = 'EPSG:28992'; // Default for Dutch RD
      const featureCollection = this.findInParsed(parsed, [
        'imro:FeatureCollectionIMRO',
        'FeatureCollectionIMRO',
      ]);

      if (!featureCollection || typeof featureCollection !== 'object') {
        return null;
      }

      const boundedBy = this.findInParsed(featureCollection, ['boundedBy', 'imro:boundedBy']);
      if (!boundedBy) {
        return null;
      }

      const envelope = this.findInParsed(boundedBy, ['gml:Envelope', 'Envelope']);
      if (!envelope || typeof envelope !== 'object') {
        return null;
      }

      const env = envelope as Record<string, unknown>;
      
      // Extract CRS from srsName
      const srsName = env['srsName'] || env['srsname'];
      if (typeof srsName === 'string') {
        // Extract EPSG code from srsName (e.g., "urn:ogc:def:crs:EPSG::28992")
        const epsgMatch = srsName.match(/EPSG[:\s]*(\d+)/i);
        if (epsgMatch) {
          crs = `EPSG:${epsgMatch[1]}`;
        }
      }
      
      // Extract bounding box coordinates
      const lowerCorner = this.findInParsed(env, ['gml:lowerCorner', 'lowerCorner']);
      const upperCorner = this.findInParsed(env, ['gml:upperCorner', 'upperCorner']);
      
      if (!lowerCorner || !upperCorner) {
        return null;
      }

      // Parse coordinates (format: "x y" or "x,y")
      const parseCoords = (corner: unknown): [number, number] | null => {
        if (typeof corner !== 'string') {
          return null;
        }
        const parts = corner.trim().split(/[\s,]+/);
        if (parts.length < 2) {
          return null;
        }
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (isNaN(x) || isNaN(y)) {
          return null;
        }
        return [x, y];
      };
      
      const lower = parseCoords(lowerCorner);
      const upper = parseCoords(upperCorner);
      
      if (!lower || !upper) {
        return null;
      }

      // Create a Polygon from the bounding box
      const polygon: Geometry = {
        type: 'Polygon',
        coordinates: [[
          [lower[0], lower[1]], // lower-left
          [upper[0], lower[1]], // lower-right
          [upper[0], upper[1]], // upper-right
          [lower[0], upper[1]], // upper-left
          [lower[0], lower[1]], // close polygon
        ]],
      };
      
      return {
        identifier: 'imro-gml',
        geometry: polygon,
        crs,
      };
      
      // Fallback: return placeholder if bounding box extraction fails
      logger.debug('GML bounding box extraction failed, returning placeholder geometry');
      return {
        identifier: 'imro-gml',
        geometry: {
          type: 'GeometryCollection',
          geometries: [],
        },
        crs,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to parse GML as geometry');
      return null;
    }
  }

  /**
   * Helper to find value in parsed XML object
   */
  private findInParsed(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      if (key in obj) {
        return (obj as Record<string, unknown>)[key];
      }
      
      // Try without namespace
      const keyBase = key.includes(':') ? key.split(':').pop() : key;
      for (const [objKey, value] of Object.entries(obj)) {
        const objKeyBase = objKey.includes(':') ? objKey.split(':').pop() : objKey;
        if (objKeyBase?.toLowerCase() === keyBase?.toLowerCase()) {
          return value;
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

  /**
   * Merge metadata from multiple sources (extraction, XML files, OW-objecten)
   */
  /**
   * Merge metadata from multiple sources with priority order
   * 
   * Priority order:
   * 1. Discovery result (highest priority)
   * 2. Regeling/Metadata.xml
   * 3. Regeling/Identificatie.xml (for FRBR identifiers)
   * 4. StopTpodExtractor metadata (from Tekst.xml)
   * 5. Other XML files
   * 
   * The specialized extractors return structured metadata with:
   * - source: XML file source
   * - purpose: What the file is for
   * - useCase: How it's used
   * - decision: Whether to use it
   * - Actual extracted fields (title, dates, etc.)
   */
  private mergeMetadata(
    extractionMetadata?: { title?: string; bestuursorgaan?: string; documentType?: string },
    zipMetadata?: Record<string, unknown>,
    owObjecten?: unknown
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    // Start with extraction metadata (from StopTpodExtractor - Tekst.xml)
    if (extractionMetadata) {
      if (extractionMetadata.title) merged.title = extractionMetadata.title;
      if (extractionMetadata.bestuursorgaan) merged.bestuursorgaan = extractionMetadata.bestuursorgaan;
      if (extractionMetadata.documentType) merged.documentType = extractionMetadata.documentType;
    }

    // Merge ZIP metadata (from all XML files via specialized extractors)
    // The extractors return structured metadata, so we need to extract the actual fields
    if (zipMetadata) {
      // Extract core fields from specialized extractors
      // Priority: Regeling/Metadata.xml > Regeling/Identificatie.xml > others
      
      // From Regeling/Metadata.xml (highest priority for core fields)
      if (zipMetadata.title && !merged.title) merged.title = zipMetadata.title;
      if (zipMetadata.bestuursorgaan && !merged.bestuursorgaan) merged.bestuursorgaan = zipMetadata.bestuursorgaan;
      if (zipMetadata.publishedAt && !merged.publishedAt) merged.publishedAt = zipMetadata.publishedAt;
      if (zipMetadata.validFrom && !merged.validFrom) merged.validFrom = zipMetadata.validFrom;
      if (zipMetadata.validUntil && !merged.validUntil) merged.validUntil = zipMetadata.validUntil;
      if (zipMetadata.status && !merged.status) merged.status = zipMetadata.status;
      if (zipMetadata.documentType && !merged.documentType) merged.documentType = zipMetadata.documentType;
      
      // From Regeling/Identificatie.xml (for FRBR identifiers)
      if (zipMetadata.frbrWork) merged.frbrWork = zipMetadata.frbrWork;
      if (zipMetadata.frbrExpression) merged.frbrExpression = zipMetadata.frbrExpression;
      if (zipMetadata.soortWork && !merged.documentType) merged.documentType = zipMetadata.soortWork;
      
      // From Regeling/VersieMetadata.xml
      if (zipMetadata.versie) merged.versie = zipMetadata.versie;
      if (zipMetadata.versienummer) merged.versienummer = zipMetadata.versienummer;
      
      // Store all structured metadata for reference (organized by source)
      merged.xmlMetadata = zipMetadata;
    }

    // Add OW-objecten metadata if available
    if (owObjecten && typeof owObjecten === 'object' && owObjecten !== null) {
      const ow = owObjecten as Record<string, unknown>;
      if (ow.identificatie) merged.owIdentificatie = ow.identificatie;
      if (ow.titel) merged.owTitel = ow.titel;
    }

    return merged;
  }

  /**
   * Extract dates from metadata
   */
  private extractDates(metadata: Record<string, unknown>): {
    publishedAt?: Date;
    validFrom?: Date;
    validUntil?: Date;
  } {
    const dates: {
      publishedAt?: Date;
      validFrom?: Date;
      validUntil?: Date;
    } = {};

    // Try to parse various date fields
    const dateFields = {
      publishedAt: ['publicatiedatum', 'publicatieDatum', 'publishedAt', 'publicationDate'],
      validFrom: ['geldigheidsdatum', 'geldigVanaf', 'validFrom', 'validFromDate'],
      validUntil: ['vervaldatum', 'geldigTot', 'validUntil', 'validUntilDate', 'expiryDate'],
    };

    for (const [key, fieldNames] of Object.entries(dateFields)) {
      for (const fieldName of fieldNames) {
        const value = metadata[fieldName];
        if (value) {
          try {
            const date = typeof value === 'string' ? new Date(value) : value instanceof Date ? value : null;
            if (date && !isNaN(date.getTime())) {
              dates[key as keyof typeof dates] = date;
              break;
            }
          } catch {
            // Invalid date, skip
          }
        }
      }
    }

    // Default to current date if no publishedAt found
    if (!dates.publishedAt) {
      dates.publishedAt = new Date();
    }

    return dates;
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
      // Create a buffer and slice it to ensure we stay within byte limit
      const buffer = Buffer.from(text, 'utf8');

      // Slice buffer to max bytes
      const truncatedBuffer = buffer.subarray(0, MAX_BYTES);

      // Ensure we don't cut in the middle of a multi-byte character
      // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
      // We backtrack until we find a start byte (0xxxxxxx or 11xxxxxx)
      // Or simply use string conversion with 'ignore' to drop incomplete chars,
      // but manual backtracking is safer to avoid garbage at the end.
      let end = truncatedBuffer.length;
      while (end > 0 && (truncatedBuffer[end - 1] & 0xC0) === 0x80) {
        end--;
      }
      // If we backtracked, reduce the slice. If we hit the start of a multi-byte char (11xxxxxx),
      // we should also exclude that start byte because it's incomplete.
      // But simple rule: just ensure the last byte is not a continuation.
      // Actually, if we cut a multi-byte char, the last bytes in the buffer might be the start of one.
      // Safe approach: Convert a slightly smaller substring and check size, or use Buffer.toString which handles incomplete chars by replacing or dropping.
      // Safest and simplest: Buffer.toString('utf8') on sliced buffer might produce a replacement char at the end.

      // Better approach: Substring by character estimate, then verify bytes.
      // But creating a large buffer is memory intensive.

      // Optimization: substring to (MAX_BYTES / 4) characters is guaranteed safe, but too aggressive.
      // Substring to MAX_BYTES characters is definitely >= MAX_BYTES.
      // Substring to (MAX_BYTES / 1.1) characters is a good guess for Dutch text.

      // Let's stick to the buffer slice method but handle the cut properly.
      // Buffer.toString('utf8', 0, end) automatically handles incomplete sequences if we cut at a character boundary.
      // If we cut inside a sequence, the last character might be invalid.
      // Using 'ignore' is deprecated/not standard in toString.

      // Let's refine the backtracking:
      // A start byte matches 0xxxxxxx (0x00-0x7F) or 11xxxxxx (0xC0-0xFF).
      // A continuation byte matches 10xxxxxx (0x80-0xBF).
      // We want to stop *before* an incomplete sequence.
      // If the byte at `end` (which we excluded) was a continuation, we might have included the start.
      // We need to look at the *last included byte*.

      // Actually, let's keep it simple: use the buffer slice and convert back to string.
      // JavaScript's Buffer.toString() replaces invalid sequences with  (REPLACEMENT CHARACTER).
      // We can accept that or try to trim it.
      const truncatedText = truncatedBuffer.toString('utf8');

      // Remove potentially partial character at the end (the replacement char)
      // if the last character is the replacement char and it wasn't in the original text at that position
      // (This is an edge case optimization, standard toString is usually fine)

      return truncatedText + '\n\n[TRUNCATED: Content exceeded storage limit]';
    }

    return text;
  }
}

