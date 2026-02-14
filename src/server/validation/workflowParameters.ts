/**
 * Standardized Workflow Parameter Schemas
 * 
 * This module provides standardized parameter schemas for all workflow actions.
 * It ensures consistent parameter names and handling across all workflows.
 * 
 * Standard Parameters:
 * - `onderwerp` (required) - Subject/topic for search
 * - `thema` (optional) - Theme/topic refinement
 * - `overheidsinstantie` (optional) - Government institution filter
 * - `overheidstype` (optional) - Government type filter
 * 
 * @see docs/21-issues/WI-407-standardize-parameter-handling.md
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';

/**
 * Base parameters used by most workflows
 * These are the standard parameters that should be used consistently
 */
export const baseWorkflowParametersSchema = z.object({
    /** Subject/topic for search (required for most workflows) */
    onderwerp: z.string().min(3, 'Onderwerp must be at least 3 characters').max(500, 'Onderwerp must be at most 500 characters'),
    /** Theme/topic refinement (optional) */
    thema: z.string().max(200, 'Thema must be at most 200 characters').optional(),
    /** Government institution filter (optional) */
    overheidsinstantie: z.string().max(200, 'Overheidsinstantie must be at most 200 characters').optional(),
    /** Government type filter (optional) - e.g., 'Gemeente', 'Provincie', 'Rijk' */
    overheidstype: z.string().max(100, 'Overheidstype must be at most 100 characters').optional(),
    /** Query ID for linking to existing query document (optional) */
    queryId: commonSchemas.mongoId.optional(),
});

/**
 * Base parameters with optional onderwerp (for actions that can work without it)
 */
export const baseWorkflowParametersOptionalOnderwerpSchema = baseWorkflowParametersSchema.extend({
    onderwerp: z.string().min(3, 'Onderwerp must be at least 3 characters').max(500, 'Onderwerp must be at most 500 characters').optional(),
});

/**
 * Extended parameters for workflows that support maxResults
 */
export const workflowParametersWithMaxResults = baseWorkflowParametersSchema.extend({
    maxResults: z.number().int().min(1, 'maxResults must be at least 1').max(1000, 'maxResults must be at most 1000').optional(),
});

/**
 * Extended parameters for workflows that support mode (DSO workflows)
 */
export const workflowParametersWithMode = baseWorkflowParametersSchema.extend({
    mode: z.enum(['preprod', 'prod']).optional().default('preprod'),
});

/**
 * Extended parameters for workflows that support both mode and maxResults
 */
export const workflowParametersWithModeAndMaxResults = baseWorkflowParametersSchema.extend({
    mode: z.enum(['preprod', 'prod']).optional().default('preprod'),
    maxResults: z.number().int().min(1, 'maxResults must be at least 1').max(1000, 'maxResults must be at most 1000').optional(),
});

/**
 * Legacy parameter support
 * Some workflows may accept 'query' as an alias for 'onderwerp' for backward compatibility
 * This schema allows both but prefers 'onderwerp'
 */
export const workflowParametersWithLegacyQuery = baseWorkflowParametersSchema.extend({
    /** Legacy parameter - use 'onderwerp' instead. Maps to 'onderwerp' if provided. */
    query: z.string().max(1000, 'Query must be at most 1000 characters').optional(),
}).transform((data) => {
    // If query is provided but onderwerp is not, use query as onderwerp
    if (data.query && !data.onderwerp) {
        return {
            ...data,
            onderwerp: data.query,
            query: undefined, // Remove query after mapping
        };
    }
    return data;
});

/**
 * Parameter usage documentation
 * 
 * This object documents which parameters are used by each workflow action.
 * This helps ensure consistency and provides a reference for developers.
 */
