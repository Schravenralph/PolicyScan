import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';

/**
 * Security headers middleware
 * Sets HTTP security headers to protect against common vulnerabilities
 * 
 * Headers set:
 * - X-Content-Type-Options: nosniff - Prevents MIME type sniffing
 * - X-Frame-Options: DENY - Prevents clickjacking attacks
 * - X-XSS-Protection: 1; mode=block - Enables XSS filter (legacy, but still useful)
 * - Referrer-Policy: strict-origin-when-cross-origin - Controls referrer information
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains - Forces HTTPS (production only)
 * - Content-Security-Policy: Basic CSP to prevent XSS (can be customized per route)
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const env = getEnv();

  // X-Content-Type-Options: Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options: Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection: Enable XSS filter (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy: Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Strict-Transport-Security: Force HTTPS (production only)
  if (env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Content-Security-Policy: Basic CSP to prevent XSS
  // Default policy - can be customized per route if needed
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for React/Vite
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind
    "img-src 'self' data: https:", // Allow images from self, data URIs, and HTTPS
    "font-src 'self' data:", // Allow fonts from self and data URIs
    "connect-src 'self' ws: wss:", // Allow WebSocket connections
    "frame-ancestors 'none'", // Prevent framing (redundant with X-Frame-Options but more specific)
  ];

  // In development, allow more permissive CSP for hot module reloading
  if (env.NODE_ENV === 'development') {
    cspDirectives.push("connect-src 'self' ws: wss: http://localhost:* https://localhost:*");
  }

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
}

