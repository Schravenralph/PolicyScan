/**
 * Rate Limiter - Token bucket implementation for API rate limiting
 * 
 * Ensures we stay under API rate limits (e.g., 10 req/s for DSO Downloaden API).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 */

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second
  private lastRefill: number;

  /**
   * @param capacity - Maximum tokens (burst capacity)
   * @param refillRate - Tokens per second
   */
  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token (wait if necessary)
   * 
   * @returns Promise that resolves when token is acquired
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Need to wait for token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Refill again after waiting
    this.refill();
    this.tokens -= 1;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

