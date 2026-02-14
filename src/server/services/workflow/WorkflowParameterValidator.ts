/**
 * WorkflowParameterValidator
 * 
 * Centralized parameter validation and normalization for workflow actions.
 * Ensures consistent parameter handling across all step workflows.
 */

import { asString } from '../../routes/workflowUtils.js';
import { logger } from '../../utils/logger.js';

export interface WorkflowParameterValidationResult {
    valid: boolean;
    errors: string[];
    normalizedParams?: Record<string, unknown>;
}

export interface WorkflowParameterOptions {
    /** Required parameters */
    required?: string[];
    /** Optional parameters */
    optional?: string[];
    /** Whether to allow deprecated parameter names (with warnings) */
    allowDeprecated?: boolean;
}

/**
 * Standardized workflow parameter names
 */
export const STANDARD_PARAMS = {
    ONDERWERP: 'onderwerp',
    THEMA: 'thema',
    QUERY: 'query',
    OVERHEIDSINSTANTIE: 'overheidsinstantie',
    OVERHEIDSLAAG: 'overheidslaag',
    QUERY_ID: 'queryId',
    MAX_RESULTS: 'maxResults',
} as const;

/**
 * Deprecated parameter name mappings (old -> new)
 */
const DEPRECATED_PARAMS: Record<string, string> = {
    // No deprecated params currently, but structure is ready for future use
};

/**
 * Validates and normalizes workflow parameters
 */
export class WorkflowParameterValidator {
    /**
     * Validates required parameters and normalizes parameter names
     * 
     * @param params - Raw workflow parameters
     * @param options - Validation options
     * @returns Validation result with normalized parameters
     */
    static validateAndNormalize(
        params: Record<string, unknown>,
        options: WorkflowParameterOptions = {}
    ): WorkflowParameterValidationResult {
        const errors: string[] = [];
        const normalizedParams: Record<string, unknown> = { ...params };
        const { required = [], optional: _optional = [], allowDeprecated = true } = options;

        // Normalize deprecated parameter names
        if (allowDeprecated) {
            for (const [oldName, newName] of Object.entries(DEPRECATED_PARAMS)) {
                if (params[oldName] !== undefined && params[newName] === undefined) {
                    normalizedParams[newName] = params[oldName];
                    delete normalizedParams[oldName];
                    logger.warn(
                        { oldParam: oldName, newParam: newName },
                        `Deprecated parameter '${oldName}' used. Use '${newName}' instead.`
                    );
                }
            }
        }

        // Validate required parameters
        for (const paramName of required) {
            const value = normalizedParams[paramName];
            if (value === undefined || value === null || value === '') {
                errors.push(`${paramName}: Required parameter is missing or empty`);
            } else if (typeof value === 'string' && value.trim().length === 0) {
                errors.push(`${paramName}: Required parameter cannot be empty`);
            }
        }

        // Validate parameter types and constraints
        if (normalizedParams[STANDARD_PARAMS.ONDERWERP] !== undefined) {
            const onderwerp = asString(normalizedParams[STANDARD_PARAMS.ONDERWERP]);
            if (onderwerp) {
                if (onderwerp.length < 3) {
                    errors.push(`${STANDARD_PARAMS.ONDERWERP}: Must be at least 3 characters`);
                } else if (onderwerp.length > 500) {
                    errors.push(`${STANDARD_PARAMS.ONDERWERP}: Must be at most 500 characters`);
                }
            }
        }

        if (normalizedParams[STANDARD_PARAMS.OVERHEIDSINSTANTIE] !== undefined) {
            const overheidsinstantie = asString(normalizedParams[STANDARD_PARAMS.OVERHEIDSINSTANTIE]);
            if (overheidsinstantie && overheidsinstantie.length > 200) {
                errors.push(`${STANDARD_PARAMS.OVERHEIDSINSTANTIE}: Must be at most 200 characters`);
            }
        }

        if (normalizedParams[STANDARD_PARAMS.MAX_RESULTS] !== undefined) {
            const maxResults = normalizedParams[STANDARD_PARAMS.MAX_RESULTS];
            if (typeof maxResults !== 'number' || maxResults < 1 || maxResults > 1000) {
                errors.push(`${STANDARD_PARAMS.MAX_RESULTS}: Must be a number between 1 and 1000`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            normalizedParams: errors.length === 0 ? normalizedParams : undefined,
        };
    }

    /**
     * Extracts standardized parameters from workflow params
     * Handles fallback logic for query construction
     * 
     * @param params - Workflow parameters
     * @returns Extracted and normalized parameters
     */
    static extractStandardParams(params: Record<string, unknown>): {
        onderwerp: string;
        thema: string;
        overheidsinstantie: string;
        overheidslaag: string;
        query: string;
        queryId?: string;
    } {
        // Extract with fallback logic: prefer onderwerp, fallback to query
        const onderwerp = asString(params[STANDARD_PARAMS.ONDERWERP]) || '';
        const thema = asString(params[STANDARD_PARAMS.THEMA]) || '';
        const overheidsinstantie = asString(params[STANDARD_PARAMS.OVERHEIDSINSTANTIE]) || '';
        const overheidslaag = asString(params[STANDARD_PARAMS.OVERHEIDSLAAG]) || '';
        const query = asString(params[STANDARD_PARAMS.QUERY]) || '';
        const queryId = asString(params[STANDARD_PARAMS.QUERY_ID]);

        // Build query string from onderwerp and thema if query not provided
        const effectiveQuery = query || `${onderwerp} ${thema}`.trim() || 'algemeen';

        return {
            onderwerp: onderwerp || effectiveQuery,
            thema,
            overheidsinstantie,
            overheidslaag,
            query: effectiveQuery,
            queryId,
        };
    }

    /**
     * Builds a query string from onderwerp and thema
     * 
     * @param onderwerp - Subject/topic
     * @param thema - Theme/topic refinement
     * @returns Combined query string
     */
    static buildQuery(onderwerp: string, thema: string): string {
        const parts = [onderwerp, thema]
            .map(part => part ? part.trim() : '')
            .filter(Boolean);
        return parts.join(' ') || 'algemeen';
    }

    /**
     * Validates that at least one of onderwerp or query is provided
     * 
     * @param params - Workflow parameters
     * @returns True if valid, false otherwise
     */
    static hasRequiredQuery(params: Record<string, unknown>): boolean {
        const onderwerp = asString(params[STANDARD_PARAMS.ONDERWERP]);
        const query = asString(params[STANDARD_PARAMS.QUERY]);
        return !!(onderwerp || query);
    }
}


