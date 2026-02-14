/**
 * Client-side constants
 * 
 * Constants specific to client-side operations.
 * These should not be used in server code.
 */

import { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS } from '../../shared/constants';

/**
 * Re-export shared constants for convenience
 */
export { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS };

/**
 * UI Configuration
 * User interface related constants
 */
export const UI = {
  DEBOUNCE_DELAY: 300,           // 300ms for search inputs
  TOAST_DURATION: 5000,          // 5 seconds
  ANIMATION_DURATION: 200,       // 200ms
  MODAL_ANIMATION_DURATION: 300, // 300ms
} as const;

/**
 * Polling Configuration
 * Polling intervals for real-time updates
 */
export const POLLING = {
  SHORT_INTERVAL: 1000,          // 1 second
  MEDIUM_INTERVAL: 5000,         // 5 seconds
  LONG_INTERVAL: 30000,          // 30 seconds
  VERY_LONG_INTERVAL: 60000,     // 1 minute
} as const;

/**
 * Form Validation
 * Form validation related constants
 */
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 50,
  MAX_EMAIL_LENGTH: 255,
  MAX_URL_LENGTH: 2048,
} as const;

/**
 * Local Storage Keys
 * Keys used for localStorage
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PREFERENCES: 'user_preferences',
  THEME: 'theme',
  LANGUAGE: 'language',
} as const;

/**
 * API Endpoints
 * Client-side API endpoint paths
 */
export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  QUERIES: '/api/queries',
  SCAN: '/api/scan',
  WORKFLOWS: '/api/workflows',
  CANONICAL_DOCUMENTS: '/api/canonical-documents', // Canonical document endpoint
  WEBSITES: '/api/bronwebsites',
} as const;

/**
 * Error Messages
 * User-facing error messages
 */
export const USER_ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'A server error occurred. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
} as const;

/**
 * Workflow Configuration
 * Workflow-related constants and configuration
 */
export const WORKFLOWS = {
  /**
   * Workflow IDs that require the 'onderwerp' (subject) parameter
   * These workflows will fail validation if onderwerp is missing or empty
   */
  REQUIRING_ONDERWERP: [
    'standard-scan',
    'bfs-3-hop',
    'beleidsscan-graph',
    'beleidsscan-wizard',
    'external-links-exploration',
    'horst-aan-de-maas',
    'horst-labor-migration',
  ] as const,
  
  /**
   * Workflow ID prefix for beleidsscan step workflows
   * All workflows starting with this prefix also require onderwerp
   */
  BELEIDSSCAN_STEP_PREFIX: 'beleidsscan-step-',
} as const;

