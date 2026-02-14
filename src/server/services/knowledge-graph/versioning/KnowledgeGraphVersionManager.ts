/**
 * Knowledge Graph Version Manager
 * 
 * Manages versioning of knowledge graph data similar to Git branches.
 * Handles storing graph snapshots, tracking branches, and managing versions.
 * 
 * Features:
 * - Branch management (main, development-with-workflows, etc.)
 * - Stash changes before switching branches
 * - Push changes from development branch to main
 * - Merge branches with conflict resolution
 * 
 * IMPORTANT: Uses GraphDB (SPARQL) for versioning, NOT Neo4j.
 * The knowledge graph itself is stored in GraphDB, so versioning metadata is also stored in GraphDB.
 */

import type { GraphDBClient } from '../../../config/graphdb.js';
import { getGraphDBClient } from '../../../config/graphdb.js';
import { logger } from '../../../utils/logger.js';
import { NotFoundError } from '../../../types/errors.js';

const VERSIONING_GRAPH_URI = 'http://data.example.org/graph/versioning';
const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const KG_NAMESPACE = 'http://data.example.org/def/kg#';
const VERSIONING_NAMESPACE = 'http://data.example.org/def/versioning#';
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX kg: <${KG_NAMESPACE}>
PREFIX versioning: <${VERSIONING_NAMESPACE}>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export interface KGBranch {
    name: string;
    createdAt: string;
    updatedAt: string;
    parentBranch?: string;
    entityCount: number;
    relationshipCount: number;
    metadata?: Record<string, unknown>;
}

export interface KGVersion {
    version: string;
    branch: string;
    parentVersion?: string;
    timestamp: string;
    entityCount: number;
    relationshipCount: number;
    entityIds?: string[]; // Track which entities are in this version
    relationships?: Array<{ sourceId: string; targetId: string; type: string }>; // Track which relationships are in this version
    workflowRunId?: string;
    metadata?: Record<string, unknown>;
}

export interface KGStash {
    stashId: string;
    branch: string;
    timestamp: string;
    entityCount: number;
    relationshipCount: number;
    entityIds?: string[];
    relationships?: Array<{ sourceId: string; targetId: string; type: string; metadata?: Record<string, unknown> }>;
    description?: string;
}

export interface KGMergeResult {
    merged: boolean;
    conflicts: Array<{
        entityId: string;
        conflictType: 'entity_exists' | 'relationship_exists' | 'property_mismatch';
        message: string;
    }>;
    entitiesAdded: number;
    relationshipsAdded: number;
    entitiesUpdated: number;
    relationshipsUpdated: number;
}

export interface ResetResult {
    success: boolean;
    message: string;
    entitiesRemoved: number;
    entitiesRestored: number;
    relationshipsRemoved: number;
    relationshipsRestored: number;
    errors: string[];
}

/**
 * Manages knowledge graph versioning with branch support using GraphDB (SPARQL)
 */
export class KnowledgeGraphVersionManager {
    private client: GraphDBClient;
    private readonly DEFAULT_BRANCH = 'main';
    private readonly DEV_BRANCH = 'development-with-workflows';

    constructor(client?: GraphDBClient) {
        this.client = client || getGraphDBClient();
    }

    /**
     * Get current branch name
     */
    async getCurrentBranch(): Promise<string> {
        try {
            const query = `
${PREFIXES}
SELECT ?name
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch a versioning:Branch ;
            versioning:name ?name ;
            versioning:isCurrent "true"^^xsd:boolean .
  }
}
LIMIT 1
`;

            const results = await this.client.query(query);
            
            if (results.length > 0) {
                return results[0].name as string;
            }
            
            // No current branch, initialize main branch
            await this.createBranch(this.DEFAULT_BRANCH, true, null);
            return this.DEFAULT_BRANCH;
        } catch (error) {
            logger.warn({ error }, 'Failed to get current branch, initializing main branch');
            await this.createBranch(this.DEFAULT_BRANCH, true, null);
            return this.DEFAULT_BRANCH;
        }
    }

    /**
     * List all branches
     */
    async listBranches(): Promise<(KGBranch & { isCurrent: boolean })[]> {
        try {
            logger.debug('Listing KG branches from GraphDB');
            const query = `
${PREFIXES}
SELECT ?name ?isCurrent ?createdAt ?updatedAt ?entityCount ?relationshipCount ?parentBranchName
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch a versioning:Branch ;
            versioning:name ?name ;
            versioning:createdAt ?createdAt ;
            versioning:updatedAt ?updatedAt ;
            versioning:isCurrent ?isCurrent .
    OPTIONAL { ?branch versioning:entityCount ?entityCount . }
    OPTIONAL { ?branch versioning:relationshipCount ?relationshipCount . }
    OPTIONAL {
      ?branch versioning:parentBranch ?parent .
      ?parent versioning:name ?parentBranchName .
    }
  }
}
ORDER BY DESC(?updatedAt)
`;

            const results = await this.client.query(query);

            return results.map(r => ({
                name: r.name as string,
                isCurrent: r.isCurrent === 'true',
                createdAt: r.createdAt as string,
                updatedAt: r.updatedAt as string,
                entityCount: parseInt(r.entityCount as string) || 0,
                relationshipCount: parseInt(r.relationshipCount as string) || 0,
                parentBranch: r.parentBranchName as string | undefined,
            }));
        } catch (error) {
            logger.warn({ error }, 'Failed to list branches from GraphDB');
            return [];
        }
    }

