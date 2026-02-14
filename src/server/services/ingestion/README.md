# Ingestion Layer

The Ingestion Layer is responsible for collecting, normalizing, and deduplicating raw documents from various sources. It provides a clean separation of concerns by isolating ingestion logic from parsing, evaluation, and scoring.

## Overview

The Ingestion Layer consists of:

- **IngestionOrchestrator**: Main orchestrator that coordinates ingestion workflows
- **Adapters**: Source-specific ingestion adapters (DSO, IPLO, Web, Common Crawl)
- **Normalizers**: Document normalization components
- **Deduplicators**: Document deduplication components

## Architecture

```
IngestionOrchestrator (Orchestrator)
├── Adapters
│   ├── DsoIngestionAdapter - DSO (Digitaal Stelsel Omgevingswet) documents
│   ├── IploIngestionAdapter - IPLO (Informatiepunt Leefomgeving) documents
│   ├── WebIngestionAdapter - Web-scraped and municipality documents
│   └── CommonCrawlIngestionAdapter - Common Crawl archive documents
├── Normalizers
│   └── DocumentNormalizer - Normalizes RawDocument to NormalizedDocument
└── Deduplicators
    └── DocumentDeduplicator - Deduplicates NormalizedDocument objects
```

## Usage

### Basic Usage

```typescript
import { IngestionOrchestrator } from './ingestion/IngestionOrchestrator.js';
import type { DocumentSource } from '../../contracts/types.js';

// Create orchestrator
const orchestrator = new IngestionOrchestrator();

// Ingest documents from DSO
const result = await orchestrator.ingest('DSO', {
  query: 'klimaatadaptatie',
  limit: 100,
});

console.log(`Ingested ${result.documents.length} documents`);
console.log(`Removed ${result.metadata.duplicatesRemoved} duplicates`);
console.log(`Source: ${result.source}`);
console.log(`Ingested at: ${result.ingestedAt}`);
```

### Ingest from Multiple Sources

```typescript
// Ingest from IPLO
const iploResult = await orchestrator.ingest('IPLO', {
  query: 'omgevingsvisie',
  limit: 50,
});

// Ingest from Web
const webResult = await orchestrator.ingest('Web', {
  query: 'gemeente beleid',
  limit: 200,
});

// Combine results
const allDocuments = [
  ...result.documents,
  ...iploResult.documents,
  ...webResult.documents,
];
```

### Custom Configuration

```typescript
import { DocumentNormalizer } from './ingestion/normalizers/DocumentNormalizer.js';
import { DocumentDeduplicator } from './ingestion/deduplicators/DocumentDeduplicator.js';
import { DsoIngestionAdapter } from './ingestion/adapters/DsoIngestionAdapter.js';

// Create custom normalizer
const normalizer = new DocumentNormalizer();

// Create custom deduplicator
const deduplicator = new DocumentDeduplicator();

// Create custom adapter
const dsoAdapter = new DsoIngestionAdapter();

// Create orchestrator with custom components
const orchestrator = new IngestionOrchestrator({
  adapters: [dsoAdapter],
  normalizer: normalizer,
  deduplicator: deduplicator,
});
```

### Skip Normalization or Deduplication

```typescript
// Ingest without normalization
const result1 = await orchestrator.ingest('DSO', {
  query: 'test',
  skipNormalization: true,
});

// Ingest without deduplication
const result2 = await orchestrator.ingest('IPLO', {
  query: 'test',
  skipDeduplication: true,
});

// Ingest with both skipped (raw documents only)
const result3 = await orchestrator.ingest('Web', {
  query: 'test',
  skipNormalization: true,
  skipDeduplication: true,
});
```

### Use Individual Components

