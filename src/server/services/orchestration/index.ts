/**
 * Orchestration Layer - Main exports
 * 
 * Central export point for the orchestration layer.
 */

// Main service
export { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
export type { WorkflowOrchestratorConfig } from './WorkflowOrchestrator.js';

// Interfaces
export type { IOrchestrationService, DiscoveryQuery } from './interfaces/IOrchestrationService.js';
export type { IPipeline } from './interfaces/IPipeline.js';

// Pipelines
export { DiscoveryPipeline } from './pipelines/DiscoveryPipeline.js';
export type { DiscoveryPipelineConfig } from './pipelines/DiscoveryPipeline.js';
export { AnalysisPipeline } from './pipelines/AnalysisPipeline.js';
export type { AnalysisPipelineConfig } from './pipelines/AnalysisPipeline.js';
export { ReportingPipeline } from './pipelines/ReportingPipeline.js';
export type { ReportingPipelineConfig } from './pipelines/ReportingPipeline.js';

// Actions
export {
  createIngestionAction,
  createNormalizationAction,
  createDeduplicationAction,
} from './actions/ingestionActions.js';
export {
  createParsingAction,
  createRuleExtractionAction,
} from './actions/parsingActions.js';
export {
  createEvaluationAction,
  createRuleMatchingAction,
} from './actions/evaluationActions.js';
export {
  createScoringAction,
  createRankingAction,
  createScoreAndRankAction,
} from './actions/scoringActions.js';
export {
  createReportGenerationAction,
  createReportAggregationAction,
  createReportExportAction,
} from './actions/reportingActions.js';

// Types
export type { PipelineInput, PipelineOptions } from './types/PipelineInput.js';
export type { PipelineResult, PipelineMetadata } from './types/PipelineResult.js';
export type { DiscoveryResult, DiscoveryMetadata } from './types/DiscoveryResult.js';
export type { AnalysisResult, AnalysisSummary, AnalysisMetadata } from './types/AnalysisResult.js';
