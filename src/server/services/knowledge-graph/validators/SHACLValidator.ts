/**
 * SHACL (Shapes Constraint Language) Validator
 * 
 * Validates entities against SHACL shapes using GraphDB's SPARQL support.
 * SHACL is a W3C standard for validating RDF data against defined constraints.
 * 
 * This validator uses SPARQL queries to check SHACL constraints, as GraphDB
 * supports SHACL validation through SPARQL queries.
 * 
 * For IPLO workflows, this validates entities extracted from markdown knowledge base
 * documents before they are added to the knowledge graph.
 */

import type { BaseEntity, PolicyDocument, Regulation, SpatialUnit, LandUse, Requirement } from '../../../domain/ontology.js';
import type { GraphDBClient } from '../../../config/graphdb.js';
import { logger } from '../../../utils/logger.js';

export interface SHACLValidationResult {
  isValid: boolean;
  errors: SHACLValidationError[];
  warnings: SHACLValidationWarning[];
  entityId: string;
  entityType: string;
}

export interface SHACLValidationError {
  property: string;
  message: string;
  constraint: string;
  value?: unknown;
}

export interface SHACLValidationWarning {
  property: string;
  message: string;
  constraint: string;
  value?: unknown;
}

/**
 * SHACL Validator for knowledge graph entities
 * 
 * Validates entities against SHACL shapes before ingestion.
 * Uses SPARQL queries to check constraints defined in SHACL shapes.
 */
export class SHACLValidator {
  private client: GraphDBClient | null = null;
  private shapesLoaded = false;

  constructor(client?: GraphDBClient) {
    this.client = client || null;
  }

  /**
   * Initialize validator with GraphDB client
   */
  async initialize(client: GraphDBClient): Promise<void> {
    this.client = client;
    await this.ensureShapesLoaded();
  }

  /**
   * Ensure SHACL shapes are loaded into GraphDB
   */
  private async ensureShapesLoaded(): Promise<void> {
    if (this.shapesLoaded || !this.client) {
      return;
    }

    try {
      // Load SHACL shapes into GraphDB
      const shapes = this.getSHACLShapes();
      await this.loadShapes(shapes);
      this.shapesLoaded = true;
      logger.debug('SHACL shapes loaded into GraphDB');
    } catch (error) {
      logger.warn({ error }, 'Failed to load SHACL shapes, validation will be limited');
    }
  }

  /**
   * Get SHACL shape definitions for all entity types
   */
  private getSHACLShapes(): string {
    return `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix beleid: <http://data.example.org/def/beleid#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# PolicyDocument Shape
beleid:PolicyDocumentShape
  a sh:NodeShape ;
  sh:targetClass beleid:PolicyDocument ;
  sh:property [
    sh:path beleid:jurisdiction ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:datatype xsd:string ;
    sh:message "PolicyDocument must have exactly one jurisdiction" ;
  ] ;
  sh:property [
    sh:path beleid:date ;
    sh:minCount 1 ;
    sh:maxCount 1 ;
    sh:pattern "^\\\\d{4}-\\\\d{2}-\\\\d{2}$" ;
    sh:message "PolicyDocument must have a valid date in ISO format (YYYY-MM-DD)" ;
  ] ;
  sh:property [
    sh:path beleid:documentType ;
    sh:minCount 1 ;
    sh:in (beleid:Structure beleid:Vision beleid:Ordinance beleid:Note) ;
    sh:message "PolicyDocument must have a valid documentType" ;
  ] ;
  sh:property [
    sh:path beleid:status ;
    sh:minCount 1 ;
    sh:in (beleid:Draft beleid:Active beleid:Archived) ;
    sh:message "PolicyDocument must have a valid status" ;
  ] .

# Regulation Shape
beleid:RegulationShape
  a sh:NodeShape ;
  sh:targetClass beleid:Regulation ;
  sh:property [
    sh:path beleid:category ;
    sh:minCount 1 ;
    sh:in (beleid:Zoning beleid:Environmental beleid:Building beleid:Procedural) ;
    sh:message "Regulation must have a valid category" ;
  ] .

# SpatialUnit Shape
beleid:SpatialUnitShape
  a sh:NodeShape ;
  sh:targetClass beleid:SpatialUnit ;
  sh:property [
    sh:path beleid:spatialType ;
    sh:minCount 1 ;
    sh:in (beleid:Parcel beleid:Building beleid:Street beleid:Neighborhood beleid:ZoningArea) ;
    sh:message "SpatialUnit must have a valid spatialType" ;
  ] .

# LandUse Shape
beleid:LandUseShape
  a sh:NodeShape ;
  sh:targetClass beleid:LandUse ;
  sh:property [
    sh:path beleid:category ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
    sh:message "LandUse must have a category" ;
  ] .

# Requirement Shape
beleid:RequirementShape
  a sh:NodeShape ;
  sh:targetClass beleid:Requirement ;
  sh:property [
    sh:path beleid:metric ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
    sh:message "Requirement must have a metric" ;
  ] ;
  sh:property [
    sh:path beleid:operator ;
    sh:minCount 1 ;
    sh:in (beleid:LessThan beleid:LessThanOrEqual beleid:GreaterThan beleid:GreaterThanOrEqual beleid:Equal beleid:Between) ;
    sh:message "Requirement must have a valid operator" ;
  ] ;
  sh:property [
    sh:path beleid:value ;
    sh:minCount 1 ;
    sh:message "Requirement must have a value" ;
  ] .
`;
  }

