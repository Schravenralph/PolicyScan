/**
 * Query Planner for Fact-First Retrieval
 * Plans traversal strategy and generates Cypher queries based on parsed query
 */

import { ParsedQuery, QueryType } from './QueryParser.js';
import { EntityType, RelationType } from '../../domain/ontology.js';
import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';

export interface QueryPlan {
    strategy: 'direct' | 'bfs' | 'dfs' | 'hybrid';
    maxHops: number;
    relationType?: RelationType;
    entityType?: EntityType;
    cypherQuery?: string;
    description: string;
}

/**
 * Query Planner that generates query plans and Cypher queries based on parsed queries
 */
export class QueryPlanner {
    constructor(private kgService: KnowledgeGraphService) {}

    /**
     * Create a query plan from a parsed query
     */
    async planQuery(parsedQuery: ParsedQuery): Promise<QueryPlan> {
        switch (parsedQuery.type) {
            case QueryType.FACT:
                return this.planFactQuery(parsedQuery);
            case QueryType.ENTITY:
                return this.planEntityQuery(parsedQuery);
            case QueryType.RELATIONSHIP:
                return this.planRelationshipQuery(parsedQuery);
            default:
                return this.planEntityQuery(parsedQuery); // Default fallback
        }
    }

    /**
     * Plan a fact query (direct factual questions)
     */
    private planFactQuery(parsedQuery: ParsedQuery): QueryPlan {
        // For fact queries, try direct entity search first, then 1-hop traversal
        const cypherQuery = this.buildFactCypherQuery(parsedQuery);
        
        return {
            strategy: 'direct',
            maxHops: 1,
            relationType: parsedQuery.relationTypes?.[0],
            entityType: parsedQuery.entityTypes?.[0],
            cypherQuery,
            description: `Direct fact query for: ${parsedQuery.keywords.join(', ')}`
        };
    }

    /**
     * Plan an entity query (find entities)
     */
    private planEntityQuery(parsedQuery: ParsedQuery): QueryPlan {
        // For entity queries, use keyword search with optional type filtering
        const cypherQuery = this.buildEntityCypherQuery(parsedQuery);
        
        return {
            strategy: 'direct',
            maxHops: 0, // No traversal needed for entity search
            entityType: parsedQuery.entityTypes?.[0],
            cypherQuery,
            description: `Entity search for: ${parsedQuery.keywords.join(', ')}`
        };
    }

    /**
     * Plan a relationship query (find relationships)
     */
    private planRelationshipQuery(parsedQuery: ParsedQuery): QueryPlan {
        // For relationship queries, use BFS traversal to find connected entities
        const cypherQuery = this.buildRelationshipCypherQuery(parsedQuery);
        
        return {
            strategy: 'bfs',
            maxHops: 2, // Allow 2-hop traversal for relationship queries
            relationType: parsedQuery.relationTypes?.[0],
            cypherQuery,
            description: `Relationship query with ${parsedQuery.relationTypes?.[0] || 'any'} relationships`
        };
    }

    /**
     * Build Cypher query for fact queries
     */
    private buildFactCypherQuery(parsedQuery: ParsedQuery): string {
        const conditions: string[] = [];
        const params: Record<string, unknown> = {};
        
        // Add keyword matching
        if (parsedQuery.keywords.length > 0) {
            const keywordConditions = parsedQuery.keywords.map((keyword, i) => {
                params[`keyword${i}`] = keyword;
                return `(e.name CONTAINS $keyword${i} OR e.description CONTAINS $keyword${i})`;
            });
            conditions.push(`(${keywordConditions.join(' OR ')})`);
        }
        
        // Add entity type filter
        if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
            conditions.push(`e.type = $entityType`);
            params.entityType = parsedQuery.entityTypes[0];
        }
        
        // Add location filter if available
        if (parsedQuery.location) {
            conditions.push(`(e.metadata CONTAINS $location OR e.name CONTAINS $location)`);
            params.location = parsedQuery.location;
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        return `
            MATCH (e:Entity)
            ${whereClause}
            RETURN e
            LIMIT 50
        `;
    }

    /**
     * Build Cypher query for entity queries
     */
    private buildEntityCypherQuery(parsedQuery: ParsedQuery): string {
        const conditions: string[] = [];
        const params: Record<string, unknown> = {};
        
        // Add keyword matching
        if (parsedQuery.keywords.length > 0) {
            const keywordConditions = parsedQuery.keywords.map((keyword, i) => {
                params[`keyword${i}`] = keyword;
                return `(e.name CONTAINS $keyword${i} OR e.description CONTAINS $keyword${i})`;
            });
            conditions.push(`(${keywordConditions.join(' OR ')})`);
        }
        
        // Add entity type filter
        if (parsedQuery.entityTypes && parsedQuery.entityTypes.length > 0) {
            conditions.push(`e.type = $entityType`);
            params.entityType = parsedQuery.entityTypes[0];
        }
        
        // Add location filter
        if (parsedQuery.location) {
            conditions.push(`(e.metadata CONTAINS $location OR e.name CONTAINS $location)`);
            params.location = parsedQuery.location;
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        return `
            MATCH (e:Entity)
            ${whereClause}
            RETURN e
            ORDER BY e.name
            LIMIT 100
        `;
    }

    /**
     * Build Cypher query for relationship queries
     */
    private buildRelationshipCypherQuery(parsedQuery: ParsedQuery): string {
        // Start with keyword matching to find source entities
        let sourceCondition = '';
        if (parsedQuery.keywords.length > 0) {
            const keywordConditions = parsedQuery.keywords.map((_keyword, i) => {
                return `(source.name CONTAINS $keyword${i} OR source.description CONTAINS $keyword${i})`;
            });
            sourceCondition = `WHERE ${keywordConditions.join(' OR ')}`;
        }
        
        // Build relationship pattern
        const relationFilter = parsedQuery.relationTypes && parsedQuery.relationTypes.length > 0
            ? `r.type = $relationType`
            : '';
        
        // Combine conditions properly
        let whereClause = '';
        if (sourceCondition || relationFilter) {
            const conditions: string[] = [];
            if (sourceCondition) {
                conditions.push(sourceCondition.replace('WHERE ', ''));
            }
            if (relationFilter) {
                conditions.push(relationFilter);
            }
            whereClause = `WHERE ${conditions.join(' AND ')}`;
        }
        
        return `
            MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity)
            ${whereClause}
            RETURN source, r, target
            LIMIT 100
        `;
    }
}

