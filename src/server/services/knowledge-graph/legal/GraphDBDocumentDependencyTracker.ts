/**
 * GraphDB Document Dependency Tracker Service
 * 
 * SPARQL-based implementation of document dependency tracking for GraphDB.
 * Tracks document dependencies by parsing citations, extracting references,
 * identifying overrides and amendments, and creating dependency graphs.
 */

import { PolicyDocument } from '../../../domain/ontology.js';
import { CitationParser, Citation } from './CitationParser.js';
import { logger } from '../../../utils/logger.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import type { GraphDBClient } from '../../../config/graphdb.js';
import {
  DocumentDependency,
  DependencyType,
  DependencyExtractionResult,
  DependencyQueryResult,
} from './DocumentDependencyTracker.js';

const PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX beleid: <https://schema.beleidsscan.nl/ontology#>
`;

const KG_GRAPH_URI = 'https://beleidsscan.nl/graph';

/**
 * GraphDB Document Dependency Tracker Service
 * 
 * Tracks document dependencies using SPARQL queries.
 */
export class GraphDBDocumentDependencyTracker {
  private client: GraphDBClient;
  private citationParser: CitationParser;
  private featureFlagEnabled: boolean = false;

  constructor(client: GraphDBClient) {
    this.client = client;
    this.citationParser = new CitationParser();
    this.checkFeatureFlag();
  }

  /**
   * Check if document dependency tracking is enabled.
   */
  private checkFeatureFlag(): void {
    this.featureFlagEnabled = FeatureFlag.isEnabled(
      KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED,
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
   * Extract dependencies from a document.
   */
  async extractDependencies(
    documentId: string,
    documentText: string,
    documentTitle?: string
  ): Promise<DependencyExtractionResult> {
    const startTime = Date.now();

    if (!this.isEnabled()) {
      return {
        dependencies: [],
        citationsParsed: 0,
        dependenciesExtracted: 0,
        extractionTime: Date.now() - startTime,
        success: false,
        error: 'Document dependency tracking is disabled',
      };
    }

    try {
      // Parse citations from document text
      const citationResult = await this.citationParser.parseCitations(
        documentText,
        documentId
      );

      // Extract dependencies from citations
      const dependencies = await this.extractDependenciesFromCitations(
        documentId,
        citationResult.citations,
        documentTitle
      );

      const extractionTime = Date.now() - startTime;

      logger.debug(
        `[GraphDBDocumentDependencyTracker] Extracted ${dependencies.length} dependencies from document ${documentId} in ${extractionTime}ms`
      );

      return {
        dependencies,
        citationsParsed: citationResult.totalCitations,
        dependenciesExtracted: dependencies.length,
        extractionTime,
        success: true,
      };
    } catch (error) {
      logger.error(
        { error },
        '[GraphDBDocumentDependencyTracker] Error extracting dependencies'
      );
      return {
        dependencies: [],
        citationsParsed: 0,
        dependenciesExtracted: 0,
        extractionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract dependencies from citations by matching them to existing documents.
   */
  private async extractDependenciesFromCitations(
    sourceDocumentId: string,
    citations: Citation[],
    sourceDocumentTitle?: string
  ): Promise<DocumentDependency[]> {
    const dependencies: DocumentDependency[] = [];

    for (const citation of citations) {
      // Try to match citation to existing document
      const matchedDocument = await this.matchCitationToDocument(citation);

      if (matchedDocument) {
        // Determine dependency type based on citation context
        const dependencyType = this.inferDependencyType(
          citation,
          sourceDocumentTitle
        );

        dependencies.push({
          sourceDocumentId,
          targetDocumentId: matchedDocument.id,
          dependencyType,
          confidence: citation.confidence * 0.8, // Reduce confidence for dependency inference
          citation,
          extractedAt: new Date(),
        });
      }
    }

    return dependencies;
  }

  /**
   * Match a citation to an existing document in the knowledge graph.
   */
  private async matchCitationToDocument(
    citation: Citation
  ): Promise<PolicyDocument | null> {
    // Try matching by document ID first (highest confidence)
    if (citation.documentId) {
      const document = await this.getDocumentById(citation.documentId);
      if (document) {
        return document;
      }
    }

    // Try matching by document title
    if (citation.documentTitle) {
      const document = await this.getDocumentByTitle(citation.documentTitle);
      if (document) {
        return document;
      }
    }

    // Try matching by URL if available
    if (citation.citationType === 'URL_REFERENCE' && citation.text) {
      const document = await this.getDocumentByUrl(citation.text);
      if (document) {
        return document;
      }
    }

    return null;
  }

  /**
   * Get document by ID.
   */
  private async getDocumentById(documentId: string): Promise<PolicyDocument | null> {
    const entityUri = this.entityUri(documentId);
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url
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
   * Get document by title.
   */
  private async getDocumentByTitle(title: string): Promise<PolicyDocument | null> {
    const titleLower = title.toLowerCase();
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity beleid:type "PolicyDocument" ;
            beleid:id ?id ;
            rdfs:label ?name .
    FILTER (LCASE(?name) = ${this.literal(titleLower)} || CONTAINS(LCASE(?name), ${this.literal(titleLower)}))
    OPTIONAL { ?entity dct:description ?description }
    OPTIONAL { ?entity beleid:metadata ?metadata }
    OPTIONAL { ?entity dct:identifier ?uri }
    OPTIONAL { ?entity beleid:schemaType ?schemaType }
    OPTIONAL { ?entity beleid:documentType ?documentType }
    OPTIONAL { ?entity beleid:jurisdiction ?jurisdiction }
    OPTIONAL { ?entity beleid:date ?date }
    OPTIONAL { ?entity beleid:status ?status }
    OPTIONAL { ?entity beleid:url ?url }
  }
}
ORDER BY 
  (IF(LCASE(?name) = ${this.literal(titleLower)}, 0, 1))
LIMIT 1
`;

    const results = await this.client.query(query);
    if (results.length === 0) {
      return null;
    }

    return this.rowToPolicyDocument(results[0]);
  }

  /**
   * Get document by URL.
   */
  private async getDocumentByUrl(url: string): Promise<PolicyDocument | null> {
    const query = `
${PREFIXES}
SELECT DISTINCT ?id ?name ?description ?metadata ?uri ?schemaType ?documentType ?jurisdiction ?date ?status ?url
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity beleid:type "PolicyDocument" ;
            beleid:id ?id ;
            rdfs:label ?name ;
            beleid:url ${this.literal(url)} .
    OPTIONAL { ?entity dct:description ?description }
    OPTIONAL { ?entity beleid:metadata ?metadata }
    OPTIONAL { ?entity dct:identifier ?uri }
    OPTIONAL { ?entity beleid:schemaType ?schemaType }
    OPTIONAL { ?entity beleid:documentType ?documentType }
    OPTIONAL { ?entity beleid:jurisdiction ?jurisdiction }
    OPTIONAL { ?entity beleid:date ?date }
    OPTIONAL { ?entity beleid:status ?status }
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
   * Infer dependency type from citation context.
   */
  private inferDependencyType(
    citation: Citation,
    sourceDocumentTitle?: string
  ): DependencyType {
    const text = (citation.text || '').toLowerCase();
    const title = (sourceDocumentTitle || '').toLowerCase();

    // Check for override keywords
    if (
      text.includes('override') ||
      text.includes('vervangt') ||
      text.includes('heft op') ||
      text.includes('intrekt')
    ) {
      return DependencyType.OVERRIDES;
    }

    // Check for amendment keywords
    if (
      text.includes('amend') ||
      text.includes('wijzig') ||
      text.includes('aanpass') ||
      text.includes('wijzigt')
    ) {
      return DependencyType.AMENDS;
    }

    // Check for refinement keywords
    if (
      text.includes('refine') ||
      text.includes('verfijn') ||
      text.includes('uitwerking') ||
      text.includes('uitwerkt')
    ) {
      return DependencyType.REFINES;
    }

    // Check for implementation keywords
    if (
      text.includes('implement') ||
      text.includes('implementeert') ||
      text.includes('uitvoering') ||
      text.includes('uitvoert')
    ) {
      return DependencyType.IMPLEMENTS;
    }

    // Default to reference
    return DependencyType.REFERENCES;
  }

  /**
   * Store dependencies in the knowledge graph.
   */
  async storeDependencies(
    dependencies: DocumentDependency[]
  ): Promise<{ stored: number; errors: number }> {
    if (!this.isEnabled()) {
      return { stored: 0, errors: dependencies.length };
    }

    let stored = 0;
    let errors = 0;

    for (const dependency of dependencies) {
      try {
        await this.storeDependency(dependency);
        stored++;
      } catch (error) {
        logger.error(
          { error, dependency },
          '[GraphDBDocumentDependencyTracker] Error storing dependency'
        );
        errors++;
      }
    }

    return { stored, errors };
  }

  /**
   * Store a single dependency.
   */
  private async storeDependency(dependency: DocumentDependency): Promise<void> {
    const sourceUri = this.entityUri(dependency.sourceDocumentId);
    const targetUri = this.entityUri(dependency.targetDocumentId);
    const dependencyUri = this.dependencyUri(
      dependency.sourceDocumentId,
      dependency.targetDocumentId,
      dependency.dependencyType
    );

    const dependencyJson = JSON.stringify({
      dependencyType: dependency.dependencyType,
      confidence: dependency.confidence,
      citation: dependency.citation,
      extractedAt: dependency.extractedAt.toISOString(),
    });

    const query = `
${PREFIXES}
INSERT {
  GRAPH <${KG_GRAPH_URI}> {
    <${dependencyUri}> a beleid:Dependency ;
                       beleid:source <${sourceUri}> ;
                       beleid:target <${targetUri}> ;
                       beleid:dependencyType ${this.literal(dependency.dependencyType)} ;
                       beleid:confidence ${dependency.confidence} ;
                       beleid:metadata ${this.literal(dependencyJson)} .
    <${sourceUri}> beleid:dependsOn <${targetUri}> .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${sourceUri}> beleid:id ${this.literal(dependency.sourceDocumentId)} .
    <${targetUri}> beleid:id ${this.literal(dependency.targetDocumentId)} .
  }
}
`;

    await this.client.query(query);
  }

  /**
   * Get dependencies for a document.
   */
  async getDependencies(documentId: string): Promise<DependencyQueryResult> {
    if (!this.isEnabled()) {
      return {
        documentId,
        dependencies: [],
        dependents: [],
        totalDependencies: 0,
        totalDependents: 0,
      };
    }

    const dependencies = await this.getDependenciesForDocument(documentId);
    const dependents = await this.getDependentsForDocument(documentId);

    return {
      documentId,
      dependencies,
      dependents,
      totalDependencies: dependencies.length,
      totalDependents: dependents.length,
    };
  }

  /**
   * Get dependencies for a document (documents it depends on).
   */
  private async getDependenciesForDocument(
    documentId: string
  ): Promise<DocumentDependency[]> {
    const entityUri = this.entityUri(documentId);
    const query = `
${PREFIXES}
SELECT ?targetId ?dependencyType ?confidence ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:dependsOn ?target .
    ?target beleid:id ?targetId .
    ?dep a beleid:Dependency ;
         beleid:source <${entityUri}> ;
         beleid:target ?target ;
         beleid:dependencyType ?dependencyType ;
         beleid:confidence ?confidence ;
         beleid:metadata ?metadata .
  }
}
`;

    const results = await this.client.query(query);
    return results.map(row => this.rowToDependency(documentId, row));
  }

  /**
   * Get dependents for a document (documents that depend on it).
   */
  private async getDependentsForDocument(
    documentId: string
  ): Promise<DocumentDependency[]> {
    const entityUri = this.entityUri(documentId);
    const query = `
