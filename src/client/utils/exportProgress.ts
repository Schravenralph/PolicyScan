/**
 * Export Progress Tracking - Tracks export progress and provides callbacks
 * 
 * Provides utilities for tracking export progress and notifying callbacks
 * during export operations.
 */

export interface ExportProgress {
  current: number;
  total: number;
  percentage: number;
  stage: 'preparing' | 'processing' | 'generating' | 'downloading' | 'complete' | 'error';
  message?: string;
  estimatedTimeRemaining?: number; // milliseconds
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

/**
 * Export progress tracker
 */
export class ExportProgressTracker {
  private total: number;
  private current: number = 0;
  private startTime: number;
  private callbacks: Set<ExportProgressCallback> = new Set();
  private stage: ExportProgress['stage'] = 'preparing';

  constructor(total: number) {
    this.total = total;
    this.startTime = Date.now();
  }

  /**
   * Add progress callback
   */
  addCallback(callback: ExportProgressCallback): () => void {
    this.callbacks.add(callback);
    
    // Immediately call with current progress
    this.notifyCallbacks();
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Update progress
   */
  update(current: number, stage?: ExportProgress['stage'], message?: string): void {
    this.current = Math.min(current, this.total);
    if (stage) {
      this.stage = stage;
    }

    // Calculate estimated time remaining
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed; // items per millisecond
    const remaining = this.total - this.current;
    const estimatedTimeRemaining = rate > 0 ? remaining / rate : undefined;

    this.notifyCallbacks(message, estimatedTimeRemaining);
  }

  /**
   * Increment progress
   */
  increment(stage?: ExportProgress['stage'], message?: string): void {
    this.update(this.current + 1, stage, message);
  }

  /**
   * Set stage
   */
  setStage(stage: ExportProgress['stage'], message?: string): void {
    this.stage = stage;
    this.notifyCallbacks(message);
  }

  /**
   * Complete export
   */
  complete(message?: string): void {
    this.current = this.total;
    this.stage = 'complete';
    this.notifyCallbacks(message);
  }

  /**
   * Mark as error
   */
  error(message: string): void {
    this.stage = 'error';
    this.notifyCallbacks(message);
  }

  /**
   * Get current progress
   */
  getProgress(): ExportProgress {
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed; // items per millisecond
    const remaining = this.total - this.current;
    const estimatedTimeRemaining = rate > 0 ? remaining / rate : undefined;

    return {
      current: this.current,
      total: this.total,
      percentage: this.total > 0 ? Math.round((this.current / this.total) * 100) : 0,
      stage: this.stage,
      estimatedTimeRemaining,
    };
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(message?: string, estimatedTimeRemaining?: number): void {
    const progress = this.getProgress();
    if (message) {
      progress.message = message;
    }
    if (estimatedTimeRemaining !== undefined) {
      progress.estimatedTimeRemaining = estimatedTimeRemaining;
    }

    this.callbacks.forEach((callback) => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in export progress callback:', error);
      }
    });
  }
}

/**
 * Create export progress tracker
 */
export function createExportProgressTracker(total: number): ExportProgressTracker {
  return new ExportProgressTracker(total);
}


