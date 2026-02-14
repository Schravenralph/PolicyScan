/**
 * OpenAPI/Swagger Configuration
 * 
 * Handles OpenAPI spec loading, Swagger UI setup, and request/response validation.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import OpenApiValidator from 'express-openapi-validator';
import express from 'express';
import { logger } from '../utils/logger.js';
import { getEnv } from './env.js';
import { getAllWorkflowsAsDocuments, getPredefinedWorkflowsAsDocuments } from '../utils/workflowConversion.js';

/**
 * Setup OpenAPI/Swagger configuration
 */
export async function setupOpenApiConfig(app: Express): Promise<void> {
  const env = getEnv();

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

      // Public GET /api/workflows route - returns all workflows from database + predefined workflows
      // This MUST be registered BEFORE OpenAPI validator to avoid validation blocking
      // The route is public (no auth required) and returns workflows for discoverability
      app.get('/api/workflows', async (_req, res) => {
        try {
          const workflows = await getAllWorkflowsAsDocuments();
          res.json(workflows);
        } catch (error) {
          logger.error({ error }, 'Error fetching workflows');
          // Fallback to predefined workflows only
          try {
            const workflows = await getPredefinedWorkflowsAsDocuments();
            res.json(workflows);
          } catch (fallbackError) {
            logger.error({ error: fallbackError }, 'Error loading predefined workflows');
            res.status(500).json({ error: 'Failed to fetch workflows' });
          }
        }
      });

      // Serve Swagger UI at /api-docs
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
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
      app.use('/api/workflows/:id/run', express.json(), (req, _res, next) => {
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
              apiSpec: swaggerDocument as any, // Use parsed spec object instead of file path to avoid path resolution issues
              validateRequests: {
                allowUnknownQueryParameters: true, // Allow query params not in spec (for backward compatibility)
                removeAdditional: false, // Allow additional properties (matches Zod .passthrough() behavior)
              },
              validateResponses: validateResponses, // Only validate responses if explicitly enabled
              validateSecurity: false, // Security validation is handled by auth middleware
              // Only validate /api routes, ignore /api-docs, /health, /, and other non-API routes
              // ⚠️ TEMPORARY WORKAROUND: Routes listed below are excluded from OpenAPI validation
              // because they're not yet documented in the OpenAPI spec. This is NOT a best practice.
              // ✅ PROPER SOLUTION: Add routes to OpenAPI spec (docs/api/openapi.yaml) and remove from ignorePaths.
              // This enables:
              //   - Contract validation (catches breaking changes)
              //   - API documentation (Swagger UI)
              //   - Client SDK generation
              //   - Better developer experience
              // 📋 TRACKING: See WI-API-002 for progress on adding routes to OpenAPI spec
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
                  logger.debug({ path }, 'OpenAPI validator: ignoring /api/beleidsscan path');
                  return true;
                }

                // ✅ Feedback routes now in OpenAPI spec (added 2026-01-30 via WI-API-001):
                // - /api/feedback/interaction - ✅ IN SPEC
                // - /api/feedback/document - ✅ IN SPEC
                // - /api/feedback/qa - ✅ IN SPEC
                // - /api/feedback/analytics - ✅ IN SPEC
                // Routes are now validated by OpenAPI validator (removed from ignorePaths 2026-01-30)

                // ✅ Workflow execution routes - now in OpenAPI spec
                // - /api/workflows/:id/run

                // ✅ Test routes - now in OpenAPI spec
                // - /api/tests/run
                // - /api/tests/status
                // - /api/tests/reset
                // - /api/tests/output

                // ✅ Benchmark routes - now in OpenAPI spec
                // - /api/benchmark/document-set
                // - /api/benchmark/query-sets
                // - /api/benchmark/ground-truth/datasets/:id/exists

                // Admin routes - excluded (internal/admin endpoints, not part of public API)
                if (path.startsWith('/api/admin/')) return true;

                // Stats dashboard route - excluded (internal monitoring endpoint)
                if (path === '/api/stats-dashboard') return true;

                // ✅ Wizard API routes - now in OpenAPI spec
                // - /api/wizard/sessions/*

                // ✅ Graph stream routes - now in OpenAPI spec
                // - /api/graph/stream/*

                // ⚠️ Queue management routes - temporarily excluded (not yet in OpenAPI spec)
                // TODO: Add queue routes to OpenAPI spec (docs/api/openapi.yaml)
                // Routes:
                // - GET /api/queue/workflow/jobs
                // - POST /api/queue/workflow/jobs/:jobId/pause
                // - POST /api/queue/workflow/jobs/:jobId/resume
                // - DELETE /api/queue/workflow/jobs/:jobId
                if (path.startsWith('/api/queue/')) {
                  return true;
                }

                // All other /api routes should be validated
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
        logger.warn('OpenAPI request validation is DISABLED (set ENABLE_OPENAPI_VALIDATION=true to enable). This is a temporary workaround for validator configuration issues.');
      }

      logger.info(`Swagger UI available at /api-docs (spec loaded from ${openApiPath})`);
      logger.info(`OpenAPI request validation enabled for /api routes${validateResponses ? ' (response validation also enabled)' : ''}`);
    } else {
      logger.warn('OpenAPI specification not found (checked: docs/api/openapi.yaml, swagger.yaml, openapi.yaml), Swagger UI disabled');
      // If OpenAPI spec is not found, still register the workflows route
      // Public GET /api/workflows route - returns all workflows from database + predefined workflows
      // The route is public (no auth required) and returns workflows for discoverability
      app.get('/api/workflows', async (_req, res) => {
        try {
          const workflows = await getAllWorkflowsAsDocuments();
          res.json(workflows);
        } catch (error) {
          logger.error({ error }, 'Error fetching workflows');
          // Fallback to predefined workflows only
          try {
            const workflows = await getPredefinedWorkflowsAsDocuments();
            res.json(workflows);
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
    // Public GET /api/workflows route - returns all workflows from database + predefined workflows
    app.get('/api/workflows', async (_req, res) => {
      try {
        const workflows = await getAllWorkflowsAsDocuments();
        // Ensure we always return an array, even if empty
        if (!Array.isArray(workflows)) {
          logger.error({ workflows }, 'Invalid workflows response format, falling back to predefined workflows');
          const predefinedWorkflows = await getPredefinedWorkflowsAsDocuments();
          return res.json(predefinedWorkflows);
        }
        // Validate workflows have required fields
        const validWorkflows = workflows.filter(w => w && w.id && w.name);
        if (validWorkflows.length === 0 && workflows.length > 0) {
          logger.warn('All workflows were invalid, falling back to predefined workflows');
          const predefinedWorkflows = await getPredefinedWorkflowsAsDocuments();
          return res.json(predefinedWorkflows);
        }
        res.json(validWorkflows.length > 0 ? validWorkflows : workflows);
      } catch (error) {
        logger.error({ error }, 'Error fetching workflows');
        // Fallback to predefined workflows only
        try {
          const workflows = await getPredefinedWorkflowsAsDocuments();
          // Always return an array, never null or undefined
          res.json(Array.isArray(workflows) ? workflows : []);
        } catch (fallbackError) {
          logger.error({ error: fallbackError }, 'Error loading predefined workflows');
          // Last resort: return empty array instead of error to prevent frontend from breaking
          res.json([]);
        }
      }
    });
  }
}