export const workflowParameterUsage: Record<string, {
    required: string[];
    optional: string[];
    used: string[]; // Parameters that are actually used in the action logic
    notes?: string;
}> = {
    'search_dso_ontsluiten_discovery': {
        required: ['onderwerp'],
        optional: ['thema', 'overheidsinstantie', 'overheidslaag', 'mode', 'queryId'],
        used: ['onderwerp', 'thema', 'overheidsinstantie', 'overheidslaag', 'mode', 'queryId'],
        notes: 'Uses onderwerp for DSO API search. overheidsinstantie is used as opgesteldDoor filter in DSO API. overheidslaag is stored in Query document.',
    },
    'enrich_dso_documents_optional': {
        required: [],
        optional: ['dsoDiscoveryDocuments', 'enableEnrichment', 'enrichmentTopK', 'includeGeographic', 'includeOWObjects', 'queryId'],
        used: ['dsoDiscoveryDocuments', 'enableEnrichment', 'enrichmentTopK', 'includeGeographic', 'includeOWObjects', 'queryId'],
        notes: 'Enrichment action - supports standalone execution via dsoDiscoveryDocuments parameter. If not provided, uses documents from workflow context (rawDocumentsBySource.dsoDiscovery). queryId is used for document persistence.',
    },
    'search_iplo_documents': {
        required: ['onderwerp'],
        optional: ['thema', 'overheidsinstantie', 'overheidslaag', 'maxResults', 'queryId'],
        used: ['onderwerp', 'thema', 'overheidsinstantie', 'overheidslaag', 'maxResults', 'queryId'],
        notes: 'Uses onderwerp and thema for IPLO search query. overheidsinstantie and overheidslaag are stored in Query document. maxResults limits the number of results returned.',
    },
    'scan_known_sources': {
        required: ['onderwerp'],
        optional: ['thema', 'overheidsinstantie', 'overheidslaag', 'selectedWebsites', 'queryId'],
        used: ['onderwerp', 'thema', 'selectedWebsites', 'queryId'],
        notes: 'Uses onderwerp and thema for website scanning. selectedWebsites filters which websites to scan. overheidsinstantie and overheidslaag are stored in Query document but not used for filtering.',
    },
    'merge_score_categorize': {
        required: ['onderwerp'],
        optional: ['thema', 'queryId'],
        used: ['onderwerp', 'thema'],
        notes: 'Uses onderwerp for document scoring (standardized - query parameter removed for consistency). thema is used in scoring calculation. Documents come from workflow context.',
    },
    'search_officielebekendmakingen': {
        required: ['onderwerp'],
        optional: ['thema', 'overheidsinstantie', 'overheidslaag', 'queryId'],
        used: ['onderwerp', 'thema', 'overheidsinstantie', 'overheidslaag', 'queryId'],
        notes: 'Uses onderwerp and thema for Google Custom Search query. overheidsinstantie is used as authority filter in search. overheidslaag is stored in Query document.',
    },
    'search_rechtspraak': {
        required: ['onderwerp'],
        optional: ['thema', 'overheidsinstantie', 'overheidslaag', 'queryId'],
        used: ['onderwerp', 'thema', 'queryId'],
        notes: 'Uses onderwerp and thema for Google Custom Search query. overheidsinstantie and overheidslaag are stored in Query document but not used for filtering (jurisprudence search doesn\'t support authority filtering).',
    },
    'search_common_crawl_optional': {
        required: ['onderwerp'],
        optional: ['thema', 'enableDeepScan', 'queryId'],
        used: ['onderwerp', 'thema', 'enableDeepScan', 'queryId'],
        notes: 'Uses onderwerp and thema for Common Crawl search. enableDeepScan controls whether to perform deep scanning. Common Crawl is a public service.',
    },
    'search_dso_location': {
        required: [],
        optional: ['address', 'coordinates', 'bestuurslaag', 'geldigOp', 'inclusiefToekomstigGeldig', 'maxResults', 'mode', 'queryId'],
        used: ['address', 'coordinates', 'bestuurslaag', 'geldigOp', 'inclusiefToekomstigGeldig', 'maxResults', 'mode'],
        notes: 'Location-based DSO document search. Either address or coordinates must be provided. Uses DSO /documenten/_zoek endpoint with geometry filter. Defaults to Europalaan 6D, \'s-Hertogenbosch if neither address nor coordinates provided.',
    },
};

/**
 * Get parameter usage documentation for a workflow action
 * 
 * @param actionName - Name of the workflow action
 * @returns Parameter usage documentation or undefined if not found
 */
export function getParameterUsage(actionName: string): {
    required: string[];
    optional: string[];
    used: string[];
    notes?: string;
} | undefined {
    return workflowParameterUsage[actionName];
}

/**
 * Get all parameters that are accepted but not used by an action
 * 
 * @param actionName - Name of the workflow action
 * @returns Array of parameter names that are accepted but not used
 */
export function getUnusedParameters(actionName: string): string[] {
    const usage = workflowParameterUsage[actionName];
    if (!usage) {
        return [];
    }
    
    const allAccepted = [...usage.required, ...usage.optional];
    const unused = allAccepted.filter(param => !usage.used.includes(param));
    return unused;
}

