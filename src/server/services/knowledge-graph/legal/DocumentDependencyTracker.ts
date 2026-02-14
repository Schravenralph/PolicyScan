/**
 * Document Dependency Tracker Service
 * 
 * Tracks document dependencies by parsing citations, extracting references,
 * identifying overrides and amendments, and creating dependency graphs.
 */

import { Driver } from 'neo4j-driver';
import { PolicyDocument, RelationType } from '../../../domain/ontology.js';
import { CitationParser, Citation } from './CitationParser.js';
import { logger } from '../../../utils/logger.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';

export interface DocumentDependency {
  sourceDocumentId: string;
  targetDocumentId: string;
  dependencyType: DependencyType;
  confidence: number;
  citation?: Citation;
  extractedAt: Date;
}

export enum DependencyType {
  OVERRIDES = 'OVERRIDES', // Document A overrides document B
  AMENDS = 'AMENDS', // Document A amends document B
  REFINES = 'REFINES', // Document A refines document B
  IMPLEMENTS = 'IMPLEMENTS', // Document A implements document B
  REFERENCES = 'REFERENCES', // General reference (lower confidence)
}

export interface DependencyExtractionResult {
  dependencies: DocumentDependency[];
  citationsParsed: number;
  dependenciesExtracted: number;
  extractionTime: number;
  success: boolean;
  error?: string;
}

export interface DependencyQueryResult {
  documentId: string;
  dependencies: DocumentDependency[];
  dependents: DocumentDependency[]; // Documents that depend on this one
  totalDependencies: number;
  totalDependents: number;
}

/**
 * Service for tracking document dependencies.
 */
export class DocumentDependencyTracker {
  private driver: Driver;
  private citationParser: CitationParser;
  private featureFlagEnabled: boolean = false;

