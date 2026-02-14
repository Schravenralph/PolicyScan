/**
 * ETL Cross-Runtime Contracts
 * 
 * Exports for ETL job request/response contracts between Node/TypeScript
 * orchestration and Python ETL workers.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

// Types
export type {
  ETLJobRequest,
  ETLJobResult,
  ETLJobInput,
  ETLJobArtifacts,
  ETLJobModels,
  ETLJobOutput,
  ETLJobStats,
  ETLJobOutputs,
  ETLJobError,
  ETLManifest,
  ManifestProvenance,
  DocumentFingerprint,
  ETLJobStatus,
  GeoSource,
  OutputFormat,
  ExtensionFlags,
  ETLJobSchemaVersion,
  ETLJobResultSchemaVersion,
} from './types.js';

// Schemas
export {
  etlJobRequestSchema,
  etlJobResultSchema,
  etlManifestSchema,
  etlJobInputSchema,
  etlJobArtifactsSchema,
  etlJobModelsSchema,
  etlJobOutputSchema,
  etlJobStatsSchema,
  etlJobOutputsSchema,
  etlJobErrorSchema,
  extensionFlagsSchema,
  geoSourceSchema,
  outputFormatSchema,
  documentFingerprintSchema,
  manifestProvenanceSchema,
  type ETLJobRequestValidated,
  type ETLJobResultValidated,
  type ETLManifestValidated,
} from './schemas.js';

// Serializer/Deserializer
export {
  serializeETLJobRequest,
  deserializeETLJobRequest,
  serializeETLJobResult,
  deserializeETLJobResult,
  serializeETLManifest,
  deserializeETLManifest,
  validateETLJobRequest,
  validateETLJobResult,
  ETLContractValidationError,
} from './serializer.js';

// Manifest generator
export {
  generateETLManifest,
  generateManifestFromRequestAndResult,
  serializeManifest,
  type ManifestGenerationOptions,
} from './manifest.js';

