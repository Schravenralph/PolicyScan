import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError } from '../../types/errors.js';
import { getGraphDBClient } from '../../config/graphdb.js';
// We need to use require for GraphDBQueryService as it was done in the original file
// likely due to circular dependencies or specific loading requirements
import { GraphDBQueryService } from '../../services/knowledge-graph/core/GraphDBQueryService.js';

export function createQueryExecutionRouter(isGraphDB: () => boolean): Router {
    const router = express.Router();

    // ============================================================================
    // Cypher Query Endpoints (Neo4j only)
    // ============================================================================

    // POST /api/knowledge-graph/cypher/validate
    // Validate a Cypher query for safety and correctness
    // Note: For GraphDB, use SPARQL queries instead
    router.post('/cypher/validate', asyncHandler(async (req, _res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Cypher query validation is not available for GraphDB backend', {
                message: 'Cypher queries are not supported. Knowledge Graph uses GraphDB with SPARQL queries.'
            });
        }

        const { query } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('query is required and must be a string', {
                received: { queryType: typeof query, queryValue: query }
            });
        }

        // Cypher queries are not supported for GraphDB - use SPARQL instead
        throw new BadRequestError('Cypher queries are not supported. GraphDB uses SPARQL queries.', {
            suggestion: 'Use /api/knowledge-graph/sparql/validate endpoint for SPARQL query validation'
        });
    }));

    // POST /api/knowledge-graph/cypher/execute
    // Execute a Cypher query against the knowledge graph
    // Note: For GraphDB, use SPARQL queries instead
    router.post('/cypher/execute', asyncHandler(async (req, _res) => {
        if (isGraphDB()) {
            throw new BadRequestError('Cypher query execution is not available for GraphDB backend', {
                message: 'Cypher queries are not supported. Knowledge Graph uses GraphDB with SPARQL queries.'
            });
        }

        const { query, limit, timeout } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('query is required and must be a string', {
                received: { queryType: typeof query, queryValue: query }
            });
        }

        // Validate limit
        if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
            throw new BadRequestError('limit must be a number between 1 and 10000', {
                received: limit
            });
        }

        // Validate timeout
        if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
            throw new BadRequestError('timeout must be a number between 1000 and 300000 milliseconds', {
                received: timeout
            });
        }

        // Cypher queries are not supported for GraphDB - use SPARQL instead
        throw new BadRequestError('Cypher queries are not supported. GraphDB uses SPARQL queries.', {
            suggestion: 'Use /api/knowledge-graph/sparql/execute endpoint for SPARQL query execution'
        });
    }));

    // ============================================================================
    // SPARQL Query Endpoints (GraphDB only)
    // ============================================================================

    // Initialize SPARQL query service (lazy initialization)
    let sparqlQueryService: GraphDBQueryService | null = null;
    function getSPARQLQueryService(): GraphDBQueryService {
        if (!isGraphDB()) {
            throw new BadRequestError('SPARQL query service is only available for GraphDB backend', {
                message: 'SPARQL queries are supported for GraphDB knowledge graph backend.'
            });
        }
        if (!sparqlQueryService) {
            // Use require to match original implementation logic if needed,
            // but here we can try standard import usage since we are in a module.
            // However, sticking to the pattern seen in original code for safety.
            const { getGraphDBQueryService } = require('../../services/knowledge-graph/core/GraphDBQueryService.js');
            const client = getGraphDBClient();
            sparqlQueryService = getGraphDBQueryService(client);
        }
        if (!sparqlQueryService) {
            throw new ServiceUnavailableError('GraphDB query service is not available');
        }
        return sparqlQueryService;
    }

    // POST /api/knowledge-graph/sparql/validate
    // Validate a SPARQL query for safety and correctness
    router.post('/sparql/validate', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('SPARQL query validation is only available for GraphDB backend', {
                message: 'SPARQL queries are supported for GraphDB knowledge graph backend.'
            });
        }

        const { query, allowWriteOperations } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('query is required and must be a string', {
                received: { queryType: typeof query, queryValue: query }
            });
        }

        const queryService = getSPARQLQueryService();
        const validation = queryService.validateQuery(query, allowWriteOperations === true);

        res.json({
            success: true,
            ...validation,
        });
    }));

    // POST /api/knowledge-graph/sparql/execute
    // Execute a SPARQL query against the knowledge graph
    router.post('/sparql/execute', asyncHandler(async (req, res) => {
        if (!isGraphDB()) {
            throw new BadRequestError('SPARQL query execution is only available for GraphDB backend', {
                message: 'SPARQL queries are supported for GraphDB knowledge graph backend.'
            });
        }

        const { query, parameters, limit, timeout, queryType } = req.body;

        if (!query || typeof query !== 'string') {
            throw new BadRequestError('query is required and must be a string', {
                received: { queryType: typeof query, queryValue: query }
            });
        }

        // Validate limit
        if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
            throw new BadRequestError('limit must be a number between 1 and 10000', {
                received: limit
            });
        }

        // Validate timeout
        if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
            throw new BadRequestError('timeout must be a number between 1000 and 300000 milliseconds', {
                received: timeout
            });
        }

        const queryService = getSPARQLQueryService();

        // Build query options
        const queryOptions = {
            parameters: parameters || {},
            limit,
            timeout,
            queryType: queryType as 'SELECT' | 'ASK' | 'CONSTRUCT' | 'UPDATE' | undefined,
        };

        const startTime = Date.now();
        const result = await queryService.executeQuery(query, queryOptions);
        const executionTime = Date.now() - startTime;

        res.json({
            success: true,
            ...result,
            summary: {
                ...result.summary,
                executionTime,
            },
        });
    }));

    return router;
}
