/**
 * Plan Suite v2 - Contract Types
 * 
 * TypeScript types and interfaces for canonical document parsing.
 * These types match the authoritative contracts defined in:
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * 
 * All public names MUST match the contracts document exactly.
 */

/**
 * Document source enumeration
 */
export type DocumentSource = 'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'IPLO';

/**
 * Document family enumeration
 */
export type DocumentFamily = 'Omgevingsinstrument' | 'Juridisch' | 'Beleid' | 'Web' | 'Geo' | 'Other';

/**
 * Extension type enumeration
 */
export type ExtensionType = 'geo' | 'legal' | 'web';

/**
 * Document format enumeration
 * 
 * @see docs/analysis/document-type-hierarchy.md
 */
export type DocumentFormat = 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';

/**
 * Document structure type
 */
export type DocumentStructure = 'singleton' | 'bundle';

/**
 * Document review status
 * 
 * Tracks the human review state of documents in the library.
 * - 'pending_review': Document has been ingested but not yet reviewed
 * - 'approved': Document has been reviewed and accepted into the library
 * - 'rejected': Document has been reviewed and rejected (may be deleted or archived)
 * - 'needs_revision': Document requires changes before approval
 */
export type DocumentReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'needs_revision';

/**
 * Review metadata for tracking review history
 */
export interface DocumentReviewMetadata {
  reviewedAt?: Date;
  reviewedBy?: string; // User ID
  reviewNotes?: string;
  previousStatus?: DocumentReviewStatus;
}

/**
 * Individual file entry in a bundle
 * 
 * Describes a single file within a document bundle.
 */
export interface BundleFileEntry {
  filename: string; // Full path within bundle (e.g., 'juridische-tekst/regeling.xml')
  format: DocumentFormat;
  sizeBytes?: number; // File size in bytes
  purpose?: string; // Purpose: 'legal-text', 'geographic-data', 'metadata', etc.
  mimeType?: string; // MIME type if known
}

/**
 * Format manifest entry for document bundles
 * 
 * Describes a format present in a multi-file document package.
 * 
 * @see docs/analysis/document-type-hierarchy.md
 */
export interface FormatManifest {
  format: DocumentFormat;
  count: number; // Number of files of this format
  primary?: boolean; // Is this the primary/dominant format?
  purpose?: string; // Purpose: 'legal-text', 'geographic-data', 'metadata', etc.
  filePatterns?: string[]; // File path patterns (e.g., 'juridische-tekst/*.xml') - deprecated, use files instead
  files?: BundleFileEntry[]; // Individual files of this format (preferred over filePatterns)
}

/**
 * Format composition for document bundles
 * 
 * Describes what formats are present in a multi-file document package.
 * 
 * @see docs/analysis/document-type-hierarchy.md
 */
export interface FormatComposition {
  formats: FormatManifest[]; // List of formats present with details
  totalFiles?: number; // Total number of files in the bundle
  bundleFormat?: DocumentFormat; // Format of the bundle itself (e.g., 'ZIP')
}

/**
 * Artifact provenance information
 */
export interface ArtifactProvenance {
  source: DocumentSource;
  acquiredAt: Date;
  requestId?: string;
  url?: string;
  headers?: Record<string, string>;
  notes?: string;
}

/**
 * ArtifactRef - Reference to a stored artifact
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */
export interface ArtifactRef {
  sha256: string; // hex string
  storageKey: string; // provider key/path; derived from sha256
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  provenance: ArtifactProvenance;
}

/**
 * Document dates
 */
export interface DocumentDates {
  publishedAt?: Date;
  validFrom?: Date;
  validTo?: Date;
}

