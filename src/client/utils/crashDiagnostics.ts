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

const MAX_LOGS = 50;
const STORAGE_KEY = 'beleidsscan_crash_logs';

function saveCrashLog(log: CrashLog): void {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const logs: CrashLog[] = existing ? JSON.parse(existing) : [];
    logs.push(log);
    
    // Keep only last MAX_LOGS entries
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (error) {
    // If localStorage fails, try sessionStorage as fallback
    try {
      sessionStorage.setItem('last_crash_log', JSON.stringify(log));
    } catch {
      // If both fail, we can't save - that's okay
    }
  }
}

export function initializeCrashDiagnostics(): void {
  // Capture errors before they can be wiped
  window.addEventListener('error', (event: ErrorEvent) => {
    const log: CrashLog = {
      timestamp: new Date().toISOString(),
      type: 'error',
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      url: event.filename,
      line: event.lineno,
      col: event.colno,
    };
    
    saveCrashLog(log);
    
    // Also try to log to console (might be wiped, but worth trying)
    console.error('[Crash Diagnostics] Error captured:', log);
  }, true); // Capture phase - catch early
  
  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const log: CrashLog = {
      timestamp: new Date().toISOString(),
      type: 'unhandledrejection',
      message: event.reason?.message || String(event.reason) || 'Unknown rejection',
      stack: event.reason?.stack,
    };
    
    saveCrashLog(log);
    console.error('[Crash Diagnostics] Rejection captured:', log);
  });
  
  // Log initialization
  console.log('[Crash Diagnostics] Initialized - errors will be saved to localStorage');
}

export function getCrashLogs(): CrashLog[] {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
}

export function clearCrashLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function exportCrashLogs(): string {
  const logs = getCrashLogs();
  return JSON.stringify(logs, null, 2);
}
