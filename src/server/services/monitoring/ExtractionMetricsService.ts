/**
 * ExtractionMetricsService
 * 
 * Service for collecting and managing Knowledge Graph extraction metrics.
 * Tracks extraction attempts, success/failure rates, skipped extractions,
 * and population rates, with metrics broken down by flag state and backend.
 * 
 * Metrics follow Prometheus conventions and are exposed via the /metrics endpoint.
 */

import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from '../../utils/metrics.js';
import { logger } from '../../utils/logger.js';

/**
 * Knowledge Graph Extraction Attempts Counter
 * Tracks total number of extraction attempts by flag state
 * Labels: ['flag_state'] - 'enabled' or 'disabled'
 */
export const kgExtractionAttemptsTotal = new Counter({
  name: 'kg_extraction_attempts_total',
  help: 'Total number of Knowledge Graph extraction attempts',
  labelNames: ['flag_state'],
  registers: [metricsRegistry],
});

/**
 * Knowledge Graph Extraction Success Counter
 * Tracks successful extractions by flag state
 * Labels: ['flag_state'] - 'enabled' or 'disabled'
 */
export const kgExtractionSuccessTotal = new Counter({
  name: 'kg_extraction_success_total',
  help: 'Total number of successful Knowledge Graph extractions',
  labelNames: ['flag_state'],
  registers: [metricsRegistry],
});

/**
 * Knowledge Graph Extraction Failure Counter
 * Tracks failed extractions by flag state
 * Labels: ['flag_state'] - 'enabled' or 'disabled'
 */
export const kgExtractionFailureTotal = new Counter({
  name: 'kg_extraction_failure_total',
  help: 'Total number of failed Knowledge Graph extractions',
  labelNames: ['flag_state'],
  registers: [metricsRegistry],
});

/**
 * Knowledge Graph Extraction Skipped Counter
 * Tracks skipped extractions by reason
 * Labels: ['reason'] - 'flag_disabled', 'content_too_short', etc.
 */
export const kgExtractionSkippedTotal = new Counter({
  name: 'kg_extraction_skipped_total',
  help: 'Total number of skipped Knowledge Graph extractions',
  labelNames: ['reason'],
  registers: [metricsRegistry],
});

/**
 * Knowledge Graph Population Rate Gauge
 * Tracks current population rate by backend and type
 * Labels: ['backend', 'type'] - backend: 'neo4j' | 'graphdb', type: 'entities' | 'relationships'
 */
export const kgPopulationRate = new Gauge({
  name: 'kg_population_rate',
  help: 'Knowledge Graph population rate (entities or relationships per workflow)',
  labelNames: ['backend', 'type'],
  registers: [metricsRegistry],
});

/**
 * Service for managing Knowledge Graph extraction metrics
 */
export class ExtractionMetricsService {
  /**
   * Record an extraction attempt
   * 
   * @param flagState - Whether the extraction flag was enabled
   */
  recordExtractionAttempt(flagState: boolean): void {
    try {
      const flagStateLabel = flagState ? 'enabled' : 'disabled';
      kgExtractionAttemptsTotal.inc({ flag_state: flagStateLabel });
    } catch (error) {
      // Don't throw - metrics recording failure shouldn't break extraction
      logger.debug({ error, flagState }, 'Failed to record extraction attempt metric');
    }
  }

  /**
   * Record a successful extraction
   * 
   * @param flagState - Whether the extraction flag was enabled
   */
  recordExtractionSuccess(flagState: boolean): void {
    try {
      const flagStateLabel = flagState ? 'enabled' : 'disabled';
      kgExtractionSuccessTotal.inc({ flag_state: flagStateLabel });
    } catch (error) {
      logger.debug({ error, flagState }, 'Failed to record extraction success metric');
    }
  }

  /**
   * Record a failed extraction
   * 
   * @param flagState - Whether the extraction flag was enabled
   */
  recordExtractionFailure(flagState: boolean): void {
    try {
      const flagStateLabel = flagState ? 'enabled' : 'disabled';
      kgExtractionFailureTotal.inc({ flag_state: flagStateLabel });
    } catch (error) {
      logger.debug({ error, flagState }, 'Failed to record extraction failure metric');
    }
  }

  /**
   * Record a skipped extraction
   * 
   * @param reason - Reason for skipping (e.g., 'flag_disabled', 'content_too_short')
   */
  recordExtractionSkipped(reason: string): void {
    try {
      kgExtractionSkippedTotal.inc({ reason });
    } catch (error) {
      logger.debug({ error, reason }, 'Failed to record extraction skipped metric');
    }
  }

  /**
   * Record population rate (entities/relationships per workflow)
   * 
   * @param backend - Backend type ('neo4j' or 'graphdb')
   * @param entities - Number of entities extracted
   * @param relationships - Number of relationships extracted
   */
  recordPopulationRate(backend: string, entities: number, relationships: number): void {
    try {
      const backendLabel = backend.toLowerCase();
      kgPopulationRate.set({ backend: backendLabel, type: 'entities' }, entities);
      kgPopulationRate.set({ backend: backendLabel, type: 'relationships' }, relationships);
    } catch (error) {
      logger.debug({ error, backend, entities, relationships }, 'Failed to record population rate metric');
    }
  }
}

/**
 * Singleton instance of ExtractionMetricsService
 */
let extractionMetricsServiceInstance: ExtractionMetricsService | null = null;

/**
 * Get the singleton instance of ExtractionMetricsService
 * 
 * @returns ExtractionMetricsService instance
 */
export function getExtractionMetricsService(): ExtractionMetricsService {
  if (!extractionMetricsServiceInstance) {
    extractionMetricsServiceInstance = new ExtractionMetricsService();
  }
  return extractionMetricsServiceInstance;
}


