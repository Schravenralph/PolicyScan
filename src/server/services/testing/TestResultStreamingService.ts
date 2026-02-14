/**
 * Test Result Streaming Service
 * 
 * Provides real-time streaming of test execution results via WebSocket.
 * Integrates with test execution to broadcast live updates.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../../utils/logger.js';

export interface TestExecutionUpdate {
  type: 'test_execution_update';
  runId: string;
  data: {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0-100
    currentTest?: string;
    totalTests?: number;
    completedTests?: number;
    passedTests?: number;
    failedTests?: number;
    skippedTests?: number;
    output?: string[];
    startedAt: number;
    lastUpdated: number;
    completedAt?: number;
    error?: string;
    estimatedSecondsRemaining?: number;
  };
}

export interface TestResultUpdate {
  type: 'test_result';
  runId: string;
  testId: string;
  result: {
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
    output?: string;
  };
}

/**
 * Service for streaming real-time test execution updates
 */
export class TestResultStreamingService {
  private static instance: TestResultStreamingService | null = null;
  private io: SocketIOServer | null = null;
  private activeRuns: Map<string, TestExecutionUpdate['data']> = new Map();
  private readonly MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

  private constructor() {}

  static getInstance(): TestResultStreamingService {
    if (!TestResultStreamingService.instance) {
      TestResultStreamingService.instance = new TestResultStreamingService();
    }
    return TestResultStreamingService.instance;
  }

  /**
   * Initialize the streaming service
   */
  async initialize(): Promise<void> {
    try {
      const { getWebSocketService } = await import('../infrastructure/WebSocketService.js');
      const webSocketService = getWebSocketService();
      this.io = webSocketService.getIO();

      if (!this.io) {
        logger.warn('WebSocketService not initialized, test result streaming will be unavailable');
        return;
      }

      // Set up socket handlers
      const setupSocketHandlers = (socket: Socket) => {
        socket.on('subscribe_test_run', (runId: string) => {
          logger.debug({ runId }, 'Client subscribed to test run');
          socket.join(`test_run:${runId}`);

          // Send current status if available
          const currentStatus = this.activeRuns.get(runId);
          if (currentStatus) {
            socket.emit('test_execution_update', {
              type: 'test_execution_update',
              runId,
              data: currentStatus,
            } as TestExecutionUpdate);
          }
        });

        socket.on('unsubscribe_test_run', (runId: string) => {
          logger.debug({ runId }, 'Client unsubscribed from test run');
          socket.leave(`test_run:${runId}`);
        });
      };

      // Set up handlers for existing connections
      this.io.sockets.sockets.forEach(setupSocketHandlers);

      // Set up handlers for future connections
      this.io.on('connection', setupSocketHandlers);

      logger.info('TestResultStreamingService initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize TestResultStreamingService');
      // Don't throw - service is optional
    }
  }

  /**
   * Initialize tracking for a new test run
   */
  initializeRun(runId: string, totalTests?: number): void {
    if (!this.io) return;

    const data: TestExecutionUpdate['data'] = {
      status: 'pending',
      progress: 0,
      totalTests,
      completedTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      output: [],
      startedAt: Date.now(),
      lastUpdated: Date.now(),
    };

    this.activeRuns.set(runId, data);
    this.broadcastUpdate(runId, data);
  }

  /**
   * Update test run status
   */
  updateRunStatus(runId: string, updates: Partial<TestExecutionUpdate['data']>): void {
    if (!this.io) return;

    const current = this.activeRuns.get(runId);
    if (!current) {
      logger.warn({ runId }, 'Attempted to update non-existent test run');
      return;
    }

    const updated: TestExecutionUpdate['data'] = {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    };

    // Calculate progress if we have test counts
    if (updated.totalTests && updated.totalTests > 0) {
      updated.progress = Math.round(
        ((updated.completedTests || 0) / updated.totalTests) * 100
      );
    }

    // Estimate remaining time
    if (updated.status === 'running' && updated.completedTests && updated.totalTests) {
      const elapsed = Date.now() - updated.startedAt;
      const completed = updated.completedTests;
      if (completed > 0) {
        const avgTimePerTest = elapsed / completed;
        const remaining = (updated.totalTests - completed) * avgTimePerTest;
        updated.estimatedSecondsRemaining = Math.round(remaining / 1000);
      }
    }

    this.activeRuns.set(runId, updated);
    this.broadcastUpdate(runId, updated);
  }

  /**
   * Add output line to test run
   */
  addOutput(runId: string, output: string): void {
    if (!this.io) return;

    const current = this.activeRuns.get(runId);
    if (!current) return;

    const updated: TestExecutionUpdate['data'] = {
      ...current,
      output: [...(current.output || []), output],
      lastUpdated: Date.now(),
    };

    // Keep only last 1000 lines to prevent memory issues
    if (updated.output && updated.output.length > 1000) {
      updated.output = updated.output.slice(-1000);
    }

    this.activeRuns.set(runId, updated);
    this.broadcastUpdate(runId, updated);
  }

  /**
   * Broadcast test result for a specific test
   */
  broadcastTestResult(runId: string, testId: string, result: TestResultUpdate['result']): void {
    if (!this.io) return;

    const update: TestResultUpdate = {
      type: 'test_result',
      runId,
      testId,
      result,
    };

    this.io.to(`test_run:${runId}`).emit('test_result', update);
    logger.debug({ runId, testId, status: result.status }, 'Broadcast test result');
  }

  /**
   * Complete a test run
   */
  completeRun(runId: string, status: 'completed' | 'failed' | 'cancelled', error?: string): void {
    if (!this.io) return;

    const current = this.activeRuns.get(runId);
    if (!current) return;

    const updated: TestExecutionUpdate['data'] = {
      ...current,
      status,
      progress: 100,
      completedAt: Date.now(),
      lastUpdated: Date.now(),
      error,
    };

    this.activeRuns.set(runId, updated);
    this.broadcastUpdate(runId, updated);

    // Clean up after delay
    setTimeout(() => {
      this.activeRuns.delete(runId);
    }, this.MAX_AGE_MS);
  }

  /**
   * Get current status for a test run
   */
  getRunStatus(runId: string): TestExecutionUpdate['data'] | null {
    return this.activeRuns.get(runId) || null;
  }

  /**
   * Broadcast update to all subscribers
   */
  private broadcastUpdate(runId: string, data: TestExecutionUpdate['data']): void {
    if (!this.io) return;

    const update: TestExecutionUpdate = {
      type: 'test_execution_update',
      runId,
      data,
    };

    this.io.to(`test_run:${runId}`).emit('test_execution_update', update);
  }

  /**
   * Clear old runs
   */
  cleanup(): void {
    const now = Date.now();
    for (const [runId, data] of this.activeRuns.entries()) {
      if (data.completedAt && (now - data.completedAt) > this.MAX_AGE_MS) {
        this.activeRuns.delete(runId);
      }
    }
  }
}

export function getTestResultStreamingService(): TestResultStreamingService {
  return TestResultStreamingService.getInstance();
}

