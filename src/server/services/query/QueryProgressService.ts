export interface QueryProgress {
  queryId: string;
  progress: number; // 0-100
  status: 'analyzing' | 'searching' | 'evaluating' | 'generating' | 'completed' | 'error';
  estimatedSecondsRemaining?: number;
  currentStep?: string;
  totalSteps?: number;
  startedAt: number;
  lastUpdated: number;
  error?: string;
}

/**
 * Service for tracking query generation progress
 * Stores progress in memory with automatic cleanup
 */
export class QueryProgressService {
  private progressMap: Map<string, QueryProgress> = new Map();
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupIntervalId = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up the interval (for testing)
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.progressMap.clear();
  }

  /**
   * Initialize progress tracking for a query
   */
  initialize(queryId: string): void {
    const progress: QueryProgress = {
      queryId,
      progress: 0,
      status: 'analyzing',
      currentStep: 'Analyzing topic...',
      totalSteps: 4,
      startedAt: Date.now(),
      lastUpdated: Date.now()
    };
    this.progressMap.set(queryId, progress);
  }

  /**
   * Update progress for a query
   */
  update(
    queryId: string,
    updates: Partial<Omit<QueryProgress, 'queryId' | 'startedAt' | 'lastUpdated'>>
  ): void {
    const existing = this.progressMap.get(queryId);
    if (!existing) {
      // Initialize if not exists
      this.initialize(queryId);
    }

    const progress = this.progressMap.get(queryId)!;
    
    // Update fields
    if (updates.progress !== undefined) progress.progress = updates.progress;
    if (updates.status !== undefined) progress.status = updates.status;
    if (updates.currentStep !== undefined) progress.currentStep = updates.currentStep;
    if (updates.totalSteps !== undefined) progress.totalSteps = updates.totalSteps;
    if (updates.error !== undefined) progress.error = updates.error;
    
    // Calculate estimated time remaining based on progress rate
    if (updates.progress !== undefined && updates.progress > 0) {
      const elapsedSeconds = (Date.now() - progress.startedAt) / 1000;
      // Only calculate estimate if enough time has passed to get a stable rate (2 seconds)
      if (elapsedSeconds >= 2) {
        const progressRate = updates.progress / elapsedSeconds;
        if (progressRate > 0) {
          progress.estimatedSecondsRemaining = Math.max(0, Math.ceil((100 - updates.progress) / progressRate));
        }
      }
    }
    if (updates.estimatedSecondsRemaining !== undefined) {
      progress.estimatedSecondsRemaining = updates.estimatedSecondsRemaining;
    }

    progress.lastUpdated = Date.now();
  }

  /**
   * Get current progress for a query
   */
  getProgress(queryId: string): QueryProgress | null {
    const progress = this.progressMap.get(queryId);
    if (!progress) return null;

    // Check if expired
    if (Date.now() - progress.lastUpdated > this.MAX_AGE_MS) {
      this.progressMap.delete(queryId);
      return null;
    }

    return progress;
  }

  /**
   * Mark progress as completed
   */
  complete(queryId: string): void {
    this.update(queryId, {
      progress: 100,
      status: 'completed',
      currentStep: 'Suggesties gegenereerd',
      estimatedSecondsRemaining: 0
    });
  }

  /**
   * Mark progress as error
   */
  error(queryId: string, errorMessage: string): void {
    this.update(queryId, {
      status: 'error',
      error: errorMessage,
      currentStep: 'Fout opgetreden'
    });
  }

  /**
   * Remove progress for a query
   */
  remove(queryId: string): void {
    this.progressMap.delete(queryId);
  }

  /**
   * Clean up old progress entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [queryId, progress] of this.progressMap.entries()) {
      if (now - progress.lastUpdated > this.MAX_AGE_MS) {
        this.progressMap.delete(queryId);
      }
    }
  }
}

// Singleton instance
let progressService: QueryProgressService | null = null;

export function getQueryProgressService(): QueryProgressService {
  if (!progressService) {
    progressService = new QueryProgressService();
  }
  return progressService;
}

/**
 * Clean up the singleton instance (for testing)
 */
export function destroyQueryProgressService(): void {
  if (progressService) {
    progressService.destroy();
    progressService = null;
  }
}

