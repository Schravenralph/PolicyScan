import { Server as SocketIOServer, Socket } from 'socket.io';
import { RunLog } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Workflow log update format for WebSocket streaming
 */
export interface WorkflowLogUpdate {
  type: 'workflow_log';
  runId: string;
  log: RunLog;
}

/**
 * Service for streaming real-time workflow log updates
 * Uses WebSocket to push log entries to connected clients
 */
export class WorkflowLogStreamingService {
  private io: SocketIOServer | null = null;
  private runLogs: Map<string, RunLog[]> = new Map();
  private runTimestamps: Map<string, number> = new Map(); // Track when runs were last active
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_LOGS_PER_RUN = 1000; // Keep last 1000 logs per run in memory
  private readonly MAX_AGE_MS = 60 * 60 * 1000; // 1 hour - cleanup runs older than this
  private readonly CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Run cleanup every 15 minutes

  /**
   * Initialize workflow log streaming service
   * Gets the Socket.IO server instance from WebSocketService
   */
  async initialize(): Promise<void> {
    const { getWebSocketService } = await import('../infrastructure/WebSocketService.js');
    const webSocketService = getWebSocketService();
    this.io = webSocketService.getIO();
    
    if (!this.io) {
      throw new Error('WebSocketService must be initialized before WorkflowLogStreamingService');
    }

    // Register handlers for existing and future connections
    // Note: WebSocketService already handles room joining via subscribe_run,
    // so we just need to send current logs when clients subscribe
    const setupSocketHandlers = (socket: Socket) => {
      // Handle subscription to a specific run - send current logs if available
      // Room joining is handled by WebSocketService
      socket.on('subscribe_run', (runId: string) => {
        logger.debug({ socketId: socket.id, runId }, '[WorkflowLogStreaming] Client subscribed to run logs');
        
        // Send current logs if available (catch-up)
        // Limit to last 100 logs to avoid overwhelming client on reconnect
        const logs = this.runLogs.get(runId);
        if (logs && logs.length > 0) {
          // Send recent logs (last 100) to avoid overwhelming client
          // Full history can be fetched via HTTP API if needed
          const recentLogs = logs.slice(-100);
          
          // Batch send logs with small delay between batches to avoid overwhelming client
          const BATCH_SIZE = 10;
          const BATCH_DELAY_MS = 50;
          
          for (let i = 0; i < recentLogs.length; i += BATCH_SIZE) {
            const batch = recentLogs.slice(i, i + BATCH_SIZE);
            setTimeout(() => {
              batch.forEach((log) => {
                socket.emit('workflow_log', {
                  type: 'workflow_log',
                  runId,
                  log,
                } as WorkflowLogUpdate);
              });
            }, (i / BATCH_SIZE) * BATCH_DELAY_MS);
          }
          
          logger.debug({ 
            socketId: socket.id, 
            runId, 
            totalLogs: logs.length, 
            sentLogs: recentLogs.length 
          }, '[WorkflowLogStreaming] Sent catch-up logs to client');
        }
      });
    };

    // Set up handlers for existing connections
    this.io.sockets.sockets.forEach((socket) => {
      setupSocketHandlers(socket);
    });

    // Set up handlers for future connections
    this.io.on('connection', setupSocketHandlers);

    // Start periodic cleanup of old runs
    this.startPeriodicCleanup();

    logger.info('WorkflowLogStreamingService initialized');
  }

  /**
   * Start periodic cleanup of old runs to prevent memory leaks
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRuns();
    }, this.CLEANUP_INTERVAL_MS);

    // Use unref() so this timer doesn't prevent process from exiting
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up runs that are older than MAX_AGE_MS
   */
  private cleanupOldRuns(): void {
    const now = Date.now();
    const runsToCleanup: string[] = [];

    this.runTimestamps.forEach((timestamp, runId) => {
      if (now - timestamp > this.MAX_AGE_MS) {
        runsToCleanup.push(runId);
      }
    });

    if (runsToCleanup.length > 0) {
      runsToCleanup.forEach(runId => {
        this.runLogs.delete(runId);
        this.runTimestamps.delete(runId);
      });
      logger.debug({ count: runsToCleanup.length }, '[WorkflowLogStreaming] Cleaned up old runs');
    }
  }

  /**
   * Emit a log entry to all clients subscribed to the run
   * Called by RunManager when a new log is added
   */
  emitLog(runId: string, log: RunLog): void {
    if (!this.io) {
      logger.warn({ runId }, '[WorkflowLogStreaming] Cannot emit log: WebSocket server not initialized');
      return;
    }

    // Store log in memory for catch-up (new subscribers get existing logs)
    const logs = this.runLogs.get(runId) || [];
    logs.push(log);
    
    // Limit log retention to prevent memory issues
    if (logs.length > this.MAX_LOGS_PER_RUN) {
      logs.shift(); // Remove oldest log
    }
    
    this.runLogs.set(runId, logs);
    this.runTimestamps.set(runId, Date.now()); // Update last activity timestamp

    // Emit to all clients in the run room
    const room = `run:${runId}`;
    this.io.to(room).emit('workflow_log', {
      type: 'workflow_log',
      runId,
      log,
    } as WorkflowLogUpdate);

    logger.debug({ runId, level: log.level, room }, '[WorkflowLogStreaming] Emitted log to room');
  }

  /**
   * Clean up logs for a completed run
   * Called when a run finishes to free memory
   */
  cleanupRun(runId: string): void {
    this.runLogs.delete(runId);
    this.runTimestamps.delete(runId);
    logger.debug({ runId }, '[WorkflowLogStreaming] Cleaned up logs for run');
  }

  /**
   * Cleanup and stop periodic cleanup
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.runLogs.clear();
    this.runTimestamps.clear();
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Singleton instance
let workflowLogStreamingService: WorkflowLogStreamingService | null = null;

export function getWorkflowLogStreamingService(): WorkflowLogStreamingService {
  if (!workflowLogStreamingService) {
    workflowLogStreamingService = new WorkflowLogStreamingService();
  }
  return workflowLogStreamingService;
}
