/**
 * Action Contracts - Explicit contracts for workflow action inputs/outputs
 * 
 * This module defines explicit contracts for all workflow actions, including:
 * - Input validation schemas (already defined in workflowActionsSchemas.ts)
 * - Output validation schemas (defined here)
 * - Contract metadata (timeout, retryable, error handling)
 * 
 * @see src/server/validation/workflowActionsSchemas.ts - Input schemas
 * @see docs/21-issues/WI-CONTRACT-001.md - Original issue
 */

import { z } from 'zod';
import { discoveredDocumentArraySchema } from '../validation/discoveredDocumentSchema.js';
import {
    searchDsoOntsluitenDiscoverySchema,
    enrichDsoDocumentsOptionalSchema,
    searchIploDocumentsSchema,
    scanKnownSourcesSchema,
    searchOfficieleBekendmakingenSchema,
    searchRechtspraakSchema,
    mergeScoreCategorizeSchema,
    searchCommonCrawlOptionalSchema,
} from '../validation/workflowActionsSchemas.js';

/**
 * Common output metadata schema
 */
const outputMetadataSchema = z.object({
    totalFound: z.number().int().min(0).optional(),
    executionTimeMs: z.number().int().min(0).optional(),
    source: z.string().optional(),
    queryId: z.string().optional(),
});

/**
 * Output schema for search_dso_ontsluiten_discovery action
 * Returns discovered DSO documents
 */
export const searchDsoOntsluitenDiscoveryOutputSchema = z.object({
    dsoDiscoveryDocuments: discoveredDocumentArraySchema,
    metadata: outputMetadataSchema.optional(),
});

/**
 * Output schema for enrich_dso_documents_optional action
 * Returns enriched DSO documents
 */
export const enrichDsoDocumentsOptionalOutputSchema = z.object({
    enrichedDocuments: discoveredDocumentArraySchema.optional(),
    documentsEnriched: z.number().int().min(0).optional(),
    metadata: outputMetadataSchema.optional(),
}).passthrough(); // Allow additional context properties

/**
 * Output schema for search_iplo_documents action
 * Returns discovered IPLO documents
 */
