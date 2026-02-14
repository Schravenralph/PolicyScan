/**
 * Zod validation schemas for workflow action parameters
 * 
 * These schemas provide type safety and input validation for all workflow step actions,
 * preventing injection attacks, type confusion bugs, and unexpected behavior.
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

/**
 * Common parameter schemas shared across multiple actions
 */
const commonParams = {
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters').optional(),
    thema: z.string().max(200, 'Thema must be at most 200 characters').optional(),
    overheidsinstantie: z.string().max(200, 'Overheidsinstantie must be at most 200 characters').optional(),
    overheidslaag: z.string().max(100, 'Overheidslaag must be at most 100 characters').optional(),
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
    queryId: commonSchemas.mongoId.optional(),
    maxResults: z.number().int().min(1, 'maxResults must be at least 1').max(1000, 'maxResults must be at most 1000').optional(),
};

/**
 * Normalizes mode parameter for DSO workflows
 * Maps 'dev' and 'hybrid' to 'preprod', keeps 'prod' as 'prod', defaults to 'preprod'
 * This allows workflows that use 'dev' or 'hybrid' modes to work with DSO actions
 * that only support 'preprod' and 'prod'
 */
const normalizeDsoMode = (mode: unknown): 'preprod' | 'prod' => {
    // Handle undefined, null, or non-string values
    if (mode === undefined || mode === null || typeof mode !== 'string') {
        return 'preprod';
    }
    const normalized = mode.toLowerCase().trim();
    // Only 'prod' maps to 'prod', everything else (including 'dev', 'hybrid') maps to 'preprod'
    if (normalized === 'prod') {
        return 'prod';
    }
    // Map 'dev', 'hybrid', and any other value to 'preprod'
    return 'preprod';
};

/**
 * Validation schema for search_dso_ontsluiten_discovery action
 */
export const searchDsoOntsluitenDiscoverySchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    thema: commonParams.thema,
    overheidsinstantie: commonParams.overheidsinstantie,
    overheidslaag: commonParams.overheidslaag,
    mode: z.preprocess(normalizeDsoMode, z.enum(['preprod', 'prod'])).optional().default('preprod'),
    maxResults: commonParams.maxResults,
    queryId: commonParams.queryId,
});

/**
 * Validation schema for enrich_dso_documents_optional action
 */
export const enrichDsoDocumentsOptionalSchema = z.object({
    enableEnrichment: z.boolean().optional().default(true),
    enrichmentTopK: z.number().int().min(1, 'enrichmentTopK must be at least 1').max(100, 'enrichmentTopK must be at most 100').optional().default(10),
    includeGeographic: z.boolean().optional().default(false),
    includeOWObjects: z.boolean().optional().default(false),
    dsoDiscoveryDocuments: z.array(z.any()).optional(), // DiscoveredDocument[] - complex type, validated at runtime
    queryId: commonParams.queryId,
}).passthrough(); // Allow additional params from workflow context

/**
 * Validation schema for search_iplo_documents action
 */
export const searchIploDocumentsSchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    thema: commonParams.thema,
    overheidsinstantie: commonParams.overheidsinstantie,
    overheidslaag: commonParams.overheidslaag,
    maxResults: commonParams.maxResults,
    queryId: commonParams.queryId,
});

/**
 * Validation schema for scan_known_sources action
 *
 * Note: Empty arrays for selectedWebsites or websiteData are allowed.
 * The action handler will complete successfully with no documents when no websites are selected.
 */
export const scanKnownSourcesSchema = z.object({
    selectedWebsites: z.array(z.string()).optional(),
    websiteData: z.array(z.object({
        url: z.string().url('url must be a valid URL'),
        titel: z.string().min(1, 'titel is required'),
        label: z.string().optional(),
        samenvatting: z.string().optional(),
        'relevantie voor zoekopdracht': z.string().optional(),
        accepted: z.boolean().nullable().optional(),
        subjects: z.array(z.string()).optional(),
        themes: z.array(z.string()).optional(),
        website_types: z.array(z.string()).optional(),
    })).optional(),
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters').optional(),
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
    thema: commonParams.thema,
    overheidsinstantie: commonParams.overheidsinstantie,
    overheidslaag: commonParams.overheidslaag,
    queryId: commonParams.queryId,
}).refine(
    (data) => data.onderwerp || data.query,
    { message: 'Either onderwerp or query must be provided' }
);

/**
 * Validation schema for search_officielebekendmakingen action
 */
export const searchOfficieleBekendmakingenSchema = z.object({
    onderwerp: z.string().max(500, 'Onderwerp must be at most 500 characters').optional(),
    thema: commonParams.thema,
    overheidsinstantie: commonParams.overheidsinstantie,
    overheidslaag: commonParams.overheidslaag,
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
    maxResults: commonParams.maxResults,
    queryId: commonParams.queryId,
}).refine(
    (data) => data.onderwerp || data.query,
    { message: 'Either onderwerp or query must be provided (defaults to "algemeen" if neither provided)' }
);

/**
 * Validation schema for search_rechtspraak action
 */
export const searchRechtspraakSchema = z.object({
    onderwerp: z.string().max(500, 'Onderwerp must be at most 500 characters').optional(),
    thema: commonParams.thema,
    overheidsinstantie: commonParams.overheidsinstantie,
    overheidslaag: commonParams.overheidslaag,
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
    maxResults: commonParams.maxResults,
    queryId: commonParams.queryId,
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be in YYYY-MM-DD format').optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be in YYYY-MM-DD format').optional(),
}).refine(
    (data) => data.onderwerp || data.query,
    { message: 'Either onderwerp or query must be provided' }
);

