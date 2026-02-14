/**
 * Scoring Layer - Main exports
 * 
 * Central export point for the scoring layer.
 */

// Main service
export { DocumentScorer } from './DocumentScorer.js';

// Interfaces
export type { IScoringService } from './interfaces/IScoringService.js';
export type { IScoringFactor } from './interfaces/IScoringFactor.js';
export type { IScoringStrategy } from './interfaces/IScoringStrategy.js';

// Types
export type { ScoredDocument, FactorScores } from './types/ScoredDocument.js';
export type { RankedDocument } from './types/RankedDocument.js';
export type { FactorResult } from './types/FactorResult.js';

// Factors
export { AuthorityFactor } from './factors/AuthorityFactor.js';
export { SemanticFactor } from './factors/SemanticFactor.js';
export { KeywordFactor } from './factors/KeywordFactor.js';
export { RecencyFactor } from './factors/RecencyFactor.js';
export { TypeFactor } from './factors/TypeFactor.js';
export { RuleFactor } from './factors/RuleFactor.js';

// Strategies
export { WeightedLinearScoringStrategy } from './strategies/WeightedLinearScoringStrategy.js';
export { MachineLearningScoringStrategy } from './strategies/MachineLearningScoringStrategy.js';
export { HybridScoringStrategy } from './strategies/HybridScoringStrategy.js';

// Rankers
export { ScoreRanker } from './rankers/ScoreRanker.js';
export { MultiFactorRanker } from './rankers/MultiFactorRanker.js';