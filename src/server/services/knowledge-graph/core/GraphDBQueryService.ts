/**
 * GraphDB Query Service
 * 
 * SPARQL-based query interface for GraphDB backend.
 * Provides query validation, execution, and safety checks for SPARQL queries.
 * 
 * This is the GraphDB equivalent of CypherQueryService for Neo4j.
 */

import { GraphDBClient, getGraphDBClient } from '../../../config/graphdb.js';
import { logger } from '../../../utils/logger.js';

/**
 * Options for executing a SPARQL query
 */
export interface SPARQLQueryOptions {
    /**
     * Query parameters (key-value pairs for parameterized queries)
     */
    parameters?: Record<string, unknown>;
    /**
     * Maximum number of results to return (default: 1000)
     */
    limit?: number;
    /**
     * Timeout in milliseconds (default: 30000)
     */
    timeout?: number;
    /**
     * Query type: SELECT, ASK, CONSTRUCT, or UPDATE
     */
    queryType?: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE';
}

/**
 * Result of a SPARQL query execution
 */
export interface SPARQLQueryResult {
    /**
     * Query that was executed
     */
    query: string;
    /**
     * Records/bindings returned from SELECT queries
     */
    records?: Array<Record<string, string>>;
    /**
     * Boolean result for ASK queries
     */
    boolean?: boolean;
    /**
     * RDF triples (Turtle format) for CONSTRUCT queries
     */
    triples?: string;
    /**
     * Summary statistics
     */
    summary: {
        /**
         * Number of records returned
         */
        recordCount: number;
        /**
         * Query execution time in milliseconds
         */
        executionTime: number;
        /**
         * Whether the query was successful
         */
        success: boolean;
        /**
         * Query type that was executed
         */
        queryType: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE';
    };
}

/**
 * Validation result for a SPARQL query
 */
export interface SPARQLQueryValidationResult {
    /**
     * Whether the query is valid
     */
    isValid: boolean;
    /**
     * Validation errors (if any)
     */
    errors: string[];
    /**
     * Validation warnings (if any)
     */
    warnings: string[];
    /**
     * Whether the query is read-only
     */
    isReadOnly: boolean;
    /**
     * Detected query type
     */
    queryType?: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE';
    /**
     * Query complexity analysis (if available)
     */
    complexity?: QueryComplexity;
}

/**
 * Query complexity analysis result
 */
interface QueryComplexity {
    /**
     * Complexity score (0-100, higher = more complex)
     */
    score: number;
    /**
     * Estimated execution time category
     */
    estimatedTime: 'fast' | 'medium' | 'slow' | 'very-slow';
    /**
     * Recommended timeout in milliseconds
     */
    recommendedTimeout: number;
    /**
     * Performance warnings
     */
    warnings: string[];
    /**
     * Query optimization suggestions
     */
    suggestions: string[];
}

/**
 * Service for executing and validating SPARQL queries against GraphDB
 */
export class GraphDBQueryService {
    private client: GraphDBClient;
    private readonly defaultLimit: number = 1000;
    private readonly defaultTimeout: number = 30000; // 30 seconds
    private readonly maxTimeout: number = 300000; // 5 minutes
    private readonly maxLimit: number = 10000;

    /**
     * Dangerous SPARQL keywords that should be restricted or require special permissions
     */
    private readonly dangerousKeywords = [
        'DELETE',
        'DROP',
        'CLEAR',
        'LOAD',
        'COPY',
        'MOVE',
        'ADD',
        'CREATE',
        'INSERT',
        'WITH',
    ];

    /**
     * Read-only keywords (queries with only these are considered safe)
     */
    private readonly readOnlyKeywords = [
        'SELECT',
        'ASK',
        'CONSTRUCT',
        'DESCRIBE',
        'WHERE',
        'FILTER',
        'OPTIONAL',
        'UNION',
        'ORDER BY',
        'LIMIT',
        'OFFSET',
        'GROUP BY',
        'HAVING',
    ];

    /**
     * UPDATE keywords (write operations)
     */
    private readonly updateKeywords = [
        'INSERT',
        'DELETE',
        'WITH',
        'CREATE',
        'DROP',
        'CLEAR',
        'LOAD',
        'COPY',
        'MOVE',
        'ADD',
    ];

