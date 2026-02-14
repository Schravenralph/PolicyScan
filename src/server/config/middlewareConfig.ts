/**
 * Middleware Configuration
 * 
 * Configures all Express middleware for the application.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { tracingMiddleware } from '../middleware/tracing.js';
import { metricsMiddleware } from '../middleware/metrics.js';
import { securityHeadersMiddleware } from '../middleware/securityHeaders.js';
import { getCorsOptions } from './corsConfig.js';

/**
 * Setup all application middleware
 */
export function setupMiddleware(app: Express): void {
  // Middleware order is critical - must be in this order:
  
  // 1. Request ID and logging context - must be first
  app.use(requestIdMiddleware);

  // 1.5 Cookie parsing - needed early for CSRF and session handling
  // Use CSRF_COOKIE_SECRET, or fallback to JWT_SECRET, or a default for dev
  const cookieSecret = process.env.CSRF_COOKIE_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-in-prod';

  if (process.env.NODE_ENV === 'production' && cookieSecret === 'fallback-secret-change-in-prod') {
      throw new Error('SECURITY: CSRF_COOKIE_SECRET or JWT_SECRET environment variable is required in production.');
  }

  app.use(cookieParser(cookieSecret));
  
  // 2. Distributed tracing - after request ID
  app.use(tracingMiddleware);
  
  // 3. Metrics collection - after tracing
  app.use(metricsMiddleware);
  
  // 4. CORS - before other middleware that might set headers
  const corsOptions = getCorsOptions();
  app.use(cors(corsOptions));
  
  // 5. Security headers - set early to protect all responses
  app.use(securityHeadersMiddleware);
  
  // 6. Response compression - reduce payload sizes by 60-80%
  // Configure compression with sensible defaults:
  // - threshold: Only compress responses > 1KB (small responses don't benefit)
  // - level: Compression level 6 (good balance between speed and compression)
  // - filter: Compress all text-based content types
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Compression level (1-9, 6 is good balance)
    filter: (req, res) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression for all text-based content types
      return compression.filter(req, res);
    },
  }));
  
  // 7. JSON body parsing - limit payload size to prevent DoS
  app.use(express.json({ limit: '10mb' }));
}
