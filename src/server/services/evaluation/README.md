# Evaluation Layer

The Evaluation Layer is responsible for evaluating policy rules against various criteria. It provides a clean separation of concerns by isolating rule evaluation logic from other system components.

## Overview

The Evaluation Layer consists of:

- **RuleEvaluator**: Main orchestrator that coordinates evaluation workflows
- **Matchers**: Strategies for matching rules against queries (keyword, semantic, hybrid)
- **Evaluators**: Strategies for evaluating rules against criteria (query match, compliance, relevance)

## Architecture

```
RuleEvaluator (Orchestrator)
├── Matchers
│   ├── KeywordRuleMatcher - Keyword-based matching
│   ├── SemanticRuleMatcher - Semantic similarity matching
│   └── HybridRuleMatcher - Combines keyword and semantic
└── Evaluators
    ├── QueryMatchEvaluator - Evaluates rules against queries
    ├── ComplianceEvaluator - Evaluates compliance criteria
    └── RelevanceEvaluator - Evaluates relevance factors
```

## Usage

### Basic Usage

```typescript
import { RuleEvaluator } from './evaluation/RuleEvaluator.js';
import type { PolicyRule } from './parsing/types/PolicyRule.js';

// Create evaluator
const evaluator = new RuleEvaluator();

// Evaluate rules against a query
const rules: PolicyRule[] = [
  {
    id: 'rule-1',
    identificatie: 'REGEL-001',
    titel: 'Bouwhoogte maximum',
    type: 'gebiedsregel',
    content: 'De maximale bouwhoogte is 15 meter.',
    sourceDocument: 'doc-123',
    extractedAt: new Date(),
  },
];

const criteria = {
  query: 'bouwhoogte',
  matchType: 'hybrid',
  minScore: 0.3,
};

const result = await evaluator.evaluateRules(rules, criteria);
console.log(`Score: ${result.score}, Matches: ${result.matches.length}`);
```

### Using with DocumentScoringService

```typescript
import { DocumentScoringService } from './workflow/DocumentScoringService.js';
import { RuleEvaluator } from './evaluation/RuleEvaluator.js';

// Create evaluator and pass to scoring service
const ruleEvaluator = new RuleEvaluator();
const scoringService = new DocumentScoringService(undefined, ruleEvaluator);

// Score document (rule evaluation happens automatically)
const score = await scoringService.scoreDocument(document, 'query');
```

### Custom Matchers

```typescript
import { KeywordRuleMatcher } from './evaluation/matchers/KeywordRuleMatcher.js';
import { SemanticRuleMatcher } from './evaluation/matchers/SemanticRuleMatcher.js';
import { HybridRuleMatcher } from './evaluation/matchers/HybridRuleMatcher.js';
import { LocalEmbeddingProvider } from './query/VectorService.js';

// Create matchers
const keywordMatcher = new KeywordRuleMatcher();
const embeddingProvider = new LocalEmbeddingProvider();
const semanticMatcher = new SemanticRuleMatcher(embeddingProvider);
const hybridMatcher = new HybridRuleMatcher(keywordMatcher, semanticMatcher);

// Match a rule
const match = await hybridMatcher.match(rule, 'bouwhoogte');
if (match) {
  console.log(`Match score: ${match.matchScore}`);
}
```

### Custom Evaluators

```typescript
import { QueryMatchEvaluator } from './evaluation/evaluators/QueryMatchEvaluator.js';
import { ComplianceEvaluator } from './evaluation/evaluators/ComplianceEvaluator.js';
import { RelevanceEvaluator } from './evaluation/evaluators/RelevanceEvaluator.js';

// Query match evaluation
const queryEvaluator = new QueryMatchEvaluator(hybridMatcher);
const queryResult = await queryEvaluator.evaluate(rules, {
  query: 'bouwhoogte',
  matchType: 'hybrid',
});

// Compliance evaluation
const complianceEvaluator = new ComplianceEvaluator();
const complianceResult = await complianceEvaluator.evaluate(rules, {
  ruleTypes: ['gebiedsregel'],
  requiredPatterns: ['maximum'],
});

// Relevance evaluation
const relevanceEvaluator = new RelevanceEvaluator();
const relevanceResult = await relevanceEvaluator.evaluate(rules, {
  minScore: 0.5,
});
```

## Interfaces

### IEvaluationService

Main interface for the evaluation orchestrator.

```typescript
interface IEvaluationService {
  evaluateRules(rules: PolicyRule[], criteria: EvaluationCriteria): Promise<EvaluationResult>;
  matchRules(rules: PolicyRule[], query: string): Promise<RuleMatch[]>;
  calculateRuleScore(rules: PolicyRule[], query?: string): Promise<number>;
}
```

### IEvaluator

Interface for specific evaluation strategies.

```typescript
interface IEvaluator {
  evaluate(rules: PolicyRule[], criteria: EvaluationCriteria): Promise<EvaluationResult>;
}
```

### IRuleMatcher

Interface for rule matching strategies.

```typescript
interface IRuleMatcher {
  match(rule: PolicyRule, query: string): Promise<RuleMatch | null>;
}
```