```typescript
import { DocumentNormalizer } from './ingestion/normalizers/DocumentNormalizer.js';
import { DocumentDeduplicator } from './ingestion/deduplicators/DocumentDeduplicator.js';
import type { RawDocument } from './ingestion/types/RawDocument.js';
import type { NormalizedDocument } from './ingestion/types/NormalizedDocument.js';

// Normalize raw documents
const normalizer = new DocumentNormalizer();
const rawDocuments: RawDocument[] = [
  {
    id: 'doc-1',
    url: 'https://example.com/doc1',
    title: 'Document 1',
    content: 'Content here',
    metadata: {},
  },
];

const normalized = await normalizer.normalize(rawDocuments);

// Deduplicate normalized documents
const deduplicator = new DocumentDeduplicator();
const deduplicationResult = await deduplicator.deduplicate(normalized);

console.log(`Deduplicated: ${deduplicationResult.documents.length} documents`);
console.log(`Removed: ${deduplicationResult.duplicatesRemoved} duplicates`);
```

## Components

### Adapters

#### DsoIngestionAdapter

Fetches raw documents from DSO (Digitaal Stelsel Omgevingswet) sources.

```typescript
import { DsoIngestionAdapter } from './ingestion/adapters/DsoIngestionAdapter.js';
import { PolicyParser } from '../parsing/PolicyParser.js';

const policyParser = new PolicyParser();
const adapter = new DsoIngestionAdapter(policyParser);

// Check if adapter can handle a source
if (adapter.canHandle('DSO')) {
  const rawDocuments = await adapter.ingest('DSO', {
    query: 'klimaatadaptatie',
    limit: 100,
  });
}
```

#### IploIngestionAdapter

Fetches raw documents from IPLO (Informatiepunt Leefomgeving) sources.

```typescript
import { IploIngestionAdapter } from './ingestion/adapters/IploIngestionAdapter.js';
import { PolicyParser } from '../parsing/PolicyParser.js';

const policyParser = new PolicyParser();
const adapter = new IploIngestionAdapter(policyParser);

if (adapter.canHandle('IPLO')) {
  const rawDocuments = await adapter.ingest('IPLO', {
    query: 'omgevingsvisie',
  });
}
```

#### WebIngestionAdapter

Fetches raw documents from web sources (scraping, URLs, municipalities).

```typescript
import { WebIngestionAdapter } from './ingestion/adapters/WebIngestionAdapter.js';
import { PolicyParser } from '../parsing/PolicyParser.js';

const policyParser = new PolicyParser();
const adapter = new WebIngestionAdapter(policyParser);

if (adapter.canHandle('Web') || adapter.canHandle('Gemeente')) {
  const rawDocuments = await adapter.ingest('Web', {
    query: 'gemeente beleid',
  });
}
```

#### CommonCrawlIngestionAdapter

Fetches raw documents from Common Crawl archive.

```typescript
import { CommonCrawlIngestionAdapter } from './ingestion/adapters/CommonCrawlIngestionAdapter.js';
import { PolicyParser } from '../parsing/PolicyParser.js';

const policyParser = new PolicyParser();
const adapter = new CommonCrawlIngestionAdapter(policyParser);

if (adapter.canHandle('Web')) {
  const rawDocuments = await adapter.ingest('Web', {
    query: 'commoncrawl',
  });
}
```

### Normalizers

#### DocumentNormalizer

Normalizes `RawDocument` objects to `NormalizedDocument` objects.

**Features:**
- Detects document source from URL and metadata
- Detects MIME type from URL extension and metadata
- Extracts title from content if not provided
- Preserves raw data for reference

```typescript
import { DocumentNormalizer } from './ingestion/normalizers/DocumentNormalizer.js';
import type { RawDocument } from './ingestion/types/RawDocument.js';

const normalizer = new DocumentNormalizer();

const rawDocuments: RawDocument[] = [
  {
    id: 'doc-1',
    url: 'https://overheid.nl/dso/document1',
    title: 'Document Title',
    content: 'Document content',
    metadata: { source: 'DSO' },
  },
];

const normalized = await normalizer.normalize(rawDocuments);

// normalized[0] is a NormalizedDocument with:
// - sourceId: 'doc-1'
// - sourceUrl: 'https://overheid.nl/dso/document1'
// - source: 'DSO' (detected)
// - title: 'Document Title'
// - content: 'Document content'
// - mimeType: 'application/xml' (detected from URL)
// - rawData: original RawDocument
// - metadata: { source: 'DSO' }
```

### Deduplicators

#### DocumentDeduplicator

Deduplicates `NormalizedDocument` objects based on `sourceId` and `sourceUrl`.

