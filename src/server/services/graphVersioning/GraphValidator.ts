/**
 * Graph Validator
 * 
 * Validates graph consistency, integrity, and correctness.
 * Checks for:
 * - Node consistency (all referenced children exist)
 * - Relationship integrity (LINKS_TO relationships match children arrays)
 * - Orphaned nodes (nodes with no parent and not root)
 * - Circular references
 * - Scraper ownership consistency
 * - Data type consistency
 */

import { Driver } from 'neo4j-driver';
import { NavigationNode, NavigationGraphData } from '../graphs/navigation/NavigationGraph.js';
import { ScraperGraphVersioning } from '../scraperGraph/ScraperGraphVersioning.js';
import { GraphVersionManager } from './GraphVersionManager.js';

export interface ValidationIssue {
    severity: 'error' | 'warning' | 'info';
    type: string;
    nodeUrl?: string;
    scraperId?: string;
    message: string;
    details?: Record<string, unknown>;
    suggestedFix?: string;
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    summary: {
        totalNodes: number;
        totalEdges: number;
        errors: number;
        warnings: number;
        info: number;
    };
}

/**
 * Service for validating graph consistency and integrity
 */
export class GraphValidator {
    private driver: Driver;
    private versioning: ScraperGraphVersioning;
    private _versionManager?: GraphVersionManager;

    constructor(driver: Driver, versioning?: ScraperGraphVersioning, versionManager?: GraphVersionManager) {
        this.driver = driver;
        this.versioning = versioning || new ScraperGraphVersioning(driver);
        this._versionManager = versionManager;
    }

    /**
     * Validate a scraper's graph from DB
     */
    async validateScraperGraph(scraperId: string): Promise<ValidationResult> {
        // Get all nodes for the scraper
        const nodes = await this.versioning.getScraperNodes(scraperId, true);

        const graphData: NavigationGraphData = {
            nodes: Object.fromEntries(nodes.map(n => [n.url, n])),
            rootUrl: nodes.length > 0 ? (nodes[0].sourceUrl || nodes[0].url) : ''
        };

        return this.validateGraph(graphData, scraperId);
    }

    /**
     * Validate a graph object (NavigationGraphData)
     */
    async validateGraph(graphData: NavigationGraphData, scraperId?: string): Promise<ValidationResult> {
        const issues: ValidationIssue[] = [];
        const nodeMap = new Map<string, NavigationNode>(Object.entries(graphData.nodes));
        const nodes = Array.from(nodeMap.values());

        // 1. Check node consistency (all children exist)
        issues.push(...this.validateNodeConsistency(nodes, nodeMap));

        // 3. Check for orphaned nodes
        issues.push(...this.validateOrphanedNodes(nodes));

        // 4. Check for circular references
        issues.push(...this.validateCircularReferences(nodes, nodeMap));

        // 6. Check data type consistency
        issues.push(...this.validateDataTypeConsistency(nodes));

        // 7. Check URL validity
        issues.push(...this.validateUrlValidity(nodes));

        // 9. Check schema.org URI uniqueness
        issues.push(...this.validateSchemaUriUniqueness(nodes));

        // 10. Check graph connectivity (disconnected components)
        issues.push(...this.validateGraphConnectivity(nodes));

        // Checks requiring scraperId and DB access
        if (scraperId) {
            // 2. Check relationship integrity (Neo4j relationships match children arrays)
            issues.push(...await this.validateRelationshipIntegrity(scraperId, nodes));

            // 5. Check scraper ownership consistency
            issues.push(...await this.validateScraperOwnership(scraperId, nodes));

            // 8. Check version consistency between Neo4j and file system
            issues.push(...await this.validateVersionConsistency(scraperId, nodes));

            // 11. Check embedding vector consistency
            issues.push(...await this.validateEmbeddingVectors(scraperId, nodes));
        }

        const errors = issues.filter(i => i.severity === 'error').length;
        const warnings = issues.filter(i => i.severity === 'warning').length;
        const info = issues.filter(i => i.severity === 'info').length;

        return {
            isValid: errors === 0,
            issues,
            summary: {
                totalNodes: nodes.length,
                totalEdges: nodes.reduce((sum, n) => sum + (n.children?.length || 0), 0),
                errors,
                warnings,
                info
            }
        };
    }

