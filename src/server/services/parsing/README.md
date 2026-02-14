# Parsing Layer

The parsing layer is responsible for extracting structured information from normalized documents. It parses document formats, extracts policy rules, entities, and citations, and validates the results.

## Overview

The parsing layer transforms `NormalizedDocument` objects into `ParsedDocument` objects by:

1. **Parsing** document formats (XML, HTML, Text, PDF)
2. **Extracting** policy rules, entities, and citations
3. **Validating** the parsed results

## Architecture

```
┌─────────────────┐
│ NormalizedDocument │
└────────┬──────────┘
         │
         ▼
┌─────────────────┐
│  PolicyParser   │  ← Main orchestrator
└────────┬──────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌──────┐ ┌─────────┐ ┌──────────┐
│ Parser │ │Rule  │ │ Entity  │ │ Citation │
│        │ │Extr. │ │ Extr.   │ │  Extr.   │
└────────┘ └──────┘ └─────────┘ └──────────┘
    │         │          │            │
    └─────────┴──────────┴────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ ParsedDocument   │
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │   Validator      │
         └──────────────────┘
```

## Core Components

### PolicyParser

The main orchestrator that coordinates parsing and extraction.

```typescript
import { PolicyParser } from './services/parsing/PolicyParser.js';
import type { CanonicalDocument } from '../../contracts/types.js';

const parser = new PolicyParser();

// Parse a document (extracts rules, entities, citations)
// PolicyParser accepts CanonicalDocument (use DocumentMapper to convert from NormalizedDocument)
const parsed = await parser.parse(canonicalDocument);

// Or extract individually
const rules = await parser.extractRules(canonicalDocument);
const entities = await parser.extractEntities(canonicalDocument);
const citations = await parser.extractCitations(canonicalDocument);
```

### Parsers

Format-specific parsers that extract document structure.

#### XmlPolicyParser

Parses XML documents (primarily DSO documents).

```typescript
import { XmlPolicyParser } from './services/parsing/parsers/XmlPolicyParser.js';

const xmlParser = new XmlPolicyParser();

if (xmlParser.canParse(document)) {
  const parsed = await xmlParser.parse(document);
  // Returns ParsedDocument with structure (rules/entities/citations empty)
}
```

### Extractors

Extractors that extract specific information from documents.

#### RuleExtractor

Extracts policy rules from documents.

```typescript
import { RuleExtractor } from './services/parsing/extractors/RuleExtractor.js';

const ruleExtractor = new RuleExtractor();
const rules = await ruleExtractor.extract(normalizedDocument);
```

#### EntityExtractor

Extracts entities using LLM-based extraction.

```typescript
import { EntityExtractor } from './services/parsing/extractors/EntityExtractor.js';
import { LLMService } from './services/llm/LLMService.js';

const llmService = new LLMService();
const entityExtractor = new EntityExtractor(llmService);
const entities = await entityExtractor.extract(normalizedDocument);
```

#### RuleBasedEntityExtractor

Extracts entities using rule-based patterns.

```typescript
import { RuleBasedEntityExtractor } from './services/parsing/extractors/RuleBasedEntityExtractor.js';

const entityExtractor = new RuleBasedEntityExtractor();
const entities = await entityExtractor.extract(normalizedDocument);
```

#### CitationExtractor

Extracts citations from documents.

```typescript
import { CitationExtractor } from './services/parsing/extractors/CitationExtractor.js';

const citationExtractor = new CitationExtractor();
const citations = await citationExtractor.extract(normalizedDocument);
```

### Validator

Validates parsed documents to ensure quality.

```typescript
import { ParsedDocumentValidator } from './services/parsing/validators/ParsedDocumentValidator.js';

const validator = new ParsedDocumentValidator();

// Basic validation
const result = validator.validate(parsedDocument);
if (!result.isValid) {
  console.error('Validation errors:', result.errors);
}

// Strict validation (require rules, entities, citations)
const strictResult = validator.validate(parsedDocument, {
  requireRules: true,
  requireEntities: true,
  requireCitations: true,
  requireDocumentType: true,
  minContentLength: 100,
});
```

## Usage Examples

### Basic Usage

```typescript
import { PolicyParser } from './services/parsing/PolicyParser.js';
import type { CanonicalDocument } from '../../contracts/types.js';

// Create parser
const parser = new PolicyParser();

// Parse a document
const parsed = await parser.parse(normalizedDocument);

// Access extracted information
console.log(`Extracted ${parsed.rules.length} rules`);
console.log(`Extracted ${parsed.entities.length} entities`);
console.log(`Extracted ${parsed.citations.length} citations`);
```

### Using in an Adapter

```typescript
import { PolicyParser } from '../services/parsing/PolicyParser.js';

export class MyAdapter {
  private policyParser: PolicyParser;

  constructor() {
    this.policyParser = new PolicyParser();
  }

  async processDocument(draft: CanonicalDocumentDraft): Promise<CanonicalDocumentDraft> {
    // Convert draft to NormalizedDocument
    const normalized = this.draftToNormalizedDocument(draft, contents);

    // Parse using PolicyParser
    const parsed = await this.policyParser.parse(normalized);

    // Store parsing results in enrichmentMetadata
    return {
      ...draft,
      enrichmentMetadata: {
        ...draft.enrichmentMetadata,
        parsingResults: {
          parsedAt: parsed.parsedAt,
          rules: parsed.rules,
          entities: parsed.entities,
          citations: parsed.citations,
          metadata: parsed.metadata,
        },
      },
    };
  }
}
```

### Validating Parsed Documents

