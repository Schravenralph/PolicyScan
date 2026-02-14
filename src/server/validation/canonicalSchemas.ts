/**
 * Plan Suite v2 - Canonical Document Validation Schemas
 * 
 * Zod schemas for runtime validation of canonical document drafts.
 * These schemas enforce the contracts defined in:
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * 
 * Validation must be called at adapter boundaries before persistence.
 */

import { z } from 'zod';

/**
 * Document source enumeration schema
 */
export const documentSourceSchema = z.enum(['DSO', 'Rechtspraak', 'Wetgeving', 'Gemeente', 'PDOK', 'Web', 'IPLO']);

/**
 * Document family enumeration schema
 */
export const documentFamilySchema = z.enum([
  'Omgevingsinstrument',
  'Juridisch',
  'Beleid',
  'Web',
  'Geo',
  'Other',
]);

/**
 * Extension type enumeration schema
 */
export const extensionTypeSchema = z.enum(['geo', 'legal', 'web']);

/**
 * Document format enumeration schema
 * 
 * @see docs/analysis/document-type-hierarchy.md
 */
export const documentFormatSchema = z.enum([
  'PDF',
  'Web',
  'XML',
  'DOCX',
  'JSON',
  'GeoJSON',
  'Shapefile',
  'ZIP',
  'Other',
]);

/**
 * Document structure schema
 */
export const documentStructureSchema = z.enum(['singleton', 'bundle']);

/**
 * Document review status schema
 * 
 * Tracks the human review state of documents in the library.
 */
export const documentReviewStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'needs_revision',
]);

/**
 * Document review metadata schema
 * 
 * Tracks review history and details.
 */
export const documentReviewMetadataSchema = z.object({
  reviewedAt: z.date().optional(),
  reviewedBy: z.string().optional(),
  reviewNotes: z.string().optional(),
  previousStatus: documentReviewStatusSchema.optional(),
});

/**
 * Format manifest schema
 * 
 * Describes a format present in a multi-file document package.
 */
export const formatManifestSchema = z.object({
  format: documentFormatSchema,
  count: z.number().int().nonnegative('count must be a non-negative integer'),
  primary: z.boolean().optional(),
  purpose: z.string().optional(),
  filePatterns: z.array(z.string()).optional(),
});

/**
 * Format composition schema
 * 
 * Describes what formats are present in a multi-file document package.
 */
export const formatCompositionSchema = z.object({
  formats: z.array(formatManifestSchema).min(1, 'formats array must contain at least one format'),
});

/**
 * Artifact provenance schema
 */
export const artifactProvenanceSchema = z.object({
  source: documentSourceSchema,
  acquiredAt: z.date(),
  requestId: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

/**
 * ArtifactRef schema
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */
export const artifactRefSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 must be a 64-character hex string'),
  storageKey: z.string().min(1, 'storageKey is required'),
  mimeType: z.string().min(1, 'mimeType is required'),
  sizeBytes: z.number().int().nonnegative('sizeBytes must be a non-negative integer'),
  createdAt: z.date(),
  provenance: artifactProvenanceSchema,
});

/**
 * Document dates schema
 */
export const documentDatesSchema = z.object({
  publishedAt: z.date().optional(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
});

/**
 * CanonicalDocumentDraft schema
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */
export const canonicalDocumentDraftBase = z.object({
  source: documentSourceSchema,
  sourceId: z.string().min(1, 'sourceId is required'),
  canonicalUrl: z.string().url().optional(),
  title: z.string().min(1, 'title is required'),
  publisherAuthority: z.string().optional(),
  documentFamily: documentFamilySchema,
  documentType: z.string().min(1, 'documentType is required'),
  dates: z.object({
    publishedAt: z.date().optional(),
    validFrom: z.date().optional(),
    validTo: z.date().optional(),
  }),
  fullText: z.string().min(1, 'fullText is required and must not be empty'),
  contentFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'contentFingerprint must be a 64-character hex string (sha256)'),
  language: z.string().min(2).max(5).default('nl'),
  artifactRefs: z.array(artifactRefSchema).default([]),
  httpStatus: z.number().int().optional(),
  sourceMetadata: z.record(z.string(), z.unknown()),
  enrichmentMetadata: z.record(z.string(), z.unknown()).optional(),
  // Format information
  documentStructure: documentStructureSchema.optional(),
  format: documentFormatSchema.optional(),
  formatComposition: formatCompositionSchema.optional(),
  // Versioning
  versionOf: z.string().optional(), // Optional: reference to previous version document ID
  // Review status
  reviewStatus: documentReviewStatusSchema.optional(), // Defaults to 'pending_review' on creation
  reviewMetadata: documentReviewMetadataSchema.optional(),
});

