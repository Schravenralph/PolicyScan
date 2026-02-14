/**
 * Triplet Quality Assessment Service
 * 
 * Aggregates quality metrics from multiple sources to assess the quality of
 * knowledge graph triplets (relationships). Provides comprehensive quality
 * reports and recommendations.
 */

import type { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { FactValidator } from '../validators/FactValidator.js';
import { KGConfidenceScorer, type EntityScoringMetadata, type RelationshipScoringMetadata } from '../../graphrag/scoring/KGConfidenceScorer.js';
import { ReliabilityScorer, type SourceInfo } from '../fusion/ReliabilityScorer.js';
import { logger } from '../../../utils/logger.js';
import type { GraphDBClient } from '../../../config/graphdb.js';

const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';
const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX kg: <http://data.example.org/def/kg#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export interface TripletQualityScore {
  relationship: Relation;
  overallScore: number; // 0-1
  dimensions: {
    sourceAuthority: number;
    confidence: number;
    verification: number;
    temporalRelevance: number;
    graphConsistency: number;
    completeness: number;
  };
  issues: string[];
  recommendations: string[];
  qualityLevel: 'high' | 'medium' | 'low';
}

export interface QualityReport {
  timestamp: string;
  totalTriplets: number;
  qualityDistribution: {
    high: number; // >= 0.8
    medium: number; // 0.5-0.8
    low: number; // < 0.5
  };
  averageScore: number;
  lowQualityTriplets: TripletQualityScore[];
  dimensionAverages: {
    sourceAuthority: number;
    confidence: number;
    verification: number;
    temporalRelevance: number;
    graphConsistency: number;
    completeness: number;
  };
  recommendations: string[];
  sourceReliability: {
    official: number;
    unofficial: number;
    unknown: number;
  };
}

export class TripletQualityAssessmentService {
  private factValidator: FactValidator;
  private kgConfidenceScorer: KGConfidenceScorer;
  private reliabilityScorer: ReliabilityScorer;
  private kgService: KnowledgeGraphServiceInterface;
  private client: GraphDBClient;

  constructor(
    kgService: KnowledgeGraphServiceInterface,
    client: GraphDBClient
  ) {
    this.kgService = kgService;
    this.client = client;
    this.factValidator = new FactValidator(
      undefined, // documentService - will be lazy loaded if needed
      async (id: string) => {
        const rels = await this.kgService.getRelationshipsForEntity?.(id) || [];
        return rels.map((r: { sourceId: string; targetId: string; type: RelationType }) => ({ sourceId: r.sourceId, targetId: r.targetId, type: r.type }));
      },
      async (id: string) => {
        const rels = await this.kgService.getIncomingRelationships?.(id) || [];
        return rels.map((r: { sourceId: string; targetId: string; type: RelationType }) => ({ sourceId: r.sourceId, targetId: r.targetId, type: r.type }));
      }
    );
    this.kgConfidenceScorer = new KGConfidenceScorer();
    this.reliabilityScorer = new ReliabilityScorer();
  }

