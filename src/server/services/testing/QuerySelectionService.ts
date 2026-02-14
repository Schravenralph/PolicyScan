/**
 * Query Selection Service
 * 
 * Handles query space configuration and selection for benchmarking.
 * Supports manual selection, count-based selection, filtering, and sampling strategies.
 */

import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { QueryDocument } from '../../types/index.js';
import { Query } from '../../models/Query.js';

const QUERY_SETS_COLLECTION = 'query_sets';

/**
 * Query space selection configuration
 */
export interface QuerySpaceSelection {
  type: 'manual' | 'count' | 'filter' | 'preset' | 'preset-multi';
  queries?: string[]; // For type: 'manual' or 'preset-multi' (manual queries to combine)
  count?: number; // For type: 'count'
  filters?: QueryFilters; // For type: 'filter'
  preset?: string; // For type: 'preset' (e.g., 'common', 'edge-cases', 'performance') - backward compatibility
  presetIds?: string[]; // For type: 'preset-multi' - array of preset IDs to combine
  sampling?: QuerySampling;
  combineMode?: 'union' | 'intersection'; // For type: 'preset-multi' - how to combine presets
  deduplicate?: boolean; // For type: 'preset-multi' - whether to deduplicate queries (default: true)
}

/**
 * Query filters for selecting queries
 */
export interface QueryFilters {
  dateRange?: { start: Date; end: Date };
  topics?: string[]; // Filter by onderwerp (subject)
  overheidslaag?: string[]; // Filter by overheidstype
  overheidsinstantie?: string[]; // Filter by overheidsinstantie
  minDocumentsFound?: number;
  maxDocumentsFound?: number;
}

/**
 * Query sampling strategy
 */
export interface QuerySampling {
  strategy: 'all' | 'random' | 'top-n' | 'stratified';
  count?: number; // For random, top-n
  seed?: number; // For random (reproducibility)
}

/**
 * Query set preset
 */
export interface QuerySetPreset {
  name: string;
  description: string;
  queries: string[];
}

/**
 * Saved query set document
 */
interface QuerySetDocument {
  _id?: string;
  name: string;
  description?: string;
  queries: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Built-in query set presets
 */
const QUERY_SET_PRESETS: Record<string, QuerySetPreset> = {
  'common': {
    name: 'Common Queries',
    description: 'Frequently used queries for general testing',
    queries: [
      'milieu',
      'woningbouw',
      'verkeer',
      'ruimtelijke ordening',
      'klimaatadaptatie',
      'energietransitie',
      'mobiliteit',
      'duurzaamheid',
    ],
  },
  'edge-cases': {
    name: 'Edge Cases',
    description: 'Queries that test edge cases and error handling',
    queries: [
      'test',
      'voorbeeld',
      'demo',
    ],
  },
  'performance': {
    name: 'Performance Test Set',
    description: 'Queries selected for performance benchmarking',
    queries: [
      'milieu',
      'woningbouw',
      'verkeer',
    ],
  },
};

export class QuerySelectionService {
  /**
   * Select queries based on query space configuration
   */
  async selectQueries(selection: QuerySpaceSelection): Promise<string[]> {
    let queries: string[] = [];

    switch (selection.type) {
      case 'manual':
        if (!selection.queries || selection.queries.length === 0) {
          throw new Error('Manual query selection requires at least one query');
        }
        queries = selection.queries;
        break;

      case 'preset':
        if (!selection.preset) {
          throw new Error('Preset selection requires a preset name');
        }
        queries = await this.loadPreset(selection.preset);
        break;

      case 'preset-multi':
        if (!selection.presetIds || selection.presetIds.length === 0) {
          throw new Error('Multi-preset selection requires at least one preset ID');
        }
        queries = await this.combinePresets(
          selection.presetIds,
          selection.queries || [],
          {
            deduplicate: selection.deduplicate !== false,
            combineMode: selection.combineMode || 'union',
          }
        );
        break;

      case 'count':
        if (!selection.count || selection.count <= 0) {
          throw new Error('Count selection requires a positive count');
        }
        queries = await this.selectByCount(selection.count, selection.filters, selection.sampling);
        break;

      case 'filter':
        queries = await this.selectByFilters(selection.filters, selection.sampling);
        break;

      default:
        throw new Error(`Unknown query selection type: ${selection.type}`);
    }

    // Apply sampling if specified
    if (selection.sampling && queries.length > 0) {
      queries = this.applySampling(queries, selection.sampling);
    }

    logger.info(
      { selectionType: selection.type, queryCount: queries.length },
      'Selected queries for benchmarking'
    );

    return queries;
  }

