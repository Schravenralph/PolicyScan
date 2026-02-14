/**
 * Circuit Breaker Service
 * 
 * Implements circuit breaker pattern to prevent cascading failures
 * when a source is repeatedly failing.
 */

export enum CircuitState {
  CLOSED = 'closed',    // Normal operation
  OPEN = 'open',        // Failing, reject requests
  HALF_OPEN = 'half-open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;                // Time in ms before attempting half-open
  resetTimeout: number;          // Time in ms before resetting failure count
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  totalFailures: number;
}

/**
 * Circuit breaker for a single source/service
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      successThreshold: config?.successThreshold || 2,
      timeout: config?.timeout || 60000, // 1 minute
      resetTimeout: config?.resetTimeout || 300000 // 5 minutes
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition
    this.updateState();

    // Reject if circuit is open
    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN - service is unavailable');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Update circuit state based on current conditions
   */
  private updateState(): void {
    const now = Date.now();

    // Transition from OPEN to HALF_OPEN after timeout
    if (this.state === CircuitState.OPEN) {
      if (this.lastFailureTime && (now - this.lastFailureTime.getTime()) >= this.config.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        console.log('[CircuitBreaker] Transitioning from OPEN to HALF_OPEN');
      }
    }

    // Transition from HALF_OPEN to CLOSED after success threshold
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        console.log('[CircuitBreaker] Transitioning from HALF_OPEN to CLOSED');
      }
    }

    // Reset failure count after reset timeout
    if (this.lastFailureTime && (now - this.lastFailureTime.getTime()) >= this.config.resetTimeout) {
      this.failures = 0;
    }
  }

  /**
   * Record a successful execution (public method for HTTP client integration)
   */
  recordSuccess(): void {
    this.onSuccess();
  }

  /**
   * Record a failed execution (public method for HTTP client integration)
   */
  recordFailure(): void {
    this.onFailure();
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.lastFailureTime = new Date();
    this.failures++;
    this.totalFailures++;

    // Transition to OPEN if failure threshold reached
    if (this.state === CircuitState.CLOSED && this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.warn(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Transition back to OPEN if failure in half-open state
      this.state = CircuitState.OPEN;
      this.successes = 0;
      console.warn('[CircuitBreaker] Circuit reopened after failure in HALF_OPEN state');
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    this.updateState();
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }

  /**
   * Check if circuit is open (service unavailable)
   */
  isOpen(): boolean {
    this.updateState();
    return this.state === CircuitState.OPEN;
  }
}

/**
 * Circuit breaker manager for multiple sources
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker for a source
   */
  getBreaker(sourceId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(sourceId)) {
      this.breakers.set(sourceId, new CircuitBreaker(config));
    }
    return this.breakers.get(sourceId)!;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [sourceId, breaker] of this.breakers.entries()) {
      stats.set(sourceId, breaker.getStats());
    }
    return stats;
  }

  /**
   * Reset circuit breaker for a source
   */
  reset(sourceId: string): void {
    this.breakers.get(sourceId)?.reset();
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}