  /**
   * Assess quality of a single triplet (relationship)
   */
  async assessTriplet(relationship: Relation, sourceEntity?: BaseEntity, targetEntity?: BaseEntity): Promise<TripletQualityScore> {
    // Get entities if not provided
    if (!sourceEntity) {
      sourceEntity = await this.kgService.getNode(relationship.sourceId);
    }
    if (!targetEntity) {
      targetEntity = await this.kgService.getNode(relationship.targetId);
    }

    if (!sourceEntity || !targetEntity) {
      return {
        relationship,
        overallScore: 0,
        dimensions: {
          sourceAuthority: 0,
          confidence: 0,
          verification: 0,
          temporalRelevance: 0,
          graphConsistency: 0,
          completeness: 0,
        },
        issues: ['Source or target entity not found'],
        recommendations: ['Verify entity IDs exist in knowledge graph'],
        qualityLevel: 'low',
      };
    }

    // 1. Fact validation
    const factValidation = await this.factValidator.validateFact(relationship);
    const confidence = factValidation.confidence;
    const verification = factValidation.issues.length === 0 ? 1.0 : Math.max(0, 1.0 - factValidation.issues.length * 0.2);

    // 2. Source authority
    const sourceAuthority = this.calculateSourceAuthority(relationship, sourceEntity);

    // 3. Temporal relevance
    const temporalRelevance = this.calculateTemporalRelevance(relationship, sourceEntity);

    // 4. Graph consistency
    const graphConsistency = await this.calculateGraphConsistency(relationship, sourceEntity, targetEntity);

    // 5. Completeness
    const completeness = this.calculateCompleteness(relationship);

    // Calculate overall score (weighted average)
    const overallScore = (
      sourceAuthority * 0.25 +
      confidence * 0.25 +
      verification * 0.20 +
      temporalRelevance * 0.10 +
      graphConsistency * 0.10 +
      completeness * 0.10
    );

    // Determine quality level
    const qualityLevel: 'high' | 'medium' | 'low' = 
      overallScore >= 0.8 ? 'high' :
      overallScore >= 0.5 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      sourceAuthority,
      confidence,
      verification,
      temporalRelevance,
      graphConsistency,
      completeness,
      overallScore,
    });

    return {
      relationship,
      overallScore: Math.max(0, Math.min(1, overallScore)),
      dimensions: {
        sourceAuthority,
        confidence,
        verification,
        temporalRelevance,
        graphConsistency,
        completeness,
      },
      issues: factValidation.issues,
      recommendations,
      qualityLevel,
    };
  }

  /**
   * Assess quality of all triplets in the knowledge graph
   */
  async assessAllTriplets(): Promise<TripletQualityScore[]> {
    logger.info('Starting comprehensive triplet quality assessment...');
    
    const allRelationships = await this.getAllRelationships();
    const allEntities = await this.kgService.getAllNodes();
    const entityMap = new Map<string, BaseEntity>();
    allEntities.forEach(e => entityMap.set(e.id, e));

    const scores: TripletQualityScore[] = [];
    const batchSize = 50;

    for (let i = 0; i < allRelationships.length; i += batchSize) {
      const batch = allRelationships.slice(i, i + batchSize);
      
      const batchScores = await Promise.all(
        batch.map(async (rel) => {
          const sourceEntity = entityMap.get(rel.sourceId);
          const targetEntity = entityMap.get(rel.targetId);
          
          const relationship: Relation = {
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            metadata: {}, // Will be enriched from graph if available
          };

          return this.assessTriplet(relationship, sourceEntity, targetEntity);
        })
      );

      scores.push(...batchScores);
      
      if ((i + batchSize) % 500 === 0) {
        logger.info({ processed: i + batchSize, total: allRelationships.length }, 'Progress on triplet assessment');
      }
    }

    logger.info({ total: scores.length }, 'Completed triplet quality assessment');
    return scores;
  }

  /**
   * Generate comprehensive quality report
   */
  async generateQualityReport(): Promise<QualityReport> {
    const scores = await this.assessAllTriplets();

    const qualityDistribution = {
      high: scores.filter(s => s.qualityLevel === 'high').length,
      medium: scores.filter(s => s.qualityLevel === 'medium').length,
      low: scores.filter(s => s.qualityLevel === 'low').length,
    };

    const averageScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
      : 0;

    const dimensionAverages = {
      sourceAuthority: this.averageDimension(scores, 'sourceAuthority'),
      confidence: this.averageDimension(scores, 'confidence'),
      verification: this.averageDimension(scores, 'verification'),
      temporalRelevance: this.averageDimension(scores, 'temporalRelevance'),
      graphConsistency: this.averageDimension(scores, 'graphConsistency'),
      completeness: this.averageDimension(scores, 'completeness'),
    };

    const lowQualityTriplets = scores
      .filter(s => s.qualityLevel === 'low')
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, 100); // Top 100 lowest quality

    const recommendations = this.generateGlobalRecommendations(scores, dimensionAverages);

    const sourceReliability = this.analyzeSourceReliability(scores);

    return {
      timestamp: new Date().toISOString(),
      totalTriplets: scores.length,
      qualityDistribution,
      averageScore,
      lowQualityTriplets,
      dimensionAverages,
      recommendations,
      sourceReliability,
    };
  }

  /**
   * Calculate source authority score
   */
  private calculateSourceAuthority(relationship: Relation, sourceEntity: BaseEntity): number {
    const sourceUrl = relationship.metadata?.source as string | undefined;
    if (!sourceUrl) {
      return 0.5; // Unknown source gets medium score
    }

    const sourceInfo: SourceInfo = {
      url: sourceUrl,
      entityId: sourceEntity.id,
      entityType: sourceEntity.type,
    };

    const reliabilityScore = this.reliabilityScorer.calculateScore(sourceInfo, sourceEntity, [sourceInfo]);
    return reliabilityScore.authority;
  }

  /**
   * Calculate temporal relevance score
   */
  private calculateTemporalRelevance(relationship: Relation, sourceEntity: BaseEntity): number {
    const effectiveDate = relationship.metadata?.effectiveDate as string | undefined;
    if (!effectiveDate) {
      return 0.5; // Unknown date gets medium score
    }

    try {
      const date = new Date(effectiveDate);
      if (isNaN(date.getTime())) {
        return 0.5;
      }

      const now = new Date();
      const daysOld = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      
      // Exponential decay: newer = higher score
      const score = Math.exp(-daysOld / 365);
      return Math.max(0.1, Math.min(1.0, score));
    } catch {
      return 0.5;
    }
  }

  /**
   * Calculate graph consistency score
   */
  private async calculateGraphConsistency(
    relationship: Relation,
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<number> {
    try {
      // Check if this relationship type is common between these entity types
      const sourceRelationships = await this.kgService.getRelationshipsForEntity?.(sourceEntity.id) || [];
      const sameTypeCount = sourceRelationships.filter((r: { sourceId: string; targetId: string; type: RelationType }) => r.type === relationship.type).length;
      
      // If this relationship type appears frequently, it's more consistent
      const consistencyScore = Math.min(1.0, sameTypeCount / 10);
      
      return consistencyScore;
    } catch {
      return 0.5;
    }
  }

  /**
   * Calculate completeness score
   */
  private calculateCompleteness(relationship: Relation): number {
    let score = 0;
    let maxScore = 0;

    // Required fields
    maxScore += 2;
    if (relationship.sourceId) score += 1;
    if (relationship.targetId) score += 1;

    // Optional but valuable fields
    maxScore += 3;
    if (relationship.metadata?.source) score += 1;
    if (relationship.metadata?.effectiveDate) score += 1;
    if (relationship.metadata && Object.keys(relationship.metadata).length > 2) score += 1;

    return maxScore > 0 ? score / maxScore : 0.5;
  }

  /**
   * Generate recommendations for a triplet
   */
  private generateRecommendations(dimensions: {
    sourceAuthority: number;
    confidence: number;
    verification: number;
    temporalRelevance: number;
    graphConsistency: number;
    completeness: number;
    overallScore: number;
  }): string[] {
    const recommendations: string[] = [];

    if (dimensions.sourceAuthority < 0.5) {
      recommendations.push('Find authoritative source (official government website)');
    }

    if (dimensions.confidence < 0.5) {
      recommendations.push('Verify relationship with additional sources');
    }

    if (dimensions.verification < 0.5) {
      recommendations.push('Cross-reference with other documents');
    }

    if (dimensions.temporalRelevance < 0.3) {
      recommendations.push('Update with more recent information');
    }

    if (dimensions.completeness < 0.5) {
      recommendations.push('Add metadata (source, effective date, etc.)');
    }

    if (dimensions.overallScore < 0.5) {
      recommendations.push('Consider removing or flagging for manual review');
    }

    return recommendations;
  }

  /**
   * Generate global recommendations based on overall quality
   */
  private generateGlobalRecommendations(
    scores: TripletQualityScore[],
    dimensionAverages: QualityReport['dimensionAverages']
  ): string[] {
    const recommendations: string[] = [];

    if (dimensionAverages.sourceAuthority < 0.6) {
      recommendations.push('Focus on enriching relationships with official government sources');
    }

    if (dimensionAverages.confidence < 0.6) {
      recommendations.push('Improve entity extraction confidence through better validation');
    }

    if (dimensionAverages.verification < 0.6) {
      recommendations.push('Increase cross-reference validation for relationships');
    }

    if (dimensionAverages.completeness < 0.6) {
      recommendations.push('Enrich relationships with additional metadata');
    }

    const lowQualityRatio = scores.filter(s => s.qualityLevel === 'low').length / scores.length;
    if (lowQualityRatio > 0.2) {
      recommendations.push(`Review ${Math.round(lowQualityRatio * 100)}% of low-quality triplets`);
    }

    return recommendations;
  }

  /**
   * Analyze source reliability distribution
   */
  private analyzeSourceReliability(scores: TripletQualityScore[]): {
    official: number;
    unofficial: number;
    unknown: number;
  } {
    let official = 0;
    let unofficial = 0;
    let unknown = 0;

    for (const score of scores) {
      const auth = score.dimensions.sourceAuthority;
      if (auth >= 0.8) {
        official++;
      } else if (auth >= 0.5) {
        unofficial++;
      } else {
        unknown++;
      }
    }

    return { official, unofficial, unknown };
  }

  /**
   * Calculate average for a dimension
   */
  private averageDimension(scores: TripletQualityScore[], dimension: keyof TripletQualityScore['dimensions']): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s.dimensions[dimension], 0) / scores.length;
  }

  /**
   * Get all relationships from the knowledge graph
   */
  private async getAllRelationships(): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
    const query = `
${PREFIXES}
SELECT ?sourceId ?targetId ?relationType ?metadata
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    ?rel a beleid:Relation ;
         beleid:source ?s ;
         beleid:target ?t ;
         beleid:relationType ?relationType .
    ?s beleid:id ?sourceId .
    ?t beleid:id ?targetId .
    OPTIONAL { ?rel beleid:metadata ?metadata }
  }
}
`;

    const results = await this.client.query(query);
    return results.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.relationType as RelationType,
    }));
  }
}
