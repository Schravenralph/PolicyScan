/**
 * Active Learning Service for Semantic Labeling
 * 
 * Manages the feedback loop for improving semantic label quality:
 * - Collects feedback on generated labels
 * - Identifies uncertain labels needing review
 * - Learns from feedback to improve future label generation
 * - Prioritizes labels for human review
 */

import { LabelFeedback, LabelFeedbackCreateInput } from '../../models/LabelFeedback.js';
import { CommunityLabel } from '../../models/CommunityLabel.js';
import { logger } from '../../utils/logger.js';

export interface UncertaintyScore {
  score: number; // 0-1, higher = more uncertain
  reasons: string[];
}

export interface LabelGenerationContext {
  clusterId: string;
  entities: Array<{ id: string; name: string; type: string }>;
  label: string;
  labelingMethod: 'llm' | 'heuristic';
  qualityScore?: number;
  entityCount: number;
  entityTypes: string[];
  domain?: string;
}

export interface LearningInsights {
  commonIssues: Array<{ issue: string; count: number }>;
  improvementSuggestions: string[];
  averageRating: number;
  accuracyRate: number;
  relevanceRate: number;
}

export class ActiveLearningService {
  /**
   * Calculate uncertainty score for a generated label
   */
  calculateUncertainty(context: LabelGenerationContext): UncertaintyScore {
    const reasons: string[] = [];
    let uncertaintyScore = 0;

    // Factor 1: Labeling method (heuristic is more uncertain than LLM)
    if (context.labelingMethod === 'heuristic') {
      uncertaintyScore += 0.3;
      reasons.push('Heuristic-based labeling (less reliable than LLM)');
    }

    // Factor 2: Quality score (if available, lower = more uncertain)
    if (context.qualityScore !== undefined) {
      const qualityUncertainty = 1 - context.qualityScore;
      uncertaintyScore += qualityUncertainty * 0.3;
      if (context.qualityScore < 0.7) {
        reasons.push(`Low quality score: ${context.qualityScore.toFixed(2)}`);
      }
    }

    // Factor 3: Entity diversity (more diverse = potentially more uncertain)
    const uniqueTypes = new Set(context.entityTypes).size;
    const diversityRatio = uniqueTypes / Math.max(context.entityCount, 1);
    if (diversityRatio > 0.7) {
      uncertaintyScore += 0.2;
      reasons.push('High entity type diversity');
    }

    // Factor 4: Entity count (very small or very large clusters can be uncertain)
    if (context.entityCount < 3) {
      uncertaintyScore += 0.15;
      reasons.push('Very small cluster (few entities)');
    } else if (context.entityCount > 100) {
      uncertaintyScore += 0.1;
      reasons.push('Very large cluster (many entities)');
    }

    // Factor 5: Label length (very short or very long can indicate uncertainty)
    if (context.label.length < 5) {
      uncertaintyScore += 0.1;
      reasons.push('Very short label');
    } else if (context.label.length > 50) {
      uncertaintyScore += 0.05;
      reasons.push('Very long label');
    }

    // Normalize to 0-1 range
    uncertaintyScore = Math.min(1, Math.max(0, uncertaintyScore));

    return {
      score: uncertaintyScore,
      reasons: reasons.length > 0 ? reasons : ['No specific uncertainty factors identified'],
    };
  }

  /**
   * Record feedback on a label
   */
  async recordFeedback(
    clusterId: string,
    feedback: {
      rating: number;
      accurate: boolean;
      relevant: boolean;
      suggestedLabel?: string;
      comment?: string;
    },
    context: LabelGenerationContext,
    userId?: string
  ): Promise<string> {
    const uncertainty = this.calculateUncertainty(context);

    const feedbackData: LabelFeedbackCreateInput = {
      clusterId,
      label: context.label,
      originalLabel: context.label,
      feedback,
      uncertainty,
      metadata: {
        entityCount: context.entityCount,
        entityTypes: context.entityTypes,
        domain: context.domain,
        labelingMethod: context.labelingMethod,
        qualityScore: context.qualityScore,
      },
      userId,
    };

    const result = await LabelFeedback.create(feedbackData);

    // Update CommunityLabel with feedback if it exists
    try {
      const communityLabel = await CommunityLabel.findByClusterId(clusterId);
      if (communityLabel) {
        await CommunityLabel.upsert(clusterId, {
          clusterId,
          label: communityLabel.label, // Keep existing label
          summary: communityLabel.summary,
          communityHash: communityLabel.communityHash,
          hierarchy: communityLabel.hierarchy,
          metadata: communityLabel.metadata,
          quality: {
            score: feedback.rating / 5, // Normalize to 0-1
            validated: feedback.rating >= 4, // Consider validated if rating >= 4
            validatedBy: userId,
          },
        });
      }
    } catch (error) {
      logger.warn(`[ActiveLearning] Failed to update CommunityLabel: ${error}`);
    }

    logger.info(`[ActiveLearning] Recorded feedback for cluster ${clusterId}: rating=${feedback.rating}, accurate=${feedback.accurate}`);

    return result._id?.toString() || '';
  }

