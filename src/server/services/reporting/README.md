# Reporting Layer

The Reporting Layer is responsible for aggregating, formatting, and exporting reports from scored documents. It provides a clean separation of concerns by isolating reporting logic from other system components.

## Overview

The Reporting Layer consists of:

- **ReportGenerator**: Main orchestrator that coordinates reporting workflows
- **Aggregators**: Data aggregation components (document, score, category)
- **Formatters**: Report formatting components (JSON, Markdown, HTML, PDF)
- **Exporters**: Report export components (file, API)

## Architecture

```
ReportGenerator (Orchestrator)
├── Aggregators
│   ├── DocumentAggregator - Groups documents by type, source, top documents
│   ├── ScoreAggregator - Calculates score statistics and distribution
│   └── CategoryAggregator - Groups documents by category
├── Formatters
│   ├── JsonReportFormatter - JSON output
│   ├── MarkdownReportFormatter - Markdown output
│   ├── HtmlReportFormatter - HTML output
│   └── PdfReportFormatter - PDF output (placeholder)
└── Exporters
    ├── FileExporter - Export to filesystem
    └── ApiExporter - Export to API endpoints
```

## Usage

### Basic Usage

```typescript
import { ReportGenerator } from './reporting/ReportGenerator.js';
import type { ScoredDocument } from './scoring/types/ScoredDocument.js';

// Create report generator
const reportGenerator = new ReportGenerator();

// Generate a JSON report
const documents: ScoredDocument[] = [
  // ... scored documents
];

const data = { documents };
const report = await reportGenerator.generateReport(data, 'json');

console.log(report.content); // JSON string
console.log(report.format); // 'json'
console.log(report.id); // Unique report ID
```

### Generate Different Formats

```typescript
// Generate Markdown report
const markdownReport = await reportGenerator.generateReport(data, 'markdown');

// Generate HTML report
const htmlReport = await reportGenerator.generateReport(data, 'html');

// Generate PDF report (placeholder)
const pdfReport = await reportGenerator.generateReport(data, 'pdf');
```

### Aggregate Documents

```typescript
// Aggregate documents without formatting
const aggregated = await reportGenerator.aggregateDocuments(documents);

console.log(aggregated.summary.totalDocuments); // Total count
console.log(aggregated.summary.averageScore); // Average score
console.log(aggregated.documents.byType); // Documents by type
console.log(aggregated.scores.distribution); // Score distribution
console.log(aggregated.categories.topCategories); // Top categories
```

### Export Reports

```typescript
// Export to file
await reportGenerator.exportReport(report, {
  type: 'file',
  path: '/path/to/report.json',
});

// Export to API
await reportGenerator.exportReport(report, {
  type: 'api',
  url: 'https://api.example.com/reports',
  method: 'POST',
  authToken: 'your-token',
});
```

## Components

### Aggregators

#### DocumentAggregator

Groups documents by type and source, and identifies top documents.

```typescript
import { DocumentAggregator } from './reporting/aggregators/DocumentAggregator.js';

const aggregator = new DocumentAggregator();
const summary = await aggregator.aggregate(documents);

// summary.total - Total document count
// summary.byType - Documents grouped by type
// summary.bySource - Documents grouped by source
// summary.topDocuments - Top N documents by score
```

#### ScoreAggregator

Calculates score statistics and distribution.

```typescript
import { ScoreAggregator } from './reporting/aggregators/ScoreAggregator.js';

const aggregator = new ScoreAggregator();
const summary = await aggregator.aggregate(documents);

// summary.average - Average score
// summary.min - Minimum score
// summary.max - Maximum score
// summary.distribution - Score distribution by range
```

#### CategoryAggregator

Groups documents by category using DocumentCategorizationService.

```typescript
import { CategoryAggregator } from './reporting/aggregators/CategoryAggregator.js';

const aggregator = new CategoryAggregator();
const summary = await aggregator.aggregate(documents);

// summary.totalCategories - Number of categories
// summary.topCategories - Top categories with counts and percentages
// summary.distribution - Category distribution
```

### Formatters

#### JsonReportFormatter

Formats aggregated data as JSON.

```typescript
import { JsonReportFormatter } from './reporting/formatters/JsonReportFormatter.js';

const formatter = new JsonReportFormatter();
const report = await formatter.format(aggregatedData);

// report.content - JSON string
// report.format - 'json'
```

#### MarkdownReportFormatter

