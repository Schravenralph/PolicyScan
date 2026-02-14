/**
 * ETL Cross-Runtime Contract Schemas (Zod)
 * 
 * Zod schemas for runtime validation of ETL job requests and results.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

import { z } from 'zod';

/**
 * Extension flags schema
 */
export const extensionFlagsSchema = z.object({
  geo: z.boolean(),
  legal: z.boolean(),
  web: z.boolean(),
});

/**
 * Geo source schema
 */
export const geoSourceSchema = z.enum(['mongo', 'postgis', 'both']);

/**
 * ETL job input schema
 */
export const etlJobInputSchema = z
  .object({
    documentIds: z.array(z.string().min(1)).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
    includeChunks: z.boolean(),
    includeExtensions: extensionFlagsSchema,
    geoSource: geoSourceSchema,
  })
  .refine(
    (data) => {
      // Either documentIds or query must be provided, but not both
      const hasDocumentIds = data.documentIds && data.documentIds.length > 0;
      const hasQuery = data.query && Object.keys(data.query).length > 0;
      return hasDocumentIds !== hasQuery; // XOR
    },
    {
      message: 'Either documentIds or query must be provided, but not both',
    }
  );

/**
 * ETL job artifacts schema
 */
export const etlJobArtifactsSchema = z.object({
  artifactRefs: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).optional(),
});

/**
 * ETL job models schema
 */
export const etlJobModelsSchema = z.object({
  nlpModelId: z.string().min(1, 'nlpModelId is required'),
  rdfMappingVersion: z.string().min(1, 'rdfMappingVersion is required'),
});

/**
 * Output format schema
 */
export const outputFormatSchema = z.enum(['turtle']);

/**
 * ETL job output schema
 */
export const etlJobOutputSchema = z
  .object({
    format: outputFormatSchema,
    outputDir: z.string().min(1).optional(),
    artifactStorePrefix: z.string().min(1).optional(),
    manifestName: z.string().min(1, 'manifestName is required'),
  })
  .refine(
    (data) => {
      // Either outputDir or artifactStorePrefix must be provided, but not both
      return !!data.outputDir !== !!data.artifactStorePrefix;
    },
    {
      message: 'Either outputDir or artifactStorePrefix must be provided, but not both',
    }
  );

/**
 * ETL job request schema
 */
export const etlJobRequestSchema = z.object({
  schemaVersion: z.literal('etl-job@v1'),
  runId: z.string().min(1, 'runId is required'),
  createdAt: z.string().datetime({ message: 'createdAt must be a valid ISO 8601 datetime' }),
  input: etlJobInputSchema,
  artifacts: etlJobArtifactsSchema.optional(),
  models: etlJobModelsSchema,
  output: etlJobOutputSchema,
});

/**
 * ETL job stats schema
 */
export const etlJobStatsSchema = z.object({
  documentsProcessed: z.number().int().nonnegative(),
  triplesEmitted: z.number().int().nonnegative(),
  filesWritten: z.number().int().nonnegative(),
});

/**
 * ETL job outputs schema
 */
export const etlJobOutputsSchema = z.object({
  turtleFiles: z.array(z.string().min(1)),
  manifest: z.string().min(1),
});

/**
 * ETL job error schema
 */
export const etlJobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  documentId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * ETL job result schema
 */
export const etlJobResultSchema = z.object({
  schemaVersion: z.literal('etl-result@v1'),
  runId: z.string().min(1, 'runId is required'),
  status: z.enum(['succeeded', 'failed', 'partial']),
  stats: etlJobStatsSchema,
  outputs: etlJobOutputsSchema,
  errors: z.array(etlJobErrorSchema).optional(),
});

/**
 * Document fingerprint schema
 */
export const documentFingerprintSchema = z.object({
  documentId: z.string().min(1),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/i, 'contentFingerprint must be a 64-character hex string'),
});

/**
 * Manifest provenance schema
 */
export const manifestProvenanceSchema = z.object({
  inputFingerprints: z.array(documentFingerprintSchema),
  parserVersions: z.record(z.string(), z.string()),
  mapperVersions: z.record(z.string(), z.string()),
  modelVersions: z.record(z.string(), z.string()),
  rdfMappingVersion: z.string().min(1),
});

/**
 * ETL manifest schema
 */
export const etlManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  provenance: manifestProvenanceSchema,
  outputs: z.object({
    turtleFiles: z.array(z.string()),
    manifest: z.string(),
  }),
  stats: etlJobStatsSchema,
});

/**
 * Type exports inferred from schemas
 */
export type ETLJobRequestValidated = z.infer<typeof etlJobRequestSchema>;
export type ETLJobResultValidated = z.infer<typeof etlJobResultSchema>;
export type ETLManifestValidated = z.infer<typeof etlManifestSchema>;

