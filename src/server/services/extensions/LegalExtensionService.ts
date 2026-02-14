/**
 * LegalExtensionService - Typed service for Legal extensions
 * 
 * Handles legal metadata including ECLI, citations, and references.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

import { ExtensionService } from './ExtensionService.js';
import type { ServiceContext } from '../../contracts/types.js';
import {
  validateLegalExtensionPayload,
  legalExtensionPayloadV1Schema,
} from '../../validation/canonicalSchemas.js';
import { ValidationError } from '../../validation/canonicalSchemas.js';
import type { ExtensionDocument } from '../../models/ExtensionModel.js';
import type { z } from 'zod';

/**
 * LegalExtension payload type (v1)
 */
export type LegalExtensionPayload = z.infer<typeof legalExtensionPayloadV1Schema>;

/**
 * LegalExtensionService - Typed service for Legal extensions
 */
export class LegalExtensionService extends ExtensionService<LegalExtensionPayload> {
  constructor() {
    super('legal', 'v1');
  }

  /**
   * Upsert LegalExtension with payload validation
   * 
   * @param documentId - Document ID
   * @param payload - LegalExtension payload
   * @param ctx - Service context (may include session for transactions)
   * @returns Extension document
   * @throws {ValidationError} If payload validation fails or version is unsupported
   */
  async upsert(
    documentId: string,
    payload: LegalExtensionPayload,
    ctx?: ServiceContext
  ): Promise<ExtensionDocument> {
    // Validate payload version
    const version = (payload as { version?: string }).version || this.defaultVersion;
    
    // Validate payload structure
    try {
      validateLegalExtensionPayload(payload, version);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `LegalExtension payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'payload'
      );
    }

    // Call base upsert
    return await super.upsert(documentId, payload, ctx);
  }

  /**
   * Get LegalExtension by documentId
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context
   * @returns LegalExtension payload or null if not found
   */
  async get(documentId: string, ctx?: ServiceContext): Promise<LegalExtensionPayload | null> {
    return await super.get(documentId, ctx);
  }
}

