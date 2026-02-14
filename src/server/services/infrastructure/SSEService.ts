import { Response } from 'express';
import { logger } from '../../utils/logger.js';
import type { RunStatus } from '../infrastructure/types.js';
import type { RunLog } from '../infrastructure/types.js';
import Redis from 'ioredis';
import { createRedisConfigForBull } from './RedisConnectionManager.js';
import { randomUUID } from 'crypto';

/**
 * SSE event types for workflow queueing and job management
 */
export type SSEEventType =
  | 'job_status'
  | 'queue_position'
  | 'progress'
  | 'log'
  | 'error'
  | 'completed'
  | 'ping'
  | 'catchup_complete'
  | 'graph_update';

/**
 * Base SSE event structure
 */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  id?: string; // Optional event ID for reconnection
  retry?: number; // Optional retry interval in milliseconds
}

/**
 * Job status event data
 */
export interface JobStatusEventData {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  jobId?: string;
  workflowId?: string;
  runId: string;
  timestamp: string;
  message?: string;
}

/**
 * Queue position event data
 */
export interface QueuePositionEventData {
  runId: string;
  position: number;
  totalWaiting: number;
  timestamp: string;
}

/**
 * Progress event data
 */
export interface ProgressEventData {
  runId: string;
  progress: number; // 0-100
  message?: string;
  currentStep?: string;
  totalSteps?: number;
  timestamp: string;
}

/**
 * Log event data
 */
export interface LogEventData {
  runId: string;
  log: RunLog;
  timestamp: string;
  logId?: string; // Unique log ID for deduplication
}

/**
 * Error event data
 */
export interface ErrorEventData {
  runId: string;
  error: string;
  details?: unknown;
  timestamp: string;
}

/**
 * Completed event data
 */
export interface CompletedEventData {
  runId: string;
  status: RunStatus;
  timestamp: string;
  results?: unknown;
}

/**
 * Graph update event data
 */
export interface GraphUpdateEventData {
  runId: string;
  timestamp: string;
  nodes: Array<{
    id: string;
    url: string;
    title: string;
    type: 'page' | 'section' | 'document';
    children: string[];
    lastVisited?: string;
    hasChildren?: boolean;
    childCount?: number;
    score?: number;
    depth?: number;
  }>;
  edges: Array<{ source: string; target: string }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    displayedNode?: string;
    childCount?: number;
    navigatedCount?: number;
  };
  message?: string;
}

/**
 * SSE connection information
 */
interface SSEConnection {
  runId: string;
  response: Response;
  connectedAt: Date;
  lastPing: Date;
}

/**
 * Service for managing Server-Side Events (SSE) connections
 * Handles connection lifecycle, event emission, and cleanup
 */
export class SSEService {
  private connections: Map<string, Set<SSEConnection>> = new Map(); // runId -> Set of connections
  private connectionIds: Map<SSEConnection, string> = new Map(); // connection -> connectionId
  private connectionsById: Map<string, SSEConnection> = new Map(); // connectionId -> connection
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL_MS = 30000; // Send ping every 30 seconds
  private readonly CONNECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private eventIdCounter = 0;
  private logBuffers: Map<string, LogEventData[]> = new Map(); // runId -> buffered logs
  private runStatuses: Map<string, RunStatus> = new Map(); // runId -> run status
  private readonly MAX_BUFFERED_LOGS: number; // Maximum logs to buffer per run (configurable)

  // Redis Pub/Sub for multi-process support
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private instanceId: string = randomUUID();
  private readonly REDIS_CHANNEL = 'sse:events';

  constructor() {
    // Load MAX_BUFFERED_LOGS from environment variable, default to 100
    // Can be configured via SSE_MAX_BUFFERED_LOGS env var
    const maxBufferedLogsEnv = process.env.SSE_MAX_BUFFERED_LOGS;
    this.MAX_BUFFERED_LOGS = maxBufferedLogsEnv 
      ? parseInt(maxBufferedLogsEnv, 10) 
      : 100;
    
    // Validate the value
    if (this.MAX_BUFFERED_LOGS < 10 || this.MAX_BUFFERED_LOGS > 10000) {
      logger.warn(
        { 
          value: this.MAX_BUFFERED_LOGS, 
          default: 100 
        },
        '[SSE] Invalid SSE_MAX_BUFFERED_LOGS value, using default 100'
      );
      this.MAX_BUFFERED_LOGS = 100;
    }
    
    this.startPingInterval();
    this.initializeRedis();
  }

