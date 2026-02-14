/**
 * Query Preset Registry
 * 
 * Central registry for query presets that coordinates all preset loaders,
 * manages preset storage, and provides methods for retrieving and combining presets.
 */

import { ScraperPresetLoader } from './loaders/ScraperPresetLoader.js';
import { IPLOPresetLoader } from './loaders/IPLOPresetLoader.js';
import { WebsitePresetLoader } from './loaders/WebsitePresetLoader.js';
import { SystemPresetLoader } from './loaders/SystemPresetLoader.js';
import type { QueryPreset } from './types.js';
import { logger } from '../../utils/logger.js';

export class QueryPresetRegistry {
  private presets: Map<string, QueryPreset> = new Map();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  private readonly loaders = [
    new SystemPresetLoader(),
    new ScraperPresetLoader(),
    new IPLOPresetLoader(),
    new WebsitePresetLoader(),
  ];

  /**
   * Load presets from all loaders
   * Uses lazy loading - only loads on first access
   */
  async loadPresets(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      logger.info('Loading query presets from all sources...');
      let successCount = 0;

      for (const loader of this.loaders) {
        try {
          const presets = await loader.loadPresets();
          for (const preset of presets) {
            if (this.presets.has(preset.id)) {
              logger.warn({ presetId: preset.id }, 'Duplicate preset ID, skipping');
              continue;
            }
            this.presets.set(preset.id, preset);
          }
          successCount++;
        } catch (error) {
          logger.error({ error, loader: loader.constructor.name }, 'Failed to load presets');
        }
      }

      if (successCount === 0 && this.loaders.length > 0) {
        throw new Error('All preset loaders failed');
      }

      this.loaded = true;
      logger.info({ count: this.presets.size }, 'Query presets loaded');
    })();

    // Reset loadingPromise on failure so retries are possible
    this.loadingPromise.catch(() => {
      this.loadingPromise = null;
    });

    return this.loadingPromise;
  }

  /**
   * Get a preset by ID
   * @param id Preset ID
   * @returns Preset or null if not found
   */
  async getPreset(id: string): Promise<QueryPreset | null> {
    await this.ensureLoaded();
    return this.presets.get(id) || null;
  }

  /**
   * Get all presets
   * @returns Array of all presets
   */
  async getAllPresets(): Promise<QueryPreset[]> {
    await this.ensureLoaded();
    return Array.from(this.presets.values());
  }

  /**
   * Get presets by category
   * @param category Category name
   * @returns Array of presets in the category
   */
  async getPresetsByCategory(category: string): Promise<QueryPreset[]> {
    await this.ensureLoaded();
    return Array.from(this.presets.values()).filter(p => p.category === category);
  }

  /**
   * Get presets by source
   * @param source Source type ('scraper', 'iplo', 'website', 'manual')
   * @returns Array of presets from the source
   */
  async getPresetsBySource(source: QueryPreset['source']): Promise<QueryPreset[]> {
    await this.ensureLoaded();
    return Array.from(this.presets.values()).filter(p => p.source === source);
  }

  /**
   * Combine multiple presets and optional manual queries
   * @param presetIds Array of preset IDs to combine
   * @param manualQueries Optional array of manual queries to add
   * @param options Combination options (deduplicate, combineMode)
   * @returns Combined queries and source counts
   */
  async combinePresets(
    presetIds: string[],
    manualQueries: string[] = [],
    options: { deduplicate?: boolean; combineMode?: 'union' | 'intersection' } = {}
  ): Promise<{ queries: string[]; sources: Record<string, number> }> {
    await this.ensureLoaded();

    const { deduplicate = true, combineMode = 'union' } = options;
    const allQueries: string[] = [];
    const sources: Record<string, number> = {};

    // Load queries from presets
    for (const presetId of presetIds) {
      const preset = this.presets.get(presetId);
      if (!preset) {
        logger.warn({ presetId }, 'Preset not found, skipping');
        continue;
      }

      allQueries.push(...preset.queries);
      sources[presetId] = preset.queries.length;
    }

    // Add manual queries
    if (manualQueries.length > 0) {
      allQueries.push(...manualQueries);
      sources['manual'] = manualQueries.length;
    }

    // Deduplicate if requested
    let finalQueries = allQueries;
    if (deduplicate) {
      finalQueries = this.deduplicateQueries(allQueries);
    }

    // Handle intersection mode (not implemented yet, defaults to union)
    if (combineMode === 'intersection') {
      logger.warn('Intersection mode not yet implemented, using union');
    }

    return {
      queries: finalQueries,
      sources,
    };
  }

  /**
   * Deduplicate queries while preserving original casing
   * @param queries Array of queries to deduplicate
   * @returns Deduplicated array of queries
   */
  private deduplicateQueries(queries: string[]): string[] {
    const normalized = new Set<string>();
    const result: string[] = [];

    for (const query of queries) {
      const normalizedQuery = query.toLowerCase().trim();
      if (normalizedQuery && !normalized.has(normalizedQuery)) {
        normalized.add(normalizedQuery);
        result.push(query); // Keep original casing
      }
    }

    return result;
  }

  /**
   * Ensure presets are loaded before access
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadPresets();
    }
  }
}

