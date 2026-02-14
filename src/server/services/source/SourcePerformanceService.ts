import { Db } from 'mongodb';

/**
 * Source Performance Service
 * 
 * Tracks historical performance metrics for sources (websites) to enable
 * smart source selection. This service tracks:
 * - Total documents scraped per source
 * - Accepted documents per source
 * - Acceptance rate per source
 * - Query-specific acceptance rates
 * 
 * This data is used by SourceRankingService to prioritize sources
 * with proven track records.
 * 
 * How it works:
 * 1. When a document is accepted/rejected, updateSourcePerformance() is called
 * 2. Performance metrics are stored in MongoDB collection 'source_performance'
 * 3. getSourceAcceptanceRate() retrieves the acceptance rate for ranking
 * 
 * To test:
 * - Accept/reject documents and verify metrics update
 * - Query acceptance rates and verify they reflect historical data
 */
export interface SourcePerformance {
  sourceUrl: string;
  totalDocuments: number;
  acceptedDocuments: number;
  rejectedDocuments: number;
  acceptanceRate: number;
  lastUpdated: Date;
  // Query-specific performance (optional, for future enhancement)
  queryPerformance?: Map<string, { total: number; accepted: number; rate: number }>;
}

export class SourcePerformanceService {
  private collectionName = 'source_performance';
  private minDocumentsForReliability: number;

  constructor(
    private db: Db,
    minDocumentsForReliability: number = 5
  ) {
    this.minDocumentsForReliability = minDocumentsForReliability;
  }

  /**
   * Update performance metrics when a document is accepted or rejected
   * 
   * This is called automatically when document acceptance status changes.
   * The ranking system uses these metrics to prioritize sources.
   * 
   * @param sourceUrl - The website URL that was the source of the document
   * @param accepted - true if accepted, false if rejected, null if status cleared
   * @param previousAccepted - Previous acceptance status (if updating)
   */
  async updateSourcePerformance(
    sourceUrl: string,
    accepted: boolean | null,
    previousAccepted: boolean | null = null
  ): Promise<void> {
    const collection = this.db.collection(this.collectionName);

    // Get current performance or create new
    const existing = await collection.findOne({ sourceUrl });

    if (existing) {
      // Update existing record
      const updates: Record<string, unknown> = {
        lastUpdated: new Date()
      };

      // Handle status changes
      if (previousAccepted === null && accepted !== null) {
        // New acceptance/rejection
        updates.totalDocuments = (existing.totalDocuments || 0) + 1;
        if (accepted) {
          updates.acceptedDocuments = (existing.acceptedDocuments || 0) + 1;
        } else {
          updates.rejectedDocuments = (existing.rejectedDocuments || 0) + 1;
        }
      } else if (previousAccepted !== null && accepted !== previousAccepted) {
        // Status changed
        if (previousAccepted && !accepted) {
          // Accepted -> Rejected
          updates.acceptedDocuments = Math.max(0, (existing.acceptedDocuments || 0) - 1);
          updates.rejectedDocuments = (existing.rejectedDocuments || 0) + 1;
        } else if (!previousAccepted && accepted) {
          // Rejected -> Accepted
          updates.acceptedDocuments = (existing.acceptedDocuments || 0) + 1;
          updates.rejectedDocuments = Math.max(0, (existing.rejectedDocuments || 0) - 1);
        } else if (previousAccepted !== null && accepted === null) {
          // Had status -> cleared
          if (previousAccepted) {
            updates.acceptedDocuments = Math.max(0, (existing.acceptedDocuments || 0) - 1);
          } else {
            updates.rejectedDocuments = Math.max(0, (existing.rejectedDocuments || 0) - 1);
          }
          updates.totalDocuments = Math.max(0, (existing.totalDocuments || 0) - 1);
        }
      }

      // Recalculate acceptance rate
      const totalDocs = (updates.totalDocuments ?? existing.totalDocuments) || 0;
      const acceptedDocs = (updates.acceptedDocuments ?? existing.acceptedDocuments) || 0;
      updates.acceptanceRate = totalDocs > 0 ? acceptedDocs / totalDocs : 0;

      await collection.updateOne(
        { sourceUrl },
        { $set: updates }
      );
    } else if (accepted !== null) {
      // Create new record
      const newRecord = {
        sourceUrl,
        totalDocuments: 1,
        acceptedDocuments: accepted ? 1 : 0,
        rejectedDocuments: accepted ? 0 : 1,
        acceptanceRate: accepted ? 1.0 : 0.0,
        lastUpdated: new Date()
      };

      await collection.insertOne(newRecord);
    }
  }

