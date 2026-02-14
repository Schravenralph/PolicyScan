/**
 * Retrieval Query Planner
 * 
 * Plans multi-stage retrieval strategies for complex queries, especially comparison queries.
 * Coordinates evidence gathering from multiple evidence sets and combines results.
 * 
 * This service is part of WI-RETRIEVAL-001: Metadata Constraints & Query Planning.
 * 
 * @see docs/21-issues/WI-RETRIEVAL-001-metadata-constraints-query-planning.md
 */

import { QueryDecompositionService, type DecomposedQuery, type EvidenceSet } from './QueryDecompositionService.js';
import { HybridRetrievalService } from './HybridRetrievalService.js';
import { logger } from '../../utils/logger.js';
import type { CanonicalRetrievedDocument } from './HybridRetrievalService.js';
import type { SearchFilters } from '../../search/SearchService.js';
import type { DocumentFilters } from '../../contracts/types.js';

/**
 * Planned retrieval step
 */
export interface RetrievalStep {
  evidenceSet: EvidenceSet;
  query: string;
  priority: 'high' | 'medium' | 'low';
  expectedResults: number;
}

/**
 * Retrieval plan
 */
export interface RetrievalPlan {
  originalQuery: string;
  queryType: string;
  steps: RetrievalStep[];
  strategy: 'parallel' | 'sequential' | 'cascade';
}

/**
 * Planned retrieval result
 */
export interface PlannedRetrievalResult {
  plan: RetrievalPlan;
  results: Array<{
    evidenceSet: string;
    documents: CanonicalRetrievedDocument[];
    query: string;
  }>;
  combinedResults: CanonicalRetrievedDocument[];
  metrics: {
    totalSteps: number;
    completedSteps: number;
    totalDocuments: number;
    uniqueDocuments: number;
  };
}

/**
 * Retrieval Query Planner
 */
export class RetrievalQueryPlanner {
  private decompositionService: QueryDecompositionService;
  private hybridRetrievalService: HybridRetrievalService;

  constructor(config?: {
    decompositionService?: QueryDecompositionService;
    hybridRetrievalService?: HybridRetrievalService;
  }) {
    this.decompositionService = config?.decompositionService || new QueryDecompositionService();
    this.hybridRetrievalService = config?.hybridRetrievalService || new HybridRetrievalService();
  }

  /**
   * Plan retrieval strategy for a query
   */
  async planRetrieval(query: string): Promise<RetrievalPlan> {
    // Decompose query
    const decomposed = await this.decompositionService.decompose(query);

    // Create retrieval steps from evidence sets
    const steps: RetrievalStep[] = decomposed.evidenceSets.map((evidenceSet, index) => {
      // Determine priority based on evidence set order and sub-questions
      const priority = index === 0 ? 'high' : index === 1 ? 'medium' : 'low';

      // Estimate expected results based on evidence set
      const expectedResults = this.estimateExpectedResults(evidenceSet, decomposed);

      return {
        evidenceSet,
        query: this.buildQueryForEvidenceSet(evidenceSet, decomposed),
        priority,
        expectedResults,
      };
    });

    // Determine strategy
    const strategy = this.determineStrategy(decomposed);

    return {
      originalQuery: query,
      queryType: decomposed.queryType,
      steps,
      strategy,
    };
  }