  /**
   * Get available queries with optional filters
   */
  async getAvailableQueries(filters?: QueryFilters): Promise<QueryDocument[]> {
    const db = getDB();
    const collection = db.collection<QueryDocument>('queries');

    const queryFilter: Record<string, unknown> = {};

    if (filters) {
      if (filters.dateRange) {
        queryFilter.createdAt = {
          $gte: filters.dateRange.start,
          $lte: filters.dateRange.end,
        };
      }

      if (filters.topics && filters.topics.length > 0) {
        queryFilter.onderwerp = { $in: filters.topics };
      }

      if (filters.overheidslaag && filters.overheidslaag.length > 0) {
        queryFilter.overheidstype = { $in: filters.overheidslaag };
      }

      if (filters.overheidsinstantie && filters.overheidsinstantie.length > 0) {
        queryFilter.overheidsinstantie = { $in: filters.overheidsinstantie };
      }
    }

    const queries = await collection.find(queryFilter).toArray();

    // Filter by document count if specified (requires checking document counts)
    if (filters?.minDocumentsFound || filters?.maxDocumentsFound) {
      const filteredQueries: QueryDocument[] = [];
      const queryIds = queries.map((q) => q._id?.toString()).filter((id): id is string => !!id);

      const counts = await this.getCountsForQueryIds(queryIds);

      for (const query of queries) {
        const queryId = query._id?.toString() || '';
        const docCount = counts.get(queryId) || 0;

        if (
          (!filters.minDocumentsFound || docCount >= filters.minDocumentsFound) &&
          (!filters.maxDocumentsFound || docCount <= filters.maxDocumentsFound)
        ) {
          filteredQueries.push(query);
        }
      }
      return filteredQueries;
    }

    return queries;
  }

  /**
   * Get document counts for multiple query IDs
   */
  private async getCountsForQueryIds(queryIds: string[]): Promise<Map<string, number>> {
    if (!queryIds || queryIds.length === 0) return new Map();
    try {
      // Use canonical document service
      const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
      const documentService = getCanonicalDocumentService();

      // Check if method exists (runtime check for safety during transition)
      if (typeof (documentService as any).getCountsForQueryIds === 'function') {
        return await (documentService as any).getCountsForQueryIds(queryIds);
      }

      // Fallback for cases where method might not be present (e.g. mock not updated)
      const counts = new Map<string, number>();
      for (const id of queryIds) {
        counts.set(id, await documentService.countByQueryId(id));
      }
      return counts;
    } catch (error) {
      logger.warn({ error, queryIds }, 'Failed to get document counts for queries');
      return new Map();
    }
  }

  /**
   * Select queries by count
   */
  private async selectByCount(
    count: number,
    filters?: QueryFilters,
    sampling?: QuerySampling
  ): Promise<string[]> {
    const availableQueries = await this.getAvailableQueries(filters);
    const queryStrings = availableQueries
      .map((q) => q.onderwerp)
      .filter((q): q is string => !!q);

    if (queryStrings.length === 0) {
      logger.warn('No queries available for selection');
      return [];
    }

    // If sampling is specified, apply it; otherwise take first N
    if (sampling) {
      const sampled = this.applySampling(queryStrings, sampling);
      return sampled.slice(0, count);
    }

    return queryStrings.slice(0, count);
  }

  /**
   * Select queries by filters
   */
  private async selectByFilters(filters?: QueryFilters, sampling?: QuerySampling): Promise<string[]> {
    const availableQueries = await this.getAvailableQueries(filters);
    let queryStrings = availableQueries
      .map((q) => q.onderwerp)
      .filter((q): q is string => !!q);

    if (sampling) {
      queryStrings = this.applySampling(queryStrings, sampling);
    }

    return queryStrings;
  }

