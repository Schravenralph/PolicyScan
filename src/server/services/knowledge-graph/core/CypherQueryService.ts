import { Driver, Session, Result, QueryResult } from 'neo4j-driver';
import { getNeo4jDriver } from '../../../config/neo4j.js';

/**
 * Options for executing a Cypher query
 */
export interface CypherQueryOptions {
    /**
     * Query parameters (key-value pairs)
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
}

/**
 * Result of a Cypher query execution
 */
export interface CypherQueryResult {
    /**
     * Query that was executed
     */
    query: string;
    /**
     * Records returned from the query
     */
    records: Array<Record<string, unknown>>;
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
         * Query statistics (if available)
         */
        statistics?: {
            nodesCreated?: number;
            nodesDeleted?: number;
            relationshipsCreated?: number;
            relationshipsDeleted?: number;
            propertiesSet?: number;
            labelsAdded?: number;
            labelsRemoved?: number;
        };
    };
}

/**
 * Validation result for a Cypher query
 */
export interface CypherQueryValidationResult {
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
}

/**
 * Service for executing and validating Cypher queries against Neo4j
 */
export class CypherQueryService {
    private driver: Driver;
    private readonly defaultLimit: number = 1000;
    private readonly defaultTimeout: number = 30000;
    private readonly maxLimit: number = 10000;

    /**
     * Dangerous Cypher keywords that should be restricted or require special permissions
     */
    private readonly dangerousKeywords = [
        'DELETE',
        'DETACH DELETE',
        'REMOVE',
        'DROP',
        'CREATE',
        'MERGE',
        'SET',
        'CALL',
        'LOAD',
        'COPY',
        'IMPORT',
        'EXPORT',
        'FOREACH',
    ];

    /**
     * Read-only keywords (queries with only these are considered safe)
     */
    private readonly readOnlyKeywords = [
        'MATCH',
        'WHERE',
        'RETURN',
        'WITH',
        'ORDER BY',
        'LIMIT',
        'SKIP',
        'UNION',
        'OPTIONAL MATCH',
        'USING',
    ];

    constructor(driver?: Driver) {
        if (!driver) {
            try {
                this.driver = getNeo4jDriver();
            } catch (_error) {
                throw new Error(
                    'CypherQueryService requires a Neo4j driver connection. ' +
                    'Pass a Driver instance to the constructor or ensure connectNeo4j() has been called first.'
                );
            }
        } else {
            this.driver = driver;
        }
    }

