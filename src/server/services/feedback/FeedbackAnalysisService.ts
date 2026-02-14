/**
 * Feedback Analysis Service
 * 
 * Analyzes collected feedback to calculate quality metrics and insights
 * for use by the Learning Service.
 */

import { ensureDBConnection } from '../../config/database.js';
import { withTimeout, DEFAULT_TIMEOUTS } from '../../utils/withTimeout.js';

export interface QualityMetrics {
  documentQuality: DocumentQualityMetrics[];
  sourceQuality: SourceQualityMetrics[];
  termImportance: TermImportanceMetrics[];
  overallCTR: number;
  overallAcceptanceRate: number;
}

export interface DocumentQualityMetrics {
  documentId: string;
  clicks: number;
  accepts: number;
  rejects: number;
  rating: number;
  qualityScore: number; // 0-1 score
}

export interface SourceQualityMetrics {
  sourceUrl: string;
  documentCount: number;
  averageRating: number;
  acceptanceRate: number;
  clickThroughRate: number;
  qualityScore: number; // 0-1 score
}

export interface TermImportanceMetrics {
  term: string;
  frequency: number;
  averageRating: number;
  associatedAcceptRate: number;
  importanceScore: number; // 0-1 score
}

export class FeedbackAnalysisService {
  /**
   * Get database instance, ensuring connection is active
   */
  private async getDB() {
    return await ensureDBConnection();
  }

  /**
   * Analyze document quality from feedback
   */
  async analyzeDocumentQuality(minInteractions: number = 5): Promise<DocumentQualityMetrics[]> {
    try {
      const db = await this.getDB();
      // Limit aggregation results to prevent memory exhaustion
      const maxAggregationResults = parseInt(process.env.MAX_AGGREGATION_RESULTS || '5000', 10);
      
      const pipeline = [
        {
          $group: {
            _id: '$documentId',
            clicks: {
              $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] }
            },
            accepts: {
              $sum: { $cond: [{ $eq: ['$type', 'accept'] }, 1, 0] }
            },
            rejects: {
              $sum: { $cond: [{ $eq: ['$type', 'reject'] }, 1, 0] }
            },
            totalInteractions: { $sum: 1 }
          }
        },
        {
          $match: {
            totalInteractions: { $gte: minInteractions }
          }
        },
        {
          $limit: maxAggregationResults
        }
      ];

      const interactions = await withTimeout(
        db.collection('user_interactions')
          .aggregate(pipeline)
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'analyzeDocumentQuality: user_interactions aggregation'
      );

