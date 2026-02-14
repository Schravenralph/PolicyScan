/**
 * IPLO Fixtures for Standalone Execution (Production-safe copy)
 *
 * Mock IPLO documents for testing workflows that depend on IPLO data
 * in standalone mode without requiring IPLO scraping to run first.
 *
 * This file is a self-contained copy of tests/fixtures/workflow/iploFixtures.ts
 * to avoid importing from tests/ in production code.
 */

import { ObjectId } from 'mongodb';
import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Creates mock IPLO documents for standalone execution
 *
 * @param count Optional number of documents to generate (default: 2)
 * @returns Array of mock CanonicalDocument objects
 */
export function createIPLOFixtures(count: number = 2): CanonicalDocument[] {
  const fixtures: CanonicalDocument[] = [
    {
      _id: new ObjectId().toString(),
      title: 'IPLO Document: Ruimtelijke Ordening',
      canonicalUrl: 'https://iplo.nl/document/ruimtelijke-ordening',
      sourceId: 'iplo-ruimtelijke-ordening',
      source: 'Web',
      documentFamily: 'Beleid',
      documentType: 'IPLO Document',
      publisherAuthority: 'IPLO',
      fullText: 'Informatiepunt Leefomgeving document over ruimtelijke ordening. Dit document bevat informatie en richtlijnen voor ruimtelijke ordening.',
      dates: {
        publishedAt: new Date('2023-12-01'),
      },
      enrichmentMetadata: {
        authorityScore: 0.8,
        matchSignals: {
          semantic: 0.75,
          keyword: 0.8,
          metadata: 0.77,
        },
      },
      artifactRefs: [{
        sha256: 'b'.repeat(64), // Mock sha256 hash
        storageKey: 'bb/' + 'b'.repeat(64),
        mimeType: 'text/html',
        sizeBytes: 2048,
        createdAt: new Date(),
        provenance: {
          source: 'IPLO',
          acquiredAt: new Date(),
          url: 'https://iplo.nl/document/ruimtelijke-ordening',
        },
      }],
      contentFingerprint: 'mock-fingerprint-1',
      language: 'nl',
      sourceMetadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      schemaVersion: 'v2.0',
      reviewStatus: 'pending_review'
    },
    {
      _id: new ObjectId().toString(),
      title: 'IPLO Document: Klimaatadaptatie',
      canonicalUrl: 'https://iplo.nl/document/klimaatadaptatie',
      sourceId: 'iplo-klimaatadaptatie',
      source: 'Web',
      documentFamily: 'Beleid',
      documentType: 'IPLO Document',
      publisherAuthority: 'IPLO',
      fullText: 'Informatiepunt Leefomgeving document over klimaatadaptatie. Dit document bevat informatie en richtlijnen voor klimaatadaptatie.',
      dates: {
        publishedAt: new Date('2023-11-15'),
      },
      enrichmentMetadata: {
        authorityScore: 0.75,
        matchSignals: {
          semantic: 0.7,
          keyword: 0.75,
          metadata: 0.72,
        },
      },
      artifactRefs: [{
        sha256: 'e'.repeat(64), // Mock sha256 hash
        storageKey: 'ee/' + 'e'.repeat(64),
        mimeType: 'text/html',
        sizeBytes: 3072,
        createdAt: new Date(),
        provenance: {
          source: 'IPLO',
          acquiredAt: new Date(),
          url: 'https://iplo.nl/document/klimaatadaptatie',
        },
      }],
      contentFingerprint: 'mock-fingerprint-2',
      language: 'nl',
      sourceMetadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      schemaVersion: 'v2.0',
      reviewStatus: 'pending_review'
    },
  ];

  return fixtures.slice(0, count);
}

/**
 * Default IPLO fixtures (2 documents)
 */
export const defaultIPLOFixtures = createIPLOFixtures(2);