  /**
   * Initialize Redis connections for Pub/Sub
   */
  private initializeRedis(): void {
    try {
      const config = createRedisConfigForBull();

      // Create dedicated clients for Pub/Sub
      // We cannot use the shared pool because subscriber enters a blocking mode
      this.publisher = new Redis(config);
      this.subscriber = new Redis(config);

      // Subscribe to events channel
      this.subscriber.subscribe(this.REDIS_CHANNEL, (err) => {
        if (err) {
          logger.error({ error: err }, '[SSE] Failed to subscribe to Redis channel');
        } else {
          logger.info({ channel: this.REDIS_CHANNEL }, '[SSE] Subscribed to Redis channel');
        }
      });

      // Handle incoming messages
      this.subscriber.on('message', (channel, message) => {
        if (channel === this.REDIS_CHANNEL) {
          this.handleRedisMessage(message);
        }
      });

      // Error handling
      this.publisher.on('error', (err) => logger.error({ error: err }, '[SSE] Redis publisher error'));
      this.subscriber.on('error', (err) => logger.error({ error: err }, '[SSE] Redis subscriber error'));

    } catch (error) {
      logger.error({ error }, '[SSE] Failed to initialize Redis Pub/Sub. SSE will only work in single-process mode.');
    }
  }

  /**
   * Handle incoming Redis message
   */
  private handleRedisMessage(message: string): void {
    try {
      const parsed = JSON.parse(message);
      const { instanceId, runId, event } = parsed;

      // Ignore messages sent by this instance (already processed locally)
      if (instanceId === this.instanceId) {
        return;
      }

      // Broadcast to local connections
      this.broadcastLocal(runId, event);

    } catch (error) {
      logger.error({ error, message }, '[SSE] Failed to process Redis message');
    }
  }

