// Normalize color environment variables FIRST - before any other imports
// This prevents Node.js warnings about conflicting NO_COLOR and FORCE_COLOR vars
import { normalizeColorEnvironment } from './utils/normalizeColorEnv.js';
normalizeColorEnvironment();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { createServer as createHttpServer } from 'http';
import { connectDB, checkDatabaseHealth, getConnectionPoolStatus } from './config/database.js';
import { checkNeo4jHealth } from './config/neo4j.js';
import { checkGraphDBHealth } from './config/graphdb.js';
import queriesRouter from './routes/queries.js';
import bronwebsitesRouter from './routes/bronwebsites.js';
import canonicalDocumentsRouter from './routes/canonical-documents.js';
import { createScanRouter } from './routes/scan.js';
import searchRouter from './routes/searchRoutes.js';
import qaRouter from './routes/qaRoutes.js';
import summarizationRouter from './routes/summarizationRoutes.js';
import stepRoutes from './routes/stepRoutes.js';
import { createExportRoutes } from './routes/exportRoutes.js';
import { createExportTemplateRoutes } from './routes/exportTemplateRoutes.js';
import knowledgeGraphRouter, { registerKnowledgeGraphService } from './routes/knowledgeGraphRoutes.js';
import neo4jBloomRouter from './routes/neo4jBloomRoutes.js';
import { createWorkflowRouter } from './routes/workflowRoutes.js';
import { createWorkflowMetricsRouter } from './routes/workflowMetricsRoutes.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createSubgraphRouter, createOutputRouter } from './routes/subgraphRoutes.js';
import { createCommonCrawlRouter } from './routes/commonCrawlRoutes.js';
import commonCrawlDatabaseRouter from './routes/commonCrawlDatabaseRoutes.js';
import { createGraphStreamRouter } from './routes/graphStreamRoutes.js';
import { createBlockRouter } from './routes/blockRoutes.js';
import ontologyGPTRouter from './routes/ontologyGPTRoutes.js';
import jurisdictionsRouter from './routes/jurisdictions.js';
import { createBenchmarkRouter } from './routes/benchmarkRoutes.js';
import { createProgressRouter } from './routes/progress.js';
import { AuthService } from './services/auth/AuthService.js';
import { RunManager } from './services/workflow/RunManager.js';
import { WorkflowEngine } from './services/workflow/WorkflowEngine.js';
import { hybridSearchService } from './services/query/HybridSearch.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter, mutationLimiter, authLimiter, workflowExecutionLimiter } from './middleware/rateLimiter.js';
import { authenticate, optionalAuth } from './middleware/authMiddleware.js';
import { csrfProtection } from './middleware/csrf.js';
import csrfRouter from './routes/csrfRoutes.js';
import { validate } from './middleware/validation.js';
import { workflowSchemas } from './validation/workflowSchemas.js';
import type { RunLog } from './services/infrastructure/types.js';
import { getPerformanceMonitoringService } from './services/monitoring/PerformanceMonitoringService.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger } from './utils/logger.js';
import { simpleMemoryMonitor } from './middleware/memoryMonitor.js';
import { allPredefinedWorkflows } from './workflows/predefinedWorkflows.js';
import { NavigationGraph } from './services/graphs/navigation/NavigationGraph.js';
// GraphClusteringService reserved for future use
// // GraphClusteringService reserved for future use
// // import { GraphClusteringService } from './services/graphs/navigation/GraphClusteringService.js';
import { initializeMetrics, getMetrics, cleanupMetrics } from './utils/metrics.js';
import { initializeTracing, shutdownTracing } from './utils/tracing.js';
import { getShutdownCoordinator } from './utils/shutdownCoordinator.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { getObservabilityConfig } from './config/observability.js';
import { asyncHandler } from './utils/errorHandling.js';
import { getEnv, validateEnv } from './config/env.js';
import { getConnectionManager } from './config/connectionManager.js';
import { withTimeout } from './utils/withTimeout.js';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenApiValidator from 'express-openapi-validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root (more robust than default dotenv.config())
// This ensures .env is loaded even when running from different directories
const envPath = resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Validate environment variables early - fail fast if config is invalid
try {
  validateEnv();
  logger.info('✅ Environment variables validated successfully');
} catch (error) {
  logger.fatal({ error }, '❌ Environment variable validation failed');
  process.exit(1);
}

const env = getEnv();
const app = express();
const PORT = env.PORT;

// CORS configuration
// Allow origins from environment variable or default to localhost
// For remote access, set ALLOWED_ORIGINS in .env (e.g., "http://157.180.106.205:5173,http://localhost:5173")
const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080', 'http://localhost:8888', 'http://127.0.0.1:5173', 'http://127.0.0.1:8080', 'http://127.0.0.1:8888'];
const allowedOrigins = (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.trim())
    ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
    : defaultOrigins;

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // For development, allow any localhost, 127.0.0.1, or common development ports
        if (env.NODE_ENV === 'development') {
            // Allow localhost variants
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                return callback(null, true);
            }
            // Allow any origin on common development ports (5173, 3000, 8080, 8888)
            // This handles cases where accessing from server IP in development
            const devPorts = [':5173', ':3000', ':8080', ':8888', ':4000'];
            if (devPorts.some(port => origin.includes(port))) {
                return callback(null, true);
            }
        }
        // Log rejected origins for debugging (only in development to avoid log spam)
        if (env.NODE_ENV === 'development') {
            logger.warn({ origin, allowedOrigins }, 'CORS: Origin not allowed');
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
};

// Middleware
app.use(requestIdMiddleware); // Request ID and logging context - must be first
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'", (req) => `ws://${req.headers.host}`, (req) => `wss://${req.headers.host}`],
    },
  },
})); // Security headers - must be early

// Cookie parser - needed early for CSRF and session handling
// Use CSRF_COOKIE_SECRET, or fallback to JWT_SECRET
// In production, one of these must be set - no fallback allowed
let cookieSecret = process.env.CSRF_COOKIE_SECRET || env.JWT_SECRET;
if (!cookieSecret) {
    if (env.NODE_ENV === 'production') {
        logger.fatal('SECURITY: CSRF_COOKIE_SECRET or JWT_SECRET environment variable is required in production.');
        process.exit(1);
    } else {
        // Development fallback - warn but allow
        logger.warn('SECURITY: CSRF_COOKIE_SECRET or JWT_SECRET not set. Using development fallback. This should not be used in production.');
        cookieSecret = 'dev-fallback-secret-not-for-production';
        logger.warn('Using development fallback secret. Set CSRF_COOKIE_SECRET or JWT_SECRET to avoid this warning.');
    }
}
app.use(cookieParser(cookieSecret));

app.use(tracingMiddleware); // Distributed tracing - after request ID
app.use(metricsMiddleware); // Metrics collection - after tracing
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Limit JSON payload size

// Serve stats dashboard route (before static middleware to avoid conflicts)
// Also accessible via /stats-dashboard.html (served by static middleware)
app.get('/stats-dashboard', asyncHandler(async (_req, res) => {
  // Try multiple paths in order of preference
  const paths = [
    join(process.cwd(), 'public', 'stats-dashboard.html'), // Public (mounted in Docker)
    join(process.cwd(), 'stats-dashboard.html'), // Root
    '/app/public/stats-dashboard.html', // Docker absolute public path
    '/app/stats-dashboard.html', // Docker absolute root path
  ];
  
  for (const path of paths) {
    if (existsSync(path)) {
      return res.sendFile(resolve(path));
    }
  }
  
  // If not found, redirect to try static middleware or return error
  res.status(404).json({ 
    error: 'Stats dashboard not found. Run: pnpm run stats:dashboard',
    hint: 'The dashboard is automatically copied to public/ directory when generated.',
    alternative: 'Try accessing /stats-dashboard.html directly',
    cwd: process.cwd()
  });
}));

// Test dashboard routes removed (2026-01-28)
// HTML files have been migrated to React components
// Use React routes (/tests/*) instead of HTML file routes
// Archived HTML files are available in docs/archive/test-dashboard-html/

// Health check endpoint (no rate limiting) - must be before static middleware
// Health endpoint - must respond quickly for Docker health checks
const healthHandler = asyncHandler(async (_req, res) => {
  // Use a very short timeout (1 second) to ensure health endpoint always responds quickly
  // This prevents the endpoint from hanging if database connection is stuck
  const HEALTH_CHECK_TIMEOUT_MS = 1000; // 1 second max
  
  // Set a hard timeout on the response to ensure it never hangs
  const responseTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(200).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: {
          healthy: false,
          error: 'Health check response timeout - endpoint forced to respond',
        },
      });
    }
  }, HEALTH_CHECK_TIMEOUT_MS + 500); // Slightly longer than health check timeout
  
  let dbHealth: { healthy: boolean; latency?: number; error?: string };
  let poolStatus: ReturnType<typeof getConnectionPoolStatus>;
  
  try {
    // Wrap checkDatabaseHealth in a hard timeout to ensure it can't hang
    // Use the same timeout value for both the internal check and the wrapper
    const healthCheckPromise = checkDatabaseHealth(HEALTH_CHECK_TIMEOUT_MS).catch((error) => {
      // Convert rejections to resolved error objects to prevent Promise.race from rejecting
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Database health check failed',
      };
    });
    
    const timeoutPromise = new Promise<{ healthy: boolean; error?: string }>((resolve) => {
      setTimeout(() => {
        resolve({
          healthy: false,
          error: `Health check timeout after ${HEALTH_CHECK_TIMEOUT_MS}ms`,
        });
      }, HEALTH_CHECK_TIMEOUT_MS);
    });
    
    // Both promises now resolve (never reject), so Promise.race will always resolve
    dbHealth = await Promise.race([healthCheckPromise, timeoutPromise]);
    
    try {
      poolStatus = getConnectionPoolStatus();
    } catch {
      poolStatus = { connected: false, isReconnecting: false, reconnectAttemptCount: 0 };
    }
  } catch (error) {
    // Fallback error handling (should not be reached due to .catch above, but safety net)
    dbHealth = { 
      healthy: false, 
      error: error instanceof Error ? error.message : 'Database health check failed' 
    };
    try {
      poolStatus = getConnectionPoolStatus();
    } catch {
      poolStatus = { connected: false, isReconnecting: false, reconnectAttemptCount: 0 };
    }
  } finally {
    // Clear the response timeout since we're responding now
    clearTimeout(responseTimeout);
  }
  
  // Only send response if headers haven't been sent (timeout didn't fire)
  if (!res.headersSent) {
    const health = {
      status: dbHealth.healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        healthy: dbHealth.healthy,
        latency: dbHealth.latency,
        error: dbHealth.error,
        ...poolStatus,
      },
    };
    
    // Always return 200 to prevent Docker from killing the container
    // The 'degraded' status in the body indicates issues without causing container restarts
    res.status(200).json(health);
  }
});