    /**
     * Create a new branch
     */
    async createBranch(branchName: string, setAsCurrent: boolean = false, parentBranch?: string | null): Promise<void> {
        try {
            // Get parent branch if not specified (but not if explicitly null, which means no parent)
            const parent = parentBranch !== undefined ? parentBranch : await this.getCurrentBranch();
            
            // Unset current flag on all branches if setting new branch as current
            if (setAsCurrent) {
                const unsetCurrentQuery = `
${PREFIXES}
DELETE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch versioning:isCurrent ?oldValue .
  }
}
INSERT {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch versioning:isCurrent "false"^^xsd:boolean .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch a versioning:Branch ;
            versioning:isCurrent ?oldValue .
  }
}
`;
                await this.client.update(unsetCurrentQuery);
            }
            
            const branchUri = this.branchUri(branchName);
            const now = new Date().toISOString();
            
            // Create branch node
            const createBranchQuery = `
${PREFIXES}
INSERT DATA {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch ;
                   versioning:name ${this.literal(branchName)} ;
                   versioning:createdAt ${this.literal(now)} ;
                   versioning:updatedAt ${this.literal(now)} ;
                   versioning:isCurrent ${this.literal(setAsCurrent.toString())} ;
                   versioning:entityCount "0"^^xsd:integer ;
                   versioning:relationshipCount "0"^^xsd:integer .
    ${parent ? `<${branchUri}> versioning:parentBranch <${this.branchUri(parent)}> .` : ''}
  }
}
`;
            await this.client.update(createBranchQuery);
            
            logger.info({ branch: branchName, parent, setAsCurrent }, 'Created KG branch in GraphDB');
        } catch (error) {
            logger.error({ error, branch: branchName }, 'Failed to create branch in GraphDB');
            throw error;
        }
    }

    /**
     * Archive a branch
     */
    async archiveBranch(branchName: string): Promise<void> {
        try {
            const branchUri = this.branchUri(branchName);
            
            // Check if branch exists
            const checkQuery = `
${PREFIXES}
ASK {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch .
  }
}
`;
            const checkResults = await this.client.query(checkQuery);
            const exists = checkResults.length > 0 && (checkResults[0] as unknown as { boolean: boolean }).boolean === true;
            
            if (!exists) {
                throw new NotFoundError('Branch', branchName);
            }

            const now = new Date().toISOString();

            const query = `
${PREFIXES}
INSERT {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> versioning:archived "true"^^xsd:boolean ;
                   versioning:archivedAt ${this.literal(now)} .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch .
  }
}
`;
            await this.client.update(query);

            logger.info({ branch: branchName }, 'Archived KG branch in GraphDB');
        } catch (error) {
            // Re-throw NotFoundError directly
            if (error instanceof NotFoundError) {
                throw error;
            }
            logger.error({ error, branch: branchName }, 'Failed to archive branch in GraphDB');
            throw error;
        }
    }

    /**
     * Switch to a branch (stashes current changes if needed)
     */
    async switchBranch(branchName: string, stashChanges: boolean = true): Promise<void> {
        try {
            const currentBranch = await this.getCurrentBranch();
            
            // Stash current changes if requested
            if (stashChanges && currentBranch !== branchName) {
                await this.stash(currentBranch, `Stashed before switching to ${branchName}`);
            }
            
            // Unset current flag on all branches
            const unsetCurrentQuery = `
${PREFIXES}
DELETE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch versioning:isCurrent ?oldValue .
  }
}
INSERT {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch versioning:isCurrent "false"^^xsd:boolean .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?branch a versioning:Branch ;
            versioning:isCurrent ?oldValue .
  }
}
`;
            await this.client.update(unsetCurrentQuery);
            
            // Set new branch as current
            const branchUri = this.branchUri(branchName);
            const now = new Date().toISOString();
            const setCurrentQuery = `
${PREFIXES}
DELETE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> versioning:isCurrent ?oldValue .
  }
}
INSERT {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> versioning:isCurrent "true"^^xsd:boolean ;
                   versioning:updatedAt ${this.literal(now)} .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> versioning:isCurrent ?oldValue .
  }
}
`;
            await this.client.update(setCurrentQuery);
            
            logger.info({ from: currentBranch, to: branchName }, 'Switched KG branch in GraphDB');
        } catch (error) {
            logger.error({ error, branch: branchName }, 'Failed to switch branch in GraphDB');
            throw error;
        }
    }

    /**
     * Create a version snapshot that captures the complete state of entities AND relationships
     * This is like a Git commit - it tracks everything in the branch at that point in time
     */
    async createVersionSnapshot(
        branchName: string,
        workflowRunId?: string,
        metadata?: Record<string, unknown>
    ): Promise<KGVersion> {
        try {
            // Get complete state: entities AND relationships
            const stats = await this.getBranchStats(branchName);
            
            // Get all entities in this branch (from main KG graph)
            const entityIds = await this.getEntityIdsForBranch(branchName);
            
            // Get all relationships in this branch (from main KG graph)
            const relationships = await this.getRelationshipsForBranch(branchName);
            
            // Generate version ID
            const versionId = workflowRunId 
                ? `v-${workflowRunId}-${Date.now()}`
                : `v-${branchName}-${Date.now()}`;
            
            // Get parent version (latest version on this branch)
            const parentVersion = await this.getLatestVersionForBranch(branchName);
            
            // Create version node with complete state information
            const versionUri = this.versionUri(versionId);
            const branchUri = this.branchUri(branchName);
            const now = new Date().toISOString();
            
            // Serialize arrays as JSON strings (GraphDB doesn't support arrays directly)
            const entityIdsJson = JSON.stringify(entityIds);
            const relationshipsJson = JSON.stringify(relationships);
            const metadataJson = JSON.stringify(metadata || {});
            
            const createVersionQuery = `
${PREFIXES}
INSERT DATA {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${versionUri}> a versioning:Version ;
                    versioning:version ${this.literal(versionId)} ;
                    versioning:branch <${branchUri}> ;
                    ${parentVersion ? `versioning:parentVersion <${this.versionUri(parentVersion)}> ;` : ''}
                    versioning:timestamp ${this.literal(now)} ;
                    versioning:entityCount "${stats.entityCount}"^^xsd:integer ;
                    versioning:relationshipCount "${stats.relationshipCount}"^^xsd:integer ;
                    versioning:entityIds ${this.literal(entityIdsJson)} ;
                    versioning:relationships ${this.literal(relationshipsJson)} ;
                    ${workflowRunId ? `versioning:workflowRunId ${this.literal(workflowRunId)} ;` : ''}
                    versioning:metadata ${this.literal(metadataJson)} .
    <${branchUri}> versioning:hasVersion <${versionUri}> .
  }
}
`;
            await this.client.update(createVersionQuery);
            
            const version: KGVersion = {
                version: versionId,
                branch: branchName,
                parentVersion,
                timestamp: now,
                entityCount: stats.entityCount,
                relationshipCount: stats.relationshipCount,
                entityIds,
                relationships,
                workflowRunId,
                metadata
            };
            
            logger.info({ 
                branch: branchName, 
                version: versionId,
                entityCount: stats.entityCount,
                relationshipCount: stats.relationshipCount
            }, 'Created KG version snapshot in GraphDB (entities + relationships)');
            
            return version;
        } catch (error) {
            logger.error({ error, branch: branchName }, 'Failed to create version snapshot in GraphDB');
            throw error;
        }
    }