export const canonicalDocumentDraftSchema = canonicalDocumentDraftBase.refine(
  (data) => {
    // If formatComposition is provided, documentStructure should be 'bundle'
    if (data.formatComposition && data.documentStructure !== 'bundle') {
      return false;
    }
    return true;
  },
  {
    message: 'formatComposition can only be provided when documentStructure is "bundle"',
    path: ['formatComposition'],
  }
);

/**
 * CanonicalDocument schema (persisted document with system fields)
 *
 * This schema validates persisted CanonicalDocument instances (with _id, createdAt, updatedAt, etc.)
 * as opposed to CanonicalDocumentDraft which is used before persistence.
 *
 * @see CanonicalDocument interface in src/server/contracts/types.ts
 */
export const canonicalDocumentSchema = canonicalDocumentDraftBase.extend({
  _id: z.string().min(1, '_id is required'),
  reviewStatus: documentReviewStatusSchema, // Required for persisted documents
  createdAt: z.union([z.date(), z.string()]), // Accept Date objects or ISO strings
  updatedAt: z.union([z.date(), z.string()]), // Accept Date objects or ISO strings
  schemaVersion: z.string().min(1, 'schemaVersion is required'),
}).passthrough(); // Allow additional properties for extensibility

/**
 * Array schema for CanonicalDocument
 */
export const canonicalDocumentArraySchema = z.array(canonicalDocumentSchema);

/**
 * Chunk offsets schema
 */
export const chunkOffsetsSchema = z.object({
  start: z.number().int().nonnegative('start offset must be a non-negative integer'),
  end: z.number().int().nonnegative('end offset must be a non-negative integer'),
}).refine(
  (data) => data.end >= data.start,
  { message: 'end offset must be greater than or equal to start offset' }
);

/**
 * Chunk embedding schema
 */
export const chunkEmbeddingSchema = z.object({
  modelId: z.string().min(1, 'modelId is required'),
  dims: z.number().int().positive('dims must be a positive integer'),
  vectorRef: z.string().min(1, 'vectorRef is required'),
  updatedAt: z.date(),
});

/**
 * CanonicalChunkDraft schema
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */
export const canonicalChunkDraftSchema = z.object({
  chunkId: z.string().min(1, 'chunkId is required'),
  documentId: z.string().min(1, 'documentId is required'),
  chunkIndex: z.number().int().nonnegative('chunkIndex must be a non-negative integer'),
  text: z.string().min(1, 'text is required and must not be empty'),
  offsets: chunkOffsetsSchema,
  headingPath: z.array(z.string()).optional(),
  legalRefs: z.array(z.string()).optional(),
  chunkFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'chunkFingerprint must be a 64-character hex string (sha256)'),
  embedding: chunkEmbeddingSchema.optional(),
});

/**
 * ExtensionDraft schema
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */
export const extensionDraftSchema = z.object({
  type: extensionTypeSchema,
  documentId: z.string().min(1, 'documentId is required'),
  payload: z.record(z.string(), z.unknown()),
  version: z.string().min(1, 'version is required (schema version)'),
  updatedAt: z.date(),
});

/**
 * GeoExtension payload schema (v1)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */
export const geoExtensionPayloadV1Schema = z.object({
  crsSource: z.string().min(1, 'crsSource is required (e.g. EPSG:28992)'),
  crsStored: z.literal('EPSG:4326'),
  geometriesWgs84: z.array(z.unknown()).min(1, 'geometriesWgs84 must contain at least one geometry'),
  bboxWgs84: z.tuple([
    z.number(), // minLon
    z.number(), // minLat
    z.number(), // maxLon
    z.number(), // maxLat
  ]).refine(
    (bbox) => bbox[0] < bbox[2] && bbox[1] < bbox[3],
    { message: 'bboxWgs84 must have minLon < maxLon and minLat < maxLat' }
  ),
  geometryHash: z.string().regex(/^[a-f0-9]{64}$/i, 'geometryHash must be a 64-character hex string (sha256)'),
  sources: z.array(z.string()).default([]),
});

