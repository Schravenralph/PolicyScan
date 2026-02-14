/**
 * Shared Validation Utilities for Admin Routes
 * 
 * Common validation functions used across admin route handlers.
 */

import { validateObjectIdOrThrow } from '../../../utils/errorHandlingHelpers.js';
import { BadRequestError } from '../../../types/errors.js';

/**
 * Validate and parse ObjectId from request parameter
 * 
 * @param id - ID string from request params
 * @param fieldName - Name of the field for error messages
 * @returns ObjectId instance
 * @throws BadRequestError if ID is invalid
 */
export function validateObjectId(id: string, fieldName: string = 'ID'): string {
    validateObjectIdOrThrow(id, fieldName);
    return id;
}

/**
 * Validate role value
 * 
 * @param role - Role string to validate
 * @returns Validated role
 * @throws BadRequestError if role is invalid
 */
export function validateRole(role: unknown): 'developer' | 'advisor' | 'admin' {
    if (!role || !['developer', 'advisor', 'admin'].includes(role as string)) {
        throw new BadRequestError('Invalid role. Must be one of: developer, advisor, admin');
    }
    return role as 'developer' | 'advisor' | 'admin';
}

/**
 * Validate boolean value
 * 
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validated boolean
 * @throws BadRequestError if value is not a boolean
 */
export function validateBoolean(value: unknown, fieldName: string = 'value'): boolean {
    if (typeof value !== 'boolean') {
        throw new BadRequestError(`${fieldName} must be a boolean`);
    }
    return value;
}

/**
 * Validate string value with minimum length
 * 
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @param minLength - Minimum length required
 * @returns Validated string
 * @throws BadRequestError if value is invalid
 */
export function validateString(value: unknown, fieldName: string = 'value', minLength: number = 1): string {
    if (typeof value !== 'string' || value.length < minLength) {
        throw new BadRequestError(`${fieldName} must be a string with at least ${minLength} characters`);
    }
    return value;
}

/**
 * Validate array value
 * 
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validated array
 * @throws BadRequestError if value is not an array
 */
export function validateArray<T>(value: unknown, fieldName: string = 'value'): T[] {
    if (!Array.isArray(value)) {
        throw new BadRequestError(`${fieldName} must be an array`);
    }
    return value as T[];
}