## Types

### EvaluationCriteria

Criteria for evaluating rules.

```typescript
interface EvaluationCriteria {
  query?: string;
  minScore?: number;
  minConfidence?: number;
  matchType?: 'semantic' | 'keyword' | 'hybrid' | 'compliance' | 'relevance';
  ruleTypes?: string[];
  requiredPatterns?: string[];
  options?: Record<string, unknown>;
}
```

### EvaluationResult

Result of rule evaluation.

```typescript
interface EvaluationResult {
  matches: RuleMatch[];
  score: number;
  confidence: number;
  evaluationMethod: 'semantic' | 'keyword' | 'hybrid' | 'compliance' | 'relevance';
  metadata: Record<string, unknown>;
}
```

### RuleMatch

Single rule match result.

```typescript
interface RuleMatch {
  rule: PolicyRule;
  query: string;
  matchScore: number;
  matchType: 'semantic' | 'keyword' | 'exact' | 'pattern';
  matchedTerms: string[];
  confidence: number;
  explanation?: string;
}
```

## Matchers

### KeywordRuleMatcher

Matches rules based on keyword presence in rule titles, types, and content.

- **Case-insensitive** matching
- Filters words shorter than 3 characters
- Returns match score based on percentage of query words matched

### SemanticRuleMatcher

Matches rules based on semantic similarity using embeddings.

- Uses `LocalEmbeddingProvider` for generating embeddings
- Calculates cosine similarity between rule and query embeddings
- Requires minimum similarity threshold (default: 0.5)

### HybridRuleMatcher

Combines keyword and semantic matching.

- Configurable weights for keyword vs semantic matching
- Default: 40% keyword, 60% semantic
- Returns combined match score

## Evaluators

### QueryMatchEvaluator

Evaluates rules against a query string.

- Uses a matcher (typically `HybridRuleMatcher`) to find matches
- Calculates overall score based on number of matches
- Returns matches with scores above minimum threshold

### ComplianceEvaluator

Evaluates rules for compliance with specified criteria.

- Checks rule types against allowed types
- Validates required patterns in rule content
- Returns binary compliance score (1.0 if compliant, 0.0 otherwise)

### RelevanceEvaluator

Evaluates rules for relevance based on multiple factors.

- **Completeness**: Checks presence of rule metadata (identificatie, titel, type, content)
- **Content Length**: Longer content is considered more relevant
- **Recency**: Newer rules are considered more relevant
- **Query Match**: Direct query match in content provides boost

## Integration

The Evaluation Layer integrates with:

- **DocumentScoringService**: Uses `RuleEvaluator` for rule-based scoring
- **ReviewAutomationService**: Can optionally use `RuleEvaluator` for policy rule evaluation
- **Parsing Layer**: Consumes `PolicyRule[]` from the parsing layer

## Testing

### Unit Tests

Unit tests are located in:
- `src/server/services/evaluation/__tests__/`
- `src/server/services/evaluation/matchers/__tests__/`
- `src/server/services/evaluation/evaluators/__tests__/`

### Integration Tests

Integration tests verify:
- RuleEvaluator orchestration
- DocumentScoringService integration
- ReviewAutomationService integration
- End-to-end evaluation workflows

Integration tests are located in:
- `tests/integration/evaluationLayerStructure.integration.test.ts`
- `tests/integration/ruleMatchers.integration.test.ts`
- `tests/integration/ruleEvaluators.integration.test.ts`
- `tests/integration/ruleEvaluator.integration.test.ts`
- `tests/integration/documentScoringServiceRuleEvaluator.integration.test.ts`
- `tests/integration/reviewAutomationServiceRuleEvaluator.integration.test.ts`

## Migration Notes

### From Old Rule Evaluation Logic

The old rule evaluation logic in `DocumentScoringService.calculateRuleScore()` has been replaced by `RuleEvaluator`. The new implementation:

- **Separates concerns**: Rule evaluation is now isolated in the evaluation layer
- **More flexible**: Supports multiple evaluation strategies (query match, compliance, relevance)
- **Better testability**: Each component can be tested independently
- **Async support**: Properly handles async operations (e.g., semantic matching)

### Migration Path

1. **Old code** (deprecated):
   ```typescript
   // Old: Internal rule evaluation logic
   private calculateRuleScore(document: CanonicalDocument, query?: string): number {
     // ... internal logic ...
   }
   ```

2. **New code**:
   ```typescript
   // New: Delegates to RuleEvaluator
   private async calculateRuleScore(document: CanonicalDocument, query?: string): Promise<number> {
     const policyRules = convertToPolicyRules(document);
     return this.ruleEvaluator.calculateRuleScore(policyRules, query);
   }
   ```

## See Also

- [Architecture Overview](../../../../docs/40-implementation-plans/separation-of-concerns/ARCHITECTURE-OVERVIEW.md)
- [Phase 2 Implementation Plan](../../../../docs/40-implementation-plans/separation-of-concerns/phase-2-evaluation-layer.md)
- [Parsing Layer](../parsing/README.md)
