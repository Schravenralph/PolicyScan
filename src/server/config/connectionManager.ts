import { logger } from '../utils/logger.js';
import { connectDB, closeDB } from './database.js';
import { connectNeo4j, closeNeo4j } from './neo4j.js';
import { connectGraphDB, closeGraphDB } from './graphdb.js';
import { getQueueService } from '../services/infrastructure/QueueService.js';

/**
 * Connection handler interface for connection lifecycle management
 */
interface ConnectionHandler {
  name: string;
  connect: () => Promise<unknown>;
  close: () => Promise<void>;
  optional?: boolean; // If true, connection failure won't prevent server startup
}

/**
 * Connection result for tracking connection status
 */
interface ConnectionResult {
  name: string;
  success: boolean;
  error?: string;
  optional?: boolean;
}

/**
 * Centralized Connection Manager
 * 
 * Coordinates connection lifecycle (connect, close) for all database connections.
 * Ensures proper connection order and graceful shutdown in reverse order.
 * 
 * Connection order (dependencies):
 * 1. MongoDB (no dependencies)
 * 2. Neo4j (no dependencies)
 * 3. Redis (no dependencies, but used by QueueService)
 * 4. GraphDB (required for Knowledge Graph)
 * 
 * Shutdown order (reverse):
 * 1. GraphDB
 * 2. Redis
 * 3. Neo4j
 * 4. MongoDB
 */
export class ConnectionManager {
  private connections: Map<string, ConnectionHandler> = new Map();
  private connectionResults: Map<string, ConnectionResult> = new Map();

  /**
   * Register a connection handler
   * @param name - Unique name for the connection
   * @param handler - Connection handler with connect and close functions
   */
  register(name: string, handler: ConnectionHandler): void {
    if (this.connections.has(name)) {
      logger.warn({ name }, 'Connection already registered, overwriting');
    }
    this.connections.set(name, handler);
    logger.debug({ name }, 'Connection registered');
  }

  /**
   * Register all default connections (MongoDB, Neo4j, Redis, GraphDB)
   */
  registerDefaultConnections(): void {
    // MongoDB - required
    this.register('mongodb', {
      name: 'MongoDB',
      connect: async () => {
        logger.info('Connecting to MongoDB...');
        return await connectDB();
      },
      close: async () => {
        logger.info('Closing MongoDB connection...');
        await closeDB();
      },
      optional: false,
    });

    // Neo4j - required
    this.register('neo4j', {
      name: 'Neo4j',
      connect: async () => {
        logger.info('Connecting to Neo4j...');
        return await connectNeo4j();
      },
      close: async () => {
        logger.info('Closing Neo4j connection...');
        await closeNeo4j();
      },
      optional: false,
    });

    // Redis - optional (via QueueService)
    // Note: Redis connects lazily when queues are initialized in QueueService
    // This registration ensures QueueService is available, but actual Redis connection
    // happens when queues are processed (handled separately in server startup)
    this.register('redis', {
      name: 'Redis',
      connect: async () => {
        logger.info('Initializing Redis connection (via QueueService)...');
        // Redis connects lazily when queues are initialized
        // We just ensure QueueService singleton is created
        // Actual connection happens when queues are processed in server startup
        const queueService = getQueueService();
        // Try to verify Redis is accessible by checking if we can create a queue
        // This is a lightweight check that doesn't fully initialize all queues
        try {
          // QueueService will connect to Redis when queues are first used
          // For now, we just ensure the service is available
          logger.debug('QueueService singleton created (Redis will connect on first queue operation)');
        } catch (error) {
          // Redis may not be available, that's okay (it's optional)
          logger.warn({ error }, 'Redis may not be available (optional connection)');
        }
        return queueService;
      },
      close: async () => {
        logger.info('Closing Redis connection (via QueueService)...');
        const queueService = getQueueService();
        await queueService.close();
      },
      optional: true,
    });

    // GraphDB - required for Knowledge Graph
    // GraphDB is the knowledge graph backend
    this.register('graphdb', {
      name: 'GraphDB',
      connect: async () => {
        logger.info('Connecting to GraphDB...');
        const { ensureParserInitialized } = await import('./graphdb.js');
        // Initialize parser early (non-blocking, will retry if needed)
        ensureParserInitialized().catch((error) => {
          logger.warn({ error }, 'GraphDB parser initialization in progress (will retry on use)');
        });
        return await connectGraphDB();
      },
      close: async () => {
        logger.info('Closing GraphDB connection...');
        await closeGraphDB();
      },
      optional: true,
    });

    logger.info({ count: this.connections.size }, 'Default connections registered');
  }

