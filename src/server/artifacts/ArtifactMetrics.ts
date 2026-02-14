/**
 * Artifact Metrics
 * 
 * Prometheus metrics for artifact storage operations.
 * Tracks store, read, integrity checks, and errors.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import { Counter, Histogram } from 'prom-client';
import { metricsRegistry } from '../utils/metrics.js';

/**
 * Artifact store operations counter
 * Labels: ['operation', 'status', 'source']
 * - operation: 'store' | 'read' | 'exists' | 'getRef'
 * - status: 'success' | 'error' | 'deduplicated' | 'integrity_failed'
 * - source: DocumentSource (DSO, Rechtspraak, etc.)
 */
export const artifactOperationsTotal = new Counter({
  name: 'artifact_operations_total',
  help: 'Total number of artifact store operations',
  labelNames: ['operation', 'status', 'source'],
  registers: [metricsRegistry],
});

/**
 * Artifact store operation duration histogram
 * Labels: ['operation', 'source']
 */
export const artifactOperationDuration = new Histogram({
  name: 'artifact_operation_duration_seconds',
  help: 'Duration of artifact store operations in seconds',
  labelNames: ['operation', 'source'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

/**
 * Artifact size histogram
 * Labels: ['source', 'mimeType']
 * Tracks the size of stored artifacts in bytes
 */
export const artifactSizeBytes = new Histogram({
  name: 'artifact_size_bytes',
  help: 'Size of stored artifacts in bytes',
  labelNames: ['source', 'mimeType'],
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824], // 1KB to 1GB
  registers: [metricsRegistry],
});

/**
 * Artifact integrity check failures counter
 * Labels: ['source']
 */
export const artifactIntegrityFailuresTotal = new Counter({
  name: 'artifact_integrity_failures_total',
  help: 'Total number of artifact integrity check failures',
  labelNames: ['source'],
  registers: [metricsRegistry],
});

/**
 * Helper to record artifact operation metrics
 */
export function recordArtifactOperation(
  operation: 'store' | 'read' | 'exists' | 'getRef',
  status: 'success' | 'error' | 'deduplicated' | 'integrity_failed',
  source: string,
  durationSeconds?: number,
  sizeBytes?: number,
  mimeType?: string
): void {
  artifactOperationsTotal.inc({ operation, status, source });
  
  if (durationSeconds !== undefined) {
    artifactOperationDuration.observe({ operation, source }, durationSeconds);
  }
  
  if (sizeBytes !== undefined && mimeType !== undefined && operation === 'store' && status === 'success') {
    artifactSizeBytes.observe({ source, mimeType }, sizeBytes);
  }
  
  if (status === 'integrity_failed') {
    artifactIntegrityFailuresTotal.inc({ source });
  }
}

