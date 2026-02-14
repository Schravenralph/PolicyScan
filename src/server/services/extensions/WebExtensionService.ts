/**
 * WebExtensionService - Typed service for Web extensions
 * 
 * Handles web metadata including URLs, crawl information, and link graphs.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

import { ExtensionService } from './ExtensionService.js';
import type { ServiceContext } from '../../contracts/types.js';
import {
  validateWebExtensionPayload,
  webExtensionPayloadV1Schema,
} from '../../validation/canonicalSchemas.js';
import { ValidationError } from '../../validation/canonicalSchemas.js';
import type { ExtensionDocument } from '../../models/ExtensionModel.js';
import type { z } from 'zod';

/**
 * WebExtension payload type (v1)
 */
export type WebExtensionPayload = z.infer<typeof webExtensionPayloadV1Schema>;

/**
 * WebExtensionService - Typed service for Web extensions
 */
export class WebExtensionService extends ExtensionService<WebExtensionPayload> {
  constructor() {
    super('web', 'v1');
  }

  /**
   * Upsert WebExtension with payload validation
   * 
   * @param documentId - Document ID
   * @param payload - WebExtension payload
   * @param ctx - Service context (may include session for transactions)
   * @returns Extension document
   * @throws {ValidationError} If payload validation fails or version is unsupported
   */
  async upsert(
    documentId: string,
    payload: WebExtensionPayload,
    ctx?: ServiceContext
  ): Promise<ExtensionDocument> {
    // Validate payload version
    const version = (payload as { version?: string }).version || this.defaultVersion;
    
    // Validate payload structure
    try {
      validateWebExtensionPayload(payload, version);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `WebExtension payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'payload'
      );
    }

    // Call base upsert
    return await super.upsert(documentId, payload, ctx);
  }

  /**
   * Get WebExtension by documentId
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context
   * @returns WebExtension payload or null if not found
   */
  async get(documentId: string, ctx?: ServiceContext): Promise<WebExtensionPayload | null> {
    return await super.get(documentId, ctx);
  }
}

