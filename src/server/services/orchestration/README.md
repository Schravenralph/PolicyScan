# Orchestration Layer

The Orchestration Layer coordinates all other layers (ingestion, parsing, evaluation, scoring, reporting) to provide unified workflow execution through predefined pipelines. It provides a clean separation of concerns by isolating orchestration logic from individual layer implementations.

## Overview

The Orchestration Layer consists of:

- **WorkflowOrchestrator**: Main orchestrator that coordinates all layers and pipelines
- **Pipelines**: Predefined workflow pipelines (Discovery, Analysis, Reporting)
- **Actions**: Workflow actions for each layer (ingestion, parsing, evaluation, scoring, reporting)

## Architecture

```
WorkflowOrchestrator (Orchestrator)
├── Pipelines
│   ├── DiscoveryPipeline - Document discovery (ingestion + parsing)
│   ├── AnalysisPipeline - Document analysis (evaluation + scoring)
│   └── ReportingPipeline - Report generation (aggregation + reporting)
└── Actions
    ├── ingestionActions - Ingestion workflow actions
    ├── parsingActions - Parsing workflow actions
    ├── evaluationActions - Evaluation workflow actions
    ├── scoringActions - Scoring workflow actions
    └── reportingActions - Reporting workflow actions
```

## Usage

### Basic Usage

```typescript
import { WorkflowOrchestrator } from './orchestration/WorkflowOrchestrator.js';
import { IngestionOrchestrator } from './ingestion/IngestionOrchestrator.js';
import { PolicyParser } from './parsing/PolicyParser.js';
import { RuleEvaluator } from './evaluation/RuleEvaluator.js';
import { DocumentScorer } from './scoring/DocumentScorer.js';
import { ReportGenerator } from './reporting/ReportGenerator.js';

// Create layer services
const ingestionOrchestrator = new IngestionOrchestrator();
const policyParser = new PolicyParser();
const ruleEvaluator = new RuleEvaluator();
const documentScorer = new DocumentScorer(ruleEvaluator);
const reportGenerator = new ReportGenerator();

// Create orchestrator
const orchestrator = new WorkflowOrchestrator(
  ingestionOrchestrator,
  policyParser,
  ruleEvaluator,
  documentScorer,
  reportGenerator
);

// Discover documents
const discoveryResult = await orchestrator.discoverDocuments({
  query: 'klimaatadaptatie',
  sources: ['DSO', 'IPLO', 'Web'],
  options: { limit: 100 },
});

console.log(`Discovered ${discoveryResult.documents.length} documents`);
console.log(`Sources: ${discoveryResult.sources.join(', ')}`);

// Analyze documents
const analysisResult = await orchestrator.analyzeDocuments(
  discoveryResult.documents,
  'klimaatadaptatie'
);

console.log(`Analyzed ${analysisResult.documents.length} documents`);
console.log(`Average score: ${analysisResult.analysis.averageScore}`);

// Generate report
const report = await orchestrator.generateReport(
  { documents: analysisResult.documents },
  'json'
);

console.log(`Report generated: ${report.id}`);
```

### Using Pipelines Directly

```typescript
import type { PipelineInput } from './orchestration/types/PipelineInput.js';

// Execute discovery pipeline
const discoveryPipeline = orchestrator.getPipeline('discovery');
const discoveryInput: PipelineInput = {
  query: 'omgevingsvisie',
  sources: ['DSO'],
  options: { limit: 50 },
};

const discoveryResult = await orchestrator.executePipeline(
  discoveryPipeline!,
  discoveryInput
);

// Execute analysis pipeline
const analysisPipeline = orchestrator.getPipeline('analysis');
const analysisInput: PipelineInput = {
  documents: discoveryResult.documents as any,
  query: 'omgevingsvisie',
  options: {
    evaluateRules: true,
    scoreThreshold: 0.5,
  },
};

const analysisResult = await orchestrator.executePipeline(
  analysisPipeline!,
  analysisInput
);

// Execute reporting pipeline
const reportingPipeline = orchestrator.getPipeline('reporting');
const reportingInput: PipelineInput = {
  documents: analysisResult.documents as any,
  options: {
    reportFormat: 'markdown',
  },
};

const reportingResult = await orchestrator.executePipeline(
  reportingPipeline!,
  reportingInput
);
```