    constructor(client?: GraphDBClient) {
        if (!client) {
            try {
                this.client = getGraphDBClient();
            } catch (_error) {
                throw new Error(
                    'GraphDBQueryService requires a GraphDB client connection. ' +
                    'Pass a GraphDBClient instance to the constructor or ensure connectGraphDB() has been called first.'
                );
            }
        } else {
            this.client = client;
        }
    }

    /**
     * Analyze query complexity to estimate execution time and recommend timeout
     */
    private analyzeQueryComplexity(query: string): QueryComplexity {
        const warnings: string[] = [];
        const suggestions: string[] = [];
        let complexityScore = 0;

        const normalized = query.toUpperCase();
        const queryLower = query.toLowerCase();

        // Count triple patterns (more patterns = more complex)
        const triplePatternMatches = query.match(/\?[a-zA-Z0-9_]+\s+[^\s]+\s+[^\s]+/g);
        const triplePatternCount = triplePatternMatches?.length || 0;
        complexityScore += Math.min(triplePatternCount * 5, 30); // Max 30 points

        // Check for cartesian product risks (unbound variables in multiple patterns)
        const variables = new Set<string>();
        const boundVariables = new Set<string>();
        
        // Extract all variables
        const variableMatches = query.match(/\?[a-zA-Z0-9_]+/g);
        if (variableMatches) {
            variableMatches.forEach(v => variables.add(v));
        }

        // Check for FILTER operations (can be expensive)
        const filterCount = (query.match(/\bFILTER\b/gi) || []).length;
        complexityScore += filterCount * 3;

        // Check for OPTIONAL patterns (can be expensive)
        const optionalCount = (query.match(/\bOPTIONAL\b/gi) || []).length;
        complexityScore += optionalCount * 4;

        // Check for UNION (can be expensive)
        const unionCount = (query.match(/\bUNION\b/gi) || []).length;
        complexityScore += unionCount * 5;

        // Check for property paths (can be expensive)
        const pathPatterns = (query.match(/[a-zA-Z0-9_:]+\/[a-zA-Z0-9_:]+/g) || []).length;
        complexityScore += pathPatterns * 6;

        // Check for nested queries (subqueries)
        const subqueryCount = (query.match(/\{\s*SELECT/gi) || []).length;
        complexityScore += subqueryCount * 10;

        // Check for aggregations (GROUP BY, COUNT, etc.)
        const hasAggregation = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b/gi.test(query);
        if (hasAggregation) {
            complexityScore += 15;
            warnings.push('Query contains aggregations which can be slow on large datasets');
        }

        // Check for ORDER BY (can be expensive without LIMIT)
        const hasOrderBy = /\bORDER\s+BY\b/gi.test(query);
        const hasLimit = /\bLIMIT\s+\d+\b/gi.test(query);
        if (hasOrderBy && !hasLimit) {
            complexityScore += 10;
            warnings.push('Query has ORDER BY without LIMIT - this can be very slow');
            suggestions.push('Add a LIMIT clause to restrict result size');
        }

        // Check for DISTINCT (can be expensive)
        if (/\bSELECT\s+DISTINCT\b/gi.test(query)) {
            complexityScore += 8;
            warnings.push('DISTINCT can be expensive - consider if it\'s necessary');
        }

        // Check for missing LIMIT on potentially large queries
        if (!hasLimit && triplePatternCount > 3) {
            warnings.push('Query has multiple triple patterns without LIMIT - may return many results');
            suggestions.push('Consider adding a LIMIT clause');
        }

        // Check for unbound variables (potential cartesian product)
        if (triplePatternCount > 2 && variables.size > triplePatternCount * 2) {
            warnings.push('Query has many unbound variables - risk of cartesian product');
            suggestions.push('Add FILTER clauses to bind variables early');
        }

        // Determine estimated time category
        let estimatedTime: 'fast' | 'medium' | 'slow' | 'very-slow';
        let recommendedTimeout: number;

        if (complexityScore < 20) {
            estimatedTime = 'fast';
            recommendedTimeout = 10000; // 10 seconds
        } else if (complexityScore < 40) {
            estimatedTime = 'medium';
            recommendedTimeout = 30000; // 30 seconds
        } else if (complexityScore < 70) {
            estimatedTime = 'slow';
            recommendedTimeout = 120000; // 2 minutes
        } else {
            estimatedTime = 'very-slow';
            recommendedTimeout = 300000; // 5 minutes
        }

        // Cap recommended timeout at maxTimeout
        recommendedTimeout = Math.min(recommendedTimeout, this.maxTimeout);

        return {
            score: Math.min(complexityScore, 100),
            estimatedTime,
            recommendedTimeout,
            warnings,
            suggestions,
        };
    }

    /**
     * Detect SPARQL query type
     */
    private detectQueryType(query: string): 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE' | undefined {
        const normalized = query.trim().toUpperCase();
        
        if (normalized.startsWith('SELECT')) return 'SELECT';
        if (normalized.startsWith('ASK')) return 'ASK';
        if (normalized.startsWith('CONSTRUCT')) return 'CONSTRUCT';
        if (normalized.startsWith('DESCRIBE')) return 'SELECT'; // Treat DESCRIBE as SELECT-like
        if (normalized.startsWith('INSERT') || normalized.startsWith('DELETE') || normalized.startsWith('WITH')) {
            return 'UPDATE';
        }
        
        // Check for UPDATE patterns
        if (this.updateKeywords.some(keyword => normalized.includes(keyword))) {
            return 'UPDATE';
        }
        
        return undefined;
    }

