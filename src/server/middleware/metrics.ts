import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from '../utils/metrics.js';
import { addSpanAttributes } from '../utils/tracing.js';

/**
 * Extract run_id from request headers or cookies for E2E test correlation
 * E2E tests can annotate requests with run_id via:
 * - X-Test-Run-Id header
 * - test_run_id cookie
 */
function extractRunId(req: Request): string | undefined {
  // Check header first (preferred for E2E tests)
  const headerRunId = req.headers['x-test-run-id'];
  if (headerRunId && typeof headerRunId === 'string') {
    return headerRunId;
  }

  // Check cookie as fallback
  const cookieRunId = req.cookies?.test_run_id;
  if (cookieRunId && typeof cookieRunId === 'string') {
    return cookieRunId;
  }

  return undefined;
}

/**
 * Middleware to collect HTTP request metrics
 * Supports E2E test correlation via run_id annotation
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const route = req.route?.path || req.path;
  const runId = extractRunId(req);

  // Record metrics when response finishes
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const statusCode = res.statusCode.toString();

    // Build labels with run_id for E2E test correlation
    // run_id is set to empty string when not present to maintain consistent label cardinality
    const labels: Record<string, string> = {
      method: req.method,
      route: route,
      status_code: statusCode,
      run_id: runId || '', // Empty string when not present
    };

    // Record HTTP metrics
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);

    // Add span attributes for tracing
    const spanAttributes: Record<string, string | number> = {
      'http.status_code': res.statusCode,
      'http.route': route,
      'http.method': req.method,
    };

    // Add run_id to span attributes if present
    if (runId) {
      spanAttributes['test.run_id'] = runId;
    }

    addSpanAttributes(spanAttributes);
  });

  next();
}