  /**
   * Get acceptance rate for a source
   * 
   * Returns the acceptance rate [0, 1] for a source, or null if there's
   * insufficient data (less than minDocumentsForReliability documents).
   * 
   * This is used by SourceRankingService for ranking.
   * 
   * @param sourceUrl - The website URL
   * @returns Acceptance rate [0, 1] or null if insufficient data
   */
  async getSourceAcceptanceRate(sourceUrl: string): Promise<number | null> {
    const collection = this.db.collection(this.collectionName);
    const performance = await collection.findOne({ sourceUrl });

    if (!performance) {
      return null;
    }

    const totalDocs = performance.totalDocuments || 0;
    if (totalDocs < this.minDocumentsForReliability) {
      return null; // Insufficient data
    }

    return performance.acceptanceRate || 0;
  }

  /**
   * Get performance metrics for a source
   */
  async getSourcePerformance(sourceUrl: string): Promise<SourcePerformance | null> {
    const collection = this.db.collection(this.collectionName);
    const doc = await collection.findOne({ sourceUrl });

    if (!doc) {
      return null;
    }

    return {
      sourceUrl: doc.sourceUrl,
      totalDocuments: doc.totalDocuments || 0,
      acceptedDocuments: doc.acceptedDocuments || 0,
      rejectedDocuments: doc.rejectedDocuments || 0,
      acceptanceRate: doc.acceptanceRate || 0,
      lastUpdated: doc.lastUpdated || new Date()
    };
  }

  /**
   * Get top performing sources
   * 
   * Returns sources sorted by acceptance rate, filtered to only include
   * sources with sufficient data.
   */
  async getTopPerformingSources(limit: number = 10): Promise<SourcePerformance[]> {
    const collection = this.db.collection(this.collectionName);
    const docs = await collection
      .find({
        totalDocuments: { $gte: this.minDocumentsForReliability }
      })
      .sort({ acceptanceRate: -1 })
      .limit(limit)
      .toArray();

    return docs.map(doc => ({
      sourceUrl: doc.sourceUrl,
      totalDocuments: doc.totalDocuments || 0,
      acceptedDocuments: doc.acceptedDocuments || 0,
      rejectedDocuments: doc.rejectedDocuments || 0,
      acceptanceRate: doc.acceptanceRate || 0,
      lastUpdated: doc.lastUpdated || new Date()
    }));
  }

  /**
   * Initialize performance metrics from existing documents
   * 
   * This can be run once to backfill performance data from existing
   * accepted/rejected documents in the canonical_documents collection.
   */
  async initializeFromExistingDocuments(): Promise<void> {
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
    const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
    const documentService = getCanonicalDocumentService();
    const sourceStats = new Map<string, { total: number; accepted: number }>();

    // Get all documents (with reasonable limit for initialization)
    const canonicalDocs = await documentService.findByQuery({}, { limit: 10000 });
    
    // Transform to legacy format for compatibility
    const documents = transformCanonicalArrayToLegacy(canonicalDocs);

    for (const doc of documents) {
      const sourceUrl = doc.website_url;
      if (!sourceUrl) continue;

      if (!sourceStats.has(sourceUrl)) {
        sourceStats.set(sourceUrl, { total: 0, accepted: 0 });
      }

      const stats = sourceStats.get(sourceUrl)!;
      stats.total++;

      if (doc.accepted === true) {
        stats.accepted++;
      }
    }

    // Insert/update performance records
    const collection = this.db.collection(this.collectionName);
    for (const [sourceUrl, stats] of sourceStats.entries()) {
      await collection.updateOne(
        { sourceUrl },
        {
          $set: {
            sourceUrl,
            totalDocuments: stats.total,
            acceptedDocuments: stats.accepted,
            rejectedDocuments: stats.total - stats.accepted,
            acceptanceRate: stats.total > 0 ? stats.accepted / stats.total : 0,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
    }

    console.log(`[SourcePerformanceService] Initialized performance for ${sourceStats.size} sources`);
  }
}


