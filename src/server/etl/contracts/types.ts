/**
 * ETL Cross-Runtime Contract Types
 * 
 * TypeScript types for ETL job request/response contracts between Node/TypeScript
 * orchestration and Python ETL workers.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

/**
 * Schema version for ETL job requests
 */
export type ETLJobSchemaVersion = 'etl-job@v1';

/**
 * Schema version for ETL job results
 */
export type ETLJobResultSchemaVersion = 'etl-result@v1';

/**
 * ETL job status
 */
export type ETLJobStatus = 'succeeded' | 'failed' | 'partial';

/**
 * Geo source options
 */
export type GeoSource = 'mongo' | 'postgis' | 'both';

/**
 * Output format (currently only turtle supported)
 */
export type OutputFormat = 'turtle';

/**
 * Extension inclusion flags
 */
export interface ExtensionFlags {
  geo: boolean;
  legal: boolean;
  web: boolean;
}

/**
 * ETL job input configuration
 */
export interface ETLJobInput {
  /** Document IDs to process (mutually exclusive with query) */
  documentIds?: string[];
  /** Query filters (mutually exclusive with documentIds) */
  query?: Record<string, unknown>;
  /** Whether to include chunks in processing */
  includeChunks: boolean;
  /** Extension inclusion flags */
  includeExtensions: ExtensionFlags;
  /** Geo data source */
  geoSource: GeoSource;
}

/**
 * ETL job artifacts configuration
 */
export interface ETLJobArtifacts {
  /** Optional artifact references for traceability */
  artifactRefs?: string[]; // Array of ArtifactRef.sha256
}

/**
 * ETL job models configuration
 */
export interface ETLJobModels {
  /** NLP model identifier (e.g., 'spacy-nl@v3.7.0') */
  nlpModelId: string;
  /** RDF mapping version (e.g., 'rdf-mapping@v1.0.0') */
  rdfMappingVersion: string;
}

/**
 * ETL job output configuration
 */
export interface ETLJobOutput {
  /** Output format (currently only 'turtle') */
  format: OutputFormat;
  /** Output directory path (mutually exclusive with artifactStorePrefix) */
  outputDir?: string;
  /** Artifact store prefix (mutually exclusive with outputDir) */
  artifactStorePrefix?: string;
  /** Manifest filename (e.g., 'manifest.json') */
  manifestName: string;
}

/**
 * ETL job request payload
 */
export interface ETLJobRequest {
  /** Schema version (e.g., 'etl-job@v1') */
  schemaVersion: ETLJobSchemaVersion;
  /** Run ID (MongoDB ObjectId string) */
  runId: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Input configuration */
  input: ETLJobInput;
  /** Artifacts configuration */
  artifacts?: ETLJobArtifacts;
  /** Models configuration */
  models: ETLJobModels;
  /** Output configuration */
  output: ETLJobOutput;
}

/**
 * ETL job statistics
 */
export interface ETLJobStats {
  /** Number of documents processed */
  documentsProcessed: number;
  /** Number of triples emitted */
  triplesEmitted: number;
  /** Number of files written */
  filesWritten: number;
}

/**
 * ETL job output references
 */
export interface ETLJobOutputs {
  /** Turtle file paths or ArtifactRefs */
  turtleFiles: string[]; // Paths or ArtifactRef.sha256
  /** Manifest file path or ArtifactRef */
  manifest: string; // Path or ArtifactRef.sha256
}

/**
 * Structured error information
 */
export interface ETLJobError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Document ID (if error is document-specific) */
  documentId?: string;
  /** Additional error context */
  context?: Record<string, unknown>;
}

/**
 * ETL job result payload
 */
export interface ETLJobResult {
  /** Schema version (e.g., 'etl-result@v1') */
  schemaVersion: ETLJobResultSchemaVersion;
  /** Run ID (must match request) */
  runId: string;
  /** Job status */
  status: ETLJobStatus;
  /** Processing statistics */
  stats: ETLJobStats;
  /** Output file references */
  outputs: ETLJobOutputs;
  /** Errors (if any) */
  errors?: ETLJobError[];
}

/**
 * Document fingerprint for manifest provenance
 */
export interface DocumentFingerprint {
  /** Document ID */
  documentId: string;
  /** Content fingerprint (sha256) */
  contentFingerprint: string;
}

/**
 * Manifest provenance information
 */
export interface ManifestProvenance {
  /** Input document fingerprints */
  inputFingerprints: DocumentFingerprint[];
  /** Parser versions */
  parserVersions: Record<string, string>;
  /** Mapper versions */
  mapperVersions: Record<string, string>;
  /** Model versions */
  modelVersions: Record<string, string>;
  /** RDF mapping version */
  rdfMappingVersion: string;
}

/**
 * ETL manifest structure
 */
export interface ETLManifest {
  /** Schema version */
  schemaVersion: string;
  /** Run ID */
  runId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Completion timestamp */
  completedAt: string;
  /** Provenance information */
  provenance: ManifestProvenance;
  /** Output files */
  outputs: {
    turtleFiles: string[];
    manifest: string;
  };
  /** Statistics */
  stats: ETLJobStats;
}

