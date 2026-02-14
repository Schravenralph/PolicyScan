/**
 * Validation Schema for DiscoveredDocument
 * 
 * This schema validates the structure of discovery documents before enrichment
 * to prevent type errors and invalid enriched documents.
 * 
 * @see src/server/services/external/DSOOntsluitenService.ts - DiscoveredDocument interface
 * @see docs/21-issues/WI-406-step2-validation-discovery-documents.md
 */

import { z } from 'zod';

/**
 * Zod schema for DiscoveredDocument
 * 
 * Validates the canonical discovered document format used across all workflow steps.
 * This ensures documents have the required fields and correct types before enrichment.
 */
export const discoveredDocumentSchema = z.object({
    /** Document title (required) */
    title: z.string().min(1, 'title is required'),
    /** Document URL (required, must be valid URL) */
    url: z.string().url('url must be a valid URL'),
    /** Document summary (optional) */
    summary: z.string().optional(),
    /** Document category (required, must be one of the allowed values) */
    documentCategory: z.enum(
        ['policy', 'official_publication', 'jurisprudence', 'guidance', 'unverified_external']
    ),
    /** Document type (optional) */
    documentType: z.string().optional(),
    /** Source type (required, must be one of the allowed values) */
    sourceType: z.enum(
        ['DSO', 'IPLO', 'KNOWN_SOURCE', 'OFFICIELEBEKENDMAKINGEN', 'RECHTSPRAAK', 'COMMON_CRAWL']
    ),
    /** Source ID (optional) */
    sourceId: z.string().optional(),
    /** Issuing authority (optional) */
    issuingAuthority: z.string().optional(),
    /** Publication date (optional, ISO date string) */
    publicationDate: z.string().optional(),
    /** Authority score (required, must be between 0 and 1) */
    authorityScore: z.number().min(0, 'authorityScore must be at least 0').max(1, 'authorityScore must be at most 1'),
    /** Match signals (required object with optional numeric fields) */
    matchSignals: z.object({
        keyword: z.number().optional(),
        semantic: z.number().optional(),
        metadata: z.number().optional(),
    }),
    /** Match explanation (optional) */
    matchExplanation: z.string().optional(),
    /** Provenance array (required, array of provenance objects) */
    provenance: z.array(
        z.object({
            sourceType: z.string(),
            url: z.string().url('provenance url must be a valid URL'),
            fetchedAt: z.string(),
        })
    ).min(0, 'provenance array is required (can be empty)'),
});

/**
 * Schema for array of discovered documents
 */
export const discoveredDocumentArraySchema = z.array(discoveredDocumentSchema);

/**
 * Type inferred from the schema (matches DiscoveredDocument interface)
 */
export type ValidatedDiscoveredDocument = z.infer<typeof discoveredDocumentSchema>;

