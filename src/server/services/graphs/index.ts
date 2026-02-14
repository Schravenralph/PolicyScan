/**
 * Graph Services
 * 
 * Centralized exports for graph capabilities.
 * Includes navigation graphs, knowledge graphs, storage adapters, and analytics.
 */

// Navigation Graph
export * from './navigation/NavigationGraph.js';
export * from './navigation/WebsiteGraph.js';

// Knowledge Graph
export * from '../knowledge-graph/core/KnowledgeGraph.js';
export { getKnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
export * from '../knowledge-graph/inference/GraphInferenceEngine.js';
export * from '../knowledge-graph/core/GraphDBKnowledgeGraphService.js';

// Storage (moved to knowledge-graph/core)
export * from '../knowledge-graph/core/CypherQueryService.js';

// Analytics - Navigation Graph clustering
export * from './navigation/GraphClusteringService.js';
// Analytics - Knowledge Graph clustering
export * from '../knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
export * from '../knowledge-graph/clustering/KnowledgeGraphGDSClusteringService.js';

// Ontologies
export * from './ontologies/OntologyGPTService.js';
export { getOntologyGPTService } from './ontologies/OntologyGPTService.js';

// Versioning - removed (module doesn't exist)

