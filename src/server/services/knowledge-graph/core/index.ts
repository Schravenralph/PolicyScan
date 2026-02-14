/**
 * Knowledge Graph Core Services
 * 
 * Exports the main knowledge graph service and related core functionality.
 */

export { KnowledgeGraphService, getKnowledgeGraphService, knowledgeGraphService } from './KnowledgeGraph.js';
export type { PersistenceOptions } from './KnowledgeGraphPersistence.js';
export { KnowledgeGraphPersistence } from './KnowledgeGraphPersistence.js';
export { KnowledgeGraphNeo4j } from './KnowledgeGraphNeo4j.js';
export type { Neo4jEntityProperties, Neo4jRelationshipProperties } from './KnowledgeGraphNeo4j.js';