/**
 * CanonicalDocumentDraft - Pre-persistence document payload
 * 
 * This is the input type for creating/updating canonical documents.
 * All required fields must be provided before persistence.
 * 
 * @see CanonicalDocument - The persisted document type
 * @see docs/migration-guides/brondocumenten-to-canonical.md - Migration guide
 * @deprecated Legacy: Use this instead of BronDocumentCreateInput
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */
export interface CanonicalDocumentDraft {
  source: DocumentSource;
  sourceId: string; // required when stable
  canonicalUrl?: string;
  title: string;
  publisherAuthority?: string;
  documentFamily: DocumentFamily;
  documentType: string;
  dates: DocumentDates;
  fullText: string; // required
  contentFingerprint: string; // required, sha256 hex of normalized fullText
  language: string; // default: 'nl'
  artifactRefs: ArtifactRef[]; // required, may be empty for synthetic docs
  httpStatus?: number; // Optional: HTTP status code from retrieval
  sourceMetadata: Record<string, unknown>; // raw payloads minus raw binaries
  enrichmentMetadata?: Record<string, unknown>; // processed metadata; versioned subtrees allowed
  // Format information
  documentStructure?: DocumentStructure; // 'singleton' | 'bundle'
  format?: DocumentFormat; // Primary format (for singletons) or package format (for bundles)
  formatComposition?: FormatComposition; // For bundles: what formats are included
  // Versioning
  versionOf?: string; // Optional: reference to previous version document ID (for document evolution tracking)
  // Review status
  reviewStatus?: DocumentReviewStatus; // Optional: defaults to 'pending_review' on creation
  reviewMetadata?: DocumentReviewMetadata; // Optional: tracking review history
  // Tags and collections
  tags?: string[]; // Array of tag IDs
  collectionIds?: string[]; // Array of collection IDs
}

/**
 * Chunk offsets within the document
 */
export interface ChunkOffsets {
  start: number;
  end: number;
}

/**
 * Chunk embedding metadata
 */
export interface ChunkEmbedding {
  modelId: string;
  dims: number;
  vectorRef: string; // reference to vector storage
  updatedAt: Date;
}

/**
 * CanonicalChunkDraft - Pre-persistence chunk payload
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */
export interface CanonicalChunkDraft {
  chunkId: string; // deterministic
  documentId: string;
  chunkIndex: number; // 0..n-1 stable for a given chunking version
  text: string;
  offsets: ChunkOffsets;
  headingPath?: string[]; // optional
  legalRefs?: string[]; // optional; populated later
  chunkFingerprint: string;
  embedding?: ChunkEmbedding; // optional
}

/**
 * ExtensionDraft - Pre-persistence extension payload
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */
export interface ExtensionDraft {
  type: ExtensionType;
  documentId: string;
  payload: Record<string, unknown>; // JSON payload
  version: string; // schema version
  updatedAt: Date;
}

/**
 * Context for service operations (transaction, user, etc.)
 */
export interface ServiceContext {
  session?: unknown; // MongoDB ClientSession
  userId?: string;
  requestId?: string;
  [key: string]: unknown; // allow additional context fields
}

/**
 * Paging parameters
 */
export interface PagingParams {
  limit?: number;
  skip?: number;
  page?: number;
}

/**
 * Query filters for document search
 */
export interface DocumentFilters {
  source?: DocumentSource;
  sourceId?: string;
  documentFamily?: DocumentFamily | DocumentFamily[];
  documentType?: string | string[];
  language?: string;
  publisherAuthority?: string;
  // Review status filters
  reviewStatus?: DocumentReviewStatus | DocumentReviewStatus[];
  // Temporal filters
  validFrom?: Date;
  validTo?: Date;
  publishedAfter?: Date;
  publishedBefore?: Date;
  // Spatial filters
  areaId?: string;
  areaIds?: string[];
  // Workflow-specific filters (stored in enrichmentMetadata)
  queryId?: string;
  workflowRunId?: string;
  workflowId?: string;
  stepId?: string;
  [key: string]: unknown; // allow additional filters
}

