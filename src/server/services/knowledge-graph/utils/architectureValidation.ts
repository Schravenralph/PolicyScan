/**
 * Architecture Validation Utilities
 * 
 * Utilities to validate that knowledge graph operations use GraphDB (not Neo4j)
 * according to the architecture: docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 * 
 * Architecture Rules:
 * - GraphDB: Knowledge Graph (semantic policy knowledge, entities, relationships)
 * - Neo4j: Navigation Graph (website structure, hyperlinks) only
 * 
 * @see docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { logger } from '../../../utils/logger.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import type { BaseEntity } from '../../../domain/ontology.js';

/**
 * Knowledge graph entity types that must be stored in GraphDB
 */
const KNOWLEDGE_GRAPH_ENTITY_TYPES = ['PolicyDocument', 'Regulation', 'SpatialUnit', 'LandUse', 'Requirement'] as const;

/**
 * Navigation graph entity indicators (properties that suggest a NavigationNode)
 * NavigationNode entities should be stored in Neo4j, NOT GraphDB
 */
const NAVIGATION_GRAPH_INDICATORS = ['url', 'children', 'filePath', 'lastVisited', 'sourceUrl'] as const;

/**
 * Check if an entity type is a knowledge graph entity (must be in GraphDB)
 */
export function isKnowledgeGraphEntity(entity: BaseEntity): boolean {
  return KNOWLEDGE_GRAPH_ENTITY_TYPES.includes(entity.type as typeof KNOWLEDGE_GRAPH_ENTITY_TYPES[number]);
}

/**
 * Check if an entity looks like a navigation graph entity (should be in Neo4j, NOT GraphDB)
 * 
 * This function checks for properties that are typical of NavigationNode entities.
 * NavigationNode entities have properties like 'url', 'children', 'filePath', etc.
 * 
 * @param entity - The entity to check
 * @returns true if the entity appears to be a navigation graph entity
 */
export function isNavigationGraphEntity(entity: BaseEntity | Record<string, unknown>): boolean {
  // Check if entity has navigation graph indicators
  const hasNavigationIndicators = NAVIGATION_GRAPH_INDICATORS.some(
    indicator => indicator in entity
  );
  
  // Check if entity type suggests navigation graph (not a knowledge graph entity type)
  const entityType = 'type' in entity ? entity.type : undefined;
  const isNotKGEntity = !entityType || !KNOWLEDGE_GRAPH_ENTITY_TYPES.includes(entityType as typeof KNOWLEDGE_GRAPH_ENTITY_TYPES[number]);
  
  // If it has navigation indicators and is not a KG entity, it's likely a navigation entity
  return hasNavigationIndicators && isNotKGEntity;
}

/**
 * Validate that a knowledge graph service is using GraphDB backend
 * 
 * This function checks if the service instance is a GraphDBKnowledgeGraphService
 * and warns if it appears to be using Neo4j.
 * 
 * @param kgService - The knowledge graph service to validate
 * @param context - Context information for logging (e.g., service name, method name)
 * @returns true if validation passes, false if violation detected
 */
export function validateGraphDBBackend(
  kgService: KnowledgeGraphServiceInterface,
  context?: { service?: string; method?: string }
): boolean {
  // Check if service is GraphDBKnowledgeGraphService by checking for GraphDB-specific methods/properties
  // GraphDBKnowledgeGraphService typically has methods like 'query' (SPARQL) or 'update' (SPARQL Update)
  const serviceType = kgService.constructor.name;
  
  // GraphDBKnowledgeGraphService should have 'GraphDB' in the name
  if (serviceType.includes('GraphDB') || serviceType.includes('Graphdb')) {
    return true; // Valid - using GraphDB
  }
  
  // Check for Neo4j-specific indicators
  if (serviceType.includes('Neo4j') || serviceType.includes('KnowledgeGraphService')) {
    // KnowledgeGraphService (without GraphDB) is the deprecated Neo4j-based service
    const contextStr = context 
      ? ` in ${context.service || 'unknown service'}${context.method ? `.${context.method}` : ''}`
      : '';
    
    logger.warn({
      serviceType,
      context,
      architectureViolation: 'Knowledge graph entities should use GraphDB, not Neo4j'
    }, `⚠️ ARCHITECTURE WARNING: Knowledge graph service appears to be using Neo4j${contextStr}. ` +
       `According to docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md, knowledge graph entities ` +
       `(PolicyDocument, Regulation, etc.) must be stored in GraphDB. Neo4j is for Navigation Graph only.`);
    
    return false; // Violation detected
  }
  
  // Unknown service type - log warning but don't fail
  logger.debug({
    serviceType,
    context
  }, `Unknown knowledge graph service type: ${serviceType}. Cannot validate architecture compliance.`);
  
  return true; // Assume valid if we can't determine
}

