import { Request, Response, NextFunction } from 'express';
import csrf from 'csrf';
import { logger } from '../utils/logger.js';

/**
 * CSRF token generator instance
 */
export const tokens = new csrf();

/**
 * Middleware to verify CSRF token for mutation requests
 * Only applies to POST, PATCH, PUT, DELETE methods
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip CSRF for health check and metrics endpoints
    if (req.path === '/health' || req.path === '/metrics' || req.path.startsWith('/api/health')) {
        return next();
    }

    // Get secret from signed cookie
    // The secret is stored in a signed cookie to prevent tampering
    // We use a different secret per session/request to prevent global secret vulnerability
    const secret = req.signedCookies ? req.signedCookies['_csrf'] : undefined;

    if (!secret) {
        logger.warn({
            path: req.path,
            method: req.method,
            ip: req.ip
        }, 'CSRF secret cookie missing');
        return res.status(403).json({
            error: 'CSRF validation failed',
            message: 'Session invalid or expired. Please refresh the page.'
        });
    }

    // Get token from header (X-CSRF-Token) or body (csrfToken)
    const token = req.headers['x-csrf-token'] as string || 
                  (req.body && req.body.csrfToken) as string;

    if (!token) {
        logger.warn({ 
            path: req.path, 
            method: req.method,
            ip: req.ip 
        }, 'CSRF token missing');
        return res.status(403).json({ 
            error: 'CSRF token missing',
            message: 'CSRF token is required for this request. Please fetch a token from /api/csrf-token'
        });
    }

    // Verify token against the secret from the cookie
    if (!tokens.verify(secret, token)) {
        logger.warn({ 
            path: req.path, 
            method: req.method,
            ip: req.ip 
        }, 'CSRF token verification failed');
        return res.status(403).json({ 
            error: 'CSRF token verification failed',
            message: 'Invalid or expired CSRF token. Please fetch a new token from /api/csrf-token'
        });
    }

    // Token is valid, proceed
    next();
}

/**
 * Generate a CSRF token and set the secret in a signed cookie
 * Reuses existing secret if available to support multiple tabs
 * @param req Express Request object
 * @param res Express Response object
 */
export function generateCsrfToken(req: Request, res: Response): string {
    // Check for existing secret in signed cookies
    let secret = req.signedCookies ? req.signedCookies['_csrf'] : undefined;

    // Generate new secret if none exists
    if (!secret) {
        secret = tokens.secretSync();

        // Set the secret in a signed cookie
        // This binds the token to the user's browser session
        res.cookie('_csrf', secret, {
            httpOnly: true,
            signed: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
        });
    }

    return tokens.create(secret);
}

/**
 * Verify a CSRF token
 * @param secret The secret from the cookie
 * @param token The token to verify
 */
export function verifyCsrfToken(secret: string, token: string): boolean {
    return tokens.verify(secret, token);
}
