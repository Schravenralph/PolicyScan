/**
 * Document Selection Service
 * 
 * Provides document selection, filtering, and sampling functionality
 * for benchmarking workflows against configurable document sets.
 */

import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';

export interface DocumentSetSpaceConfig {
  maxDocuments?: number; // Maximum number of documents to include
  minDocuments?: number; // Minimum number of documents required
  filters?: {
    type_document?: string[];
    dateRange?: { start: Date; end: Date };
    sources?: string[];
    minScore?: number;
    maxScore?: number;
    websites?: string[];
  };
  sampling?: {
    strategy: 'all' | 'random' | 'top-n' | 'bottom-n' | 'stratified';
    count?: number; // For random, top-n, bottom-n
    seed?: number; // For random (reproducibility)
    stratifyBy?: 'type' | 'source' | 'website'; // For stratified
  };
  manualSelection?: string[]; // Specific document URLs to include
  preset?: string; // Document set preset name
}

export interface DocumentSetPreset {
  name: string;
  description: string;
  config: DocumentSetSpaceConfig;
}

/**
 * Document set presets for common benchmarking scenarios
 */
export const DOCUMENT_SET_PRESETS: Record<string, DocumentSetPreset> = {
  'high-quality': {
    name: 'High Quality Documents',
    description: 'Documents with high relevance scores',
    config: {
      maxDocuments: 100,
      filters: {
        minScore: 15,
      },
      sampling: {
        strategy: 'top-n',
        count: 100,
      },
    },
  },
  'diverse': {
    name: 'Diverse Document Set',
    description: 'Stratified sample across document types',
    config: {
      maxDocuments: 200,
      sampling: {
        strategy: 'stratified',
        stratifyBy: 'type',
        count: 200,
      },
    },
  },
  'edge-cases': {
    name: 'Edge Case Documents',
    description: 'Documents that test edge cases (low-scoring)',
    config: {
      maxDocuments: 50,
      filters: {
        minScore: 0,
        maxScore: 5, // Low-scoring documents
      },
      sampling: {
        strategy: 'random',
        count: 50,
      },
    },
  },
};

export class DocumentSelectionService {
  /**
   * Select documents based on configuration
   */
  async selectDocuments(
    documents: Array<{ url: string; [key: string]: unknown }>,
    config: DocumentSetSpaceConfig
  ): Promise<Array<{ url: string; [key: string]: unknown }>> {
    let selected = [...documents];

    // Apply preset if specified
    if (config.preset) {
      const preset = DOCUMENT_SET_PRESETS[config.preset];
      if (preset) {
        // Merge preset config with provided config (provided config takes precedence)
        config = {
          ...preset.config,
          ...config,
          filters: {
            ...preset.config.filters,
            ...config.filters,
          },
          sampling: {
            strategy: (preset.config.sampling?.strategy || config.sampling?.strategy || 'all') as 'all' | 'random' | 'top-n' | 'stratified' | 'bottom-n',
            ...preset.config.sampling,
            ...config.sampling,
          },
        };
        logger.debug({ preset: config.preset }, 'Applied document set preset');
      } else {
        logger.warn({ preset: config.preset }, 'Unknown document set preset, ignoring');
      }
    }

    // Apply manual selection if specified (highest priority)
    if (config.manualSelection && config.manualSelection.length > 0) {
      const urlSet = new Set(config.manualSelection);
      selected = selected.filter(doc => urlSet.has(doc.url));
      logger.debug({ manualSelectionCount: config.manualSelection.length, selectedCount: selected.length }, 'Applied manual document selection');
    }

    // Apply filters
    if (config.filters) {
      selected = await this.applyFilters(selected, config.filters);
    }

    // Apply sampling
    if (config.sampling && config.sampling.strategy !== 'all') {
      selected = await this.applySampling(selected, config.sampling);
    }

    // Apply maxDocuments limit
    if (config.maxDocuments && selected.length > config.maxDocuments) {
      selected = selected.slice(0, config.maxDocuments);
      logger.debug({ maxDocuments: config.maxDocuments, selectedCount: selected.length }, 'Applied maxDocuments limit');
    }

    // Validate minDocuments requirement
    if (config.minDocuments && selected.length < config.minDocuments) {
      throw new Error(
        `Insufficient documents: found ${selected.length}, required ${config.minDocuments}`
      );
    }

    logger.debug(
      { originalCount: documents.length, selectedCount: selected.length, config },
      'Document selection completed'
    );

    return selected;
  }

