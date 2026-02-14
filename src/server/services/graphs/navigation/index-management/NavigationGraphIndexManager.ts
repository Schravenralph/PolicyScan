import { Driver } from 'neo4j-driver';
import { logger } from '../../../../utils/logger.js';

/**
 * Index definitions for NavigationGraph
 */
export const NAVIGATION_GRAPH_INDEXES = {
  // Constraints
  URL_UNIQUE: 'navigation_node_url_unique',
  
  // Standard indexes
  TYPE: 'navigation_node_type_idx',
  URI: 'navigation_node_uri_idx',
  FILEPATH: 'navigation_node_filepath_idx',
  SCHEMA_TYPE: 'navigation_node_schematype_idx',
  SOURCE_URL: 'navigation_node_sourceurl_idx',
  LAST_VISITED: 'navigation_node_lastvisited_idx',
  UPDATED_AT: 'navigation_node_updatedat_idx',
  CREATED_AT: 'navigation_node_createdat_idx',
  
  // Vector index
  EMBEDDING: 'navigation_node_embedding_idx'
} as const;

/**
 * Expected indexes and constraints for NavigationGraph
 */
export const EXPECTED_INDEXES = [
  NAVIGATION_GRAPH_INDEXES.URL_UNIQUE,
  NAVIGATION_GRAPH_INDEXES.TYPE,
  NAVIGATION_GRAPH_INDEXES.URI,
  NAVIGATION_GRAPH_INDEXES.EMBEDDING,
  NAVIGATION_GRAPH_INDEXES.FILEPATH,
  NAVIGATION_GRAPH_INDEXES.SCHEMA_TYPE,
  NAVIGATION_GRAPH_INDEXES.SOURCE_URL,
  NAVIGATION_GRAPH_INDEXES.LAST_VISITED,
  NAVIGATION_GRAPH_INDEXES.UPDATED_AT,
  NAVIGATION_GRAPH_INDEXES.CREATED_AT
] as const;

/**
 * Service for managing NavigationGraph indexes and constraints in Neo4j
 */
export class NavigationGraphIndexManager {
  private driver: Driver;

  constructor(driver: Driver) {
    if (!driver) {
      throw new Error('NavigationGraphIndexManager requires a Neo4j driver instance');
    }
    this.driver = driver;
  }

  /**
   * Create all indexes and constraints for NavigationGraph
   */
  async createIndexes(): Promise<void> {
    const session = this.driver.session();
    try {
      // Create unique constraint on url
      await session.run(`
        CREATE CONSTRAINT ${NAVIGATION_GRAPH_INDEXES.URL_UNIQUE} IF NOT EXISTS
        FOR (n:NavigationNode) REQUIRE n.url IS UNIQUE
      `).catch(() => {
        // Constraint might already exist
      });

      // Create standard indexes
      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.TYPE} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.type)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.URI} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.uri)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.FILEPATH} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.filePath)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.SCHEMA_TYPE} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.schemaType)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.SOURCE_URL} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.sourceUrl)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.LAST_VISITED} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.lastVisited)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.UPDATED_AT} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.updatedAt)
      `).catch(() => {
        // Index might already exist
      });

      await session.run(`
        CREATE INDEX ${NAVIGATION_GRAPH_INDEXES.CREATED_AT} IF NOT EXISTS
        FOR (n:NavigationNode) ON (n.createdAt)
      `).catch(() => {
        // Index might already exist
      });

      // Create vector index for semantic search (384 dimensions for all-MiniLM-L6-v2)
      await session.run(`
        CREATE VECTOR INDEX ${NAVIGATION_GRAPH_INDEXES.EMBEDDING} IF NOT EXISTS
        FOR (n:NavigationNode) ON n.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 384,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `).catch((err) => {
        // Index might already exist or vector index not supported
        logger.warn('Vector index creation failed (may already exist or not supported):', err);
      });

      logger.info('✅ NavigationGraph indexes and constraints created');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error }, '❌ Failed to create NavigationGraph indexes');
      throw new Error(`Failed to create NavigationGraph indexes: ${errorMsg}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Get statistics and health information for all indexes
   */
  async getIndexStatistics(): Promise<{
    indexes: Array<{
      name: string;
      type: string;
      state: string;
      populationPercent: number;
      properties: string[];
    }>;
    constraints: Array<{
      name: string;
      type: string;
      properties: string[];
    }>;
  }> {
    const session = this.driver.session();
    try {
      // Get all indexes
      const indexResult = await session.run(`
        SHOW INDEXES
        YIELD name, type, state, populationPercent, properties
        WHERE name STARTS WITH 'navigation_node_'
        RETURN name, type, state, populationPercent, properties
        ORDER BY name
      `);

      const indexes = indexResult.records.map(record => ({
        name: record.get('name'),
        type: record.get('type'),
        state: record.get('state'),
        populationPercent: record.get('populationPercent')?.toNumber() || 0,
        properties: record.get('properties') || []
      }));

      // Get all constraints
      const constraintResult = await session.run(`
        SHOW CONSTRAINTS
        YIELD name, type, properties
        WHERE name STARTS WITH 'navigation_node_'
        RETURN name, type, properties
        ORDER BY name
      `);

      const constraints = constraintResult.records.map(record => ({
        name: record.get('name'),
        type: record.get('type'),
        properties: record.get('properties') || []
      }));

      return { indexes, constraints };
    } finally {
      await session.close();
    }
  }

  /**
   * Verify that all expected indexes exist and are online
   */
  async verifyIndexes(): Promise<{
    allPresent: boolean;
    allOnline: boolean;
    missing: string[];
    offline: string[];
    details: Array<{
      name: string;
      state: string;
      populationPercent: number;
    }>;
  }> {
    const stats = await this.getIndexStatistics();
    new Set([
      ...stats.indexes.map(i => i.name),
      ...stats.constraints.map(c => c.name)
    ]);

    const missing: string[] = [];
    const offline: string[] = [];
    const details: Array<{ name: string; state: string; populationPercent: number }> = [];

    for (const expectedName of EXPECTED_INDEXES) {
      const index = stats.indexes.find(i => i.name === expectedName);
      const constraint = stats.constraints.find(c => c.name === expectedName);

      if (!index && !constraint) {
        missing.push(expectedName);
        details.push({
          name: expectedName,
          state: 'MISSING',
          populationPercent: 0
        });
      } else if (index) {
        details.push({
          name: expectedName,
          state: index.state,
          populationPercent: index.populationPercent
        });
        if (index.state !== 'ONLINE') {
          offline.push(expectedName);
        }
      } else if (constraint) {
        // Constraints are always "online" if they exist
        details.push({
          name: expectedName,
          state: 'ONLINE',
          populationPercent: 100
        });
      }
    }

    return {
      allPresent: missing.length === 0,
      allOnline: offline.length === 0,
      missing,
      offline,
      details
    };
  }
}



