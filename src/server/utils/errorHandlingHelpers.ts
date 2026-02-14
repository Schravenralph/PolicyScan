/**
 * Error Handling Helper Utilities
 * 
 * Provides common patterns and utilities for standardized error handling.
 * These helpers make it easier to migrate from manual error responses to
 * standardized error handling patterns.
 * 
 * @see docs/04-policies/error-handling-standard.md
 * @see docs/04-policies/error-handling-migration-guide.md
 */

import { ObjectId } from 'mongodb';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
  AppError,
} from '../types/errors.js';

/**
 * Validate MongoDB ObjectId and throw BadRequestError if invalid
 * 
 * @param id - The ID to validate
 * @param fieldName - Name of the field being validated (for error message)
 * @throws BadRequestError if ID is invalid
 * @returns The validated ID (same as input, for chaining)
 * 
 * @example
 * ```typescript
 * router.get('/resource/:id', asyncHandler(async (req, res) => {
 *   const id = validateObjectIdOrThrow(req.params.id, 'Resource ID');
 *   const resource = await Resource.findById(id);
 *   // ...
 * }));
 * ```
 */
export function validateObjectIdOrThrow(id: string, fieldName: string = 'ID'): string {
  if (!ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${fieldName} format`, { id, fieldName });
  }
  return id;
}

/**
 * Ensure resource exists or throw NotFoundError
 * 
 * @param resource - The resource to check
 * @param resourceName - Name of the resource type (e.g., 'User', 'Document')
 * @param identifier - Optional identifier for error message
 * @throws NotFoundError if resource is null/undefined
 * @returns The resource (non-null assertion)
 * 
 * @example
 * ```typescript
 * router.get('/resource/:id', asyncHandler(async (req, res) => {
 *   const resource = await Resource.findById(req.params.id);
 *   ensureExistsOrThrow(resource, 'Resource', req.params.id);
 *   res.json(resource);
 * }));
 * ```
 */
export function ensureExistsOrThrow<T>(
  resource: T | null | undefined,
  resourceName: string,
  identifier?: string
): T {
  if (!resource) {
    throw new NotFoundError(resourceName, identifier);
  }
  return resource;
}

/**
 * Validate input and throw BadRequestError if invalid
 * 
 * @param isValid - Validation result
 * @param message - Error message if validation fails
 * @param context - Additional context for error
 * @throws BadRequestError if validation fails
 * 
 * @example
 * ```typescript
 * router.post('/resource', asyncHandler(async (req, res) => {
 *   validateOrThrow(
 *     isValidEmail(req.body.email),
 *     'Invalid email format',
 *     { email: req.body.email }
 *   );
 *   // ...
 * }));
 * ```
 */
export function validateOrThrow(
  isValid: boolean,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!isValid) {
    throw new BadRequestError(message, context);
  }
}

/**
 * Ensure resource doesn't exist or throw ConflictError
 * 
 * @param exists - Whether resource exists
 * @param message - Error message if resource exists
 * @param context - Additional context for error
 * @throws ConflictError if resource exists
 * 
 * @example
 * ```typescript
 * router.post('/resource', asyncHandler(async (req, res) => {
 *   const exists = await Resource.exists({ email: req.body.email });
 *   ensureNotExistsOrThrow(exists, 'Resource with this email already exists', {
 *     email: req.body.email
 *   });
 *   // ...
 * }));
 * ```
 */
export function ensureNotExistsOrThrow(
  exists: boolean,
  message: string,
  context?: Record<string, unknown>
): void {
  if (exists) {
    throw new ConflictError(message, context);
  }
}

/**
 * Validate required fields and throw BadRequestError if missing
 * 
 * @param data - Object to validate
 * @param requiredFields - Array of required field names
 * @throws BadRequestError if any required field is missing
 * 
 * @example
 * ```typescript
 * router.post('/resource', asyncHandler(async (req, res) => {
 *   validateRequiredFields(req.body, ['name', 'email']);
 *   // ...
 * }));
 * ```
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new BadRequestError(
      `Missing required fields: ${missing.join(', ')}`,
      { missingFields: missing }
    );
  }
}

/**
 * Validate field types and throw BadRequestError if invalid
 * 
 * @param data - Object to validate
 * @param fieldTypes - Map of field names to expected types
 * @throws BadRequestError if any field has wrong type
 * 
 * @example
 * ```typescript
 * router.post('/resource', asyncHandler(async (req, res) => {
 *   validateFieldTypes(req.body, {
 *     name: 'string',
 *     age: 'number',
 *     active: 'boolean'
 *   });
 *   // ...
 * }));
 * ```
 */
export function validateFieldTypes(
  data: Record<string, unknown>,
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>
): void {
  const errors: string[] = [];
  
  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    const value = data[field];
    if (value === undefined) {
      continue; // Optional fields
    }
    
    let actualType: string;
    if (Array.isArray(value)) {
      actualType = 'array';
    } else if (value === null) {
      actualType = 'null';
    } else {
      actualType = typeof value;
    }
    
    if (actualType !== expectedType) {
      errors.push(`${field} must be ${expectedType}, got ${actualType}`);
    }
  }
  
  if (errors.length > 0) {
    throw new BadRequestError('Invalid field types', {
      validationErrors: errors
    });
  }
}

/**
 * Wrap service call with error handling and context
 * 
 * @param operation - The operation to execute
 * @param errorMessage - Default error message if operation fails
 * @param context - Additional context for error logging
 * @returns Result of operation
 * @throws AppError if operation fails
 * 
 * @example
 * ```typescript
 * router.get('/resource/:id', asyncHandler(async (req, res) => {
 *   const resource = await withErrorContext(
 *     () => ResourceService.getById(req.params.id),
 *     'Failed to retrieve resource',
 *     { resourceId: req.params.id, userId: req.user?.id }
 *   );
 *   res.json(resource);
 * }));
 * ```
 */
export async function withErrorContext<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) {
      // Context is read-only, so we can't modify it
      // The error already has its context, just re-throw
      throw error;
    }
    
    // Wrap unknown errors
    throw new AppError(
      errorMessage,
      'INTERNAL_SERVER_ERROR',
      500,
      false,
      {
        ...context,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

/**
 * Check if service is available or throw ServiceUnavailableError
 * 
 * @param isAvailable - Whether service is available
 * @param serviceName - Name of the service
 * @param reason - Optional reason for unavailability
 * @throws ServiceUnavailableError if service is not available
 * 
 * @example
 * ```typescript
 * router.post('/action', asyncHandler(async (req, res) => {
 *   ensureServiceAvailable(
 *     externalService.isConfigured(),
 *     'ExternalService',
 *     'Missing API key'
 *   );
 *   // ...
 * }));
 * ```
 */
export function ensureServiceAvailable(
  isAvailable: boolean,
  serviceName: string,
  reason?: string
): void {
  if (!isAvailable) {
    throw new ServiceUnavailableError(
      `${serviceName} is not available${reason ? `: ${reason}` : ''}`,
      { service: serviceName, reason }
    );
  }
}

/**
 * Validate pagination parameters
 * 
 * @param limit - Limit parameter
 * @param skip - Skip parameter
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @throws BadRequestError if parameters are invalid
 * @returns Validated limit and skip values
 * 
 * @example
 * ```typescript
 * router.get('/resources', asyncHandler(async (req, res) => {
 *   const { limit, skip } = validatePagination(
 *     req.query.limit,
 *     req.query.skip,
 *     50
 *   );
 *   // ...
 * }));
 * ```
 */
export function validatePagination(
  limit: unknown,
  skip: unknown,
  maxLimit: number = 100
): { limit: number; skip: number } {
  let parsedLimit = 10; // Default
  let parsedSkip = 0; // Default
  
  if (limit !== undefined) {
    if (typeof limit === 'string') {
      parsedLimit = parseInt(limit, 10);
    } else if (typeof limit === 'number') {
      parsedLimit = limit;
    } else {
      throw new BadRequestError('Invalid limit parameter: must be a number');
    }
    
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestError('Invalid limit parameter: must be a positive integer');
    }
    
    if (parsedLimit > maxLimit) {
      throw new BadRequestError(`Limit cannot exceed ${maxLimit}`);
    }
  }
  
  if (skip !== undefined) {
    if (typeof skip === 'string') {
      parsedSkip = parseInt(skip, 10);
    } else if (typeof skip === 'number') {
      parsedSkip = skip;
    } else {
      throw new BadRequestError('Invalid skip parameter: must be a number');
    }
    
    if (isNaN(parsedSkip) || parsedSkip < 0) {
      throw new BadRequestError('Invalid skip parameter: must be a non-negative integer');
    }
  }
  
  return { limit: parsedLimit, skip: parsedSkip };
}