${PREFIXES}
SELECT ?sourceId ?dependencyType ?confidence ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?source beleid:dependsOn <${entityUri}> .
    ?source beleid:id ?sourceId .
    ?dep a beleid:Dependency ;
         beleid:source ?source ;
         beleid:target <${entityUri}> ;
         beleid:dependencyType ?dependencyType ;
         beleid:confidence ?confidence ;
         beleid:metadata ?metadata .
  }
}
`;

    const results = await this.client.query(query);
    return results.map(row => this.rowToDependency(row.sourceId as string, row, true));
  }

  /**
   * Validate dependency integrity (detect cycles).
   */
  async validateDependencyIntegrity(): Promise<{
    isValid: boolean;
    cycles: Array<{ path: string[] }>;
    errors: string[];
  }> {
    if (!this.isEnabled()) {
      return { isValid: true, cycles: [], errors: [] };
    }

    // Get all dependencies
    const allDependencies = await this.getAllDependencies();
    
    // Build dependency graph
    const graph = new Map<string, string[]>();
    for (const dep of allDependencies) {
      if (!graph.has(dep.sourceDocumentId)) {
        graph.set(dep.sourceDocumentId, []);
      }
      graph.get(dep.sourceDocumentId)!.push(dep.targetDocumentId);
    }

    // Detect cycles
    const cycles = this.detectCycles(graph);
    const errors: string[] = [];

    if (cycles.length > 0) {
      errors.push(`Found ${cycles.length} dependency cycle(s)`);
    }

    return {
      isValid: cycles.length === 0,
      cycles,
      errors,
    };
  }

  /**
   * Get all dependencies.
   */
  private async getAllDependencies(): Promise<DocumentDependency[]> {
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?dependencyType ?confidence ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?dep a beleid:Dependency ;
         beleid:source ?source ;
         beleid:target ?target ;
         beleid:dependencyType ?dependencyType ;
         beleid:confidence ?confidence ;
         beleid:metadata ?metadata .
    ?source beleid:id ?sourceId .
    ?target beleid:id ?targetId .
  }
}
`;

    const results = await this.client.query(query);
    return results.map(row => this.rowToDependency(row.sourceId as string, row));
  }

  /**
   * Detect cycles in dependency graph.
   */
  private detectCycles(
    graph: Map<string, string[]>
  ): Array<{ path: string[] }> {
    const cycles: Array<{ path: string[] }> = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          cycles.push({ path: path.slice(cycleStart).concat(neighbor) });
        }
      }

      recStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Analyze impact of document changes.
   */
  async analyzeDocumentImpact(
    documentId: string,
    maxDepth: number = 3
  ): Promise<{
    affectedDocuments: string[];
    impactChain: Array<{ documentId: string; depth: number }>;
    totalAffected: number;
  }> {
    if (!this.isEnabled()) {
      return {
        affectedDocuments: [],
        impactChain: [],
        totalAffected: 0,
      };
    }

    const affected = new Set<string>();
    const impactChain: Array<{ documentId: string; depth: number }> = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: documentId, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.id);
      impactChain.push({ documentId: current.id, depth: current.depth });

      // Get all documents that depend on this one
      const dependents = await this.getDependentsForDocument(current.id);
      for (const dep of dependents) {
        if (!visited.has(dep.sourceDocumentId)) {
          affected.add(dep.sourceDocumentId);
          queue.push({ id: dep.sourceDocumentId, depth: current.depth + 1 });
        }
      }
    }

    return {
      affectedDocuments: Array.from(affected),
      impactChain,
      totalAffected: affected.size,
    };
  }

  /**
   * Generate impact report for a document.
   */
  async generateImpactReport(
    documentId: string,
    maxDepth: number = 3
  ): Promise<{
    documentId: string;
    impactAnalysis: {
      affectedDocuments: string[];
      impactChain: Array<{ documentId: string; depth: number }>;
      totalAffected: number;
    };
    dependencies: DocumentDependency[];
    dependents: DocumentDependency[];
  }> {
    const impactAnalysis = await this.analyzeDocumentImpact(documentId, maxDepth);
    const dependencies = await this.getDependenciesForDocument(documentId);
    const dependents = await this.getDependentsForDocument(documentId);

    return {
      documentId,
      impactAnalysis,
      dependencies,
      dependents,
    };
  }

  /**
   * Convert SPARQL result row to PolicyDocument.
   */
  private rowToPolicyDocument(row: Record<string, unknown>): PolicyDocument {
    return {
      id: row.id as string,
      type: 'PolicyDocument',
      name: (row.name as string) || '',
      description: row.description as string | undefined,
      metadata: row.metadata
        ? (typeof row.metadata === 'string'
            ? JSON.parse(row.metadata)
            : row.metadata) as Record<string, unknown>
        : undefined,
      uri: row.uri as string | undefined,
      schemaType: row.schemaType as string | undefined,
      documentType: (row.documentType as any) || 'Structure',
      jurisdiction: (row.jurisdiction as string) || '',
      date: (row.date as string) || new Date().toISOString(),
      status: (row.status as any) || 'Active',
      url: row.url as string | undefined,
    };
  }

  /**
   * Convert SPARQL result row to DocumentDependency.
   */
  private rowToDependency(
    sourceId: string,
    row: Record<string, unknown>,
    reverse: boolean = false
  ): DocumentDependency {
    const metadata = row.metadata
      ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
      : {};

    return {
      sourceDocumentId: reverse ? (row.sourceId as string) : sourceId,
      targetDocumentId: reverse ? sourceId : (row.targetId as string),
      dependencyType: (row.dependencyType as DependencyType) || DependencyType.REFERENCES,
      confidence: (row.confidence as number) || 0.5,
      citation: metadata.citation,
      extractedAt: metadata.extractedAt
        ? new Date(metadata.extractedAt)
        : new Date(),
    };
  }

  /**
   * Generate entity URI from ID.
   */
  private entityUri(id: string): string {
    return `https://beleidsscan.nl/entity/${encodeURIComponent(id)}`;
  }

  /**
   * Generate dependency URI.
   */
  private dependencyUri(
    sourceId: string,
    targetId: string,
    type: DependencyType
  ): string {
    return `https://beleidsscan.nl/dependency/${encodeURIComponent(sourceId)}-${encodeURIComponent(targetId)}-${type}`;
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