/**
 * Validate that a knowledge graph entity is being added to GraphDB (not Neo4j)
 * 
 * This function validates both the entity type and the service backend.
 * 
 * @param entity - The entity being added
 * @param kgService - The knowledge graph service being used
 * @param context - Context information for logging
 * @throws Error if architecture violation is detected and strict mode is enabled
 */
export function validateKnowledgeGraphEntityStorage(
  entity: BaseEntity,
  kgService: KnowledgeGraphServiceInterface,
  context?: { service?: string; method?: string; strict?: boolean }
): void {
  // First, check if entity looks like a navigation graph entity (should NOT be in GraphDB)
  if (isNavigationGraphEntity(entity)) {
    const contextStr = context 
      ? ` in ${context.service || 'unknown service'}${context.method ? `.${context.method}` : ''}`
      : '';
    
    const message = `Architecture Violation: Navigation graph entity (${'id' in entity ? entity.id : 'unknown'}) ` +
      `is being added to GraphDB${contextStr}. Navigation graph entities must be stored in Neo4j, not GraphDB. ` +
      `See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md`;
    
    if (context?.strict) {
      throw new Error(message);
    } else {
      logger.warn({
        entityId: 'id' in entity ? entity.id : 'unknown',
        entityType: 'type' in entity ? entity.type : 'unknown',
        context,
        architectureViolation: 'Navigation graph entity in GraphDB'
      }, `⚠️ ${message}`);
    }
    return;
  }
  
  // Check if entity is a knowledge graph entity
  if (!isKnowledgeGraphEntity(entity)) {
    // Not a knowledge graph entity and not a navigation entity - no validation needed
    return;
  }
  
  // Validate backend
  const isValid = validateGraphDBBackend(kgService, context);
  
  if (!isValid && context?.strict) {
    throw new Error(
      `Architecture Violation: Knowledge graph entity (${entity.type}: ${entity.id}) ` +
      `cannot be stored using Neo4j backend. GraphDB is required for knowledge graph entities. ` +
      `See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md`
    );
  }
}

/**
 * Get architecture compliance status for a knowledge graph service
 * 
 * @param kgService - The knowledge graph service to check
 * @returns Object with compliance status and details
 */
export function getArchitectureComplianceStatus(
  kgService: KnowledgeGraphServiceInterface
): {
  compliant: boolean;
  backend: 'graphdb' | 'neo4j' | 'unknown';
  serviceType: string;
  message: string;
} {
  const serviceType = kgService.constructor.name;
  
  if (serviceType.includes('GraphDB') || serviceType.includes('Graphdb')) {
    return {
      compliant: true,
      backend: 'graphdb',
      serviceType,
      message: 'Using GraphDB backend - architecture compliant'
    };
  }
  
  if (serviceType.includes('Neo4j') || serviceType.includes('KnowledgeGraphService')) {
    return {
      compliant: false,
      backend: 'neo4j',
      serviceType,
      message: 'Using Neo4j backend - architecture violation. GraphDB is required for knowledge graph entities.'
    };
  }
  
  return {
    compliant: true, // Assume compliant if unknown
    backend: 'unknown',
    serviceType,
    message: `Unknown service type: ${serviceType}. Cannot determine architecture compliance.`
  };
}