**Features:**
- Deduplicates by `sourceId` (primary)
- Deduplicates by `sourceUrl` (secondary)
- Supports `keepFirst` and `keepLast` strategies
- Provides duplicate information

```typescript
import { DocumentDeduplicator } from './ingestion/deduplicators/DocumentDeduplicator.js';
import type { NormalizedDocument } from './ingestion/types/NormalizedDocument.js';

const deduplicator = new DocumentDeduplicator();

const documents: NormalizedDocument[] = [
  // ... documents with potential duplicates
];

// Deduplicate with default options (bySourceId: true, bySourceUrl: true, keepFirst)
const result = await deduplicator.deduplicate(documents);

// Or with custom options
const result2 = await deduplicator.deduplicate(documents, {
  bySourceId: true,
  bySourceUrl: true,
  duplicateStrategy: 'keepLast', // Keep the last occurrence instead of first
});

console.log(`Deduplicated: ${result.documents.length} documents`);
console.log(`Removed: ${result.duplicatesRemoved} duplicates`);
if (result.duplicateInfo) {
  console.log(`Duplicate info:`, result.duplicateInfo);
}
```

## Types

### RawDocument

Input type for normalization. Represents a raw document as it comes from a source adapter.

```typescript
interface RawDocument {
  id: string;
  url: string;
  title?: string;
  content?: string;
  metadata: Record<string, unknown>;
}
```

### NormalizedDocument

Output of normalization, input to deduplication. Represents a normalized document ready for parsing.

```typescript
interface NormalizedDocument {
  sourceId: string;
  sourceUrl: string;
  source: DocumentSource;
  title: string;
  content: string;
  mimeType: string;
  rawData: unknown;
  metadata: Record<string, unknown>;
}
```

### IngestionResult

Result of an ingestion operation.

```typescript
interface IngestionResult {
  documents: NormalizedDocument[];
  source: DocumentSource;
  ingestedAt: Date;
  metadata: IngestionMetadata;
}

interface IngestionMetadata {
  totalIngested: number;
  duplicatesRemoved: number;
  [key: string]: unknown;
}
```

### IngestionOptions

Options for an ingestion operation.

```typescript
interface IngestionOptions {
  query?: string;
  dateRange?: { start: Date; end: Date };
  limit?: number;
  skipNormalization?: boolean;
  skipDeduplication?: boolean;
  [key: string]: unknown;
}
```

### DeduplicationResult

Result of a deduplication operation.

```typescript
interface DeduplicationResult {
  documents: NormalizedDocument[];
  duplicatesRemoved: number;
  duplicateInfo?: Array<{
    originalId: string;
    duplicateId: string;
    reason: string;
  }>;
  metadata?: Record<string, unknown>;
}
```

## Migration Guide

### From Direct Adapter Usage

**Before:**
```typescript
const dsoAdapter = new DsoAdapter();
const documents = await dsoAdapter.mapToCanonical(record);
```

**After:**
```typescript
const orchestrator = new IngestionOrchestrator();
const result = await orchestrator.ingest('DSO', { query, thema });
const documents = result.documents;
```

### From Manual Normalization/Deduplication

**Before:**
```typescript
const normalizationService = new DocumentNormalizationService();
const deduplicationService = new DocumentDeduplicationService();
// ... manual workflow
```

**After:**
```typescript
const orchestrator = new IngestionOrchestrator();
const result = await orchestrator.ingest('DSO', { query });
// Normalization and deduplication are handled automatically
```

## Notes

- **Ingestion vs. Parsing**: The ingestion layer only handles fetching and normalizing raw documents. Parsing (extracting rules, entities, citations) is handled by the parsing layer.
- **Ingestion vs. Workflow Normalization**: The ingestion layer's `DocumentNormalizer` works with `RawDocument` → `NormalizedDocument`. The workflow layer's `DocumentNormalizationService` works with `CanonicalDocument` → `CanonicalDocument` (different types, different purposes).
- **Adapter Placeholders**: Current adapters are placeholders that return mock data. Full implementation will be added in future phases.
- **Source Detection**: The normalizer automatically detects document sources from URLs and metadata, but explicit source specification in metadata is preferred.
