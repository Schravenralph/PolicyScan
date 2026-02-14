/**
 * Graph Health Service
 * 
 * Provides health checks for the navigation graph integration.
 */

import type { NavigationGraph } from './NavigationGraph.js';

export interface GraphHealthStatus {
  healthy: boolean;
  available: boolean;
  initialized: boolean;
  connectivity: boolean;
  queryCapable: boolean;
  errors: string[];
  warnings: string[];
  lastChecked: string;
}

export class GraphHealthService {
  private navigationGraph: NavigationGraph | null;

  constructor(navigationGraph: NavigationGraph | null) {
    this.navigationGraph = navigationGraph;
  }

  /**
   * Check the health of the navigation graph
   */
  async checkHealth(): Promise<GraphHealthStatus> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if graph is available
    if (!this.navigationGraph) {
      return {
        healthy: false,
        available: false,
        initialized: false,
        connectivity: false,
        queryCapable: false,
        errors: ['Navigation graph is not available'],
        warnings: [],
        lastChecked: new Date().toISOString(),
      };
    }

    let initialized = false;
    let connectivity = false;
    let queryCapable = false;

    // Check initialization
    try {
      // Try to access a property that requires initialization
      // NavigationGraph doesn't expose initialized state, so we test with a query
      await this.navigationGraph.getNodeCount();
      initialized = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Graph initialization check failed: ${errorMsg}`);
    }

    // Check connectivity
    try {
      // Try a simple query
      await this.navigationGraph.getNodeCount();
      connectivity = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Graph connectivity check failed: ${errorMsg}`);
    }

    // Check query capability
    try {
      // Try a more complex query
      const stats = await this.navigationGraph.getStatistics();
      if (stats) {
        queryCapable = true;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      warnings.push(`Graph query capability check failed: ${errorMsg}`);
      // Query capability is a warning, not an error
    }

    const healthy = initialized && connectivity && errors.length === 0;

    return {
      healthy,
      available: true,
      initialized,
      connectivity,
      queryCapable,
      errors,
      warnings,
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * Check if graph is available and healthy
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.checkHealth();
    return health.healthy;
  }

  /**
   * Check if graph is available (may not be healthy)
   */
  isAvailable(): boolean {
    return this.navigationGraph !== null;
  }
}