      // Get ratings from document_feedback
      const feedback = await withTimeout(
        db.collection('document_feedback')
          .aggregate([
            {
              $group: {
                _id: '$documentId',
                averageRating: { $avg: '$rating' },
                helpfulCount: {
                  $sum: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] }
                },
                totalFeedback: { $sum: 1 }
              }
            },
            {
              $limit: maxAggregationResults
            }
          ])
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'analyzeDocumentQuality: document_feedback aggregation'
      );

      const feedbackMap = new Map(
        (feedback as Array<{ _id: unknown; averageRating?: number }>).map((f) => {
          const id = f._id && typeof f._id === 'object' && 'toString' in f._id ? (f._id as { toString(): string }).toString() : String(f._id);
          return [id, f];
        })
      );

      return (interactions as Array<{ _id: unknown; clicks?: number; accepts?: number; rejects?: number }>).map((interaction) => {
        const docId = interaction._id && typeof interaction._id === 'object' && 'toString' in interaction._id 
          ? (interaction._id as { toString(): string }).toString() 
          : String(interaction._id);
        const fb = feedbackMap.get(docId) as { averageRating?: number } | undefined;
        
        const clicks = interaction.clicks || 0;
        const accepts = interaction.accepts || 0;
        const rejects = interaction.rejects || 0;
        const total = clicks + accepts + rejects;
        
        // Calculate quality score: weighted combination of acceptance rate, rating, and CTR
        const acceptanceRate = total > 0 ? accepts / total : 0;
        const rejectionRate = total > 0 ? rejects / total : 0;
        const rating = (fb?.averageRating ?? 0) || 0;
        const normalizedRating = rating / 5; // Normalize to 0-1
        
        // Quality score: 40% acceptance rate, 30% rating, 20% CTR, 10% rejection penalty
        const qualityScore = Math.max(0, Math.min(1,
          0.4 * acceptanceRate +
          0.3 * normalizedRating +
          0.2 * (clicks > 0 ? Math.min(1, clicks / 10) : 0) +
          0.1 * (1 - rejectionRate)
        ));

        return {
          documentId: docId,
          clicks,
          accepts,
          rejects,
          rating: normalizedRating * 5, // Return as 1-5 scale
          qualityScore
        };
      });
    } catch (error) {
      console.error('[FeedbackAnalysisService] Error analyzing document quality:', error);
      return [];
    }
  }

  /**
   * Analyze source quality from feedback
   * Uses MongoDB aggregation pipelines to process data on the database side,
   * reducing memory usage and improving performance.
   */
  async analyzeSourceQuality(minDocuments: number = 3): Promise<SourceQualityMetrics[]> {
    try {
      const db = await this.getDB();
      // Limit query size to prevent memory exhaustion
      const maxDocuments = parseInt(process.env.LEARNING_MAX_DOCUMENTS || '10000', 10);
      
      // Use aggregation pipeline to process data on database side
      // This avoids loading all documents, interactions, and feedback into memory
      // Strategy: Use $lookup with pipelines to pre-aggregate interactions and feedback
      const pipeline = [
        // Stage 1: Limit documents early to reduce processing
        {
          $limit: maxDocuments
        },
        // Stage 2: Join and aggregate interactions in one step
        {
          $lookup: {
            from: 'user_interactions',
            let: { docId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$documentId', '$$docId'] }
                }
              },
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 }
                }
              }
            ],
            as: 'interactionCounts'
          }
        },
        // Stage 3: Join and aggregate feedback ratings
        {
          $lookup: {
            from: 'document_feedback',
            let: { docId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$documentId', '$$docId'] },
                  rating: { $exists: true, $ne: null }
                }
              },
              {
                $group: {
                  _id: null,
                  avgRating: { $avg: '$rating' },
                  ratings: { $push: '$rating' }
                }
              }
            ],
            as: 'feedbackData'
          }
        },
        // Stage 4: Filter documents that have interactions or feedback
        {
          $match: {
            $or: [
              { 'interactionCounts.0': { $exists: true } },
              { 'feedbackData.0': { $exists: true } }
            ],
            website_url: { $exists: true, $nin: [null, ''] }
          }
        },
        // Stage 5: Transform interaction counts into fields
        {
          $addFields: {
            clicks: {
              $let: {
                vars: {
                  clickData: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$interactionCounts',
                          as: 'ic',
                          cond: { $eq: ['$$ic._id', 'click'] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: { $ifNull: ['$$clickData.count', 0] }
              }
            },
            accepts: {
              $let: {
                vars: {
                  acceptData: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$interactionCounts',
                          as: 'ic',
                          cond: { $eq: ['$$ic._id', 'accept'] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: { $ifNull: ['$$acceptData.count', 0] }
              }
            },
            rejects: {
              $let: {
                vars: {
                  rejectData: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$interactionCounts',
                          as: 'ic',
                          cond: { $eq: ['$$ic._id', 'reject'] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: { $ifNull: ['$$rejectData.count', 0] }
              }
            },
            ratings: {
              $ifNull: [
                {
                  $arrayElemAt: ['$feedbackData.ratings', 0]
                },
                []
              ]
            },
            initialAverageRating: {
              $ifNull: [
                {
                  $arrayElemAt: ['$feedbackData.avgRating', 0]
                },
                0
              ]
            }
          }
        },
        // Stage 6: Group by source URL and sum metrics
        {
          $group: {
            _id: '$website_url',
            documentIds: { $addToSet: '$_id' },
            clicks: { $sum: '$clicks' },
            accepts: { $sum: '$accepts' },
            rejects: { $sum: '$rejects' },
            ratings: { $push: '$ratings' }
          }
        },
        // Stage 7: Calculate document count and flatten ratings
        {
          $addFields: {
            documentCount: { $size: '$documentIds' },
            flatRatings: {
              $reduce: {
                input: '$ratings',
                initialValue: [],
                in: { $concatArrays: ['$$value', '$$this'] }
              }
            }
          }
        },
        // Stage 8: Filter out invalid ratings and calculate valid ratings
        {
          $addFields: {
            validRatings: {
              $filter: {
                input: '$flatRatings',
                as: 'rating',
                cond: {
                  $and: [
                    { $ne: ['$$rating', null] },
                    { $ne: ['$$rating', undefined] },
                    { $gte: ['$$rating', 1] },
                    { $lte: ['$$rating', 5] }
                  ]
                }
              }
            }
          }
        },
        // Stage 9: Filter by minimum document count
        {
          $match: {
            documentCount: { $gte: minDocuments },
            _id: { $exists: true, $nin: [null, ''] }
          }
        },
        // Stage 10: Calculate final metrics
        {
          $addFields: {
            totalInteractions: { $add: ['$clicks', '$accepts', '$rejects'] },
            averageRating: {
              $cond: {
                if: { $gt: [{ $size: '$validRatings' }, 0] },
                then: { $avg: '$validRatings' },
                else: 0
              }
            }
          }
        },
        // Stage 11: Calculate rates and quality score
        {
          $addFields: {
            acceptanceRate: {
              $cond: {
                if: { $gt: ['$totalInteractions', 0] },
                then: { $divide: ['$accepts', '$totalInteractions'] },
                else: 0
              }
            },
            clickThroughRate: {
              $cond: {
                if: { $gt: ['$documentCount', 0] },
                then: { $divide: ['$clicks', '$documentCount'] },
                else: 0
              }
            },
            normalizedRating: {
              $divide: [
                { $ifNull: ['$averageRating', 0] },
                5
              ]
            },
            documentDiversityBonus: {
              $min: [
                { $divide: ['$documentCount', 10] },
                1
              ]
            }
          }
        },
        // Stage 12: Calculate quality score
        {
          $addFields: {
            qualityScore: {
              $max: [
                0,
                {
                  $min: [
                    1,
                    {
                      $add: [
                        { $multiply: [0.4, '$acceptanceRate'] },
                        { $multiply: [0.3, '$normalizedRating'] },
                        { $multiply: [0.2, { $min: ['$clickThroughRate', 1] }] },
                        { $multiply: [0.1, '$documentDiversityBonus'] }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        },
        // Stage 13: Project final result
        {
          $project: {
            _id: 0,
            sourceUrl: '$_id',
            documentCount: 1,
            averageRating: { $ifNull: ['$averageRating', 0] },
            acceptanceRate: 1,
            clickThroughRate: 1,
            qualityScore: 1
          }
        },
        // Stage 14: Sort by quality score
        {
          $sort: { qualityScore: -1 }
        }
      ];

      // Use canonical_documents collection instead of brondocumenten
      // Map website_url from sourceMetadata.legacyWebsiteUrl or sourceMetadata.url
      const canonicalPipeline = [
        // Stage 0: Map canonical document fields to expected format
        {
          $addFields: {
            website_url: {
              $ifNull: [
                '$sourceMetadata.legacyWebsiteUrl',
                '$sourceMetadata.url'
              ]
            }
          }
        },
        ...pipeline
      ];

      const results = await withTimeout(
        db.collection('canonical_documents')
          .aggregate(canonicalPipeline)
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'analyzeSourceQuality: aggregation pipeline'
      );

      return results as SourceQualityMetrics[];
    } catch (error) {
      console.error('[FeedbackAnalysisService] Error analyzing source quality:', error);
      return [];
    }
  }

  /**
   * Analyze term importance from feedback
   */
  async analyzeTermImportance(): Promise<TermImportanceMetrics[]> {
    try {
      const db = await this.getDB();
      // Limit query size to prevent memory exhaustion
      const maxInteractions = parseInt(process.env.LEARNING_MAX_INTERACTIONS || '5000', 10);
      
      // Get queries and their associated feedback (with limit)
      const interactions = await withTimeout(
        db.collection('user_interactions')
          .find({ query: { $exists: true, $ne: null } })
          .limit(maxInteractions)
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'analyzeTermImportance: user_interactions query'
      );

      // Simple term extraction (split by space, filter stop words)
      const stopWords = new Set([
        'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij',
        'over', 'onder', 'is', 'zijn', 'was', 'waren', 'en', 'of', 'als'
      ]);

      const termMap = new Map<string, {
        frequency: number;
        ratings: number[];
        accepts: number;
        total: number;
      }>();

      for (const interaction of interactions) {
        if (!interaction.query) continue;

        const terms = interaction.query
          .toLowerCase()
          .split(/\s+/)
          .filter((term: string) => term.length > 2 && !stopWords.has(term));

        for (const term of terms) {
          if (!termMap.has(term)) {
            termMap.set(term, {
              frequency: 0,
              ratings: [],
              accepts: 0,
              total: 0
            });
          }

          const stats = termMap.get(term)!;
          stats.frequency++;
          stats.total++;

          if (interaction.type === 'accept') {
            stats.accepts++;
          }
        }
      }

      // Get ratings from document feedback (with limit)
      const feedback = await withTimeout(
        db.collection('document_feedback')
          .find({ query: { $exists: true, $ne: null } })
          .limit(maxInteractions)
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'analyzeTermImportance: document_feedback query'
      );

      for (const fb of feedback) {
        if (!fb.query) continue;

        const terms = fb.query
          .toLowerCase()
          .split(/\s+/)
          .filter((term: string) => term.length > 2 && !stopWords.has(term));

        for (const term of terms) {
          if (termMap.has(term) && fb.rating) {
            termMap.get(term)!.ratings.push(fb.rating);
          }
        }
      }

      // Calculate importance scores
      const results: TermImportanceMetrics[] = [];
      for (const [term, stats] of termMap.entries()) {
        const averageRating = stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : 0;

        const associatedAcceptRate = stats.total > 0
          ? stats.accepts / stats.total
          : 0;

        // Importance score: combination of frequency, rating, and acceptance rate
        const importanceScore = Math.max(0, Math.min(1,
          0.4 * Math.min(1, stats.frequency / 10) + // Frequency (normalized)
          0.3 * (averageRating / 5) + // Average rating
          0.3 * associatedAcceptRate // Acceptance rate
        ));

        results.push({
          term,
          frequency: stats.frequency,
          averageRating,
          associatedAcceptRate,
          importanceScore
        });
      }

      return results.sort((a, b) => b.importanceScore - a.importanceScore);
    } catch (error) {
      console.error('[FeedbackAnalysisService] Error analyzing term importance:', error);
      return [];
    }
  }

  /**
   * Get overall quality metrics
   */
  async getOverallMetrics(): Promise<{
    overallCTR: number;
    overallAcceptanceRate: number;
  }> {
    try {
      const db = await this.getDB();
      // Limit aggregation results for safety (even though this returns a single document)
      const maxAggregationResults = parseInt(process.env.MAX_AGGREGATION_RESULTS || '5000', 10);
      
      const interactions = await withTimeout(
        db.collection('user_interactions')
          .aggregate([
            {
              $group: {
                _id: null,
                clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } },
                accepts: { $sum: { $cond: [{ $eq: ['$type', 'accept'] }, 1, 0] } },
                views: { $sum: { $cond: [{ $eq: ['$type', 'view'] }, 1, 0] } },
                total: { $sum: 1 }
              }
            },
            {
              $limit: maxAggregationResults
            }
          ])
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getOverallMetrics: user_interactions aggregation'
      );

      if (interactions.length === 0) {
        return { overallCTR: 0, overallAcceptanceRate: 0 };
      }

      const stats = interactions[0];
      const overallCTR = stats.views > 0 ? stats.clicks / stats.views : 0;
      const overallAcceptanceRate = (stats.clicks + stats.accepts) > 0
        ? stats.accepts / (stats.clicks + stats.accepts)
        : 0;

      return {
        overallCTR,
        overallAcceptanceRate
      };
    } catch (error) {
      console.error('[FeedbackAnalysisService] Error getting overall metrics:', error);
      return { overallCTR: 0, overallAcceptanceRate: 0 };
    }
  }

  /**
   * Get comprehensive quality metrics
   */
  async getQualityMetrics(minInteractions: number = 5, minDocuments: number = 3): Promise<QualityMetrics> {
    const [documentQuality, sourceQuality, termImportance, overall] = await withTimeout(
      Promise.all([
        this.analyzeDocumentQuality(minInteractions),
        this.analyzeSourceQuality(minDocuments),
        this.analyzeTermImportance(),
        this.getOverallMetrics()
      ]),
      DEFAULT_TIMEOUTS.LEARNING_OPERATION,
      'getQualityMetrics: parallel analysis operations'
    );

    return {
      documentQuality,
      sourceQuality,
      termImportance,
      overallCTR: overall.overallCTR,
      overallAcceptanceRate: overall.overallAcceptanceRate
    };
  }
}