/**
 * Adapter contract - All adapters MUST implement this interface
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface IAdapter {
  discover(input: unknown): Promise<unknown[]>; // SourceRecord[]
  acquire(record: unknown): Promise<unknown>; // ArtifactBundle
  extract(bundle: unknown): Promise<unknown>; // ExtractedContent
  map(extracted: unknown): CanonicalDocumentDraft;
  extensions(extracted: unknown): ExtensionDraft[]; // optional
  validate(draft: CanonicalDocumentDraft): void; // schema validation; throws on failure
  persist(draft: CanonicalDocumentDraft, extensions: ExtensionDraft[], ctx: ServiceContext): Promise<unknown>; // CanonicalDocument
}

/**
 * CanonicalDocumentService interface
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface CanonicalDocumentService {
  upsertBySourceId(draft: CanonicalDocumentDraft, ctx: ServiceContext): Promise<unknown>; // CanonicalDocument
  upsertByFingerprint(draft: CanonicalDocumentDraft, ctx: ServiceContext): Promise<unknown>; // CanonicalDocument
  findById(id: string): Promise<unknown | null>; // CanonicalDocument | null
  findByQuery(filters: DocumentFilters, paging?: PagingParams): Promise<unknown>; // CanonicalDocument[]
  getDocumentWithExtensions(documentId: string, extensionTypes?: ExtensionType[], ctx?: ServiceContext): Promise<unknown | null>; // (CanonicalDocument & { extensions: Partial<Record<ExtensionType, unknown>> }) | null
  getDocumentsWithExtensions(documentIds: string[], extensionTypes?: ExtensionType[], ctx?: ServiceContext): Promise<unknown[]>; // Array<(CanonicalDocument & { extensions: Partial<Record<ExtensionType, unknown>> }) | null>
  getArtifactContent(documentId: string, mimeType?: string): Promise<unknown | null>; // Buffer | null
  getArtifactAsString(documentId: string, mimeType?: string, encoding?: BufferEncoding): Promise<unknown | null>; // string | null
  getArtifactRefs(documentId: string): Promise<unknown[]>; // ArtifactRef[]
  getArtifactRefByMimeType(documentId: string, mimeType: string): Promise<unknown | null>; // ArtifactRef | null
  extractFileFromBundle(documentId: string, filename: string, bundleMimeType?: string): Promise<unknown | null>; // Buffer | null
  extractFileFromBundleAsString(documentId: string, filename: string, bundleMimeType?: string, encoding?: BufferEncoding): Promise<unknown | null>; // string | null
  listBundleFiles(documentId: string, bundleMimeType?: string): Promise<unknown[]>; // BundleFileEntry[]
  getBundleFilesByFormat(documentId: string, format: string, bundleMimeType?: string): Promise<unknown[]>; // BundleFileEntry[]
  withTransaction<T>(fn: (ctx: ServiceContext) => Promise<T>): Promise<T>;
  updateEnrichmentMetadata(documentId: string, enrichmentMetadata: Record<string, unknown>, ctx?: ServiceContext): Promise<boolean>;
  bulkUpdateReviewStatus(params: { documentIds: string[]; reviewStatus: DocumentReviewStatus; reviewNotes?: string; userId?: string; }, ctx?: ServiceContext): Promise<{ success: boolean; total: number; successful: number; failed: number; results: Array<{ documentId: string; status: 'fulfilled' | 'rejected'; reason?: unknown; }>; }>;
}

/**
 * CanonicalChunkService interface
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface CanonicalChunkService {
  upsertChunks(documentId: string, chunks: CanonicalChunkDraft[], ctx: ServiceContext): Promise<unknown>; // CanonicalChunk[]
  findChunks(documentId: string, paging?: PagingParams): Promise<unknown>; // CanonicalChunk[]
  semanticRetrieve(queryEmbedding: number[], filters: DocumentFilters, topK: number): Promise<unknown>; // CanonicalChunk[]
}

/**
 * EmbeddingService interface
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface EmbeddingService {
  ensureEmbeddingsForChunks(chunkIds: string[], modelId: string, ctx: ServiceContext): Promise<unknown>;
  embedAndUpsert(chunks: CanonicalChunkDraft[], modelId: string, ctx: ServiceContext): Promise<unknown>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  score: number; // similarity score (higher is better)
}

/**
 * VectorSearchProvider interface
 * 
 * Provides vector similarity search over chunk embeddings.
 * Supports filtered retrieval by documentIds (from PostGIS/keyword prefilter).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/06-vector-search.md
 */
export interface VectorSearchProvider {
  /**
   * Upsert embeddings for chunks
   * 
   * Idempotent by (chunkId, modelId). If the same key exists, the embedding is updated.
   * 
   * @param chunkId - Chunk ID
   * @param documentId - Document ID
   * @param modelId - Embedding model ID
   * @param embedding - Embedding vector
   * @param dims - Vector dimensions
   */
  upsertEmbedding(
    chunkId: string,
    documentId: string,
    modelId: string,
    embedding: number[],
    dims: number
  ): Promise<void>;