/**
 * LegalExtension payload schema (v1)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */
export const legalExtensionPayloadV1Schema = z.object({
  legalIds: z.array(z.string()).default([]), // e.g. ECLI, AKN, BWBR
  citations: z.array(z.string()).default([]), // strings; later parsed
  references: z.array(z.string()).optional(), // resolved refs, optional
  structure: z.record(z.string(), z.unknown()).optional(), // optional; later
});

/**
 * WebExtension payload schema (v1)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */
export const webExtensionPayloadV1Schema = z.object({
  url: z.string().url('url must be a valid URL'),
  crawl: z.object({
    fetchedAt: z.date(),
    statusCode: z.number().int().nonnegative('statusCode must be a non-negative integer'),
    contentType: z.string().min(1, 'contentType is required'),
    etag: z.string().optional(),
    lastModified: z.date().optional(),
  }),
  linkGraph: z.object({
    discoveredLinks: z.array(z.string().url()).default([]),
  }).default({ discoveredLinks: [] }),
  snapshotArtifactRef: z.string().optional(), // reference to artifact store
});

/**
 * Extension envelope schema (common fields)
 */
export const extensionEnvelopeSchema = z.object({
  documentId: z.string().min(1, 'documentId is required'),
  type: extensionTypeSchema,
  version: z.string().min(1, 'version is required (schema version)'),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date().optional(),
  updatedAt: z.date(),
});

/**
 * Validation error with actionable message
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly code?: string,
    public readonly issues?: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a CanonicalDocumentDraft
 * 
 * @param draft - The draft to validate
 * @throws {ValidationError} If validation fails
 */
export function validateCanonicalDocumentDraft(draft: unknown): asserts draft is z.infer<typeof canonicalDocumentDraftSchema> {
  try {
    canonicalDocumentDraftSchema.parse(draft);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstIssue = issues[0];
      const field = firstIssue?.path.join('.') || 'unknown';
      const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(
        `CanonicalDocumentDraft validation failed: ${message}`,
        field,
        firstIssue?.code,
        issues
      );
    }
    throw error;
  }
}

/**
 * Validate a CanonicalChunkDraft
 * 
 * @param chunk - The chunk draft to validate
 * @throws {ValidationError} If validation fails
 */
export function validateCanonicalChunkDraft(chunk: unknown): asserts chunk is z.infer<typeof canonicalChunkDraftSchema> {
  try {
    canonicalChunkDraftSchema.parse(chunk);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstIssue = issues[0];
      const field = firstIssue?.path.join('.') || 'unknown';
      const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(
        `CanonicalChunkDraft validation failed: ${message}`,
        field,
        firstIssue?.code,
        issues
      );
    }
    throw error;
  }
}

/**
 * Validate an ExtensionDraft
 * 
 * @param extension - The extension draft to validate
 * @throws {ValidationError} If validation fails
 */
export function validateExtensionDraft(extension: unknown): asserts extension is z.infer<typeof extensionDraftSchema> {
  try {
    extensionDraftSchema.parse(extension);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstIssue = issues[0];
      const field = firstIssue?.path.join('.') || 'unknown';
      const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(
        `ExtensionDraft validation failed: ${message}`,
        field,
        firstIssue?.code,
        issues
      );
    }
    throw error;
  }
}

/**
 * Validate an ArtifactRef
 * 
 * @param artifactRef - The artifact reference to validate
 * @throws {ValidationError} If validation fails
 */
export function validateArtifactRef(artifactRef: unknown): asserts artifactRef is z.infer<typeof artifactRefSchema> {
  try {
    artifactRefSchema.parse(artifactRef);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstIssue = issues[0];
      const field = firstIssue?.path.join('.') || 'unknown';
      const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(
        `ArtifactRef validation failed: ${message}`,
        field,
        firstIssue?.code,
        issues
      );
    }
    throw error;
  }
}

/**
 * Validate multiple CanonicalChunkDrafts
 * 
 * @param chunks - Array of chunk drafts to validate
 * @throws {ValidationError} If any validation fails
 */
