/**
 * Workflow Orchestrator - Main orchestration service
 * 
 * Coordinates all layers (ingestion, parsing, evaluation, scoring, reporting)
 * to provide unified workflow execution.
 * 
 * This orchestrator:
 * 1. Registers and manages pipelines (Discovery, Analysis, Reporting)
 * 2. Provides high-level methods for common workflows
 * 3. Coordinates pipeline execution
 */

import type { IOrchestrationService, DiscoveryQuery } from './interfaces/IOrchestrationService.js';
import type { IPipeline } from './interfaces/IPipeline.js';
import type { PipelineInput } from './types/PipelineInput.js';
import type { PipelineResult } from './types/PipelineResult.js';
import type { DiscoveryResult } from './types/DiscoveryResult.js';
import type { AnalysisResult } from './types/AnalysisResult.js';
import type { Report } from '../reporting/types/Report.js';
import type { ReportData } from '../reporting/types/ReportData.js';
import type { ReportFormat } from '../reporting/types/Report.js';
import type { NormalizedDocument } from '../shared/types/DocumentModels.js';
import type { DocumentSource } from '../../contracts/types.js';

// Layer services
import type { IngestionOrchestrator } from '../ingestion/IngestionOrchestrator.js';
import type { PolicyParser } from '../parsing/PolicyParser.js';
import type { RuleEvaluator } from '../evaluation/RuleEvaluator.js';
import type { DocumentScorer } from '../scoring/DocumentScorer.js';
import type { ReportGenerator } from '../reporting/ReportGenerator.js';

// Note: Workflow-level utilities (merging, categorization, normalization, deduplication)
// are handled directly by workflow actions, not by the orchestrator.
// The orchestrator only coordinates layer operations (ingestion → parsing → evaluation → scoring → reporting).

// Pipelines
import { DiscoveryPipeline } from './pipelines/DiscoveryPipeline.js';
import type { DiscoveryPipelineConfig } from './pipelines/DiscoveryPipeline.js';
import { AnalysisPipeline } from './pipelines/AnalysisPipeline.js';
import type { AnalysisPipelineConfig } from './pipelines/AnalysisPipeline.js';
import { ReportingPipeline } from './pipelines/ReportingPipeline.js';
import type { ReportingPipelineConfig } from './pipelines/ReportingPipeline.js';

import { logger } from '../../utils/logger.js';

/**
 * Configuration for WorkflowOrchestrator
 */
export interface WorkflowOrchestratorConfig {
  /** Configuration for DiscoveryPipeline */
  discoveryConfig?: DiscoveryPipelineConfig;
  /** Configuration for AnalysisPipeline */
  analysisConfig?: AnalysisPipelineConfig;
  /** Configuration for ReportingPipeline */
  reportingConfig?: ReportingPipelineConfig;
}

/**
 * Main workflow orchestrator
 * 
 * Coordinates all layers and pipelines to provide unified workflow execution.
 */
export class WorkflowOrchestrator implements IOrchestrationService {
  // Type-erased pipeline map to support different pipeline types
  private pipelines: Map<string, IPipeline<unknown, unknown>> = new Map();

  constructor(
    private ingestionOrchestrator: IngestionOrchestrator,
    private policyParser: PolicyParser,
    private ruleEvaluator: RuleEvaluator,
    private documentScorer: DocumentScorer,
    private reportGenerator: ReportGenerator,
    config: WorkflowOrchestratorConfig = {}
  ) {
    // Note: Workflow-level utilities are handled by actions, not orchestrator
    // Register pipelines
    const discoveryPipeline = new DiscoveryPipeline(
      this.ingestionOrchestrator,
      this.policyParser,
      config.discoveryConfig
    );
    this.pipelines.set('discovery', discoveryPipeline);

    const analysisPipeline = new AnalysisPipeline(
      this.ruleEvaluator,
      this.documentScorer,
      config.analysisConfig
    );
    this.pipelines.set('analysis', analysisPipeline);

    const reportingPipeline = new ReportingPipeline(
      this.reportGenerator,
      config.reportingConfig
    );
    this.pipelines.set('reporting', reportingPipeline);

    logger.debug(
      {
        pipelines: Array.from(this.pipelines.keys()),
      },
      '[WorkflowOrchestrator] Initialized with pipelines'
    );
  }

  /**
   * Execute a pipeline
   *
   * @param pipeline - Pipeline to execute (generic type erased for flexibility)
   * @param input - Pipeline input
   * @returns Pipeline result (type erased, use specific methods for typed results)
   */
  async executePipeline(pipeline: IPipeline<unknown, unknown>, input: PipelineInput): Promise<PipelineResult<unknown>> {
    logger.debug(
      { pipelineName: pipeline.getName() },
      '[WorkflowOrchestrator] Executing pipeline'
    );

    try {
      const result = await pipeline.execute(input);

      logger.debug(
        {
          pipelineName: pipeline.getName(),
          success: result.success,
          documentsProcessed: result.metadata.documentsProcessed,
        },
        '[WorkflowOrchestrator] Pipeline execution completed'
      );

      return result;
    } catch (error) {
      logger.error(
        { error, pipelineName: pipeline.getName() },
        '[WorkflowOrchestrator] Pipeline execution failed'
      );
      throw error;
    }
  }