  /**
   * Execute planned retrieval
   */
  async executePlan(plan: RetrievalPlan, topK: number = 20): Promise<PlannedRetrievalResult> {
    const results: Array<{
      evidenceSet: string;
      documents: CanonicalRetrievedDocument[];
      query: string;
    }> = [];

    if (plan.strategy === 'parallel') {
      // Execute all steps in parallel
      const stepPromises = plan.steps.map(step => this.executeStep(step, topK));
      const stepResults = await Promise.all(stepPromises);
      
      stepResults.forEach((stepResult, index) => {
        results.push({
          evidenceSet: plan.steps[index].evidenceSet.name,
          documents: stepResult,
          query: plan.steps[index].query,
        });
      });
    } else if (plan.strategy === 'sequential') {
      // Execute steps sequentially
      for (const step of plan.steps) {
        const stepResult = await this.executeStep(step, topK);
        results.push({
          evidenceSet: step.evidenceSet.name,
          documents: stepResult,
          query: step.query,
        });
      }
    } else {
      // Cascade: execute high priority first, then medium, then low
      const highPrioritySteps = plan.steps.filter(s => s.priority === 'high');
      const mediumPrioritySteps = plan.steps.filter(s => s.priority === 'medium');
      const lowPrioritySteps = plan.steps.filter(s => s.priority === 'low');

      for (const step of [...highPrioritySteps, ...mediumPrioritySteps, ...lowPrioritySteps]) {
        const stepResult = await this.executeStep(step, topK);
        results.push({
          evidenceSet: step.evidenceSet.name,
          documents: stepResult,
          query: step.query,
        });
      }
    }

    // Combine results
    const combinedResults = this.combineResults(results);

    return {
      plan,
      results,
      combinedResults: combinedResults.slice(0, topK),
      metrics: {
        totalSteps: plan.steps.length,
        completedSteps: results.length,
        totalDocuments: results.reduce((sum, r) => sum + r.documents.length, 0),
        uniqueDocuments: combinedResults.length,
      },
    };
  }

  /**
   * Convert SearchFilters to DocumentFilters format
   * 
   * Handles differences between SearchFilters (used in EvidenceSet) and DocumentFilters
   * (used in HybridRetrievalService). Main differences:
   * - SearchFilters.documentFamily is array, DocumentFilters.documentFamily is single value
   * - SearchFilters has dateRange, DocumentFilters uses dates.publishedAt directly
   */
  private convertSearchFiltersToDocumentFilters(searchFilters: SearchFilters): DocumentFilters {
    const docFilters: DocumentFilters = {};

    // Document family: both support arrays now
    if (searchFilters.documentFamily) {
      docFilters.documentFamily = searchFilters.documentFamily;
    }

    // Document type: both support arrays now
    if (searchFilters.documentType) {
      docFilters.documentType = searchFilters.documentType;
    }

    // Publisher authority: same format
    if (searchFilters.publisherAuthority) {
      docFilters.publisherAuthority = searchFilters.publisherAuthority;
    }

    // Temporal filters: same format
    if (searchFilters.validFrom) {
      docFilters.validFrom = searchFilters.validFrom;
    }
    if (searchFilters.validTo) {
      docFilters.validTo = searchFilters.validTo;
    }

    // Date range -> publishedAt
    if (searchFilters.dateRange) {
      if (searchFilters.dateRange.from) {
        docFilters.publishedAfter = searchFilters.dateRange.from;
      }
      if (searchFilters.dateRange.to) {
        docFilters.publishedBefore = searchFilters.dateRange.to;
      }
    }

    // Spatial filters: same format
    if (searchFilters.areaId) {
      docFilters.areaId = searchFilters.areaId;
    }
    if (searchFilters.areaIds) {
      docFilters.areaIds = searchFilters.areaIds;
    }

    return docFilters;
  }

  /**
   * Execute a single retrieval step
   */
  private async executeStep(
    step: RetrievalStep,
    topK: number
  ): Promise<CanonicalRetrievedDocument[]> {
    try {
      const evidenceSet = step.evidenceSet;

      // Convert SearchFilters to DocumentFilters if filters are provided
      const documentFilters = evidenceSet.filters
        ? this.convertSearchFiltersToDocumentFilters(evidenceSet.filters)
        : undefined;

      // Use HybridRetrievalService with filters applied during retrieval (more efficient)
      let documents = await this.hybridRetrievalService.retrieveCanonical(
        step.query,
        {
          maxKeywordResults: Math.min(topK, step.expectedResults),
          maxSemanticResults: Math.min(topK, step.expectedResults),
          filters: documentFilters,
        }
      );

      // Apply post-retrieval filtering for filters not fully supported in DocumentFilters
      // (e.g., geo)
      if (evidenceSet.filters) {
        const needsPostFiltering = evidenceSet.filters.geo !== undefined;

        if (needsPostFiltering) {
          documents = this.applyFiltersPostRetrieval(documents, evidenceSet.filters);
        }
      }

      return documents;
    } catch (error) {
      logger.warn(
        { error, step: step.evidenceSet.name },
        'Failed to execute retrieval step, returning empty results'
      );
      return [];
    }
  }

