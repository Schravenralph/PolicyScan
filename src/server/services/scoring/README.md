# Scoring Layer

The Scoring Layer is responsible for calculating relevance scores for documents and ranking them. It provides a clean separation of concerns by isolating scoring logic from other system components.

## Overview

The Scoring Layer consists of:

- **DocumentScorer**: Main orchestrator that coordinates scoring workflows
- **Factors**: Individual scoring components (authority, semantic, keyword, recency, type, rule)
- **Strategies**: Methods for combining factor scores (weighted linear, ML, hybrid)
- **Rankers**: Methods for ranking documents by score

## Architecture

```
DocumentScorer (Orchestrator)
├── Factors
│   ├── AuthorityFactor - Document source authority
│   ├── SemanticFactor - Semantic relevance from embeddings
│   ├── KeywordFactor - Keyword matching score
│   ├── RecencyFactor - Publication date recency
│   ├── TypeFactor - Document type preference
│   └── RuleFactor - Rule-based scoring (uses Evaluation Layer)
├── Strategies
│   ├── WeightedLinearScoringStrategy - Weighted sum of factors
│   ├── MachineLearningScoringStrategy - ML-based (placeholder)
│   └── HybridScoringStrategy - Hybrid approach (placeholder)
└── Rankers
    ├── ScoreRanker - Simple score-based ranking
    └── MultiFactorRanker - Multi-factor ranking (placeholder)
```

## Usage

### Basic Usage

```typescript
import { DocumentScorer } from './scoring/DocumentScorer.js';
import { RuleEvaluator } from './evaluation/RuleEvaluator.js';
import type { CanonicalDocument } from '../../contracts/types.js';

// Create scorer
const ruleEvaluator = new RuleEvaluator();
const scorer = new DocumentScorer(ruleEvaluator);

// Score a single document
const document: CanonicalDocument = {
  // ... document properties
};

const scored = await scorer.scoreDocument(document, 'environmental policy');
console.log(`Score: ${scored.finalScore}`);
console.log(`Factor scores:`, scored.factorScores);

// Score multiple documents
const documents: CanonicalDocument[] = [/* ... */];
const scoredDocs = await scorer.scoreDocuments(documents, 'query');

// Rank documents
const ranked = await scorer.rankDocuments(scoredDocs);
console.log(`Top document: ${ranked[0].title} (rank: ${ranked[0].rank})`);
```

### Using Individual Factors

```typescript
import { AuthorityFactor } from './scoring/factors/AuthorityFactor.js';
import { SemanticFactor } from './scoring/factors/SemanticFactor.js';

// Create factors with custom weights
const authorityFactor = new AuthorityFactor(0.4); // 40% weight
const semanticFactor = new SemanticFactor(0.3); // 30% weight

// Calculate individual factor scores
const authorityResult = await authorityFactor.calculate(document);
const semanticResult = await semanticFactor.calculate(document, 'query');

console.log(`Authority: ${authorityResult.score}`);
console.log(`Semantic: ${semanticResult.score}`);
```

### Using Custom Strategy

```typescript
import { WeightedLinearScoringStrategy } from './scoring/strategies/WeightedLinearScoringStrategy.js';
import type { FactorResult } from './scoring/types/FactorResult.js';

const strategy = new WeightedLinearScoringStrategy();

const factors: FactorResult[] = [
  { factor: 'authority', score: 0.9, weight: 0.3 },
  { factor: 'semantic', score: 0.8, weight: 0.3 },
  { factor: 'keyword', score: 0.7, weight: 0.2 },
  { factor: 'recency', score: 0.6, weight: 0.1 },
  { factor: 'type', score: 0.5, weight: 0.1 },
];

const finalScore = strategy.combine(factors);
console.log(`Final score: ${finalScore}`);
```

### Using Rankers

```typescript
import { ScoreRanker } from './scoring/rankers/ScoreRanker.js';
import type { ScoredDocument } from './scoring/types/ScoredDocument.js';

const ranker = new ScoreRanker();

const scored: ScoredDocument[] = [
  { ...document1, finalScore: 0.9, factorScores: {...}, scoredAt: new Date() },
  { ...document2, finalScore: 0.7, factorScores: {...}, scoredAt: new Date() },
  { ...document3, finalScore: 0.8, factorScores: {...}, scoredAt: new Date() },
];

const ranked = await ranker.rank(scored);
// ranked[0] has rank: 1 (highest score)
// ranked[1] has rank: 2
// ranked[2] has rank: 3
```

## Scoring Factors

### AuthorityFactor

Calculates authority score based on document source and publisher.

**Priority:**
1. `enrichmentMetadata.authorityScore` (if available)
2. Computed from `source` field (DSO=0.9, Rechtspraak=0.9, Web=0.7, etc.)
3. Computed from `publisherAuthority` field
4. Default: 0.5 (neutral)

**Default Weight:** 0.3

### SemanticFactor

Calculates semantic relevance score from embeddings.

**Source:** `enrichmentMetadata.matchSignals.semanticSimilarity`

**Default Weight:** 0.3

### KeywordFactor

Calculates keyword match score by searching for query terms in document.

**Algorithm:**
- Searches for query terms in `title` and `fullText`
- Weighted: 60% title matches, 40% text matches
- Returns normalized score (0-1)

**Default Weight:** 0.2

### RecencyFactor

