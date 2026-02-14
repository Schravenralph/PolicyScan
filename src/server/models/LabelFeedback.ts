import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';

const COLLECTION_NAME = 'label_feedback';

export interface LabelFeedbackDocument {
  _id?: ObjectId;
  clusterId: string;
  label: string;
  originalLabel?: string; // The label that was generated before feedback
  feedback: {
    rating: number; // 1-5 scale (1 = poor, 5 = excellent)
    accurate: boolean; // Is the label accurate?
    relevant: boolean; // Is the label relevant to the cluster?
    suggestedLabel?: string; // User-suggested alternative label
    comment?: string;
  };
  uncertainty?: {
    score: number; // 0-1, higher = more uncertain
    reasons?: string[]; // Why the label is uncertain
  };
  metadata?: {
    entityCount?: number;
    entityTypes?: string[];
    domain?: string;
    labelingMethod?: 'llm' | 'heuristic';
    qualityScore?: number; // Quality score from label generation
  };
  userId?: string;
  reviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LabelFeedbackCreateInput {
  clusterId: string;
  label: string;
  originalLabel?: string;
  feedback: {
    rating: number;
    accurate: boolean;
    relevant: boolean;
    suggestedLabel?: string;
    comment?: string;
  };
  uncertainty?: {
    score: number;
    reasons?: string[];
  };
  metadata?: LabelFeedbackDocument['metadata'];
  userId?: string;
}

export interface LabelFeedbackUpdateInput {
  feedback?: Partial<LabelFeedbackDocument['feedback']>;
  reviewedAt?: Date;
  updatedAt?: Date;
}

/**
 * MongoDB model for label feedback
 */
export class LabelFeedback {
  /**
   * Create a new label feedback entry
   */
  static async create(feedbackData: LabelFeedbackCreateInput): Promise<LabelFeedbackDocument> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);

    const feedback: LabelFeedbackDocument = {
      ...feedbackData,
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(feedback);
    return { ...feedback, _id: result.insertedId };
  }

  /**
   * Find feedback by cluster ID
   */
  static async findByClusterId(clusterId: string): Promise<LabelFeedbackDocument | null> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);
    return await collection.findOne({ clusterId });
  }

  /**
   * Find all feedback entries
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    filter?: {
      minRating?: number;
      hasUncertainty?: boolean;
      minUncertaintyScore?: number;
    };
  } = {}): Promise<LabelFeedbackDocument[]> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);
    const {
      limit = 100,
      skip = 0,
      sort = { reviewedAt: -1 },
      filter = {},
    } = options;

    const query: Record<string, unknown> = {};
    if (filter.minRating !== undefined) {
      query['feedback.rating'] = { $gte: filter.minRating };
    }
    if (filter.hasUncertainty) {
      query.uncertainty = { $exists: true };
    }
    if (filter.minUncertaintyScore !== undefined) {
      query['uncertainty.score'] = { $gte: filter.minUncertaintyScore };
    }

    return await collection.find(query).sort(sort).skip(skip).limit(limit).toArray();
  }

  /**
   * Get feedback statistics
   */
  static async getStatistics(): Promise<{
    totalFeedback: number;
    averageRating: number;
    accurateCount: number;
    relevantCount: number;
    averageUncertainty?: number;
    feedbackByRating: Record<number, number>;
  }> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);

    // Limit to prevent memory exhaustion when calculating statistics
    // Default limit: 10000 feedback entries for stats calculation, configurable via environment variable
    const MAX_LABEL_FEEDBACK_STATS = parseInt(process.env.MAX_LABEL_FEEDBACK_STATS || '10000', 10);
    
    const allFeedback = await collection
      .find({})
      .limit(MAX_LABEL_FEEDBACK_STATS)
      .toArray();
    
    if (allFeedback.length === MAX_LABEL_FEEDBACK_STATS) {
      console.warn(
        `[LabelFeedback] getStatistics() query may have been truncated at ${MAX_LABEL_FEEDBACK_STATS} entries. ` +
        `Statistics may be incomplete. Consider increasing MAX_LABEL_FEEDBACK_STATS.`
      );
    }

    const totalFeedback = allFeedback.length;
    const averageRating =
      totalFeedback > 0
        ? allFeedback.reduce((sum, f) => sum + f.feedback.rating, 0) / totalFeedback
        : 0;
    const accurateCount = allFeedback.filter(f => f.feedback.accurate).length;
    const relevantCount = allFeedback.filter(f => f.feedback.relevant).length;

    const feedbackWithUncertainty = allFeedback.filter(f => f.uncertainty?.score !== undefined);
    const averageUncertainty =
      feedbackWithUncertainty.length > 0
        ? feedbackWithUncertainty.reduce((sum, f) => sum + (f.uncertainty?.score || 0), 0) /
          feedbackWithUncertainty.length
        : undefined;

    const feedbackByRating: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      feedbackByRating[i] = allFeedback.filter(f => f.feedback.rating === i).length;
    }

    return {
      totalFeedback,
      averageRating,
      accurateCount,
      relevantCount,
      averageUncertainty,
      feedbackByRating,
    };
  }

  /**
   * Get labels needing review (high uncertainty, low rating)
   */
  static async getReviewQueue(options: {
    limit?: number;
    minUncertaintyScore?: number;
    maxRating?: number;
  } = {}): Promise<LabelFeedbackDocument[]> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);
    const { limit = 50, minUncertaintyScore = 0.5, maxRating = 3 } = options;

    const query: Record<string, unknown> = {
      $or: [
        { 'uncertainty.score': { $gte: minUncertaintyScore } },
        { 'feedback.rating': { $lte: maxRating } },
      ],
    };

    return await collection
      .find(query)
      .sort({ 'uncertainty.score': -1, 'feedback.rating': 1, reviewedAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Initialize collection indexes
   */
  static async initializeIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<LabelFeedbackDocument>(COLLECTION_NAME);

    await collection.createIndexes([
      { key: { clusterId: 1 }, unique: true },
      { key: { 'feedback.rating': 1 } },
      { key: { 'uncertainty.score': -1 } },
      { key: { reviewedAt: -1 } },
      { key: { userId: 1 } },
    ]);
  }
}

