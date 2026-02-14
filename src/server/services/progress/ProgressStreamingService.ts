import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Progress update format for scraper operations
 */
export interface ScraperProgressUpdate {
  type: 'scraper_progress';
  runId: string;
  data: {
    // Overall progress
    progress: number; // 0-100
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    estimatedSecondsRemaining?: number;
    
    // Step breakdown
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
    
    // Per-scraper breakdown
    scrapers: Array<{
      scraperId: string;
      scraperName: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      progress: number; // 0-100
      documentsFound: number;
      errors: number;
      currentUrl?: string;
    }>;
    
    // Overall statistics
    totalDocumentsFound: number;
    totalSourcesFound: number;
    totalErrors: number;
    
    // Timestamps
    startedAt: number;
    lastUpdated: number;
    completedAt?: number;
    
    // Error information
    error?: string;
  };
}

/**
 * Service for streaming real-time progress updates for scraper operations
 * Uses WebSocket to push updates to connected clients
 */
export class ProgressStreamingService {
  private io: SocketIOServer | null = null;
  private activeRuns: Map<string, ScraperProgressUpdate['data']> = new Map();
  private readonly MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Initialize progress streaming service
   * Gets the Socket.IO server instance from WebSocketService
   */
  async initialize(): Promise<void> {
    const { getWebSocketService } = await import('../infrastructure/WebSocketService.js');
    const webSocketService = getWebSocketService();
    this.io = webSocketService.getIO();
    
    if (!this.io) {
      throw new Error('WebSocketService must be initialized before ProgressStreamingService');
    }

    // Register handlers for existing and future connections
    // Note: WebSocketService already handles room joining via subscribe_run,
    // so we just need to send current progress when clients subscribe
    const setupSocketHandlers = (socket: Socket) => {
      // Handle subscription to a specific run - send current progress if available
      // Room joining is handled by WebSocketService
      socket.on('subscribe_run', (runId: string) => {
        console.log('[ProgressStreaming] Client subscribed to run:', runId);
        
        // Send current progress if available
        const progress = this.activeRuns.get(runId);
        if (progress) {
          socket.emit('scraper_progress', {
            type: 'scraper_progress',
            runId,
            data: progress,
          } as ScraperProgressUpdate);
        }
      });
    };

    // Set up handlers for existing connections
    this.io.sockets.sockets.forEach((socket) => {
      setupSocketHandlers(socket);
    });

    // Set up handlers for future connections
    this.io.on('connection', setupSocketHandlers);

    console.log('✅ ProgressStreamingService initialized');
  }

  /**
   * Initialize progress tracking for a new run
   */
  initializeRun(runId: string, totalSteps: number = 5): void {
    const progress: ScraperProgressUpdate['data'] = {
      progress: 0,
      status: 'pending',
      currentStep: 'Initializing...',
      totalSteps,
      completedSteps: 0,
      scrapers: [],
      totalDocumentsFound: 0,
      totalSourcesFound: 0,
      totalErrors: 0,
      startedAt: Date.now(),
      lastUpdated: Date.now(),
    };

    this.activeRuns.set(runId, progress);
    this.emitProgress(runId, progress);
  }

  /**
   * Update progress for a run
   */
  updateProgress(
    runId: string,
    updates: Partial<Omit<ScraperProgressUpdate['data'], 'startedAt' | 'lastUpdated'>>
  ): void {
    const existing = this.activeRuns.get(runId);
    if (!existing) {
      // Initialize if not exists
      this.initializeRun(runId);
    }

    const progress = this.activeRuns.get(runId)!;

    // Update fields
    if (updates.progress !== undefined) progress.progress = Math.max(0, Math.min(100, updates.progress));
    if (updates.status !== undefined) progress.status = updates.status;
    if (updates.currentStep !== undefined) progress.currentStep = updates.currentStep;
    if (updates.totalSteps !== undefined) progress.totalSteps = updates.totalSteps;
    if (updates.completedSteps !== undefined) progress.completedSteps = updates.completedSteps;
    if (updates.scrapers !== undefined) progress.scrapers = updates.scrapers;
    if (updates.totalDocumentsFound !== undefined) progress.totalDocumentsFound = updates.totalDocumentsFound;
    if (updates.totalSourcesFound !== undefined) progress.totalSourcesFound = updates.totalSourcesFound;
    if (updates.totalErrors !== undefined) progress.totalErrors = updates.totalErrors;
    if (updates.error !== undefined) progress.error = updates.error;

    // Calculate estimated time remaining
    if (updates.progress !== undefined && updates.progress > 0 && updates.progress < 100) {
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

    // Set completedAt if status is completed or failed
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
      progress.completedAt = Date.now();
      progress.estimatedSecondsRemaining = 0;
    }

    progress.lastUpdated = Date.now();
    this.emitProgress(runId, progress);
  }

