import pino from 'pino';
import type { Logger } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage for request context (request ID, user ID, etc.)
 */
export const requestContext = new AsyncLocalStorage<Record<string, unknown>>();

/**
 * Get current request context
 */
export function getRequestContext(): Record<string, unknown> {
  return requestContext.getStore() || {};
}

/**
 * Create logger instance based on environment
 */
function createLogger(): Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = (process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')) as pino.Level;
  const baseLogger = pino({
    level: logLevel,
    base: {
      env: process.env.NODE_ENV || 'development',
      service: 'beleidsscan-api',
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  });

  /**
   * Create child logger with request context
   */
  return baseLogger.child(getRequestContext());
}

/**
 * Main logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export function createChildLogger(additionalContext: Record<string, unknown>): Logger {
  const context = { ...getRequestContext(), ...additionalContext };
  return logger.child(context);
}

/**
 * Helper to bind logger to request context
 */
export function bindLogger(context: Record<string, unknown>): Logger {
  return requestContext.run(context, () => {
    return logger.child(context);
  });
}
