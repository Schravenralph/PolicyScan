# Document Identifier Matching Service

**Purpose:** Unified service for matching documents across different identifier formats (URL, sourceId, ECLI, BWBR, etc.)

**Status:** ✅ Production Ready

## Overview

The Document Identifier Matching Service solves the problem of matching documents when they're identified in different formats:

- **DSO documents:** AKN (`/akn/...`), IMRO (`NL.IMRO....`), DSO identificatie
- **Rechtspraak documents:** ECLI (`ECLI:NL:...`), Rechtspraak URLs
- **Wetgeving documents:** BWBR (`BWBR123456`), CVDR, AKN, Wetgeving URLs
- **Gemeente documents:** Municipal URLs (`amsterdam.nl`, etc.)
- **Web documents:** Generic URLs

## Architecture

### Components

1. **DocumentIdentifierSchema** - Zod contract for type-safe identifiers
2. **IdentifierNormalizer** - Interface for normalizer adapters
3. **Normalizers** - Source-specific identifier normalizers
4. **DocumentIdentifierMatchingService** - Main matching service with caching and metrics

### Matching Strategy

The service uses a multi-strategy approach:

1. **Direct sourceId match** (fastest, most reliable)
2. **URL match** (`canonicalUrl`, `sourceMetadata.legacyUrl`)
3. **Alternate identifier match** (AKN, IMRO, ECLI in metadata)
4. **Content fingerprint match** (fallback)

## Usage

### Basic Usage

```typescript
import { DocumentIdentifierMatchingService } from './services/identity/DocumentIdentifierMatchingService.js';
import { getCanonicalDocumentService } from './services/canonical/CanonicalDocumentService.js';

const documentService = getCanonicalDocumentService();
const matchingService = new DocumentIdentifierMatchingService(documentService);

// Find document by any identifier format
const doc = await matchingService.findDocument('https://example.com/omgevingsvisie');
// or
const doc2 = await matchingService.findDocument('/akn/nl/act/gm1234/2024/1');
// or
const doc3 = await matchingService.findDocument('ECLI:NL:HR:2024:123');
// or
const doc4 = await matchingService.findDocument('BWBR123456');
```

### Batch Matching

For better performance when matching multiple documents:

```typescript
// Match multiple identifiers in parallel
const identifiers = [
  'https://example.com/doc1',
  '/akn/nl/act/gm1234/2024/1',
  'ECLI:NL:HR:2024:123',
  'BWBR123456',
];

const results = await matchingService.findDocuments(identifiers, {
  concurrency: 10, // Process 10 at a time (default)
  continueOnError: true, // Continue on errors (default)
});

// Results is a Map: identifier -> document (or null)
for (const [identifier, document] of results) {
  if (document) {
    console.log(`Found: ${identifier} -> ${document._id}`);
  } else {
    console.log(`Not found: ${identifier}`);
  }
}
```

### Extract All Identifiers

```typescript
// Extract all possible identifiers from a document
const identifiers = await matchingService.extractAllIdentifiers(canonicalDocument);
// Returns: [{ source: 'DSO', sourceId: '...', canonicalUrl: '...', ... }, ...]
```

### Get Metrics

```typescript
const metrics = matchingService.getMetrics();
console.log({
  cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
  successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
  totalLookups: metrics.totalLookups,
  cacheSize: metrics.cacheSize,
});
```

### Cache Management

```typescript
// Clear cache manually
matchingService.clearCache();

// Clean expired entries
matchingService.cleanExpiredCache();

// Start periodic cleanup (10 minute intervals)
const intervalId = matchingService.startCacheCleanup(10 * 60 * 1000);

// Stop cleanup
matchingService.stopCacheCleanup(intervalId);
```

## Normalizers

### DsoIdentifierNormalizer

Handles:
- AKN identifiers: `/akn/nl/act/gm1234/2024/1`
- IMRO identifiers: `NL.IMRO.1234-2024`
- DSO identificatie: Generic DSO identifiers

### RechtspraakIdentifierNormalizer

Handles:
- ECLI identifiers: `ECLI:NL:HR:2024:123`
- Rechtspraak URLs: `https://rechtspraak.nl/...`

### WetgevingIdentifierNormalizer

Handles:
- BWBR identifiers: `BWBR123456`
- CVDR identifiers
- AKN identifiers for Wetgeving: `/akn/.../wet/...`
- Wetgeving URLs: `wetten.overheid.nl`, `officielebekendmakingen.nl`

### GemeenteIdentifierNormalizer

Handles:
- Municipal URLs: `amsterdam.nl`, `rotterdam.nl`, etc.
- Detects common municipal domain patterns

### UrlIdentifierNormalizer

Handles:
- Generic URLs (fallback)
- Auto-detects source from hostname

## Performance

### Caching

- **Cache TTL:** 5 minutes
- **Cache Strategy:** In-memory with automatic expiration
- **Cache Benefits:** 
  - Instant returns for cached lookups
  - Reduced database load
  - Caches both successful matches and null results

### Metrics

Tracked metrics:
- Total lookups
- Cache hits/misses
- Cache hit rate
- Successful/failed matches
- Success rate
- Normalization errors
- Cache size

## Integration

### With Ground Truth Evaluation

The service is automatically integrated with `GroundTruthEvaluationService`:

```typescript
// In GroundTruthEvaluationService.extractDocuments()
const matchingService = this.getIdentifierMatchingService();
const canonicalDoc = await matchingService.findDocument(doc.url);
if (canonicalDoc) {
  doc.documentId = canonicalDoc._id; // Enables documentId-based matching
}
```

### Adding New Normalizers

```typescript
class CustomNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    // Check if this normalizer can handle the identifier
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    // Normalize to standard format
  }
  
  extractIdentifiers(document: CanonicalDocument): DocumentIdentifier[] {
    // Extract all identifiers from document
  }
}

// Register the normalizer
matchingService.registerNormalizer(new CustomNormalizer(), 50); // Priority 50
```

## Database Indexes

The following indexes support fast identifier lookups:

- `idx_canonicalUrl` - For URL-based matching
- `idx_legacyUrl` - For legacy URL matching
- `idx_sourceMetadata_url` - For sourceMetadata URL matching
- `idx_discovery_identificatie` - For DSO AKN/IMRO matching

All indexes are:
- **Sparse:** Only index documents with these fields
- **Background:** Non-blocking creation
- **Idempotent:** Safe to run multiple times

## Testing

Run tests:
```bash
pnpm test -- src/server/services/identity/__tests__/DocumentIdentifierMatchingService.test.ts
```

## Related Documentation

- [WI-DOCUMENT-IDENTITY-001 Design Document](../../../docs/21-issues/WI-DOCUMENT-IDENTITY-001-document-identifier-matching.md)
- [Implementation Summary](../../../docs/21-issues/WI-DOCUMENT-IDENTITY-001-implementation-summary.md)
- [Optimizations](../../../docs/21-issues/WI-DOCUMENT-IDENTITY-001-optimizations.md)

