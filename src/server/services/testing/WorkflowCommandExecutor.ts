/**
 * Workflow Command Executor
 *
 * Handles execution of workflow steps test commands.
 * Manages running processes and interacts with the history service.
 *
 * Extracted from testWorkflowStepsRoutes.ts as part of WI-TEST-DASHBOARD-007
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { logger } from '../../utils/logger.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../../types/errors.js';
import { getCommandExecutionHistoryService } from './CommandExecutionHistoryService.js';
import { EventEmitter } from 'events';

/**
 * Process state manager for workflow steps commands
 * Tracks running processes to prevent duplicate executions
 */
export class WorkflowStepsProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private static instance: WorkflowStepsProcessManager;

  public static getInstance(): WorkflowStepsProcessManager {
    if (!WorkflowStepsProcessManager.instance) {
      WorkflowStepsProcessManager.instance = new WorkflowStepsProcessManager();
    }
    return WorkflowStepsProcessManager.instance;
  }

  getProcess(commandType: string): ChildProcess | null {
    return this.processes.get(commandType) || null;
  }

  setProcess(commandType: string, process: ChildProcess | null): void {
    if (process) {
      this.processes.set(commandType, process);
      // Clean up when process exits
      process.on('exit', () => {
        // Only delete if the current process for this type is THIS process
        // This prevents race conditions where a new process is started before the old one fully exits
        const current = this.processes.get(commandType);
        if (current === process) {
          this.processes.delete(commandType);
          this.emit('processCompleted', commandType);
        }
      });
    } else {
      this.processes.delete(commandType);
      this.emit('processCompleted', commandType);
    }
  }

  hasRunningProcess(commandType: string): boolean {
    const process = this.processes.get(commandType);
    if (!process) return false;

    // Check if process is still alive
    if (process.killed || (process.exitCode !== null && process.exitCode !== undefined)) {
      this.processes.delete(commandType);
      return false;
    }

    return true;
  }

  killProcess(commandType: string): boolean {
    const process = this.processes.get(commandType);
    if (!process) return false;

    try {
      process.kill('SIGTERM');
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
      this.processes.delete(commandType);
      this.emit('processCompleted', commandType);
      return true;
    } catch (error) {
      logger.error({ error, commandType }, 'Failed to kill process');
      return false;
    }
  }
}

// Global process manager instance
export const processManager = WorkflowStepsProcessManager.getInstance();

/**
 * Execute a pnpm command and return output
 * Works in both Docker containers and local development
 */
export async function executePnpmCommand(
  args: string[],
  commandId: string
): Promise<{ output: string[]; exitCode: number | null; error?: string }> {
  return new Promise((resolve, reject) => {
    const output: string[] = [];
    const errorOutput: string[] = [];
    const commandDisplay = `pnpm ${args.join(' ')}`;

    logger.info({ command: commandDisplay, commandId, cwd: process.cwd() }, 'Executing pnpm command');

    // In Docker, pnpm should be in PATH, but we can also try to find it
    // shell: false ensures arguments are passed directly without shell interpretation (prevents injection)
    const childProcess = spawn('pnpm', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        // Ensure PATH includes pnpm location
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        // Ensure NODE_ENV is set
        NODE_ENV: process.env.NODE_ENV || 'development',
      },
    });

    processManager.setProcess(commandId, childProcess);

    childProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        output.push(line);
        logger.debug({ command: commandDisplay, commandId, line }, 'Command output');
      });
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        errorOutput.push(line);
        output.push(line); // Also add to main output
        logger.debug({ command: commandDisplay, commandId, line }, 'Command error output');
      });
    });

    childProcess.on('error', (error: Error) => {
      logger.error({ error, command: commandDisplay, commandId }, 'Failed to spawn pnpm process');
      processManager.setProcess(commandId, null);
      reject(new ServiceUnavailableError(`Failed to execute command: ${error.message}`, {
        command: commandDisplay,
        commandId,
        error: error.message,
      }));
    });

    // Add timeout to prevent hanging (5 minutes max for pnpm commands)
    const timeout = setTimeout(() => {
      if (!childProcess.killed && childProcess.exitCode === null) {
        logger.warn({ command: commandDisplay, commandId }, 'Command execution timeout, killing process');
        childProcess.kill('SIGTERM');
        processManager.setProcess(commandId, null);
        reject(new ServiceUnavailableError('Command execution timed out', {
          command: commandDisplay,
          commandId,
          error: 'Command execution exceeded maximum timeout (5 minutes)',
        }));
      }
    }, 5 * 60 * 1000); // 5 minutes

    childProcess.on('exit', (code: number | null) => {
      clearTimeout(timeout);
      processManager.setProcess(commandId, null);
      const error = errorOutput.length > 0 ? errorOutput.join('\n') : undefined;
      logger.info({ command: commandDisplay, commandId, exitCode: code }, 'Command execution completed');
      resolve({ output, exitCode: code, error });
    });
  });
}

/**
 * Execute a workflow steps command and return output
 */
export async function executeCommand(
  scriptPath: string,
  args: string[] = [],
  commandType: string
): Promise<{ output: string[]; exitCode: number | null; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!existsSync(scriptPath)) {
      reject(new NotFoundError('Script not found', scriptPath));
      return;
    }

    // Record execution start
    const historyService = getCommandExecutionHistoryService();
    const command = `tsx ${scriptPath}${args.length > 0 ? ' ' + args.join(' ') : ''}`;
    const executionId = historyService.recordStart(command, commandType as 'health' | 'run' | 'collect-bugs' | 'generate-report');
    const startTime = Date.now();

    const output: string[] = [];
    const errorOutput: string[] = [];

    // Use shell: true to ensure tsx is found in PATH (works better in Docker)
    const childProcess = spawn('tsx', [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true, // Use shell to ensure tsx is found in PATH
      env: {
        ...process.env,
        // Ensure PATH includes pnpm/tsx location
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        // Ensure NODE_ENV is set
        NODE_ENV: process.env.NODE_ENV || 'development',
      },
    });

    // Store process
    processManager.setProcess(commandType, childProcess);

    // Capture stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter((line: string) => line.trim().length > 0);
      output.push(...lines);
    });

    // Capture stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter((line: string) => line.trim().length > 0);
      errorOutput.push(...lines);
      // Also add to output for display
      output.push(...lines);
    });

    // Handle process completion
    childProcess.on('exit', (code: number | null) => {
      processManager.setProcess(commandType, null);

      const duration = Date.now() - startTime;
      const status = code === 0 ? 'success' : 'error';
      const errorMessage = code !== 0 && errorOutput.length > 0
        ? errorOutput.join('\n')
        : code !== 0
        ? `Process exited with code ${code}`
        : undefined;

      // Update execution history
      historyService.updateExecution(
        executionId,
        status,
        code,
        duration,
        output.length,
        errorMessage
      );

      if (code === 0) {
        resolve({
          output,
          exitCode: code,
        });
      } else {
        resolve({
          output,
          exitCode: code,
          error: errorMessage,
        });
      }
    });

    // Handle process errors
    childProcess.on('error', (error: Error) => {
      processManager.setProcess(commandType, null);

      // Update execution history with error
      const duration = Date.now() - startTime;
      historyService.updateExecution(
        executionId,
        'error',
        null,
        duration,
        output.length,
        error.message
      );

      reject(new ServiceUnavailableError(`Failed to execute command: ${error.message}`, {
        command: scriptPath,
        args,
        error: error.message,
      }));
    });
  });
}
