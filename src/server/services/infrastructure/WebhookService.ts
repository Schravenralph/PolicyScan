/**
 * WebhookService
 * 
 * Centralized service for sending webhook notifications with:
 * - Timeout configuration
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Request queuing and rate limiting
 * - Connection pooling
 * - Error handling and logging
 */

import { Agent, Dispatcher } from 'undici';
import { logger } from '../../utils/logger.js';

export interface WebhookOptions {
  url: string;
  payload: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptCount: number;
  queuedTime?: number; // Time spent in queue (ms)
}

interface QueuedRequest {
  url: string;
  payload: unknown;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  headers: Record<string, string>;
  resolve: (result: WebhookResult) => void;
  reject: (error: Error) => void;
  priority: 'normal' | 'high';
  queuedAt: number;
}

interface RateLimitState {
  requests: number[];
  lastRequestTime: number;
}

interface WebhookMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  lastRequestTime: number;
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, reject requests immediately
  HALF_OPEN = 'half_open' // Testing if service recovered
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

/**
 * WebhookService with retry, timeout, circuit breaker, queuing, and rate limiting
 */
export class WebhookService {
  private static readonly DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY_MS = 1000; // 1 second
  private static readonly CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
  private static readonly CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60000; // 1 minute
  // private static readonly CIRCUIT_BREAKER_HALF_OPEN_TIMEOUT_MS = 30000; // 30 seconds // Unused
  
  // Rate limiting configuration
  private static readonly DEFAULT_RATE_LIMIT_REQUESTS_PER_SECOND = 10;
  private static readonly DEFAULT_MAX_CONCURRENT = 5;
  private static readonly MAX_QUEUE_SIZE = 1000;
  
  // Circuit breaker state per URL
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  
  // Request queues per webhook URL
  private queues: Map<string, QueuedRequest[]> = new Map();
  
  // Rate limiting state per URL
  private rateLimits: Map<string, RateLimitState> = new Map();
  
  // Active request counts per URL
  private activeRequests: Map<string, number> = new Map();
  
  // HTTP agent for connection pooling
  private httpAgent: Agent;
  
  // Queue processing intervals per URL
  private queueProcessors: Map<string, NodeJS.Timeout> = new Map();
  
  // Metrics per URL
  private metrics: Map<string, WebhookMetrics> = new Map();

  constructor() {
    // Create HTTP agent with connection pooling
    this.httpAgent = new Agent({
      connections: 10, // Max connections per origin
      pipelining: 1, // No HTTP pipelining (webhooks are POST requests)
      keepAliveTimeout: 60000, // 60 seconds
      keepAliveMaxTimeout: 600000, // 10 minutes
    });
  }

  /**
   * Send webhook with retry, timeout, circuit breaker, queuing, and rate limiting
   */
  async sendWebhook(options: WebhookOptions & { priority?: 'normal' | 'high' }): Promise<WebhookResult> {
    const {
      url,
      payload,
      timeoutMs = WebhookService.DEFAULT_TIMEOUT_MS,
      maxRetries = WebhookService.DEFAULT_MAX_RETRIES,
      retryDelayMs = WebhookService.DEFAULT_RETRY_DELAY_MS,
      headers = {},
      priority = 'normal',
    } = options;

    // Check circuit breaker
    if (!this.canAttemptRequest(url)) {
      logger.warn({ url }, '[WebhookService] Circuit breaker is OPEN, skipping request');
      return {
        success: false,
        error: 'Circuit breaker is open',
        attemptCount: 0,
      };
    }

    // Check if we can process immediately or need to queue
    if (this.canProcessImmediately(url)) {
      return this.processWebhookRequest(url, payload, timeoutMs, maxRetries, retryDelayMs, headers);
    }

    // Check queue size
    const queue = this.queues.get(url) || [];
    if (queue.length >= WebhookService.MAX_QUEUE_SIZE) {
      logger.warn({ url, queueSize: queue.length }, '[WebhookService] Queue is full, rejecting request');
      return {
        success: false,
        error: 'Webhook queue is full',
        attemptCount: 0,
      };
    }

    // Queue the request
    return new Promise<WebhookResult>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        url,
        payload,
        timeoutMs,
        maxRetries,
        retryDelayMs,
        headers,
        resolve,
        reject,
        priority,
        queuedAt: Date.now(),
      };

      if (!this.queues.has(url)) {
        this.queues.set(url, []);
      }
      
      const urlQueue = this.queues.get(url)!;
      
      // Insert based on priority (high priority at front)
      if (priority === 'high') {
        urlQueue.unshift(queuedRequest);
      } else {
        urlQueue.push(queuedRequest);
      }
      
      this.queues.set(url, urlQueue);

