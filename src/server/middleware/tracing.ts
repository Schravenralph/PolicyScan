import { Request, Response, NextFunction } from 'express';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { createSpan, addSpanAttributes } from '../utils/tracing.js';
import { getRequestContext } from '../utils/logger.js';

/**
 * Middleware to create HTTP request spans for tracing
 */
export function tracingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const route = req.route?.path || req.path;
    const spanName = `${req.method} ${route}`;

    // Create span for the HTTP request
    const span = createSpan(spanName, {
      kind: 'server',
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.route': route,
        'http.target': req.path,
        'http.user_agent': req.get('user-agent') || '',
        'http.request_id': (getRequestContext().requestId as string) || '',
      },
    });

    // Store span in request for use in route handlers
    (req as Request & { span?: ReturnType<typeof createSpan> }).span = span;

    // Activate span in OpenTelemetry context so it's available to child spans and addSpanAttributes
    const activeContext = trace.setSpan(context.active(), span);

    // Handle response
    res.on('finish', () => {
      try {
        addSpanAttributes({
          'http.status_code': res.statusCode,
          'http.status_text': res.statusMessage || '',
        });

        if (res.statusCode >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${res.statusCode}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } catch (error) {
        // Log error but don't break request handling
        console.error('[TracingMiddleware] Error updating span on finish:', error);
      } finally {
        span.end();
      }
    });

    // Run the rest of the middleware chain within the span context
    context.with(activeContext, () => {
      next();
    });
  } catch (_error) {
    // If span creation fails, continue without tracing
    next();
  }
}

