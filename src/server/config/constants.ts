/**
 * Server-side constants
 * 
 * Constants specific to server-side operations.
 * These should not be used in client code.
 */

import { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS, RETRY } from '../../shared/constants.js';

/**
 * Re-export shared constants for convenience
 */
export { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS, RETRY };

/**
 * Database Configuration
 * Database-related constants
 */
export const DATABASE = {
  CONNECTION_TIMEOUT: 30000,      // 30 seconds
  QUERY_TIMEOUT: 60000,           // 1 minute
  MAX_POOL_SIZE: 10,
  MIN_POOL_SIZE: 2,
} as const;

/**
 * API Configuration
 * API-related constants
 */
export const API = {
  MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_JSON_DEPTH: 20,
  RATE_LIMIT_WINDOW: 15 * 60 * 1000,  // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

/**
 * File Upload Configuration
 * File upload related constants
 */
export const FILE_UPLOAD = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,    // 50MB
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/html',
  ],
  MAX_FILES_PER_REQUEST: 10,
} as const;

/**
 * Job Queue Configuration
 * Background job queue constants
 */
export const JOB_QUEUE = {
  DEFAULT_PRIORITY: 5,
  HIGH_PRIORITY: 10,
  LOW_PRIORITY: 1,
  URGENT_PRIORITY: 20,
  MAX_ATTEMPTS: 3,
  ATTEMPT_DELAY: 5000, // 5 seconds
  // Default concurrency settings (can be overridden via environment variables)
  DEFAULT_SCAN_CONCURRENCY: parseInt(process.env.QUEUE_SCAN_CONCURRENCY || '2', 10),
  DEFAULT_EMBEDDING_CONCURRENCY: parseInt(process.env.QUEUE_EMBEDDING_CONCURRENCY || '3', 10),
  DEFAULT_PROCESSING_CONCURRENCY: parseInt(process.env.QUEUE_PROCESSING_CONCURRENCY || '5', 10),
  DEFAULT_EXPORT_CONCURRENCY: parseInt(process.env.QUEUE_EXPORT_CONCURRENCY || '2', 10),
  DEFAULT_WORKFLOW_CONCURRENCY: parseInt(process.env.QUEUE_WORKFLOW_CONCURRENCY || '1', 10),
  // Maximum queue size (waiting + active jobs) before rejecting new jobs
  // Configurable via environment variable, default: 1000
  MAX_WORKFLOW_QUEUE_SIZE: parseInt(process.env.MAX_WORKFLOW_QUEUE_SIZE || '1000', 10),
} as const;

/**
 * Scraping Configuration
 * Web scraping related constants
 */
export const SCRAPING = {
  DEFAULT_TIMEOUT: 30000,        // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,              // 2 seconds
  MAX_CONCURRENT_REQUESTS: 5,
  POLITENESS_DELAY: 1000,         // 1 second between requests
} as const;

/**
 * Cache Configuration
 * Caching related constants
 */
export const CACHE = {
  DEFAULT_TTL: 3600,              // 1 hour
  SHORT_TTL: 300,                  // 5 minutes
  LONG_TTL: 86400,                 // 24 hours
  MAX_SIZE: 1000,
} as const;

/**
 * Logging Configuration
 * Logging related constants
 */
export const LOGGING = {
  MAX_LOG_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_LOG_FILES: 5,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as const;

/**
 * Security Configuration
 * Security related constants
 */
export const SECURITY = {
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_MIN_LENGTH: 8,
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000,      // 15 minutes
} as const;

/**
 * Common Crawl Configuration
 * Common Crawl API related constants
 */
export const COMMON_CRAWL = {
  DEFAULT_CRAWL_ID: 'CC-MAIN-2025-47',
  KNOWN_GOOD_CRAWLS: [
    'CC-MAIN-2025-47',
    'CC-MAIN-2025-43',
    'CC-MAIN-2025-38',
    'CC-MAIN-2025-33',
    'CC-MAIN-2025-30',
    'CC-MAIN-2025-26',
    'CC-MAIN-2025-21',
    'CC-MAIN-2025-18',
    'CC-MAIN-2024-51',
    'CC-MAIN-2024-46',
    'CC-MAIN-2024-42',
    'CC-MAIN-2024-38',
  ],
  API_TIMEOUT: 60000, // 1 minute
} as const;

/**
 * Knowledge Graph Limits
 * Limits for knowledge graph operations
 */
export const LIMITS = {
  GRAPH_SNAPSHOT_DEFAULT: 1000, // Default number of nodes/edges for graph snapshots
  GRAPH_SNAPSHOT_MAX: 10000,    // Maximum number of nodes/edges for graph snapshots
} as const;