Formats aggregated data as Markdown with tables.

```typescript
import { MarkdownReportFormatter } from './reporting/formatters/MarkdownReportFormatter.js';

const formatter = new MarkdownReportFormatter();
const report = await formatter.format(aggregatedData);

// report.content - Markdown string
// report.format - 'markdown'
```

#### HtmlReportFormatter

Formats aggregated data as HTML with styling.

```typescript
import { HtmlReportFormatter } from './reporting/formatters/HtmlReportFormatter.js';

const formatter = new HtmlReportFormatter();
const report = await formatter.format(aggregatedData);

// report.content - HTML string
// report.format - 'html'
```

#### PdfReportFormatter

Formats aggregated data as PDF (placeholder implementation).

```typescript
import { PdfReportFormatter } from './reporting/formatters/PdfReportFormatter.js';

const formatter = new PdfReportFormatter();
const report = await formatter.format(aggregatedData);

// report.content - Buffer (placeholder)
// report.format - 'pdf'
// Note: Actual PDF generation requires a PDF library (pdfkit, puppeteer, etc.)
```

### Exporters

#### FileExporter

Exports reports to the filesystem.

```typescript
import { FileExporter } from './reporting/exporters/FileExporter.js';

const exporter = new FileExporter();
await exporter.export(report, '/path/to/report.json');

// Automatically creates directories if needed
// Handles both string and Buffer content
```

#### ApiExporter

Exports reports to API endpoints.

```typescript
import { ApiExporter } from './reporting/exporters/ApiExporter.js';

const exporter = new ApiExporter();
await exporter.export(report, {
  url: 'https://api.example.com/reports',
  method: 'POST',
  headers: { 'X-Custom-Header': 'value' },
  authToken: 'your-token',
});

// Automatically sets Content-Type based on report format
// Supports POST, PUT, PATCH methods
```

## Types

### ReportData

Input data for report generation.

```typescript
interface ReportData {
  documents?: ScoredDocument[];
  scores?: ScoreData[];
  categories?: CategoryData[];
  metadata?: Record<string, unknown>;
}
```

### AggregatedData

Structured aggregated data ready for formatting.

```typescript
interface AggregatedData {
  summary: ReportSummary;
  documents: DocumentSummary;
  scores: ScoreSummary;
  categories: CategorySummary;
  metadata: Record<string, unknown>;
}
```

### Report

Generated report structure.

```typescript
interface Report {
  id: string;
  format: ReportFormat; // 'json' | 'markdown' | 'pdf' | 'html' | 'csv'
  content: string | Buffer;
  metadata: ReportMetadata;
  generatedAt: Date;
}
```

## Integration with Workflow Actions

The reporting layer is integrated into workflow actions:

```typescript
// In processingActions.ts
const reportGenerator = new ReportGenerator();
const aggregated = await reportGenerator.aggregateDocuments(ranked);

// Extract category counts from aggregated data
const categoryCounts = aggregated.categories.distribution;
const nonEmptyCategories = aggregated.categories.topCategories.map(cat => cat.category);
```

## Migration Guide

### From Manual Aggregation

**Before:**
```typescript
const categoryCounts = categorizationService.getCategoryCounts(categorized);
const nonEmptyCategories = categorizationService.getNonEmptyCategories(categorized);
```

**After:**
```typescript
const reportGenerator = new ReportGenerator();
const aggregated = await reportGenerator.aggregateDocuments(documents);
const categoryCounts = aggregated.categories.distribution;
const nonEmptyCategories = aggregated.categories.topCategories.map(cat => cat.category);
```

## Testing

All components have comprehensive integration tests:

- `tests/integration/reportingLayerStructure.integration.test.ts` - Structure validation
- `tests/integration/reportingAggregators.integration.test.ts` - Aggregator tests
- `tests/integration/reportingFormatters.integration.test.ts` - Formatter tests
- `tests/integration/reportingExporters.integration.test.ts` - Exporter tests
- `tests/integration/reportGenerator.integration.test.ts` - Orchestrator tests
- `tests/integration/workflow/processingActionsReportGenerator.integration.test.ts` - Workflow integration

## See Also

- [Reporting Layer Architecture](../../../docs/01-architecture/reporting-layer.md)
- [Scoring Layer](../scoring/README.md) - For ScoredDocument types
- [Evaluation Layer](../evaluation/README.md) - For rule evaluation