### Using Workflow Actions

```typescript
import { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import {
  createIngestionAction,
  createParsingAction,
  createEvaluationAction,
  createScoringAction,
  createGenerateReportAction,
} from './orchestration/index.js';

// Create workflow engine
const workflowEngine = new WorkflowEngine(runManager);

// Register orchestration actions
workflowEngine.registerAction(
  'ingest',
  createIngestionAction(ingestionOrchestrator)
);

workflowEngine.registerAction(
  'parse',
  createParsingAction(policyParser)
);

workflowEngine.registerAction(
  'evaluate',
  createEvaluationAction(ruleEvaluator)
);

workflowEngine.registerAction(
  'score',
  createScoringAction(documentScorer)
);

workflowEngine.registerAction(
  'generateReport',
  createGenerateReportAction(reportGenerator)
);

// Use in workflow
await workflowEngine.executeAction('ingest', {
  source: 'DSO',
  options: { query: 'test', limit: 10 },
}, runId);
```

### Custom Configuration

```typescript
import type { WorkflowOrchestratorConfig } from './orchestration/WorkflowOrchestrator.js';

// Configure pipelines
const config: WorkflowOrchestratorConfig = {
  discoveryConfig: {
    parseDocuments: true,
    defaultSources: ['DSO', 'IPLO'],
  },
  analysisConfig: {
    evaluateRules: true,
    scoreThreshold: 0.6,
    evaluationCriteria: {
      matchType: 'hybrid',
    },
  },
  reportingConfig: {
    defaultFormat: 'json',
    autoExport: false,
  },
};

const orchestrator = new WorkflowOrchestrator(
  ingestionOrchestrator,
  policyParser,
  ruleEvaluator,
  documentScorer,
  reportGenerator,
  config
);
```

## API Reference

### WorkflowOrchestrator

#### Constructor

```typescript
constructor(
  ingestionOrchestrator: IngestionOrchestrator,
  policyParser: PolicyParser,
  ruleEvaluator: RuleEvaluator,
  documentScorer: DocumentScorer,
  reportGenerator: ReportGenerator,
  config?: WorkflowOrchestratorConfig
)
```

#### Methods

##### `getPipelineNames(): string[]`

Get names of all registered pipelines.

**Returns:** Array of pipeline names (e.g., `['discovery', 'analysis', 'reporting']`)

##### `getPipeline(name: string): IPipeline | undefined`

Get a registered pipeline by name.

**Parameters:**
- `name`: Pipeline name

**Returns:** Pipeline instance or `undefined` if not found

##### `executePipeline(pipeline: IPipeline, input: PipelineInput): Promise<PipelineResult>`

Execute a pipeline with the given input.

**Parameters:**
- `pipeline`: Pipeline instance to execute
- `input`: Pipeline input (query, documents, options, etc.)

**Returns:** Pipeline result with documents, report, metadata, and errors

##### `discoverDocuments(query: DiscoveryQuery): Promise<DiscoveryResult>`

Discover documents from multiple sources.

**Parameters:**
- `query`: Discovery query with query string, sources, and options

**Returns:** Discovery result with normalized documents, sources, and metadata

##### `analyzeDocuments(documents: NormalizedDocument[], query?: string): Promise<AnalysisResult>`

Analyze documents (parse, evaluate, score).

**Parameters:**
- `documents`: Normalized documents to analyze
- `query`: Optional query for context

**Returns:** Analysis result with scored documents, summary, and metadata

##### `generateReport(data: ReportData, format: ReportFormat): Promise<Report>`

Generate a report from analyzed documents.

**Parameters:**
- `data`: Report data with documents and metadata
- `format`: Report format ('json', 'markdown', 'html', 'pdf')

**Returns:** Generated report with content and metadata

## Pipelines

### DiscoveryPipeline

Coordinates ingestion from multiple sources and optionally parses documents.

