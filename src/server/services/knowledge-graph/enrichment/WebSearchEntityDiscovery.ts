/**
 * Web Search-Based Entity Discovery Service
 * 
 * Uses web searches (Google Search API) to discover entities that should be
 * in the knowledge graph but are currently missing.
 */

import type { BaseEntity, EntityType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { GoogleSearchService } from '../../external/googleSearch.js';
import { logger } from '../../../utils/logger.js';

export interface EntityDiscoveryQuery {
  entityName?: string;
  entityType?: EntityType;
  jurisdiction?: string;
  topic?: string;
  location?: string;
}

export interface DiscoveredEntity {
  entity: BaseEntity;
  sourceUrl: string;
  confidence: number; // 0-1
  searchQuery: string;
}

export class WebSearchEntityDiscovery {
  private googleSearch: GoogleSearchService;
  private kgService: KnowledgeGraphServiceInterface;

  constructor(kgService: KnowledgeGraphServiceInterface) {
    this.kgService = kgService;
    this.googleSearch = new GoogleSearchService();
  }

  /**
   * Discover entities using web search
   */
  async discoverEntities(
    query: EntityDiscoveryQuery,
    maxResults: number = 20
  ): Promise<DiscoveredEntity[]> {
    if (!this.googleSearch.isConfigured()) {
      logger.warn('Google Search not configured, cannot discover entities');
      return [];
    }

    logger.info({ query }, 'Starting web search entity discovery');

    const searchQueries = this.buildSearchQueries(query);
    const discoveredEntities: DiscoveredEntity[] = [];

    for (const searchQuery of searchQueries) {
      try {
        const results = await this.googleSearch.search(searchQuery, {
          numResults: 10,
        });

        for (const result of results) {
          // Extract entity from search result
          const entity = this.extractEntityFromResult(result, query);
          
          if (entity) {
            // Check if entity already exists in KG
            const existing = await this.kgService.getNode(entity.id);
            if (!existing) {
              // Calculate confidence based on source and result quality
              const confidence = this.calculateConfidence(result, query);
              
              discoveredEntities.push({
                entity,
                sourceUrl: result.url || '',
                confidence,
                searchQuery,
              });
            }
          }

          if (discoveredEntities.length >= maxResults) {
            break;
          }
        }

        if (discoveredEntities.length >= maxResults) {
          break;
        }
      } catch (error) {
        logger.warn({ error, searchQuery }, 'Web search failed for query');
      }
    }

    logger.info({ count: discoveredEntities.length }, 'Entity discovery completed');
    return discoveredEntities.slice(0, maxResults);
  }

  /**
   * Build search queries based on entity discovery query
   */
  private buildSearchQueries(query: EntityDiscoveryQuery): string[] {
    const queries: string[] = [];

    // Policy documents
    if (query.entityType === 'PolicyDocument' || !query.entityType) {
      if (query.jurisdiction && query.topic) {
        queries.push(`"${query.jurisdiction}" "${query.topic}" site:overheid.nl`);
        queries.push(`"${query.jurisdiction}" "${query.topic}" bestemmingsplan`);
      }
      if (query.entityName) {
        queries.push(`"${query.entityName}" site:overheid.nl`);
      }
    }

    // Regulations
    if (query.entityType === 'Regulation' || !query.entityType) {
      if (query.topic) {
        queries.push(`"${query.topic}" regelgeving site:overheid.nl`);
        queries.push(`"${query.topic}" wetgeving`);
      }
      if (query.entityName) {
        queries.push(`"${query.entityName}" regelgeving`);
      }
    }

    // Spatial units
    if (query.entityType === 'SpatialUnit' || !query.entityType) {
      if (query.location) {
        queries.push(`"${query.location}" bestemmingsplan site:overheid.nl`);
        queries.push(`"${query.location}" ruimtelijke ordening`);
      }
      if (query.jurisdiction) {
        queries.push(`"${query.jurisdiction}" bestemmingsplan`);
      }
    }

    // General search
    if (query.entityName) {
      queries.push(`"${query.entityName}" +beleid +regelgeving`);
    }

    return queries.length > 0 ? queries : ['beleid regelgeving site:overheid.nl'];
  }

  /**
   * Extract entity from search result
   */
  private extractEntityFromResult(
    result: { title?: string; snippet?: string; url?: string },
    query: EntityDiscoveryQuery
  ): BaseEntity | null {
    if (!result.title) {
      return null;
    }

    // Determine entity type
    const entityType = query.entityType || this.inferEntityType(result.title, result.snippet);

    // Create entity ID from URL or title
    const entityId = this.generateEntityId(result.url || result.title, entityType);

    const entity: BaseEntity = {
      id: entityId,
      type: entityType,
      name: result.title,
      description: result.snippet,
      metadata: {
        source: result.url,
        discoveredAt: new Date().toISOString(),
        discoveryMethod: 'web_search',
      },
    };

    // Add type-specific properties
    if (entityType === 'PolicyDocument' && result.url) {
      (entity as any).url = result.url;
    }

    return entity;
  }

  /**
   * Infer entity type from title and snippet
   */
  private inferEntityType(title: string, snippet?: string): EntityType {
    const text = `${title} ${snippet || ''}`.toLowerCase();

    if (text.includes('bestemmingsplan') || text.includes('ruimtelijk plan')) {
      return 'PolicyDocument';
    }

    if (text.includes('regelgeving') || text.includes('wet') || text.includes('verordening')) {
      return 'Regulation';
    }

    if (text.includes('gebied') || text.includes('zone') || text.includes('locatie')) {
      return 'SpatialUnit';
    }

    if (text.includes('bestemming') || text.includes('functie')) {
      return 'LandUse';
    }

    // Default to PolicyDocument
    return 'PolicyDocument';
  }

  /**
   * Generate entity ID from URL or title
   */
  private generateEntityId(urlOrTitle: string, entityType: EntityType): string {
    if (urlOrTitle.startsWith('http://') || urlOrTitle.startsWith('https://')) {
      // Use URL as base for ID
      const url = new URL(urlOrTitle);
      return `${entityType.toLowerCase()}-${url.hostname.replace(/\./g, '-')}-${url.pathname.replace(/[^a-zA-Z0-9]/g, '-')}`.slice(0, 200);
    } else {
      // Use title as base for ID
      return `${entityType.toLowerCase()}-${urlOrTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`.slice(0, 200);
    }
  }

  /**
   * Calculate confidence score for discovered entity
   */
  private calculateConfidence(
    result: { url?: string; title?: string; snippet?: string },
    query: EntityDiscoveryQuery
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost for official sources
    if (result.url) {
      const officialPatterns = [
        /\.(nl|be|eu)$/i,
        /overheid\.nl/i,
        /gemeente\./i,
        /provincie\./i,
        /rijksoverheid\.nl/i,
      ];

      if (officialPatterns.some(pattern => pattern.test(result.url!))) {
        confidence += 0.3;
      }
    }

    // Boost if query matches result
    if (query.entityName && result.title?.toLowerCase().includes(query.entityName.toLowerCase())) {
      confidence += 0.1;
    }

    if (query.topic && result.snippet?.toLowerCase().includes(query.topic.toLowerCase())) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }
}
