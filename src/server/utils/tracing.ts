import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './logger.js';
import { getRequestContext } from './logger.js';

/**
 * OpenTelemetry tracer instance
 */
const tracer = trace.getTracer('beleidsscan-api', '1.0.0');

/**
 * Initialize OpenTelemetry SDK
 */
let sdk: NodeSDK | null = null;

export function initializeTracing(): void {
  try {
    // Only initialize if not already initialized
    if (sdk) {
      logger.warn('Tracing already initialized');
      return;
    }

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'beleidsscan-api',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable fs instrumentation to reduce noise
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
        }),
      ],
    });

    sdk.start();
    logger.info('Tracing initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize tracing');
  }
}

/**
 * Shutdown tracing SDK
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    logger.info('Tracing shutdown');
  }
}

/**
 * Create a new span for an operation
 */
export function createSpan(
  name: string,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: 'internal' | 'server' | 'client';
  }
): Span {
  // Get request context and filter to only include valid OpenTelemetry attribute types
  const requestCtx = getRequestContext();
  const validContextAttrs: Record<string, string | number | boolean> = {};
  
  // Only include values that are valid OpenTelemetry attribute types
  for (const [key, value] of Object.entries(requestCtx)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      validContextAttrs[key] = value;
    }
  }

  const span = tracer.startSpan(name, {
    kind: options?.kind === 'server' ? 1 : options?.kind === 'client' ? 2 : 0,
    attributes: {
      ...options?.attributes,
      // Include filtered request context
      ...validContextAttrs,
    },
  });

  return span;
}

/**
 * Execute a function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: 'internal' | 'server' | 'client';
  }
): Promise<T> {
  const span = createSpan(name, options);
  
  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });
    
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute a synchronous function within a span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: 'internal' | 'server' | 'client';
  }
): T {
  const span = createSpan(name, options);
  
  try {
    const result = context.with(trace.setSpan(context.active(), span), () => {
      return fn(span);
    });
    
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Get current span from context
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan() || undefined;
}

/**
 * Add attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Get trace ID from current span
 */
export function getTraceId(): string | undefined {
  const span = getCurrentSpan();
  if (span) {
    const spanContext = span.spanContext();
    return spanContext.traceId;
  }
  return undefined;
}