  /**
   * Get labels that need review (high uncertainty or low ratings)
   */
  async getReviewQueue(options: {
    limit?: number;
    minUncertaintyScore?: number;
    maxRating?: number;
  } = {}): Promise<LabelFeedbackDocument[]> {
    return await LabelFeedback.getReviewQueue(options);
  }

  /**
   * Get learning insights from collected feedback
   */
  async getLearningInsights(): Promise<LearningInsights> {
    const stats = await LabelFeedback.getStatistics();

    // Analyze common issues from feedback
    const allFeedback = await LabelFeedback.findAll({ limit: 1000 });
    const commonIssues: Array<{ issue: string; count: number }> = [];

    // Count issues based on comments and ratings
    const issueCounts = new Map<string, number>();
    allFeedback.forEach(f => {
      if (f.feedback.rating <= 2) {
        issueCounts.set('Low rating', (issueCounts.get('Low rating') || 0) + 1);
      }
      if (!f.feedback.accurate) {
        issueCounts.set('Inaccurate label', (issueCounts.get('Inaccurate label') || 0) + 1);
      }
      if (!f.feedback.relevant) {
        issueCounts.set('Irrelevant label', (issueCounts.get('Irrelevant label') || 0) + 1);
      }
      if (f.uncertainty && f.uncertainty.score > 0.7) {
        issueCounts.set('High uncertainty', (issueCounts.get('High uncertainty') || 0) + 1);
      }
    });

    commonIssues.push(
      ...Array.from(issueCounts.entries()).map(([issue, count]) => ({ issue, count }))
    );
    commonIssues.sort((a, b) => b.count - a.count);

    // Generate improvement suggestions
    const improvementSuggestions: string[] = [];
    if (stats.averageRating < 3) {
      improvementSuggestions.push('Consider refining LLM prompts for better label quality');
    }
    if (stats.accurateCount / stats.totalFeedback < 0.8) {
      improvementSuggestions.push('Improve accuracy by enhancing entity analysis');
    }
    if (stats.relevantCount / stats.totalFeedback < 0.8) {
      improvementSuggestions.push('Enhance relevance by better understanding cluster themes');
    }
    if (stats.averageUncertainty && stats.averageUncertainty > 0.6) {
      improvementSuggestions.push('Reduce uncertainty by improving labeling confidence scoring');
    }

    return {
      commonIssues: commonIssues.slice(0, 5), // Top 5 issues
      improvementSuggestions,
      averageRating: stats.averageRating,
      accuracyRate: stats.totalFeedback > 0 ? stats.accurateCount / stats.totalFeedback : 0,
      relevanceRate: stats.totalFeedback > 0 ? stats.relevantCount / stats.totalFeedback : 0,
    };
  }

  /**
   * Get feedback statistics
   */
  async getStatistics() {
    return await LabelFeedback.getStatistics();
  }

  /**
   * Initialize the service (create indexes, etc.)
   */
  async initialize(): Promise<void> {
    try {
      await LabelFeedback.initializeIndexes();
      logger.info('[ActiveLearning] Initialized label feedback indexes');
    } catch (error) {
      logger.error(`[ActiveLearning] Failed to initialize: ${error}`);
      throw error;
    }
  }
}

// Import type for return value
import type { LabelFeedbackDocument } from '../../models/LabelFeedback.js';

// Export singleton instance
export const activeLearningService = new ActiveLearningService();