  /**
   * Apply filters to retrieved documents (post-retrieval filtering)
   * 
   * This method is kept for filters that aren't fully supported in DocumentFilters
   * (e.g., geo filters).
   * Most filters are now applied during retrieval via HybridRetrievalService.
   * 
   * @deprecated Most filters are now applied during retrieval. This is only used
   * for filters not supported in DocumentFilters (e.g., geo).
   */
  private applyFiltersPostRetrieval(
    documents: CanonicalRetrievedDocument[],
    filters: NonNullable<EvidenceSet['filters']>
  ): CanonicalRetrievedDocument[] {
    return documents.filter(doc => {
      // Geo filter - not supported in DocumentFilters
      if (filters.geo) {
        // Geo filtering would require spatial query support
        // For now, skip geo filtering (can be added later if needed)
        logger.debug({ evidenceSet: 'unknown' }, 'Geo filters not yet supported in post-retrieval filtering');
      }

      return true;
    });
  }

  /**
   * Build query string for an evidence set
   */
  private buildQueryForEvidenceSet(
    evidenceSet: EvidenceSet,
    decomposed: DecomposedQuery
  ): string {
    // If evidence set has sub-questions, use them
    if (evidenceSet.subQuestions.length > 0) {
      return evidenceSet.subQuestions.join(' ');
    }

    // Otherwise, use the original query
    return decomposed.originalQuery;
  }

  /**
   * Estimate expected number of results for an evidence set
   */
  private estimateExpectedResults(
    evidenceSet: EvidenceSet,
    decomposed: DecomposedQuery
  ): number {
    // Base estimate on evidence set type and filters
    let baseEstimate = 20;

    // Adjust based on retrieval strategy
    if (evidenceSet.retrievalStrategy === 'keyword') {
      baseEstimate = 30; // Keyword search typically returns more results
    } else if (evidenceSet.retrievalStrategy === 'semantic') {
      baseEstimate = 15; // Semantic search is more selective
    }

    // Adjust based on filters (more filters = fewer results)
    if (evidenceSet.filters) {
      const filterCount = Object.keys(evidenceSet.filters).length;
      baseEstimate = Math.max(5, baseEstimate - filterCount * 5);
    }

    return baseEstimate;
  }

  /**
   * Determine retrieval strategy based on query type
   */
  private determineStrategy(decomposed: DecomposedQuery): 'parallel' | 'sequential' | 'cascade' {
    if (decomposed.queryType === 'comparison') {
      // For comparisons, use parallel to get evidence for all entities simultaneously
      return 'parallel';
    } else if (decomposed.evidenceSets.length > 3) {
      // For many evidence sets, use cascade to prioritize
      return 'cascade';
    } else {
      // Default to sequential for simple queries
      return 'sequential';
    }
  }

  /**
   * Combine results from multiple evidence sets
   */
  private combineResults(
    results: Array<{
      evidenceSet: string;
      documents: CanonicalRetrievedDocument[];
      query: string;
    }>
  ): CanonicalRetrievedDocument[] {
    // Deduplicate by document URL
    const docMap = new Map<string, CanonicalRetrievedDocument>();

    for (const result of results) {
      for (const doc of result.documents) {
        const url = doc.document.canonicalUrl || doc.document.sourceMetadata?.legacyUrl as string || '';
        if (!url) continue;

        if (docMap.has(url)) {
          // Document already seen - boost score if this is a better match
          const existing = docMap.get(url)!;
          if (doc.finalScore > existing.finalScore) {
            // Boost score slightly for appearing in multiple evidence sets
            doc.finalScore = Math.min(1.0, doc.finalScore * 1.1);
            docMap.set(url, doc);
          }
        } else {
          docMap.set(url, doc);
        }
      }
    }

    // Sort by final score
    return Array.from(docMap.values()).sort((a, b) => b.finalScore - a.finalScore);
  }
}

