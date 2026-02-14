/**
 * Feedback Collection Service
 * 
 * Collects user feedback on documents, interactions, and QA results.
 * This feedback is used by the Learning Service to improve rankings,
 * update dictionaries, and refine source selection.
 */

import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';

export interface UserInteraction {
  type: 'click' | 'view' | 'accept' | 'reject' | 'search';
  documentId?: string;
  queryId?: string;
  query?: string;
  position?: number; // Position in search results
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentFeedback {
  documentId: string;
  queryId?: string;
  query?: string;
  rating: number; // 1-5 scale
  helpful: boolean;
  relevant: boolean;
  comment?: string;
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface QAFeedback {
  query: string;
  answer?: string;
  helpful: boolean;
  accurate: boolean;
  sources?: string[]; // Document IDs that were sources
  comment?: string;
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export class FeedbackCollectionService {
  private readonly enabled: boolean;
  private readonly anonymize: boolean;

  constructor() {
    this.enabled = process.env.FEEDBACK_COLLECTION_ENABLED !== 'false'; // Default: true
    this.anonymize = process.env.FEEDBACK_ANONYMIZE === 'true'; // Default: false

    if (this.enabled) {
      console.log('[FeedbackCollectionService] Feedback collection enabled');
      this.initializeCollections().catch(err => {
        console.error('[FeedbackCollectionService] Failed to initialize collections:', err);
      });
    } else {
      console.log('[FeedbackCollectionService] Feedback collection disabled');
    }
  }

  /**
   * Get database instance (lazy initialization)
   */
  private get db() {
    return getDB();
  }

  /**
   * Initialize database collections and indexes
   */
  private async initializeCollections(): Promise<void> {
    try {
      // Create indexes for user_interactions
      await this.db.collection('user_interactions').createIndexes([
        { key: { documentId: 1 } },
        { key: { queryId: 1 } },
        { key: { timestamp: -1 } },
        { key: { type: 1, timestamp: -1 } },
        { key: { userId: 1 } }
      ]);

      // Create indexes for document_feedback
      await this.db.collection('document_feedback').createIndexes([
        { key: { documentId: 1 } },
        { key: { queryId: 1 } },
        { key: { timestamp: -1 } },
        { key: { userId: 1 } }
      ]);

      // Create indexes for qa_feedback
      await this.db.collection('qa_feedback').createIndexes([
        { key: { query: 1 } },
        { key: { timestamp: -1 } },
        { key: { userId: 1 } }
      ]);

      console.log('[FeedbackCollectionService] Collections initialized with indexes');
    } catch (error) {
      console.error('[FeedbackCollectionService] Error initializing collections:', error);
      // Don't throw - service can still work without indexes
    }
  }

  /**
   * Record a user interaction
   */
  async recordInteraction(interaction: UserInteraction): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const data = {
        ...interaction,
        _id: new ObjectId(),
        timestamp: interaction.timestamp || new Date(),
        userId: this.anonymize ? undefined : interaction.userId
      };

      const result = await this.db.collection('user_interactions').insertOne(data);
      return result.insertedId.toString();
    } catch (error) {
      console.error('[FeedbackCollectionService] Error recording interaction:', error);
      return null;
    }
  }

  /**
   * Record document feedback
   */
  async recordDocumentFeedback(feedback: DocumentFeedback): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const data = {
        ...feedback,
        _id: new ObjectId(),
        documentId: new ObjectId(feedback.documentId),
        queryId: feedback.queryId ? new ObjectId(feedback.queryId) : undefined,
        timestamp: feedback.timestamp || new Date(),
        userId: this.anonymize ? undefined : feedback.userId
      };

      const result = await this.db.collection('document_feedback').insertOne(data);
      return result.insertedId.toString();
    } catch (error) {
      console.error('[FeedbackCollectionService] Error recording document feedback:', error);
      return null;
    }
  }

  /**
   * Record QA feedback
   */
  async recordQAFeedback(feedback: QAFeedback): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const data = {
        ...feedback,
        _id: new ObjectId(),
        sources: feedback.sources?.map(id => new ObjectId(id)),
        timestamp: feedback.timestamp || new Date(),
        userId: this.anonymize ? undefined : feedback.userId
      };

      const result = await this.db.collection('qa_feedback').insertOne(data);
      return result.insertedId.toString();
    } catch (error) {
      console.error('[FeedbackCollectionService] Error recording QA feedback:', error);
      return null;
    }
  }

  /**
   * Get feedback statistics for a document
   */
  async getDocumentFeedbackStats(documentId: string): Promise<{
    totalInteractions: number;
    clicks: number;
    accepts: number;
    rejects: number;
    averageRating: number;
    helpfulCount: number;
    relevantCount: number;
  }> {
    try {
      const interactions = await this.db.collection('user_interactions')
        .aggregate([
          { $match: { documentId } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          }
        ])
        .toArray();

      const feedback = await this.db.collection('document_feedback')
        .find({ documentId: new ObjectId(documentId) })
        .toArray();

      const clicks = (interactions as Array<{ _id?: string; count?: number }>).find((i: { _id?: string; count?: number }) => i._id === 'click')?.count || 0;
      const accepts = (interactions as Array<{ _id?: string; count?: number }>).find((i: { _id?: string; count?: number }) => i._id === 'accept')?.count || 0;
      const rejects = (interactions as Array<{ _id?: string; count?: number }>).find((i: { _id?: string; count?: number }) => i._id === 'reject')?.count || 0;

      const ratings = (feedback as Array<{ rating?: number }>).map((f: { rating?: number }) => f.rating).filter((r: unknown): r is number => typeof r === 'number');
      const averageRating = ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : 0;

      const helpfulCount = (feedback as Array<{ helpful?: boolean }>).filter((f: { helpful?: boolean }) => f.helpful === true).length;
      const relevantCount = (feedback as Array<{ relevant?: boolean }>).filter((f: { relevant?: boolean }) => f.relevant === true).length;

      return {
        totalInteractions: (interactions as Array<{ count?: number }>).reduce((sum: number, i: { count?: number }) => sum + (i.count || 0), 0),
        clicks,
        accepts,
        rejects,
        averageRating,
        helpfulCount,
        relevantCount
      };
    } catch (error) {
      console.error('[FeedbackCollectionService] Error getting document feedback stats:', error);
      return {
        totalInteractions: 0,
        clicks: 0,
        accepts: 0,
        rejects: 0,
        averageRating: 0,
        helpfulCount: 0,
        relevantCount: 0
      };
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

