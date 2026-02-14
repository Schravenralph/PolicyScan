/**
 * Impact Analysis Service
 * 
 * Analyzes the impact of document changes by traversing dependency graphs
 * and identifying affected documents.
 */

import { Driver } from 'neo4j-driver';
import { DependencyType } from './DocumentDependencyTracker.js';
import { logger } from '../../../utils/logger.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';

export interface ImpactAnalysis {
  documentId: string;
  affectedDocuments: AffectedDocument[];
  impactScore: number; // 0-1, higher = more impact
  totalAffected: number;
  analysisTime: number;
}

export interface AffectedDocument {
  documentId: string;
  documentName: string;
  dependencyPath: string[]; // Path from source to affected document
  impactLevel: ImpactLevel;
  dependencyType: DependencyType;
  confidence: number;
}

export enum ImpactLevel {
  DIRECT = 'DIRECT', // Direct dependency
  INDIRECT = 'INDIRECT', // Indirect dependency (through other documents)
  CRITICAL = 'CRITICAL', // Critical path (multiple dependencies)
}

export interface ImpactReport {
  documentId: string;
  analysis: ImpactAnalysis;
  recommendations: string[];
  generatedAt: Date;
}

/**
 * Service for analyzing impact of document changes.
 */
export class ImpactAnalysisService {
  private driver: Driver;
  private featureFlagEnabled: boolean = false;

  constructor(driver: Driver) {
    this.driver = driver;
    this.checkFeatureFlag();
  }