      // Start queue processor if not already running
      this.startQueueProcessor(url);
    });
  }

  /**
   * Check if request can be processed immediately
   */
  private canProcessImmediately(url: string): boolean {
    const active = this.activeRequests.get(url) || 0;
    if (active >= WebhookService.DEFAULT_MAX_CONCURRENT) {
      return false;
    }

    // Check rate limit
    return this.checkRateLimit(url);
  }

  /**
   * Check and update rate limit
   */
  private checkRateLimit(url: string): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    let state = this.rateLimits.get(url);
    if (!state) {
      state = {
        requests: [],
        lastRequestTime: 0,
      };
      this.rateLimits.set(url, state);
    }

    // Remove requests older than 1 second
    state.requests = state.requests.filter(timestamp => timestamp > oneSecondAgo);

    // Check if we're under the rate limit
    if (state.requests.length < WebhookService.DEFAULT_RATE_LIMIT_REQUESTS_PER_SECOND) {
      state.requests.push(now);
      state.lastRequestTime = now;
      return true;
    }

    return false;
  }

  /**
   * Process webhook request (actual execution)
   */
  private async processWebhookRequest(
    url: string,
    payload: unknown,
    timeoutMs: number,
    maxRetries: number,
    retryDelayMs: number,
    headers: Record<string, string>
  ): Promise<WebhookResult> {
    // Increment active request count
    const active = (this.activeRequests.get(url) || 0) + 1;
    this.activeRequests.set(url, active);

    const startTime = Date.now();

    try {
      let lastError: Error | null = null;
      let attemptCount = 0;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attemptCount = attempt + 1;

        try {
          const result = await this.executeWebhookRequest(url, payload, timeoutMs, headers);
          
          // Success - reset circuit breaker and update metrics
          this.recordSuccess(url);
          const latency = Date.now() - startTime;
          this.recordMetrics(url, true, latency);
          
          return {
            success: true,
            statusCode: result.status,
            attemptCount,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Check if we should retry
          if (attempt < maxRetries) {
            const delay = this.calculateBackoffDelay(attempt, retryDelayMs);
            logger.debug(
              { url, attempt: attemptCount, maxRetries, delay, error: lastError.message },
              '[WebhookService] Webhook attempt failed, retrying'
            );
            
            await this.sleep(delay);
          } else {
            // All retries exhausted
            logger.error(
              { url, attemptCount, error: lastError.message },
              '[WebhookService] Webhook failed after all retries'
            );
          }
        }
      }

      // Record failure for circuit breaker and metrics
      this.recordFailure(url);
      const latency = Date.now() - startTime;
      this.recordMetrics(url, false, latency);

      return {
        success: false,
        error: lastError?.message || 'Unknown error',
        attemptCount,
      };
    } finally {
      // Decrement active request count
      const currentActive = (this.activeRequests.get(url) || 1) - 1;
      if (currentActive <= 0) {
        this.activeRequests.delete(url);
      } else {
        this.activeRequests.set(url, currentActive);
      }
    }
  }

  /**
   * Record metrics for a webhook request
   */
  private recordMetrics(url: string, success: boolean, latency: number): void {
    let metric = this.metrics.get(url);
    if (!metric) {
      metric = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        lastRequestTime: 0,
      };
      this.metrics.set(url, metric);
    }

    metric.totalRequests++;
    if (success) {
      metric.successfulRequests++;
    } else {
      metric.failedRequests++;
    }
    
    // Update average latency (exponential moving average)
    metric.averageLatency = metric.averageLatency === 0 
      ? latency 
      : (metric.averageLatency * 0.9) + (latency * 0.1);
    
    metric.lastRequestTime = Date.now();
  }

  /**
   * Start queue processor for a URL
   */
  private startQueueProcessor(url: string): void {
    if (this.queueProcessors.has(url)) {
      return; // Already processing
    }

    const processor = setInterval(() => {
      this.processQueue(url);
    }, 100); // Check queue every 100ms

    this.queueProcessors.set(url, processor);
  }

  /**
   * Process queued requests for a URL
   */
  private async processQueue(url: string): Promise<void> {
    const queue = this.queues.get(url);
    if (!queue || queue.length === 0) {
      // Stop processor if queue is empty
      const processor = this.queueProcessors.get(url);
      if (processor) {
        clearInterval(processor);
        this.queueProcessors.delete(url);
      }
      return;
    }

    // Check if we can process more requests
    if (!this.canProcessImmediately(url)) {
      return; // Wait for next interval
    }

    // Get next request from queue
    const request = queue.shift()!;
    this.queues.set(url, queue);

    const queuedTime = Date.now() - request.queuedAt;

    try {
      const result = await this.processWebhookRequest(
        request.url,
        request.payload,
        request.timeoutMs,
        request.maxRetries,
        request.retryDelayMs,
        request.headers
      );
      
      request.resolve({
        ...result,
        queuedTime,
      });
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute a single webhook request with timeout and connection pooling
   */
  private async executeWebhookRequest(
    url: string,
    payload: unknown,
    timeoutMs: number,
    headers: Record<string, string>
  ): Promise<{ status: number; statusText: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Use undici Agent for connection pooling
      const response = await this.httpAgent.request({
        origin: new URL(url).origin,
        path: new URL(url).pathname + (new URL(url).search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      } as Dispatcher.RequestOptions);

      clearTimeout(timeoutId);

      const status = response.statusCode;
      const statusText = (response as { statusText?: string }).statusText || '';

      // Read response body to completion (required by undici)
      await response.body.text().catch(() => '');

      if (status < 200 || status >= 300) {
        throw new Error(
          `Webhook returned ${status} ${statusText}`
        );
      }

      return { status, statusText };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Webhook request timeout after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
    // Exponential backoff: baseDelay * 2^attempt, with jitter
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Up to 30% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Check if request can be attempted (circuit breaker)
   */
  private canAttemptRequest(url: string): boolean {
    const state = this.circuitBreakers.get(url);
    
    if (!state) {
      return true; // No state = circuit is closed
    }

    const now = Date.now();

    switch (state.state) {
      case CircuitState.CLOSED:
        return true;
      
      case CircuitState.OPEN:
        // Check if we should transition to half-open
        if (now >= state.nextAttemptTime) {
          state.state = CircuitState.HALF_OPEN;
          state.failureCount = 0;
          logger.info({ url }, '[WebhookService] Circuit breaker transitioning to HALF_OPEN');
          return true;
        }
        return false;
      
      case CircuitState.HALF_OPEN:
        // Allow one attempt to test if service recovered
        return true;
      
      default:
        return true;
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(url: string): void {
    const state = this.circuitBreakers.get(url);
    
    if (!state) {
      return; // No state to update
    }

    if (state.state === CircuitState.HALF_OPEN) {
      // Success in half-open means service recovered
      state.state = CircuitState.CLOSED;
      state.failureCount = 0;
      logger.info({ url }, '[WebhookService] Circuit breaker CLOSED - service recovered');
    } else if (state.state === CircuitState.CLOSED) {
      // Reset failure count on success
      state.failureCount = 0;
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(url: string): void {
    let state = this.circuitBreakers.get(url);
    
    if (!state) {
      state = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: 0,
      };
      this.circuitBreakers.set(url, state);
    }

    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.state === CircuitState.HALF_OPEN) {
      // Failure in half-open means service still down
      state.state = CircuitState.OPEN;
      state.nextAttemptTime = Date.now() + WebhookService.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
      logger.warn({ url }, '[WebhookService] Circuit breaker OPEN - service still down');
    } else if (
      state.state === CircuitState.CLOSED &&
      state.failureCount >= WebhookService.CIRCUIT_BREAKER_FAILURE_THRESHOLD
    ) {
      // Too many failures, open circuit
      state.state = CircuitState.OPEN;
      state.nextAttemptTime = Date.now() + WebhookService.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
      logger.warn(
        { url, failureCount: state.failureCount },
        '[WebhookService] Circuit breaker OPEN - too many failures'
      );
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset circuit breaker for a URL (useful for testing or manual recovery)
   */
  resetCircuitBreaker(url: string): void {
    this.circuitBreakers.delete(url);
    logger.info({ url }, '[WebhookService] Circuit breaker reset');
  }

  /**
   * Get circuit breaker state for a URL (for monitoring/debugging)
   */
  getCircuitBreakerState(url: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(url) || null;
  }

  /**
   * Get queue statistics for a URL (for monitoring)
   */
  getQueueStats(url: string): {
    queueSize: number;
    activeRequests: number;
    rateLimitState: RateLimitState | null;
    metrics: WebhookMetrics | null;
  } {
    return {
      queueSize: this.queues.get(url)?.length || 0,
      activeRequests: this.activeRequests.get(url) || 0,
      rateLimitState: this.rateLimits.get(url) || null,
      metrics: this.metrics.get(url) || null,
    };
  }

  /**
   * Get all webhook URLs with their statistics (for monitoring)
   */
  getAllStats(): Map<string, {
    queueSize: number;
    activeRequests: number;
    metrics: WebhookMetrics | null;
    circuitBreaker: CircuitBreakerState | null;
  }> {
    const stats = new Map();
    const allUrls = new Set([
      ...Array.from(this.queues.keys()),
      ...Array.from(this.activeRequests.keys()),
      ...Array.from(this.metrics.keys()),
      ...Array.from(this.circuitBreakers.keys()),
    ]);

    for (const url of allUrls) {
      stats.set(url, {
        queueSize: this.queues.get(url)?.length || 0,
        activeRequests: this.activeRequests.get(url) || 0,
        metrics: this.metrics.get(url) || null,
        circuitBreaker: this.circuitBreakers.get(url) || null,
      });
    }

    return stats;
  }

  /**
   * Cleanup resources (call on shutdown)
   */
  cleanup(): void {
    // Clear all queue processors
    for (const processor of this.queueProcessors.values()) {
      clearInterval(processor);
    }
    this.queueProcessors.clear();
    
    // Close HTTP agent
    this.httpAgent.close();
  }
}

/**
 * Singleton instance
 */
let webhookServiceInstance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new WebhookService();
  }
  return webhookServiceInstance;
}

