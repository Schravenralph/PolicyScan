/**
 * Memory Monitoring Middleware
 * 
 * Monitors memory usage and logs warnings when usage is high
 */

import { Request, Response, NextFunction } from 'express';
import { getMemoryUsage, formatMemoryUsage } from '../utils/memoryUtils.js';
import { logger } from '../utils/logger.js';

export interface MemoryMonitorOptions {
  /** Log memory usage on every request (default: false) */
  logEveryRequest?: boolean;
  /** Memory threshold in MB to trigger warnings (default: 3072) */
  warningThresholdMB?: number;
  /** Memory threshold in MB to trigger errors (default: 3584) */
  errorThresholdMB?: number;
  /** Only log if memory usage is above threshold (default: true) */
  logOnlyWhenHigh?: boolean;
  /** Sample rate for logging (1.0 = always, 0.1 = 10% of requests) */
  sampleRate?: number;
}

const DEFAULT_OPTIONS: Required<MemoryMonitorOptions> = {
  logEveryRequest: false,
  warningThresholdMB: 3072, // 3GB
  errorThresholdMB: 3584, // 3.5GB
  logOnlyWhenHigh: true,
  sampleRate: 1.0,
};

/**
 * Memory monitoring middleware
 * 
 * Monitors memory usage and logs warnings when usage is high.
 * Can be used to identify memory leaks or high memory operations.
 */
export function memoryMonitor(options: MemoryMonitorOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Sample requests based on sample rate
    if (Math.random() > opts.sampleRate) {
      return next();
    }

    const memoryBefore = getMemoryUsage();
    const heapUsedMB = memoryBefore.heapUsed / 1024 / 1024;

    // Log if requested or if memory is high
    const shouldLog =
      opts.logEveryRequest ||
      (opts.logOnlyWhenHigh && heapUsedMB > opts.warningThresholdMB);

    if (shouldLog) {
      const formatted = formatMemoryUsage(memoryBefore);
      logger.info(
        {
          memory: formatted,
          path: req.path,
          method: req.method,
        },
        '[Memory Monitor] Request started'
      );
    }

    // Check for high memory usage
    if (heapUsedMB > opts.errorThresholdMB) {
      logger.error(
        {
          memory: formatMemoryUsage(memoryBefore),
          path: req.path,
          method: req.method,
        },
        `[Memory Monitor] CRITICAL: Memory usage above error threshold (${opts.errorThresholdMB}MB)`
      );
    } else if (heapUsedMB > opts.warningThresholdMB) {
      logger.warn(
        {
          memory: formatMemoryUsage(memoryBefore),
          path: req.path,
          method: req.method,
        },
        `[Memory Monitor] WARNING: Memory usage above warning threshold (${opts.warningThresholdMB}MB)`
      );
    }

    // Monitor memory after response
    res.on('finish', () => {
      if (shouldLog) {
        const memoryAfter = getMemoryUsage();
        const memoryDelta = memoryAfter.heapUsed - memoryBefore.heapUsed;
        const memoryDeltaMB = memoryDelta / 1024 / 1024;

        if (Math.abs(memoryDeltaMB) > 10) {
          // Significant memory change (>10MB)
          logger.info(
            {
              memoryBefore: formatMemoryUsage(memoryBefore),
              memoryAfter: formatMemoryUsage(memoryAfter),
              memoryDelta: `${memoryDeltaMB > 0 ? '+' : ''}${memoryDeltaMB.toFixed(2)}MB`,
              path: req.path,
              method: req.method,
            },
            '[Memory Monitor] Request completed with significant memory change'
          );
        }
      }
    });

    next();
  };
}

/**
 * Simple memory monitoring middleware (only logs when high)
 */
export function simpleMemoryMonitor() {
  return memoryMonitor({
    logEveryRequest: false,
    logOnlyWhenHigh: true,
    sampleRate: 0.1, // Sample 10% of requests
  });
}