  /**
   * Search for similar chunks
   * 
   * @param queryEmbedding - Query embedding vector
   * @param modelId - Model ID to search within
   * @param topK - Number of results to return
   * @param filters - Optional filters
   * @param filters.documentIds - Optional: only search within these document IDs
   * @returns Array of search results with chunkId, documentId, and score
   */
  search(
    queryEmbedding: number[],
    modelId: string,
    topK: number,
    filters?: { documentIds?: string[] }
  ): Promise<VectorSearchResult[]>;

  /**
   * Delete embedding for a chunk
   * 
   * @param chunkId - Chunk ID
   * @param modelId - Model ID
   */
  deleteEmbedding(chunkId: string, modelId: string): Promise<void>;

  /**
   * Ensure schema and indexes exist
   * 
   * Should be called during application startup.
   */
  ensureSchema(): Promise<void>;
}

/**
 * ExtensionService interface (generic)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface ExtensionService<T = unknown> {
  upsert(documentId: string, payload: T, ctx: ServiceContext): Promise<unknown>;
  get(documentId: string): Promise<T | null>;
  delete(documentId: string): Promise<void>;
}

/**
 * GeoIndexService interface (PostGIS)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */
export interface GeoIndexService {
  upsertGeometries(documentId: string, geometriesWgs84: unknown[], bbox: number[], geometryHash: string, ctx: ServiceContext): Promise<void>;
  queryIntersect(geometryWgs84: unknown, filters: DocumentFilters): Promise<unknown[]>; // documentIds
  queryWithin(bboxWgs84: number[], filters: DocumentFilters): Promise<unknown[]>; // documentIds
}

/**
 * CanonicalDocument - Persisted document with system fields
 * 
 * This is the primary document type used throughout the application.
 * All new code should use CanonicalDocument instead of legacy BronDocument.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 * @see docs/migration-guides/brondocumenten-to-canonical.md - Migration guide
 * @deprecated Legacy: Use this instead of BronDocumentDocument
 */
export interface CanonicalDocument {
  _id: string; // MongoDB ObjectId as string
  source: DocumentSource;
  sourceId: string;
  canonicalUrl?: string;
  title: string;
  publisherAuthority?: string;
  documentFamily: DocumentFamily;
  documentType: string;
  dates: DocumentDates;
  fullText: string; // required
  contentFingerprint: string; // required, sha256 hex of normalized fullText
  language: string; // default: 'nl'
  artifactRefs: ArtifactRef[]; // required, may be empty for synthetic docs
  httpStatus?: number; // Optional: HTTP status code from retrieval
  sourceMetadata: Record<string, unknown>; // raw payloads minus raw binaries
  enrichmentMetadata?: Record<string, unknown>; // processed metadata; versioned subtrees allowed
  // Format information
  documentStructure?: DocumentStructure; // 'singleton' | 'bundle'
  format?: DocumentFormat; // Primary format (for singletons) or package format (for bundles)
  formatComposition?: FormatComposition; // For bundles: what formats are included
  // Versioning
  versionOf?: string; // Optional: reference to previous version document ID (for document evolution tracking)
  // Review status - tracks human review state in the library
  reviewStatus: DocumentReviewStatus; // Required: all documents have a review status
  reviewMetadata?: DocumentReviewMetadata; // Optional: tracking review history
  // Tags and collections
  tags?: string[]; // Array of tag IDs
  collectionIds?: string[]; // Array of collection IDs
  // System fields
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: string; // schema version for evolution
}

/**
 * CanonicalChunk - Persisted chunk with system fields
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */
export interface CanonicalChunk {
  _id: string; // MongoDB ObjectId as string
  chunkId: string; // deterministic
  documentId: string;
  chunkIndex: number; // 0..n-1 stable for a given chunking version
  text: string;
  offsets: ChunkOffsets;
  headingPath?: string[]; // optional
  legalRefs?: string[]; // optional; populated later
  chunkFingerprint: string;
  embedding?: ChunkEmbedding; // optional
  // System fields
  createdAt: Date;
  updatedAt: Date;
}

