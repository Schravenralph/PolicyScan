/**
 * Navigation Graph Serialization Utilities
 * 
 * Provides utilities for converting Neo4j records to NavigationNode objects.
 * Extracted from NavigationGraph.ts to improve maintainability and reusability.
 * 
 * This module handles:
 * - Neo4j record → NavigationNode conversion
 * - XPath parsing utilities
 * - Children array parsing
 * - Optional field handling
 */

import type { Record } from 'neo4j-driver';
import type { NavigationNode } from '../types/navigationGraph.js';
import { logger } from './logger.js';

/**
 * Parse XPaths from node properties
 * Handles both string and object formats
 */
export function parseXpaths(xpaths: unknown): { [key: string]: string } | undefined {
    if (!xpaths) {
        return undefined;
    }

    try {
        if (typeof xpaths === 'string') {
            return JSON.parse(xpaths);
        } else if (typeof xpaths === 'object' && xpaths !== null) {
            return xpaths as { [key: string]: string };
        }
    } catch (error) {
        logger.warn({ xpaths, error }, 'Failed to parse xpaths');
        return undefined;
    }

    return undefined;
}

/**
 * Parse children array from Neo4j record
 * Filters out null values
 */
export function parseChildren(children: unknown): string[] {
    if (!Array.isArray(children)) {
        return [];
    }
    return children.filter((c: string | null) => c !== null) as string[];
}

/**
 * Convert Neo4j record to NavigationNode
 * 
 * @param record Neo4j record containing node data
 * @param nodeKey Key to get node from record (default: 'n')
 * @param childrenKey Key to get children from record (default: 'children')
 * @returns NavigationNode or null if record is invalid
 */
export function recordToNavigationNode(
    record: Record,
    nodeKey: string = 'n',
    childrenKey: string = 'children'
): NavigationNode | null {
    const neo4jNode = record.get(nodeKey);
    if (!neo4jNode) {
        return null;
    }

    const nodeProps = neo4jNode.properties;
    const children = parseChildren(record.get(childrenKey));

    // Parse xpaths if present
    const xpaths = parseXpaths(nodeProps.xpaths);

    // Build node object
    const node: NavigationNode = {
        url: nodeProps.url,
        type: nodeProps.type,
        title: nodeProps.title,
        filePath: nodeProps.filePath,
        children: children,
        lastVisited: nodeProps.lastVisited,
        schemaType: nodeProps.schemaType,
        uri: nodeProps.uri,
        sourceUrl: nodeProps.sourceUrl || nodeProps.url,
        ...(xpaths && { xpaths }),
        ...(nodeProps.thema && { thema: nodeProps.thema }),
        ...(nodeProps.onderwerp && { onderwerp: nodeProps.onderwerp }),
        ...(nodeProps.httpStatus != null && { httpStatus: Number(nodeProps.httpStatus) })
    };

    return node;
}

/**
 * Convert Neo4j node record to NavigationNode (simplified version)
 * Used when children are already included in the node properties
 */
export function neo4jNodeToNavigationNode(
    neo4jNode: any,
    children: string[] = []
): NavigationNode | null {
    if (!neo4jNode || !neo4jNode.properties) {
        return null;
    }

    const nodeProps = neo4jNode.properties;
    const parsedChildren = parseChildren(children);
    const xpaths = parseXpaths(nodeProps.xpaths);

    return {
        url: nodeProps.url,
        type: nodeProps.type,
        title: nodeProps.title,
        filePath: nodeProps.filePath,
        children: parsedChildren,
        lastVisited: nodeProps.lastVisited,
        schemaType: nodeProps.schemaType,
        uri: nodeProps.uri,
        sourceUrl: nodeProps.sourceUrl || nodeProps.url,
        ...(xpaths && { xpaths }),
        ...(nodeProps.thema && { thema: nodeProps.thema }),
        ...(nodeProps.onderwerp && { onderwerp: nodeProps.onderwerp }),
        ...(nodeProps.httpStatus != null && { httpStatus: Number(nodeProps.httpStatus) })
    };
}

