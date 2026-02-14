/**
 * Command Execution History Service
 * 
 * Tracks execution history for test dashboard quick actions.
 * Stores recent command executions with timestamps, status, and output summaries.
 * 
 * Created as part of WI-TEST-DASHBOARD-007
 */

import { logger } from '../../utils/logger.js';

export interface CommandExecution {
  id: string;
  command: string;
  commandType: 'health' | 'run' | 'collect-bugs' | 'generate-report' | 'custom';
  timestamp: Date;
  status: 'running' | 'success' | 'error';
  exitCode?: number | null;
  duration?: number; // Duration in milliseconds
  outputLines?: number; // Number of output lines
  error?: string;
}

/**
 * Service for tracking command execution history
 */
export class CommandExecutionHistoryService {
  private static instance: CommandExecutionHistoryService | null = null;
  private history: CommandExecution[] = [];
  private readonly maxHistorySize = 100; // Keep last 100 executions

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): CommandExecutionHistoryService {
    if (!CommandExecutionHistoryService.instance) {
      CommandExecutionHistoryService.instance = new CommandExecutionHistoryService();
    }
    return CommandExecutionHistoryService.instance;
  }

  /**
   * Record a command execution start
   */
  recordStart(command: string, commandType: CommandExecution['commandType']): string {
    const id = `${commandType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const execution: CommandExecution = {
      id,
      command,
      commandType,
      timestamp: new Date(),
      status: 'running',
    };

    this.history.unshift(execution);
    
    // Trim history if too large
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    logger.debug({ id, command, commandType }, 'Command execution started');
    return id;
  }

  /**
   * Update a command execution with completion status
   */
  updateExecution(
    id: string,
    status: 'success' | 'error',
    exitCode?: number | null,
    duration?: number,
    outputLines?: number,
    error?: string
  ): void {
    const execution = this.history.find(e => e.id === id);
    if (!execution) {
      logger.warn({ id }, 'Execution not found for update');
      return;
    }

    execution.status = status;
    execution.exitCode = exitCode;
    execution.duration = duration;
    execution.outputLines = outputLines;
    execution.error = error;

    logger.debug({ id, status, exitCode, duration }, 'Command execution updated');
  }

  /**
   * Get recent execution history
   */
  getHistory(limit: number = 20): CommandExecution[] {
    return this.history.slice(0, limit);
  }

  /**
   * Get execution by ID
   */
  getExecution(id: string): CommandExecution | undefined {
    return this.history.find(e => e.id === id);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
    logger.info('Command execution history cleared');
  }
}

/**
 * Get singleton instance
 */
export function getCommandExecutionHistoryService(): CommandExecutionHistoryService {
  return CommandExecutionHistoryService.getInstance();
}