    /**
     * Validate a Cypher query for safety and correctness
     * @param query The Cypher query to validate
     * @param allowWriteOperations Whether to allow write operations (default: false)
     * @returns Validation result
     */
    validateQuery(query: string, allowWriteOperations: boolean = false): CypherQueryValidationResult {
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
            };
        }

        // Normalize query for analysis (remove comments, normalize whitespace)
        // Use bounded quantifiers to prevent ReDoS
        const normalizedQuery = query
            .replace(/\/\/.{0,500}$/gm, '') // Remove single-line comments (limit length)
            .replace(/\/\*[\s\S]{0,10000}?\*\//g, '') // Remove multi-line comments (limit length)
            .trim()
            .toUpperCase();

        // Check for dangerous keywords
        for (const keyword of this.dangerousKeywords) {
            if (normalizedQuery.includes(keyword.toUpperCase())) {
                if (!allowWriteOperations) {
                    errors.push(`Query contains write operation keyword: ${keyword}. Write operations are not allowed.`);
                } else {
                    warnings.push(`Query contains write operation keyword: ${keyword}. Use with caution.`);
                    isReadOnly = false;
                }
            }
        }

        // Check if query appears to be read-only
        const hasReadOnlyKeywords = this.readOnlyKeywords.some(keyword => 
            normalizedQuery.includes(keyword.toUpperCase())
        );

        if (!hasReadOnlyKeywords && normalizedQuery.length > 0) {
            warnings.push('Query does not appear to contain standard read operations. Verify query intent.');
        }

        // Basic syntax checks
        if (normalizedQuery.includes('RETURN') && !normalizedQuery.includes('MATCH') && !normalizedQuery.includes('UNWIND')) {
            warnings.push('Query contains RETURN without MATCH or UNWIND. This may be intentional but is unusual.');
        }

        // Check for potential injection patterns (basic check)
        if (query.includes('${') || query.includes('`')) {
            warnings.push('Query contains template literal syntax. Ensure parameters are properly escaped.');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            isReadOnly,
        };
    }

    /**
     * Execute a Cypher query
     * @param query The Cypher query to execute
     * @param options Query options
     * @returns Query result
     */
    async executeQuery(query: string, options: CypherQueryOptions = {}): Promise<CypherQueryResult> {
        const startTime = Date.now();

        // Validate query
        const validation = this.validateQuery(query, options.parameters?.allowWriteOperations === true);
        if (!validation.isValid) {
            throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
        }

        // Apply limit if not already in query
        let finalQuery = query.trim();
        const limit = options.limit || this.defaultLimit;
        const maxLimit = Math.min(limit, this.maxLimit);

        // Check if query already has a LIMIT clause
        const hasLimit = /LIMIT\s+\d+/i.test(finalQuery);
        if (!hasLimit && maxLimit < Infinity) {
            // Add LIMIT if not present and limit is specified
            finalQuery = `${finalQuery} LIMIT ${maxLimit}`;
        }

        const session: Session = this.driver.session();
        const timeout = options.timeout || this.defaultTimeout;

        try {
            // Execute query with timeout
            const result: QueryResult = await Promise.race([
                session.run(finalQuery, options.parameters || {}),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
                ),
            ]);

            const executionTime = Date.now() - startTime;

            // Convert records to plain objects
            const records = result.records.map(record => {
                const recordObj: Record<string, unknown> = {};
                for (const key of record.keys) {
                    if (typeof key === 'string') {
                        const value = record.get(key);
                        // Convert Neo4j types to JavaScript types
                        recordObj[key] = this.convertNeo4jValue(value);
                    }
                }
                return recordObj;
            });

            // Extract statistics if available
            const updates = result.summary.counters.updates();
            const statistics = updates
                ? {
                    nodesCreated: updates.nodesCreated || 0,
                    nodesDeleted: updates.nodesDeleted || 0,
                    relationshipsCreated: updates.relationshipsCreated || 0,
                    relationshipsDeleted: updates.relationshipsDeleted || 0,
                    propertiesSet: updates.propertiesSet || 0,
                    labelsAdded: updates.labelsAdded || 0,
                    labelsRemoved: updates.labelsRemoved || 0,
                }
                : undefined;

            return {
                query: finalQuery,
                records,
                summary: {
                    recordCount: records.length,
                    executionTime,
                    success: true,
                    statistics,
                },
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(
                `Cypher query execution failed: ${error instanceof Error ? error.message : String(error)} ` +
                `(execution time: ${executionTime}ms)`
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Convert Neo4j value to JavaScript value
     * Handles Neo4j Integer, Node, Relationship, Path, and other types
     */
    private convertNeo4jValue(value: unknown): unknown {
        if (value === null || value === undefined) {
            return value;
        }

        // Handle Neo4j Integer
        if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
            return (value as { toNumber: () => number }).toNumber();
        }

        // Handle Neo4j Integer with low/high properties
        if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
            const intValue = value as { low: number; high: number };
            return intValue.low + (intValue.high * 0x100000000);
        }

        // Handle Neo4j Node
        if (value && typeof value === 'object' && 'properties' in value && 'labels' in value) {
            const node = value as any;
            return {
                id: node.identity?.toNumber?.() || node.identity,
                labels: node.labels || [],
                properties: this.convertNeo4jProperties(node.properties || {}),
            };
        }

        // Handle Neo4j Relationship
        if (value && typeof value === 'object' && 'type' in value && 'start' in value && 'end' in value) {
            const rel = value as any;
            return {
                id: rel.identity?.toNumber?.() || rel.identity,
                type: rel.type,
                start: rel.start?.toNumber?.() || rel.start,
                end: rel.end?.toNumber?.() || rel.end,
                properties: this.convertNeo4jProperties(rel.properties || {}),
            };
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => this.convertNeo4jValue(item));
        }

        // Handle objects (recursively convert properties)
        if (typeof value === 'object' && value !== null) {
            return this.convertNeo4jProperties(value as Record<string, unknown>);
        }

        return value;
    }

    /**
     * Convert Neo4j properties object to plain JavaScript object
     */
    private convertNeo4jProperties(properties: Record<string, unknown>): Record<string, unknown> {
        const converted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(properties)) {
            converted[key] = this.convertNeo4jValue(value);
        }
        return converted;
    }

    /**
     * Test connectivity to Neo4j
     */
    async testConnection(): Promise<boolean> {
        const session = this.driver.session();
        try {
            await session.run('RETURN 1 as test');
            return true;
        } catch (_error) {
            return false;
        } finally {
            await session.close();
        }
    }
}

/**
 * Get or create a CypherQueryService instance
 */
let _cypherQueryService: CypherQueryService | null = null;

export function getCypherQueryService(driver?: Driver): CypherQueryService {
    if (!_cypherQueryService) {
        _cypherQueryService = new CypherQueryService(driver);
    }
    return _cypherQueryService;
}