    /**
     * Stash current changes (captures both entities and relationships)
     */
    async stash(branchName: string, description?: string): Promise<string> {
        try {
            // Get current entity and relationship counts
            const stats = await this.getBranchStats(branchName);
            
            // Get all entity IDs in this branch
            const entityIds = await this.getEntityIdsForBranch(branchName);
            
            // Get all relationships in this branch
            const relationships = await this.getRelationshipsForBranch(branchName);
            
            const stashId = `stash-${Date.now()}`;
            const stashUri = this.stashUri(stashId);
            const branchUri = this.branchUri(branchName);
            const now = new Date().toISOString();
            
            // Serialize arrays as JSON strings
            const entityIdsJson = JSON.stringify(entityIds);
            const relationshipsJson = JSON.stringify(relationships);
            
            // Create stash node with complete state (entities + relationships)
            const createStashQuery = `
${PREFIXES}
INSERT DATA {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${stashUri}> a versioning:Stash ;
                   versioning:stashId ${this.literal(stashId)} ;
                   versioning:branch <${branchUri}> ;
                   versioning:timestamp ${this.literal(now)} ;
                   versioning:entityCount "${stats.entityCount}"^^xsd:integer ;
                   versioning:relationshipCount "${stats.relationshipCount}"^^xsd:integer ;
                   versioning:entityIds ${this.literal(entityIdsJson)} ;
                   versioning:relationships ${this.literal(relationshipsJson)} ;
                   versioning:description ${this.literal(description || `Stashed changes from ${branchName}`)} .
    <${branchUri}> versioning:hasStash <${stashUri}> .
  }
}
`;
            await this.client.update(createStashQuery);
            
            logger.info({ 
                branch: branchName, 
                stashId,
                entityCount: stats.entityCount,
                relationshipCount: stats.relationshipCount
            }, 'Stashed KG changes in GraphDB (entities + relationships)');
            return stashId;
        } catch (error) {
            logger.error({ error, branch: branchName }, 'Failed to stash changes in GraphDB');
            throw error;
        }
    }

    /**
     * Get version history for a branch
     */
    async getHistory(branchName: string, limit: number = 10): Promise<KGVersion[]> {
        try {
            const branchUri = this.branchUri(branchName);
            const query = `
${PREFIXES}
SELECT ?version ?timestamp ?entityCount ?relationshipCount ?parentVersion ?metadata ?workflowRunId
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?versionNode a versioning:Version ;
                 versioning:version ?version ;
                 versioning:branch <${branchUri}> ;
                 versioning:timestamp ?timestamp .

    OPTIONAL { ?versionNode versioning:entityCount ?entityCount }
    OPTIONAL { ?versionNode versioning:relationshipCount ?relationshipCount }
    OPTIONAL { ?versionNode versioning:workflowRunId ?workflowRunId }
    OPTIONAL { ?versionNode versioning:metadata ?metadata }
    OPTIONAL {
        ?versionNode versioning:parentVersion ?parentVersionNode .
        ?parentVersionNode versioning:version ?parentVersion .
    }
  }
}
ORDER BY DESC(?timestamp)
LIMIT ${limit}
`;
            const results = await this.client.query(query);

            return results.map(r => {
                // Parse entityCount and relationshipCount safely
                // Handle undefined, null, empty string, or invalid values
                const entityCount = r.entityCount 
                    ? parseInt(String(r.entityCount), 10) 
                    : 0;
                const relationshipCount = r.relationshipCount 
                    ? parseInt(String(r.relationshipCount), 10) 
                    : 0;
                
                // Parse metadata safely - only parse if it exists and is a non-empty string
                let metadata: Record<string, unknown> | undefined;
                if (r.metadata && typeof r.metadata === 'string' && r.metadata.trim()) {
                    try {
                        metadata = JSON.parse(r.metadata);
                    } catch (parseError) {
                        logger.warn({ error: parseError, metadata: r.metadata }, 'Failed to parse version metadata JSON');
                        metadata = undefined;
                    }
                }
                
                return {
                    version: r.version as string,
                    branch: branchName,
                    parentVersion: r.parentVersion as string | undefined,
                    timestamp: r.timestamp as string,
                    entityCount: isNaN(entityCount) ? 0 : entityCount,
                    relationshipCount: isNaN(relationshipCount) ? 0 : relationshipCount,
                    workflowRunId: r.workflowRunId as string | undefined,
                    metadata
                };
            });
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get history for branch from GraphDB');
            return [];
        }
    }

