# ETL Services

ETL (Extract, Transform, Load) pipeline services for transforming canonical documents into RDF/OWL and loading into GraphDB.

## Architecture

```
MongoDB/PostGIS → ETLExtractionService → Python Transformer → GraphDB Loader → GraphDB
                      ↓
                 ETLRunManager (orchestration)
                      ↓
                 ETLRunModel (state tracking)
```

## Components

### ETLRunManager

Orchestrates ETL pipeline execution:
- Creates and queues ETL runs
- Executes Python transformer
- Loads RDF into GraphDB
- Manages retry logic with exponential backoff
- Tracks run state (queued/running/succeeded/failed)

**Usage:**
```typescript
import { ETLRunManager } from './services/etl/index.js';

const runManager = new ETLRunManager();

// Create a new ETL run
const run = await runManager.createRun({
  input: {
    documentIds: ['doc1', 'doc2'],
    includeChunks: true,
    includeExtensions: {
      geo: true,
      legal: true,
      web: false,
    },
    geoSource: 'both',
  },
  models: {
    nlpModelId: 'spacy-nl@v3',
    rdfMappingVersion: 'v1.0',
  },
});

// Execute the run
await runManager.executeRun(run.runId);
```

### ETLExtractionService

Extracts canonical documents, chunks, and extensions from MongoDB/PostGIS.

**Usage:**
```typescript
import { ETLExtractionService } from './services/etl/index.js';

const extractionService = new ETLExtractionService();

// Extract documents based on ETL job request
const documents = await extractionService.extractDocuments(etlJobRequest);

// Serialize for Python transformer
const json = extractionService.serializeDocuments(documents);
```

### ETLReconciliationService

Detects missing graphs in GraphDB and reconciles with ETL run records.

**Usage:**
```typescript
import { ETLReconciliationService } from './services/etl/index.js';

const reconciliationService = new ETLReconciliationService();

// Reconcile a single run
const result = await reconciliationService.reconcileRun(runId);

// Find all missing graphs
const missing = await reconciliationService.findMissingGraphs();
```

### ETLValidationService

Validates RDF syntax and manifest files.

**Usage:**
```typescript
import { ETLValidationService } from './services/etl/index.js';

const validationService = new ETLValidationService();

// Validate Turtle file
const result = await validationService.validateTurtleFile('output.ttl');

// Validate ETL run output
const validation = await validationService.validateETLRunOutput(turtleFiles);
```

## Named Graph Strategy

- **Document graphs**: `http://data.example.org/graph/doc/{documentId}`
- **Provenance graphs**: `http://data.example.org/graph/prov/{runId}`

## Python Transformer

The Python transformer (`scripts/etl/python_transformer.py`) performs:
- NLP entity extraction (spaCy Dutch model)
- RDF conversion using vocabularies (doc:, law:, up:, kg:, prov:)
- PROV-O provenance generation

**Installation:**
```bash
pip install -r scripts/etl/requirements.txt
python -m spacy download nl_core_news_sm
```

## Cross-Runtime Contract

See `src/server/contracts/etlContracts.ts` for the stable Node↔Python contract:
- `ETLJobRequest` - Payload sent to Python transformer
- `ETLJobResult` - Result returned from Python transformer

## State Management

ETL runs are persisted in MongoDB (`etl_runs` collection) with states:
- `queued` - Run is queued for execution
- `running` - Run is currently executing
- `succeeded` - Run completed successfully
- `failed` - Run failed (may be retried)

## Retry Policy

- Default max retries: 3
- Exponential backoff: 1s, 2s, 4s
- Configurable via `ETLRunManagerConfig`

## Provenance

PROV-O provenance is generated for each ETL run:
- **Activity**: ETL run (`prov:activity:{runId}`)
- **Entities**: Document versions (contentFingerprint)
- **Used**: Artifact refs and model versions

## See Also

- [ETL GraphDB Plan](../../../../docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md)
- [Cross-Runtime Contracts](../../../../docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md)