```typescript
import { ParsedDocumentValidator } from './services/parsing/validators/ParsedDocumentValidator.js';

const validator = new ParsedDocumentValidator();

// Validate after parsing
const parsed = await parser.parse(normalizedDocument);
const validation = validator.validate(parsed, {
  requireRules: true,
  minContentLength: 100,
});

if (!validation.isValid) {
  // Handle validation errors
  for (const error of validation.errors) {
    console.error(`${error.field}: ${error.message}`);
  }
}

// Check warnings
if (validation.warnings.length > 0) {
  for (const warning of validation.warnings) {
    console.warn(`${warning.field}: ${warning.message}`);
  }
}
```

### Custom Parser Registration

```typescript
import { PolicyParser } from './services/parsing/PolicyParser.js';
import { MyCustomParser } from './parsers/MyCustomParser.js';

const parser = new PolicyParser();

// Register a custom parser
const customParser = new MyCustomParser();
parser.addParser(customParser);

// Now PolicyParser can use the custom parser
const parsed = await parser.parse(normalizedDocument);
```

## Type Definitions

### Input Type: CanonicalDocument

The parsing layer accepts `CanonicalDocument` as input. To convert from `NormalizedDocument` (from ingestion layer), use `DocumentMapper`:

```typescript
import { DocumentMapper } from '../orchestration/mappers/DocumentMapper.js';
import type { NormalizedDocument } from '../shared/types/DocumentModels.js';
import type { CanonicalDocument } from '../../contracts/types.js';

// Convert NormalizedDocument to CanonicalDocument for parsing
const canonicalDoc = DocumentMapper.normalizedToCanonical(normalizedDoc);

// Access parsing fields (mimeType, rawData) from sourceMetadata
const mimeType = canonicalDoc.sourceMetadata?.mimeType;
const rawData = canonicalDoc.sourceMetadata?.rawData;
```

### ParsedDocument

Output type from the parsing layer. Contains extracted structured information.

```typescript
interface ParsedDocument {
  sourceId: string;
  sourceUrl: string;
  title: string;
  content: string;
  documentType?: string;
  rules: PolicyRule[];
  entities: BaseEntity[];
  citations: Citation[];
  metadata: Record<string, unknown>;
  parsedAt: Date;
}
```

### PolicyRule

Extracted policy rule.

```typescript
interface PolicyRule {
  id: string;
  identificatie?: string;
  titel?: string;
  type?: string;
  content?: string;
  sourceDocument: string;
  extractedAt: Date;
}
```

### Citation

Extracted citation.

```typescript
interface Citation {
  id: string;
  text: string;
  type?: string;
  confidence: number;
  sourceDocument: string;
  extractedAt: Date;
}
```

## Interfaces

### IParsingService

Main interface for parsing services.

```typescript
interface IParsingService {
  parse(document: CanonicalDocument): Promise<ParsedDocument>;
  extractRules(document: CanonicalDocument): Promise<PolicyRule[]>;
  extractEntities(document: CanonicalDocument): Promise<BaseEntity[]>;
  extractCitations(document: CanonicalDocument): Promise<Citation[]>;
}
```

### IParser

Interface for format-specific parsers.

```typescript
interface IParser {
  canParse(document: CanonicalDocument): boolean;
  parse(document: CanonicalDocument): Promise<ParsedDocument>;
}
```

### IExtractor

Interface for extractors.

```typescript
interface IExtractor<T> {
  extract(document: CanonicalDocument): Promise<T[]>;
}
```

## Error Handling

The parsing layer handles errors gracefully:

- **Parser not found**: Throws error if no parser can handle the document
- **Extraction failures**: Returns empty arrays instead of throwing
- **Validation failures**: Returns validation result with errors/warnings

```typescript
try {
  const parsed = await parser.parse(normalizedDocument);
  // Use parsed document
} catch (error) {
  if (error.message.includes('No parser found')) {
    // Handle unsupported format
  } else {
    // Handle other errors
  }
}
```

## Testing

### Unit Tests

Unit tests are located in:
- `src/server/services/parsing/validators/__tests__/ParsedDocumentValidator.test.ts`

### Integration Tests

Integration tests are located in:
- `tests/integration/xmlPolicyParser.integration.test.ts`
- `tests/integration/ruleExtractor.integration.test.ts`
- `tests/integration/entityExtractors.integration.test.ts`
- `tests/integration/citationExtractor.integration.test.ts`
- `tests/integration/policyParser.integration.test.ts`
- `tests/integration/parsingLayerStructure.integration.test.ts`

## Migration Guide

### From Direct Extraction Service Usage

**Before:**
```typescript
import { EntityExtractionService } from './services/extraction/EntityExtractionService.js';

const extractionService = new EntityExtractionService();
const result = await extractionService.extractEntities(title, content, url);
```

**After:**
```typescript
import { PolicyParser } from './services/parsing/PolicyParser.js';

const parser = new PolicyParser();
const entities = await parser.extractEntities(normalizedDocument);
```

### From ContentProcessor Usage

**Before:**
```typescript
import { ContentProcessor } from './services/content-processing/ContentProcessor.js';

const processor = new ContentProcessor();
const result = processor.extractEntitiesAndRelationships(text, context);
```

**After:**
```typescript
import { PolicyParser } from './services/parsing/PolicyParser.js';

const parser = new PolicyParser();
const entities = await parser.extractEntities(normalizedDocument);
```

## See Also

- [Architecture Overview](../../../../docs/40-implementation-plans/separation-of-concerns/ARCHITECTURE-OVERVIEW.md)
- [Phase 1 Implementation Plan](../../../../docs/40-implementation-plans/separation-of-concerns/phase-1-parsing-layer.md)
