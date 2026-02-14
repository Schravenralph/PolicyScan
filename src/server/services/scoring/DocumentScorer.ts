/**
 * Document Scorer - Main scoring orchestrator
 * 
 * Coordinates scoring factors and strategies to calculate document scores.
 * 
 * This is the main orchestrator for the scoring layer. It:
 * 1. Registers all scoring factors (authority, semantic, keyword, recency, type, rule)
 * 2. Uses a scoring strategy to combine factor scores
 * 3. Uses a ranker to rank documents by score
 */

import type { IScoringService } from './interfaces/IScoringService.js';
import type { IScoringFactor } from './interfaces/IScoringFactor.js';
import type { IScoringStrategy } from './interfaces/IScoringStrategy.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type { ScoredDocument, FactorScores } from './types/ScoredDocument.js';
import type { RankedDocument } from './types/RankedDocument.js';
import type { FactorResult } from './types/FactorResult.js';

// Factors
import { AuthorityFactor } from './factors/AuthorityFactor.js';
import { SemanticFactor } from './factors/SemanticFactor.js';
import { KeywordFactor } from './factors/KeywordFactor.js';
import { RecencyFactor } from './factors/RecencyFactor.js';
import { TypeFactor } from './factors/TypeFactor.js';
import { RuleFactor } from './factors/RuleFactor.js';

// Strategy
import { WeightedLinearScoringStrategy } from './strategies/WeightedLinearScoringStrategy.js';

// Ranker
import { ScoreRanker } from './rankers/ScoreRanker.js';

// Evaluation layer (for RuleFactor)
import type { IEvaluationService } from '../evaluation/interfaces/IEvaluationService.js';

/**
 * Main document scoring orchestrator
 * 
 * Coordinates scoring factors and strategies to calculate document scores.
 *
 * Uses dependency inversion - depends on IEvaluationService interface, not concrete RuleEvaluator.
 */
export class DocumentScorer implements IScoringService {
  private factors: IScoringFactor[];
  private strategy: IScoringStrategy;
  private ranker: ScoreRanker;

  constructor(private ruleEvaluator: IEvaluationService) {
    // ✅ Interface dependency - no default instantiation here

    // Register all scoring factors with default weights
    this.factors = [
      new AuthorityFactor(0.3),
      new SemanticFactor(0.3),
      new KeywordFactor(0.2),
      new RecencyFactor(0.1),
      new TypeFactor(0.1),
      new RuleFactor(0.1, this.ruleEvaluator), // ✅ Use injected interface
    ];

    // Set strategy
    this.strategy = new WeightedLinearScoringStrategy();
    
    // Set ranker
    this.ranker = new ScoreRanker();
  }

  async scoreDocument(document: CanonicalDocument, query?: string): Promise<ScoredDocument> {
    // Calculate all factor scores in parallel
    const factorResults: FactorResult[] = await Promise.all(
      this.factors.map(async (factor) => {
        const result = await factor.calculate(document, query);
        return result;
      })
    );

    // Combine scores using strategy
    const finalScore = await this.strategy.combine(factorResults);

    // Build factor scores object for the result
    const factorScores: FactorScores = {
      authority: factorResults.find(f => f.factor === 'authority')?.score || 0,
      semantic: factorResults.find(f => f.factor === 'semantic')?.score || 0,
      keyword: factorResults.find(f => f.factor === 'keyword')?.score || 0,
      recency: factorResults.find(f => f.factor === 'recency')?.score || 0,
      type: factorResults.find(f => f.factor === 'type')?.score || 0,
      rules: factorResults.find(f => f.factor === 'rule')?.score || 0,
    };

    return {
      ...document,
      finalScore,
      factorScores,
      scoredAt: new Date(),
    };
  }

  async scoreDocuments(documents: CanonicalDocument[], query?: string): Promise<ScoredDocument[]> {
    return Promise.all(
      documents.map(doc => this.scoreDocument(doc, query))
    );
  }

  async rankDocuments(documents: ScoredDocument[]): Promise<RankedDocument[]> {
    return this.ranker.rank(documents);
  }
}
