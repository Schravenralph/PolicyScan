# ETL Cross-Runtime Contracts

This directory contains the contract definitions and implementations for ETL job communication between Node/TypeScript orchestration and Python ETL workers.

## Overview

The ETL system uses Node/TypeScript for orchestration and Python for NLP/RDF conversion. This directory defines the stable contract between them.

**Reference:** [Cross-Runtime Contracts Documentation](../../../../docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md)

## Structure

```
contracts/
├── types.ts              # TypeScript type definitions
├── schemas.ts            # Zod validation schemas
├── serializer.ts         # Serialization/deserialization utilities
├── manifest.ts           # Manifest generator with provenance
├── index.ts              # Public exports
├── schemas/              # JSON Schema files (for reference)
│   ├── etl-job-request.schema.json
│   ├── etl-job-result.schema.json
│   └── etl-manifest.schema.json
└── README.md            # This file
```

## Contract Versions

- **ETLJobRequest**: `etl-job@v1`
- **ETLJobResult**: `etl-result@v1`
- **ETLManifest**: `etl-manifest@v1`

Any breaking change increments the schema version (e.g., `etl-job@v2`). The Node orchestrator must support the current version and optionally one prior version during migrations.

## Usage

### TypeScript/Node

```typescript
import {
  ETLJobRequest,
  serializeETLJobRequest,
  deserializeETLJobRequest,
  validateETLJobRequest,
  generateETLManifest,
} from '@/server/etl/contracts';

// Create a job request
const request: ETLJobRequest = {
  schemaVersion: 'etl-job@v1',
  runId: '507f1f77bcf86cd799439011',
  createdAt: new Date().toISOString(),
  input: {
    documentIds: ['doc1', 'doc2'],
    includeChunks: true,
    includeExtensions: { geo: true, legal: false, web: false },
    geoSource: 'mongo',
  },
  models: {
    nlpModelId: 'spacy-nl@v3.7.0',
    rdfMappingVersion: 'rdf-mapping@v1.0.0',
  },
  output: {
    format: 'turtle',
    outputDir: '/path/to/output',
    manifestName: 'manifest.json',
  },
};

// Validate
const validated = validateETLJobRequest(request);

// Serialize to JSON
const json = serializeETLJobRequest(request);

// Deserialize from JSON
const deserialized = deserializeETLJobRequest(json);
```

### Python

```python
from src.server.etl.python.contracts import (
    ETLJobRequest,
    validate_etl_job_request,
    load_etl_job_request,
)

# Load and validate from file
request = load_etl_job_request('/path/to/request.json')

# Or validate from dict
data = {...}  # dict with request data
request = validate_etl_job_request(data)
```

## Transport

**MVP:** Local process invocation (Node spawns Python, passes input file paths)

**Future:** Migration to job queue (Node enqueues job payload; Python worker consumes)

## Determinism and Replay

Given identical inputs (document versions + mapping versions), Python output MUST be deterministic.

The manifest MUST include:
- Input fingerprints (documentId + contentFingerprint)
- Versions of parsers/mappers/models

## Validation

Both TypeScript (Zod) and Python (Pydantic) implementations validate:
- Schema version compatibility
- Required fields
- Type constraints
- Business rules (e.g., XOR constraints for documentIds/query)

Validation errors include detailed information about which fields failed and why.

## Manifest Generation

The manifest generator creates deterministic manifests with provenance:

```typescript
import { generateETLManifest } from '@/server/etl/contracts';

const manifest = generateETLManifest(request, result, {
  inputFingerprints: [
    { documentId: 'doc1', contentFingerprint: 'abc123...' },
  ],
  parserVersions: { spacy: '3.7.0' },
  mapperVersions: { 'rdf-mapper': '1.0.0' },
  modelVersions: { 'spacy-nl': '3.7.0' },
  rdfMappingVersion: 'rdf-mapping@v1.0.0',
  outputFiles: result.outputs,
  stats: result.stats,
});
```

## JSON Schemas

JSON Schema files are provided in `schemas/` for:
- Documentation
- External tooling integration
- Contract validation in other languages

These schemas are derived from the Zod schemas and kept in sync manually.

