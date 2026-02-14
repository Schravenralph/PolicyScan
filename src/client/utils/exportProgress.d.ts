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
    estimatedTimeRemaining?: number;
}
export type ExportProgressCallback = (progress: ExportProgress) => void;
/**
 * Export progress tracker
 */
export declare class ExportProgressTracker {
    private total;
    private current;
    private startTime;
    private callbacks;
    private stage;
    constructor(total: number);
    /**
     * Add progress callback
     */
    addCallback(callback: ExportProgressCallback): () => void;
    /**
     * Update progress
     */
    update(current: number, stage?: ExportProgress['stage'], message?: string): void;
    /**
     * Increment progress
     */
    increment(stage?: ExportProgress['stage'], message?: string): void;
    /**
     * Set stage
     */
    setStage(stage: ExportProgress['stage'], message?: string): void;
    /**
     * Complete export
     */
    complete(message?: string): void;
    /**
     * Mark as error
     */
    error(message: string): void;
    /**
     * Get current progress
     */
    getProgress(): ExportProgress;
    /**
     * Notify all callbacks
     */
    private notifyCallbacks;
}
/**
 * Create export progress tracker
 */
export declare function createExportProgressTracker(total: number): ExportProgressTracker;