    /**
     * Validate that all referenced children exist
     */
    private validateNodeConsistency(
        nodes: NavigationNode[],
        nodeMap: Map<string, NavigationNode>
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (const node of nodes) {
            if (!node.children || node.children.length === 0) {
                continue;
            }

            for (const childUrl of node.children) {
                if (!nodeMap.has(childUrl)) {
                    issues.push({
                        severity: 'error',
                        type: 'missing_child',
                        nodeUrl: node.url,
                        message: `Node references non-existent child: ${childUrl}`,
                        details: {
                            parentUrl: node.url,
                            missingChildUrl: childUrl
                        },
                        suggestedFix: `Remove the reference to ${childUrl} from node ${node.url} or add the missing child node`
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Validate that Neo4j relationships match children arrays
     */
    private async validateRelationshipIntegrity(
        scraperId: string,
        nodes: NavigationNode[]
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const session = this.driver.session();

        try {
            // Get all LINKS_TO relationships for nodes owned by this scraper
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})-[:OWNS]->(n:NavigationNode)-[r:LINKS_TO]->(child:NavigationNode)
                RETURN n.url as parentUrl, child.url as childUrl
            `, { scraperId });

            const relationshipMap = new Map<string, Set<string>>();
            for (const record of result.records) {
                const parentUrl = record.get('parentUrl');
                const childUrl = record.get('childUrl');
                
                if (!relationshipMap.has(parentUrl)) {
                    relationshipMap.set(parentUrl, new Set());
                }
                relationshipMap.get(parentUrl)!.add(childUrl);
            }

            // Compare with children arrays
            for (const node of nodes) {
                const childrenSet = new Set(node.children || []);
                const relationships = relationshipMap.get(node.url) || new Set();

                // Check for children in array but not in relationships
                for (const childUrl of childrenSet) {
                    if (!relationships.has(childUrl)) {
                        issues.push({
                            severity: 'error',
                            type: 'missing_relationship',
                            nodeUrl: node.url,
                            scraperId,
                            message: `Node has child in array but no LINKS_TO relationship: ${childUrl}`,
                            details: {
                                parentUrl: node.url,
                                childUrl
                            },
                            suggestedFix: `Create LINKS_TO relationship from ${node.url} to ${childUrl}`
                        });
                    }
                }

                // Check for relationships but not in children array
                for (const childUrl of relationships) {
                    if (!childrenSet.has(childUrl)) {
                        issues.push({
                            severity: 'warning',
                            type: 'orphaned_relationship',
                            nodeUrl: node.url,
                            scraperId,
                            message: `Node has LINKS_TO relationship but child not in children array: ${childUrl}`,
                            details: {
                                parentUrl: node.url,
                                childUrl
                            },
                            suggestedFix: `Add ${childUrl} to the children array of node ${node.url} or remove the relationship`
                        });
                    }
                }
            }
        } finally {
            await session.close();
        }

        return issues;
    }

    /**
     * Validate for orphaned nodes (nodes with no parent and not root)
     */
    private validateOrphanedNodes(
        nodes: NavigationNode[]
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Build reverse index: which nodes are children of which
        const childToParents = new Map<string, Set<string>>();
        for (const node of nodes) {
            if (node.children) {
                for (const childUrl of node.children) {
                    if (!childToParents.has(childUrl)) {
                        childToParents.set(childUrl, new Set());
                    }
                    childToParents.get(childUrl)!.add(node.url);
                }
            }
        }

        // Find nodes that are not children of any other node
        for (const node of nodes) {
            const hasParent = childToParents.has(node.url);
            
            // A node is orphaned if:
            // 1. It's not a child of any node
            // 2. It's not the root (we can't easily determine root, so we'll check if it has children)
            // 3. It's not a standalone document/page
            if (!hasParent && (!node.children || node.children.length === 0)) {
                issues.push({
                    severity: 'warning',
                    type: 'orphaned_node',
                    nodeUrl: node.url,
                    message: `Node has no parent and no children: ${node.url}`,
                    details: {
                        nodeUrl: node.url,
                        nodeType: node.type,
                        title: node.title
                    },
                    suggestedFix: `Either connect this node to a parent or mark it as a root node`
                });
            }
        }

        return issues;
    }

    /**
     * Validate for circular references
     */
    private validateCircularReferences(
        nodes: NavigationNode[],
        nodeMap: Map<string, NavigationNode>
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Use DFS to detect cycles
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (nodeUrl: string): string[] | null => {
            if (recursionStack.has(nodeUrl)) {
                // Found a cycle
                return [nodeUrl];
            }

            if (visited.has(nodeUrl)) {
                return null;
            }

            visited.add(nodeUrl);
            recursionStack.add(nodeUrl);

            const node = nodeMap.get(nodeUrl);
            if (node && node.children) {
                for (const childUrl of node.children) {
                    const cycle = hasCycle(childUrl);
                    if (cycle) {
                        recursionStack.delete(nodeUrl);
                        return [nodeUrl, ...cycle];
                    }
                }
            }

            recursionStack.delete(nodeUrl);
            return null;
        };

        for (const node of nodes) {
            if (!visited.has(node.url)) {
                const cycle = hasCycle(node.url);
                if (cycle && cycle.length > 1) {
                    issues.push({
                        severity: 'error',
                        type: 'circular_reference',
                        nodeUrl: node.url,
                        message: `Circular reference detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
                        details: {
                            cycle: cycle
                        },
                        suggestedFix: `Remove one of the relationships in the cycle to break the circular reference`
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Validate scraper ownership consistency
     */
    private async validateScraperOwnership(
        scraperId: string,
        nodes: NavigationNode[]
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const session = this.driver.session();

        try {
            // Check that all nodes are properly owned by the scraper or its ancestors
            const metadata = await this.versioning.getScraperMetadata(scraperId);
            if (!metadata) {
                issues.push({
                    severity: 'error',
                    type: 'scraper_not_registered',
                    scraperId,
                    message: `Scraper ${scraperId} is not registered`,
                    suggestedFix: `Register the scraper using UnifiedGraphSeeder.registerScraper()`
                });
                return issues;
            }

            // Get all nodes owned by this scraper and its ancestors
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})-[:OWNS]->(n:NavigationNode)
                RETURN n.url as url
            `, { scraperId });

            const ownedUrls = new Set(result.records.map(r => r.get('url')));

            // Check if any nodes in the graph are not owned
            for (const node of nodes) {
                if (!ownedUrls.has(node.url)) {
                    issues.push({
                        severity: 'warning',
                        type: 'unowned_node',
                        nodeUrl: node.url,
                        scraperId,
                        message: `Node ${node.url} is in the graph but not owned by scraper ${scraperId}`,
                        details: {
                            nodeUrl: node.url,
                            scraperId
                        },
                        suggestedFix: `Assign node ${node.url} to scraper ${scraperId} using assignNodeToScraper()`
                    });
                }
            }
        } finally {
            await session.close();
        }

        return issues;
    }

    /**
     * Validate data type consistency
     */
    private validateDataTypeConsistency(nodes: NavigationNode[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (const node of nodes) {
            // Validate type field
            if (node.type && !['page', 'section', 'document'].includes(node.type)) {
                issues.push({
                    severity: 'error',
                    type: 'invalid_type',
                    nodeUrl: node.url,
                    message: `Invalid node type: ${node.type}. Must be 'page', 'section', or 'document'`,
                    details: {
                        nodeUrl: node.url,
                        invalidType: node.type
                    },
                    suggestedFix: `Change node type to one of: 'page', 'section', 'document'`
                });
            }

            // Validate children is an array
            if (node.children && !Array.isArray(node.children)) {
                issues.push({
                    severity: 'error',
                    type: 'invalid_children',
                    nodeUrl: node.url,
                    message: `Children must be an array, got: ${typeof node.children}`,
                    details: {
                        nodeUrl: node.url,
                        childrenType: typeof node.children
                    },
                    suggestedFix: `Ensure children is an array of URLs`
                });
            }

            // Validate URL is a string
            if (typeof node.url !== 'string' || node.url.trim() === '') {
                issues.push({
                    severity: 'error',
                    type: 'invalid_url',
                    nodeUrl: node.url,
                    message: `URL must be a non-empty string`,
                    details: {
                        url: node.url,
                        urlType: typeof node.url
                    },
                    suggestedFix: `Provide a valid URL string`
                });
            }
        }

        return issues;
    }

    /**
     * Validate URL validity
     */
    private validateUrlValidity(nodes: NavigationNode[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (const node of nodes) {
            try {
                new URL(node.url);
            } catch {
                issues.push({
                    severity: 'warning',
                    type: 'invalid_url_format',
                    nodeUrl: node.url,
                    message: `URL is not a valid URL format: ${node.url}`,
                    details: {
                        nodeUrl: node.url
                    },
                    suggestedFix: `Ensure the URL follows a valid format (e.g., https://example.com/page)`
                });
            }
        }

        return issues;
    }

    /**
     * Validate multiple scrapers at once
     */
    async validateMultipleScrapers(scraperIds: string[]): Promise<Map<string, ValidationResult>> {
        const results = new Map<string, ValidationResult>();

        for (const scraperId of scraperIds) {
            try {
                const result = await this.validateScraperGraph(scraperId);
                results.set(scraperId, result);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.set(scraperId, {
                    isValid: false,
                    issues: [{
                        severity: 'error',
                        type: 'validation_error',
                        scraperId,
                        message: `Failed to validate scraper: ${errorMsg}`,
                        details: { error: errorMsg }
                    }],
                    summary: {
                        totalNodes: 0,
                        totalEdges: 0,
                        errors: 1,
                        warnings: 0,
                        info: 0
                    }
                });
            }
        }

        return results;
    }

    /**
     * Get a summary report of validation results
     */
    generateReport(results: Map<string, ValidationResult>): string {
        const lines: string[] = [];
        lines.push('='.repeat(80));
        lines.push('Graph Validation Report');
        lines.push('='.repeat(80));
        lines.push('');

        let totalErrors = 0;
        let totalWarnings = 0;
        let totalInfo = 0;

        for (const [scraperId, result] of results.entries()) {
            lines.push(`Scraper: ${scraperId}`);
            lines.push(`  Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
            lines.push(`  Nodes: ${result.summary.totalNodes}`);
            lines.push(`  Edges: ${result.summary.totalEdges}`);
            lines.push(`  Errors: ${result.summary.errors}`);
            lines.push(`  Warnings: ${result.summary.warnings}`);
            lines.push(`  Info: ${result.summary.info}`);
            lines.push('');

            if (result.issues.length > 0) {
                lines.push('  Issues:');
                for (const issue of result.issues) {
                    const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                    lines.push(`    ${icon} [${issue.type}] ${issue.message}`);
                    if (issue.nodeUrl) {
                        lines.push(`       Node: ${issue.nodeUrl}`);
                    }
                    if (issue.suggestedFix) {
                        lines.push(`       Fix: ${issue.suggestedFix}`);
                    }
                }
                lines.push('');
            }

            totalErrors += result.summary.errors;
            totalWarnings += result.summary.warnings;
            totalInfo += result.summary.info;
        }

        lines.push('='.repeat(80));
        lines.push(`Total: ${results.size} scrapers, ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfo} info`);
        lines.push('='.repeat(80));

        return lines.join('\n');
    }

    /**
     * Validate version consistency between Neo4j and file system
     */
    private async validateVersionConsistency(
        scraperId: string,
        nodes: NavigationNode[]
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const session = this.driver.session();

        try {
            // Get metadata from Neo4j
            const metadata = await this.versioning.getScraperMetadata(scraperId);
            if (!metadata) {
                return issues; // Already handled in scraper ownership validation
            }

            // Check if file-based version exists and matches
            // This is a simplified check - in production, you'd compare actual node counts
            const nodeCount = nodes.length;
            
            if (nodeCount === 0) {
                issues.push({
                    severity: 'warning',
                    type: 'empty_graph',
                    scraperId,
                    message: `Scraper ${scraperId} has no nodes in Neo4j`,
                    suggestedFix: 'Seed the scraper graph or pull from parent'
                });
            }

            // Note: Full file system sync validation would require GraphVersionManager
            // This is a basic check - full implementation would compare file-based version
        } finally {
            await session.close();
        }

        return issues;
    }

    /**
     * Validate schema.org URI uniqueness
     */
    private validateSchemaUriUniqueness(nodes: NavigationNode[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const uriMap = new Map<string, string[]>(); // URI -> URLs using it

        for (const node of nodes) {
            if (node.uri) {
                if (!uriMap.has(node.uri)) {
                    uriMap.set(node.uri, []);
                }
                uriMap.get(node.uri)!.push(node.url);
            }
        }

        // Check for duplicate URIs
        for (const [uri, urls] of uriMap.entries()) {
            if (urls.length > 1) {
                issues.push({
                    severity: 'warning',
                    type: 'duplicate_schema_uri',
                    message: `Schema URI ${uri} is used by ${urls.length} nodes`,
                    details: {
                        uri,
                        urls
                    },
                    suggestedFix: `Ensure each node has a unique schema.org URI. Consider generating new URIs for: ${urls.slice(1).join(', ')}`
                });
            }
        }

        return issues;
    }

    /**
     * Validate graph connectivity (detect disconnected components)
     */
    private validateGraphConnectivity(
        nodes: NavigationNode[]
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        
        if (nodes.length === 0) {
            return issues;
        }

        // Build reverse index: which nodes are children of which
        const childToParents = new Map<string, Set<string>>();
        for (const node of nodes) {
            if (node.children) {
                for (const childUrl of node.children) {
                    if (!childToParents.has(childUrl)) {
                        childToParents.set(childUrl, new Set());
                    }
                    childToParents.get(childUrl)!.add(node.url);
                }
            }
        }

        // Find all root nodes (nodes with no parents)
        const rootNodes = nodes.filter(node => !childToParents.has(node.url));
        
        if (rootNodes.length === 0) {
            // All nodes have parents - check for cycles (already done in circular references)
            return issues;
        }

        if (rootNodes.length > 1) {
            issues.push({
                severity: 'info',
                type: 'multiple_roots',
                message: `Graph has ${rootNodes.length} root nodes (disconnected components)`,
                details: {
                    rootCount: rootNodes.length,
                    rootUrls: rootNodes.map(n => n.url)
                },
                suggestedFix: 'Consider connecting root nodes or marking one as the primary root'
            });
        }

        // Check for isolated nodes (no parent, no children)
        const isolatedNodes = rootNodes.filter(node => 
            !node.children || node.children.length === 0
        );

        if (isolatedNodes.length > 0 && rootNodes.length > 1) {
            issues.push({
                severity: 'warning',
                type: 'isolated_nodes',
                message: `Found ${isolatedNodes.length} isolated nodes (no parent, no children)`,
                details: {
                    isolatedUrls: isolatedNodes.map(n => n.url)
                },
                suggestedFix: 'Connect isolated nodes to the main graph or remove them if not needed'
            });
        }

        return issues;
    }

    /**
     * Validate embedding vector consistency
     */
    private async validateEmbeddingVectors(
        scraperId: string,
        nodes: NavigationNode[]
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const session = this.driver.session();

        try {
            // Check embedding dimensions and consistency
            const result = await session.run(`
                MATCH (s:ScraperMetadata {scraperId: $scraperId})-[:OWNS]->(n:NavigationNode)
                WHERE n.embedding IS NOT NULL
                RETURN n.url as url, n.embedding as embedding
                LIMIT 100
            `, { scraperId });

            const expectedDimension = 384; // Standard embedding dimension
            const embeddingIssues: string[] = [];

            for (const record of result.records) {
                const url = record.get('url');
                const embedding = record.get('embedding');

                if (Array.isArray(embedding)) {
                    if (embedding.length !== expectedDimension) {
                        embeddingIssues.push(`${url} (dimension: ${embedding.length}, expected: ${expectedDimension})`);
                    }
                } else {
                    embeddingIssues.push(`${url} (not an array)`);
                }
            }

            if (embeddingIssues.length > 0) {
                issues.push({
                    severity: 'warning',
                    type: 'embedding_dimension_mismatch',
                    scraperId,
                    message: `Found ${embeddingIssues.length} nodes with inconsistent embedding dimensions`,
                    details: {
                        expectedDimension,
                        issues: embeddingIssues.slice(0, 10) // Limit to first 10
                    },
                    suggestedFix: 'Regenerate embeddings for affected nodes to ensure consistent dimensions'
                });
            }

            // Check if nodes without embeddings should have them
            const nodesWithoutEmbeddings = nodes.filter(n => !n.embedding || n.embedding.length === 0);
            if (nodesWithoutEmbeddings.length > 0 && nodes.length > 10) {
                // Only warn if there are many nodes and some lack embeddings
                issues.push({
                    severity: 'info',
                    type: 'missing_embeddings',
                    scraperId,
                    message: `${nodesWithoutEmbeddings.length} nodes are missing embedding vectors`,
                    details: {
                        totalNodes: nodes.length,
                        nodesWithoutEmbeddings: nodesWithoutEmbeddings.length
                    },
                    suggestedFix: 'Generate embeddings for nodes to enable semantic search'
                });
            }
        } finally {
            await session.close();
        }

        return issues;
    }
}
