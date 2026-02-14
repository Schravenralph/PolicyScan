/**
 * Registry for mock services
 * 
 * Provides a centralized way to register and retrieve mock services.
 * Allows enabling/disabling mocks globally or per-service.
 */

import { MockServiceBase } from './MockServiceBase.js';

type ServiceName = string;
type MockService = MockServiceBase;

class MockServiceRegistry {
  private services: Map<ServiceName, MockService> = new Map();
  private globalEnabled: boolean = false;

  /**
   * Register a mock service
   */
  register(name: string, service: MockService): void {
    this.services.set(name, service);
    // Set enabled state based on global setting
    service.setEnabled(this.globalEnabled);
  }

  /**
   * Get a registered mock service
   */
  get(name: string): MockService | undefined {
    return this.services.get(name);
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Enable or disable all mock services globally
   */
  setGlobalEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
    for (const service of this.services.values()) {
      service.setEnabled(enabled);
    }
  }

  /**
   * Enable or disable a specific mock service
   */
  setServiceEnabled(name: string, enabled: boolean): void {
    const service = this.services.get(name);
    if (service) {
      service.setEnabled(enabled);
    }
  }

  /**
   * Check if mocks are globally enabled
   */
  isGlobalEnabled(): boolean {
    return this.globalEnabled;
  }

  /**
   * Clear all registered services
   */
  clear(): void {
    this.services.clear();
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}

// Singleton instance
let registryInstance: MockServiceRegistry | null = null;

/**
 * Get the global mock service registry
 */
export function getMockServiceRegistry(): MockServiceRegistry {
  if (!registryInstance) {
    registryInstance = new MockServiceRegistry();
    // Initialize from environment variables
    const useMocks = process.env.USE_MOCK_SERVICES === 'true';
    registryInstance.setGlobalEnabled(useMocks);
  }
  return registryInstance;
}