  /**
   * Start periodic ping to keep connections alive
   */
  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      this.pingAllConnections();
    }, this.PING_INTERVAL_MS);

    // Use unref() so this timer doesn't prevent process from exiting
    if (this.pingInterval && typeof this.pingInterval.unref === 'function') {
      this.pingInterval.unref();
    }
  }

  /**
   * Send ping to all active connections to keep them alive
   */
  private pingAllConnections(): void {
    const now = Date.now();
    const connectionsToRemove: Array<{ runId: string; connection: SSEConnection }> = [];

    this.connections.forEach((connectionSet, runId) => {
      connectionSet.forEach((connection) => {
        // Check if connection is stale
        if (now - connection.lastPing.getTime() > this.CONNECTION_TIMEOUT_MS) {
          connectionsToRemove.push({ runId, connection });
          return;
        }

        // Send ping
        try {
          this.sendEvent(connection, {
            type: 'ping',
            data: { timestamp: new Date().toISOString() },
          });
          connection.lastPing = new Date();
        } catch (error) {
          // Connection is dead, mark for removal
          logger.debug({ runId, error }, '[SSE] Connection dead during ping');
          connectionsToRemove.push({ runId, connection });
        }
      });
    });

    // Remove dead connections
    connectionsToRemove.forEach(({ runId, connection }) => {
      this.removeConnection(runId, connection);
    });
  }

  /**
   * Register a new SSE connection for a workflow run
   * @param runId - The workflow run ID
   * @param res - Express response object
   * @param lastEventId - Optional Last-Event-ID header value for reconnection
   * @returns Connection ID for tracking
   */
  registerConnection(runId: string, res: Response, lastEventId?: string): string {
    // Normalize runId to string to ensure consistent matching
    const normalizedRunId = String(runId);
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Generate connection ID
    const connectionId = `sse-${Date.now()}-${++this.eventIdCounter}`;

    // Create connection object
    const connection: SSEConnection = {
      runId: normalizedRunId,
      response: res,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    // Store connection
    if (!this.connections.has(normalizedRunId)) {
      this.connections.set(normalizedRunId, new Set());
    }
    this.connections.get(normalizedRunId)!.add(connection);
    this.connectionIds.set(connection, connectionId);
    this.connectionsById.set(connectionId, connection);

    // Handle client disconnect
    res.on('close', () => {
      this.removeConnection(normalizedRunId, connection);
    });

    // Send initial connection event
    this.sendEvent(connection, {
      type: 'ping',
      data: { 
        message: 'Connected',
        connectionId,
        timestamp: new Date().toISOString() 
      },
    });

    // Send buffered logs (if any) for catch-up
    // If lastEventId is provided, only send logs after that event ID (reconnection scenario)
    const bufferedLogs = this.logBuffers.get(normalizedRunId) || [];
    let logsToSend = bufferedLogs;
    
    if (lastEventId) {
      // Find the index of the last seen event
      // Event IDs are sequential, so we can find logs after the last seen ID
      const lastSeenIndex = bufferedLogs.findIndex((log, index) => {
        // Event IDs are generated as sequential numbers
        // We need to match based on logId or timestamp
        const logId = log.logId || `${normalizedRunId}-${index}`;
        return logId === lastEventId || String(index) === lastEventId;
      });
      
      if (lastSeenIndex >= 0 && lastSeenIndex < bufferedLogs.length - 1) {
        // Send only logs after the last seen one
        logsToSend = bufferedLogs.slice(lastSeenIndex + 1);
        logger.debug({ 
          runId: normalizedRunId, 
          lastEventId, 
          totalBuffered: bufferedLogs.length,
          logsToSend: logsToSend.length 
        }, '[SSE] Reconnection detected, sending logs after lastEventId');
      } else if (lastSeenIndex === -1) {
        // Last event ID not found in buffer, send all logs (buffer may have rotated)
        logger.debug({ 
          runId: normalizedRunId, 
          lastEventId,
          totalBuffered: bufferedLogs.length 
        }, '[SSE] LastEventId not found in buffer, sending all buffered logs');
      }
    }
    
    if (logsToSend.length > 0) {
      logsToSend.forEach((logData) => {
        try {
          this.sendEvent(connection, {
            type: 'log',
            data: logData,
            id: logData.logId, // Use logId as event ID for deduplication
          });
        } catch (error) {
          logger.debug({ error, runId: normalizedRunId }, '[SSE] Failed to send buffered log');
        }
      });
      
      // Send catch-up complete marker
      this.sendEvent(connection, {
        type: 'catchup_complete',
        data: {
          runId: normalizedRunId,
          bufferedLogsCount: logsToSend.length,
          totalBuffered: bufferedLogs.length,
          reconnected: !!lastEventId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    logger.info(
      { 
        runId: normalizedRunId, 
        connectionId,
        totalConnectionsForRun: this.connections.get(normalizedRunId)?.size || 0,
        totalConnections: this.getTotalConnectionCount(),
        bufferedLogsSent: logsToSend.length,
        totalBuffered: bufferedLogs.length,
        isReconnection: !!lastEventId,
        lastEventId: lastEventId || undefined
      }, 
      '[SSE] Registered new connection'
    );

    return connectionId;
  }

  /**
   * Remove a connection
   */
  private removeConnection(runId: string, connection: SSEConnection): void {
    const connectionSet = this.connections.get(runId);
    if (connectionSet) {
      connectionSet.delete(connection);
      if (connectionSet.size === 0) {
        this.connections.delete(runId);
      }
    }

    // Clean up ID mappings
    const connectionId = this.connectionIds.get(connection);
    if (connectionId) {
      this.connectionsById.delete(connectionId);
    }
    this.connectionIds.delete(connection);

    logger.debug({ runId }, '[SSE] Removed connection');
  }

  /**
   * Get connection by connectionId
   * Used for sending catch-up logs to a specific connection without re-broadcasting
   */
  private getConnectionById(connectionId: string): SSEConnection | null {
    for (const [connection, id] of this.connectionIds.entries()) {
      if (id === connectionId) {
        return connection;
      }
    }
    return null;
  }

  /**
   * Send a log event directly to a specific connection (for catch-up)
   * This does NOT re-buffer or re-broadcast to other connections
   * @param connectionId - The connection ID returned by registerConnection
   * @param logData - The log event data to send
   */
  sendLogToConnection(connectionId: string, logData: LogEventData): void {
    const connection = this.getConnectionById(connectionId);
    if (!connection) {
      logger.debug({ connectionId }, '[SSE] Connection not found for catch-up log');
      return;
    }

    try {
      this.sendEvent(connection, {
        type: 'log',
        data: logData,
      });
    } catch (error) {
      logger.debug({ error, connectionId, runId: logData.runId }, '[SSE] Failed to send catch-up log to connection');
    }
  }

  /**
   * Send an event directly to a specific connection (for catch-up)
   * This does NOT re-broadcast to other connections
   * @param connectionId - The connection ID returned by registerConnection
   * @param event - The SSE event to send
   */
  sendEventToConnection(connectionId: string, event: SSEEvent): void {
    const connection = this.getConnectionById(connectionId);
    if (!connection) {
      logger.debug({ connectionId, eventType: event.type }, '[SSE] Connection not found for catch-up event');
      return;
    }

    try {
      this.sendEvent(connection, event);
    } catch (error) {
      logger.debug({ error, connectionId, eventType: event.type }, '[SSE] Failed to send catch-up event to connection');
    }
  }

  /**
   * Send an event to a specific connection
   */
  private sendEvent(connection: SSEConnection, event: SSEEvent): void {
    try {
      const { response } = connection;
      
      // Check if response is still writable
      if (response.writableEnded || response.destroyed) {
        return;
      }

      // Format SSE event
      let sseMessage = '';
      
      // Always include event ID for Last-Event-ID support (reconnection)
      const eventId = event.id || String(++this.eventIdCounter);
      sseMessage += `id: ${eventId}\n`;
      
      if (event.retry) {
        sseMessage += `retry: ${event.retry}\n`;
      }
      
      sseMessage += `event: ${event.type}\n`;
      sseMessage += `data: ${JSON.stringify(event.data)}\n\n`;

      // Write to response
      response.write(sseMessage);
      
      // Flush if available
      if (typeof response.flush === 'function') {
        response.flush();
      }
    } catch (error) {
      // Connection is dead, will be cleaned up by ping interval
      logger.debug({ error, runId: connection.runId }, '[SSE] Failed to send event');
    }
  }

  /**
   * Process event locally (buffer + send to local connections)
   */
  private broadcastLocal(runId: string, event: SSEEvent): void {
    const normalizedRunId = String(runId);

    // Buffer logic (only for logs)
    if (event.type === 'log') {
      const logData = event.data as LogEventData;

      // Generate unique log ID if not provided
      if (!logData.logId) {
        const logTimestamp = logData.log?.timestamp instanceof Date
          ? logData.log.timestamp.getTime()
          : typeof logData.log?.timestamp === 'string'
            ? new Date(logData.log.timestamp).getTime()
            : Date.now();
        const logMessage = typeof logData.log?.message === 'string'
          ? logData.log.message.substring(0, 50)
          : '';
        logData.logId = `${normalizedRunId}-${logTimestamp}-${logMessage}`;
      }

      // Store in buffer for future connections
      const buffer = this.logBuffers.get(normalizedRunId) || [];
      buffer.push(logData);
      if (buffer.length > this.MAX_BUFFERED_LOGS) {
        buffer.shift(); // Remove oldest log
      }
      this.logBuffers.set(normalizedRunId, buffer);
    }

    const connectionSet = this.connections.get(normalizedRunId);
    if (!connectionSet || connectionSet.size === 0) {
      // Log when events are emitted but no connections exist (helps debug timing issues)
      logger.debug(
        { 
          runId: normalizedRunId,
          eventType: event.type, 
          availableRunIds: Array.from(this.connections.keys()),
          totalConnections: this.getTotalConnectionCount()
        }, 
        '[SSE] Event processed locally but no connections for this run'
      );
      return; // No connections for this run
    }

    // Add event ID if not present
    if (!event.id) {
      event.id = String(++this.eventIdCounter);
    }

    // Send to all connections
    const deadConnections: SSEConnection[] = [];
    connectionSet.forEach((connection) => {
      try {
        this.sendEvent(connection, event);
        connection.lastPing = new Date();
      } catch (error) {
        deadConnections.push(connection);
      }
    });

    // Remove dead connections
    deadConnections.forEach((connection) => {
      this.removeConnection(runId, connection);
      logger.debug({ runId, connectionId: this.connectionIds.get(connection) }, '[SSE] Removed dead connection during event emission');
    });

    logger.debug({ 
      runId, 
      eventType: event.type, 
      connections: connectionSet.size,
      deadConnectionsRemoved: deadConnections.length
    }, '[SSE] Emitted event');
  }

  /**
   * Emit job status event
   */
  emitJobStatus(runId: string, data: JobStatusEventData): void {
    const normalizedRunId = String(runId);
    
    // Track run status for connection state awareness
    this.runStatuses.set(normalizedRunId, data.status);
    
    this.emitEvent(normalizedRunId, {
      type: 'job_status',
      data,
    });
  }

  /**
   * Emit queue position event
   */
  emitQueuePosition(runId: string, data: QueuePositionEventData): void {
    this.emitEvent(runId, {
      type: 'queue_position',
      data,
    });
  }

  /**
   * Emit progress event
   */
  emitProgress(runId: string, data: ProgressEventData): void {
    this.emitEvent(runId, {
      type: 'progress',
      data,
    });
  }

  /**
   * Emit log event
   */
  emitLog(runId: string, data: LogEventData): void {
    // Check if run is still active (only log debug if active)
    const normalizedRunId = String(runId);
    const runStatus = this.runStatuses.get(normalizedRunId);
    
    // Emit to connected clients (and Redis)
    this.emitEvent(normalizedRunId, {
      type: 'log',
      data,
    });
  }

  /**
   * Emit error event
   */
  emitError(runId: string, data: ErrorEventData): void {
    this.emitEvent(runId, {
      type: 'error',
      data,
    });
  }

  /**
   * Emit completed event
   */
  emitCompleted(runId: string, data: CompletedEventData): void {
    this.emitEvent(runId, {
      type: 'completed',
      data,
    });
  }

  /**
   * Emit graph update event
   */
  emitGraphUpdate(runId: string, data: GraphUpdateEventData): void {
    this.emitEvent(runId, {
      type: 'graph_update',
      data,
    });
  }

  /**
   * Get connection count for a run
   */
  getConnectionCount(runId: string): number {
    return this.connections.get(runId)?.size || 0;
  }

  /**
   * Get total connection count
   */
  getTotalConnectionCount(): number {
    let total = 0;
    this.connections.forEach((connectionSet) => {
      total += connectionSet.size;
    });
    return total;
  }

  /**
   * Get connection statistics for observability
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsPerRun: Record<string, number>;
    totalBufferedLogs: number;
    bufferedLogsPerRun: Record<string, number>;
  } {
    const connectionsPerRun: Record<string, number> = {};
    const bufferedLogsPerRun: Record<string, number> = {};
    
    this.connections.forEach((connectionSet, runId) => {
      connectionsPerRun[runId] = connectionSet.size;
    });
    
    this.logBuffers.forEach((buffer, runId) => {
      bufferedLogsPerRun[runId] = buffer.length;
    });
    
    const totalBufferedLogs = Array.from(this.logBuffers.values())
      .reduce((sum, buffer) => sum + buffer.length, 0);
    
    return {
      totalConnections: this.getTotalConnectionCount(),
      connectionsPerRun,
      totalBufferedLogs,
      bufferedLogsPerRun,
    };
  }

  /**
   * Clean up connections for a completed run
   */
  cleanupRun(runId: string): void {
    const normalizedRunId = String(runId);
    const connectionSet = this.connections.get(normalizedRunId);
    
    if (connectionSet) {
      // Send completion event before closing
      connectionSet.forEach((connection) => {
        try {
          this.sendEvent(connection, {
            type: 'completed',
            data: {
              runId: normalizedRunId,
              status: 'completed' as RunStatus,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          // Ignore errors when sending completion
        }
      });

      // Close all connections
      connectionSet.forEach((connection) => {
        try {
          if (!connection.response.writableEnded) {
            connection.response.end();
          }
        } catch (error) {
          // Ignore errors when closing
        }
      });

      this.connections.delete(normalizedRunId);
      logger.debug({ runId: normalizedRunId }, '[SSE] Cleaned up connections for run');
    }
    
    // Clean up buffers and status tracking
    this.logBuffers.delete(normalizedRunId);
    this.runStatuses.delete(normalizedRunId);
  }
  
  /**
   * Set run status (for tracking active runs)
   */
  setRunStatus(runId: string, status: RunStatus): void {
    this.runStatuses.set(String(runId), status);
  }

  /**
   * Cleanup and stop ping interval
   */
  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connections
    this.connections.forEach((connectionSet, runId) => {
      connectionSet.forEach((connection) => {
        try {
          if (!connection.response.writableEnded) {
            connection.response.end();
          }
        } catch (error) {
          // Ignore errors
        }
      });
    });

    this.connections.clear();
    this.connectionIds.clear();
    this.connectionsById.clear();

    // Cleanup Redis
    if (this.publisher) {
      this.publisher.quit().catch(() => {});
      this.publisher = null;
    }
    if (this.subscriber) {
      this.subscriber.quit().catch(() => {});
      this.subscriber = null;
    }
  }
}

// Singleton instance
let sseService: SSEService | null = null;

/**
 * Get the singleton SSE service instance
 */
export function getSSEService(): SSEService {
  if (!sseService) {
    sseService = new SSEService();
  }
  return sseService;
}