    /**
     * Get branch statistics
     */
    async getBranchStats(branchName: string): Promise<{ entityCount: number; relationshipCount: number }> {
        try {
            // Count entities in current branch (entities have branch property in metadata)
            const entityQuery = `
${PREFIXES}
SELECT (COUNT(DISTINCT ?entity) as ?count)
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?entity beleid:id ?id ;
            beleid:type ?type .
    OPTIONAL { ?entity beleid:metadata ?metadata }
  }
  FILTER (
    ${branchName === 'main' 
        ? '(!BOUND(?metadata) || !CONTAINS(STR(?metadata), "branch"))' 
        : `CONTAINS(STR(?metadata), "${branchName}")`}
  )
}
`;
            const entityResults = await this.client.query(entityQuery);
            const entityCount = entityResults.length > 0 ? parseInt(entityResults[0].count as string) || 0 : 0;
            
            // Count relationships in current branch
            // Relationships now have branch metadata stored in their beleid:metadata field
            const relationshipQuery = `
${PREFIXES}
SELECT (COUNT(DISTINCT ?rel) as ?count)
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?rel a beleid:Relation .
    OPTIONAL { ?rel beleid:metadata ?metadata }
  }
  FILTER (
    ${branchName === 'main' 
        ? '(!BOUND(?metadata) || !CONTAINS(STR(?metadata), "branch"))' 
        : `CONTAINS(STR(?metadata), "${branchName}")`}
  )
}
`;
            const relationshipResults = await this.client.query(relationshipQuery);
            const relationshipCount = relationshipResults.length > 0 ? parseInt(relationshipResults[0].count as string) || 0 : 0;
            
            return {
                entityCount,
                relationshipCount
            };
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get branch stats from GraphDB');
            return { entityCount: 0, relationshipCount: 0 };
        }
    }

    /**
     * Get entity IDs for a branch
     */
    private async getEntityIdsForBranch(branchName: string): Promise<string[]> {
        try {
            const query = `
${PREFIXES}
SELECT DISTINCT ?id
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?entity beleid:id ?id ;
            beleid:type ?type .
    OPTIONAL { ?entity beleid:metadata ?metadata }
  }
  FILTER (
    ${branchName === 'main' 
        ? '(!BOUND(?metadata) || !CONTAINS(STR(?metadata), "branch"))' 
        : `CONTAINS(STR(?metadata), "${branchName}")`}
  )
}
`;
            const results = await this.client.query(query);
            return results.map(r => r.id as string);
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get entity IDs for branch from GraphDB');
            return [];
        }
    }

    /**
     * Get relationships for a branch
     * Relationships now have branch metadata stored in their beleid:metadata field
     */
    private async getRelationshipsForBranch(branchName: string): Promise<Array<{ sourceId: string; targetId: string; type: string }>> {
        try {
            const query = `
${PREFIXES}
SELECT DISTINCT ?sourceId ?targetId ?type
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?rel a beleid:Relation ;
         beleid:source ?source ;
         beleid:target ?target ;
         beleid:relationType ?type .
    ?source beleid:id ?sourceId .
    ?target beleid:id ?targetId .
    OPTIONAL { ?rel beleid:metadata ?metadata }
  }
  FILTER (
    ${branchName === 'main' 
        ? '(!BOUND(?metadata) || !CONTAINS(STR(?metadata), "branch"))' 
        : `CONTAINS(STR(?metadata), "${branchName}")`}
  )
}
`;
            const results = await this.client.query(query);
            return results.map(r => ({
                sourceId: r.sourceId as string,
                targetId: r.targetId as string,
                type: r.type as string
            }));
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get relationships for branch from GraphDB');
            return [];
        }
    }

    /**
     * Get a stash by ID
     */
    async getStash(stashId: string): Promise<KGStash | null> {
        try {
            const stashUri = this.stashUri(stashId);
            const query = `
${PREFIXES}
SELECT ?stashId ?branch ?timestamp ?entityCount ?relationshipCount ?entityIds ?relationships ?description
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${stashUri}> a versioning:Stash ;
                   versioning:stashId ?stashId ;
                   versioning:branch ?branchNode ;
                   versioning:timestamp ?timestamp ;
                   versioning:entityCount ?entityCount ;
                   versioning:relationshipCount ?relationshipCount ;
                   versioning:entityIds ?entityIds ;
                   versioning:relationships ?relationships .
    OPTIONAL { <${stashUri}> versioning:description ?description }
    ?branchNode versioning:branchName ?branch .
  }
}
LIMIT 1
`;
            const results = await this.client.query(query);
            if (results.length === 0) {
                return null;
            }

            const r = results[0];
            const entityIds = r.entityIds ? JSON.parse(r.entityIds as string) : [];
            const relationships = r.relationships ? JSON.parse(r.relationships as string) : [];

            return {
                stashId: r.stashId as string,
                branch: r.branch as string,
                timestamp: r.timestamp as string,
                entityCount: parseInt(r.entityCount as string) || 0,
                relationshipCount: parseInt(r.relationshipCount as string) || 0,
                entityIds,
                relationships,
                description: r.description as string | undefined
            };
        } catch (error) {
            logger.warn({ error, stashId }, 'Failed to get stash from GraphDB');
            return null;
        }
    }

    /**
     * List all stashes for a branch
     */
    async listStashes(branchName?: string): Promise<KGStash[]> {
        try {
            const branchUri = branchName ? this.branchUri(branchName) : null;
            const query = `
${PREFIXES}
SELECT ?stashUri ?stashId ?branch ?timestamp ?entityCount ?relationshipCount ?entityIds ?relationships ?description
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?stashUri a versioning:Stash ;
              versioning:stashId ?stashId ;
              versioning:branch ?branchNode ;
              versioning:timestamp ?timestamp ;
              versioning:entityCount ?entityCount ;
              versioning:relationshipCount ?relationshipCount ;
              versioning:entityIds ?entityIds ;
              versioning:relationships ?relationships .
    OPTIONAL { ?stashUri versioning:description ?description }
    ?branchNode versioning:branchName ?branch .
    ${branchUri ? `FILTER (?branchNode = <${branchUri}>)` : ''}
  }
}
ORDER BY DESC(?timestamp)
`;
            const results = await this.client.query(query);
            
            return results.map(r => {
                const entityIds = r.entityIds ? JSON.parse(r.entityIds as string) : [];
                const relationships = r.relationships ? JSON.parse(r.relationships as string) : [];
                
                return {
                    stashId: r.stashId as string,
                    branch: r.branch as string,
                    timestamp: r.timestamp as string,
                    entityCount: parseInt(r.entityCount as string) || 0,
                    relationshipCount: parseInt(r.relationshipCount as string) || 0,
                    entityIds,
                    relationships,
                    description: r.description as string | undefined
                };
            });
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to list stashes from GraphDB');
            return [];
        }
    }

