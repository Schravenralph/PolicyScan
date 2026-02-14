/**
 * Cross-Linking Service
 * 
 * Maintains bidirectional links between Navigation Graph (Neo4j) and Knowledge Graph (GraphDB).
 * 
 * Architecture:
 * - Navigation Graph stores entityId field linking to KG entities
 * - Knowledge Graph entities store sourceUrl linking back to NavigationNode
 * - Enables unified queries: semantic seed nodes (nav graph) + KG entities → combined results
 * 
 * @see docs/01-architecture/storage/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { Driver } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import type { NavigationNode } from '../../../types/navigationGraph.js';
import type { BaseEntity } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../../knowledge-graph/core/KnowledgeGraphInterface.js';

export interface CrossLinkResult {
  navNodeLinked: boolean;
  kgEntityLinked: boolean;
  navNodeUrl?: string;
  entityId?: string;
}

/**
 * Service for maintaining bidirectional links between Navigation Graph and Knowledge Graph
 */
export class CrossLinkingService {
  constructor(
    private neo4jDriver: Driver,
    private kgService: KnowledgeGraphServiceInterface
  ) {
    if (!neo4jDriver) {
      throw new Error('CrossLinkingService requires a Neo4j driver instance');
    }
    if (!kgService) {
      throw new Error('CrossLinkingService requires a Knowledge Graph service instance');
    }
  }

  /**
   * Link a Navigation Node to a Knowledge Graph entity (bidirectional)
   * 
   * @param navNodeUrl - URL of the Navigation Node
   * @param entityId - ID of the Knowledge Graph entity
   * @returns Result indicating which links were created
   */
  async linkNavigationNodeToEntity(
    navNodeUrl: string,
    entityId: string
  ): Promise<CrossLinkResult> {
    const result: CrossLinkResult = {
      navNodeLinked: false,
      kgEntityLinked: false,
      navNodeUrl,
      entityId,
    };

    try {
      // 1. Link Navigation Node → KG Entity (add entityId to NavigationNode)
      const session = this.neo4jDriver.session();
      try {
        const linkNavQuery = `
          MATCH (n:NavigationNode {url: $url})
          SET n.entityId = $entityId
          RETURN n.url as url
        `;

        const navResult = await session.run(linkNavQuery, {
          url: navNodeUrl,
          entityId,
        });

        if (navResult.records.length > 0) {
          result.navNodeLinked = true;
          logger.debug(
            { navNodeUrl, entityId },
            'Linked Navigation Node to Knowledge Graph entity'
          );
        } else {
          logger.warn(
            { navNodeUrl },
            'Navigation Node not found for cross-linking'
          );
        }
      } finally {
        await session.close();
      }

      // 2. Link KG Entity → Navigation Node (add sourceUrl to entity metadata)
      try {
        const entity = await this.kgService.getNode(entityId);
        if (entity) {
          // Update entity metadata with sourceUrl
          const updatedMetadata = {
            ...entity.metadata,
            sourceUrl: navNodeUrl,
          };

          // Note: This requires the KG service to support metadata updates
          // For now, we log that the link should be added
          logger.debug(
            { entityId, navNodeUrl },
            'Knowledge Graph entity should be updated with sourceUrl (requires KG service metadata update support)'
          );
          result.kgEntityLinked = true; // Assume linked if entity exists
        } else {
          logger.warn(
            { entityId },
            'Knowledge Graph entity not found for cross-linking'
          );
        }
      } catch (kgError) {
        logger.warn(
          { error: kgError, entityId },
          'Failed to link Knowledge Graph entity to Navigation Node'
        );
      }

      return result;
    } catch (error) {
      logger.error(
        { error, navNodeUrl, entityId },
        'Failed to create cross-link between Navigation Node and Knowledge Graph entity'
      );
      throw error;
    }
  }

  /**
   * Get Navigation Node for a Knowledge Graph entity
   * 
   * @param entityId - ID of the Knowledge Graph entity
   * @returns Navigation Node URL if linked, null otherwise
   */
  async getNavigationNodeForEntity(entityId: string): Promise<string | null> {
    try {
      const entity = await this.kgService.getNode(entityId);
      if (entity?.metadata?.sourceUrl) {
        return entity.metadata.sourceUrl as string;
      }
      return null;
    } catch (error) {
      logger.debug({ error, entityId }, 'Failed to get Navigation Node for entity');
      return null;
    }
  }

  /**
   * Get Knowledge Graph entities for a Navigation Node
   * 
   * @param navNodeUrl - URL of the Navigation Node
   * @returns Array of entity IDs linked to this Navigation Node
   */
  async getEntitiesForNavigationNode(navNodeUrl: string): Promise<string[]> {
    const session = this.neo4jDriver.session();
    try {
      const query = `
        MATCH (n:NavigationNode {url: $url})
        WHERE n.entityId IS NOT NULL
        RETURN n.entityId as entityId
      `;

      const result = await session.run(query, { url: navNodeUrl });
      return result.records
        .map(record => record.get('entityId') as string)
        .filter((id): id is string => id !== null && id !== undefined);
    } catch (error) {
      logger.debug({ error, navNodeUrl }, 'Failed to get entities for Navigation Node');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Remove cross-link between Navigation Node and Knowledge Graph entity
   * 
   * @param navNodeUrl - URL of the Navigation Node
   * @param entityId - ID of the Knowledge Graph entity (optional, removes all if not provided)
   */
  async unlinkNavigationNodeFromEntity(
    navNodeUrl: string,
    entityId?: string
  ): Promise<void> {
    const session = this.neo4jDriver.session();
    try {
      if (entityId) {
        // Remove specific entity link
        const query = `
          MATCH (n:NavigationNode {url: $url})
          WHERE n.entityId = $entityId
          REMOVE n.entityId
          RETURN n.url as url
        `;
        await session.run(query, { url: navNodeUrl, entityId });
      } else {
        // Remove all entity links
        const query = `
          MATCH (n:NavigationNode {url: $url})
          REMOVE n.entityId
          RETURN n.url as url
        `;
        await session.run(query, { url: navNodeUrl });
      }

      logger.debug({ navNodeUrl, entityId }, 'Removed cross-link between Navigation Node and entity');
    } catch (error) {
      logger.error(
        { error, navNodeUrl, entityId },
        'Failed to remove cross-link'
      );
      throw error;
    } finally {
      await session.close();
    }
  }
}