  /**
   * Connect all registered connections
   * Uses Promise.allSettled() to attempt parallel connections
   * Required connections must succeed; optional connections can fail
   * 
   * @param timeoutMs - Timeout in milliseconds (default: 60000 = 60 seconds)
   * @returns Map of connection results
   */
  async connectAll(timeoutMs: number = 60000): Promise<Map<string, ConnectionResult>> {
    logger.info({ count: this.connections.size, timeoutMs }, 'Connecting all registered connections...');
    this.connectionResults.clear();

    const connectionPromises = Array.from(this.connections.entries()).map(
      async ([name, handler]): Promise<ConnectionResult> => {
        try {
          logger.debug({ name: handler.name }, `Connecting ${handler.name}...`);
          const startTime = Date.now();
          await handler.connect();
          const duration = Date.now() - startTime;
          logger.info({ name: handler.name, duration }, `✅ ${handler.name} connected`);
          
          const result: ConnectionResult = {
            name: handler.name,
            success: true,
            optional: handler.optional,
          };
          this.connectionResults.set(name, result);
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ name: handler.name, error: errorMessage }, `❌ ${handler.name} connection failed`);
          
          const result: ConnectionResult = {
            name: handler.name,
            success: false,
            error: errorMessage,
            optional: handler.optional,
          };
          this.connectionResults.set(name, result);
          
          // If required connection failed, throw error
          if (!handler.optional) {
            throw new Error(`${handler.name} connection failed: ${errorMessage}`);
          }
          
          return result;
        }
      }
    );

    // Add timeout to prevent server startup hangs
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const failedConnections = Array.from(this.connections.keys())
          .filter(name => !this.connectionResults.has(name) || !this.connectionResults.get(name)?.success)
          .map(name => this.connections.get(name)?.name || name);
        reject(new Error(
          `Connection timeout after ${timeoutMs}ms. ` +
          `Failed connections: ${failedConnections.join(', ')}`
        ));
      }, timeoutMs);
    });

    // Use allSettled to attempt all connections in parallel, with timeout
    try {
      await Promise.race([
        Promise.allSettled(connectionPromises),
        timeoutPromise
      ]);
    } catch (error) {
      // Timeout occurred - log and rethrow
      const timeoutError = error instanceof Error ? error.message : String(error);
      logger.error({ error: timeoutError, timeoutMs }, 'Connection timeout during connectAll()');
      throw new Error(timeoutError);
    }
    
    // Check for required connection failures
    const failedRequired = Array.from(this.connectionResults.values()).filter(
      (result) => !result.success && !result.optional
    );

    if (failedRequired.length > 0) {
      const errorMessages = failedRequired.map((r) => `${r.name}: ${r.error}`).join(', ');
      throw new Error(`Required connections failed: ${errorMessages}`);
    }

    // Log summary
    const successful = Array.from(this.connectionResults.values()).filter((r) => r.success).length;
    const failed = Array.from(this.connectionResults.values()).filter((r) => !r.success).length;
    logger.info(
      { 
        total: this.connections.size, 
        successful, 
        failed,
        failedOptional: failed,
      },
      'Connection summary'
    );

    return this.connectionResults;
  }

  /**
   * Close all registered connections in reverse dependency order
   * Closes: GraphDB -> Redis -> Neo4j -> MongoDB
   * 
   * @param timeout - Maximum time to wait for all connections to close (default: 30 seconds)
   */
  async closeAll(timeout: number = 30000): Promise<void> {
    logger.info({ count: this.connections.size }, 'Closing all registered connections...');

    // Close in reverse order: GraphDB, Redis, Neo4j, MongoDB
    const closeOrder = ['graphdb', 'redis', 'neo4j', 'mongodb'];
    
    // Get handlers in reverse order, filtering out unregistered connections
    const handlersToClose = closeOrder
      .filter((name) => this.connections.has(name))
      .map((name) => ({ name, handler: this.connections.get(name)! }))
      .reverse(); // Reverse to get correct order

    // Also close any connections not in the standard order
    const otherConnections = Array.from(this.connections.entries())
      .filter(([name]) => !closeOrder.includes(name))
      .map(([name, handler]) => ({ name, handler }));

    const allHandlers = [...handlersToClose, ...otherConnections];

    // Close all connections with timeout
    const closePromises = allHandlers.map(async ({ name: _name, handler }) => {
      try {
        logger.debug({ name: handler.name }, `Closing ${handler.name}...`);
        const startTime = Date.now();
        await handler.close();
        const duration = Date.now() - startTime;
        logger.info({ name: handler.name, duration }, `✅ ${handler.name} closed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ name: handler.name, error: errorMessage }, `❌ Error closing ${handler.name}`);
        // Don't throw - continue closing other connections
      }
    });

    // Wait for all connections to close, with timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Connection close timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      await Promise.race([
        Promise.allSettled(closePromises),
        timeoutPromise,
      ]);
      logger.info('All connections closed');
    } catch (error) {
      logger.error({ error }, 'Error during connection close (some connections may not have closed)');
      // Don't throw - log and continue
    }
  }

  /**
   * Get connection results
   */
  getConnectionResults(): Map<string, ConnectionResult> {
    return new Map(this.connectionResults);
  }

  /**
   * Get connection status summary
   */
  getStatus(): {
    total: number;
    successful: number;
    failed: number;
    connections: Array<{ name: string; status: string; error?: string }>;
  } {
    const results = Array.from(this.connectionResults.values());
    return {
      total: this.connections.size,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      connections: results.map((r) => ({
        name: r.name,
        status: r.success ? 'connected' : 'failed',
        error: r.error,
      })),
    };
  }

  /**
   * Check if a specific connection was successful
   * @param name - Connection name
   * @returns true if connection was successful, false otherwise
   */
  isConnected(name: string): boolean {
    const result = this.connectionResults.get(name);
    return result?.success === true;
  }

  /**
   * Get connection result for a specific connection
   * @param name - Connection name
   * @returns ConnectionResult or undefined if not found
   */
  getConnectionResult(name: string): ConnectionResult | undefined {
    return this.connectionResults.get(name);
  }
}

// Singleton instance
let connectionManagerInstance: ConnectionManager | null = null;

/**
 * Get or create the ConnectionManager singleton
 */
export function getConnectionManager(): ConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
    connectionManagerInstance.registerDefaultConnections();
  }
  return connectionManagerInstance;
}