    /**
     * Apply stashed changes (pop stash)
     * Note: This is a simplified implementation - full implementation would restore entities/relationships
     */
    async stashPop(stashId: string, targetBranch?: string): Promise<{ applied: boolean; message: string }> {
        try {
            const stash = await this.getStash(stashId);
            if (!stash) {
                throw new Error(`Stash ${stashId} not found`);
            }

            const branch = targetBranch || stash.branch;
            
            // For now, stash pop is a placeholder
            // Full implementation would require:
            // 1. Restore entities from stash.entityIds
            // 2. Restore relationships from stash.relationships
            // 3. Update branch metadata
            // 4. Delete stash after successful application
            
            logger.warn({ stashId, branch }, 'Stash pop not fully implemented - requires entity/relationship restoration');
            
            // Delete the stash to indicate it was "popped"
            await this.stashDrop(stashId);
            
            return {
                applied: false,
                message: 'Stash pop not fully implemented. Stash has been dropped. Full implementation requires entity/relationship restoration.'
            };
        } catch (error) {
            logger.error({ error, stashId }, 'Failed to pop stash');
            throw error;
        }
    }

    /**
     * Delete a stash (drop stash)
     */
    async stashDrop(stashId: string): Promise<void> {
        try {
            const stashUri = this.stashUri(stashId);
            const query = `
${PREFIXES}
DELETE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?stashUri ?p ?o .
    ?branchNode versioning:hasStash ?stashUri .
  }
}
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${stashUri}> ?p ?o .
    OPTIONAL { ?branchNode versioning:hasStash <${stashUri}> }
  }
}
`;
            await this.client.update(query);
            
            logger.info({ stashId }, 'Dropped stash from GraphDB');
        } catch (error) {
            logger.error({ error, stashId }, 'Failed to drop stash');
            throw error;
        }
    }

    /**
     * Get differences between two branches
     */
    async getBranchDiff(branch1: string, branch2: string): Promise<{
        entities: {
            added: string[];
            removed: string[];
            modified: string[];
        };
        relationships: {
            added: Array<{ sourceId: string; targetId: string; type: string }>;
            removed: Array<{ sourceId: string; targetId: string; type: string }>;
            modified: Array<{ sourceId: string; targetId: string; type: string }>;
        };
    }> {
        try {
            // Get entity IDs for both branches
            const branch1Entities = new Set(await this.getEntityIdsForBranch(branch1));
            const branch2Entities = new Set(await this.getEntityIdsForBranch(branch2));
            
            // Get relationships for both branches
            const branch1Relationships = await this.getRelationshipsForBranch(branch1);
            const branch2Relationships = await this.getRelationshipsForBranch(branch2);
            
            // Create relationship sets for comparison
            const branch1RelSet = new Set(
                branch1Relationships.map(r => JSON.stringify({ s: r.sourceId, t: r.targetId, r: r.type }))
            );
            const branch2RelSet = new Set(
                branch2Relationships.map(r => JSON.stringify({ s: r.sourceId, t: r.targetId, r: r.type }))
            );
            
            // Find added entities (in branch2 but not branch1)
            const addedEntities = Array.from(branch2Entities).filter(id => !branch1Entities.has(id));
            
            // Find removed entities (in branch1 but not branch2)
            const removedEntities = Array.from(branch1Entities).filter(id => !branch2Entities.has(id));
            
            // Find modified entities (in both but properties may differ)
            // For now, we'll mark entities that exist in both as potentially modified
            // Full implementation would require property-level comparison
            const modifiedEntities: string[] = [];
            for (const id of branch1Entities) {
                if (branch2Entities.has(id)) {
                    // Entity exists in both - would need property comparison to determine if modified
                    // For now, we'll leave this empty as property comparison is complex
                }
            }
            
            // Find added relationships
            const addedRelationships = branch2Relationships.filter(
                r => !branch1RelSet.has(JSON.stringify({ s: r.sourceId, t: r.targetId, r: r.type }))
            );
            
            // Find removed relationships
            const removedRelationships = branch1Relationships.filter(
                r => !branch2RelSet.has(JSON.stringify({ s: r.sourceId, t: r.targetId, r: r.type }))
            );
            
            // Find modified relationships (same source/target/type but different metadata)
            // For now, we'll leave this empty as metadata comparison is complex
            const modifiedRelationships: Array<{ sourceId: string; targetId: string; type: string }> = [];
            
            return {
                entities: {
                    added: addedEntities,
                    removed: removedEntities,
                    modified: modifiedEntities
                },
                relationships: {
                    added: addedRelationships,
                    removed: removedRelationships,
                    modified: modifiedRelationships
                }
            };
        } catch (error) {
            logger.error({ error, branch1, branch2 }, 'Failed to get branch diff');
            throw error;
        }
    }

    /**
     * Get version history (log)
     */
    async getVersionHistory(branchName?: string, limit: number = 10): Promise<KGVersion[]> {
        try {
            const branch = branchName || await this.getCurrentBranch();
            const branchUri = this.branchUri(branch);

            const query = `
${PREFIXES}
SELECT ?version ?timestamp ?entityCount ?relationshipCount ?parentVersionId ?workflowRunId ?metadata
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    ?versionNode a versioning:Version ;
                 versioning:version ?version ;
                 versioning:branch <${branchUri}> ;
                 versioning:timestamp ?timestamp ;
                 versioning:entityCount ?entityCount ;
                 versioning:relationshipCount ?relationshipCount .

    OPTIONAL {
        ?versionNode versioning:parentVersion ?parent .
        ?parent versioning:version ?parentVersionId .
    }
    OPTIONAL { ?versionNode versioning:workflowRunId ?workflowRunId . }
    OPTIONAL { ?versionNode versioning:metadata ?metadata . }
  }
}
ORDER BY DESC(?timestamp)
LIMIT ${limit}
`;
            const results = await this.client.query(query);

            return results.map(r => ({
                version: r.version as string,
                branch: branch,
                parentVersion: r.parentVersionId as string | undefined,
                timestamp: r.timestamp as string,
                entityCount: parseInt(r.entityCount as string) || 0,
                relationshipCount: parseInt(r.relationshipCount as string) || 0,
                workflowRunId: r.workflowRunId as string | undefined,
                metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined
            }));
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get version history from GraphDB');
            return [];
        }
    }

