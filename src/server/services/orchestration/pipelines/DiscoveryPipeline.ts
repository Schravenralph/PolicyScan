/**
 * Discovery Pipeline
 * 
 * Coordinates document discovery from multiple sources.
 * This pipeline:
 * 1. Ingests documents from specified sources
 * 2. Optionally parses documents to extract structured information
 * 3. Returns normalized or parsed documents
 */

import type { IPipeline } from '../interfaces/IPipeline.js';
import type { PipelineInput } from '../types/PipelineInput.js';
import type { PipelineResult } from '../types/PipelineResult.js';
import type { IngestionOrchestrator } from '../../ingestion/IngestionOrchestrator.js';
import type { PolicyParser } from '../../parsing/PolicyParser.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../../ingestion/types/IngestionOptions.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ParsedDocument } from '../../parsing/types/ParsedDocument.js';
import { DocumentMapper } from '../mappers/DocumentMapper.js';
import { logger } from '../../../utils/logger.js';

/**
 * Output type for DiscoveryPipeline
 * Always returns NormalizedDocument[] in documents field.
 * If parsing is enabled, parsed documents are available in metadata.
 */
type DiscoveryOutput = NormalizedDocument;

/**
 * Configuration for DiscoveryPipeline
 */
export interface DiscoveryPipelineConfig {
  /** Whether to parse documents after ingestion (default: false) */
  parseDocuments?: boolean;
  /** Default sources to use if not specified in input (default: ['DSO', 'IPLO', 'Web']) */
  defaultSources?: DocumentSource[];
}

/**
 * Discovery Pipeline
 * 
 * Coordinates ingestion from multiple sources and optionally parses documents.
 *
 * Returns NormalizedDocument[] (or ParsedDocument[] if parsing enabled) in the documents field,
 * eliminating metadata smuggling.
 */
export class DiscoveryPipeline implements IPipeline<PipelineInput, DiscoveryOutput> {
  private parseDocuments: boolean;
  private defaultSources: DocumentSource[];

  constructor(
    private ingestionOrchestrator: IngestionOrchestrator,
    private policyParser?: PolicyParser,
    config: DiscoveryPipelineConfig = {}
  ) {
    this.parseDocuments = config.parseDocuments || false;
    this.defaultSources = config.defaultSources || ['DSO', 'IPLO', 'Web'];

    if (this.parseDocuments && !this.policyParser) {
      throw new Error('PolicyParser is required when parseDocuments is true');
    }
  }

  /**
   * Get the name of this pipeline
   *
   * @returns Pipeline name
   */
  getName(): string {
    return 'discovery';
  }

  /**
   * Execute the discovery pipeline
   *
   * @param input - Pipeline input
   * @returns Pipeline result with discovered documents
   */
  async execute(input: PipelineInput): Promise<PipelineResult<DiscoveryOutput>> {
    const startTime = Date.now();
    const sources = input.sources || this.defaultSources;
    const errors: Array<{ message: string; stack?: string; timestamp: Date }> = [];
    const allDocuments: NormalizedDocument[] = [];

    logger.debug({ sources, query: input.query }, '[DiscoveryPipeline] Starting discovery');

    // Ingest from all sources in parallel
    const ingestionPromises = sources.map(async (source) => {
      try {
        const options: IngestionOptions = {
          query: input.query,
          limit: input.options?.limit,
          dateRange: input.options?.dateRange,
          skipNormalization: false, // Always normalize for discovery
          skipDeduplication: false, // Always deduplicate for discovery
        };

        logger.debug({ source, options }, '[DiscoveryPipeline] Ingesting from source');

        const result = await this.ingestionOrchestrator.ingest(source, options);
        return { source, documents: result.documents, success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        errors.push({
          message: `Failed to ingest from source ${source}: ${errorMessage}`,
          stack: errorStack,
          timestamp: new Date(),
        });
        logger.error({ error, source }, '[DiscoveryPipeline] Failed to ingest from source');
        return { source, documents: [], success: false };
      }
    });

    const ingestionResults = await Promise.all(ingestionPromises);

    // Collect all documents
    for (const result of ingestionResults) {
      if (result.success) {
        allDocuments.push(...result.documents);
      }
    }

    logger.debug(
      { totalDocuments: allDocuments.length, sourcesProcessed: ingestionResults.filter(r => r.success).length },
      '[DiscoveryPipeline] Ingestion completed'
    );

    // Optionally parse documents
    let parsedDocuments: ParsedDocument[] | undefined;
    if (this.parseDocuments && this.policyParser && allDocuments.length > 0) {
      try {
        logger.debug({ documentCount: allDocuments.length }, '[DiscoveryPipeline] Starting parsing');

        // ✅ Use DocumentMapper to convert NormalizedDocument to CanonicalDocument for parsing
        // This is the single, tested conversion point (no ad-hoc conversions)
        // Parsers now accept CanonicalDocument directly and extract parsing fields via DocumentMapper
        const canonicalDocs: CanonicalDocument[] = allDocuments.map((doc) =>
          DocumentMapper.normalizedToCanonical(doc)
        );

        parsedDocuments = await Promise.all(
          canonicalDocs.map((doc) => this.policyParser!.parse(doc))
        );

        logger.debug(
          { inputCount: allDocuments.length, outputCount: parsedDocuments.length },
          '[DiscoveryPipeline] Parsing completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        errors.push({
          message: `Failed to parse documents: ${errorMessage}`,
          stack: errorStack,
          timestamp: new Date(),
        });
        logger.error({ error }, '[DiscoveryPipeline] Failed to parse documents');
      }
    }

    const completedAt = Date.now();
    const duration = completedAt - startTime;

    // Build result with honest types - always return normalized documents in documents field
    // ✅ No metadata smuggling - documents are in the documents field
    const result: PipelineResult<DiscoveryOutput> = {
      success: errors.length === 0 || allDocuments.length > 0, // Success if we got at least some documents
      documents: allDocuments, // ✅ Return actual normalized documents, not empty array
      metadata: {
        pipelineName: this.getName(),
        startedAt: new Date(startTime),
        completedAt: new Date(completedAt),
        duration,
        documentsProcessed: allDocuments.length,
        sources: sources,
        sourcesProcessed: ingestionResults.filter(r => r.success).length,
        parseDocuments: this.parseDocuments,
        // Include parsed documents in metadata if parsing was enabled (for pipelines that need them)
        parsedDocuments: parsedDocuments,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.debug(
      {
        success: result.success,
        documentCount: allDocuments.length,
        parsedCount: parsedDocuments?.length || 0,
        errorCount: errors.length,
        duration,
      },
      '[DiscoveryPipeline] Discovery completed'
    );

    return result;
  }
}