    /**
     * Validate a SPARQL query for safety and correctness
     * @param query The SPARQL query to validate
     * @param allowWriteOperations Whether to allow write operations (default: false)
     * @param includeComplexity Whether to include complexity analysis (default: true)
     * @returns Validation result
     */
    validateQuery(query: string, allowWriteOperations: boolean = false, includeComplexity: boolean = true): SPARQLQueryValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let isReadOnly = true;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            errors.push('Query cannot be empty');
            return {
                isValid: false,
                errors,
                warnings,
                isReadOnly: false,
                queryType: undefined,
            };
        }

        // Security: Limit query length to prevent ReDoS attacks
        const MAX_QUERY_LENGTH = 100000;
        if (query.length > MAX_QUERY_LENGTH) {
            errors.push(`Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
            return {
                isValid: false,
                errors,
                warnings,
                isReadOnly: false,
                queryType: undefined,
            };
        }

        // Normalize query for analysis (remove comments, normalize whitespace)
        const normalizedQuery = query
            .replace(/#[^\n]*/g, '') // Remove SPARQL comments
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .toUpperCase();

        // Detect query type
        const queryType = this.detectQueryType(query);

        // Check for dangerous keywords
        for (const keyword of this.dangerousKeywords) {
            if (normalizedQuery.includes(keyword)) {
                if (!allowWriteOperations) {
                    errors.push(`Query contains write operation keyword: ${keyword}. Write operations are not allowed.`);
                } else {
                    warnings.push(`Query contains write operation keyword: ${keyword}. Use with caution.`);
                    isReadOnly = false;
                }
            }
        }

        // Check for UPDATE keywords
        if (this.updateKeywords.some(keyword => normalizedQuery.includes(keyword))) {
            if (!allowWriteOperations) {
                errors.push('Query contains UPDATE operations. UPDATE operations are not allowed.');
            } else {
                warnings.push('Query contains UPDATE operations. Use with caution.');
                isReadOnly = false;
            }
        }

        // Check if query appears to be read-only
        const hasReadOnlyKeywords = this.readOnlyKeywords.some(keyword => 
            normalizedQuery.includes(keyword)
        );

        if (!hasReadOnlyKeywords && normalizedQuery.length > 0) {
            warnings.push('Query does not appear to contain standard read operations. Verify query intent.');
        }

        // Basic syntax checks
        if (normalizedQuery.includes('SELECT') && !normalizedQuery.includes('WHERE')) {
            warnings.push('Query contains SELECT without WHERE. This may be intentional but is unusual.');
        }

        // Check for potential injection patterns (basic check)
        if (query.includes('${') || query.includes('`')) {
            warnings.push('Query contains template literal syntax. Ensure parameters are properly escaped.');
        }

        // Check for proper SPARQL structure
        if (queryType === 'SELECT' && !normalizedQuery.includes('WHERE')) {
            warnings.push('SELECT query should typically include a WHERE clause.');
        }

        // Analyze complexity if requested
        let complexity: QueryComplexity | undefined;
        if (includeComplexity && queryType === 'SELECT') {
            complexity = this.analyzeQueryComplexity(query);
            // Add complexity warnings to validation warnings
            warnings.push(...complexity.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            isReadOnly,
            queryType,
            complexity,
        };
    }

    /**
     * Execute a SPARQL SELECT query
     * @param query The SPARQL SELECT query to execute
     * @param options Query options
     * @returns Query result with records
     */
    async executeSelect(query: string, options: SPARQLQueryOptions = {}): Promise<Array<Record<string, string>>> {
        const startTime = Date.now();
        
        // Analyze query complexity
        const complexity = this.analyzeQueryComplexity(query);
        
        // Use recommended timeout if not explicitly provided, or use provided timeout if higher
        const baseTimeout = options.timeout || complexity.recommendedTimeout;
        const timeout = Math.max(baseTimeout, complexity.recommendedTimeout);
        
        // Log complexity analysis for slow queries
        if (complexity.estimatedTime === 'slow' || complexity.estimatedTime === 'very-slow') {
            logger.warn({
                complexityScore: complexity.score,
                estimatedTime: complexity.estimatedTime,
                recommendedTimeout: complexity.recommendedTimeout,
                warnings: complexity.warnings,
                suggestions: complexity.suggestions,
            }, 'SPARQL query complexity analysis indicates slow query');
        } else if (complexity.warnings.length > 0) {
            logger.info({
                warnings: complexity.warnings,
                suggestions: complexity.suggestions,
            }, 'SPARQL query complexity warnings');
        }

        // Validate query
        const validation = this.validateQuery(query, options.parameters?.allowWriteOperations === true);
        if (!validation.isValid) {
            throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.queryType && validation.queryType !== 'SELECT') {
            throw new Error(`Query type mismatch: expected SELECT, got ${validation.queryType}`);
        }

        // Apply limit if not already in query
        let finalQuery = query.trim();
        const limit = options.limit || this.defaultLimit;
        const maxLimit = Math.min(limit, this.maxLimit);

        // Check if query already has a LIMIT clause
        const hasLimit = /\bLIMIT\s+\d+/i.test(finalQuery);
        if (!hasLimit && maxLimit < Infinity) {
            // Add LIMIT if not present and limit is specified
            finalQuery = `${finalQuery} LIMIT ${maxLimit}`;
        }

        try {
            // Execute query with timeout
            const results = await Promise.race([
                this.client.query(finalQuery),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
                ),
            ]);

            const executionTime = Date.now() - startTime;
            
            // Log performance metrics
            if (executionTime > 10000) {
                logger.warn({
                    executionTime,
                    recordCount: results.length,
                    complexityScore: complexity.score,
                    estimatedTime: complexity.estimatedTime,
                }, 'SPARQL SELECT query took longer than 10 seconds');
            } else {
                logger.debug({
                    executionTime,
                    recordCount: results.length,
                }, 'SPARQL SELECT query executed');
            }

            return results;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Log detailed error information for timeouts
            if (errorMessage.includes('timeout')) {
                logger.error({
                    executionTime,
                    timeout,
                    complexityScore: complexity.score,
                    estimatedTime: complexity.estimatedTime,
                    warnings: complexity.warnings,
                    suggestions: complexity.suggestions,
                    query: query.substring(0, 500), // Log first 500 chars of query
                }, 'SPARQL SELECT query timed out');
            }
            
            throw new Error(
                `SPARQL SELECT query execution failed: ${errorMessage} ` +
                `(execution time: ${executionTime}ms, complexity: ${complexity.estimatedTime})`
            );
        }
    }

    /**
     * Execute a SPARQL ASK query
     * @param query The SPARQL ASK query to execute
     * @param options Query options
     * @returns Boolean result
     */
    async executeAsk(query: string, options: SPARQLQueryOptions = {}): Promise<boolean> {
        const startTime = Date.now();
        const timeout = options.timeout || this.defaultTimeout;

        // Validate query
        const validation = this.validateQuery(query, options.parameters?.allowWriteOperations === true);
        if (!validation.isValid) {
            throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.queryType && validation.queryType !== 'ASK') {
            throw new Error(`Query type mismatch: expected ASK, got ${validation.queryType}`);
        }

        try {
            // ASK queries return boolean - we need to parse the SPARQL JSON result
            const results = await Promise.race([
                this.client.query(query),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
                ),
            ]);

            // ASK queries return a single boolean value
            // GraphDB returns this in the SPARQL JSON format
            // For now, if we get results, assume true
            const executionTime = Date.now() - startTime;
            logger.debug({ executionTime, result: results.length > 0 }, 'SPARQL ASK query executed');

            return results.length > 0;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(
                `SPARQL ASK query execution failed: ${error instanceof Error ? error.message : String(error)} ` +
                `(execution time: ${executionTime}ms)`
            );
        }
    }

    /**
     * Execute a SPARQL CONSTRUCT query
     * @param query The SPARQL CONSTRUCT query to execute
     * @param options Query options
     * @returns RDF triples in Turtle format
     */
    async executeConstruct(query: string, options: SPARQLQueryOptions = {}): Promise<string> {
        const startTime = Date.now();
        const timeout = options.timeout || this.defaultTimeout;

        // Validate query
        const validation = this.validateQuery(query, options.parameters?.allowWriteOperations === true);
        if (!validation.isValid) {
            throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.queryType && validation.queryType !== 'CONSTRUCT') {
            throw new Error(`Query type mismatch: expected CONSTRUCT, got ${validation.queryType}`);
        }

        try {
            // Execute CONSTRUCT query
            const triples = await Promise.race([
                this.client.construct(query),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
                ),
            ]);

            const executionTime = Date.now() - startTime;
            logger.debug({ executionTime }, 'SPARQL CONSTRUCT query executed');

            return triples;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(
                `SPARQL CONSTRUCT query execution failed: ${error instanceof Error ? error.message : String(error)} ` +
                `(execution time: ${executionTime}ms)`
            );
        }
    }

    /**
     * Execute a SPARQL UPDATE query
     * @param query The SPARQL UPDATE query to execute
     * @param options Query options
     * @returns Success status
     */
    async executeUpdate(query: string, options: SPARQLQueryOptions = {}): Promise<void> {
        const startTime = Date.now();
        const timeout = options.timeout || this.defaultTimeout;

        // Validate query (allow write operations for UPDATE)
        const validation = this.validateQuery(query, true);
        if (!validation.isValid) {
            throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.queryType && validation.queryType !== 'UPDATE') {
            throw new Error(`Query type mismatch: expected UPDATE, got ${validation.queryType}`);
        }

        try {
            // Execute UPDATE query
            await Promise.race([
                this.client.update(query),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
                ),
            ]);

            const executionTime = Date.now() - startTime;
            logger.debug({ executionTime }, 'SPARQL UPDATE query executed');
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(
                `SPARQL UPDATE query execution failed: ${error instanceof Error ? error.message : String(error)} ` +
                `(execution time: ${executionTime}ms)`
            );
        }
    }

    /**
     * Execute a SPARQL query (auto-detects type)
     * @param query The SPARQL query to execute
     * @param options Query options
     * @returns Query result
     */
    async executeQuery(query: string, options: SPARQLQueryOptions = {}): Promise<SPARQLQueryResult> {
        const startTime = Date.now();

        // Detect query type
        const queryType = this.detectQueryType(query) || options.queryType || 'SELECT';

        try {
            let records: Array<Record<string, string>> | undefined;
            let boolean: boolean | undefined;
            let triples: string | undefined;

            switch (queryType) {
                case 'SELECT':
                    records = await this.executeSelect(query, options);
                    break;
                case 'ASK':
                    boolean = await this.executeAsk(query, options);
                    break;
                case 'CONSTRUCT':
                    triples = await this.executeConstruct(query, options);
                    break;
                case 'UPDATE':
                    await this.executeUpdate(query, options);
                    break;
                default:
                    throw new Error(`Unsupported query type: ${queryType}`);
            }

            const executionTime = Date.now() - startTime;

            return {
                query,
                records,
                boolean,
                triples,
                summary: {
                    recordCount: records?.length || (boolean !== undefined ? 1 : 0),
                    executionTime,
                    success: true,
                    queryType,
                },
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(
                `SPARQL query execution failed: ${error instanceof Error ? error.message : String(error)} ` +
                `(execution time: ${executionTime}ms)`
            );
        }
    }

    /**
     * Test connectivity to GraphDB
     */
    async testConnection(): Promise<boolean> {
        try {
            return await this.client.verifyConnectivity();
        } catch (_error) {
            return false;
        }
    }
}

/**
 * Get or create a GraphDBQueryService instance
 */
export function getGraphDBQueryService(client?: GraphDBClient): GraphDBQueryService {
    return new GraphDBQueryService(client);
}