**Configuration:**
- `parseDocuments`: Whether to parse documents after ingestion (default: `false`)
- `defaultSources`: Default sources to use if not specified (default: `['DSO', 'IPLO', 'Web']`)

**Input:**
- `query`: Query string
- `sources`: Document sources to query
- `options`: Pipeline options (limit, dateRange, etc.)

**Output:**
- `documents`: Normalized or parsed documents
- `metadata`: Discovery metadata (total discovered, sources queried, etc.)

### AnalysisPipeline

Coordinates rule evaluation and document scoring/ranking.

**Configuration:**
- `evaluateRules`: Whether to evaluate rules (default: `false`)
- `evaluationCriteria`: Evaluation criteria options
- `scoreThreshold`: Score threshold for filtering (optional)

**Input:**
- `documents`: Parsed documents to analyze
- `query`: Optional query for context
- `options`: Pipeline options (evaluateRules, scoreThreshold, etc.)

**Output:**
- `documents`: Scored and ranked documents
- `metadata`: Analysis metadata (query, analysis summary, etc.)

### ReportingPipeline

Coordinates document aggregation and report generation.

**Configuration:**
- `defaultFormat`: Default report format (default: `'json'`)
- `autoExport`: Whether to automatically export reports (default: `false`)
- `defaultExportDestination`: Default export destination (if autoExport is true)

**Input:**
- `documents`: Scored documents
- `options`: Pipeline options (reportFormat, reportMetadata, exportDestination)

**Output:**
- `report`: Generated report
- `metadata`: Reporting metadata (report format, report ID, etc.)

## Actions

### Ingestion Actions

- `createIngestionAction(ingestionOrchestrator)`: Ingest documents from a source
- `createNormalizationAction(ingestionOrchestrator)`: Normalize raw documents
- `createDeduplicationAction(ingestionOrchestrator)`: Deduplicate normalized documents

### Parsing Actions

- `createParsingAction(policyParser)`: Parse normalized documents
- `createRuleExtractionAction(policyParser)`: Extract rules from a document

### Evaluation Actions

- `createEvaluationAction(ruleEvaluator)`: Evaluate policy rules
- `createRuleMatchingAction(ruleEvaluator)`: Match rules against a query

### Scoring Actions

- `createScoringAction(documentScorer)`: Score documents
- `createRankingAction(documentScorer)`: Rank scored documents
- `createScoreAndRankAction(documentScorer)`: Score and rank documents

### Reporting Actions

- `createGenerateReportAction(reportGenerator)`: Generate a report
- `createReportAggregationAction(reportGenerator)`: Aggregate documents for reporting
- `createReportExportAction(reportGenerator)`: Export a generated report

## Integration with WorkflowEngine

The orchestration layer integrates with `WorkflowEngine` through optional dependency injection:

```typescript
import { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import { WorkflowOrchestrator } from './orchestration/WorkflowOrchestrator.js';

// Create orchestrator
const orchestrator = new WorkflowOrchestrator(/* ... */);

// Pass to WorkflowEngine (optional)
const workflowEngine = new WorkflowEngine(
  runManager,
  navigationGraph,
  dependencies,
  orchestrator // Optional orchestrator
);

// Access orchestrator from workflow engine
const orchestrator = await workflowEngine.getOrchestrator();
```

## Migration Guide

### From Direct Layer Usage

**Before:**
```typescript
// Direct layer usage
const ingestionResult = await ingestionOrchestrator.ingest('DSO', options);
const parsed = await policyParser.parse(normalizedDoc);
const scored = await documentScorer.scoreDocuments(parsed, query);
const report = await reportGenerator.generateReport({ documents: scored }, 'json');
```

**After:**
```typescript
// Using orchestrator
const discoveryResult = await orchestrator.discoverDocuments({ query, sources: ['DSO'] });
const analysisResult = await orchestrator.analyzeDocuments(discoveryResult.documents, query);
const report = await orchestrator.generateReport({ documents: analysisResult.documents }, 'json');
```

### From Workflow Actions

**Before:**
```typescript
// Manual workflow action
workflowEngine.registerAction('process', async (params, runId) => {
  const ingestionResult = await ingestionOrchestrator.ingest('DSO', params.options);
  const parsed = await policyParser.parse(ingestionResult.documents[0]);
  const scored = await documentScorer.scoreDocuments([parsed], params.query);
  return { documents: scored };
});
```

