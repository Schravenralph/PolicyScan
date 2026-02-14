/**
 * Main Interface for Orchestration Service
 * 
 * Defines the contract for coordinating all layers in the system.
 */

import type { IPipeline } from './IPipeline.js';
import type { PipelineInput } from '../types/PipelineInput.js';
import type { PipelineResult } from '../types/PipelineResult.js';
import type { DiscoveryResult } from '../types/DiscoveryResult.js';
import type { AnalysisResult } from '../types/AnalysisResult.js';
import type { Report } from '../../reporting/types/Report.js';
import type { ReportData } from '../../reporting/types/ReportData.js';
import type { ReportFormat } from '../../reporting/types/Report.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';

/**
 * Query for document discovery
 */
export interface DiscoveryQuery {
  /** Query string */
  query?: string;
  /** Subject/topic */
  onderwerp?: string;
  /** Theme/topic refinement */
  thema?: string;
  /** Data sources to query */
  sources?: string[];
  /** Additional query parameters */
  [key: string]: unknown;
}

/**
 * Main interface for orchestration service
 */
export interface IOrchestrationService {
  /**
   * Execute a pipeline
   *
   * @param pipeline - Pipeline to execute (generic type erased for flexibility)
   * @param input - Pipeline input
   * @returns Pipeline result (type erased, use specific methods for typed results)
   */
  executePipeline(pipeline: IPipeline<unknown, unknown>, input: PipelineInput): Promise<PipelineResult<unknown>>;

  /**
   * Discover documents from multiple sources
   *
   * @param query - Discovery query
   * @returns Discovery result with normalized documents
   */
  discoverDocuments(query: DiscoveryQuery): Promise<DiscoveryResult>;

  /**
   * Analyze documents (parse, evaluate, score)
   *
   * @param documents - Normalized documents to analyze
   * @param query - Optional query for context
   * @returns Analysis result with scored documents
   */
  analyzeDocuments(documents: NormalizedDocument[], query?: string): Promise<AnalysisResult>;

  /**
   * Generate a report from analyzed documents
   *
   * @param data - Report data
   * @param format - Report format
   * @returns Generated report
   */
  generateReport(data: ReportData, format: ReportFormat): Promise<Report>;
}
