/**
 * GraphDB Hierarchical Structure Service
 * 
 * SPARQL-based implementation of hierarchical structure management for policy documents.
 * Supports building, validating, and querying hierarchical relationships in GraphDB.
 */

import { PolicyDocument, HierarchyLevel, HierarchyInfo } from '../../../domain/ontology.js';
import { HierarchyValidator, HierarchyValidationResult } from './HierarchyValidator.js';
import { logger } from '../../../utils/logger.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import type { GraphDBClient } from '../../../config/graphdb.js';
import { HierarchicalQueryOptions, HierarchicalQueryResult } from './HierarchicalStructureService.js';

const PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX beleid: <https://schema.beleidsscan.nl/ontology#>
`;

const KG_GRAPH_URI = 'https://beleidsscan.nl/graph';

/**
 * GraphDB Hierarchical Structure Service
 * 
 * Manages hierarchical structure for policy documents using SPARQL queries.
 */
export class GraphDBHierarchicalStructureService {
    private client: GraphDBClient;
    private featureFlagEnabled: boolean = false;

    constructor(client: GraphDBClient) {
        this.client = client;
        this.checkFeatureFlag();
    }

    /**
     * Check if hierarchical structure feature is enabled.
     */
    private checkFeatureFlag(): void {
        this.featureFlagEnabled = FeatureFlag.isEnabled(
            KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED,
            false
        );
    }

    /**
     * Check if the service is enabled.
     */
    isEnabled(): boolean {
        return this.featureFlagEnabled && FeatureFlag.isKGEnabled();
    }

    /**
     * Builds hierarchy from entity data.
     * Infers hierarchy levels from jurisdiction strings and establishes parent-child relationships.
     * 
     * @param entities Array of policy documents
     * @returns Map of entity ID to updated entity with hierarchy
     */
    async buildHierarchy(
        entities: PolicyDocument[]
    ): Promise<Map<string, PolicyDocument>> {
        if (!this.isEnabled()) {
            logger.debug('[GraphDBHierarchicalStructureService] Feature disabled, skipping hierarchy building');
            return new Map(entities.map(e => [e.id, e]));
        }

        const entityMap = new Map<string, PolicyDocument>();
        const levelMap = new Map<HierarchyLevel, PolicyDocument[]>();

        // Group entities by inferred hierarchy level
        for (const entity of entities) {
            const level = this.inferHierarchyLevel(entity);
            if (!levelMap.has(level)) {
                levelMap.set(level, []);
            }
            levelMap.get(level)!.push(entity);

            // Initialize hierarchy if not present
            if (!entity.hierarchy) {
                entity.hierarchy = {
                    level,
                    childrenIds: [],
                };
            } else {
                entity.hierarchy.level = level;
            }

            entityMap.set(entity.id, entity);
        }

        // Establish parent-child relationships
        this.establishRelationships(entityMap, levelMap);

        // Validate the hierarchy
        const validation = HierarchyValidator.validateGraph(entityMap);
        if (!validation.isValid) {
            logger.warn({ validationErrors: validation.errors }, '[GraphDBHierarchicalStructureService] Hierarchy validation failed');
        }

        return entityMap;
    }

    /**
     * Infers hierarchy level from jurisdiction string.
     */
    private inferHierarchyLevel(entity: PolicyDocument): HierarchyLevel {
        if (entity.hierarchy?.level) {
            return entity.hierarchy.level;
        }

        const jurisdiction = entity.jurisdiction?.toLowerCase() || '';
        
        if (jurisdiction.includes('gemeente') || jurisdiction.includes('municipality')) {
            return 'municipality';
        }
        if (jurisdiction.includes('provincie') || jurisdiction.includes('province')) {
            return 'province';
        }
        if (jurisdiction.includes('rijksoverheid') || jurisdiction.includes('national') || 
            jurisdiction.includes('nederland') || jurisdiction.includes('netherlands')) {
            return 'national';
        }
        if (jurisdiction.includes('european') || jurisdiction.includes('eu') || 
            jurisdiction.includes('europa')) {
            return 'european';
        }

        // Default to municipality if cannot infer
        return 'municipality';
    }

    /**
     * Establishes parent-child relationships based on hierarchy levels.
     */
    private establishRelationships(
        _entityMap: Map<string, PolicyDocument>,
        levelMap: Map<HierarchyLevel, PolicyDocument[]>
    ): void {
        const levels: HierarchyLevel[] = ['municipality', 'province', 'national', 'european'];

        for (let i = 0; i < levels.length - 1; i++) {
            const childLevel = levels[i];
            const parentLevel = levels[i + 1];

            const children = levelMap.get(childLevel) || [];
            const parents = levelMap.get(parentLevel) || [];

            // Simple heuristic: match by jurisdiction name patterns
            for (const child of children) {
                if (!child.hierarchy) continue;

                // Find best matching parent
                const parent = this.findBestParent(child, parents);
                if (parent) {
                    child.hierarchy.parentId = parent.id;
                    
                    if (!parent.hierarchy) {
                        parent.hierarchy = {
                            level: parentLevel,
                            childrenIds: [],
                        };
                    }
                    if (!parent.hierarchy.childrenIds) {
                        parent.hierarchy.childrenIds = [];
                    }
                    if (!parent.hierarchy.childrenIds.includes(child.id)) {
                        parent.hierarchy.childrenIds.push(child.id);
                    }
                }
            }
        }
    }

    /**
     * Finds the best parent for a child entity.
     */
    private findBestParent(
        child: PolicyDocument,
        potentialParents: PolicyDocument[]
    ): PolicyDocument | null {
        if (potentialParents.length === 0) {
            return null;
        }

        if (potentialParents.length === 1) {
            return potentialParents[0];
        }

        // For now, return the first parent
        return potentialParents[0];
    }

    /**
     * Validates hierarchy integrity for a single entity.
     */
    validateEntity(
        entity: PolicyDocument,
        parentEntity?: PolicyDocument
    ): HierarchyValidationResult {
        return HierarchyValidator.validate(entity, parentEntity);
    }

    /**
     * Validates hierarchy integrity for the entire graph.
     */
    async validateGraph(entities: PolicyDocument[]): Promise<HierarchyValidationResult> {
        const entityMap = new Map(entities.map(e => [e.id, e]));
        return HierarchyValidator.validateGraph(entityMap);
    }

    /**
     * Finds all regulations in a jurisdiction and its parent jurisdictions.
     * 
     * @param jurisdictionId Entity ID of the jurisdiction
     * @param options Query options
     * @returns Array of policy documents
     */
    async findRegulationsInJurisdictionAndParents(
        jurisdictionId: string,
        options: HierarchicalQueryOptions = {}
    ): Promise<PolicyDocument[]> {
        if (!this.isEnabled()) {
            logger.debug('[GraphDBHierarchicalStructureService] Feature disabled');
            return [];
        }

        const results: PolicyDocument[] = [];
        const visited = new Set<string>();
        const maxDepth = options.maxDepth || 10;

        // Get the starting entity
        const startEntity = await this.getEntityById(jurisdictionId);
        if (!startEntity) {
            return [];
        }

        // Collect entity and all parents
        const entitiesToInclude = [startEntity];
        let current = startEntity;
        let depth = 0;

        while (current?.hierarchy?.parentId && depth < maxDepth) {
            if (visited.has(current.hierarchy.parentId)) {
                break; // Cycle detected
            }
            visited.add(current.hierarchy.parentId);

            const parent = await this.getEntityById(current.hierarchy.parentId);
            if (parent) {
                entitiesToInclude.push(parent);
                current = parent;
                depth++;
            } else {
                break;
            }
        }

        // Get all policy documents for these jurisdictions
        for (const entity of entitiesToInclude) {
            const docs = await this.getPolicyDocumentsForJurisdiction(entity.id);
            results.push(...docs);
        }

        return results;
    }

    /**
     * Finds all child jurisdictions of a given jurisdiction.
     * 
     * @param jurisdictionId Entity ID of the parent jurisdiction
     * @param options Query options
     * @returns Array of child policy documents
     */
    async findChildJurisdictions(
        jurisdictionId: string,
        _options: HierarchicalQueryOptions = {}
    ): Promise<PolicyDocument[]> {
        if (!this.isEnabled()) {
            return [];
        }

        const entity = await this.getEntityById(jurisdictionId);
        if (!entity?.hierarchy?.childrenIds) {
            return [];
        }

        const children: PolicyDocument[] = [];
        for (const childId of entity.hierarchy.childrenIds) {
            const child = await this.getEntityById(childId);
            if (child) {
                children.push(child);
            }
        }

        return children;
    }

    /**
     * Finds regulations at a specific hierarchy level.
     * 
     * @param level Hierarchy level to filter by
     * @returns Array of policy documents at that level
     */
    async findRegulationsAtLevel(level: HierarchyLevel): Promise<PolicyDocument[]> {
        if (!this.isEnabled()) {
            return [];
        }

        const entityUri = this.entityUri('dummy'); // Will be replaced in query
        const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url ?hierarchyLevel ?hierarchy
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity a beleid:PolicyDocument ;
            beleid:id ?id ;
            beleid:type "PolicyDocument" ;
            rdfs:label ?name ;
            beleid:hierarchyLevel ${this.literal(level)} .
    OPTIONAL { ?entity dct:description ?description }
    OPTIONAL { ?entity beleid:metadata ?metadata }
    OPTIONAL { ?entity dct:identifier ?uri }
    OPTIONAL { ?entity beleid:schemaType ?schemaType }
    OPTIONAL { ?entity beleid:documentType ?documentType }
    OPTIONAL { ?entity beleid:jurisdiction ?jurisdiction }
    OPTIONAL { ?entity beleid:date ?date }
    OPTIONAL { ?entity beleid:status ?status }
    OPTIONAL { ?entity beleid:url ?url }
    OPTIONAL { ?entity beleid:hierarchy ?hierarchy }
  }
}
LIMIT 1000
`;

        const queryResults = await this.client.query(query);
        const documents: PolicyDocument[] = [];

        for (const row of queryResults) {
            const hierarchy = row.hierarchy ? JSON.parse(row.hierarchy as string) : undefined;
            if (hierarchy?.level === level) {
                documents.push(this.rowToPolicyDocument(row));
            }
        }

        return documents;
    }

    /**
     * Finds all entities in a jurisdiction subtree.
     * 
     * @param jurisdictionId Root jurisdiction ID
     * @param options Query options
     * @returns Hierarchical query result
     */
    async findJurisdictionSubtree(
        jurisdictionId: string,
        options: HierarchicalQueryOptions = {}
    ): Promise<HierarchicalQueryResult | null> {
        if (!this.isEnabled()) {
            return null;
        }

        const entity = await this.getEntityById(jurisdictionId);
        if (!entity) {
            return null;
        }

        const children = options.includeChildren !== false
            ? await this.findChildJurisdictions(jurisdictionId, options)
            : [];

        const parents = options.includeParents !== false && entity.hierarchy?.parentId
            ? await this.findRegulationsInJurisdictionAndParents(entity.hierarchy.parentId, { maxDepth: 1 })
            : [];

        return {
            entity,
            children,
            parents,
            depth: 0,
        };
    }

    /**
     * Updates hierarchy for an entity.
     * 
     * @param entityId Entity ID
     * @param hierarchy New hierarchy information
     */
    async updateHierarchy(
        entityId: string,
        hierarchy: HierarchyInfo
    ): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }

        // Validate hierarchy
        const entity = await this.getEntityById(entityId);
        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        entity.hierarchy = hierarchy;
        const validation = this.validateEntity(entity);
        if (!validation.isValid) {
            throw new Error(`Invalid hierarchy: ${validation.errors.join(', ')}`);
        }

        // Update in GraphDB
        const entityUri = this.entityUri(entityId);
        const hierarchyJson = JSON.stringify(hierarchy);
        const updateQuery = `
${PREFIXES}
INSERT {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:hierarchy ${this.literal(hierarchyJson)} ;
                   beleid:hierarchyLevel ${this.literal(hierarchy.level)} .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ${this.literal(entityId)} .
  }
}
`;

        await this.client.query(updateQuery);
        logger.info(`[GraphDBHierarchicalStructureService] Updated hierarchy for ${entityId}`);
    }

    /**
     * Gets an entity by ID from GraphDB.
     */
    private async getEntityById(
        entityId: string
    ): Promise<PolicyDocument | null> {
        const entityUri = this.entityUri(entityId);
        const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url ?hierarchyLevel ?hierarchy
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ?id ;
                   beleid:type "PolicyDocument" ;
                   rdfs:label ?name .
    OPTIONAL { <${entityUri}> dct:description ?description }
    OPTIONAL { <${entityUri}> beleid:metadata ?metadata }
    OPTIONAL { <${entityUri}> dct:identifier ?uri }
    OPTIONAL { <${entityUri}> beleid:schemaType ?schemaType }
    OPTIONAL { <${entityUri}> beleid:documentType ?documentType }
    OPTIONAL { <${entityUri}> beleid:jurisdiction ?jurisdiction }
    OPTIONAL { <${entityUri}> beleid:date ?date }
    OPTIONAL { <${entityUri}> beleid:status ?status }
    OPTIONAL { <${entityUri}> beleid:url ?url }
    OPTIONAL { <${entityUri}> beleid:hierarchyLevel ?hierarchyLevel }
    OPTIONAL { <${entityUri}> beleid:hierarchy ?hierarchy }
  }
}
LIMIT 1
`;

        const results = await this.client.query(query);
        if (results.length === 0) {
            return null;
        }

        return this.rowToPolicyDocument(results[0]);
    }

    /**
     * Gets policy documents for a jurisdiction.
     */
    private async getPolicyDocumentsForJurisdiction(
        jurisdictionId: string
    ): Promise<PolicyDocument[]> {
        const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url ?hierarchyLevel ?hierarchy
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity a beleid:PolicyDocument ;
            beleid:id ?id ;
            beleid:type "PolicyDocument" ;
            rdfs:label ?name .
    {
      ?entity beleid:jurisdictionId ${this.literal(jurisdictionId)} .
    } UNION {
      ?entity beleid:id ${this.literal(jurisdictionId)} .
    }
    OPTIONAL { ?entity dct:description ?description }
    OPTIONAL { ?entity beleid:metadata ?metadata }
    OPTIONAL { ?entity dct:identifier ?uri }
    OPTIONAL { ?entity beleid:schemaType ?schemaType }
    OPTIONAL { ?entity beleid:documentType ?documentType }
    OPTIONAL { ?entity beleid:jurisdiction ?jurisdiction }
    OPTIONAL { ?entity beleid:date ?date }
    OPTIONAL { ?entity beleid:status ?status }
    OPTIONAL { ?entity beleid:url ?url }
    OPTIONAL { ?entity beleid:hierarchyLevel ?hierarchyLevel }
    OPTIONAL { ?entity beleid:hierarchy ?hierarchy }
  }
}
LIMIT 1000
`;

        const results = await this.client.query(query);
        return results.map(row => this.rowToPolicyDocument(row));
    }

    /**
     * Converts SPARQL result row to PolicyDocument.
     */
    private rowToPolicyDocument(row: Record<string, unknown>): PolicyDocument {
        const hierarchy = row.hierarchy 
            ? (typeof row.hierarchy === 'string' ? JSON.parse(row.hierarchy) : row.hierarchy)
            : undefined;

        return {
            id: row.id as string,
            type: 'PolicyDocument',
            name: (row.name as string) || '',
            description: row.description as string | undefined,
            metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : undefined,
            uri: row.uri as string | undefined,
            schemaType: row.schemaType as string | undefined,
            documentType: (row.documentType as any) || 'Structure',
            jurisdiction: (row.jurisdiction as string) || '',
            date: (row.date as string) || new Date().toISOString(),
            status: (row.status as any) || 'Active',
            url: row.url as string | undefined,
            hierarchy,
        };
    }

    /**
     * Generate entity URI from ID.
     */
    private entityUri(id: string): string {
        return `https://beleidsscan.nl/entity/${encodeURIComponent(id)}`;
    }

    /**
     * Convert value to SPARQL literal.
     */
    private literal(value: string | number | boolean): string {
        if (typeof value === 'string') {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return String(value);
    }
}

