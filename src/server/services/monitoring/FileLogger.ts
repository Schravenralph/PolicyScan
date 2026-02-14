import fs from 'fs/promises';
import path from 'path';
import { RunLog } from '../infrastructure/types.js';

/**
 * Service for writing workflow execution logs to files
 * Logs are written to data/workflow-logs/{runId}.log
 * 
 * Implements graceful degradation: on first EACCES (permission) error,
 * file logging is disabled for that run to prevent error cascades.
 */
export class FileLogger {
    private logDir: string;
    // Circuit breaker: track which runs have file logging disabled
    private fileLoggingDisabledForRun = new Set<string>();
    // Track which runs have already logged the warning (prevent spam)
    private fileLoggingWarningLoggedForRun = new Set<string>();

    constructor(logDir: string = 'data/workflow-logs') {
        this.logDir = logDir;
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDir(): Promise<void> {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
            // Verify directory was created
            const stat = await fs.stat(this.logDir);
            if (!stat.isDirectory()) {
                throw new Error(`Path ${this.logDir} exists but is not a directory`);
            }
        } catch (error) {
            // Re-throw error so callers can handle it
            // This is important for tests to catch directory creation failures
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'EEXIST') {
                console.error(`Failed to create log directory ${this.logDir}:`, error);
                throw error;
            }
            // EEXIST is okay - directory already exists
        }
    }

    /**
     * Write a log entry to file
     * IMPORTANT: This writes RAW logs only - no formatting applied.
     * Formatting is only applied when displaying logs to users via the API.
     * 
     * Implements graceful degradation: on first EACCES error, disables file logging
     * for this run to prevent error cascades. Logs continue to stdout/console.
     */
    async writeLog(runId: string, log: RunLog): Promise<void> {
        // Circuit breaker: skip file logging if disabled for this run
        if (this.fileLoggingDisabledForRun.has(runId)) {
            return; // Silently skip file logging
        }

        await this.ensureLogDir();
        
        const logFile = path.join(this.logDir, `${runId}.log`);
        const timestamp = log.timestamp instanceof Date 
            ? log.timestamp.toISOString() 
            : new Date(log.timestamp).toISOString();
        
        // Write raw log entry - original message as-is, no formatting
        const logLine = `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${
            log.metadata ? ` | Metadata: ${JSON.stringify(log.metadata)}` : ''
        }\n`;

        try {
            await fs.appendFile(logFile, logLine, 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            
            // Graceful degradation: on first EACCES error, disable file logging for this run
            if (err.code === 'EACCES') {
                this.fileLoggingDisabledForRun.add(runId);
                
                // Log warning only once per run
                if (!this.fileLoggingWarningLoggedForRun.has(runId)) {
                    this.fileLoggingWarningLoggedForRun.add(runId);
                    console.warn(
                        `[File Logger] Permission denied for file logging (run: ${runId}). ` +
                        `Disabling file logger for this run. Logs will continue to stdout.`
                    );
                }
                return; // Don't throw, just skip file logging
            }
            
            // Other errors: log but don't disable (may be transient)
            console.error(`Failed to write log to ${logFile}:`, error);
        }
    }

    /**
     * Write multiple log entries at once
     * IMPORTANT: This writes RAW logs only - no formatting applied.
     * Formatting is only applied when displaying logs to users via the API.
     * 
     * Implements graceful degradation: on first EACCES error, disables file logging
     * for this run to prevent error cascades.
     */
    async writeLogs(runId: string, logs: RunLog[]): Promise<void> {
        // Circuit breaker: skip file logging if disabled for this run
        if (this.fileLoggingDisabledForRun.has(runId)) {
            return; // Silently skip file logging
        }

        await this.ensureLogDir();
        
        const logFile = path.join(this.logDir, `${runId}.log`);
        // Write raw log entries - original messages as-is, no formatting
        const logLines = logs.map(log => {
            const timestamp = log.timestamp instanceof Date 
                ? log.timestamp.toISOString() 
                : new Date(log.timestamp).toISOString();
            
            return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${
                log.metadata ? ` | Metadata: ${JSON.stringify(log.metadata)}` : ''
            }`;
        }).join('\n') + '\n';

        try {
            await fs.appendFile(logFile, logLines, 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            
            // Graceful degradation: on first EACCES error, disable file logging for this run
            if (err.code === 'EACCES') {
                this.fileLoggingDisabledForRun.add(runId);
                
                // Log warning only once per run
                if (!this.fileLoggingWarningLoggedForRun.has(runId)) {
                    this.fileLoggingWarningLoggedForRun.add(runId);
                    console.warn(
                        `[File Logger] Permission denied for file logging (run: ${runId}). ` +
                        `Disabling file logger for this run. Logs will continue to stdout.`
                    );
                }
                return; // Don't throw, just skip file logging
            }
            
            // Other errors: log but don't disable (may be transient)
            console.error(`Failed to write logs to ${logFile}:`, error);
        }
    }

    /**
     * Read logs from file
     */
    async readLogs(runId: string): Promise<string> {
        // Ensure directory exists before trying to read
        await this.ensureLogDir();
        
        const logFile = path.join(this.logDir, `${runId}.log`);
        try {
            return await fs.readFile(logFile, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return '';
            }
            throw error;
        }
    }

    /**
     * Check if log file exists
     */
    async logFileExists(runId: string): Promise<boolean> {
        // Ensure directory exists before checking file
        await this.ensureLogDir();
        
        const logFile = path.join(this.logDir, `${runId}.log`);
        try {
            await fs.access(logFile);
            return true;
        } catch {
            return false;
        }
    }
}

