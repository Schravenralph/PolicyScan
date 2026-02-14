/**
 * Workflow Parameter Type Definitions
 * 
 * Provides type-safe definitions for workflow action parameters.
 * This is Phase 1 of type safety improvements - creating utility types
 * that can be used immediately while maintaining backward compatibility.
 * 
 * @see docs/04-policies/type-safety-improvements.md
 */

/**
 * Base type for workflow action parameters
 * 
 * All workflow actions should extend this interface to ensure
 * consistent parameter structure across actions.
 */
export interface WorkflowActionParams {
  /** Optional query ID to link results to an existing query */
  queryId?: string;
  
  /** Optional run ID for workflow execution tracking */
  runId?: string;
  
  /** Optional context for passing additional data between actions */
  context?: Record<string, unknown>;
}

/**
 * Standard search parameters used across multiple workflow actions
 * 
 * These parameters are standardized across all search-related actions
 * to ensure consistency and enable parameter mapping utilities.
 */
export interface StandardSearchParams extends WorkflowActionParams {
  /** Subject/topic for search (required, 1-500 chars) */
  onderwerp: string;
  
  /** Optional theme/topic refinement (max 200 chars) */
  thema?: string;
  
  /** Optional government institution filter (max 200 chars) */
  overheidsinstantie?: string;
  
  /** Optional government level filter (max 100 chars) */
  overheidslaag?: string;
  
  /** Optional maximum number of results (1-1000, default: 20) */
  maxResults?: number;
}

/**
 * Date range filter parameters
 * 
 * Used for actions that support date-based filtering.
 */
export interface DateRangeParams {
  /** Optional start date for date range filter (YYYY-MM-DD format) */
  dateFrom?: string;
  
  /** Optional end date for date range filter (YYYY-MM-DD format) */
  dateTo?: string;
}

/**
 * Type-safe workflow action interface
 * 
 * Use this interface for defining workflow actions with type-safe parameters.
 * 
 * @template TParams - Parameter type (should extend WorkflowActionParams)
 * @template TResult - Result type
 * 
 * @example
 * ```typescript
 * interface SearchActionParams extends StandardSearchParams {
 *   siteRestrict?: string[];
 * }
 * 
 * interface SearchActionResult {
 *   results: SearchResult[];
 *   total: number;
 * }
 * 
 * class SearchAction implements TypedWorkflowAction<SearchActionParams, SearchActionResult> {
 *   name = 'search';
 *   async execute(params: SearchActionParams): Promise<SearchActionResult> {
 *     // TypeScript knows params.onderwerp is a string
 *     return { results: [], total: 0 };
 *   }
 * }
 * ```
 */
export interface TypedWorkflowAction<
  TParams extends WorkflowActionParams = WorkflowActionParams,
  TResult = unknown
> {
  /** Unique action identifier */
  name: string;
  
  /** Execute the action with type-safe parameters */
  execute(params: TParams, runId: string): Promise<TResult>;
}

/**
 * Type guard for WorkflowActionParams
 * 
 * Use this to validate that an object conforms to the base parameter structure.
 * 
 * @param params - Object to validate
 * @returns true if params is a valid WorkflowActionParams
 */
export function isWorkflowActionParams(params: unknown): params is WorkflowActionParams {
  if (typeof params !== 'object' || params === null) {
    return false;
  }
  
  const obj = params as Record<string, unknown>;
  
  // Check optional properties
  if ('queryId' in obj && typeof obj.queryId !== 'string' && obj.queryId !== undefined) {
    return false;
  }
  
  if ('runId' in obj && typeof obj.runId !== 'string' && obj.runId !== undefined) {
    return false;
  }
  
  if ('context' in obj && typeof obj.context !== 'object' && obj.context !== undefined) {
    return false;
  }
  
  return true;
}

/**
 * Type guard for StandardSearchParams
 * 
 * Validates that an object has the required search parameters.
 * 
 * @param params - Object to validate
 * @returns true if params is a valid StandardSearchParams
 */
export function isStandardSearchParams(params: unknown): params is StandardSearchParams {
  if (!isWorkflowActionParams(params)) {
    return false;
  }
  
  const obj = params as Record<string, unknown>;
  
  // onderwerp is required
  if (!('onderwerp' in obj) || typeof obj.onderwerp !== 'string') {
    return false;
  }
  
  // Validate onderwerp length (1-500 chars)
  if (obj.onderwerp.length < 1 || obj.onderwerp.length > 500) {
    return false;
  }
  
  // Optional parameters
  if ('thema' in obj && typeof obj.thema !== 'string' && obj.thema !== undefined) {
    return false;
  }
  
  if ('overheidsinstantie' in obj && typeof obj.overheidsinstantie !== 'string' && obj.overheidsinstantie !== undefined) {
    return false;
  }
  
  if ('overheidslaag' in obj && typeof obj.overheidslaag !== 'string' && obj.overheidslaag !== undefined) {
    return false;
  }
  
  if ('maxResults' in obj && typeof obj.maxResults !== 'number' && obj.maxResults !== undefined) {
    return false;
  }
  
  return true;
}

/**
 * Extract typed parameters from Record<string, unknown>
 * 
 * Helper function to safely extract typed parameters from untyped objects.
 * Use this when working with legacy code that uses Record<string, unknown>.
 * 
 * @param params - Untyped parameters object
 * @param validator - Type guard function
 * @returns Typed parameters or undefined if validation fails
 * 
 * @example
 * ```typescript
 * const typedParams = extractTypedParams(
 *   untypedParams,
 *   isStandardSearchParams
 * );
 * 
 * if (typedParams) {
 *   // TypeScript knows typedParams.onderwerp is a string
 *   console.log(typedParams.onderwerp);
 * }
 * ```
 */
export function extractTypedParams<T>(
  params: Record<string, unknown>,
  validator: (value: unknown) => value is T
): T | undefined {
  return validator(params) ? params : undefined;
}

/**
 * Common workflow action result types
 */

/**
 * Standard result structure for search actions
 */
export interface SearchActionResult {
  /** Array of search results */
  results: unknown[];
  
  /** Total number of results */
  total: number;
  
  /** Query used for search */
  query?: string;
}

/**
 * Standard result structure for document discovery actions
 */
export interface DocumentDiscoveryResult {
  /** Array of discovered documents */
  documents: unknown[];
  
  /** Total number of documents */
  total: number;
  
  /** Query ID if linked to a query */
  queryId?: string;
}

/**
 * Standard result structure for processing actions
 */
export interface ProcessingResult {
  /** Number of items processed */
  processed: number;
  
  /** Number of items that failed */
  failed?: number;
  
  /** Optional result data */
  data?: unknown;
}


