/**
 * GeoExtensionService - Typed service for Geo extensions
 * 
 * Handles geographic metadata with WGS84 geometry storage.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

import { ExtensionService } from './ExtensionService.js';
import type { ServiceContext } from '../../contracts/types.js';
import {
  validateGeoExtensionPayload,
  geoExtensionPayloadV1Schema,
} from '../../validation/canonicalSchemas.js';
import { ValidationError } from '../../validation/canonicalSchemas.js';
import type { ExtensionDocument } from '../../models/ExtensionModel.js';
import type { z } from 'zod';
import { GeoOutboxModel } from '../../models/GeoOutboxModel.js';
import { logger } from '../../utils/logger.js';
import type { ClientSession } from 'mongodb';

/**
 * GeoExtension payload type (v1)
 */
export type GeoExtensionPayload = z.infer<typeof geoExtensionPayloadV1Schema>;

/**
 * GeoExtensionService - Typed service for Geo extensions
 */
export class GeoExtensionService extends ExtensionService<GeoExtensionPayload> {
  constructor() {
    super('geo', 'v1');
  }

  /**
   * Upsert GeoExtension with payload validation
   * 
   * @param documentId - Document ID
   * @param payload - GeoExtension payload
   * @param ctx - Service context (may include session for transactions)
   * @returns Extension document
   * @throws {ValidationError} If payload validation fails or version is unsupported
   */
  async upsert(
    documentId: string,
    payload: GeoExtensionPayload,
    ctx?: ServiceContext
  ): Promise<ExtensionDocument> {
    // Validate payload version
    const version = (payload as { version?: string }).version || this.defaultVersion;
    
    // Validate payload structure
    try {
      validateGeoExtensionPayload(payload, version);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `GeoExtension payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'payload'
      );
    }

    // Ensure crsStored is EPSG:4326
    if (payload.crsStored !== 'EPSG:4326') {
      throw new ValidationError(
        'GeoExtension crsStored must be EPSG:4326 for canonical stored geometry',
        'crsStored',
        'invalid_crs'
      );
    }

    // Call base upsert
    const result = await super.upsert(documentId, payload, ctx);

    // Enqueue outbox event for PostGIS sync (non-blocking, eventually consistent)
    // This happens in the same transaction if session is provided
    try {
      const session = ctx?.session as ClientSession | undefined;
      await GeoOutboxModel.enqueue(
        documentId,
        'geo_upserted',
        {
          geometryHash: payload.geometryHash,
          bbox: payload.bboxWgs84 as number[],
        },
        session
      );
      
      logger.debug(
        { documentId, geometryHash: payload.geometryHash },
        'Enqueued geo outbox event for PostGIS sync'
      );
    } catch (error) {
      // Log but don't fail the upsert - outbox is eventually consistent
      logger.error(
        { error, documentId },
        'Failed to enqueue geo outbox event (non-fatal)'
      );
    }

    return result;
  }

  /**
   * Get GeoExtension by documentId
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context
   * @returns GeoExtension payload or null if not found
   */
  async get(documentId: string, ctx?: ServiceContext): Promise<GeoExtensionPayload | null> {
    return await super.get(documentId, ctx);
  }
}