export const searchIploDocumentsOutputSchema = z.object({
    iploDocuments: discoveredDocumentArraySchema.optional(),
    documents: discoveredDocumentArraySchema.optional(), // Alternative property name
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Output schema for scan_known_sources action
 * Returns scraped documents from known sources
 */
export const scanKnownSourcesOutputSchema = z.object({
    scrapedDocuments: discoveredDocumentArraySchema.optional(),
    documents: discoveredDocumentArraySchema.optional(), // Alternative property name
    documentsScraped: z.number().int().min(0).optional(),
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Output schema for search_officielebekendmakingen action
 * Returns documents from Officiele Bekendmakingen
 */
export const searchOfficieleBekendmakingenOutputSchema = z.object({
    officieleBekendmakingenDocuments: discoveredDocumentArraySchema.optional(),
    documents: discoveredDocumentArraySchema.optional(), // Alternative property name
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Output schema for search_rechtspraak action
 * Returns documents from Rechtspraak
 */
export const searchRechtspraakOutputSchema = z.object({
    rechtspraakDocuments: discoveredDocumentArraySchema.optional(),
    documents: discoveredDocumentArraySchema.optional(), // Alternative property name
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Output schema for merge_score_categorize action
 * Returns merged, scored, and categorized documents
 */
export const mergeScoreCategorizeOutputSchema = z.object({
    documentsMerged: discoveredDocumentArraySchema.optional(),
    scoredDocuments: discoveredDocumentArraySchema.optional(), // For backward compatibility
    documentsByCategory: z.record(z.string(), discoveredDocumentArraySchema).optional(),
    categoryCounts: z.record(z.string(), z.number().int().min(0)).optional(),
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Output schema for search_common_crawl_optional action
 * Returns documents from Common Crawl
 */
export const searchCommonCrawlOptionalOutputSchema = z.object({
    commonCrawlDocuments: discoveredDocumentArraySchema.optional(),
    documents: discoveredDocumentArraySchema.optional(), // Alternative property name
    metadata: outputMetadataSchema.optional(),
}).passthrough();

/**
 * Action contract interface
 * Defines the complete contract for a workflow action
 */
export interface ActionContract<TInput = unknown, TOutput = unknown> {
    /** Input validation schema */
    inputSchema: z.ZodSchema<TInput>;
    /** Output validation schema */
    outputSchema: z.ZodSchema<TOutput>;
    /** Timeout in milliseconds (optional) */
    timeout?: number;
    /** Whether the action is retryable on failure (optional) */
    retryable?: boolean;
    /** Error handling strategy */
    errorHandling: 'fail' | 'continue' | 'retry';
    /** Action description for documentation */
    description?: string;
}

/**
 * Map of action names to their contracts
 */
export const actionContracts: Record<string, ActionContract> = {
    search_dso_ontsluiten_discovery: {
        inputSchema: searchDsoOntsluitenDiscoverySchema,
        outputSchema: searchDsoOntsluitenDiscoveryOutputSchema,
        timeout: 30000, // 30 seconds
        retryable: true,
        errorHandling: 'fail',
        description: 'Discover DSO documents via Ontsluiten v2 API',
    },
    enrich_dso_documents_optional: {
        inputSchema: enrichDsoDocumentsOptionalSchema,
        outputSchema: enrichDsoDocumentsOptionalOutputSchema,
        timeout: 60000, // 60 seconds (enrichment can take longer)
        retryable: true,
        errorHandling: 'continue', // Enrichment failures shouldn't stop workflow
        description: 'Enrich discovered DSO documents with additional metadata',
    },
    search_iplo_documents: {
        inputSchema: searchIploDocumentsSchema,
        outputSchema: searchIploDocumentsOutputSchema,
        timeout: 30000, // 30 seconds
        retryable: true,
        errorHandling: 'fail',
        description: 'Search IPLO documents',
    },
    scan_known_sources: {
        inputSchema: scanKnownSourcesSchema,
        outputSchema: scanKnownSourcesOutputSchema,
        timeout: 120000, // 120 seconds (scraping can take longer)
        retryable: true,
        errorHandling: 'fail',
        description: 'Scan known sources for documents',
    },
    search_officielebekendmakingen: {
        inputSchema: searchOfficieleBekendmakingenSchema,
        outputSchema: searchOfficieleBekendmakingenOutputSchema,
        timeout: 30000, // 30 seconds
        retryable: true,
        errorHandling: 'fail',
        description: 'Search Officiele Bekendmakingen documents',
    },
    search_rechtspraak: {
        inputSchema: searchRechtspraakSchema,
        outputSchema: searchRechtspraakOutputSchema,
        timeout: 30000, // 30 seconds
        retryable: true,
        errorHandling: 'fail',
        description: 'Search Rechtspraak documents',
    },
    merge_score_categorize: {
        inputSchema: mergeScoreCategorizeSchema,
        outputSchema: mergeScoreCategorizeOutputSchema,
        timeout: 60000, // 60 seconds (processing can take longer)
        retryable: false, // Merging/scoring shouldn't be retried
        errorHandling: 'fail',
        description: 'Merge, score, and categorize documents',
    },
    search_common_crawl_optional: {
        inputSchema: searchCommonCrawlOptionalSchema,
        outputSchema: searchCommonCrawlOptionalOutputSchema,
        timeout: 60000, // 60 seconds
        retryable: true,
        errorHandling: 'continue', // Common Crawl is optional
        description: 'Search Common Crawl for documents (optional)',
    },
};

/**
 * Validates workflow action output using the appropriate schema
 * 
 * @param actionName - Name of the workflow action
 * @param output - Output to validate
 * @returns Validation result with validated output or errors
 */
export function validateWorkflowActionOutput(
    actionName: string,
    output: unknown
): { valid: boolean; validatedOutput?: unknown; errors?: z.ZodError } {
    const contract = actionContracts[actionName];
    
    if (!contract) {
        // Action doesn't have a contract - allow it (for backward compatibility)
        return { valid: true, validatedOutput: output };
    }
    
    try {
        const validatedOutput = contract.outputSchema.parse(output);
        return { valid: true, validatedOutput };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { valid: false, errors: error };
        }
        throw error;
    }
}

/**
 * Gets the contract for a workflow action
 * 
 * @param actionName - Name of the workflow action
 * @returns Action contract or undefined if not found
 */
export function getActionContract(actionName: string): ActionContract | undefined {
    return actionContracts[actionName];
}