    /**
     * Get latest version for a branch
     */
    private async getLatestVersionForBranch(branchName: string): Promise<string | undefined> {
        try {
            const branchUri = this.branchUri(branchName);
            const query = `
${PREFIXES}
SELECT ?version
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> versioning:hasVersion ?versionNode .
    ?versionNode versioning:version ?version ;
                 versioning:timestamp ?timestamp .
  }
}
ORDER BY DESC(?timestamp)
LIMIT 1
`;
            const results = await this.client.query(query);
            return results.length > 0 ? results[0].version as string : undefined;
        } catch (error) {
            logger.warn({ error, branch: branchName }, 'Failed to get latest version for branch from GraphDB');
            return undefined;
        }
    }

    /**
     * Push changes from development branch to main
     */
    async pushToMain(sourceBranch: string = this.DEV_BRANCH): Promise<KGMergeResult> {
        return this.merge(sourceBranch, this.DEFAULT_BRANCH);
    }

    /**
     * Merge one branch into another (move entities/relationships)
     */
    async merge(sourceBranch: string, targetBranch: string): Promise<KGMergeResult> {
        let entitiesMoved = 0;
        let relationshipsMoved = 0;
        const conflicts: Array<{
            entityId: string;
            conflictType: 'entity_exists' | 'relationship_exists' | 'property_mismatch';
            message: string;
        }> = [];

        try {
            logger.info({ sourceBranch, targetBranch }, 'Starting merge operation in GraphDB');

            // 1. Get stats before merge
            const sourceStats = await this.getBranchStats(sourceBranch);

            if (sourceStats.entityCount === 0 && sourceStats.relationshipCount === 0) {
                 return {
                    merged: true,
                    conflicts: [],
                    entitiesAdded: 0,
                    relationshipsAdded: 0,
                    entitiesUpdated: 0,
                    relationshipsUpdated: 0
                };
            }

            // 2. Move Entities
            // We need to update beleid:metadata for all entities in sourceBranch
            // If targetBranch is 'main', we remove the 'branch' property from JSON metadata
            // Else we set 'branch' property to targetBranch

            // Batch processing for performance
            const BATCH_SIZE = 50;
            const entityIds = await this.getEntityIdsForBranch(sourceBranch);

            for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
                const batchIds = entityIds.slice(i, i + BATCH_SIZE);
                // Fetch metadata for batch (one by one for now to keep logic simple, optimization can be done here too)
                // Construct ONE update query with multiple operations
                const operations: string[] = [];

                for (const id of batchIds) {
                    const entityUri = this.entityUri(id);

                    // Fetch metadata
                    const getQuery = `
${PREFIXES}
SELECT ?metadata
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ?metadata .
  }
}
`;
                    const results = await this.client.query(getQuery);
                    let metadata: Record<string, unknown> = {};
                    if (results.length > 0 && results[0].metadata) {
                        try {
                            metadata = JSON.parse(results[0].metadata as string);
                        } catch (e) {
                            logger.warn({ entityId: id, error: e }, 'Failed to parse metadata during merge, skipping entity');
                            conflicts.push({
                                entityId: id,
                                conflictType: 'property_mismatch',
                                message: `Failed to parse metadata: ${e instanceof Error ? e.message : String(e)}`
                            });
                            continue;
                        }
                    }

                    // Modify metadata
                    if (targetBranch === 'main') {
                        delete metadata.branch;
                    } else {
                        metadata.branch = targetBranch;
                    }

                    const newMetadataJson = JSON.stringify(metadata);

                    // Append to batch update query
                    operations.push(`
DELETE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ?oldMetadata .
  }
}
INSERT {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ${this.literal(newMetadataJson)} .
  }
}
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:id ?id .
    OPTIONAL { <${entityUri}> beleid:metadata ?oldMetadata }
  }
}`);
                }

                if (operations.length > 0) {
                    const batchUpdateQuery = PREFIXES + operations.join(';\n');
                    await this.client.update(batchUpdateQuery);
                    entitiesMoved += operations.length;
                }
            }

            // 3. Move Relationships
            // Similar logic for relationships
            const relationships = await this.getRelationshipsForBranch(sourceBranch);

            for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
                const batchRels = relationships.slice(i, i + BATCH_SIZE);
                const operations: string[] = [];

                for (const rel of batchRels) {
                    const relUri = this.relationUri(rel.sourceId, rel.targetId, rel.type);

                    // Fetch metadata
                    const getQuery = `
${PREFIXES}
SELECT ?metadata
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${relUri}> beleid:metadata ?metadata .
  }
}
`;
                    const results = await this.client.query(getQuery);
                    let metadata: Record<string, unknown> = {};
                    if (results.length > 0 && results[0].metadata) {
                        try {
                            metadata = JSON.parse(results[0].metadata as string);
                        } catch (e) {
                            logger.warn({ sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type, error: e }, 'Failed to parse relationship metadata during merge, skipping');
                            conflicts.push({
                                entityId: `${rel.sourceId}-${rel.targetId}-${rel.type}`,
                                conflictType: 'property_mismatch',
                                message: `Failed to parse relationship metadata: ${e instanceof Error ? e.message : String(e)}`
                            });
                            continue;
                        }
                    }

                    if (targetBranch === 'main') {
                        delete metadata.branch;
                    } else {
                        metadata.branch = targetBranch;
                    }

                    const newMetadataJson = JSON.stringify(metadata);

                    // Append to batch update query
                    operations.push(`
DELETE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${relUri}> beleid:metadata ?oldMetadata .
  }
}
INSERT {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${relUri}> beleid:metadata ${this.literal(newMetadataJson)} .
  }
}
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${relUri}> a kg:Relation .
    OPTIONAL { <${relUri}> beleid:metadata ?oldMetadata }
  }
}`);
                }

                if (operations.length > 0) {
                    const batchUpdateQuery = PREFIXES + operations.join(';\n');
                    await this.client.update(batchUpdateQuery);
                    relationshipsMoved += operations.length;
                }
            }

