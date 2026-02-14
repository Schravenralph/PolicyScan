/**
 * Scraper Preset Loader
 * 
 * Extracts query presets from scraper registry metadata.
 * Creates presets based on topics and keywords defined in scraper metadata.
 */

import { SCRAPER_REGISTRY } from '../../scrapers/ScraperMetadataRegistry.js';
import type { QueryPreset } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class ScraperPresetLoader {
  /**
   * Load presets from scraper registry
   * @returns Array of query presets extracted from scraper metadata
   */
  loadPresets(): QueryPreset[] {
    const presets: QueryPreset[] = [];

    try {
      for (const [scraperId, entry] of Object.entries(SCRAPER_REGISTRY)) {
        const metadata = entry.metadata.metadata;
        
        // Only create presets for scrapers with topic metadata
        if (metadata && typeof metadata === 'object' && metadata !== null && 'topic' in metadata) {
          const topic = (metadata as { topic?: unknown }).topic;
          const keywords = Array.isArray((metadata as { keywords?: unknown }).keywords) 
            ? (metadata as { keywords: unknown[] }).keywords 
            : [];
          
          if (typeof topic === 'string' && topic.length > 0) {
            const queries = [topic, ...keywords.filter((k): k is string => typeof k === 'string')];
            
            presets.push({
              id: `scraper-${scraperId}`,
              name: this.formatPresetName(topic),
              description: `Queries from ${entry.metadata.scraperName}`,
              source: 'scraper',
              sourceId: scraperId,
              queries: this.normalizeQueries(queries),
              keywords: keywords.filter((k): k is string => typeof k === 'string'),
              category: this.inferCategory(topic),
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error loading scraper presets');
      // Return empty array on error to allow other loaders to continue
    }

    return presets;
  }

  /**
   * Format topic string to display name (capitalize first letter of each word)
   */
  private formatPresetName(topic: string): string {
    return topic
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize queries: lowercase, trim, deduplicate, filter empty strings
   */
  private normalizeQueries(queries: string[]): string[] {
    const normalized = queries.map(q => q.toLowerCase().trim()).filter(q => q.length > 0);
    return Array.from(new Set(normalized));
  }

  /**
   * Infer category from topic
   */
  private inferCategory(topic: string): string {
    const topicLower = topic.toLowerCase();
    
    if (topicLower.includes('huisvesting') || topicLower.includes('woning')) {
      return 'huisvesting';
    }
    if (topicLower.includes('klimaat') || topicLower.includes('energie')) {
      return 'klimaat';
    }
    if (topicLower.includes('mobiliteit') || topicLower.includes('vervoer')) {
      return 'mobiliteit';
    }
    if (topicLower.includes('arbeidsmigrant')) {
      return 'arbeidsmigranten';
    }
    
    return 'algemeen';
  }
}

