/**
 * Hierarchical Structure Service
 * 
 * Manages hierarchical structure for policy documents and jurisdictions.
 * Supports building, validating, and querying hierarchical relationships.
 */

import { Driver, Session } from 'neo4j-driver';
import { PolicyDocument, HierarchyLevel, HierarchyInfo } from '../../../domain/ontology.js';
import { HierarchyValidator, HierarchyValidationResult } from './HierarchyValidator.js';
import { logger } from '../../../utils/logger.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';

export interface HierarchicalQueryOptions {
    includeChildren?: boolean;
    includeParents?: boolean;
    maxDepth?: number;
    levelFilter?: HierarchyLevel[];
}

export interface HierarchicalQueryResult {
    entity: PolicyDocument;
    children: PolicyDocument[];
    parents: PolicyDocument[];
    depth: number;
}

/**
 * Service for managing hierarchical structure of policy documents.
 */
export class HierarchicalStructureService {
    private driver: Driver;
    private featureFlagEnabled: boolean = false;

    constructor(driver: Driver) {
        this.driver = driver;
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
            logger.debug('[HierarchicalStructureService] Feature disabled, skipping hierarchy building');
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
            logger.warn({ validationErrors: validation.errors }, '[HierarchicalStructureService] Hierarchy validation failed');
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
            // In a real implementation, this would use more sophisticated matching
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
     * Uses simple name matching heuristics.
     */
    private findBestParent(
        child: PolicyDocument,
        potentialParents: PolicyDocument[]
    ): PolicyDocument | null {
        if (potentialParents.length === 0) {
            return null;
        }

        // If only one parent, use it
        if (potentialParents.length === 1) {
            return potentialParents[0];
        }

        // Try to match by jurisdiction name patterns
        // const childJurisdiction = child.jurisdiction?.toLowerCase() || '';
        
        // For now, return the first parent
        // In a real implementation, this would use more sophisticated matching
        // (e.g., geographic data, administrative boundaries, etc.)
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
            logger.debug('[HierarchicalStructureService] Feature disabled');
            return [];
        }

        const session = this.driver.session();
        try {
            const results: PolicyDocument[] = [];
            const visited = new Set<string>();
            const maxDepth = options.maxDepth || 10;

            // Get the starting entity
            const startEntity = await this.getEntityById(jurisdictionId, session);
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

                const parent = await this.getEntityById(current.hierarchy.parentId, session);
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
                const docs = await this.getPolicyDocumentsForJurisdiction(entity.id, session);
                results.push(...docs);
            }

            return results;
        } finally {
            await session.close();
        }
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

        const session = this.driver.session();
        try {
            const entity = await this.getEntityById(jurisdictionId, session);
            if (!entity?.hierarchy?.childrenIds) {
                return [];
            }

            const children: PolicyDocument[] = [];
            for (const childId of entity.hierarchy.childrenIds) {
                const child = await this.getEntityById(childId, session);
                if (child) {
                    children.push(child);
                }
            }

            return children;
        } finally {
            await session.close();
        }
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

        const session = this.driver.session();
        try {
            const query = `
                MATCH (doc:PolicyDocument)
                WHERE doc.hierarchyLevel = $level
                RETURN doc
                LIMIT 1000
            `;

            const result = await session.run(query, { level });
            const documents: PolicyDocument[] = [];

            for (const record of result.records) {
                const docData = record.get('doc').properties;
                // Parse hierarchy if it's a JSON string
                const hierarchy = typeof docData.hierarchy === 'string' 
                    ? JSON.parse(docData.hierarchy) 
                    : docData.hierarchy;
                if (hierarchy?.level === level) {
                    documents.push(this.mapNeo4jNodeToPolicyDocument(docData));
                }
            }

            return documents;
        } finally {
            await session.close();
        }
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

        const session = this.driver.session();
        try {
            const entity = await this.getEntityById(jurisdictionId, session);
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
        } finally {
            await session.close();
        }
    }

    /**
     * Gets an entity by ID from Neo4j.
     */
    private async getEntityById(
        entityId: string,
        session: Session
    ): Promise<PolicyDocument | null> {
        const query = `
            MATCH (entity)
            WHERE entity.id = $id AND entity.type = 'PolicyDocument'
            RETURN entity
            LIMIT 1
        `;

        const result = await session.run(query, { id: entityId });
        if (result.records.length === 0) {
            return null;
        }

        const node = result.records[0].get('entity');
        return this.mapNeo4jNodeToPolicyDocument(node.properties);
    }

    /**
     * Gets policy documents for a jurisdiction.
     */
    private async getPolicyDocumentsForJurisdiction(
        jurisdictionId: string,
        session: Session
    ): Promise<PolicyDocument[]> {
        const query = `
            MATCH (doc:PolicyDocument)
            WHERE doc.jurisdictionId = $jurisdictionId OR doc.id = $jurisdictionId
            RETURN doc
            LIMIT 1000
        `;

        const result = await session.run(query, { jurisdictionId });
        const documents: PolicyDocument[] = [];

        for (const record of result.records) {
            const docData = record.get('doc').properties;
            documents.push(this.mapNeo4jNodeToPolicyDocument(docData));
        }

        return documents;
    }

    /**
     * Maps Neo4j node properties to PolicyDocument.
     */
    private mapNeo4jNodeToPolicyDocument(properties: Record<string, unknown>): PolicyDocument {
        return {
            id: properties.id as string,
            type: 'PolicyDocument',
            name: (properties.name as string) || '',
            description: properties.description as string | undefined,
            metadata: properties.metadata as Record<string, unknown> | undefined,
            uri: properties.uri as string | undefined,
            schemaType: properties.schemaType as string | undefined,
            documentType: (properties.documentType as any) || 'Structure',
            jurisdiction: (properties.jurisdiction as string) || '',
            date: (properties.date as string) || new Date().toISOString(),
            status: (properties.status as any) || 'Active',
            url: properties.url as string | undefined,
            hierarchy: properties.hierarchy ? JSON.parse(properties.hierarchy as string) : undefined,
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

        const session = this.driver.session();
        try {
            // Validate hierarchy
            const entity = await this.getEntityById(entityId, session);
            if (!entity) {
                throw new Error(`Entity ${entityId} not found`);
            }

            entity.hierarchy = hierarchy;
            const validation = this.validateEntity(entity);
            if (!validation.isValid) {
                throw new Error(`Invalid hierarchy: ${validation.errors.join(', ')}`);
            }

            // Update in Neo4j
            const query = `
                MATCH (entity)
                WHERE entity.id = $id
                SET entity.hierarchy = $hierarchy
            `;

            await session.run(query, {
                id: entityId,
                hierarchy: JSON.stringify(hierarchy),
            });

            logger.info(`[HierarchicalStructureService] Updated hierarchy for ${entityId}`);
        } finally {
            await session.close();
        }
    }
}

