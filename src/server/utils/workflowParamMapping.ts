/**
 * Workflow Parameter Mapping Utility
 * 
 * Maps legacy parameter names to standardized names for workflow actions.
 * Logs deprecation warnings for legacy usage to encourage migration.
 * 
 * Standardized parameter names:
 * - onderwerp (subject/topic)
 * - thema (theme)
 * - overheidstype (government type)
 * - overheidsinstantie (government institution)
 * - maxResults (maximum results)
 * - queryId (query identifier)
 */

import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Maps legacy parameter names to standardized names.
 * Logs deprecation warnings for legacy usage.
 * 
 * @param params - Raw workflow parameters (may contain legacy names)
 * @param customLogger - Optional logger instance (defaults to global logger)
 * @returns Mapped parameters with standardized names
 * 
 * @example
 * ```typescript
 * const legacyParams = { query: 'klimaat', limit: 50 };
 * const mapped = mapLegacyParams(legacyParams);
 * // Returns: { onderwerp: 'klimaat', maxResults: 50 }
 * ```
 */
export function mapLegacyParams(
  params: Record<string, unknown>,
  customLogger?: { warn: (obj: object, msg: string) => void }
): Record<string, unknown> {
  const mapped = { ...params };
  const log = customLogger || logger;
  
  // Map query -> onderwerp
  if ('query' in params && !('onderwerp' in params)) {
    mapped.onderwerp = params.query;
    delete mapped.query;
    log.warn({ legacy: 'query', standard: 'onderwerp' }, 'Deprecated param used: query -> onderwerp');
  }
  
  // Map theme -> thema
  if ('theme' in params && !('thema' in params)) {
    mapped.thema = params.theme;
    delete mapped.theme;
    log.warn({ legacy: 'theme', standard: 'thema' }, 'Deprecated param used: theme -> thema');
  }
  
  // Map topic -> thema
  if ('topic' in params && !('thema' in params)) {
    mapped.thema = params.topic;
    delete mapped.topic;
    log.warn({ legacy: 'topic', standard: 'thema' }, 'Deprecated param used: topic -> thema');
  }
  
  // Map limit -> maxResults
  if ('limit' in params && !('maxResults' in params)) {
    mapped.maxResults = params.limit;
    delete mapped.limit;
    log.warn({ legacy: 'limit', standard: 'maxResults' }, 'Deprecated param used: limit -> maxResults');
  }
  
  // Map numResults -> maxResults (for google_search_topic compatibility)
  if ('numResults' in params && !('maxResults' in params)) {
    mapped.maxResults = params.numResults;
    delete mapped.numResults;
    log.warn({ legacy: 'numResults', standard: 'maxResults' }, 'Deprecated param used: numResults -> maxResults');
  }
  
  return mapped;
}

/**
 * Standard validation schema for workflow parameters
 * 
 * This schema defines the standardized parameter names and their validation rules.
 * Use this schema after mapping legacy parameters to ensure consistency.
 */
export const standardWorkflowParamsSchema = z.object({
  onderwerp: z.string().min(3, 'onderwerp must be at least 3 characters').max(500, 'onderwerp must be 500 characters or less'),
  thema: z.string().max(200, 'thema must be 200 characters or less').optional(),
  overheidstype: z.string().max(100, 'overheidstype must be 100 characters or less').optional(),
  overheidsinstantie: z.string().max(200, 'overheidsinstantie must be 200 characters or less').optional(),
  maxResults: z.number().int().positive('maxResults must be a positive integer').max(1000, 'maxResults must be 1000 or less').optional(),
  queryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'queryId must be a valid MongoDB ObjectId').optional(),
}).passthrough(); // Allow additional params for flexibility

/**
 * Type for standardized workflow parameters
 */
export type StandardWorkflowParams = z.infer<typeof standardWorkflowParamsSchema>;

