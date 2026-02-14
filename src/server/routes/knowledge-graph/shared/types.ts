/**
 * Shared types for Knowledge Graph routes
 */

import type { KnowledgeGraphService } from '../../../services/knowledge-graph/core/KnowledgeGraph.js';
import type { GraphDBKnowledgeGraphService } from '../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js';

/**
 * Union type for knowledge graph service (GraphDB or Neo4j fallback)
 */
export type KnowledgeGraphServiceType = KnowledgeGraphService | GraphDBKnowledgeGraphService;

/**
 * GraphDB knowledge graph service type
 */
export type GraphDBKnowledgeGraphServiceType = GraphDBKnowledgeGraphService;