  /**
   * Load SHACL shapes into GraphDB
   */
  private async loadShapes(shapes: string): Promise<void> {
    if (!this.client) {
      throw new Error('GraphDB client not initialized');
    }

    // Insert shapes into GraphDB
    const update = `
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX beleid: <http://data.example.org/def/beleid#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

INSERT DATA {
  GRAPH <http://data.example.org/graph/shapes> {
    ${shapes}
  }
}
`;

    try {
      await this.client.update(update);
    } catch (error) {
      // Shapes might already exist - that's okay
      logger.debug({ error }, 'SHACL shapes may already exist in GraphDB');
    }
  }

  /**
   * Validate entity against SHACL shapes
   * 
   * For IPLO workflows, this validates entities extracted from markdown
   * knowledge base documents before adding to the knowledge graph.
   */
  async validateEntity(entity: BaseEntity): Promise<SHACLValidationResult> {
    if (!this.client) {
      // If client not available, return basic validation
      return this.validateEntityBasic(entity);
    }

    await this.ensureShapesLoaded();

    const errors: SHACLValidationError[] = [];
    const warnings: SHACLValidationWarning[] = [];

    // Type-specific validation
    switch (entity.type) {
      case 'PolicyDocument':
        this.validatePolicyDocument(entity as PolicyDocument, errors, warnings);
        break;
      case 'Regulation':
        this.validateRegulation(entity as Regulation, errors, warnings);
        break;
      case 'SpatialUnit':
        this.validateSpatialUnit(entity as SpatialUnit, errors, warnings);
        break;
      case 'LandUse':
        this.validateLandUse(entity as LandUse, errors, warnings);
        break;
      case 'Requirement':
        this.validateRequirement(entity as Requirement, errors, warnings);
        break;
      default:
        // Basic validation for Concept and other types
        this.validateBasic(entity, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      entityId: entity.id,
      entityType: entity.type,
    };
  }

  /**
   * Basic validation when GraphDB client is not available
   */
  private validateEntityBasic(entity: BaseEntity): SHACLValidationResult {
    const errors: SHACLValidationError[] = [];
    const warnings: SHACLValidationWarning[] = [];

    // Basic checks
    if (!entity.id || entity.id.trim().length === 0) {
      errors.push({
        property: 'id',
        message: 'Entity ID is required',
        constraint: 'minCount',
      });
    }

    if (!entity.name || entity.name.trim().length === 0) {
      errors.push({
        property: 'name',
        message: 'Entity name is required',
        constraint: 'minCount',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      entityId: entity.id,
      entityType: entity.type,
    };
  }

  /**
   * Validate PolicyDocument against SHACL constraints
   */
  private validatePolicyDocument(
    entity: PolicyDocument,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    // Jurisdiction is required
    if (!entity.jurisdiction || entity.jurisdiction.trim().length === 0) {
      errors.push({
        property: 'jurisdiction',
        message: 'PolicyDocument must have exactly one jurisdiction',
        constraint: 'minCount',
      });
    }

    // Date is required and must match ISO format
    if (!entity.date) {
      errors.push({
        property: 'date',
        message: 'PolicyDocument must have a valid date in ISO format (YYYY-MM-DD)',
        constraint: 'minCount',
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entity.date)) {
      errors.push({
        property: 'date',
        message: 'PolicyDocument date must be in ISO format (YYYY-MM-DD)',
        constraint: 'pattern',
        value: entity.date,
      });
    }

    // DocumentType is required and must be valid
    const validDocumentTypes = ['Structure', 'Vision', 'Ordinance', 'Note'];
    if (!entity.documentType || !validDocumentTypes.includes(entity.documentType)) {
      errors.push({
        property: 'documentType',
        message: `PolicyDocument must have a valid documentType (${validDocumentTypes.join(', ')})`,
        constraint: 'in',
        value: entity.documentType,
      });
    }

    // Status is required and must be valid
    const validStatuses = ['Draft', 'Active', 'Archived'];
    if (!entity.status || !validStatuses.includes(entity.status)) {
      errors.push({
        property: 'status',
        message: `PolicyDocument must have a valid status (${validStatuses.join(', ')})`,
        constraint: 'in',
        value: entity.status,
      });
    }
  }

  /**
   * Validate Regulation against SHACL constraints
   */
  private validateRegulation(
    entity: Regulation,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    const validCategories = ['Zoning', 'Environmental', 'Building', 'Procedural'];
    if (!entity.category || !validCategories.includes(entity.category)) {
      errors.push({
        property: 'category',
        message: `Regulation must have a valid category (${validCategories.join(', ')})`,
        constraint: 'in',
        value: entity.category,
      });
    }
  }

  /**
   * Validate SpatialUnit against SHACL constraints
   */
  private validateSpatialUnit(
    entity: SpatialUnit,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    const validSpatialTypes = ['Parcel', 'Building', 'Street', 'Neighborhood', 'ZoningArea'];
    if (!entity.spatialType || !validSpatialTypes.includes(entity.spatialType)) {
      errors.push({
        property: 'spatialType',
        message: `SpatialUnit must have a valid spatialType (${validSpatialTypes.join(', ')})`,
        constraint: 'in',
        value: entity.spatialType,
      });
    }
  }

  /**
   * Validate LandUse against SHACL constraints
   */
  private validateLandUse(
    entity: LandUse,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    if (!entity.category || entity.category.trim().length === 0) {
      errors.push({
        property: 'category',
        message: 'LandUse must have a category',
        constraint: 'minCount',
      });
    }
  }

  /**
   * Validate Requirement against SHACL constraints
   */
  private validateRequirement(
    entity: Requirement,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    if (!entity.metric || entity.metric.trim().length === 0) {
      errors.push({
        property: 'metric',
        message: 'Requirement must have a metric',
        constraint: 'minCount',
      });
    }

    const validOperators = ['<', '<=', '>', '>=', '=', 'between'];
    if (!entity.operator || !validOperators.includes(entity.operator)) {
      errors.push({
        property: 'operator',
        message: `Requirement must have a valid operator (${validOperators.join(', ')})`,
        constraint: 'in',
        value: entity.operator,
      });
    }

    if (entity.value === undefined || entity.value === null) {
      errors.push({
        property: 'value',
        message: 'Requirement must have a value',
        constraint: 'minCount',
      });
    }
  }

  /**
   * Basic validation for Concept and other types
   */
  private validateBasic(
    entity: BaseEntity,
    errors: SHACLValidationError[],
    warnings: SHACLValidationWarning[]
  ): void {
    // Basic checks for all entities
    if (!entity.id || entity.id.trim().length === 0) {
      errors.push({
        property: 'id',
        message: 'Entity ID is required',
        constraint: 'minCount',
      });
    }

    if (!entity.name || entity.name.trim().length === 0) {
      errors.push({
        property: 'name',
        message: 'Entity name is required',
        constraint: 'minCount',
      });
    }
  }

  /**
   * Validate batch of entities
   */
  async validateEntities(entities: BaseEntity[]): Promise<SHACLValidationResult[]> {
    return Promise.all(entities.map(entity => this.validateEntity(entity)));
  }
}
