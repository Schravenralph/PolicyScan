/**
 * Core Ontology for Policy Scanner (Beleidsscan)
 * Defines the fundamental classes and relations for the Knowledge Graph.
 */
export type EntityType = 'SpatialUnit' | 'LandUse' | 'Regulation' | 'PolicyDocument' | 'Requirement' | 'Concept';
export interface BaseEntity {
    id: string;
    type: EntityType;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    uri?: string;
    schemaType?: string;
    versions?: Array<{
        versionId: string;
        versionNumber: number;
        timestamp: string;
        changeReason?: string;
        author?: string;
    }>;
    currentVersion?: number;
    createdAt?: string;
    updatedAt?: string;
    effectiveDate?: string;
    expirationDate?: string;
}
/**
 * Represents a physical area or object in the real world.
 * Examples: Parcel, Building, ZoningArea, Neighborhood.
 */
export interface SpatialUnit extends BaseEntity {
    type: 'SpatialUnit';
    geometry?: unknown;
    spatialType: 'Parcel' | 'Building' | 'Street' | 'Neighborhood' | 'ZoningArea';
}
/**
 * Represents the function or usage of a space.
 * Examples: Residential, MixedUse, Industrial, Green.
 */
export interface LandUse extends BaseEntity {
    type: 'LandUse';
    category: string;
}
/**
 * Represents a specific rule or policy constraint.
 * Examples: MaxHeight, NoiseLimit, ParkingStandard.
 */
export interface Regulation extends BaseEntity {
    type: 'Regulation';
    category: 'Zoning' | 'Environmental' | 'Building' | 'Procedural';
}
/**
 * Hierarchy level for policy documents and jurisdictions.
 * Represents the administrative level in the Dutch government hierarchy.
 */
export type HierarchyLevel = 'municipality' | 'province' | 'national' | 'european';
/**
 * Hierarchy information for policy documents.
 * Tracks the administrative hierarchy (municipality → province → national → european).
 */
export interface HierarchyInfo {
    level: HierarchyLevel;
    parentId?: string;
    childrenIds?: string[];
}
/**
 * Represents a source document containing policies.
 * Examples: Omgevingsvisie, Bestemmingsplan, Verordening.
 */
export interface PolicyDocument extends BaseEntity {
    type: 'PolicyDocument';
    documentType: 'Structure' | 'Vision' | 'Ordinance' | 'Note';
    jurisdiction: string;
    date: string;
    status: 'Draft' | 'Active' | 'Archived';
    url?: string;
    hierarchy?: HierarchyInfo;
}
/**
 * Represents a specific measurable requirement derived from a regulation.
 * Examples: "Max height 10m", "Noise < 50dB".
 */
export interface Requirement extends BaseEntity {
    type: 'Requirement';
    metric: string;
    operator: '<' | '<=' | '>' | '>=' | '=' | 'between';
    value: number | string;
    unit?: string;
}
export declare enum RelationType {
    APPLIES_TO = "APPLIES_TO",// Regulation -> SpatialUnit / LandUse
    CONSTRAINS = "CONSTRAINS",// Requirement -> SpatialUnit
    DEFINED_IN = "DEFINED_IN",// Regulation/Requirement -> PolicyDocument
    OVERRIDES = "OVERRIDES",// PolicyDocument -> PolicyDocument
    REFINES = "REFINES",// PolicyDocument -> PolicyDocument
    LOCATED_IN = "LOCATED_IN",// SpatialUnit -> SpatialUnit
    HAS_REQUIREMENT = "HAS_REQUIREMENT",// Regulation -> Requirement
    RELATED_TO = "RELATED_TO"
}
/**
 * Maps RelationType to Beleidsscan ontology properties
 */
export declare const BELEID_RELATION_MAPPING: Record<RelationType, string>;
/**
 * Maps EntityType to Beleidsscan ontology classes
 */
export declare const BELEID_CLASS_MAPPING: Record<EntityType, string>;
export interface Relation {
    sourceId: string;
    targetId: string;
    type: RelationType;
    metadata?: Record<string, unknown>;
}
/**
 * Maps our entity types to schema.org types
 */
export declare const SCHEMA_ORG_TYPE_MAPPING: Record<EntityType, string>;
/**
 * Generates a schema.org compliant URI for an entity.
 * Format: https://schema.org/{SchemaType}/{jurisdiction}/{id}
 *
 * @param entity The entity to generate a URI for
 * @param baseUrl Optional base URL (defaults to https://schema.org)
 * @returns Schema.org compliant URI
 */
export declare function generateSchemaOrgUri(entity: BaseEntity, baseUrl?: string): string;
/**
 * Validates if a URI follows schema.org format.
 *
 * @param uri The URI to validate
 * @returns True if valid schema.org URI
 */
export declare function isValidSchemaOrgUri(uri: string): boolean;
