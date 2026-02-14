/**
 * API Key Authentication Middleware
 * 
 * Provides API key-based authentication for external services.
 * API keys are stored in the database with expiration support (365 days).
 * 
 * Usage:
 * - Generate API keys using the generate-api-key script
 * - Clients send API key in X-API-Key header or Authorization header as Bearer token
 * 
 * Backward compatibility:
 * - Still supports BELEIDSSCAN_API_KEY environment variable for legacy keys
 * - Database keys take precedence over environment variable
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ApiKey } from '../models/ApiKey.js';

/**
 * Middleware to authenticate requests using API key
 * 
 * Accepts API key from:
 * - X-API-Key header
 * - Authorization header as Bearer token
 * 
 * Validates against database API keys (with expiration check) or legacy BELEIDSSCAN_API_KEY env var
 */
export function apiKeyAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get API key from headers (Express normalizes headers to lowercase)
    // Check both lowercase and original case for compatibility
    const providedKey = 
      (req.headers['x-api-key'] as string) ||
      (req.headers['X-API-Key'] as string) ||
      (req.headers.authorization?.startsWith('Bearer ') 
        ? req.headers.authorization.substring(7).trim() 
        : null);

    if (!providedKey) {
      logger.warn({ 
        path: req.path, 
        headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('api') || h.toLowerCase() === 'authorization')
      }, 'API key authentication required but no key provided');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'The Beleidsscan API requires an API key. Please provide an API key in the X-API-Key header or Authorization header as Bearer token.',
      });
    }

    // First, try to validate against database (new system with expiration)
    try {
      const keyDoc = await ApiKey.validate(providedKey);
      if (keyDoc) {
        // Valid database key
        logger.debug({ path: req.path, keyName: keyDoc.name }, 'API key authentication successful (database)');
        return next();
      } else {
        logger.debug({ path: req.path }, 'API key not found in database or expired, checking legacy env var');
      }
    } catch (error) {
      // Log error but continue to check legacy env var
      logger.warn({ error, path: req.path }, 'Error validating API key from database');
    }

    // Fallback to legacy environment variable (for backward compatibility)
    const legacyApiKey = process.env.BELEIDSSCAN_API_KEY;
    if (legacyApiKey && providedKey === legacyApiKey) {
      logger.debug({ path: req.path }, 'API key authentication successful (legacy env var)');
      return next();
    }

    // If no legacy key is configured, allow access (for development)
    if (!legacyApiKey) {
      logger.warn('No API keys configured - API key authentication disabled');
      return next();
    }

    // Key validation failed
    logger.warn({ path: req.path }, 'Invalid or expired API key provided');
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired token',
    });
  };
}

/**
 * Optional API key authentication - allows access if key is valid, but doesn't fail if missing
 * Useful for endpoints that support both authenticated and unauthenticated access
 */
export function optionalApiKeyAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // Get API key from headers
    const providedKey = 
      req.headers['x-api-key'] as string ||
      (req.headers.authorization?.startsWith('Bearer ') 
        ? req.headers.authorization.substring(7) 
        : null);

    // If key is provided, validate it
    if (providedKey) {
      try {
        // Try database first
        const keyDoc = await ApiKey.validate(providedKey);
        if (keyDoc) {
          logger.debug({ path: req.path, keyName: keyDoc.name }, 'API key authentication successful (optional auth, database)');
          return next();
        }
      } catch (error) {
        logger.warn({ error, path: req.path }, 'Error validating API key from database (optional auth)');
      }

      // Fallback to legacy env var
      const legacyApiKey = process.env.BELEIDSSCAN_API_KEY;
      if (legacyApiKey && providedKey === legacyApiKey) {
        logger.debug({ path: req.path }, 'API key authentication successful (optional auth, legacy)');
        return next();
      }

      // Invalid key, but don't fail - this is optional auth
      logger.warn({ path: req.path }, 'Invalid API key provided (optional auth)');
    }

    // No key provided or invalid key, but allow access (optional auth)
    next();
  };
}