export function validateCanonicalChunkDrafts(chunks: unknown[]): asserts chunks is z.infer<typeof canonicalChunkDraftSchema>[] {
  chunks.forEach((chunk, index) => {
    try {
      validateCanonicalChunkDraft(chunk);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `Chunk at index ${index} validation failed: ${error.message}`,
          `chunks[${index}].${error.field}`,
          error.code,
          error.issues
        );
      }
      throw error;
    }
  });
}

/**
 * Validate multiple ExtensionDrafts
 * 
 * @param extensions - Array of extension drafts to validate
 * @throws {ValidationError} If any validation fails
 */
export function validateExtensionDrafts(extensions: unknown[]): asserts extensions is z.infer<typeof extensionDraftSchema>[] {
  extensions.forEach((extension, index) => {
    try {
      validateExtensionDraft(extension);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `Extension at index ${index} validation failed: ${error.message}`,
          `extensions[${index}].${error.field}`,
          error.code,
          error.issues
        );
      }
      throw error;
    }
  });
}

/**
 * Validate extension envelope (common fields)
 * 
 * @param envelope - The extension envelope to validate
 * @throws {ValidationError} If validation fails
 */
export function validateExtensionEnvelope(envelope: unknown): asserts envelope is z.infer<typeof extensionEnvelopeSchema> {
  try {
    extensionEnvelopeSchema.parse(envelope);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      const firstIssue = issues[0];
      const field = firstIssue?.path.join('.') || 'unknown';
      const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(
        `Extension envelope validation failed: ${message}`,
        field,
        firstIssue?.code,
        issues
      );
    }
    throw error;
  }
}

/**
 * Validate GeoExtension payload by version
 * 
 * @param payload - The payload to validate
 * @param version - Schema version (e.g., 'v1')
 * @throws {ValidationError} If validation fails or version is unsupported
 */
export function validateGeoExtensionPayload(
  payload: unknown,
  version: string
): asserts payload is z.infer<typeof geoExtensionPayloadV1Schema> {
  if (version === 'v1') {
    try {
      geoExtensionPayloadV1Schema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues;
        const firstIssue = issues[0];
        const field = firstIssue?.path.join('.') || 'unknown';
        const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationError(
          `GeoExtension payload v1 validation failed: ${message}`,
          field,
          firstIssue?.code,
          issues
        );
      }
      throw error;
    }
  } else {
    throw new ValidationError(
      `Unsupported GeoExtension payload version: ${version}. Supported versions: v1`,
      'version',
      'unsupported_version'
    );
  }
}

/**
 * Validate LegalExtension payload by version
 * 
 * @param payload - The payload to validate
 * @param version - Schema version (e.g., 'v1')
 * @throws {ValidationError} If validation fails or version is unsupported
 */
export function validateLegalExtensionPayload(
  payload: unknown,
  version: string
): asserts payload is z.infer<typeof legalExtensionPayloadV1Schema> {
  if (version === 'v1') {
    try {
      legalExtensionPayloadV1Schema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues;
        const firstIssue = issues[0];
        const field = firstIssue?.path.join('.') || 'unknown';
        const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationError(
          `LegalExtension payload v1 validation failed: ${message}`,
          field,
          firstIssue?.code,
          issues
        );
      }
      throw error;
    }
  } else {
    throw new ValidationError(
      `Unsupported LegalExtension payload version: ${version}. Supported versions: v1`,
      'version',
      'unsupported_version'
    );
  }
}

/**
 * Validate WebExtension payload by version
 * 
 * @param payload - The payload to validate
 * @param version - Schema version (e.g., 'v1')
 * @throws {ValidationError} If validation fails or version is unsupported
 */
export function validateWebExtensionPayload(
  payload: unknown,
  version: string
): asserts payload is z.infer<typeof webExtensionPayloadV1Schema> {
  if (version === 'v1') {
    try {
      webExtensionPayloadV1Schema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues;
        const firstIssue = issues[0];
        const field = firstIssue?.path.join('.') || 'unknown';
        const message = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationError(
          `WebExtension payload v1 validation failed: ${message}`,
          field,
          firstIssue?.code,
          issues
        );
      }
      throw error;
    }
  } else {
    throw new ValidationError(
      `Unsupported WebExtension payload version: ${version}. Supported versions: v1`,
      'version',
      'unsupported_version'
    );
  }
}