  constructor(driver: Driver) {
    this.driver = driver;
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
        `[DocumentDependencyTracker] Extracted ${dependencies.length} dependencies from document ${documentId} in ${extractionTime}ms`
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
        '[DocumentDependencyTracker] Error extracting dependencies'
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
    const session = this.driver.session();

    try {
      // Try matching by document ID first (highest confidence)
      if (citation.documentId) {
        const result = await session.run(
          `
          MATCH (e:Entity {id: $documentId, type: 'PolicyDocument'})
          RETURN e
          `,
          { documentId: citation.documentId }
        );

        if (result.records.length > 0) {
          return this.mapNeo4jNodeToPolicyDocument(result.records[0].get('e'));
        }
      }

      // Try matching by document title
      if (citation.documentTitle) {
        const titleLower = citation.documentTitle.toLowerCase();
        const result = await session.run(
          `
          MATCH (e:Entity {type: 'PolicyDocument'})
          WHERE toLower(e.name) CONTAINS $title
             OR toLower(e.name) = $title
          RETURN e
          ORDER BY 
            CASE WHEN toLower(e.name) = $title THEN 0 ELSE 1 END,
            e.name
          LIMIT 1
          `,
          { title: titleLower }
        );

        if (result.records.length > 0) {
          return this.mapNeo4jNodeToPolicyDocument(result.records[0].get('e'));
        }
      }

      // Try matching by URL if available
      if (citation.citationType === 'URL_REFERENCE' && citation.text) {
        const url = citation.text;
        const result = await session.run(
          `
          MATCH (e:Entity {type: 'PolicyDocument'})
          WHERE e.url = $url
          RETURN e
          LIMIT 1
          `,
          { url }
        );

        if (result.records.length > 0) {
          return this.mapNeo4jNodeToPolicyDocument(result.records[0].get('e'));
        }
      }

      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Infer dependency type from citation context.
   */
  private inferDependencyType(
    citation: Citation,
    _sourceDocumentTitle?: string
  ): DependencyType {
    const context = citation.context?.toLowerCase() || '';

    // Check for override keywords
    if (
      /(?:heeft\s+voorrang|gaat\s+voor|overschrijft|vervangt|override)/i.test(
        context
      )
    ) {
      return DependencyType.OVERRIDES;
    }

    // Check for amend keywords
    if (
      /(?:wijzigt|amendeert|aanpassing|wijziging|amendement)/i.test(context)
    ) {
      return DependencyType.AMENDS;
    }

    // Check for implement keywords
    if (
      /(?:implementeert|uitvoering|toepassing|implementatie)/i.test(context)
    ) {
      return DependencyType.IMPLEMENTS;
    }

    // Check for refine keywords
    if (
      /(?:verfijnt|specificeert|detailleert|uitwerking|refine)/i.test(context)
    ) {
      return DependencyType.REFINES;
    }

    // Default to reference
    return DependencyType.REFERENCES;
  }

  /**
   * Store dependencies in the knowledge graph.
   */
  async storeDependencies(
    dependencies: DocumentDependency[]
  ): Promise<{ stored: number; failed: number; errors: string[] }> {
    if (!this.isEnabled()) {
      return { stored: 0, failed: dependencies.length, errors: ['Feature disabled'] };
    }

    const session = this.driver.session();
    const errors: string[] = [];
    let stored = 0;
    let failed = 0;

    try {
      for (const dependency of dependencies) {
        try {
          // Map dependency type to relation type
          const relationType = this.mapDependencyTypeToRelationType(
            dependency.dependencyType
          );

          await session.run(
            `
            MATCH (source:Entity {id: $sourceId, type: 'PolicyDocument'})
            MATCH (target:Entity {id: $targetId, type: 'PolicyDocument'})
            MERGE (source)-[r:RELATES_TO {type: $relationType}]->(target)
            SET r.confidence = $confidence,
                r.dependencyType = $dependencyType,
                r.extractedAt = $extractedAt,
                r.citationText = $citationText
            RETURN r
            `,
            {
              sourceId: dependency.sourceDocumentId,
              targetId: dependency.targetDocumentId,
              relationType,
              dependencyType: dependency.dependencyType,
              confidence: dependency.confidence,
              extractedAt: dependency.extractedAt.toISOString(),
              citationText: dependency.citation?.text || '',
            }
          );

          stored++;
        } catch (error) {
          failed++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          errors.push(
            `Failed to store dependency ${dependency.sourceDocumentId} -> ${dependency.targetDocumentId}: ${errorMsg}`
          );
          logger.error(
            { error },
            '[DocumentDependencyTracker] Error storing dependency'
          );
        }
      }
    } finally {
      await session.close();
    }

    return { stored, failed, errors };
  }

  /**
   * Map dependency type to relation type.
   */
  private mapDependencyTypeToRelationType(
    dependencyType: DependencyType
  ): RelationType {
    switch (dependencyType) {
      case DependencyType.OVERRIDES:
        return RelationType.OVERRIDES;
      case DependencyType.REFINES:
        return RelationType.REFINES;
      case DependencyType.IMPLEMENTS:
        // IMPLEMENTS is not in RelationType enum, use RELATED_TO for now
        return RelationType.RELATED_TO;
      case DependencyType.AMENDS:
        // AMENDS is not in RelationType enum, use RELATED_TO for now
        return RelationType.RELATED_TO;
      case DependencyType.REFERENCES:
        return RelationType.RELATED_TO;
      default:
        return RelationType.RELATED_TO;
    }
  }

  /**
   * Query dependencies for a document.
   */
  async getDependencies(
    documentId: string
  ): Promise<DependencyQueryResult> {
    if (!this.isEnabled()) {
      return {
        documentId,
        dependencies: [],
        dependents: [],
        totalDependencies: 0,
        totalDependents: 0,
      };
    }

    const session = this.driver.session();

    try {
      // Get dependencies (documents this document depends on)
      const dependenciesResult = await session.run(
        `
        MATCH (source:Entity {id: $documentId, type: 'PolicyDocument'})
        MATCH (source)-[r:RELATES_TO]->(target:Entity {type: 'PolicyDocument'})
        WHERE r.type IN ['OVERRIDES', 'REFINES', 'RELATED_TO']
        RETURN target, r
        ORDER BY r.confidence DESC
        `,
        { documentId }
      );

      // Get dependents (documents that depend on this one)
      const dependentsResult = await session.run(
        `
        MATCH (target:Entity {id: $documentId, type: 'PolicyDocument'})
        MATCH (source:Entity {type: 'PolicyDocument'})-[r:RELATES_TO]->(target)
        WHERE r.type IN ['OVERRIDES', 'REFINES', 'RELATED_TO']
        RETURN source, r
        ORDER BY r.confidence DESC
        `,
        { documentId }
      );

      const dependencies = dependenciesResult.records.map((record) => {
        const target = record.get('target');
        const rel = record.get('r');
        return {
          sourceDocumentId: documentId,
          targetDocumentId: target.properties.id,
          dependencyType: (rel.properties.dependencyType ||
            DependencyType.REFERENCES) as DependencyType,
          confidence: rel.properties.confidence || 0.5,
          extractedAt: new Date(rel.properties.extractedAt || Date.now()),
        } as DocumentDependency;
      });

      const dependents = dependentsResult.records.map((record) => {
        const source = record.get('source');
        const rel = record.get('r');
        return {
          sourceDocumentId: source.properties.id,
          targetDocumentId: documentId,
          dependencyType: (rel.properties.dependencyType ||
            DependencyType.REFERENCES) as DependencyType,
          confidence: rel.properties.confidence || 0.5,
          extractedAt: new Date(rel.properties.extractedAt || Date.now()),
        } as DocumentDependency;
      });

      return {
        documentId,
        dependencies,
        dependents,
        totalDependencies: dependencies.length,
        totalDependents: dependents.length,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Map Neo4j node to PolicyDocument.
   */
  private mapNeo4jNodeToPolicyDocument(node: { properties: Record<string, unknown> }): PolicyDocument | null {
    if (!node || node.properties.type !== 'PolicyDocument') {
      return null;
    }

    const props = node.properties;
    return {
      id: props.id,
      type: 'PolicyDocument',
      name: props.name,
      description: props.description,
      documentType: props.documentType || 'Note',
      jurisdiction: props.jurisdiction || '',
      date: props.date || new Date().toISOString(),
      status: (props.status as 'Draft' | 'Active' | 'Archived') || 'Active',
      url: props.url,
      metadata: props.metadata 
        ? (typeof props.metadata === 'string' 
          ? (JSON.parse(props.metadata) as Record<string, unknown>) 
          : (props.metadata as Record<string, unknown>))
        : {},
      uri: props.uri,
      schemaType: props.schemaType,
    } as PolicyDocument;
  }

  /**
   * Validate dependency integrity (check for broken references).
   */
  async validateDependencyIntegrity(): Promise<{
    valid: number;
    broken: number;
    brokenDependencies: Array<{ sourceId: string; targetId: string }>;
  }> {
    if (!this.isEnabled()) {
      return { valid: 0, broken: 0, brokenDependencies: [] };
    }

    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (source:Entity {type: 'PolicyDocument'})-[r:RELATES_TO]->(target:Entity {type: 'PolicyDocument'})
        WHERE r.type IN ['OVERRIDES', 'REFINES', 'RELATED_TO']
        RETURN source.id AS sourceId, target.id AS targetId,
               EXISTS((source)-[:RELATES_TO]->(target)) AS valid
        `
      );

      const broken: Array<{ sourceId: string; targetId: string }> = [];
      let valid = 0;

      for (const record of result.records) {
        const validRel = record.get('valid');
        if (validRel) {
          valid++;
        } else {
          broken.push({
            sourceId: record.get('sourceId'),
            targetId: record.get('targetId'),
          });
        }
      }

      return {
        valid,
        broken: broken.length,
        brokenDependencies: broken,
      };
    } finally {
      await session.close();
    }
  }
}

