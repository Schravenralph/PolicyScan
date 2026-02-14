/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to a failing service
 * and allowing it to recover before retrying.
 */

import { logger } from './logger.js';

export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   * @default 5
   */
  failureThreshold?: number;
  
  /**
   * Time in milliseconds to wait before attempting to close the circuit (half-open state)
   * @default 60000 (1 minute)
   */
  resetTimeout?: number;
  
  /**
   * Time in milliseconds to wait before considering a request timed out
   * @default 30000 (30 seconds)
   */
  timeout?: number;
  
  /**
   * Name of the circuit breaker (for logging)
   */
  name?: string;
}

export enum CircuitState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  successCount: number;
}

const DEFAULT_OPTIONS: Required<Omit<CircuitBreakerOptions, 'name'>> & { name?: string } = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  timeout: 30000, // 30 seconds
  name: 'CircuitBreaker',
};

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private options: Required<Omit<CircuitBreakerOptions, 'name'>> & { name?: string };
  private state: CircuitBreakerState;
  
  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0,
    };
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.state.lastFailureTime || 0);
      
      // Check if reset timeout has passed
      if (timeSinceLastFailure >= this.options.resetTimeout) {
        // Move to half-open state
        this.state.state = CircuitState.HALF_OPEN;
        this.state.successCount = 0;
        logger.info(
          { name: this.options.name, state: CircuitState.HALF_OPEN },
          'Circuit breaker moving to half-open state'
        );
      } else {
        // Circuit is still open, fail fast
        throw new Error(
          `Circuit breaker is OPEN. Service unavailable. Retry after ${Math.ceil((this.options.resetTimeout - timeSinceLastFailure) / 1000)}s`
        );
      }
    }
    
    // Execute the function with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Circuit breaker timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });
    
    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Success - reset failure count
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure - increment failure count
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state.state === CircuitState.HALF_OPEN) {
      // If we're in half-open state and got a success, close the circuit
      this.state.state = CircuitState.CLOSED;
      this.state.failureCount = 0;
      this.state.lastFailureTime = null;
      this.state.successCount = 0;
      logger.info(
        { name: this.options.name, state: CircuitState.CLOSED },
        'Circuit breaker closed after successful recovery'
      );
    } else {
      // Reset failure count on success
      this.state.failureCount = 0;
    }
  }
  
  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.state === CircuitState.HALF_OPEN) {
      // If we're in half-open and got a failure, open the circuit again
      this.state.state = CircuitState.OPEN;
      logger.warn(
        { name: this.options.name, state: CircuitState.OPEN, failureCount: this.state.failureCount },
        'Circuit breaker opened again after failure in half-open state'
      );
    } else if (this.state.failureCount >= this.options.failureThreshold) {
      // Open the circuit if threshold is reached
      this.state.state = CircuitState.OPEN;
      logger.warn(
        { 
          name: this.options.name, 
          state: CircuitState.OPEN, 
          failureCount: this.state.failureCount,
          threshold: this.options.failureThreshold 
        },
        'Circuit breaker opened due to failure threshold'
      );
    }
  }
  
  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state.state;
  }
  
  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.state.failureCount;
  }
  
  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0,
    };
    logger.info({ name: this.options.name }, 'Circuit breaker manually reset');
  }
  
  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      lastFailureTime: this.state.lastFailureTime,
      successCount: this.state.successCount,
      options: this.options,
    };
  }
}

/**
 * Create a circuit breaker instance
 */
export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  return new CircuitBreaker(options);
}

