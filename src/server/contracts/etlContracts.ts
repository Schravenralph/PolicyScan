/**
 * Cross-runtime ETL Contracts (Node ↔ Python)
 * 
 * Defines the stable contract between Node/TypeScript orchestration
 * and Python NLP/RDF transformers.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

import { z } from 'zod';

/**
 * Schema version for ETL job requests
 */
export const ETL_JOB_SCHEMA_VERSION = 'etl-job@v1';
export const ETL_RESULT_SCHEMA_VERSION = 'etl-result@v1';

/**
 * ETLJobRequest schema (Zod)
 * 
 * Payload sent from Node to Python transformer
 */
export const etlJobRequestSchema = z.object({
  schemaVersion: z.literal(ETL_JOB_SCHEMA_VERSION),
  runId: z.string().min(1),
  createdAt: z.union([z.date(), z.string().datetime()]),
  input: z.object({
    documentIds: z.array(z.string()).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
    includeChunks: z.boolean().default(false),
    includeExtensions: z.object({
      geo: z.boolean().default(false),
      legal: z.boolean().default(false),
      web: z.boolean().default(false),
    }),
    geoSource: z.enum(['mongo', 'postgis', 'both']).default('mongo'),
  }),
  artifacts: z.object({
    artifactRefs: z.array(z.object({
      type: z.string(),
      identifier: z.string(),
      version: z.string().optional(),
    })).optional(),
  }).optional(),
  models: z.object({
    nlpModelId: z.string(), // e.g. 'spacy-nl@v3'
    rdfMappingVersion: z.string(),
  }),
  output: z.object({
    format: z.literal('turtle'),
    outputDir: z.string().optional(),
    artifactStorePrefix: z.string().optional(),
    manifestName: z.string().default('manifest.json'),
  }),
});

export type ETLJobRequest = z.infer<typeof etlJobRequestSchema>;

/**
 * ETLJobResult schema (Zod)
 * 
 * Result returned from Python transformer to Node
 */
export const etlJobResultSchema = z.object({
  schemaVersion: z.literal(ETL_RESULT_SCHEMA_VERSION),
  runId: z.string().min(1),
  status: z.enum(['succeeded', 'failed', 'partial']),
  stats: z.object({
    documentsProcessed: z.number().int().nonnegative(),
    triplesEmitted: z.number().int().nonnegative(),
    filesWritten: z.number().int().nonnegative(),
  }),
  outputs: z.object({
    turtleFiles: z.array(z.string()), // Paths or ArtifactRefs
    manifest: z.string().optional(), // Path or ArtifactRef
  }),
  errors: z.array(z.object({
    documentId: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
    timestamp: z.union([z.date(), z.string().datetime()]),
  })).optional(),
  manifest: z.object({
    inputFingerprints: z.array(z.object({
      documentId: z.string(),
      contentFingerprint: z.string(),
    })),
    versions: z.object({
      nlpModelId: z.string(),
      rdfMappingVersion: z.string(),
      pythonVersion: z.string().optional(),
      transformerVersion: z.string().optional(),
    }),
  }).optional(),
});

export type ETLJobResult = z.infer<typeof etlJobResultSchema>;

/**
 * Validate ETL job request
 */
export function validateETLJobRequest(data: unknown): ETLJobRequest {
  return etlJobRequestSchema.parse(data);
}

/**
 * Validate ETL job result
 */
export function validateETLJobResult(data: unknown): ETLJobResult {
  return etlJobResultSchema.parse(data);
}

