/**
 * ETL Manifest Generator
 * 
 * Generates deterministic manifests with provenance information for ETL runs.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

import type {
  ETLManifest,
  ManifestProvenance,
  DocumentFingerprint,
  ETLJobRequest,
  ETLJobResult,
  ETLJobStats,
} from './types.js';
import { serializeETLManifest } from './serializer.js';

/**
 * Options for manifest generation
 */
export interface ManifestGenerationOptions {
  /** Document fingerprints (documentId + contentFingerprint) */
  inputFingerprints: DocumentFingerprint[];
  /** Parser versions (e.g., { 'spacy': '3.7.0', 'trafilatura': '1.6.0' }) */
  parserVersions: Record<string, string>;
  /** Mapper versions (e.g., { 'rdf-mapper': '1.0.0' }) */
  mapperVersions: Record<string, string>;
  /** Model versions (e.g., { 'spacy-nl': '3.7.0' }) */
  modelVersions: Record<string, string>;
  /** RDF mapping version */
  rdfMappingVersion: string;
  /** Output files */
  outputFiles: {
    turtleFiles: string[];
    manifest: string;
  };
  /** Statistics */
  stats: ETLJobStats;
}

/**
 * Generate ETL manifest with provenance information
 * 
 * The manifest includes all information required for deterministic replay:
 * - Input fingerprints (documentId + contentFingerprint)
 * - Parser/mapper/model versions
 * - Output file references
 * - Statistics
 * 
 * @param request - Original ETL job request
 * @param result - ETL job result
 * @param options - Manifest generation options
 * @returns ETL manifest
 */
export function generateETLManifest(
  request: ETLJobRequest,
  _result: ETLJobResult,
  options: ManifestGenerationOptions
): ETLManifest {
  const now = new Date().toISOString();

  const provenance: ManifestProvenance = {
    inputFingerprints: options.inputFingerprints,
    parserVersions: options.parserVersions,
    mapperVersions: options.mapperVersions,
    modelVersions: options.modelVersions,
    rdfMappingVersion: options.rdfMappingVersion,
  };

  return {
    schemaVersion: 'etl-manifest@v1',
    runId: request.runId,
    createdAt: request.createdAt,
    completedAt: now,
    provenance,
    outputs: options.outputFiles,
    stats: options.stats,
  };
}

/**
 * Serialize manifest to JSON string
 * 
 * @param manifest - ETL manifest
 * @returns JSON string
 */
export function serializeManifest(manifest: ETLManifest): string {
  return serializeETLManifest(manifest);
}

/**
 * Generate manifest from request and result (convenience function)
 * 
 * This function extracts information from the request and result to generate
 * a complete manifest. The caller must provide the input fingerprints and
 * version information.
 * 
 * @param request - ETL job request
 * @param result - ETL job result
 * @param inputFingerprints - Document fingerprints
 * @param parserVersions - Parser versions
 * @param mapperVersions - Mapper versions
 * @param modelVersions - Model versions
 * @returns ETL manifest
 */
export function generateManifestFromRequestAndResult(
  request: ETLJobRequest,
  result: ETLJobResult,
  inputFingerprints: DocumentFingerprint[],
  parserVersions: Record<string, string>,
  mapperVersions: Record<string, string>,
  modelVersions: Record<string, string>
): ETLManifest {
  return generateETLManifest(request, result, {
    inputFingerprints,
    parserVersions,
    mapperVersions,
    modelVersions,
    rdfMappingVersion: request.models.rdfMappingVersion,
    outputFiles: result.outputs,
    stats: result.stats,
  });
}