Calculates recency score based on publication date.

**Algorithm:**
- Full score (1.0) for documents published today
- Linear decay: 0.5 at 1 year, 0.0 at 10 years
- Future dates treated as very recent (1.0)

**Default Weight:** 0.1

### TypeFactor

Calculates document type preference score.

**Preference Mapping:**
- `Omgevingsvisie`, `Omgevingsplan`, `Staatsblad`: 1.0
- `Verordening`, `Hoge Raad`: 0.95
- `Omgevingsprogramma`, `Beleidsregel`, `Kamerstuk`: 0.9
- `Besluit`, `Regeling`: 0.85
- `Gerechtshof`: 0.85
- `Nota`, `Richtlijn`: 0.8
- `Rechtbank`, `Uitspraak`: 0.8
- `Handreiking`, `Leidraad`: 0.7
- Default: 0.5

**Default Weight:** 0.1

### RuleFactor

Calculates rule-based score using the Evaluation Layer.

**Source:** `enrichmentMetadata.linkedXmlData.rules`

**Uses:** `RuleEvaluator` from Evaluation Layer to calculate rule scores

**Default Weight:** 0.1

## Scoring Strategies

### WeightedLinearScoringStrategy

Combines factor scores using weighted linear combination.

**Formula:**
```
finalScore = Σ(factorScore_i × weight_i) / Σ(weight_i)
```

**Features:**
- Normalizes weights if they don't sum to 1.0
- Ensures result is in [0, 1] range

### MachineLearningScoringStrategy

Placeholder for future ML-based scoring.

**Status:** Not implemented (returns simple average)

### HybridScoringStrategy

Placeholder for future hybrid scoring approach.

**Status:** Not implemented (returns simple average)

## Rankers

### ScoreRanker

Simple score-based ranking.

**Algorithm:**
- Sorts documents by `finalScore` (highest first)
- Assigns rank positions (1 = highest score)

### MultiFactorRanker

Placeholder for future multi-factor ranking.

**Status:** Currently falls back to `ScoreRanker`

## Type Definitions

### ScoredDocument

```typescript
interface ScoredDocument extends CanonicalDocument {
  finalScore: number; // Calculated score (0-1)
  factorScores: FactorScores; // Breakdown by factor
  scoredAt: Date; // Timestamp when scored
}
```

### RankedDocument

```typescript
interface RankedDocument extends ScoredDocument {
  rank: number; // Rank position (1 = highest)
}
```

### FactorResult

```typescript
interface FactorResult {
  factor: string; // Factor name
  score: number; // Calculated score (0-1)
  weight: number; // Weight for this factor (0-1)
  metadata?: Record<string, unknown>; // Optional metadata
}
```

## Migration from DocumentScoringService

See `docs/40-implementation-plans/separation-of-concerns/MIGRATION-GUIDE-DocumentScoringService.md` for detailed migration instructions.

**Quick Migration:**

```typescript
// Before
import { DocumentScoringService } from './workflow/DocumentScoringService.js';
const service = new DocumentScoringService();
const scored = await service.scoreDocuments(documents, query);
const ranked = service.rankDocuments(scored);

// After
import { DocumentScorer } from './scoring/DocumentScorer.js';
import { RuleEvaluator } from './evaluation/RuleEvaluator.js';
const ruleEvaluator = new RuleEvaluator();
const scorer = new DocumentScorer(ruleEvaluator);
const scored = await scorer.scoreDocuments(documents, query);
const ranked = await scorer.rankDocuments(scored);
```

## Testing

### Integration Tests

All scoring components have comprehensive integration tests:

- `tests/integration/scoringLayerStructure.integration.test.ts` - Structure validation
- `tests/integration/scoringTypesAndInterfaces.integration.test.ts` - Type validation
- `tests/integration/scoringFactors.integration.test.ts` - Factor testing
- `tests/integration/scoringStrategies.integration.test.ts` - Strategy testing
- `tests/integration/scoringRankers.integration.test.ts` - Ranker testing
- `tests/integration/documentScorer.integration.test.ts` - DocumentScorer testing
- `tests/integration/workflow/processingActionsDocumentScorer.integration.test.ts` - Workflow integration

### Running Tests

```bash
# Run all scoring tests
pnpm test -- tests/integration/scoring

# Run specific test
pnpm test -- tests/integration/documentScorer.integration.test.ts
```

## API Reference

### DocumentScorer

#### `scoreDocument(document, query?)`

Scores a single document.

**Parameters:**
- `document: CanonicalDocument` - Document to score
- `query?: string` - Optional query for context-aware scoring

**Returns:** `Promise<ScoredDocument>`

#### `scoreDocuments(documents, query?)`

Scores multiple documents in parallel.

**Parameters:**
- `documents: CanonicalDocument[]` - Documents to score
- `query?: string` - Optional query for context-aware scoring

**Returns:** `Promise<ScoredDocument[]>`

#### `rankDocuments(documents)`

Ranks documents by score.

**Parameters:**
- `documents: ScoredDocument[]` - Scored documents to rank

**Returns:** `Promise<RankedDocument[]>`

## See Also

- [Scoring Layer Architecture](../docs/01-architecture/scoring-layer.md)
- [Evaluation Layer](../evaluation/README.md) - Used by RuleFactor
- [Parsing Layer](../parsing/README.md) - Provides PolicyRule objects