/**
 * Validation schema for merge_score_categorize action
 * 
 * Standardized to use 'onderwerp' consistently (removed 'query' parameter for consistency)
 */
export const mergeScoreCategorizeSchema = z.object({
    onderwerp: z.string().max(500, 'Onderwerp must be at most 500 characters').optional(),
    thema: commonParams.thema,
    queryId: commonParams.queryId,
}).passthrough(); // Allow additional params from workflow context (rawDocumentsBySource, etc.)

/**
 * Validation schema for search_common_crawl_optional action
 */
export const searchCommonCrawlOptionalSchema = z.object({
    onderwerp: z.string().max(500, 'Onderwerp must be at most 500 characters').optional(),
    thema: commonParams.thema,
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
    enableDeepScan: z.boolean().optional().default(false),
    queryId: commonParams.queryId,
}).passthrough().refine(
    (data) => data.onderwerp || data.query,
    { message: 'Either onderwerp or query must be provided' }
); // Allow additional params from workflow context

/**
 * Validation schema for search_dso_location action
 * Searches for omgevingsdocumenten at a specific geographic location
 */
export const searchDsoLocationSchema = z.object({
    /** Address to search (will be geocoded if coordinates not provided) */
    address: z.string().max(500, 'Address must be at most 500 characters').optional(),
    /** Pre-computed RD coordinates (overrides address geocoding) */
    coordinates: z.object({
        x: z.number().min(0, 'X coordinate must be positive').max(300000, 'X coordinate out of range'),
        y: z.number().min(300000, 'Y coordinate too small for Netherlands').max(700000, 'Y coordinate out of range'),
    }).optional(),
    /** Filter by government level */
    bestuurslaag: z.enum(['GEMEENTE', 'PROVINCIE', 'WATERSCHAP', 'RIJK']).optional(),
    /** Filter documents by validity date (ISO date format) */
    geldigOp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'geldigOp must be in YYYY-MM-DD format').optional(),
    /** Include future valid documents */
    inclusiefToekomstigGeldig: z.boolean().optional().default(false),
    /** Maximum results to return */
    maxResults: z.number().int().min(1, 'maxResults must be at least 1').max(200, 'maxResults must be at most 200').optional().default(100),
    /** API mode (preprod or prod) */
    mode: z.preprocess(normalizeDsoMode, z.enum(['preprod', 'prod'])).optional().default('preprod'),
    /** Query ID for linking to existing query document */
    queryId: commonParams.queryId,
}).refine(
    (data) => data.address || data.coordinates,
    { message: 'Either address or coordinates must be provided' }
);

/**
 * Map of action names to their validation schemas
 */
export const workflowActionSchemas: Record<string, z.ZodSchema> = {
    search_dso_ontsluiten_discovery: searchDsoOntsluitenDiscoverySchema,
    enrich_dso_documents_optional: enrichDsoDocumentsOptionalSchema,
    search_iplo_documents: searchIploDocumentsSchema,
    scan_known_sources: scanKnownSourcesSchema,
    search_officielebekendmakingen: searchOfficieleBekendmakingenSchema,
    search_rechtspraak: searchRechtspraakSchema,
    merge_score_categorize: mergeScoreCategorizeSchema,
    search_common_crawl_optional: searchCommonCrawlOptionalSchema,
    search_dso_location: searchDsoLocationSchema,
};

/**
 * Validates workflow action parameters using the appropriate schema
 * 
 * @param actionName - Name of the workflow action
 * @param params - Parameters to validate
 * @returns Validation result with validated params or errors
 */
export function validateWorkflowActionParams(
    actionName: string,
    params: Record<string, unknown>
): { valid: boolean; validatedParams?: unknown; errors?: z.ZodError } {
    const schema = workflowActionSchemas[actionName];
    
    if (!schema) {
        // Action doesn't have a schema - allow it (for backward compatibility)
        return { valid: true, validatedParams: params };
    }
    
    try {
        const validatedParams = schema.parse(params);
        return { valid: true, validatedParams };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { valid: false, errors: error };
        }
        throw error;
    }
}


/**
 * Validation schema for initializeScan action
 */
export const initializeScanSchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    thema: commonParams.thema,
    mode: z.enum(['dev', 'prod', 'hybrid']).optional(),
    customUrl: z.string().url().optional(),
}).passthrough();

/**
 * Validation schema for searchWeb action
 */
export const searchWebSchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    thema: commonParams.thema,
    mode: z.enum(['dev', 'prod', 'hybrid']).optional(),
    documents: z.array(z.any()).optional(),
    suggestedSources: z.array(z.any()).optional(),
}).passthrough();

/**
 * Validation schema for analyzeGraph action
 */
export const analyzeGraphSchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    thema: commonParams.thema,
}).passthrough();

/**
 * Validation schema for recursiveCrawl action
 */
export const recursiveCrawlSchema = z.object({
    frontier: z.array(z.string().url()).min(1, 'Frontier must contain at least one URL'),
    onderwerp: z.string().optional(),
    thema: commonParams.thema,
}).passthrough();

/**
 * Validation schema for finalizeScan action
 */
export const finalizeScanSchema = z.object({
    onderwerp: z.string().min(1, 'Onderwerp is required').max(500, 'Onderwerp must be at most 500 characters'),
    queryId: commonSchemas.mongoId.or(z.string()),
    documents: z.array(z.any()).optional(),
    suggestedSources: z.array(z.any()).optional(),
    workflowId: z.string().optional(),
}).passthrough();