  /**
   * Update progress for a specific scraper
   */
  updateScraperProgress(
    runId: string,
    scraperId: string,
    scraperName: string,
    updates: Partial<ScraperProgressUpdate['data']['scrapers'][0]>
  ): void {
    const progress = this.activeRuns.get(runId);
    if (!progress) {
      this.initializeRun(runId);
    }

    const currentProgress = this.activeRuns.get(runId)!;
    const scraperIndex = currentProgress.scrapers.findIndex(s => s.scraperId === scraperId);

    if (scraperIndex === -1) {
      // Add new scraper
      currentProgress.scrapers.push({
        scraperId,
        scraperName,
        status: 'pending',
        progress: 0,
        documentsFound: 0,
        errors: 0,
        ...updates,
      });
    } else {
      // Update existing scraper
      Object.assign(currentProgress.scrapers[scraperIndex], updates);
    }

    // Recalculate overall progress based on scrapers
    this.recalculateOverallProgress(runId);
    this.emitProgress(runId, currentProgress);
  }

  /**
   * Recalculate overall progress based on scraper progress
   */
  private recalculateOverallProgress(runId: string): void {
    const progress = this.activeRuns.get(runId);
    if (!progress || progress.scrapers.length === 0) return;

    // Calculate average progress across all scrapers
    const totalProgress = progress.scrapers.reduce((sum, scraper) => sum + scraper.progress, 0);
    progress.progress = Math.round(totalProgress / progress.scrapers.length);

    // Calculate totals
    progress.totalDocumentsFound = progress.scrapers.reduce((sum, scraper) => sum + scraper.documentsFound, 0);
    progress.totalErrors = progress.scrapers.reduce((sum, scraper) => sum + scraper.errors, 0);

    // Determine overall status
    const allCompleted = progress.scrapers.every(s => s.status === 'completed' || s.status === 'failed');
    const anyRunning = progress.scrapers.some(s => s.status === 'running');
    const anyFailed = progress.scrapers.some(s => s.status === 'failed');

    if (allCompleted) {
      progress.status = anyFailed ? 'failed' : 'completed';
      progress.completedAt = Date.now();
      progress.estimatedSecondsRemaining = 0;
    } else if (anyRunning) {
      progress.status = 'running';
    }
  }

  /**
   * Mark a run as completed
   */
  completeRun(runId: string): void {
    this.updateProgress(runId, {
      status: 'completed',
      progress: 100,
      currentStep: 'Completed',
      estimatedSecondsRemaining: 0,
    });
  }

  /**
   * Mark a run as failed
   */
  failRun(runId: string, error: string): void {
    this.updateProgress(runId, {
      status: 'failed',
      error,
      estimatedSecondsRemaining: 0,
    });
  }

  /**
   * Mark a run as cancelled
   */
  cancelRun(runId: string): void {
    this.updateProgress(runId, {
      status: 'cancelled',
      currentStep: 'Cancelled',
      estimatedSecondsRemaining: 0,
    });
  }

  /**
   * Get current progress for a run
   */
  getProgress(runId: string): ScraperProgressUpdate['data'] | null {
    const progress = this.activeRuns.get(runId);
    if (!progress) return null;

    // Check if expired
    if (Date.now() - progress.lastUpdated > this.MAX_AGE_MS) {
      this.activeRuns.delete(runId);
      return null;
    }

    return progress;
  }

  /**
   * Emit progress update to subscribed clients
   */
  private emitProgress(runId: string, progress: ScraperProgressUpdate['data']): void {
    if (!this.io) return;

    const update: ScraperProgressUpdate = {
      type: 'scraper_progress',
      runId,
      data: progress,
    };

    // Emit to room for this specific run
    this.io.to(`run:${runId}`).emit('scraper_progress', update);
  }

  /**
   * Clean up old progress entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [runId, progress] of this.activeRuns.entries()) {
      // Keep completed/failed runs for 1 hour, pending/running for cleanup after max age
      const isCompleted = progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled';
      const maxAge = isCompleted ? this.MAX_AGE_MS : this.MAX_AGE_MS;
      
      if (now - progress.lastUpdated > maxAge) {
        this.activeRuns.delete(runId);
      }
    }
  }

  /**
   * Get number of active runs
   */
  getActiveRunCount(): number {
    return Array.from(this.activeRuns.values()).filter(p => p.status === 'running' || p.status === 'pending').length;
  }
}

// Singleton instance
let progressStreamingService: ProgressStreamingService | null = null;

export function getProgressStreamingService(): ProgressStreamingService {
  if (!progressStreamingService) {
    progressStreamingService = new ProgressStreamingService();
  }
  return progressStreamingService;
}