// Handle both GET and HEAD requests for health checks
app.get('/health', healthHandler);
app.head('/health', healthHandler);

// Metrics endpoint (Prometheus format)
app.get('/metrics', asyncHandler(async (_req, res) => {
  const metrics = await getMetrics();
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics);
}));

// Database-specific health check endpoint
app.get('/api/health/db', asyncHandler(async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const poolStatus = getConnectionPoolStatus();
  
  const response = {
    healthy: dbHealth.healthy,
    latency: dbHealth.latency,
    error: dbHealth.error,
    ...poolStatus,
    timestamp: new Date().toISOString(),
  };
  
  const statusCode = dbHealth.healthy ? 200 : 503;
  res.status(statusCode).json(response);
}));

/**
 * Check Redis connection health with a simple ping
 * Uses ioredis directly for fast health checks without initializing queues
 */
async function checkRedisHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  let client: import('ioredis').Redis | null = null;
  try {
    const startTime = Date.now();
    const RedisModule = await import('ioredis');
    // ioredis exports Redis as default, but TypeScript may not recognize it
    const Redis = (RedisModule as any).default || (RedisModule as any).Redis || RedisModule;
    const { validateEnv } = await import('./config/env.js');
    const env = validateEnv();
    
    const redisHost = env.REDIS_HOST;
    // Use env.REDIS_PORT which defaults to 6380 (host port)
    // Inside Docker containers, docker-compose.yml sets REDIS_PORT=6379 (container port)
    // On the host, env.REDIS_PORT should be 6380 (host-mapped port)
    const redisPort = env.REDIS_PORT;
    const redisPassword = process.env.REDIS_PASSWORD;
    
    // Create a temporary Redis client for health check
    client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      connectTimeout: 3000, // 3 second timeout
      retryStrategy: () => null, // Don't retry for health checks
      maxRetriesPerRequest: 1,
      lazyConnect: false, // Connect immediately
    });
    
    if (!client) {
      throw new Error('Failed to create Redis client');
    }
    
    // Wait for connection to be ready, then ping
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        if (client!.status === 'ready') {
          resolve();
        } else {
          client!.once('ready', () => resolve());
          client!.once('error', (err) => reject(err));
          // Timeout if connection doesn't become ready
          setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
        }
      }),
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
      ),
    ]);
    
    // Now ping the Redis server
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('Redis ping timeout')), 2000)
      ),
    ]);
    
    const latency = Date.now() - startTime;
    
    // Clean up connection
    const clientToClose = client;
    if (clientToClose) {
      try {
        await clientToClose.quit();
      } catch {
        // If quit fails, try disconnect
        try {
          clientToClose.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }
    
    if (pong === 'PONG') {
      return {
        healthy: true,
        latency,
      };
    } else {
      return {
        healthy: false,
        error: `Unexpected Redis response: ${pong}`,
      };
    }
  } catch (error) {
    // Clean up connection on error
    if (client) {
      try {
        await client.quit();
      } catch {
        try {
          client.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      error: errorMessage,
    };
  }
}

/**
 * Connection health check endpoint
 * Returns status for all database connections (MongoDB, Neo4j, Redis, GraphDB)
 */
app.get('/health/connections', asyncHandler(async (_req, res) => {
  const timestamp = new Date().toISOString();
  
  // Check all connections in parallel with timeout
  const healthCheckTimeout = 5000; // 5 seconds timeout per connection
  
  const checkWithTimeout = async <T>(
    checkFn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> => {
    return Promise.race([
      checkFn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Health check timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  };
  
  // Run all health checks in parallel
  const [mongodb, neo4j, redis, graphdb] = await Promise.allSettled([
    checkWithTimeout(() => checkDatabaseHealth(healthCheckTimeout), healthCheckTimeout),
    checkWithTimeout(() => checkNeo4jHealth(), healthCheckTimeout),
    checkWithTimeout(() => checkRedisHealth(), healthCheckTimeout),
    checkWithTimeout(() => checkGraphDBHealth(), healthCheckTimeout),
  ]);
  
  // Extract results
  const connections = {
    mongodb: mongodb.status === 'fulfilled' 
      ? mongodb.value 
      : { healthy: false, error: mongodb.reason instanceof Error ? mongodb.reason.message : String(mongodb.reason) },
    neo4j: neo4j.status === 'fulfilled'
      ? neo4j.value
      : { healthy: false, error: neo4j.reason instanceof Error ? neo4j.reason.message : String(neo4j.reason) },
    redis: redis.status === 'fulfilled'
      ? redis.value
      : { healthy: false, error: redis.reason instanceof Error ? redis.reason.message : String(redis.reason) },
    graphdb: graphdb.status === 'fulfilled'
      ? graphdb.value
      : { healthy: false, error: graphdb.reason instanceof Error ? graphdb.reason.message : String(graphdb.reason) },
  };
  
  // Determine overall health
  const allHealthy = Object.values(connections).every(conn => conn.healthy);
  
  const response = {
    timestamp,
    healthy: allHealthy,
    connections,
  };
  
  // Return 200 if all healthy, 503 if any unhealthy
  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(response);
}));

/**
 * Reranker health check endpoint
 * Returns status for reranker service (Ollama, OpenAI, etc.)
 */
app.get('/health/reranker', asyncHandler(async (_req, res) => {
  const timestamp = new Date().toISOString();
  
  try {
    // Import RerankerService dynamically to avoid circular dependencies
    const { RerankerService } = await import('./services/retrieval/RerankerService.js');
    const rerankerService = new RerankerService();
    
    // Check health with timeout (5 seconds)
    const healthCheckTimeout = 5000;
    const healthCheck = await Promise.race([
      rerankerService.checkHealth(),
      new Promise<{ enabled: boolean; provider: string; available: boolean; apiUrl?: string; model?: string; error: string | null; suggestion: string | null }>((_, reject) =>
        setTimeout(() => reject(new Error(`Health check timeout after ${healthCheckTimeout}ms`)), healthCheckTimeout)
      ),
    ]);
    
    const response = {
      ...healthCheck,
      lastCheck: timestamp,
    };
    
    // Return 200 if available or disabled, 503 if enabled but unavailable
    const statusCode = healthCheck.enabled && !healthCheck.available ? 503 : 200;
    res.status(statusCode).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response = {
      enabled: false,
      provider: 'unknown',
      available: false,
      lastCheck: timestamp,
      error: errorMessage,
      suggestion: 'Failed to check reranker health. Check server logs for details.',
    };
    
    res.status(503).json(response);
  }
}));

// Serve static files from public directory (but not API routes)
app.use((req, res, next) => {
  // Skip static file serving for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/api')) {
    return next();
  }
  express.static(join(process.cwd(), 'public'))(req, res, next);
});

// Serve test-results directory for videos and test artifacts
app.use('/test-results', express.static(join(process.cwd(), 'test-results'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
  }
}));

// Swagger UI setup and OpenAPI validation
try {
  // Check multiple possible locations for OpenAPI spec
  const possiblePaths = [
    join(process.cwd(), 'docs/api/openapi.yaml'),
    join(process.cwd(), 'swagger.yaml'),
    join(process.cwd(), 'openapi.yaml'),
  ];
  
  let openApiPath: string | null = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      openApiPath = path;
      break;
    }
  }
  
  if (openApiPath) {
    const openApiSpec = readFileSync(openApiPath, 'utf-8');
    const swaggerDocument = yaml.load(openApiSpec) as Record<string, unknown>;
    
    // Public GET /api/workflows route - returns published workflows from database + predefined workflows
    // This MUST be registered BEFORE OpenAPI validator to avoid validation blocking
    // The route is public (no auth required) and returns workflows for discovery
    app.get('/api/workflows', async (_req, res) => {
        try {
            const { WorkflowModel } = await import('./models/Workflow.js');
            const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
            const publishedWorkflows = await WorkflowModel.findByStatus('Published');
            // Include all predefined workflows for discoverability
            res.json([...publishedWorkflows, ...allPredefinedWorkflows]);
        } catch (error) {
            logger.error({ error }, 'Error fetching workflows');
            // Fallback to predefined workflows only
            try {
                const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
                res.json(allPredefinedWorkflows);
            } catch (fallbackError) {
                logger.error({ error: fallbackError }, 'Error loading predefined workflows');
                res.status(500).json({ error: 'Failed to fetch workflows' });
            }
        }
    });
    
    // Serve Swagger UI at /api-docs
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument as Parameters<typeof swaggerUi.setup>[0], {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Beleidsscan API Documentation',
    }));
    
    // Serve OpenAPI spec as JSON
    app.get('/api-docs/openapi.json', (_req, res) => {
      res.json(swaggerDocument);
    });
    
    // Set up OpenAPI request/response validation
    // Only validate /api routes, skip /api-docs and other non-API routes
    // Note: Response validation is disabled by default as it can be strict and break existing responses
    // Enable it in development if needed for debugging
    const validateResponses = env.NODE_ENV === 'development' && process.env.ENABLE_OPENAPI_RESPONSE_VALIDATION === 'true';
    
    // Middleware to normalize workflow parameters before OpenAPI validation
    // Maps 'query' to 'onderwerp' for workflows that expect 'onderwerp'
    // This must be registered BEFORE OpenAPI validator to normalize params before validation
    app.use('/api/workflows/:id/run', express.json(), (req, res, next) => {
        if (req.method === 'POST' && req.body && typeof req.body === 'object') {
            // Normalize: if 'onderwerp' is missing but 'query' is present, map 'query' to 'onderwerp'
            if (!req.body.onderwerp && req.body.query && typeof req.body.query === 'string') {
                req.body.onderwerp = req.body.query;
            }
        }
        next();
    });
    
    // Initialize OpenAPI validator with error handling
    const enableOpenApiValidation = process.env.ENABLE_OPENAPI_VALIDATION !== 'false';
    
    if (enableOpenApiValidation) {
      try {
        app.use(
          OpenApiValidator.middleware({
            apiSpec: swaggerDocument as Parameters<typeof OpenApiValidator.middleware>[0]['apiSpec'], // Use parsed spec object instead of file path to avoid path resolution issues
            validateRequests: {
            allowUnknownQueryParameters: true, // Allow query params not in spec (for backward compatibility)
            removeAdditional: false, // Allow additional properties (matches Zod .passthrough() behavior)
          },
          validateResponses: validateResponses, // Only validate responses if explicitly enabled
          validateSecurity: false, // Security validation is handled by auth middleware
          // Only validate /api routes, ignore /api-docs, /health, /, and other non-API routes
          // 
          // ⚠️ TEMPORARY WORKAROUND: Routes listed below are excluded from OpenAPI validation
          // because they're not yet documented in the OpenAPI spec. This is NOT a best practice.
          // 
          // ✅ PROPER SOLUTION: Add routes to OpenAPI spec (docs/api/openapi.yaml) and remove from ignorePaths.
          // This enables:
          //   - Contract validation (catches breaking changes)
          //   - API documentation (Swagger UI)
          //   - Client SDK generation
          //   - Better developer experience
          //
          // 📋 TRACKING: See WI-API-002 for progress on adding routes to OpenAPI spec
          // 
        ignorePaths: (path: string) => {
          // Ignore non-API routes
          if (!path.startsWith('/api/')) return true;
          
          // CSRF token endpoint - intentionally excluded (internal security endpoint, not part of public API)
          if (path === '/api/csrf-token') return true;
          
          // Incorrect /api/beleidsscan route - excluded (catch-all handler provides helpful message)
          // This route doesn't exist and should use /api/wizard/* instead
          // The route handler in index.ts catches this and returns 200 OK with guidance
          // (Returns 200 instead of 404 to prevent client-side crashes from browser prefetch behavior)
          // Fix: Also ignore subpaths (e.g. trailing slash) to prevent validation errors
          // Use precise matching to avoid accidentally matching other routes (e.g. /api/beleidsscans)
          if (path === '/api/beleidsscan' || path.startsWith('/api/beleidsscan/')) {
            return true;
          }
          
          // ✅ Benchmark routes now in OpenAPI spec (added 2026-01-30 via WI-API-008):
          // - Phase 1: 4 high-priority routes - ✅ IN SPEC
          // - Phase 2: 4 workflow comparison routes - ✅ IN SPEC
          // - Phase 3: 9 ground truth routes - ✅ IN SPEC
          // - Phase 4: 20 remaining routes - ✅ IN SPEC
          // Total: 37 routes documented
          // ✅ Routes are now validated by OpenAPI validator (removed from ignorePaths 2026-01-30)
          
          // ✅ Test dashboard routes now in OpenAPI spec (added 2026-01-30 via WI-API-006):
          // - /api/tests/status - ✅ IN SPEC
          // - /api/tests/dashboard-data - ✅ IN SPEC
          // - /api/tests/failures/active - ✅ IN SPEC
          // - /api/tests/failure-patterns - ✅ IN SPEC
          // - /api/tests/errors - ✅ IN SPEC
          // - /api/tests/errors/patterns - ✅ IN SPEC
          // - /api/tests/errors/categories - ✅ IN SPEC
          // - /api/tests/errors/{fingerprint} - ✅ IN SPEC
          // Routes are now validated by OpenAPI validator (removed from ignorePaths)
          
          // ✅ Routes now in OpenAPI spec (added 2026-01-15 via WI-API-002):
          // - /api/jurisdictions - ✅ IN SPEC
          // - /api/workflow-configuration - ✅ IN SPEC
          // - /api/runs - ✅ IN SPEC
          // - /api/graph/meta - ✅ IN SPEC
          // - /api/admin/metrics - ✅ IN SPEC
          // - /api/knowledge-graph/hierarchy/level/{level} - ✅ IN SPEC
          // - /api/sustainability/metrics - ✅ IN SPEC
          // - /api/sustainability/kpis - ✅ IN SPEC
          
          // ✅ Geoportaal routes now in OpenAPI spec (added 2026-02-XX):
          // - /api/documents/with-geometry - ✅ IN SPEC
          // Routes are now validated by OpenAPI validator
          
          // ✅ Queue management routes now in OpenAPI spec (added 2026-02-XX):
          // - GET /api/queue/workflow/jobs - ✅ IN SPEC
          // - POST /api/queue/workflow/jobs/:jobId/pause - ✅ IN SPEC
          // - POST /api/queue/workflow/jobs/:jobId/resume - ✅ IN SPEC
          // - DELETE /api/queue/workflow/jobs/:jobId - ✅ IN SPEC
          // Routes are now validated by OpenAPI validator
          
          // ⚠️ SSE endpoint excluded from OpenAPI validation (Server-Sent Events not supported by OpenAPI spec)
          // SSE endpoints use text/event-stream content type, which OpenAPI validator doesn't handle well
          // Route: GET /api/runs/:id/events
          if (path.startsWith('/api/runs/') && path.endsWith('/events')) {
            return true;
          }
          
          // Note: Some sub-routes may still need to be added (e.g., /api/admin/* other than /metrics)
          // These can be added incrementally as needed
          
          return false;
        },
        })
      );
        logger.info(`OpenAPI request validation enabled for /api routes${validateResponses ? ' (response validation also enabled)' : ''}`);
      } catch (validatorError) {
        logger.error({ error: validatorError }, 'Failed to initialize OpenAPI validator - validation disabled');
        logger.warn('API requests will not be validated against OpenAPI spec. This may indicate an issue with the OpenAPI specification file.');
      }
    } else {
      logger.warn('OpenAPI request validation is DISABLED by environment variable.');
    }
    
    logger.info(`Swagger UI available at /api-docs (spec loaded from ${openApiPath})`);
    logger.info(`OpenAPI request validation enabled for /api routes${validateResponses ? ' (response validation also enabled)' : ''}`);
  } else {
    logger.warn('OpenAPI specification not found (checked: docs/api/openapi.yaml, swagger.yaml, openapi.yaml), Swagger UI disabled');
    // If OpenAPI spec is not found, still register the workflows route
    // Public GET /api/workflows route - returns published workflows from database + predefined workflows
    // The route is public (no auth required) and returns workflows for discovery
    app.get('/api/workflows', async (_req, res) => {
        try {
            const { WorkflowModel } = await import('./models/Workflow.js');
            const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
            const publishedWorkflows = await WorkflowModel.findByStatus('Published');
            // Include all predefined workflows for discoverability
            res.json([...publishedWorkflows, ...allPredefinedWorkflows]);
        } catch (error) {
            logger.error({ error }, 'Error fetching workflows');
            // Fallback to predefined workflows only
            try {
                const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
                res.json(allPredefinedWorkflows);
            } catch (fallbackError) {
                logger.error({ error: fallbackError }, 'Error loading predefined workflows');
                res.status(500).json({ error: 'Failed to fetch workflows' });
            }
        }
    });
  }
} catch (error) {
  logger.warn({ error }, 'Failed to load Swagger UI, continuing without API documentation');
  // If Swagger setup fails, still register the workflows route
  // Public GET /api/workflows route - returns published workflows from database + predefined workflows
  app.get('/api/workflows', async (_req, res) => {
      try {
          const { WorkflowModel } = await import('./models/Workflow.js');
          const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
          const publishedWorkflows = await WorkflowModel.findByStatus('Published');
          // Include all predefined workflows for discoverability
          res.json([...publishedWorkflows, ...allPredefinedWorkflows]);
      } catch (error) {
          logger.error({ error }, 'Error fetching workflows');
          // Fallback to predefined workflows only
          try {
              const { allPredefinedWorkflows } = await import('./workflows/predefinedWorkflows.js');
              res.json(allPredefinedWorkflows);
          } catch (fallbackError) {
              logger.error({ error: fallbackError }, 'Error loading predefined workflows');
              res.status(500).json({ error: 'Failed to fetch workflows' });
          }
      }
  });
}

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'Beleidsscan API',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/me',
      },
      queries: '/api/queries',
      scan: '/api/queries/:id/scan',
      search: '/api/search',
      bronwebsites: '/api/bronwebsites',
      canonicalDocuments: '/api/canonical-documents',
      workflows: '/api/workflows',
      runs: '/api/runs',
      notifications: '/api/notifications',
      graph: '/api/graph',
      subgraphs: {
        list: 'GET /api/subgraphs',
        current: 'GET /api/subgraphs/current',
        create: 'POST /api/subgraphs',
        createFromGraph: 'POST /api/subgraphs/from-graph',
        approveEndpoint: 'POST /api/subgraphs/:id/endpoints/approve',
        rejectEndpoint: 'POST /api/subgraphs/:id/endpoints/reject',
      },
      workflowOutputs: {
        list: 'GET /api/workflow-outputs',
        get: 'GET /api/workflow-outputs/:name',
        toDocuments: 'POST /api/workflow-outputs/:name/to-documents',
      },
      modules: {
        list: 'GET /api/workflows/modules',
        get: 'GET /api/workflows/modules/:moduleId',
        schema: 'GET /api/workflows/modules/:moduleId/schema',
        dependencies: 'GET /api/workflows/modules/:moduleId/dependencies',
        categories: 'GET /api/workflows/modules/categories',
        category: 'GET /api/workflows/modules/categories/:category',
        tags: 'GET /api/workflows/modules/tags',
        tag: 'GET /api/workflows/modules/tags/:tag',
        statistics: 'GET /api/workflows/modules/statistics',
      },
      health: '/health',
      statsDashboard: '/stats-dashboard',
    }
  });
});