  /**
   * Apply sampling strategy to queries
   */
  private applySampling(queries: string[], sampling: QuerySampling): string[] {
    if (queries.length === 0) return [];

    switch (sampling.strategy) {
      case 'all':
        return queries;

      case 'random': {
        const count = sampling.count || queries.length;
        const seed = sampling.seed;
        const shuffled = seed ? this.shuffleWithSeed([...queries], seed) : this.shuffle([...queries]);
        return shuffled.slice(0, Math.min(count, queries.length));
      }

      case 'top-n': {
        const count = sampling.count || queries.length;
        return queries.slice(0, Math.min(count, queries.length));
      }

      case 'stratified': {
        // Simple stratified sampling: divide into groups and sample from each
        const count = sampling.count || queries.length;
        const groups = this.groupByCategory(queries);
        const perGroup = Math.ceil(count / groups.length);
        const sampled: string[] = [];
        for (const group of groups) {
          sampled.push(...group.slice(0, perGroup));
          if (sampled.length >= count) break;
        }
        return sampled.slice(0, count);
      }

      default:
        logger.warn({ strategy: sampling.strategy }, 'Unknown sampling strategy, returning all queries');
        return queries;
    }
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Shuffle array with seed (for reproducibility)
   */
  private shuffleWithSeed<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    const rng = this.seededRandom(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Simple seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  /**
   * Group queries by category (simple implementation - can be enhanced)
   */
  private groupByCategory(queries: string[]): string[][] {
    // Simple grouping: just return as single group
    // Can be enhanced to group by actual categories if needed
    return [queries];
  }

  /**
   * Load a preset query set
   */
  async loadPreset(presetName: string): Promise<string[]> {
    const preset = QUERY_SET_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    return preset.queries;
  }

  /**
   * Combine multiple presets and optional manual queries
   * @param presetIds Array of preset IDs to combine
   * @param manualQueries Optional array of manual queries to add
   * @param options Combination options (deduplicate, combineMode)
   * @returns Combined queries array
   */
  private async combinePresets(
    presetIds: string[],
    manualQueries: string[] = [],
    options: { deduplicate?: boolean; combineMode?: 'union' | 'intersection' } = {}
  ): Promise<string[]> {
    try {
      // Use dynamic import to avoid circular dependencies
      const { getQueryPresetRegistry } = await import('../query/index.js');
      const registry = getQueryPresetRegistry();

      const result = await registry.combinePresets(presetIds, manualQueries, options);

      logger.info(
        {
          presetIds,
          manualQueryCount: manualQueries.length,
          combinedQueryCount: result.queries.length,
          sources: result.sources,
        },
        'Combined presets for query selection'
      );

      return result.queries;
    } catch (error) {
      logger.error({ error, presetIds }, 'Failed to combine presets');
      throw new Error(`Failed to combine presets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all available presets
   */
  getQuerySetPresets(): QuerySetPreset[] {
    return Object.values(QUERY_SET_PRESETS);
  }

  /**
   * Save a query set for reuse
   */
  async saveQuerySet(name: string, queries: string[], description?: string): Promise<void> {
    const db = getDB();
    const collection = db.collection<QuerySetDocument>(QUERY_SETS_COLLECTION);

    await collection.updateOne(
      { name },
      {
        $set: {
          name,
          description,
          queries,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info({ name, queryCount: queries.length }, 'Saved query set');
  }

  /**
   * Load a saved query set
   */
  async loadQuerySet(name: string): Promise<string[]> {
    const db = getDB();
    const collection = db.collection<QuerySetDocument>(QUERY_SETS_COLLECTION);

    const querySet = await collection.findOne({ name });
    if (!querySet) {
      throw new Error(`Query set not found: ${name}`);
    }

    return querySet.queries;
  }

  /**
   * List all saved query sets
   */
  async listQuerySets(): Promise<Array<{ name: string; description?: string; queryCount: number }>> {
    const db = getDB();
    const collection = db.collection<QuerySetDocument>(QUERY_SETS_COLLECTION);

    const querySets = await collection.find({}).toArray();
    return querySets.map((qs) => ({
      name: qs.name,
      description: qs.description,
      queryCount: qs.queries.length,
    }));
  }
}

