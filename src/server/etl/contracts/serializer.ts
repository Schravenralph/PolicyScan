/**
 * ETL Contract Serializer/Deserializer
 * 
 * Serializes and deserializes ETL job requests and results with validation.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
 */

import {
  etlJobRequestSchema,
  etlJobResultSchema,
  etlManifestSchema,
  type ETLJobRequestValidated,
  type ETLJobResultValidated,
  type ETLManifestValidated,
} from './schemas.js';
import type { ETLJobRequest, ETLJobResult, ETLManifest } from './types.js';
import { ZodError } from 'zod';

/**
 * Validation error with detailed information
 */
export class ETLContractValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ZodError['issues'],
    public readonly schemaVersion?: string
  ) {
    super(message);
    this.name = 'ETLContractValidationError';
  }
}

/**
 * Serialize ETL job request to JSON string
 * 
 * @param request - ETL job request
 * @returns JSON string
 * @throws {ETLContractValidationError} if validation fails
 */
export function serializeETLJobRequest(request: ETLJobRequest): string {
  try {
    const validated = etlJobRequestSchema.parse(request);
    return JSON.stringify(validated, null, 2);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ETLContractValidationError(
        `ETL job request validation failed: ${error.message}`,
        error.issues,
        request.schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Deserialize and validate ETL job request from JSON string
 * 
 * @param json - JSON string
 * @returns Validated ETL job request
 * @throws {ETLContractValidationError} if validation fails
 */
export function deserializeETLJobRequest(json: string): ETLJobRequestValidated {
  try {
    const parsed = JSON.parse(json);
    return etlJobRequestSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ETLContractValidationError(
        `Invalid JSON: ${error.message}`,
        [],
        undefined
      );
    }
    if (error instanceof ZodError) {
      // Try to extract schemaVersion from parsed JSON for better error messages
      let schemaVersion: string | undefined;
      try {
        const parsed = JSON.parse(json);
        schemaVersion = parsed.schemaVersion;
      } catch {
        // Ignore
      }
      throw new ETLContractValidationError(
        `ETL job request validation failed: ${error.message}`,
        error.issues,
        schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Serialize ETL job result to JSON string
 * 
 * @param result - ETL job result
 * @returns JSON string
 * @throws {ETLContractValidationError} if validation fails
 */
export function serializeETLJobResult(result: ETLJobResult): string {
  try {
    const validated = etlJobResultSchema.parse(result);
    return JSON.stringify(validated, null, 2);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ETLContractValidationError(
        `ETL job result validation failed: ${error.message}`,
        error.issues,
        result.schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Deserialize and validate ETL job result from JSON string
 * 
 * @param json - JSON string
 * @returns Validated ETL job result
 * @throws {ETLContractValidationError} if validation fails
 */
export function deserializeETLJobResult(json: string): ETLJobResultValidated {
  try {
    const parsed = JSON.parse(json);
    return etlJobResultSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ETLContractValidationError(
        `Invalid JSON: ${error.message}`,
        [],
        undefined
      );
    }
    if (error instanceof ZodError) {
      // Try to extract schemaVersion from parsed JSON for better error messages
      let schemaVersion: string | undefined;
      try {
        const parsed = JSON.parse(json);
        schemaVersion = parsed.schemaVersion;
      } catch {
        // Ignore
      }
      throw new ETLContractValidationError(
        `ETL job result validation failed: ${error.message}`,
        error.issues,
        schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Serialize ETL manifest to JSON string
 * 
 * @param manifest - ETL manifest
 * @returns JSON string
 * @throws {ETLContractValidationError} if validation fails
 */
export function serializeETLManifest(manifest: ETLManifest): string {
  try {
    const validated = etlManifestSchema.parse(manifest);
    return JSON.stringify(validated, null, 2);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ETLContractValidationError(
        `ETL manifest validation failed: ${error.message}`,
        error.issues,
        manifest.schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Deserialize and validate ETL manifest from JSON string
 * 
 * @param json - JSON string
 * @returns Validated ETL manifest
 * @throws {ETLContractValidationError} if validation fails
 */
export function deserializeETLManifest(json: string): ETLManifestValidated {
  try {
    const parsed = JSON.parse(json);
    return etlManifestSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ETLContractValidationError(
        `Invalid JSON: ${error.message}`,
        [],
        undefined
      );
    }
    if (error instanceof ZodError) {
      // Try to extract schemaVersion from parsed JSON for better error messages
      let schemaVersion: string | undefined;
      try {
        const parsed = JSON.parse(json);
        schemaVersion = parsed.schemaVersion;
      } catch {
        // Ignore
      }
      throw new ETLContractValidationError(
        `ETL manifest validation failed: ${error.message}`,
        error.issues,
        schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Validate ETL job request without deserializing
 * 
 * @param request - ETL job request object
 * @returns Validated request
 * @throws {ETLContractValidationError} if validation fails
 */
export function validateETLJobRequest(request: unknown): ETLJobRequestValidated {
  try {
    return etlJobRequestSchema.parse(request);
  } catch (error) {
    if (error instanceof ZodError) {
      const schemaVersion =
        typeof request === 'object' && request !== null && 'schemaVersion' in request
          ? String(request.schemaVersion)
          : undefined;
      throw new ETLContractValidationError(
        `ETL job request validation failed: ${error.message}`,
        error.issues,
        schemaVersion
      );
    }
    throw error;
  }
}

/**
 * Validate ETL job result without deserializing
 * 
 * @param result - ETL job result object
 * @returns Validated result
 * @throws {ETLContractValidationError} if validation fails
 */
export function validateETLJobResult(result: unknown): ETLJobResultValidated {
  try {
    return etlJobResultSchema.parse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      const schemaVersion =
        typeof result === 'object' && result !== null && 'schemaVersion' in result
          ? String(result.schemaVersion)
          : undefined;
      throw new ETLContractValidationError(
        `ETL job result validation failed: ${error.message}`,
        error.issues,
        schemaVersion
      );
    }
    throw error;
  }
}