// Cache statistics endpoint (optional, for monitoring)
app.get('/api/cache/stats', async (_req, res) => {
  try {
    const { QueryEmbeddingService } = await import('./services/ingestion/embeddings/QueryEmbeddingService.js');
    // Create a temporary instance to get default cache stats
    // Note: This shows stats for a new instance, not the one used in workflows
    // For production, consider maintaining a singleton instance
    const tempService = new QueryEmbeddingService();
    const stats = tempService.getCacheStats();
    
    res.json({
      queryEmbedding: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching cache stats');
    res.status(500).json({ 
      error: 'Failed to fetch cache statistics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});


// Start server
async function startServer() {
  const startupStartTime = Date.now();
  
  try {
    // Docker-first check: Warn if running outside Docker (except in test mode)
    if (process.env.NODE_ENV !== 'test') {
      const { isRunningInDocker } = await import('./utils/dockerDetection.js');
      if (!isRunningInDocker()) {
        logger.warn(
          '⚠️  Running outside Docker. This application is designed for Docker-first deployment. ' +
          'For best results, run: docker compose up -d'
        );
      } else {
        logger.info('✅ Running in Docker container');
      }
    }
    
    // Startup logging
    logger.info('🚀 Application starting, connecting to databases...');
    const maskedMongoUri = env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@') || 'not set';
    logger.info({ uri: maskedMongoUri }, 'MongoDB URI configured');

    // Initialize observability (metrics and tracing)
    const observabilityConfig = getObservabilityConfig();
    if (observabilityConfig.metrics.enabled) {
      initializeMetrics();
      logger.info('Metrics collection enabled');
    }
    if (observabilityConfig.tracing.enabled) {
      initializeTracing();
      logger.info('Distributed tracing enabled');
    }

    // Connect to all databases using ConnectionManager
    const connectionManager = getConnectionManager();
    const connectionResults = await connectionManager.connectAll();
    
    // Get MongoDB connection (required, so it should be connected)
    const db = await connectDB();
    
    // Check GraphDB connection result for fallback logic
    const graphdbResult = connectionManager.getConnectionResult('graphdb');
    const graphdbConnected = graphdbResult?.success === true;

    // Initialize database indexes
    try {
        const { AuditLog } = await import('./models/AuditLog.js');
        const { AICrawlingTrace } = await import('./models/AICrawlingTrace.js');
        const { TestHistory } = await import('./models/TestHistory.js');
        const { TestRun } = await import('./models/TestRun.js');
        const { TestLog } = await import('./models/TestLog.js');
        const { ActiveFailure } = await import('./models/ActiveFailure.js');
        const { GroundTruthDataset } = await import('./models/GroundTruthDataset.js');
        const { BenchmarkConfigTemplate } = await import('./models/BenchmarkConfigTemplate.js');
        const { WorkflowComparisonService } = await import('./services/testing/WorkflowComparisonService.js');
        const { GroundTruthEvaluationService } = await import('./services/testing/GroundTruthEvaluationService.js');
        const { ActiveFailureService } = await import('./services/testing/ActiveFailureService.js');
        const { FailureEvent } = await import('./models/FailureEvent.js');
        const { ErrorLog } = await import('./models/ErrorLog.js');
        const { getWorkflowHistoryModel } = await import('./models/WorkflowHistory.js');
        const errorLogRetentionDays = parseInt(process.env.ERROR_LOG_RETENTION_DAYS || '60', 10);
        
        const { DocumentTag } = await import('./models/DocumentTag.js');
        const { DocumentCollection } = await import('./models/DocumentCollection.js');
        const { ApiKey } = await import('./models/ApiKey.js');
        
        await Promise.all([
            AuditLog.ensureIndexes(),
            AICrawlingTrace.ensureIndexes(),
            TestHistory.ensureIndexes(),
            TestRun.ensureIndexes(),
            TestLog.ensureIndexes(),
            ActiveFailure.ensureIndexes(),
            GroundTruthDataset.ensureIndexes(),
            BenchmarkConfigTemplate.ensureIndexes(),
            WorkflowComparisonService.ensureIndexes(),
            GroundTruthEvaluationService.ensureIndexes(),
            ActiveFailureService.ensureAlertSuppressionIndexes(),
            FailureEvent.ensureIndexes(),
            ErrorLog.ensureIndexes(errorLogRetentionDays),
            getWorkflowHistoryModel().ensureIndexes(),
            DocumentTag.ensureIndexes(),
            DocumentCollection.ensureIndexes(),
            ApiKey.ensureIndexes()
        ]);
        logger.info('Database indexes initialized');
    } catch (error) {
        logger.warn({ error }, 'Failed to initialize some database indexes');
        // Don't fail server startup - indexes can be created later
    }

    // Initialize services
    const authService = new AuthService(db);
    
    // Create authentication middleware (used by protected routes)
    // Must be created before routes that use it
    const requireAuth = authenticate(authService);
    
    // Apply optional authentication before rate limiting so developers can be identified
    // This allows rate limiters to check req.user.role and skip limiting for developers/admins
    app.use('/api', optionalAuth(authService));
    
    // Apply general rate limiting to all API routes (after optional auth)
    app.use('/api', apiLimiter);
    
    // Apply performance monitoring middleware (before other routes)
    const performanceMonitoringService = getPerformanceMonitoringService();
    app.use('/api', performanceMonitoringService.trackRequest());
    
    // Apply memory monitoring middleware (after performance monitoring)
    // Monitors memory usage and logs warnings when usage is high
    app.use('/api', simpleMemoryMonitor());
    
    // Health check routes (public, no authentication required)
    // MUST come BEFORE any catch-all /api routes with requireAuth to avoid authentication conflicts
    const { setupHealthCheckRoutes } = await import('./config/healthCheckRoutes.js');
    setupHealthCheckRoutes(app);
    
    // Test routes (public for dashboard access, but can be protected if needed)
    // MUST come BEFORE any catch-all /api routes with requireAuth to avoid authentication conflicts
    // Note: Mount these before runManager initialization as they don't depend on it
    const testRoutes = await import('./routes/testRoutes.js');
    app.use('/api/tests', testRoutes.default);
    app.use('/api/steps', mutationLimiter, requireAuth, csrfProtection, stepRoutes);
    
    const runManager = new RunManager(db);

    // Get Neo4j driver (already connected via ConnectionManager)
    const { getNeo4jDriver } = await import('./config/neo4j.js');
    let neo4jDriver;
    try {
        neo4jDriver = getNeo4jDriver();
        if (!neo4jDriver) {
            throw new Error('Neo4j driver is null after connection');
        }
        logger.info('Neo4j driver available');
        } catch (error) {
        logger.error({ error }, 'CRITICAL: Failed to get Neo4j driver. Navigation graph requires Neo4j.');
        throw new Error(`Neo4j driver not available: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize knowledge graph (GraphDB by default, fallback to Neo4j)
    // GraphDB connection was attempted via ConnectionManager
    // Check if it succeeded and use fallback if needed
    let knowledgeBackend = (process.env.KG_BACKEND || 'graphdb').toLowerCase();
    type KnowledgeGraphServiceType = import('./services/knowledge-graph/core/KnowledgeGraph.js').KnowledgeGraphService | import('./services/graphs/knowledge/GraphDBKnowledgeGraphService.js').GraphDBKnowledgeGraphService;
    let knowledgeGraphService: KnowledgeGraphServiceType | undefined;

    // Try GraphDB if it was requested and ConnectionManager successfully connected it
    if (knowledgeBackend === 'graphdb' && graphdbConnected) {
        logger.info('Initializing knowledge graph (GraphDB)');
        try {
            const { getGraphDBClient } = await import('./config/graphdb.js');
            const { GraphDBKnowledgeGraphService } = await import('./services/graphs/knowledge/GraphDBKnowledgeGraphService.js');
            
            // GraphDB is already connected via ConnectionManager, get the client
            // getGraphDBClient() will throw if client is not available, which is fine - we'll catch and fallback
            const graphdbClient = getGraphDBClient();
            knowledgeGraphService = new GraphDBKnowledgeGraphService(graphdbClient);
            // Add timeout to prevent startup hangs (30 seconds)
            await withTimeout(
                knowledgeGraphService.initialize(),
                30000,
                'Knowledge graph initialization (GraphDB)'
            );
            const stats = await knowledgeGraphService.getStats();
            logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'graphdb' }, 'Knowledge graph loaded');
        } catch (error) {
            logger.warn({ error }, 'GraphDB knowledge graph initialization failed, falling back to Neo4j');
            knowledgeBackend = 'neo4j'; // Fallback to Neo4j
            knowledgeGraphService = undefined; // Reset to ensure Neo4j path is taken
        }
    } else if (knowledgeBackend === 'graphdb' && !graphdbConnected) {
        // GraphDB was requested but connection failed via ConnectionManager
        logger.warn({ 
          error: graphdbResult?.error,
          requested: 'graphdb',
          actual: 'neo4j (fallback)'
        }, 'GraphDB connection failed via ConnectionManager, falling back to Neo4j');
        knowledgeBackend = 'neo4j'; // Fallback to Neo4j
    }
    
    // Use Neo4j if GraphDB wasn't used or if fallback is needed
    if (knowledgeBackend === 'neo4j' || !knowledgeGraphService) {
        logger.info('Initializing knowledge graph (Neo4j)');
        const { getKnowledgeGraphService } = await import('./services/knowledge-graph/core/KnowledgeGraph.js');
        knowledgeGraphService = getKnowledgeGraphService(neo4jDriver);
        // Add timeout to prevent startup hangs (30 seconds)
        await withTimeout(
            knowledgeGraphService.initialize(),
            30000,
            'Knowledge graph initialization (Neo4j)'
        );
        const stats = await knowledgeGraphService.getStats();
        logger.info({ nodeCount: stats.nodeCount, edgeCount: stats.edgeCount, backend: 'neo4j' }, 'Knowledge graph loaded');
    }
    
    if (!knowledgeGraphService) {
        throw new Error('Failed to initialize knowledge graph service');
    }
    registerKnowledgeGraphService(knowledgeGraphService, knowledgeBackend === 'graphdb' ? 'graphdb' : 'neo4j');
    app.locals.knowledgeGraphService = knowledgeGraphService;
    app.locals.knowledgeBackend = knowledgeBackend;

    // Initialize search service (loads vector store and knowledge graph)
    logger.info('Initializing search service');
    // Add timeout to prevent startup hangs (30 seconds)
    await withTimeout(
        hybridSearchService.init(),
        30000,
        'Search service initialization'
    );
    logger.info('Search service initialized');

    // Initialize background job queue workers
    // Note: Redis connection is already established via ConnectionManager
    logger.info('Initializing background job queue workers');
    try {
      const { getQueueService } = await import('./services/infrastructure/QueueService.js');
      const queueService = getQueueService();
      // Start all job processors
      await queueService.processScanJobs();
      await queueService.processEmbeddingJobs();
      await queueService.processProcessingJobs();
      await queueService.processExportJobs();
      await queueService.processWorkflowJobs();
      logger.info('All background job queue workers initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize background job queue workers. Jobs will not be processed. Ensure Redis is running.');
      // Don't fail server startup if Redis is not available
      // The queue will fail gracefully when jobs are queued
    }

    // Initialize queue monitoring service
    logger.info('Initializing queue monitoring service');
    try {
      const { getQueueMonitoringService } = await import('./services/monitoring/QueueMonitoringService.js');
      const queueMonitoringService = getQueueMonitoringService();
      queueMonitoringService.start();
      // Store in app.locals for graceful shutdown if needed
      app.locals.queueMonitoringService = queueMonitoringService;
      logger.info('Queue monitoring service initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue monitoring service');
      // Don't fail server startup - monitoring is optional
    }

    // Initialize workflow timeout rate monitor
    try {
      const { getWorkflowTimeoutRateMonitor } = await import('./services/workflow/WorkflowTimeoutRateMonitor.js');
      const timeoutRateMonitor = getWorkflowTimeoutRateMonitor();
      timeoutRateMonitor.start();
      app.locals.workflowTimeoutRateMonitor = timeoutRateMonitor;
      logger.info('Workflow timeout rate monitor initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize workflow timeout rate monitor');
      // Don't fail server startup - alerts can still be sent manually
    }

    // Initialize threshold schedule background job
    logger.info('Initializing threshold schedule background job');
    try {
      const { getResourceThresholdService } = await import('./services/monitoring/ResourceThresholdService.js');
      const { ThresholdScheduleJob } = await import('./services/scheduling/ThresholdScheduleJob.js');
      const thresholdService = getResourceThresholdService();
      const scheduleJob = new ThresholdScheduleJob(thresholdService);
      scheduleJob.start();
      // Store in app.locals for graceful shutdown if needed
      app.locals.thresholdScheduleJob = scheduleJob;
      logger.info('Threshold schedule background job initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize threshold schedule job');
      // Don't fail server startup - schedules can still be applied manually
    }

    // Initialize continuous learning system
    logger.info('Initializing continuous learning system');
    let learningScheduler = null;
    try {
      const { FeedbackCollectionService } = await import('./services/feedback/FeedbackCollectionService.js');
      const { LearningService } = await import('./services/learning/LearningService.js');
      const { FeedbackAnalysisService } = await import('./services/feedback/FeedbackAnalysisService.js');
      const { LearningScheduler } = await import('./services/learning/LearningScheduler.js');
      const { QueryExpansionService } = await import('./services/query/QueryExpansionService.js');
      const { ImborService } = await import('./services/external/imborService.js');

      const feedbackService = new FeedbackCollectionService();
      const queryExpansion = new QueryExpansionService(new ImborService());
      const learningService = new LearningService(queryExpansion);
      const analysisService = new FeedbackAnalysisService();

      learningScheduler = new LearningScheduler(learningService);
      learningScheduler.start();
      app.locals.learningScheduler = learningScheduler;

      // Register feedback routes (authenticated, CSRF protected - mutations modify state)
      // Note: Admin-only routes (quality, learn) have additional authorization middleware
      const { createFeedbackRouter } = await import('./routes/feedbackRoutes.js');
      app.use('/api/feedback', requireAuth, csrfProtection, createFeedbackRouter(feedbackService, learningService, analysisService));
      app.locals.feedbackService = feedbackService;
      app.locals.learningService = learningService;

      // Register label feedback routes (authenticated, CSRF protected)
      logger.debug('Setting up label feedback routes');
      const { createLabelFeedbackRouter } = await import('./routes/labelFeedbackRoutes.js');
      const { activeLearningService } = await import('./services/semantic/ActiveLearningService.js');
      await activeLearningService.initialize();
      app.use('/api/labels', requireAuth, csrfProtection, createLabelFeedbackRouter());

      logger.info('Continuous learning system initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize continuous learning system');
      // Don't fail server startup - feedback collection is optional
    }

    // CSRF token endpoint (public, no CSRF protection needed)
    app.use('/api', csrfRouter);

    // Authentication routes (public, with auth rate limiting)
    app.use('/api/auth', authLimiter, createAuthRoutes(authService));

    // Notification routes (authenticated)
    logger.debug('Setting up notification routes');
    const { createNotificationRoutes } = await import('./routes/notificationRoutes.js');
    app.use('/api/notifications', createNotificationRoutes(authService));

    // Public read-only routes (optional auth for personalization)
    app.use('/api', searchRouter);
    
    // Geoportaal API routes (require API key authentication for external services)
    logger.debug('Setting up Geoportaal routes');
    const { apiKeyAuth } = await import('./middleware/apiKeyAuth.js');
    const documentsWithGeometryRouter = await import('./routes/geoportaal/documentsWithGeometryRoutes.js');
    app.use('/api/documents', apiKeyAuth(), documentsWithGeometryRouter.default);
    
    app.use('/api/qa', qaRouter);
    // Summarization routes (require authentication and CSRF protection to prevent quota abuse)
    app.use('/api/summarization', mutationLimiter, requireAuth, csrfProtection, summarizationRouter);
    app.use('/api/jurisdictions', jurisdictionsRouter);
    app.use('/api/commoncrawl', createCommonCrawlRouter());
    // Common Crawl database routes (require authentication and CSRF protection for mutations)
    app.use('/api/commoncrawl/db', requireAuth, csrfProtection, commonCrawlDatabaseRouter);
    app.use('/api/knowledge-graph', optionalAuth(authService), knowledgeGraphRouter);
    app.use('/api/neo4j', optionalAuth(authService), neo4jBloomRouter);
    app.use('/api/ontology', optionalAuth(authService), ontologyGPTRouter);
    
    // Create shared navigation graph instance using Neo4j (REQUIRED)
    logger.info('Initializing navigation graph with Neo4j');
    const sharedGraph = new NavigationGraph(neo4jDriver);
    await sharedGraph.load();
    const navStats = await sharedGraph.getStatistics();
    logger.info({ totalNodes: navStats.totalNodes, totalEdges: navStats.totalEdges }, 'Navigation graph initialized');
    
    // Create WorkflowEngine with NavigationGraph for monitoring
    const workflowEngine = new WorkflowEngine(runManager, sharedGraph);
    
    // Initialize and register default workflow modules
    logger.info('Initializing workflow modules');
    try {
      const { registerDefaultModules } = await import('./services/workflowModules/index.js');
      registerDefaultModules();
      
      // Register modules with workflowEngine for benchmarking
      const { moduleRegistry } = await import('./services/workflow/WorkflowModuleRegistry.js');
      const allModules = moduleRegistry.getAll();
      for (const entry of allModules) {
        workflowEngine.registerModule(entry.metadata.id, entry.module);
      }
      logger.info('Workflow modules registered');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize workflow modules');
      // Don't fail server startup - modules are optional for now
    }
    
    // Initialize wizard system
    logger.info('Initializing wizard system');
    try {
      // Register wizard definition
      const { beleidsscanWizardDefinitionV1 } = await import('./services/wizard/definitions/beleidsscanWizardDefinition.js');
      const { WizardSessionEngine } = await import('./services/wizard/WizardSessionEngine.js');
      WizardSessionEngine.registerWizardDefinition(beleidsscanWizardDefinitionV1);
      logger.info('Wizard definition registered: beleidsscan-wizard v1');
      
      // Register wizard API routes
      const { createBeleidsscanWizardRoutes } = await import('./routes/beleidsscanWizardRoutes.js');
      app.use('/api/wizard', createBeleidsscanWizardRoutes(authService));
      logger.info('Wizard API routes registered');
      
      // Register all wizard step actions
      const { registerAllActions } = await import('./services/wizard/steps/index.js');
      await registerAllActions();
      logger.info('All wizard step actions registered');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize wizard system');
      // Don't fail server startup - wizard is optional for now
    }
    
    // Setup benchmark router
    app.use('/api/benchmark', optionalAuth(authService), createBenchmarkRouter());
    
    // Module API routes (public read-only)
    const { createModuleRoutes } = await import('./routes/modules.js');
    app.use('/api/workflows/modules', optionalAuth(authService), createModuleRoutes());
    
    logger.debug('Setting up routes');
    // sharedClusteringService is reserved for future use
     
    // const _sharedClusteringService: GraphClusteringService | null = null;
    
    // Note: GET /api/workflows is registered earlier (before OpenAPI validator) to avoid validation blocking
    // The route handler was moved above, before the OpenAPI validator middleware
    
    // Graph routes (require authentication and CSRF protection)
    // Must be mounted BEFORE graph stream router to avoid route conflicts
    // Router defines routes like /graph, so when mounted at /api, they become /api/graph
    // Skip middleware for public routes like /api/workflows
    logger.debug('Setting up workflow graph router');
    const { createWorkflowGraphRouter } = await import('./routes/workflowGraphRoutes.js');
    const workflowGraphRouter = createWorkflowGraphRouter(sharedGraph);
    
    // Conditional middleware: only apply auth/CSRF to graph routes, not public routes
    app.use('/api', (req, res, next) => {
        // Skip all middleware for public GET /api/workflows route - let it fall through to the route handler
        if (req.path === '/workflows' && req.method === 'GET') {
            return next(); // Continue to next middleware/route, router will pass through since it doesn't handle /workflows
        }
        // For graph routes handled by workflowGraphRouter, apply authentication, rate limiting, and CSRF
        // Only apply requireAuth to routes that actually need it (workflowGraphRouter handles /graph routes)
        if (req.path.startsWith('/graph')) {
            requireAuth(req, res, (err) => {
                if (err) return next(err);
                mutationLimiter(req, res, (err) => {
                    if (err) return next(err);
                    csrfProtection(req, res, next);
                });
            });
        } else {
            // For other routes, just continue (they'll be handled by their own middleware)
            next();
        }
    }, workflowGraphRouter);
    
    // Pass shared graph instance to graph stream router
    // Mounted after workflow graph router to avoid conflicts with /api/graph routes
    // CSRF protection applied to mutation endpoints (POST, DELETE)
    logger.debug('Setting up graph stream router');
    app.use('/api/graph', requireAuth, csrfProtection, createGraphStreamRouter(runManager, () => sharedGraph));
    logger.debug('Setting up block router');
    app.use('/api/blocks', createBlockRouter(authService));
    
    // Workflow management routes (authenticated, CSRF protected)
    // This must come AFTER the public GET /api/workflows route
    logger.debug('Setting up workflow management routes');
    const { createWorkflowManagementRouter } = await import('./routes/workflowManagementRoutes.js');
    app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowManagementRouter(authService, runManager));
    
    // Scraper plugin routes (read-only, no auth required for discovery)
    logger.debug('Setting up scraper plugin routes');
    const { createScraperPluginRouter } = await import('./routes/scraperPluginRoutes.js');
    app.use('/api/scrapers', createScraperPluginRouter());
    
    // Workflow sharing routes (authenticated, CSRF protected)
    logger.debug('Setting up workflow sharing routes');
    const { createWorkflowSharingRouter } = await import('./routes/workflowSharingRoutes.js');
    app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowSharingRouter(authService));
    
    // Queue management routes (authenticated)
    logger.debug('Setting up queue management routes');
    const { createQueueRouter } = await import('./routes/queueRoutes.js');
    app.use('/api/queue', requireAuth, createQueueRouter());
    
    logger.info('Routes setup complete');
    
    // Note: GET /api/runs is now handled in workflowRunRoutes.ts via workflow router
    // Removed duplicate endpoint to avoid conflicts

    // GET /api/runs/:id/logs
    // Get raw logs for a run (for debugging/technical use)
    app.get('/api/runs/:id/logs', validate(workflowSchemas.getRun), async (req, res) => {
        try {
            const { id } = req.params;
            const run = await runManager.getRun(id);

            if (!run) {
                return res.status(404).json({ error: 'Run not found' });
            }

            // Return raw logs array (not formatted, unlike /runs/:id which returns formatted logs)
            // Handle MongoDB serialization - ensure timestamps are properly formatted
            const logs = (run.logs || []).map((log: RunLog) => ({
                timestamp: log.timestamp instanceof Date 
                    ? log.timestamp.toISOString()
                    : typeof log.timestamp === 'string'
                    ? log.timestamp
                    : new Date().toISOString(),
                level: log.level,
                message: log.message,
                ...(log.metadata && { metadata: log.metadata })
            }));

            res.json(logs);
        } catch (error) {
            logger.error({ error, runId: req.params.id }, 'Error fetching run logs');
            res.status(500).json({ error: 'Failed to fetch run logs' });
        }
    });
    
    // Graph meta endpoint has been moved to workflowGraphRoutes.ts
    
    // Protected mutation routes (require authentication and CSRF protection)
    app.use('/api/queries', requireAuth, csrfProtection, queriesRouter);
    // Apply workflow execution rate limiter to scan endpoint (POST /api/queries/:id/scan)
    app.use('/api/queries', workflowExecutionLimiter, requireAuth, csrfProtection, createScanRouter(runManager, workflowEngine));
    app.use('/api/bronwebsites', mutationLimiter, requireAuth, csrfProtection, bronwebsitesRouter);
    // Apply middleware conditionally: GET requests use optionalAuth, mutations require full auth
    logger.info('Setting up canonical documents routes at /api/canonical-documents');
    app.use('/api/canonical-documents', (req, res, next) => {
      // For GET requests, use optional authentication (allows unauthenticated access)
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return optionalAuth(authService)(req, res, next);
      }
      // For mutations (POST, PATCH, PUT, DELETE), require full authentication and CSRF
      mutationLimiter(req, res, (err) => {
        if (err) return next(err);
        requireAuth(req, res, (err) => {
          if (err) return next(err);
          csrfProtection(req, res, next);
        });
      });
    }, canonicalDocumentsRouter);
    app.use('/api/export', mutationLimiter, requireAuth, csrfProtection, createExportRoutes(authService));
    app.use('/api', requireAuth, csrfProtection, createExportTemplateRoutes(authService));
    
    // Note: Graph routes are now mounted earlier (before graph stream router) to avoid route conflicts
    
    // Pass shared graph instance to workflow router (already initialized with Neo4j)
    // Get learningService from app.locals if available
    const learningService = app.locals.learningService as import('./services/learning/LearningService.js').LearningService | undefined;
    // Apply middleware conditionally - skip public GET /api/workflows route
    app.use('/api', (req, res, next) => {
        // Skip auth/CSRF for public GET /api/workflows route
        if (req.path === '/workflows' && req.method === 'GET') {
            return next();
        }
        // Apply workflow execution rate limiter for POST /workflows/:id/run
        if (req.path.startsWith('/workflows/') && req.path.endsWith('/run') && req.method === 'POST') {
            return workflowExecutionLimiter(req, res, (err) => {
                if (err) return next(err);
                mutationLimiter(req, res, (err) => {
                    if (err) return next(err);
                    requireAuth(req, res, (err) => {
                        if (err) return next(err);
                        csrfProtection(req, res, next);
                    });
                });
            });
        }
        // Apply auth/CSRF for other routes
        mutationLimiter(req, res, (err) => {
            if (err) return next(err);
            requireAuth(req, res, (err) => {
                if (err) return next(err);
                csrfProtection(req, res, next);
            });
        });
    }, createWorkflowRouter(runManager, workflowEngine, sharedGraph, learningService));
    
    // Subgraph and workflow output routes (require authentication and CSRF protection)
    app.use('/api/subgraphs', requireAuth, csrfProtection, createSubgraphRouter(sharedGraph));
    app.use('/api/workflow-outputs', requireAuth, csrfProtection, createOutputRouter());
    
    // Progress tracking routes (require authentication)
    app.use('/api/progress', createProgressRouter(authService));

    // Admin routes (require authentication, admin role, and CSRF protection)
    const { createAdminRoutes } = await import('./routes/adminRoutes.js');
    app.use('/api/admin', mutationLimiter, requireAuth, csrfProtection, createAdminRoutes(authService));
    
    // Scheduler routes (authenticated, CSRF protected, admin only - handled by route middleware)
    logger.debug('Setting up scheduler routes');
    const schedulerRouter = await import('./routes/scheduler.js');
    app.use('/api/admin/scheduler', mutationLimiter, requireAuth, csrfProtection, schedulerRouter.default);
    
    // Feature flags routes (admin only, CSRF protected)
    const { createFeatureFlagsRoutes } = await import('./routes/featureFlags.js');
    app.use('/api/feature-flags', mutationLimiter, requireAuth, csrfProtection, createFeatureFlagsRoutes(authService));

    // Workflow configuration routes (authenticated users, CSRF protected)
    const { createWorkflowConfigurationRoutes } = await import('./routes/workflowConfigurationRoutes.js');
    app.use('/api/workflow-configuration', mutationLimiter, requireAuth, csrfProtection, createWorkflowConfigurationRoutes(authService));

    // AI Crawling configuration routes (CSRF protected)
    const { createAICrawlingRoutes } = await import('./routes/aiCrawlingRoutes.js');
    app.use('/api/ai-crawling', mutationLimiter, requireAuth, csrfProtection, createAICrawlingRoutes(authService));

    // Error monitoring routes (require authentication, admin role, and CSRF protection)
    const { createErrorMonitoringRoutes } = await import('./routes/errorMonitoringRoutes.js');
    app.use('/api/errors', mutationLimiter, requireAuth, csrfProtection, createErrorMonitoringRoutes(authService));

    // AI usage monitoring routes (require authentication, admin role, and CSRF protection)
    const { createAIUsageMonitoringRoutes } = await import('./routes/aiUsageMonitoringRoutes.js');
    app.use('/api/ai-usage', mutationLimiter, requireAuth, csrfProtection, createAIUsageMonitoringRoutes(authService));
    
    // Sustainability routes (public access for transparency)
    const { createSustainabilityRoutes } = await import('./routes/sustainability.js');
    app.use('/api/sustainability', createSustainabilityRoutes());

    // Workflow lifecycle routes (require authentication, developer/admin role, and CSRF protection)
    const { createWorkflowLifecycleRoutes } = await import('./routes/workflowLifecycleRoutes.js');
    app.use('/api/workflows', mutationLimiter, requireAuth, csrfProtection, createWorkflowLifecycleRoutes(authService));
    
    // Workflow monitoring routes (require authentication, admin role)
    const { createWorkflowMonitoringRouter } = await import('./routes/workflowMonitoringRoutes.js');
    const { authorize } = await import('./middleware/authMiddleware.js');
    app.use('/api/workflows', requireAuth, authorize(['admin', 'developer']), createWorkflowMonitoringRouter(runManager));
    
    // Workflow metrics routes (read-only, no CSRF needed)
    app.use('/api/workflows/metrics', optionalAuth(authService), createWorkflowMetricsRouter(authService));

    // Metadata quality routes (require authentication and CSRF protection)
    const { createMetadataQualityRoutes } = await import('./routes/metadataQualityRoutes.js');
    app.use('/api/metadata-quality', mutationLimiter, requireAuth, csrfProtection, createMetadataQualityRoutes(authService));

    // Note: Step routes are mounted earlier (line 734) to avoid conflicts with catch-all routes

    // Feature flags service auto-initializes on module load (see KnowledgeGraphFeatureFlags.ts)
    // No manual initialization needed here

    // Initialize test run service
    try {
      const { testRunService } = await import('./services/testing/TestRunService.js');
      await testRunService.initialize();
      logger.info('TestRunService initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize TestRunService');
      // Don't fail server startup - test run tracking is optional
    }

    // Error handling middleware (must be last)
    logger.debug('Setting up error handler');
    app.use(errorHandler);
    logger.debug('Error handler setup complete');

    // Create HTTP server for WebSocket support
    const httpServer = createHttpServer(app);

    // Configure server timeouts to prevent socket hang up errors
    // Set headers timeout (time to wait for HTTP headers to be sent)
    httpServer.headersTimeout = 60000; // 60 seconds
    // Set request timeout (time to wait for entire request to be received)
    // Must be longer than client timeout (180s) to prevent server closing connection before client
    httpServer.requestTimeout = 200000; // 200 seconds (3.3 minutes) - longer than client's 180s timeout
    // Set keep-alive timeout (time to wait for next request on same connection)
    httpServer.keepAliveTimeout = 65000; // 65 seconds (slightly longer than default client timeout)
    // Set maximum number of requests per connection before closing
    httpServer.maxRequestsPerSocket = 100;
    
    logger.info({
      headersTimeout: httpServer.headersTimeout,
      requestTimeout: httpServer.requestTimeout,
      keepAliveTimeout: httpServer.keepAliveTimeout,
      maxRequestsPerSocket: httpServer.maxRequestsPerSocket
    }, 'HTTP server timeout settings configured');

    // Initialize WebSocket service for real-time updates
    logger.info('Initializing WebSocket server');
    const { getWebSocketService } = await import('./services/infrastructure/WebSocketService.js');
    const webSocketService = getWebSocketService();
    webSocketService.initialize(httpServer);
    logger.info('WebSocket server initialized');

    // Initialize Progress Streaming Service
    const { getProgressStreamingService } = await import('./services/progress/ProgressStreamingService.js');
    const progressStreamingService = getProgressStreamingService();
    await progressStreamingService.initialize();
    logger.info('Progress streaming service initialized');

    // Initialize Workflow Log Streaming Service
    const { getWorkflowLogStreamingService } = await import('./services/workflow/WorkflowLogStreamingService.js');
    const workflowLogStreamingService = getWorkflowLogStreamingService();
    await workflowLogStreamingService.initialize();
    logger.info('Workflow log streaming service initialized');

    // Video cleanup is disabled by default - use manual cleanup via API or script when needed
    // To enable automatic cleanup, set VIDEO_CLEANUP_ENABLED=true in environment
    if (process.env.VIDEO_CLEANUP_ENABLED === 'true') {
      const { cleanupOldVideos } = await import('./utils/videoCleanup.js');
      const VIDEO_CLEANUP_MAX_AGE_DAYS = parseInt(process.env.VIDEO_CLEANUP_MAX_AGE_DAYS || '60', 10);
      
      let videoCleanupInterval: NodeJS.Timeout | null = null;
      let videoCleanupTimeout: NodeJS.Timeout | null = null;
      
      // Run cleanup immediately on startup (optional, can be disabled)
      if (process.env.VIDEO_CLEANUP_ON_STARTUP === 'true') {
        logger.info('Running video cleanup on startup');
        cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
          .then((stats) => {
            logger.info({ stats }, 'Startup video cleanup completed');
          })
          .catch((error) => {
            logger.error({ error }, 'Startup video cleanup failed');
          });
      }

      // Schedule daily cleanup at 2 AM
      const scheduleDailyCleanup = () => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0); // 2 AM
        
        const msUntilCleanup = tomorrow.getTime() - now.getTime();
        
        logger.info({ 
          nextCleanup: tomorrow.toISOString(),
          maxAgeDays: VIDEO_CLEANUP_MAX_AGE_DAYS 
        }, 'Scheduled daily video cleanup');

        videoCleanupTimeout = setTimeout(() => {
          // Run cleanup
          cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
            .then((stats) => {
              logger.info({ stats }, 'Daily video cleanup completed');
            })
            .catch((error) => {
              logger.error({ error }, 'Daily video cleanup failed');
            });

          // Schedule next cleanup (24 hours later)
          videoCleanupInterval = setInterval(() => {
            cleanupOldVideos(join(process.cwd(), 'test-results'), VIDEO_CLEANUP_MAX_AGE_DAYS, false)
              .then((stats) => {
                logger.info({ stats }, 'Daily video cleanup completed');
              })
              .catch((error) => {
                logger.error({ error }, 'Daily video cleanup failed');
              });
          }, 24 * 60 * 60 * 1000); // 24 hours
        }, msUntilCleanup);
      };

      scheduleDailyCleanup();
      logger.info('Video cleanup scheduler initialized');

      // Store cleanup timers for shutdown
      app.locals.videoCleanupInterval = videoCleanupInterval;
      app.locals.videoCleanupTimeout = videoCleanupTimeout;
    } else {
      logger.info('Video cleanup scheduler disabled (set VIDEO_CLEANUP_ENABLED=true to enable)');
    }

    // Store HTTP server in app.locals for graceful shutdown
    app.locals.httpServer = httpServer;
    app.locals.webSocketService = webSocketService;
    app.locals.neo4jDriver = neo4jDriver;
    
    // Register cleanup operations with shutdown coordinator
    const shutdownCoordinator = getShutdownCoordinator();
    
    // Register HTTP server shutdown (must be first to stop accepting new requests)
    shutdownCoordinator.register('HTTP Server', async () => {
      return new Promise<void>((resolve) => {
        httpServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }, 5000); // 5 second timeout
    
    // Register WebSocket service shutdown
    shutdownCoordinator.register('WebSocket Service', async () => {
      if (webSocketService && typeof webSocketService.close === 'function') {
        await webSocketService.close();
        logger.info('WebSocket service closed');
      }
    }, 5000);
    
    // Register background job shutdowns
    shutdownCoordinator.register('Threshold Schedule Job', async () => {
      const thresholdScheduleJob = app.locals.thresholdScheduleJob;
      if (thresholdScheduleJob && typeof thresholdScheduleJob.stop === 'function') {
        thresholdScheduleJob.stop();
        logger.info('Threshold schedule job stopped');
      }
    });
    
    shutdownCoordinator.register('Learning Scheduler', async () => {
      const learningScheduler = app.locals.learningScheduler;
      if (learningScheduler && typeof learningScheduler.stop === 'function') {
        learningScheduler.stop();
        logger.info('Learning scheduler stopped');
      }
    });
    
    shutdownCoordinator.register('Workflow Timeout Rate Monitor', async () => {
      const timeoutRateMonitor = app.locals.workflowTimeoutRateMonitor;
      if (timeoutRateMonitor && typeof timeoutRateMonitor.stop === 'function') {
        timeoutRateMonitor.stop();
        logger.info('Workflow timeout rate monitor stopped');
      }
    });
    
    // Note: Queue Service (Redis) shutdown is handled by ConnectionManager
    // No need to register separately
    
    // Register all database connections shutdown via ConnectionManager
    // ConnectionManager will handle GraphDB shutdown if it was connected
    shutdownCoordinator.register('Database Connections', async () => {
      const connectionManager = getConnectionManager();
      await connectionManager.closeAll(30000); // 30 second timeout for all connections
      logger.info('All database connections closed via ConnectionManager');
    }, 30000); // 30 second timeout for all connections
    
    // Register video cleanup scheduler shutdown (only if enabled)
    if (process.env.VIDEO_CLEANUP_ENABLED === 'true') {
      shutdownCoordinator.register('Video Cleanup Scheduler', async () => {
        const videoCleanupInterval = app.locals.videoCleanupInterval;
        const videoCleanupTimeout = app.locals.videoCleanupTimeout;
        
        if (videoCleanupInterval) {
          clearInterval(videoCleanupInterval);
          logger.info('Video cleanup interval cleared');
        }
        if (videoCleanupTimeout) {
          clearTimeout(videoCleanupTimeout);
          logger.info('Video cleanup timeout cleared');
        }
      });
    }

    // Register metrics cleanup
    if (observabilityConfig.metrics.enabled) {
      shutdownCoordinator.register('Metrics', async () => {
        cleanupMetrics();
        logger.info('Metrics collection stopped');
      });
    }

    // Register HTTP agents cleanup (close connections before tracing)
    shutdownCoordinator.register('HTTP Agents', async () => {
      const { closeHttpAgents } = await import('./config/httpClient.js');
      closeHttpAgents();
      logger.info('HTTP agents closed');
    }, 5000);

    // Register tracing shutdown (should be last)
    shutdownCoordinator.register('Tracing', async () => {
      await shutdownTracing();
      logger.info('Tracing shut down');
    }, 5000);
    
    // Add error handling for server BEFORE listening
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.fatal({ port: PORT, error: error.message }, 'Port already in use');
        process.exit(1);
      } else {
        logger.error({ error }, 'HTTP server error');
      }
    });
    
    httpServer.on('close', () => {
      logger.warn('HTTP server closed');
    });
    
    httpServer.on('listening', () => {
      const startupDuration = Date.now() - startupStartTime;
      const address = httpServer.address();
      
      // Log startup duration with warning if too slow
      if (startupDuration > 60000) {
        logger.warn({
          startupDurationMs: startupDuration,
          startupDurationSec: Math.round(startupDuration / 1000),
        }, 'Server startup took longer than 60 seconds - consider investigating');
      } else {
        logger.info({
          startupDurationMs: startupDuration,
          startupDurationSec: Math.round(startupDuration / 1000),
        }, 'Server startup completed');
      }
      
      logger.info({
        port: PORT,
        address: typeof address === 'string' ? address : `${address?.address}:${address?.port}`,
        api: `http://localhost:${PORT}/api`,
        dashboard: `http://localhost:${PORT}/stats-dashboard`,
        testDashboard: `http://localhost:${PORT}/tests`,
        websocket: `ws://localhost:${PORT}`,
      }, 'Server started successfully and listening');
      
      // Run startup health check after server is ready
      setTimeout(async () => {
        try {
          const { checkDatabaseHealth, getConnectionPoolStatus, getHealthCheckCircuitBreakerStatus } = await import('./config/database.js');
          const health = await checkDatabaseHealth(5000);
          const poolStatus = getConnectionPoolStatus();
          const circuitBreakerStatus = getHealthCheckCircuitBreakerStatus();
          
          if (!health.healthy) {
            logger.error({ 
              health, 
              poolStatus: {
                connected: poolStatus.connected,
                activeConnections: poolStatus.metrics?.activeConnections,
                maxPoolSize: poolStatus.maxPoolSize,
              },
              circuitBreakerStatus 
            }, 'Startup health check failed - server may be degraded');
          } else {
            logger.info({ 
              health: 'OK',
              poolStatus: {
                connected: poolStatus.connected,
                activeConnections: poolStatus.metrics?.activeConnections,
                maxPoolSize: poolStatus.maxPoolSize,
              }
            }, 'Startup health check passed');
          }
        } catch (error) {
          logger.error({ error }, 'Startup health check error');
        }
      }, 5000); // Wait 5 seconds after server starts
      
      // Start connection pool monitoring (every 5 minutes)
      const POOL_MONITORING_INTERVAL = 5 * 60 * 1000; // 5 minutes
      const POOL_WARNING_THRESHOLD = 0.8; // Warn at 80% usage
      
      setInterval(async () => {
        try {
          const { getConnectionPoolStatus, getHealthCheckCircuitBreakerStatus } = await import('./config/database.js');
          const poolStatus = getConnectionPoolStatus();
          const circuitBreakerStatus = getHealthCheckCircuitBreakerStatus();
          const activeConnections = poolStatus.metrics?.activeConnections || 0;
          const maxPoolSize = poolStatus.maxPoolSize || 1;
          const poolUsage = activeConnections / maxPoolSize;
          
          if (poolUsage > POOL_WARNING_THRESHOLD) {
            logger.warn({
              poolUsage: Math.round(poolUsage * 100),
              activeConnections,
              maxPoolSize,
              metrics: poolStatus.metrics,
              circuitBreakerOpen: circuitBreakerStatus.isOpen,
              circuitBreakerFailures: circuitBreakerStatus.consecutiveFailures,
            }, 'Connection pool usage high (>80%)');
          } else if (process.env.NODE_ENV === 'development' || process.env.VERBOSE_POOL_MONITORING === 'true') {
            logger.debug({
              poolUsage: Math.round(poolUsage * 100),
              activeConnections,
              maxPoolSize,
            }, 'Connection pool status');
          }
        } catch (error) {
          logger.error({ error }, 'Error during connection pool monitoring');
        }
      }, POOL_MONITORING_INTERVAL);
    });
    
    // Start HTTP server
    logger.info({ port: PORT }, 'Starting Express server');
    httpServer.listen(PORT, '0.0.0.0', () => {
      // This callback fires when bind is initiated, but 'listening' event confirms it's ready
      logger.debug({ port: PORT }, 'Server listen() called');
    });
  } catch (error) {
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { error: String(error), type: typeof error };
    logger.fatal({ error: errorDetails }, 'Failed to start server');
    // Use graceful shutdown even on startup failure
    const shutdownCoordinator = getShutdownCoordinator();
    try {
      await shutdownCoordinator.shutdown('STARTUP_FAILURE');
      // Exit after graceful shutdown completes
      process.exit(1);
    } catch (shutdownError) {
      logger.error({ error: shutdownError }, 'Error during shutdown after startup failure');
      // Exit even if shutdown failed
      process.exit(1);
    }
  }
}

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error({ 
    reason: reason instanceof Error ? reason : { reason: String(reason) },
    promise: promise.toString()
  }, 'Unhandled promise rejection');
  // Don't exit in production - log and continue
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Continuing despite unhandled rejection in production');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error: Error) => {
  logger.fatal({ error }, 'Uncaught exception - shutting down');
  const shutdownCoordinator = getShutdownCoordinator();
  try {
    await shutdownCoordinator.shutdown('UNCAUGHT_EXCEPTION');
    // Exit after graceful shutdown completes
    process.exit(1);
  } catch (shutdownError) {
    logger.error({ error: shutdownError }, 'Error during shutdown after uncaught exception');
    // Exit even if shutdown failed
    process.exit(1);
  }
});

// Graceful shutdown handler using shutdown coordinator
async function gracefulShutdown(signal: string): Promise<void> {
  const shutdownCoordinator = getShutdownCoordinator();
  
  if (shutdownCoordinator.isShuttingDownStatus()) {
    logger.warn('Shutdown already in progress, forcing exit');
    // Shutdown already in progress, exit immediately
    process.exit(1);
    return;
  }
  
  try {
    await shutdownCoordinator.shutdown(signal);
    // Exit after graceful shutdown completes successfully
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Fatal error during shutdown, forcing exit');
    // Exit even if shutdown failed
    process.exit(1);
  }
}

// Graceful shutdown signal handlers
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch((error) => {
    logger.error({ error }, 'Error in SIGTERM handler - forcing exit');
    // Exit immediately if handler itself fails
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch((error) => {
    logger.error({ error }, 'Error in SIGINT handler - forcing exit');
    // Exit immediately if handler itself fails
    process.exit(1);
  });
});