  /**
   * Apply filters to documents
   */
  async applyFilters(
    documents: Array<{ url: string; [key: string]: unknown }>,
    filters: DocumentSetSpaceConfig['filters']
  ): Promise<Array<{ url: string; [key: string]: unknown }>> {
    if (!filters) {
      return documents;
    }

    let filtered = [...documents];

    // Filter by type_document
    if (filters.type_document && filters.type_document.length > 0) {
      const typeSet = new Set(filters.type_document);
      filtered = filtered.filter(doc => {
        const docType = doc.type_document as string | undefined;
        return docType && typeSet.has(docType);
      });
    }

    // Filter by sources (website URLs)
    if (filters.sources && filters.sources.length > 0) {
      const sourceSet = new Set(filters.sources);
      filtered = filtered.filter(doc => {
        const websiteUrl = doc.website_url as string | undefined;
        return websiteUrl && sourceSet.has(websiteUrl);
      });
    }

    // Filter by websites
    if (filters.websites && filters.websites.length > 0) {
      const websiteSet = new Set(filters.websites);
      filtered = filtered.filter(doc => {
        const websiteUrl = doc.website_url as string | undefined;
        return websiteUrl && websiteSet.has(websiteUrl);
      });
    }

    // Filter by score range
    if (filters.minScore !== undefined || filters.maxScore !== undefined) {
      filtered = filtered.filter(doc => {
        const score = (doc.score as number) || (doc.relevanceScore as number) || 0;
        if (filters.minScore !== undefined && score < filters.minScore) {
          return false;
        }
        if (filters.maxScore !== undefined && score > filters.maxScore) {
          return false;
        }
        return true;
      });
    }

    // Filter by date range
    if (filters.dateRange) {
      const start = filters.dateRange.start.getTime();
      const end = filters.dateRange.end.getTime();
      filtered = filtered.filter(doc => {
        const docDate = doc.createdAt || doc.date;
        if (!docDate) {
          return false; // Exclude documents without dates
        }
        const docTime = docDate instanceof Date ? docDate.getTime() : new Date(docDate as string).getTime();
        return docTime >= start && docTime <= end;
      });
    }

    logger.debug(
      { originalCount: documents.length, filteredCount: filtered.length, filters },
      'Document filtering completed'
    );

    return filtered;
  }

  /**
   * Apply sampling strategy to documents
   */
  async applySampling(
    documents: Array<{ url: string; [key: string]: unknown }>,
    sampling: DocumentSetSpaceConfig['sampling']
  ): Promise<Array<{ url: string; [key: string]: unknown }>> {
    if (!sampling || sampling.strategy === 'all') {
      return documents;
    }

    switch (sampling.strategy) {
      case 'random':
        return this.randomSample(documents, sampling.count || documents.length, sampling.seed);

      case 'top-n':
        return this.topNSample(documents, sampling.count || 10);

      case 'bottom-n':
        return this.bottomNSample(documents, sampling.count || 10);

      case 'stratified':
        return this.stratifiedSample(
          documents,
          sampling.count || documents.length,
          sampling.stratifyBy || 'type'
        );

      default:
        logger.warn({ strategy: sampling.strategy }, 'Unknown sampling strategy, returning all documents');
        return documents;
    }
  }

  /**
   * Random sample with optional seed for reproducibility
   */
  private randomSample(
    documents: Array<{ url: string; [key: string]: unknown }>,
    count: number,
    seed?: number
  ): Array<{ url: string; [key: string]: unknown }> {
    if (count >= documents.length) {
      return documents;
    }

    // Simple seeded random (for reproducibility)
    let random: () => number;
    if (seed !== undefined) {
      let seedValue = seed;
      random = () => {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
      };
    } else {
      random = Math.random;
    }

    const shuffled = [...documents].sort(() => random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Top N documents by score
   */
  private topNSample(
    documents: Array<{ url: string; [key: string]: unknown }>,
    count: number
  ): Array<{ url: string; [key: string]: unknown }> {
    const sorted = [...documents].sort((a, b) => {
      const scoreA = (a.score as number) || (a.relevanceScore as number) || 0;
      const scoreB = (b.score as number) || (b.relevanceScore as number) || 0;
      return scoreB - scoreA;
    });

    return sorted.slice(0, count);
  }

  /**
   * Bottom N documents by score
   */
  private bottomNSample(
    documents: Array<{ url: string; [key: string]: unknown }>,
    count: number
  ): Array<{ url: string; [key: string]: unknown }> {
    const sorted = [...documents].sort((a, b) => {
      const scoreA = (a.score as number) || (a.relevanceScore as number) || 0;
      const scoreB = (b.score as number) || (b.relevanceScore as number) || 0;
      return scoreA - scoreB;
    });

    return sorted.slice(0, count);
  }

  /**
   * Stratified sample (sample from each category/type)
   */
  private stratifiedSample(
    documents: Array<{ url: string; [key: string]: unknown }>,
    count: number,
    stratifyBy: 'type' | 'source' | 'website'
  ): Array<{ url: string; [key: string]: unknown }> {
    // Group by stratification field
    const groups = new Map<string, Array<{ url: string; [key: string]: unknown }>>();
    for (const doc of documents) {
      let key: string;
      if (stratifyBy === 'type') {
        key = (doc.type_document as string) || 'unknown';
      } else if (stratifyBy === 'source') {
        key = (doc.source as string) || (doc.website_url as string) || 'unknown';
      } else {
        key = (doc.website_url as string) || 'unknown';
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(doc);
    }

    // Sample from each group
    const perGroup = Math.floor(count / groups.size);
    const result: Array<{ url: string; [key: string]: unknown }> = [];

    for (const [key, groupDocs] of groups) {
      const sampleSize = Math.min(perGroup, groupDocs.length);
      const sampled = this.randomSample(groupDocs, sampleSize);
      result.push(...sampled);
    }

    // Fill remaining slots if needed
    if (result.length < count) {
      const remaining = documents.filter(doc => !result.includes(doc));
      const additional = this.randomSample(remaining, count - result.length);
      result.push(...additional);
    }

    return result.slice(0, count);
  }

  /**
   * Get available document set presets
   */
  async getDocumentSetPresets(): Promise<DocumentSetPreset[]> {
    return Object.values(DOCUMENT_SET_PRESETS);
  }

  /**
   * Get a specific preset by name
   */
  async getDocumentSetPreset(name: string): Promise<DocumentSetPreset | null> {
    return DOCUMENT_SET_PRESETS[name] || null;
  }
}

