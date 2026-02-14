/**
 * Category Aggregator
 * 
 * Aggregates documents by category for reporting.
 */

import type { IDataAggregator } from '../interfaces/IDataAggregator.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { CategorySummary } from '../types/AggregatedData.js';
import { DocumentCategorizationService } from '../../workflow/DocumentCategorizationService.js';

/**
 * Aggregates categories for reporting
 */
export class CategoryAggregator implements IDataAggregator<ScoredDocument> {
  private categorizationService: DocumentCategorizationService;

  constructor() {
    this.categorizationService = new DocumentCategorizationService();
  }

  /**
   * Aggregate documents by category
   * 
   * @param documents - Documents to aggregate
   * @returns Category summary
   */
  async aggregate(documents: ScoredDocument[]): Promise<CategorySummary> {
    if (documents.length === 0) {
      return {
        totalCategories: 0,
        topCategories: [],
        distribution: {},
      };
    }

    // Categorize documents
    const categorized = this.categorizationService.categorizeDocuments(documents);

    // Build distribution
    const distribution: Record<string, number> = {
      policy: categorized.policy.length,
      official_publication: categorized.official_publication.length,
      jurisprudence: categorized.jurisprudence.length,
      guidance: categorized.guidance.length,
      unverified_external: categorized.unverified_external.length,
    };

    // Calculate top categories with percentages
    const total = documents.length;
    const topCategories = Object.entries(distribution)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count) // Sort by count descending
      .slice(0, 10); // Top 10

    // Count non-empty categories
    const totalCategories = Object.values(distribution).filter(
      (count) => count > 0
    ).length;

    return {
      totalCategories,
      topCategories,
      distribution,
    };
  }
}
