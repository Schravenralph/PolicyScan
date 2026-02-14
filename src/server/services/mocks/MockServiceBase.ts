/**
 * Base class for all mock services
 * 
 * Provides common functionality for mock services including:
 * - Response management
 * - Error scenario handling
 * - Enable/disable functionality
 */

export abstract class MockServiceBase<TResponse = unknown, TError = Error> {
  protected responses: Map<string, TResponse> = new Map();
  protected errorScenarios: Map<string, TError> = new Map();
  protected enabled: boolean = true;
  protected defaultResponse: TResponse | null = null;
  protected defaultError: TError | null = null;

  /**
   * Get the service name (for logging/debugging)
   */
  abstract getServiceName(): string;

  /**
   * Set a mock response for a specific key/scenario
   */
  setResponse(key: string, response: TResponse): void {
    this.responses.set(key, response);
  }

  /**
   * Set a default response (used when no specific response is found)
   */
  setDefaultResponse(response: TResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Get a mock response for a specific key, or default if not found
   */
  protected getResponse(key: string): TResponse | null {
    return this.responses.get(key) ?? this.defaultResponse;
  }

  /**
   * Set an error scenario for a specific key
   */
  setError(key: string, error: TError): void {
    this.errorScenarios.set(key, error);
  }

  /**
   * Set a default error (used when no specific error is found)
   */
  setDefaultError(error: TError): void {
    this.defaultError = error;
  }

  /**
   * Get an error for a specific key, or default if not found
   */
  protected getError(key: string): TError | null {
    return this.errorScenarios.get(key) ?? this.defaultError;
  }

  /**
   * Check if an error scenario exists for a key
   */
  protected hasError(key: string): boolean {
    return this.errorScenarios.has(key) || this.defaultError !== null;
  }

  /**
   * Clear all responses
   */
  clearResponses(): void {
    this.responses.clear();
    this.defaultResponse = null;
  }

  /**
   * Clear all error scenarios
   */
  clearErrors(): void {
    this.errorScenarios.clear();
    this.defaultError = null;
  }

  /**
   * Clear all mock data
   */
  clearAll(): void {
    this.clearResponses();
    this.clearErrors();
  }

  /**
   * Check if mock service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable the mock service
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Simulate a delay (useful for testing timeout scenarios)
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}