**After:**
```typescript
// Using orchestration actions
import { createIngestionAction, createParsingAction, createScoringAction } from './orchestration/index.js';

workflowEngine.registerAction('ingest', createIngestionAction(ingestionOrchestrator));
workflowEngine.registerAction('parse', createParsingAction(policyParser));
workflowEngine.registerAction('score', createScoringAction(documentScorer));
```

## Examples

### Complete Workflow

```typescript
// 1. Discover documents
const discoveryResult = await orchestrator.discoverDocuments({
  query: 'klimaatadaptatie',
  sources: ['DSO', 'IPLO'],
  options: { limit: 100 },
});

// 2. Analyze documents
const analysisResult = await orchestrator.analyzeDocuments(
  discoveryResult.documents,
  'klimaatadaptatie'
);

// 3. Filter by score threshold
const highScoringDocs = analysisResult.documents.filter(
  doc => doc.finalScore >= 0.7
);

// 4. Generate report
const report = await orchestrator.generateReport(
  { documents: highScoringDocs },
  'markdown'
);

// 5. Export report (if needed)
await reportGenerator.exportReport(report, {
  type: 'file',
  path: '/tmp/report.md',
});
```

### Custom Pipeline Configuration

```typescript
const config: WorkflowOrchestratorConfig = {
  discoveryConfig: {
    parseDocuments: true, // Parse documents during discovery
    defaultSources: ['DSO'],
  },
  analysisConfig: {
    evaluateRules: true, // Evaluate rules during analysis
    scoreThreshold: 0.6, // Filter documents below 0.6
    evaluationCriteria: {
      matchType: 'hybrid',
      minConfidence: 0.7,
    },
  },
  reportingConfig: {
    defaultFormat: 'html',
    autoExport: true,
    defaultExportDestination: {
      type: 'file',
      path: '/tmp/reports',
    },
  },
};

const orchestrator = new WorkflowOrchestrator(/* ... */, config);
```

## Error Handling

All pipeline executions and high-level methods handle errors gracefully:

```typescript
try {
  const result = await orchestrator.discoverDocuments({ query: 'test' });
  // Process result
} catch (error) {
  // Handle error
  console.error('Discovery failed:', error);
}

// Pipeline results include errors array
const pipelineResult = await orchestrator.executePipeline(pipeline, input);
if (!pipelineResult.success) {
  console.error('Pipeline errors:', pipelineResult.errors);
}
```

## Type Definitions

### PipelineInput

```typescript
interface PipelineInput {
  query?: string;
  onderwerp?: string;
  thema?: string;
  sources?: DocumentSource[];
  documents?: NormalizedDocument[] | ParsedDocument[] | ScoredDocument[];
  options?: PipelineOptions;
  [key: string]: unknown;
}
```

### PipelineResult

```typescript
interface PipelineResult {
  success: boolean;
  documents?: ScoredDocument[] | NormalizedDocument[] | ParsedDocument[];
  report?: Report;
  metadata: PipelineMetadata;
  errors?: Array<{
    message: string;
    stack?: string;
    timestamp: Date;
  }>;
}
```

### DiscoveryResult

```typescript
interface DiscoveryResult {
  documents: NormalizedDocument[];
  sources: DocumentSource[];
  discoveredAt: Date;
  metadata: DiscoveryMetadata;
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  documents: ScoredDocument[];
  analysis: AnalysisSummary;
  analyzedAt: Date;
  metadata: AnalysisMetadata;
}
```

## See Also

- [Ingestion Layer](../ingestion/README.md) - Document ingestion and normalization
- [Parsing Layer](../parsing/README.md) - Document parsing and rule extraction
- [Evaluation Layer](../evaluation/README.md) - Rule evaluation
- [Scoring Layer](../scoring/README.md) - Document scoring and ranking
- [Reporting Layer](../reporting/README.md) - Report generation
- [Architecture Documentation](../../../../docs/01-architecture/orchestration-layer.md)
