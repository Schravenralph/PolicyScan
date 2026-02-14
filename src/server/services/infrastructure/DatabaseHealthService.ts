/**
 * Database Health Service
 * 
 * Provides comprehensive health check functionality for database connections.
 */

import { isDBConnected, ensureDBConnection, getConnectionPoolStatus } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import {
  mongodbHealthCheckLatency,
  mongodbConnectionState,
  // connectionPoolSize, // Unused
} from '../../utils/metrics.js';

export interface DatabaseHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    connection: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
    pool: {
      healthy: boolean;
      message?: string;
      status?: ReturnType<typeof getConnectionPoolStatus>;
    };
    operations: {
      healthy: boolean;
      message?: string;
    };
  };
  metrics?: {
    poolSize?: number;
    activeConnections?: number;
    idleConnections?: number;
  };
}

export class DatabaseHealthService {
  /**
   * Perform comprehensive database health check
   */
  static async checkHealth(): Promise<DatabaseHealthStatus> {
    const timestamp = new Date().toISOString();
    const checks = {
      connection: await this.checkConnection(),
      pool: await this.checkConnectionPool(),
      operations: await this.checkOperations(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    // Update metrics
    mongodbConnectionState.set(healthy ? 1 : 0);

    return {
      healthy,
      timestamp,
      checks,
      metrics: checks.pool.status?.metrics ? {
        poolSize: checks.pool.status.metrics.estimatedCurrentPoolSize ?? 0,
        activeConnections: checks.pool.status.metrics.activeConnections,
        idleConnections: undefined, // MongoDB doesn't track idle connections separately
      } : undefined,
    };
  }

  /**
   * Check database connection health
   */
  private static async checkConnection(): Promise<DatabaseHealthStatus['checks']['connection']> {
    const startTime = Date.now();
    
    try {
      // Check if connection is initialized
      if (!isDBConnected()) {
        return {
          healthy: false,
          message: 'Database connection not initialized',
        };
      }

      // Try to ensure connection is active
      const db = await ensureDBConnection();
      
      // Perform ping to verify connection
      await db.command({ ping: 1 });
      
      const latency = Date.now() - startTime;
      
      // Record latency metric
      mongodbHealthCheckLatency.observe(latency);
      
      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ error, latency }, 'Database connection health check failed');
      
      return {
        healthy: false,
        message: errorMessage,
        latency,
      };
    }
  }

  /**
   * Check connection pool health
   */
  private static checkConnectionPool(): DatabaseHealthStatus['checks']['pool'] {
    try {
      const poolStatus = getConnectionPoolStatus();
      
      if (!poolStatus) {
        return {
          healthy: false,
          message: 'Connection pool status unavailable',
        };
      }

      // Check if pool is exhausted (more than 90% of max connections)
      const maxConnections = poolStatus.maxPoolSize || 100;
      const estimatedPoolSize = poolStatus.metrics?.estimatedCurrentPoolSize ?? 0;
      const usagePercent = (estimatedPoolSize / maxConnections) * 100;
      
      if (usagePercent > 90) {
        return {
          healthy: false,
          message: `Connection pool near exhaustion: ${usagePercent.toFixed(1)}% used`,
          status: poolStatus,
        };
      }

      // Check if there are too many active connections (more than 80% of total)
      const totalConnections = poolStatus.metrics?.totalConnectionsCreated ?? 0;
      const activeConnections = poolStatus.metrics?.activeConnections ?? 0;
      const activePercent = totalConnections > 0
        ? (activeConnections / totalConnections) * 100
        : 0;
      
      if (activePercent > 80 && totalConnections > 10) {
        return {
          healthy: true,
          message: `High active connection usage: ${activePercent.toFixed(1)}%`,
          status: poolStatus,
        };
      }

      return {
        healthy: true,
        status: poolStatus,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check connection pool health');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if database operations are working
   */
  private static async checkOperations(): Promise<DatabaseHealthStatus['checks']['operations']> {
    try {
      const db = await ensureDBConnection();
      
      // Try a simple operation (listCollections)
      const collections = await db.listCollections({}).toArray();
      // Just check that we got a result (even if empty)
      if (!Array.isArray(collections)) {
        throw new Error('listCollections did not return an array');
      }
      
      return {
        healthy: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Database operations health check failed');
      
      return {
        healthy: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Quick health check (returns boolean)
   */
  static async quickHealthCheck(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Get connection pool metrics
   */
  static getPoolMetrics(): {
    poolSize?: number;
    activeConnections?: number;
    idleConnections?: number;
    usagePercent?: number;
  } | null {
    try {
      const poolStatus = getConnectionPoolStatus();
      if (!poolStatus) {
        return null;
      }

      const maxConnections = poolStatus.maxPoolSize || 100;
      const estimatedPoolSize = poolStatus.metrics?.estimatedCurrentPoolSize ?? 0;
      const usagePercent = (estimatedPoolSize / maxConnections) * 100;

      return {
        poolSize: estimatedPoolSize,
        activeConnections: poolStatus.metrics?.activeConnections ?? 0,
        idleConnections: undefined, // MongoDB doesn't track idle connections separately
        usagePercent,
      };
    } catch {
      return null;
    }
  }
}


