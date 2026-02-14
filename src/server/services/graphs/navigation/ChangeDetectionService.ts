/**
 * Change Detection Service for Navigation Graph
 * 
 * Handles detection of changes between existing and new node data,
 * and storage of change metadata for incremental updates.
 * 
 * Extracted from NavigationGraph.ts for better organization and testability.
 */

import { Session } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import type {
    NavigationNode,
    NodeChangeResult,
    NodeChangeMetadata,
} from '../../../types/navigationGraph.js';

/**
 * Service for detecting and tracking changes in navigation graph nodes
 */
export class ChangeDetectionService {
    /**
     * Detect changes between existing and new node data
     * Returns information about what changed and what needs to be updated
     * 
     * @param existing Existing node data from Neo4j (or null for new nodes)
     * @param newNode New node data to compare against
     * @returns Change detection result with changed fields and properties
     */
    detectChanges(existing: Record<string, unknown> | null, newNode: NavigationNode): NodeChangeResult {
        if (!existing) {
            // New node - all fields are "changed" (new)
            return {
                hasChanges: true,
                changedFields: ['url', 'type', 'title', 'filePath', 'lastVisited', 'schemaType', 'uri', 'sourceUrl', 'xpaths', 'children', 'thema', 'onderwerp', 'content', 'summary', 'documentType', 'publishedAt', 'publisherAuthority', 'httpStatus'],
                changedProperties: {},
                previousValues: undefined
            };
        }

        const changedFields: string[] = [];
        const changedProperties: Record<string, unknown> = {};
        const previousValues: Record<string, unknown> = {};

        // Compare scalar properties
        const propertiesToCheck: Array<{ key: string; value: string | undefined }> = [
            { key: 'type', value: newNode.type },
            { key: 'title', value: newNode.title },
            { key: 'filePath', value: newNode.filePath },
            { key: 'lastVisited', value: newNode.lastVisited },
            { key: 'schemaType', value: newNode.schemaType },
            { key: 'uri', value: newNode.uri },
            { key: 'sourceUrl', value: newNode.sourceUrl || newNode.url },
            { key: 'thema', value: newNode.thema },
            { key: 'onderwerp', value: newNode.onderwerp },
            { key: 'content', value: newNode.content },
            { key: 'summary', value: newNode.summary },
            { key: 'documentType', value: newNode.documentType },
            { key: 'publishedAt', value: newNode.publishedAt },
            { key: 'publisherAuthority', value: newNode.publisherAuthority }
        ];

        for (const { key, value } of propertiesToCheck) {
            const existingValue = existing[key];
            const newValue = value;

            // Handle undefined/null comparison
            if (existingValue !== newValue && (existingValue != null || newValue != null)) {
                changedFields.push(key);
                changedProperties[key] = newValue;
                previousValues[key] = existingValue;
            }
        }

        // Compare numeric properties (httpStatus)
        {
            const existingHttpStatus = existing.httpStatus != null ? Number(existing.httpStatus) : undefined;
            const newHttpStatus = newNode.httpStatus;
            if (existingHttpStatus !== newHttpStatus && (existingHttpStatus != null || newHttpStatus != null)) {
                changedFields.push('httpStatus');
                changedProperties.httpStatus = newHttpStatus;
                previousValues.httpStatus = existingHttpStatus;
            }
        }

        // Compare xpaths (JSON comparison)
        const existingXpaths = existing.xpaths ? (typeof existing.xpaths === 'string' ? JSON.parse(existing.xpaths) : existing.xpaths) : undefined;
        const newXpaths = newNode.xpaths;
        if (JSON.stringify(existingXpaths) !== JSON.stringify(newXpaths)) {
            changedFields.push('xpaths');
            changedProperties.xpaths = newXpaths ? JSON.stringify(newXpaths) : null;
            previousValues.xpaths = existingXpaths;
        }

        // Compare children (array comparison)
        const existingChildren: string[] = Array.isArray(existing.children) ? existing.children as string[] : [];
        const newChildren = newNode.children || [];
        const childrenChanged = JSON.stringify([...existingChildren].sort()) !== JSON.stringify([...newChildren].sort());
        if (childrenChanged) {
            changedFields.push('children');
            previousValues.children = existingChildren;
        }

        return {
            hasChanges: changedFields.length > 0 || childrenChanged,
            changedFields,
            changedProperties,
            previousValues: Object.keys(previousValues).length > 0 ? previousValues : undefined
        };
    }

    /**
     * Store change metadata in Neo4j for tracking incremental updates
     * 
     * @param nodeUrl URL of the node that changed
     * @param metadata Change metadata to store
     * @param session Neo4j session for database operations
     */
    async storeChangeMetadata(
        nodeUrl: string,
        metadata: NodeChangeMetadata,
        sessionOrTx: Session | { run: (query: string, params?: Record<string, unknown>) => Promise<{ records: unknown[] }> }
    ): Promise<void> {
        try {
            // Store metadata as properties on the node for quick access
            await sessionOrTx.run(`
                MATCH (n:NavigationNode {url: $url})
                SET n.lastChangeFields = $changedFields,
                    n.lastChangeType = $changeType,
                    n.lastChangeTimestamp = $timestamp,
                    n.lastChangePreviousValues = $previousValues
            `, {
                url: nodeUrl,
                changedFields: metadata.changedFields,
                changeType: metadata.changeType,
                timestamp: metadata.timestamp,
                previousValues: metadata.previousValues ? JSON.stringify(metadata.previousValues) : null
            });
        } catch (error) {
            // Non-critical: log but don't fail the operation
            logger.warn({ nodeUrl, error }, 'Failed to store change metadata');
        }
    }

    /**
     * Create change metadata from change detection result
     * 
     * @param changeResult Result from detectChanges()
     * @param exists Whether the node already exists
     * @param timestamp Timestamp for the change (defaults to current time)
     * @returns Change metadata object
     */
    createChangeMetadata(
        changeResult: NodeChangeResult,
        exists: boolean,
        timestamp: string = new Date().toISOString()
    ): NodeChangeMetadata {
        return {
            changedFields: changeResult.changedFields,
            changeType: exists ? (changeResult.hasChanges ? 'updated' : 'unchanged') : 'added',
            previousValues: changeResult.previousValues,
            timestamp
        };
    }
}

