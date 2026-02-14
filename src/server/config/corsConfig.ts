/**
 * CORS Configuration
 * 
 * Configures CORS (Cross-Origin Resource Sharing) for the Express application.
 * Extracted from index.ts for better organization.
 */
import { logger } from '../utils/logger.js';
import { getEnv } from './env.js';

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  // Allow requests with no origin (like mobile apps, Postman, etc.)
  if (!origin) {
    return true;
  }

  // Check if origin is in allowed list
  return allowedOrigins.includes(origin);
}

/**
 * Get CORS configuration options
 */
export function getCorsOptions() {
  const env = getEnv();
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8888',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8888',
  ];
  
  const allowedOrigins = (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.trim())
    ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
    : defaultOrigins;
  
  // Log allowed origins on startup for debugging
  logger.info({ allowedOrigins, fromEnv: !!env.ALLOWED_ORIGINS }, 'CORS: Configured allowed origins');
  
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }

      // Log rejected origins for debugging (only in development to avoid log spam)
      if (env.NODE_ENV === 'development') {
        logger.warn({ 
          origin, 
          allowedOrigins,
          originMatches: allowedOrigins.map(ao => ({ allowed: ao, matches: ao === origin }))
        }, 'CORS: Origin not allowed');
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  };
}
