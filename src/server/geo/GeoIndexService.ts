/**
 * GeoIndexService - PostGIS spatial index service
 * 
 * Provides spatial query operations on document geometries stored in PostGIS.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import { getPostgresPool } from '../config/postgres.js';
import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import type { GeoIndexService as IGeoIndexService, DocumentFilters, ServiceContext } from '../contracts/types.js';
import { logger } from '../utils/logger.js';
import type { Geometry } from 'geojson';

/**
 * GeoIndexService implementation using PostGIS
 */
export class GeoIndexService implements IGeoIndexService {
  /**
   * Ensure PostGIS schema and tables exist
   * 
   * Should be called during application startup.
   */
  async ensureSchema(): Promise<void> {
    const pool = getPostgresPool();
    
    try {
      // Read and execute migration SQL
      // In production, this would be handled by a migration tool
      // For now, we'll execute the key statements
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE SCHEMA IF NOT EXISTS geo;
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS geo.document_geometries (
          document_id TEXT PRIMARY KEY,
          geom GEOMETRY(GEOMETRY, 4326) NOT NULL,
          bbox BOX2D,
          geometry_hash TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_geometries_geom 
          ON geo.document_geometries 
          USING GIST (geom);
      `);
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_geometries_updated_at 
          ON geo.document_geometries 
          USING BTREE (updated_at);
      `);
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_geometries_hash 
          ON geo.document_geometries 
          USING BTREE (geometry_hash);
      `);
      
      logger.info('PostGIS schema ensured');
    } catch (error) {
      logger.error({ error }, 'Failed to ensure PostGIS schema');
      throw error;
    }
  }

  /**
   * Upsert geometries for a document
   * 
   * Idempotent by (documentId, geometryHash). If the same hash exists,
   * the geometry is updated only if it differs.
   * 
   * @param documentId - Document ID
   * @param geometriesWgs84 - Array of GeoJSON geometries (must be WGS84)
   * @param bbox - Bounding box [minLon, minLat, maxLon, maxLat]
   * @param geometryHash - SHA256 hash of normalized geometry (for idempotency)
   * @param ctx - Service context (unused for PostGIS, but required by interface)
   */
  async upsertGeometries(
    documentId: string,
    geometriesWgs84: unknown[],
    bbox: number[],
    geometryHash: string,
    _ctx?: ServiceContext
  ): Promise<void> {
    if (geometriesWgs84.length === 0) {
      throw new Error('geometriesWgs84 must contain at least one geometry');
    }

    if (bbox.length !== 4) {
      throw new Error('bbox must be [minLon, minLat, maxLon, maxLat]');
    }

    const pool = getPostgresPool();
    
    // Convert GeoJSON geometries to PostGIS geometry
    // If multiple geometries, combine them using ST_Collect
    // For single geometry, use it directly
    const geometryJson = JSON.stringify(geometriesWgs84.length === 1 
      ? geometriesWgs84[0] 
      : { type: 'GeometryCollection', geometries: geometriesWgs84 }
    );

    // Use provided geometryHash for idempotency

    const [minLon, minLat, maxLon, maxLat] = bbox;
    const bboxBox2d = `BOX(${minLon} ${minLat}, ${maxLon} ${maxLat})`;

    try {
      // Upsert by documentId
      // Use geometryHash for idempotency - only update if hash differs
      // For multiple geometries, PostGIS will handle GeometryCollection
      await pool.query(`
        INSERT INTO geo.document_geometries (
          document_id, 
          geom, 
          bbox, 
          geometry_hash,
          updated_at,
          created_at
        )
        VALUES (
          $1, 
          ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 
          $3::box2d, 
          $4, 
          NOW(), 
          NOW()
        )
        ON CONFLICT (document_id) 
        DO UPDATE SET
          geom = CASE 
            WHEN geo.document_geometries.geometry_hash != EXCLUDED.geometry_hash 
            THEN EXCLUDED.geom 
            ELSE geo.document_geometries.geom 
          END,
          bbox = CASE 
            WHEN geo.document_geometries.geometry_hash != EXCLUDED.geometry_hash 
            THEN EXCLUDED.bbox 
            ELSE geo.document_geometries.bbox 
          END,
          geometry_hash = EXCLUDED.geometry_hash,
          updated_at = CASE 
            WHEN geo.document_geometries.geometry_hash != EXCLUDED.geometry_hash 
            THEN NOW() 
            ELSE geo.document_geometries.updated_at 
          END;
      `, [documentId, geometryJson, bboxBox2d, geometryHash]);

      logger.debug(
        { documentId, geometryHash },
        'Upserted document geometry in PostGIS'
      );
    } catch (error) {
      logger.error(
        { error, documentId },
        'Failed to upsert geometry in PostGIS'
      );
      throw error;
    }
  }

  /**
   * Query documents that intersect with the given geometry
   * 
   * @param geometryWgs84 - GeoJSON geometry (must be WGS84)
   * @param filters - Document filters (applied via MongoDB join)
   * @returns Array of document IDs
   */
  async queryIntersect(
    geometryWgs84: unknown,
    filters: DocumentFilters
  ): Promise<unknown[]> {
    const pool = getPostgresPool();
    const geometryJson = JSON.stringify(geometryWgs84);

    try {
      const result = await pool.query(`
        SELECT document_id
        FROM geo.document_geometries
        WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
        ORDER BY updated_at DESC
      `, [geometryJson]);

      const documentIds = result.rows.map(row => row.document_id);
      
      logger.debug(
        { geometryType: (geometryWgs84 as Geometry)?.type, count: documentIds.length },
        'Query intersect completed'
      );

      return this.applyMongoFilters(documentIds, filters);
    } catch (error) {
      logger.error({ error }, 'Failed to query intersect in PostGIS');
      throw error;
    }
  }

  /**
   * Query documents within the given bounding box
   * 
   * @param bboxWgs84 - Bounding box [minLon, minLat, maxLon, maxLat]
   * @param filters - Document filters (applied via MongoDB join)
   * @returns Array of document IDs
   */
  async queryWithin(
    bboxWgs84: number[],
    filters: DocumentFilters
  ): Promise<unknown[]> {
    if (bboxWgs84.length !== 4) {
      throw new Error('bboxWgs84 must be [minLon, minLat, maxLon, maxLat]');
    }

    const pool = getPostgresPool();
    const [minLon, minLat, maxLon, maxLat] = bboxWgs84;

    try {
      // Use bbox for fast filtering
      const result = await pool.query(`
        SELECT document_id
        FROM geo.document_geometries
        WHERE bbox && $1::box2d
        ORDER BY updated_at DESC
      `, [`BOX(${minLon} ${minLat}, ${maxLon} ${maxLat})`]);

      const documentIds = result.rows.map(row => row.document_id);
      
      logger.debug(
        { bbox: bboxWgs84, count: documentIds.length },
        'Query within completed'
      );

      return this.applyMongoFilters(documentIds, filters);
    } catch (error) {
      logger.error({ error }, 'Failed to query within in PostGIS');
      throw error;
    }
  }

  /**
   * Delete geometry for a document
   * 
   * @param documentId - Document ID
   */
  async deleteGeometry(documentId: string): Promise<void> {
    const pool = getPostgresPool();

    try {
      await pool.query(
        'DELETE FROM geo.document_geometries WHERE document_id = $1',
        [documentId]
      );

      logger.debug({ documentId }, 'Deleted document geometry from PostGIS');
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete geometry from PostGIS');
      throw error;
    }
  }

  /**
   * Apply MongoDB filters to a list of document IDs
   */
  private async applyMongoFilters(
    documentIds: unknown[],
    filters: DocumentFilters
  ): Promise<unknown[]> {
    if (documentIds.length === 0) {
      return [];
    }

    // Check if any filters are set (ignoring undefined/null values)
    // We only want to join with MongoDB if there are actual filters to apply
    const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== null);
    if (!hasActiveFilters) {
      return documentIds;
    }

    const db = getDB();
    const collection = db.collection('canonical_documents');

    // Build MongoDB filter
    const mongoFilter: any = {
      _id: {
        $in: documentIds.map(id => new ObjectId(id as string))
      }
    };

    if (typeof filters.source === 'string' && filters.source) {
      mongoFilter.source = filters.source;
    }
    if (typeof filters.sourceId === 'string' && filters.sourceId) {
      mongoFilter.sourceId = filters.sourceId;
    }
    if (filters.documentFamily) {
      if (typeof filters.documentFamily === 'string') {
        mongoFilter.documentFamily = filters.documentFamily;
      } else if (Array.isArray(filters.documentFamily) && filters.documentFamily.every(i => typeof i === 'string')) {
        mongoFilter.documentFamily = { $in: filters.documentFamily };
      }
    }
    if (filters.documentType) {
      if (typeof filters.documentType === 'string') {
        mongoFilter.documentType = filters.documentType;
      } else if (Array.isArray(filters.documentType) && filters.documentType.every(i => typeof i === 'string')) {
        mongoFilter.documentType = { $in: filters.documentType };
      }
    }
    if (typeof filters.language === 'string' && filters.language) {
      mongoFilter.language = filters.language;
    }
    if (typeof filters.publisherAuthority === 'string' && filters.publisherAuthority) {
      mongoFilter.publisherAuthority = filters.publisherAuthority;
    }

    // Support enrichmentMetadata queries
    if (typeof filters.queryId === 'string' && filters.queryId) {
      mongoFilter['enrichmentMetadata.queryId'] = filters.queryId;
    }
    if (typeof filters.workflowRunId === 'string' && filters.workflowRunId) {
      mongoFilter['enrichmentMetadata.workflowRunId'] = filters.workflowRunId;
    }
    if (typeof filters.workflowId === 'string' && filters.workflowId) {
      mongoFilter['enrichmentMetadata.workflowId'] = filters.workflowId;
    }
    if (typeof filters.stepId === 'string' && filters.stepId) {
      mongoFilter['enrichmentMetadata.stepId'] = filters.stepId;
    }

    try {
      const results = await collection
        .find(mongoFilter)
        .project({ _id: 1 })
        .toArray();

      return results.map(doc => doc._id.toString());
    } catch (error) {
      logger.error({ error }, 'Failed to apply MongoDB filters');
      throw error;
    }
  }
}

