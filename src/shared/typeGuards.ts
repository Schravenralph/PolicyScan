/**
 * Type Guard Utilities
 *
 * This module provides type guard functions to replace type assertions (`as` keyword)
 * with runtime-validated type guards. Type guards improve type safety by validating
 * types at runtime, catching potential errors that type assertions would miss.
 *
 * Usage:
 * ```typescript
 * // Instead of: const value = obj as MyType;
 * if (isMyType(obj)) {
 *   // obj is now typed as MyType
 *   const value = obj;
 * }
 * ```
 */

/**
 * Type guard for checking if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard for checking if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for checking if a value is an array
 */
export function isArray<T>(
  value: unknown,
  itemGuard?: (item: unknown) => item is T
): value is T[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (itemGuard) {
    return value.every(itemGuard);
  }
  return true;
}

/**
 * Type guard for checking if a value has a specific property
 */
export function hasProperty(
  value: unknown,
  property: string | number | symbol
): value is Record<string | number | symbol, unknown> {
  return isObject(value) && property in value;
}

/**
 * Type guard for checking if a value has multiple properties
 */
export function hasProperties(
  value: unknown,
  ...properties: (string | number | symbol)[]
): value is Record<string | number | symbol, unknown> {
  if (!isObject(value)) {
    return false;
  }
  return properties.every(prop => prop in value);
}

export interface ApiKeysMissingError {
  code: 'API_KEYS_MISSING';
  message: string;
}

export function isApiKeysMissingError(value: unknown): value is ApiKeysMissingError {
  return (
    isObject(value) &&
    hasProperty(value, 'code') &&
    value.code === 'API_KEYS_MISSING' &&
    hasProperty(value, 'message') &&
    isString(value.message)
  );
}

/**
 * Type guard for Express query parameters
 * Validates that a query parameter is a string
 */
export function isQueryString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/**
 * Type guard for Express query parameters that can be parsed as a number
 */
export function isQueryNumber(value: unknown): value is string {
  if (!isString(value) || value === '') {
    return false;
  }
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

/**
 * Type guard for checking if a value is a specific string literal
 */
export function isStringLiteral<T extends string>(
  value: unknown,
  ...literals: T[]
): value is T {
  return isString(value) && literals.includes(value as T);
}

/**
 * Type guard for checking if a value is a Date or can be parsed as a Date
 */
export function isDate(value: unknown): value is Date | string {
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }
  if (isString(value)) {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  return false;
}

/**
 * Type guard for checking if a value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Type guard for checking if a value is not null or undefined
 */
export function isNotNullOrUndefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value is a valid URL string
 */
export function isUrl(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard for checking if a value is a valid email string
 */
export function isEmail(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Type guard for checking if a value is a valid MongoDB ObjectId string
 */
export function isObjectId(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  // MongoDB ObjectId is 24 hex characters
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Type guard for checking if a value is a valid integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Type guard for checking if a value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard for checking if a value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}
