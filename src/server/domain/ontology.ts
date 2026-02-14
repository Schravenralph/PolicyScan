/**
 * Core Ontology for Policy Scanner (Beleidsscan)
 * Defines the fundamental classes and relations for the Knowledge Graph.
 */

// --- Core Entities ---

export type EntityType =
    | 'SpatialUnit'
    | 'LandUse'
    | 'Regulation'
    | 'PolicyDocument'
    | 'Requirement'
    | 'Concept';

export interface BaseEntity {
    id: string;
    type: EntityType;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    uri?: string; // Schema.org compliant URI
    schemaType?: string; // Schema.org type (e.g., 'Legislation', 'Place')
    // Versioning fields (optional, added by EntityVersioningService)
    versions?: Array<{
        versionId: string;
        versionNumber: number;
        timestamp: string;
        changeReason?: string;
        author?: string;
    }>; // Version history (populated by EntityVersioningService when querying)
    currentVersion?: number;
    createdAt?: string;
    updatedAt?: string;
    effectiveDate?: string; // When entity becomes active
    expirationDate?: string; // When entity expires (optional)
}

/**
 * Represents a physical area or object in the real world.
 * Examples: Parcel, Building, ZoningArea, Neighborhood.
 */
export interface SpatialUnit extends BaseEntity {
    type: 'SpatialUnit';
    geometry?: unknown; // GeoJSON or similar representation
    spatialType: 'Parcel' | 'Building' | 'Street' | 'Neighborhood' | 'ZoningArea';
}

/**
 * Represents the function or usage of a space.
 * Examples: Residential, MixedUse, Industrial, Green.
 */
export interface LandUse extends BaseEntity {
    type: 'LandUse';
    category: string; // e.g., 'Wonen', 'Bedrijvigheid'
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
    parentId?: string; // ID of parent jurisdiction
    childrenIds?: string[]; // IDs of child jurisdictions
}

/**
 * Represents a source document containing policies.
 * Examples: Omgevingsvisie, Bestemmingsplan, Verordening.
 */
export interface PolicyDocument extends BaseEntity {
    type: 'PolicyDocument';
    documentType: 'Structure' | 'Vision' | 'Ordinance' | 'Note';
    jurisdiction: string; // e.g., 'Gemeente X', 'Provincie Y'
    date: string; // ISO date
    status: 'Draft' | 'Active' | 'Archived';
    url?: string;
    hierarchy?: HierarchyInfo; // Hierarchical structure information
}

/**
 * Represents a specific measurable requirement derived from a regulation.
 * Examples: "Max height 10m", "Noise < 50dB".
 */
export interface Requirement extends BaseEntity {
    type: 'Requirement';
    metric: string; // e.g., 'height', 'noise_level', 'distance'
    operator: '<' | '<=' | '>' | '>=' | '=' | 'between';
    value: number | string;
    unit?: string; // e.g., 'm', 'dB', 'm2'
}

// --- Relations ---

export enum RelationType {
    APPLIES_TO = 'APPLIES_TO',       // Regulation -> SpatialUnit / LandUse
    CONSTRAINS = 'CONSTRAINS',       // Requirement -> SpatialUnit
    DEFINED_IN = 'DEFINED_IN',       // Regulation/Requirement -> PolicyDocument
    OVERRIDES = 'OVERRIDES',         // PolicyDocument -> PolicyDocument
    REFINES = 'REFINES',             // PolicyDocument -> PolicyDocument
    LOCATED_IN = 'LOCATED_IN',       // SpatialUnit -> SpatialUnit
    HAS_REQUIREMENT = 'HAS_REQUIREMENT', // Regulation -> Requirement
    RELATED_TO = 'RELATED_TO'        // General semantic relation
}

/**
 * Maps RelationType to Beleidsscan ontology properties
 */
export const BELEID_RELATION_MAPPING: Record<RelationType, string> = {
    [RelationType.APPLIES_TO]: 'beleid:appliesTo',
    [RelationType.CONSTRAINS]: 'beleid:constrains',
    [RelationType.DEFINED_IN]: 'beleid:definedIn',
    [RelationType.OVERRIDES]: 'beleid:overrides',
    [RelationType.REFINES]: 'beleid:refines',
    [RelationType.LOCATED_IN]: 'beleid:locatedIn',
    [RelationType.HAS_REQUIREMENT]: 'beleid:hasRequirement',
    [RelationType.RELATED_TO]: 'beleid:relatedTo'
};

/**
 * Maps EntityType to Beleidsscan ontology classes
 */
export const BELEID_CLASS_MAPPING: Record<EntityType, string> = {
    'PolicyDocument': 'beleid:PolicyDocument',
    'Regulation': 'beleid:Regulation',
    'SpatialUnit': 'beleid:SpatialUnit',
    'LandUse': 'beleid:LandUse',
    'Requirement': 'beleid:Requirement',
    'Concept': 'beleid:Concept'
};

export interface Relation {
    sourceId: string;
    targetId: string;
    type: RelationType;
    metadata?: Record<string, unknown>;
}

// --- Schema.org Utilities ---

/**
 * Maps our entity types to schema.org types
 */
export const SCHEMA_ORG_TYPE_MAPPING: Record<EntityType, string> = {
    PolicyDocument: 'Legislation',
    Regulation: 'Legislation',
    SpatialUnit: 'Place',
    LandUse: 'PropertyValue',
    Requirement: 'QuantitativeValue',
    Concept: 'DefinedTerm'
};

/**
 * Generates a schema.org compliant URI for an entity.
 * Format: https://schema.org/{SchemaType}/{jurisdiction}/{id}
 * 
 * @param entity The entity to generate a URI for
 * @param baseUrl Optional base URL (defaults to https://schema.org)
 * @returns Schema.org compliant URI
 */
export function generateSchemaOrgUri(entity: BaseEntity, baseUrl: string = 'https://schema.org'): string {
    const schemaType = entity.schemaType || SCHEMA_ORG_TYPE_MAPPING[entity.type];

    // Extract jurisdiction from metadata if available
    let jurisdiction = 'default';
    if (entity.type === 'PolicyDocument' && (entity as PolicyDocument).jurisdiction) {
        jurisdiction = (entity as PolicyDocument).jurisdiction
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    } else if (entity.metadata?.jurisdiction && typeof entity.metadata.jurisdiction === 'string') {
        jurisdiction = entity.metadata.jurisdiction
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    // Sanitize ID for URI
    const sanitizedId = entity.id
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    return `${baseUrl}/${schemaType}/${jurisdiction}/${sanitizedId}`;
}

/**
 * Validates if a URI follows schema.org format.
 * 
 * @param uri The URI to validate
 * @returns True if valid schema.org URI
 */
export function isValidSchemaOrgUri(uri: string): boolean {
    if (!uri) return false;

    // Basic validation: should start with http(s):// and contain schema.org or similar pattern
    const uriPattern = /^https?:\/\/[a-z0-9.-]+\/[A-Za-z]+\/[a-z0-9-]+\/[a-z0-9-]+$/i;
    return uriPattern.test(uri);
}
