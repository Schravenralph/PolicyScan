/**
 * Command Queue Service
 *
 * Manages a FIFO queue for workflow steps test commands.
 * Ensures commands are executed sequentially.
 *
 * Created as part of WI-TEST-DASHBOARD-007
 */

import { logger } from '../../utils/logger.js';
import {
  executeCommand,
  executePnpmCommand,
  processManager
} from './WorkflowCommandExecutor.js';

export interface QueuedCommand {
  id: string;
  type: 'script' | 'pnpm';
  commandType: string; // 'health', 'run', 'collect-bugs', 'generate-report', or custom ID
  scriptPath?: string;
  args?: string[];
  commandString?: string; // For pnpm commands (display)
  pnpmArgs?: string[]; // For pnpm commands (execution)
  status: 'queued' | 'running';
  timestamp: number;
  originalCommand?: string; // For display purposes
}

export class CommandQueueService {
  private static instance: CommandQueueService;
  private queue: QueuedCommand[] = [];
  private isProcessing: boolean = false;

  private constructor() {}

  public static getInstance(): CommandQueueService {
    if (!CommandQueueService.instance) {
      CommandQueueService.instance = new CommandQueueService();
    }
    return CommandQueueService.instance;
  }

  /**
   * Enqueue a script command
   */
  public enqueueScript(
    commandType: string,
    scriptPath: string,
    args: string[] = [],
    originalCommand?: string
  ): QueuedCommand {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const command: QueuedCommand = {
      id,
      type: 'script',
      commandType,
      scriptPath,
      args,
      status: 'queued',
      timestamp: Date.now(),
      originalCommand
    };

    this.queue.push(command);
    logger.info({ id, commandType, queueLength: this.queue.length }, 'Command enqueued');

    // Trigger processing (fire and forget)
    this.processNext().catch(err => {
      logger.error({ err }, 'Error in process loop');
    });

    return command;
  }

  /**
   * Enqueue a pnpm command
   */
  public enqueuePnpm(
    commandString: string,
    pnpmArgs: string[],
    commandId: string
  ): QueuedCommand {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const command: QueuedCommand = {
      id,
      type: 'pnpm',
      commandType: commandId,
      commandString,
      pnpmArgs,
      status: 'queued',
      timestamp: Date.now(),
      originalCommand: commandString
    };

    this.queue.push(command);
    logger.info({ id, commandString, queueLength: this.queue.length }, 'Npm command enqueued');

    // Trigger processing
    this.processNext().catch(err => {
      logger.error({ err }, 'Error in process loop');
    });

    return command;
  }

  /**
   * Process the next item in the queue
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;

    this.isProcessing = true;
    const item = this.queue[0];
    item.status = 'running';

    logger.info({ id: item.id, commandType: item.commandType }, 'Processing queued command');

    try {
      if (item.type === 'script') {
        if (!item.scriptPath) throw new Error('Script path missing');
        await executeCommand(item.scriptPath, item.args, item.commandType);
      } else {
        if (!item.pnpmArgs) throw new Error('pnpm args missing');
        await executePnpmCommand(item.pnpmArgs, item.commandType);
      }
    } catch (error) {
      logger.error({ error, item }, 'Queued command execution failed');
      // We don't throw here to ensure queue continues processing
    } finally {
      // Remove completed item (it was at index 0)
      // Note: we check if queue still has this item at index 0 (in case of weird race conditions or clear)
      if (this.queue.length > 0 && this.queue[0].id === item.id) {
        this.queue.shift();
      }

      this.isProcessing = false;

      // Process next item
      if (this.queue.length > 0) {
        // Use timeout to allow stack to clear and prevent deep recursion
        setTimeout(() => {
          this.processNext().catch(err => {
            logger.error({ err }, 'Error in process loop recursion');
          });
        }, 100);
      }
    }
  }

  /**
   * Cancel a queued or running command
   */
  public cancelCommand(id: string): boolean {
    const index = this.queue.findIndex(item => item.id === id);

    if (index === -1) {
      logger.warn({ id }, 'Attempted to cancel non-existent command');
      return false;
    }

    const item = this.queue[index];

    if (item.status === 'running') {
      // It's currently running, kill the process
      logger.info({ id, commandType: item.commandType }, 'Cancelling running command');
      return processManager.killProcess(item.commandType);
      // The process exit handler in executeCommand will trigger the finally block in processNext
      // which will remove the item from queue and continue
    } else {
      // It's just queued, remove it
      logger.info({ id, commandType: item.commandType }, 'Removing queued command');
      this.queue.splice(index, 1);
      return true;
    }
  }

  /**
   * Get current queue status
   */
  public getQueue(): QueuedCommand[] {
    return [...this.queue];
  }

  /**
   * Clear the entire queue
   */
  public clearQueue(): void {
    // Kill running process if any
    if (this.isProcessing && this.queue.length > 0) {
      const running = this.queue[0];
      processManager.killProcess(running.commandType);
    }
    this.queue = [];
    // isProcessing will naturally become false when current execution (if any) aborts/finishes
  }

  /**
   * Reset service state for testing
   */
  public resetForTesting(): void {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const commandQueueService = CommandQueueService.getInstance();
