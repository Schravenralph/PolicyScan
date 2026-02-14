/**
 * Crash Diagnostics Utility
 *
 * Captures errors and logs them to localStorage before console is wiped
 * This helps diagnose SIGILL and other browser crashes
 */
interface CrashLog {
    timestamp: string;
    type: string;
    message: string;
    stack?: string;
    url?: string;
    line?: number;
    col?: number;
}
export declare function initializeCrashDiagnostics(): void;
export declare function getCrashLogs(): CrashLog[];
export declare function clearCrashLogs(): void;
export declare function exportCrashLogs(): string;
export {};
