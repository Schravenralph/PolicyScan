/**
 * Document Aggregator
 * 
 * Aggregates documents by type, source, and identifies top documents.
 */

import type { IDataAggregator } from '../interfaces/IDataAggregator.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { DocumentSummary } from '../types/AggregatedData.js';

/**
 * Aggregates documents for reporting
 */
export class DocumentAggregator implements IDataAggregator<ScoredDocument> {
  /**
   * Aggregate documents into summary data
   * 
   * @param documents - Documents to aggregate
   * @returns Document summary
   */
  async aggregate(documents: ScoredDocument[]): Promise<DocumentSummary> {
    return {
      total: documents.length,
      byType: this.groupByType(documents),
      bySource: this.groupBySource(documents),
      topDocuments: this.getTopDocuments(documents, 10),
    };
  }

  /**
   * Group documents by type
   * 
   * @param documents - Documents to group
   * @returns Count of documents per type
   */
  private groupByType(documents: ScoredDocument[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const doc of documents) {
      const type = doc.documentType || 'unknown';
      grouped[type] = (grouped[type] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Group documents by source
   * 
   * @param documents - Documents to group
   * @returns Count of documents per source
   */
  private groupBySource(documents: ScoredDocument[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const doc of documents) {
      const source = doc.source || 'unknown';
      grouped[source] = (grouped[source] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Get top N documents by score
   * 
   * @param documents - Documents to rank
   * @param limit - Maximum number of documents to return
   * @returns Top documents with id, title, and score
   */
  private getTopDocuments(
    documents: ScoredDocument[],
    limit: number
  ): Array<{ id: string; title: string; score: number }> {
    // Sort by score (highest first)
    const sorted = [...documents].sort((a, b) => b.finalScore - a.finalScore);

    // Take top N and extract relevant fields
    return sorted.slice(0, limit).map((doc) => ({
      id: doc._id,
      title: doc.title,
      score: doc.finalScore,
    }));
  }
}
