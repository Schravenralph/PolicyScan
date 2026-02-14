# ETL Cross-Runtime Contracts (Python)

Python implementation of ETL job request/response contracts using Pydantic.

## Overview

This package provides Pydantic models and validators for ETL job communication between Node/TypeScript orchestration and Python ETL workers.

**Reference:** [Cross-Runtime Contracts Documentation](../../../../../docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md)

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Loading and Validating Requests

```python
from src.server.etl.python.contracts import (
    load_etl_job_request,
    validate_etl_job_request,
    ETLContractValidationError,
)

# Load from file
try:
    request = load_etl_job_request('/path/to/request.json')
    print(f"Processing run: {request.run_id}")
except ETLContractValidationError as e:
    print(f"Validation failed: {e}")
    print(f"Errors: {e.errors}")

# Validate from dict
data = {
    "schemaVersion": "etl-job@v1",
    "runId": "507f1f77bcf86cd799439011",
    # ... rest of request
}
request = validate_etl_job_request(data)
```

### Creating Results

```python
from src.server.etl.python.contracts import ETLJobResult, ETLJobStats, ETLJobOutputs

result = ETLJobResult(
    schema_version='etl-result@v1',
    run_id=request.run_id,
    status='succeeded',
    stats=ETLJobStats(
        documents_processed=10,
        triples_emitted=1000,
        files_written=2,
    ),
    outputs=ETLJobOutputs(
        turtle_files=['output1.ttl', 'output2.ttl'],
        manifest='manifest.json',
    ),
)

# Serialize to JSON
import json
json_str = result.model_dump_json(indent=2)
```

### Manifest Generation

```python
from src.server.etl.python.contracts import ETLManifest, ManifestProvenance, DocumentFingerprint

manifest = ETLManifest(
    schema_version='etl-manifest@v1',
    run_id=request.run_id,
    created_at=request.created_at,
    completed_at=datetime.now().isoformat(),
    provenance=ManifestProvenance(
        input_fingerprints=[
            DocumentFingerprint(
                document_id='doc1',
                content_fingerprint='abc123...',
            ),
        ],
        parser_versions={'spacy': '3.7.0'},
        mapper_versions={'rdf-mapper': '1.0.0'},
        model_versions={'spacy-nl': '3.7.0'},
        rdf_mapping_version='rdf-mapping@v1.0.0',
    ),
    outputs={
        'turtleFiles': ['output1.ttl'],
        'manifest': 'manifest.json',
    },
    stats=result.stats,
)
```

## Models

All models use Pydantic v2 with:
- Field aliases for camelCase JSON (e.g., `runId` → `run_id`)
- Validation for required fields, types, and business rules
- Support for both dict and JSON string input

## Error Handling

Validation errors raise `ETLContractValidationError` with:
- Detailed error message
- List of validation errors (Pydantic format)
- Schema version (if available)

## Determinism

The Python implementation ensures:
- Deterministic output ordering
- Stable URI generation
- Reproducible results for identical inputs

