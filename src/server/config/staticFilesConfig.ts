/**
 * Static Files Configuration
 * 
 * Handles static file serving for public directory and test-results.
 * Extracted from index.ts for better organization.
 */

import type { Express } from 'express';
import express from 'express';
import { join } from 'path';

/**
 * Setup static file serving
 */
export function setupStaticFiles(app: Express): void {
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
}