            logger.info({
                sourceBranch,
                targetBranch,
                entitiesMoved,
                relationshipsMoved
            }, 'Successfully merged branch in GraphDB');

            return {
                merged: true,
                conflicts,
                entitiesAdded: entitiesMoved,
                relationshipsAdded: relationshipsMoved,
                entitiesUpdated: 0,
                relationshipsUpdated: 0
            };

        } catch (error) {
            logger.error({ error, sourceBranch, targetBranch }, 'Failed to merge branch in GraphDB');
             return {
                merged: false,
                conflicts: [
                    ...conflicts,
                    {
                        entityId: 'merge-failed',
                        conflictType: 'property_mismatch',
                        message: error instanceof Error ? error.message : String(error)
                    }
                ],
                entitiesAdded: entitiesMoved,
                relationshipsAdded: relationshipsMoved,
                entitiesUpdated: 0,
                relationshipsUpdated: 0
            };
        }
    }

    /**
     * Reset branch to a specific version
     * WARNING: This is a destructive operation.
     */
    async resetToVersion(versionId: string): Promise<ResetResult> {
        try {
            // 1. Get version details
            const versionUri = this.versionUri(versionId);
            const query = `
${PREFIXES}
SELECT ?version ?branch ?entityIds ?relationships
WHERE {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${versionUri}> a versioning:Version ;
                    versioning:version ?version ;
                    versioning:branch ?branchNode ;
                    versioning:entityIds ?entityIds ;
                    versioning:relationships ?relationships .
    ?branchNode versioning:name ?branch .
  }
}
LIMIT 1
`;
            const results = await this.client.query(query);
            if (results.length === 0) {
                throw new NotFoundError(`Version ${versionId} not found`);
            }

            const r = results[0];
            const branchName = r.branch as string;
            const versionEntityIds: string[] = JSON.parse(r.entityIds as string);
            const versionRelationships: Array<{ sourceId: string; targetId: string; type: string }> = JSON.parse(r.relationships as string);

            // 2. Get current branch state
            const currentEntityIds = await this.getEntityIdsForBranch(branchName);
            const currentRelationships = await this.getRelationshipsForBranch(branchName);

            // 3. Calculate diffs
            const currentEntitySet = new Set(currentEntityIds);
            const versionEntitySet = new Set(versionEntityIds);

            const entitiesToRemove = currentEntityIds.filter(id => !versionEntitySet.has(id));
            const entitiesToRestore = versionEntityIds.filter(id => !currentEntitySet.has(id));

            const currentRelSet = new Set(currentRelationships.map(rel => JSON.stringify({ s: rel.sourceId, t: rel.targetId, r: rel.type })));
            const versionRelSet = new Set(versionRelationships.map(rel => JSON.stringify({ s: rel.sourceId, t: rel.targetId, r: rel.type })));

            const relsToRemove = currentRelationships.filter(rel => !versionRelSet.has(JSON.stringify({ s: rel.sourceId, t: rel.targetId, r: rel.type })));
            const relsToRestore = versionRelationships.filter(rel => !currentRelSet.has(JSON.stringify({ s: rel.sourceId, t: rel.targetId, r: rel.type })));

            const result: ResetResult = {
                success: true,
                message: `Reset branch ${branchName} to version ${versionId}`,
                entitiesRemoved: 0,
                entitiesRestored: 0,
                relationshipsRemoved: 0,
                relationshipsRestored: 0,
                errors: []
            };

            // 4. Perform updates

            // Remove extra entities
            for (const id of entitiesToRemove) {
                try {
                    await this.deleteEntity(id);
                    result.entitiesRemoved++;
                } catch (error) {
                    result.errors.push(`Failed to remove entity ${id}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Restore missing entities (if they exist in the graph)
            for (const id of entitiesToRestore) {
                try {
                    // Check if exists using ASK
                    const askQuery = `
${PREFIXES}
ASK {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?s beleid:id ${this.literal(id)} .
  }
}
`;
                    const askResult = await this.client.query(askQuery);
                    const exists = askResult.length > 0 && (askResult[0] as unknown as { boolean: boolean }).boolean === true;

                    if (exists) {
                        await this.updateEntityBranch(id, branchName);
                        result.entitiesRestored++;
                    } else {
                        result.errors.push(`Cannot restore entity ${id}: Entity not found in graph (may have been permanently deleted)`);
                    }
                } catch (error) {
                    result.errors.push(`Failed to restore entity ${id}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Remove extra relationships
            for (const rel of relsToRemove) {
                try {
                    await this.deleteRelationship(rel.sourceId, rel.targetId, rel.type);
                    result.relationshipsRemoved++;
                } catch (error) {
                    result.errors.push(`Failed to remove relationship ${rel.sourceId}->${rel.targetId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Restore missing relationships
            for (const rel of relsToRestore) {
                try {
                    await this.restoreRelationship(rel.sourceId, rel.targetId, rel.type);
                    result.relationshipsRestored++;
                } catch (error) {
                    result.errors.push(`Failed to restore relationship ${rel.sourceId}->${rel.targetId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            logger.info({
                versionId,
                branch: branchName,
                ...result
            }, 'Reset KG branch to version');

            return result;
        } catch (error) {
            logger.error({ error, versionId }, 'Failed to reset to version');
            throw error;
        }
    }

    /**
     * Initialize versioning system (creates main branch if it doesn't exist)
     */
    async initialize(): Promise<void> {
        try {
            // Check if main branch exists
            const branchUri = this.branchUri(this.DEFAULT_BRANCH);
            const query = `
${PREFIXES}
ASK {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch .
  }
}
`;
            const results = await this.client.query(query);
            const exists = results.length > 0 && (results[0] as unknown as { boolean: boolean }).boolean === true;
            
            if (!exists) {
                // Create main branch (no parent)
                await this.createBranch(this.DEFAULT_BRANCH, true, null);
                
                // Create development branch
                await this.createBranch(this.DEV_BRANCH, false, this.DEFAULT_BRANCH);
                
                logger.info('Initialized KG versioning system in GraphDB');
            }
        } catch (error) {
            logger.error({ error }, 'Failed to initialize KG versioning system in GraphDB');
            throw error;
        }
    }

    /**
     * Ensure we're on the development branch (creates it if needed)
     */
    async ensureDevelopmentBranch(): Promise<void> {
        await this.initialize();
        
        const currentBranch = await this.getCurrentBranch();
        if (currentBranch !== this.DEV_BRANCH) {
            // Check if dev branch exists
            const branchUri = this.branchUri(this.DEV_BRANCH);
            const query = `
${PREFIXES}
ASK {
  GRAPH <${VERSIONING_GRAPH_URI}> {
    <${branchUri}> a versioning:Branch .
  }
}
`;
            const results = await this.client.query(query);
            const exists = results.length > 0 && (results[0] as any).boolean === true;
            
            if (!exists) {
                await this.createBranch(this.DEV_BRANCH, false, this.DEFAULT_BRANCH);
            }
            
            await this.switchBranch(this.DEV_BRANCH, true);
        }
    }

    /**
     * Helper to map relation types to ontology properties
     */
    private getBeleidRelationProperty(type: string): string {
        const beleidMapping: Record<string, string> = {
            'APPLIES_TO': 'beleid:appliesTo',
            'CONSTRAINS': 'beleid:constrains',
            'DEFINED_IN': 'beleid:definedIn',
            'OVERRIDES': 'beleid:overrides',
            'REFINES': 'beleid:refines',
            'LOCATED_IN': 'beleid:locatedIn',
            'HAS_REQUIREMENT': 'beleid:hasRequirement',
            'RELATED_TO': 'beleid:relatedTo',
        };
        return beleidMapping[type] || 'beleid:relatedTo';
    }

    /**
     * Helper to delete an entity from the graph (used for reset/restore)
     */
    private async deleteEntity(entityId: string): Promise<void> {
        const entityUri = this.entityUri(entityId);
        const query = `
${PREFIXES}
DELETE WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> ?p ?o .
  }
}
;
${PREFIXES}
DELETE WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?s ?p <${entityUri}> .
  }
}
`;
        await this.client.update(query);
    }

    /**
     * Helper to update an entity's branch metadata
     */
    private async updateEntityBranch(entityId: string, branchName: string): Promise<void> {
        const entityUri = this.entityUri(entityId);
        // We need to fetch current metadata, update it, and write it back.
        // Simplified approach: Just ensure 'branch' property in JSON metadata is set.

        // 1. Get current metadata
        const getQuery = `
${PREFIXES}
SELECT ?metadata
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ?metadata .
  }
}
`;
        const results = await this.client.query(getQuery);
        let metadata: Record<string, unknown> = {};
        if (results.length > 0 && results[0].metadata) {
            try {
                metadata = JSON.parse(results[0].metadata as string);
            } catch (e) {
                // Ignore parsing error
            }
        }

        // 2. Update metadata
        metadata.branch = branchName;
        const newMetadataJson = JSON.stringify(metadata);

        // 3. Update graph
        const updateQuery = `
${PREFIXES}
DELETE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ?oldMetadata .
  }
}
INSERT {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:metadata ${this.literal(newMetadataJson)} .
  }
}
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${entityUri}> beleid:id ?id .
    OPTIONAL { <${entityUri}> beleid:metadata ?oldMetadata }
  }
}
`;
        await this.client.update(updateQuery);
    }

    /**
     * Helper to restore a relationship
     */
    private async restoreRelationship(sourceId: string, targetId: string, type: string): Promise<void> {
        const sourceUri = this.entityUri(sourceId);
        const targetUri = this.entityUri(targetId);
        const property = this.getBeleidRelationProperty(type);
        const relUri = this.relationUri(sourceId, targetId, type);

        // Restore both direct triple and reified metadata
        const query = `
${PREFIXES}
INSERT DATA {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${sourceUri}> ${property} <${targetUri}> .
    <${relUri}> a kg:Relation ;
                kg:source <${sourceUri}> ;
                kg:target <${targetUri}> ;
                kg:relationType ${this.literal(type)} .
  }
}
`;
        await this.client.update(query);
    }

    /**
     * Helper to delete a relationship
     */
    private async deleteRelationship(sourceId: string, targetId: string, type: string): Promise<void> {
        const sourceUri = this.entityUri(sourceId);
        const targetUri = this.entityUri(targetId);
        const property = this.getBeleidRelationProperty(type);
        const relUri = this.relationUri(sourceId, targetId, type);

        const query = `
${PREFIXES}
DELETE WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${sourceUri}> ${property} <${targetUri}> .
  }
}
;
${PREFIXES}
DELETE WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    <${relUri}> ?p ?o .
  }
}
`;
        await this.client.update(query);
    }

    // Helper methods for URIs and literals
    private branchUri(branchName: string): string {
        return `http://data.example.org/versioning/branch/${encodeURIComponent(branchName)}`;
    }

    private versionUri(versionId: string): string {
        return `http://data.example.org/versioning/version/${encodeURIComponent(versionId)}`;
    }

    private stashUri(stashId: string): string {
        return `http://data.example.org/versioning/stash/${encodeURIComponent(stashId)}`;
    }

    private entityUri(entityId: string): string {
        return `http://data.example.org/id/${encodeURIComponent(entityId)}`;
    }

    private relationUri(sourceId: string, targetId: string, type: string): string {
        // Match URI construction in GraphDBKnowledgeGraphService (no encoding on type usually, but let's be safe/consistent with existing code)
        return `http://data.example.org/relation/${encodeURIComponent(sourceId)}-${encodeURIComponent(targetId)}-${type}`;
    }

    private literal(value: string): string {
        // Escape quotes and wrap in quotes
        const escaped = value.replace(/"/g, '\\"');
        return `"${escaped}"`;
    }
}