  /**
   * Check if impact analysis is enabled.
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
   * Analyze impact of changes to a document.
   */
  async analyzeImpact(
    documentId: string,
    maxDepth: number = 3
  ): Promise<ImpactAnalysis> {
    const startTime = Date.now();

    if (!this.isEnabled()) {
      return {
        documentId,
        affectedDocuments: [],
        impactScore: 0,
        totalAffected: 0,
        analysisTime: Date.now() - startTime,
      };
    }

    try {
      const affectedDocuments = await this.findAffectedDocuments(
        documentId,
        maxDepth
      );

      // Calculate impact score based on number and type of affected documents
      const impactScore = this.calculateImpactScore(affectedDocuments);

      const analysisTime = Date.now() - startTime;

      logger.debug(
        `[ImpactAnalysisService] Analyzed impact for document ${documentId}: ${affectedDocuments.length} affected documents, impact score: ${impactScore.toFixed(2)}`
      );

      return {
        documentId,
        affectedDocuments,
        impactScore,
        totalAffected: affectedDocuments.length,
        analysisTime,
      };
    } catch (error) {
      logger.error(
        { error },
        '[ImpactAnalysisService] Error analyzing impact'
      );
      return {
        documentId,
        affectedDocuments: [],
        impactScore: 0,
        totalAffected: 0,
        analysisTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Find all documents affected by changes to a source document.
   */
  private async findAffectedDocuments(
    sourceDocumentId: string,
    maxDepth: number
  ): Promise<AffectedDocument[]> {
    const session = this.driver.session();
    const affected: Map<string, AffectedDocument> = new Map();

    try {
      // Use BFS traversal to find all affected documents
      const visited = new Set<string>();
      const queue: Array<{
        documentId: string;
        path: string[];
        depth: number;
      }> = [{ documentId: sourceDocumentId, path: [], depth: 0 }];

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.depth >= maxDepth || visited.has(current.documentId)) {
          continue;
        }

        visited.add(current.documentId);

        // Find documents that depend on the current document
        const result = await session.run(
          `
          MATCH (source:Entity {id: $sourceId, type: 'PolicyDocument'})
          MATCH (target:Entity {type: 'PolicyDocument'})-[r:RELATES_TO]->(source)
          WHERE r.type IN ['OVERRIDES', 'REFINES', 'RELATED_TO']
          RETURN target.id AS targetId, target.name AS targetName, r
          `,
          { sourceId: current.documentId }
        );

        for (const record of result.records) {
          const targetId = record.get('targetId');
          const targetName = record.get('targetName');
          const rel = record.get('r');

          if (!visited.has(targetId)) {
            const dependencyType =
              (rel.properties.dependencyType as DependencyType) ||
              DependencyType.REFERENCES;
            const confidence = rel.properties.confidence || 0.5;
            const newPath = [...current.path, current.documentId];

            // Determine impact level
            const impactLevel =
              current.depth === 0
                ? ImpactLevel.DIRECT
                : current.depth === 1
                ? ImpactLevel.INDIRECT
                : ImpactLevel.CRITICAL;

            // Update or create affected document entry
            const existing = affected.get(targetId);
            if (!existing || current.depth < existing.dependencyPath.length) {
              affected.set(targetId, {
                documentId: targetId,
                documentName: targetName || targetId,
                dependencyPath: newPath,
                impactLevel,
                dependencyType,
                confidence,
              });

              // Add to queue for further traversal
              queue.push({
                documentId: targetId,
                path: newPath,
                depth: current.depth + 1,
              });
            }
          }
        }
      }
    } finally {
      await session.close();
    }

    return Array.from(affected.values());
  }

  /**
   * Calculate impact score based on affected documents.
   */
  private calculateImpactScore(
    affectedDocuments: AffectedDocument[]
  ): number {
    if (affectedDocuments.length === 0) {
      return 0;
    }

    let score = 0;

    for (const doc of affectedDocuments) {
      // Weight by impact level
      let weight = 1.0;
      switch (doc.impactLevel) {
        case ImpactLevel.DIRECT:
          weight = 1.0;
          break;
        case ImpactLevel.INDIRECT:
          weight = 0.7;
          break;
        case ImpactLevel.CRITICAL:
          weight = 1.5; // Higher weight for critical paths
          break;
      }

      // Weight by dependency type
      switch (doc.dependencyType) {
        case DependencyType.OVERRIDES:
          weight *= 1.2; // Overrides have high impact
          break;
        case DependencyType.AMENDS:
          weight *= 1.1;
          break;
        case DependencyType.IMPLEMENTS:
          weight *= 1.0;
          break;
        case DependencyType.REFINES:
          weight *= 0.9;
          break;
        case DependencyType.REFERENCES:
          weight *= 0.5; // References have lower impact
          break;
      }

      // Apply confidence
      weight *= doc.confidence;

      score += weight;
    }

    // Normalize to 0-1 range
    return Math.min(1.0, score / Math.max(1, affectedDocuments.length));
  }

  /**
   * Generate impact report with recommendations.
   */
  async generateImpactReport(
    documentId: string,
    maxDepth: number = 3
  ): Promise<ImpactReport> {
    const analysis = await this.analyzeImpact(documentId, maxDepth);
    const recommendations = this.generateRecommendations(analysis);

    return {
      documentId,
      analysis,
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate recommendations based on impact analysis.
   */
  private generateRecommendations(
    analysis: ImpactAnalysis
  ): string[] {
    const recommendations: string[] = [];

    if (analysis.totalAffected === 0) {
      recommendations.push(
        'No dependencies found. Document changes will not affect other documents.'
      );
      return recommendations;
    }

    if (analysis.impactScore > 0.7) {
      recommendations.push(
        'High impact detected. Review all affected documents before making changes.'
      );
    }

    const criticalCount = analysis.affectedDocuments.filter(
      (d) => d.impactLevel === ImpactLevel.CRITICAL
    ).length;

    if (criticalCount > 0) {
      recommendations.push(
        `${criticalCount} document(s) are on critical dependency paths. Changes may have cascading effects.`
      );
    }

    const overrideCount = analysis.affectedDocuments.filter(
      (d) => d.dependencyType === DependencyType.OVERRIDES
    ).length;

    if (overrideCount > 0) {
      recommendations.push(
        `${overrideCount} document(s) override this document. Changes may invalidate overrides.`
      );
    }

    if (analysis.totalAffected > 10) {
      recommendations.push(
        `Large number of affected documents (${analysis.totalAffected}). Consider phased rollout.`
      );
    }

    return recommendations;
  }

  /**
   * Compare impact of two document versions.
   */
  async compareImpact(
    documentId: string,
    _version1: string,
    _version2: string
  ): Promise<{
    version1Impact: ImpactAnalysis;
    version2Impact: ImpactAnalysis;
    difference: {
      newAffected: AffectedDocument[];
      removedAffected: AffectedDocument[];
      impactScoreChange: number;
    };
  }> {
    // This would require versioning support
    // For now, return analysis for current state
    const currentImpact = await this.analyzeImpact(documentId);

    return {
      version1Impact: currentImpact,
      version2Impact: currentImpact,
      difference: {
        newAffected: [],
        removedAffected: [],
        impactScoreChange: 0,
      },
    };
  }
}