  /**
   * Discover documents from multiple sources
   *
   * @param query - Discovery query
   * @returns Discovery result with normalized documents
   */
  async discoverDocuments(query: DiscoveryQuery): Promise<DiscoveryResult> {
    logger.debug({ query }, '[WorkflowOrchestrator] Starting document discovery');

    const pipeline = this.pipelines.get('discovery') as DiscoveryPipeline;
    if (!pipeline) {
      throw new Error('Discovery pipeline not registered');
    }

    // Convert sources from string[] to DocumentSource[]
    const sources: DocumentSource[] = (query.sources || []).map((s) => s as DocumentSource);

    const input: PipelineInput = {
      query: query.query,
      onderwerp: query.onderwerp,
      thema: query.thema,
      sources: sources.length > 0 ? sources : undefined,
      ...(query as Record<string, unknown>),
    };

    const result = await pipeline.execute(input);

    // Extract normalized documents from result documents field (no longer in metadata)
    // DiscoveryPipeline now returns documents in the documents field
    const normalizedDocuments = (result.documents as NormalizedDocument[]) || [];

    // Build discovery metadata
    const discoveryMetadata: DiscoveryResult['metadata'] = {
      totalDiscovered: normalizedDocuments.length,
      afterDeduplication: normalizedDocuments.length, // Already deduplicated by ingestion
      sourcesQueried: sources.length > 0 ? sources : (result.metadata.sources as DocumentSource[]) || [],
      ...(result.metadata as Record<string, unknown>),
    };

    const discoveryResult: DiscoveryResult = {
      documents: normalizedDocuments,
      sources: discoveryMetadata.sourcesQueried,
      discoveredAt: result.metadata.completedAt as Date,
      metadata: discoveryMetadata,
    };

    logger.debug(
      {
        documentCount: discoveryResult.documents.length,
        sources: discoveryResult.sources,
      },
      '[WorkflowOrchestrator] Document discovery completed'
    );

    return discoveryResult;
  }

  /**
   * Analyze documents (parse, evaluate, score)
   *
   * @param documents - Normalized documents to analyze
   * @param query - Optional query for context
   * @returns Analysis result with scored documents
   */
  async analyzeDocuments(
    documents: NormalizedDocument[],
    query?: string
  ): Promise<AnalysisResult> {
    logger.debug(
      { documentCount: documents.length, query },
      '[WorkflowOrchestrator] Starting document analysis'
    );

    if (documents.length === 0) {
      return {
        documents: [],
        analysis: {
          totalDocuments: 0,
          averageScore: 0,
          minScore: 0,
          maxScore: 0,
        },
        analyzedAt: new Date(),
        metadata: {
          query,
        },
      };
    }

    const pipeline = this.pipelines.get('analysis') as AnalysisPipeline;
    if (!pipeline) {
      throw new Error('Analysis pipeline not registered');
    }

    // Convert NormalizedDocument[] to CanonicalDocument[] for AnalysisPipeline
    // AnalysisPipeline expects CanonicalDocument[], but we have NormalizedDocument[]
    // We'll pass them in metadata and let AnalysisPipeline handle the conversion
    const input: PipelineInput = {
      query,
      metadata: {
        normalizedDocuments: documents,
      },
    };

    const result = await pipeline.execute(input);

    // Extract scored documents from result
    const scoredDocuments = result.documents || [];

    // Calculate statistics
    const averageScore =
      scoredDocuments.length > 0
        ? scoredDocuments.reduce((sum, doc) => sum + doc.finalScore, 0) / scoredDocuments.length
        : 0;
    const minScore =
      scoredDocuments.length > 0
        ? Math.min(...scoredDocuments.map((doc) => doc.finalScore))
        : 0;
    const maxScore =
      scoredDocuments.length > 0
        ? Math.max(...scoredDocuments.map((doc) => doc.finalScore))
        : 0;

    const analysisResult: AnalysisResult = {
      documents: scoredDocuments,
      analysis: {
        totalDocuments: scoredDocuments.length,
        averageScore,
        minScore,
        maxScore,
      },
      analyzedAt: result.metadata.completedAt as Date,
      metadata: {
        query,
        ...(result.metadata as Record<string, unknown>),
      },
    };

    logger.debug(
      {
        documentCount: analysisResult.documents.length,
        averageScore: analysisResult.analysis.averageScore,
      },
      '[WorkflowOrchestrator] Document analysis completed'
    );

    return analysisResult;
  }

  /**
   * Generate a report from analyzed documents
   *
   * @param data - Report data
   * @param format - Report format
   * @returns Generated report
   */
  async generateReport(data: ReportData, format: ReportFormat): Promise<Report> {
    logger.debug(
      { format, documentCount: data.documents?.length || 0 },
      '[WorkflowOrchestrator] Starting report generation'
    );

    const pipeline = this.pipelines.get('reporting') as ReportingPipeline;
    if (!pipeline) {
      throw new Error('Reporting pipeline not registered');
    }

    const input: PipelineInput = {
      documents: data.documents,
      options: {
        reportFormat: format,
        reportMetadata: data.metadata,
      },
    };

    const result = await pipeline.execute(input);

    if (!result.report) {
      throw new Error('Report generation failed: no report in result');
    }

    logger.debug(
      { format, reportId: result.report.id },
      '[WorkflowOrchestrator] Report generation completed'
    );

    return result.report;
  }

  /**
   * Get a registered pipeline by name
   *
   * @param name - Pipeline name
   * @returns Pipeline instance or undefined (type erased)
   */
  getPipeline(name: string): IPipeline<unknown, unknown> | undefined {
    return this.pipelines.get(name);
  }

  /**
   * Get all registered pipeline names
   *
   * @returns Array of pipeline names
   */
  getPipelineNames(): string[] {
    return Array.from(this.pipelines.keys());
  }

  // Note: Workflow-level utilities (normalize, deduplicate, merge, categorize, createQuery)
  // are handled directly by workflow actions, not by the orchestrator.
  // The orchestrator only coordinates layer operations (analyzeDocuments, executePipeline, etc.).
}
