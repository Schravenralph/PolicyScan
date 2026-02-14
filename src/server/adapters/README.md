# Adapters

This directory contains adapters for ingesting documents from various sources into the canonical format.

## Status: ✅ Complete

All adapters now **explicitly implement** the `IAdapter` interface, achieving **100% contract compliance**.

## Adapter Contract

All adapters implement the `IAdapter` interface with the following methods:
- `discover(input): Promise<unknown[]>` - Discover documents from source
- `acquire(record): Promise<unknown>` - Acquire artifact (download/fetch)
- `extract(bundle): Promise<unknown>` - Extract text and metadata
- `map(extracted): CanonicalDocumentDraft` - Map to canonical format
- `extensions(extracted): ExtensionDraft[]` - Generate domain extensions
- `validate(draft): void` - Schema validation (throws on failure)
- `persist(draft, extensions, ctx): Promise<unknown>` - Persist document, chunks, embeddings, extensions

## Implemented Adapters

- ✅ **DSO STOP/TPOD** (`DsoAdapter`) - Spatial planning documents
  - Extension: GeoExtension (geometries)
  - Discovery: Geometry-based or fixtures

- ✅ **Rechtspraak** (`RechtspraakAdapter`) - Legal case law (ECLI)
  - Extension: LegalExtension (ECLI, citations)
  - Discovery: ECLI identifiers or fixtures

- ✅ **Wetgeving** (`WetgevingAdapter`) - Legislation documents
  - Extension: LegalExtension (legal IDs)
  - Discovery: SRU CQL queries or fixtures

- ✅ **Gemeente/Beleid** (`GemeenteBeleidAdapter`) - Municipal policy documents
  - Extension: WebExtension (URLs, links)
  - Discovery: URLs or fixtures

## Usage

### Using AdapterOrchestrator (Recommended)

```typescript
import { AdapterOrchestrator } from './adapters/AdapterOrchestrator.js';
import { DsoAdapter } from './adapters/dso/DsoAdapter.js';

const adapter = new DsoAdapter({ useLiveApi: true });
const orchestrator = new AdapterOrchestrator();

const result = await orchestrator.execute(
  adapter,
  discoveryInput, // Source-specific
  { session: undefined }
);
```

### Manual Pipeline Execution

```typescript
const records = await adapter.discover(input);
const artifact = await adapter.acquire(records[0]);
const extracted = await adapter.extract(artifact);
const draft = adapter.map(extracted);
const extensions = adapter.extensions(extracted);
adapter.validate(draft);
const document = await adapter.persist(draft, extensions, ctx);
```

## Verification

Run the compliance verification script:

```bash
tsx scripts/verify-adapter-compliance.ts
```

## References

- **Contracts:** `docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md`
- **Usage Examples:** `docs/40-implementation-plans/final-plan-canonical-document-parsing/USAGE-EXAMPLES.md`
- **Quick Reference:** `docs/40-implementation-plans/final-plan-canonical-document-parsing/QUICK-REFERENCE.md`
- **Compliance Report:** `docs/40-implementation-plans/final-plan-canonical-document-parsing/CONTRACT-COMPLIANCE-COMPLETE.md`

